// orders.js — the Charter automations that decide things on their own.
//
// Kept apart from game.js because these are *decisions*, not clock work, and
// the difference matters when one goes wrong. game.js says when to look; this
// says what to do, and returns it rather than doing it, so every one of them
// can be tested without a running loop.
//
// The common rule, and the one that took the longest to get right: an
// automation may only ever do something the player could have done from the
// interface a moment earlier. None of them reaches past a wall the player
// would have hit — Push Orders cannot open a tier that is still locked,
// Standing Seals cannot spend a contract the party is barred from, Reserve
// Roster cannot field a hero who is already out. Automation that can do more
// than you can is not convenience, it is a second player.

import { G, log, emit } from './state.js';
import { automationOn } from './charter.js';
import { UPGRADES, upgradeCost } from './data/upgrades.js';
import { buyUpgrade } from './inventory.js';
import {
  partyMembers, assignToParty, removeFromParty, isDeployed, staminaCostFor,
} from './heroes.js';
import { barredMembers } from './data/modifiers.js';
import { CLASS_BY_ID } from './data/heroclasses.js';

// ---------------------------------------------------------------------------
// Standing Accounts — the Guild Hall buys its own next rank
// ---------------------------------------------------------------------------

/** How often to look, in seconds. Rare on purpose: this spends real gold. */
const ACCOUNTS_INTERVAL = 5;

/**
 * How much more than the price the guild must be holding before it buys.
 *
 * Two rather than one, so automation can never leave you unable to afford the
 * thing you were saving for. A guild that spends down to zero the instant it
 * can afford anything has taken the decision away rather than the chore.
 */
const RESERVE_FACTOR = 2;

let accountsTimer = 0;

/** The cheapest rank the guild could buy right now, or null. */
export function cheapestUpgrade(state = G.state) {
  let best = null;
  for (const u of UPGRADES) {
    const rank = state.upgrades?.[u.id] ?? 0;
    const cost = upgradeCost(u.id, rank);
    if (!cost) continue;
    // Materials are spent at the bench and by the player's judgement; a
    // standing order that quietly ate the guild's radiant essence would be
    // taking from the crafting endgame to buy a percentage.
    if (cost.kind !== 'gold') continue;
    if (!best || cost.amount < best.cost.amount) best = { id: u.id, def: u, cost };
  }
  return best;
}

/** Buys the cheapest available Guild Hall rank when gold is plentiful. */
export function autoUpgradePass(dt) {
  const s = G.state;
  if (!s || !automationOn('standingAccounts')) return false;
  accountsTimer += dt;
  if (accountsTimer < ACCOUNTS_INTERVAL) return false;
  accountsTimer = 0;

  const next = cheapestUpgrade(s);
  if (!next) return false;
  if (s.guild.gold < next.cost.amount * RESERVE_FACTOR) return false;

  const rank = (s.upgrades?.[next.id] ?? 0) + 1;
  if (!buyUpgrade(next.id)) return false;
  log(`Standing Accounts: ${next.def.name} raised to rank ${rank}.`, 'gold');
  return true;
}

// ---------------------------------------------------------------------------
// Reserve Roster — a tired hero is relieved rather than waited on
// ---------------------------------------------------------------------------

/**
 * Swaps exhausted party members for rested ones of the same class.
 *
 * Same class, not merely the same role, because a party built around a Paladin
 * against a spell-heavy dungeon is not served by a Warrior arriving in its
 * place. If nobody suitable is sitting on the bench the party simply waits,
 * which is what it did before.
 *
 * @returns {number} heroes swapped
 */
export function reservesPass(party, cost) {
  const s = G.state;
  if (!automationOn('reserves')) return 0;

  let swapped = 0;
  for (const hero of partyMembers(party)) {
    // A resting hero is spent whatever their current bar says: they are sitting
    // out until they are back to full, which is precisely who this is for.
    if (!hero.resting && hero.stamina >= staminaCostFor(hero, cost)) continue;
    const relief = s.heroes.find((h) => h.partyId === null
      && h.classId === hero.classId
      && !isDeployed(h)
      && !h.resting
      && h.stamina >= staminaCostFor(h, cost));
    if (!relief) continue;
    removeFromParty(hero.uid);
    assignToParty(relief.uid, party.id);
    log(`Reserve Roster: ${relief.name} relieves ${hero.name} in ${party.name}.`, 'sys');
    swapped++;
  }
  if (swapped) emit('roster');
  return swapped;
}

// ---------------------------------------------------------------------------
// Standing Seals — a sealed contract is spent rather than hoarded
// ---------------------------------------------------------------------------

/**
 * A contract this party could run on the orders it already has.
 *
 * Matched on where the party was going, not merely on what it could survive: a
 * contract fixes both the dungeon and the tier, so one that sends a Deepmines
 * party into the Arcane Vault at Tier 30 is not "the same orders with
 * modifiers", it is different orders. Only an exact match qualifies.
 *
 * The best of them is the most dangerous, because danger is what a contract
 * pays for — but composition bans are checked first, since a contract nobody
 * in the party may enter would only be refused at the door and lost.
 */
export function contractFor(party, dungeonId, tier) {
  const s = G.state;
  if (!automationOn('autoContract')) return null;
  const members = partyMembers(party);
  if (!members.length) return null;

  let best = null;
  for (const c of s.contracts ?? []) {
    if (c.dungeonId !== dungeonId || c.tier !== tier) continue;
    if (barredMembers(c.mods, members, (id) => CLASS_BY_ID[id]).length) continue;
    if (!best || (c.danger ?? 0) > (best.danger ?? 0)) best = c;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Push Orders — a party finds the deepest tier it can hold
// ---------------------------------------------------------------------------

/**
 * Clean clears in a row before a party tries the next tier down the ladder.
 *
 * Three rather than one. A single clear is well within the noise a party at
 * the edge of its range produces, so climbing on one would make a party
 * oscillate between a tier it clears and a tier it cannot, halving its output
 * for as long as it was left alone.
 */
export const PUSH_STREAK = 3;

/**
 * Records how a run went, for Push Orders to read later.
 *
 * Kept on the party rather than in the expedition, because the expedition is
 * gone by the time anything consults this.
 */
export function noteOutcome(party, cleared) {
  if (!party) return;
  party.clearStreak = cleared ? (party.clearStreak ?? 0) + 1 : 0;
  party.lastOutcome = cleared ? 'clear' : 'wipe';
}

/**
 * Where this party should be sent next, on its own orders.
 *
 * Returns the orders rather than acting on them, so the tier arithmetic can be
 * tested without a dispatch, a party, or a clock.
 *
 * @returns {{dungeonId: string, tier: number, contractId: string|null} | null}
 */
export function redeployOrders(party, state = G.state) {
  if (!party?.lastRun) return null;
  const { dungeonId } = party.lastRun;
  let { tier } = party.lastRun;

  if (automationOn('pushOrders', state)) {
    // Never past the tier gate the dispatch panel itself enforces: one above
    // the deepest ever cleared. An automation that could open locked content
    // would be doing something the player cannot.
    const ceiling = Math.max(1, (state.progress?.highestTier ?? 0) + 1);
    if (party.lastOutcome === 'wipe' && tier > 1) {
      tier -= 1;
      party.clearStreak = 0;
      log(`Push Orders: ${party.name} falls back to Tier ${tier}.`, 'sys');
    } else if ((party.clearStreak ?? 0) >= PUSH_STREAK && tier < ceiling) {
      tier += 1;
      party.clearStreak = 0;
      log(`Push Orders: ${party.name} pushes on to Tier ${tier}.`, 'sys');
    }
    // Written back so the change sticks across the next report and the next
    // save, and so the Expeditions panel shows where the party actually is.
    party.lastRun = { ...party.lastRun, tier };
    party.lastOutcome = null;
  }

  const contract = contractFor(party, dungeonId, tier);
  return { dungeonId, tier, contractId: contract?.id ?? null };
}
