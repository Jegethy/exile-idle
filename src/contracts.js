// contracts.js — sealed expedition contracts: where modifiers live.
//
// Modifiers deliberately do not arrive as a "hard mode" switch. Tier is
// already an unbounded difficulty slider, so a second global difficulty axis
// laid over the first would be asking the same question twice, and a toggle
// invites the worst question an idle game can provoke: "am I playing this the
// wrong way round?"
//
// A contract is an object instead. It drops, it sits in a list, it is spent.
// That buys three things a toggle cannot: a drop rate to tune, somewhere for
// deep tiers and raids to pay out that is not more gold, and a choice made one
// run at a time rather than once and forgotten.

import { rng } from './rng.js';
import { G, emit, log } from './state.js';
import { uid } from './util.js';
import { DUNGEON_BY_ID, DUNGEONS } from './data/dungeons.js';
import {
  dangerOf, downsidePoolFor, boonPoolFor, MODIFIER_BY_ID,
} from './data/modifiers.js';

/** Contracts start dropping here. Below it, tier itself is still teaching. */
export const CONTRACT_MIN_TIER = 8;

/** How many a guild may hold. Enough to choose between; not enough to hoard. */
export const CONTRACT_CAP = 16;

/**
 * Contract rarity: how many modifiers it carries, how many upsides, and the
 * item quantity and rarity it grants before danger is counted at all.
 *
 * The base find rates are the reason to want a good contract even when its
 * modifiers are mild, and they are what makes this feel like a map rather than
 * a difficulty option: a Legendary contract is worth running for the loot
 * multiplier alone, and its three modifiers are the price of admission.
 *
 * A Common carries no upside on purpose. Something has to be at the bottom, or
 * "rarity" is just a word printed on the card.
 */
export const CONTRACT_RARITIES = [
  {
    id: 'common', name: 'Common', cls: 'r-normal', weight: 400,
    mods: 1, boons: 0, boonChance: 0, quantity: 15, rarity: 15,
  },
  {
    id: 'uncommon', name: 'Uncommon', cls: 'r-magic', weight: 260,
    mods: 1, boons: 1, boonChance: 0.5, quantity: 30, rarity: 34,
  },
  {
    id: 'rare', name: 'Rare', cls: 'r-rare', weight: 130,
    mods: 2, boons: 1, boonChance: 1, quantity: 46, rarity: 54,
  },
  {
    id: 'epic', name: 'Epic', cls: 'r-epic', weight: 46,
    mods: 2, boons: 2, boonChance: 1, quantity: 64, rarity: 76,
  },
  {
    id: 'legendary', name: 'Legendary', cls: 'r-unique', weight: 12,
    mods: 3, boons: 3, boonChance: 1, quantity: 88, rarity: 104,
  },
];

export const CONTRACT_RARITY_BY_ID = Object.fromEntries(
  CONTRACT_RARITIES.map((r) => [r.id, r]),
);

/**
 * Chance a cleared expedition seals a contract.
 *
 * Tuned so that finding one is an event and losing one is a shrug. A bad
 * contract must never feel like a punishment you are stuck with for an hour —
 * you look at it, decide "absolutely not", and know another is coming. That
 * only works if they are frequent enough to discard freely, which is why this
 * is a good deal more generous than a unique drop.
 */
export function contractChance(tier) {
  if (tier < CONTRACT_MIN_TIER) return 0;
  return Math.min(0.42, 0.16 + (tier - CONTRACT_MIN_TIER) * 0.018);
}

/**
 * Rolls a contract for a dungeon and tier.
 *
 * Only one modifier may decide what the dungeon is full of, and only one may
 * ban on a given axis — a card reading "Hexwrought, Brutish" would be owed an
 * explanation nobody could give, and one reading two overlapping bans would
 * quietly be a single ban.
 */
export function rollContract(tier, dungeonId = null, forceRarity = null) {
  const rarity = forceRarity
    ? CONTRACT_RARITY_BY_ID[forceRarity]
    : rng.weighted(CONTRACT_RARITIES, (r) => r.weight);

  const mods = [];
  let hasMix = false;
  let hasBan = false;
  const pool = downsidePoolFor(tier, (bans) => rng.pick(bans));
  for (const mod of rng.sample(pool, pool.length)) {
    if (mods.length >= rarity.mods) break;
    if (mod.profile?.attackMix) {
      if (hasMix) continue;
      hasMix = true;
    }
    if (mod.restrict) {
      if (hasBan) continue;
      hasBan = true;
    }
    mods.push(mod.id);
  }

  const wantBoons = rarity.boonChance >= 1
    ? rarity.boons
    : (rng.chance(rarity.boonChance) ? rarity.boons : 0);
  const boons = rng.sample(boonPoolFor(), Math.min(wantBoons, boonPoolFor().length))
    .map((b) => b.id);

  const all = [...mods, ...boons];
  return {
    id: uid('c'),
    dungeonId: dungeonId ?? rng.pick(DUNGEONS).id,
    tier,
    rarity: rarity.id,
    mods: all,
    danger: dangerOf(all),
  };
}

export function storeContract(contract) {
  if (!contract) return false;
  const s = G.state;
  if (!Array.isArray(s.contracts)) s.contracts = [];
  if (s.contracts.length >= CONTRACT_CAP) {
    let worstAt = 0;
    for (let i = 1; i < s.contracts.length; i++) {
      if (s.contracts[i].danger < s.contracts[worstAt].danger) worstAt = i;
    }
    s.contracts.splice(worstAt, 1);
  }
  s.contracts.push(contract);
  log(`A sealed contract is recovered: ${describeContract(contract)}.`, 'unique');
  emit('contracts');
  return true;
}

/** Rolls for a contract at the end of a cleared run, and banks it if one drops. */
export function maybeDropContract(run) {
  if (run.raidId || run.contractId) return false;
  if (!rng.chance(contractChance(run.tier))) return false;
  return storeContract(rollContract(run.tier, run.dungeonId));
}

export function contractById(id) {
  return (G.state.contracts ?? []).find((c) => c.id === id) ?? null;
}

/** Removes a contract once it has been spent. */
export function consumeContract(id) {
  const s = G.state;
  const i = (s.contracts ?? []).findIndex((c) => c.id === id);
  if (i < 0) return false;
  s.contracts.splice(i, 1);
  emit('contracts');
  return true;
}

/**
 * What a contract multiplies its payout by.
 *
 * Danger is authored per modifier and read straight through, so a modifier
 * cannot be added to the game without someone deciding what it is worth.
 */
export function rewardMultFor(contract) {
  return 1 + (contract?.danger ?? 0) / 100;
}

/**
 * The item quantity and rarity a contract grants, before its boons.
 *
 * Rarity sets a floor and danger adds on top, so a Legendary contract that
 * happened to roll mild modifiers is still worth running, and a Common that
 * rolled a brutal one is still worth considering.
 */
export function findBaseFor(contract) {
  const r = CONTRACT_RARITY_BY_ID[contract?.rarity] ?? CONTRACT_RARITIES[0];
  const danger = contract?.danger ?? 0;
  // The coefficients on danger are not taste. At the first pass a Common
  // contract measured at 0.84x the loot-per-minute of simply not running one,
  // which makes the whole bottom of the ladder junk: the rarity floor alone
  // does not cover even a mild modifier. Danger has to pay for itself.
  return {
    quantity: r.quantity + danger * 1.0,
    rarity: r.rarity + danger * 1.7,
  };
}

export function rarityOf(contract) {
  return CONTRACT_RARITY_BY_ID[contract?.rarity] ?? CONTRACT_RARITIES[0];
}

/** Only the downsides, for a card that wants to show them apart from the boons. */
export function downsidesOf(contract) {
  return modsOf(contract).filter((m) => !m.boon);
}

export function boonsOf(contract) {
  return modsOf(contract).filter((m) => m.boon);
}

export function modsOf(contract) {
  return (contract?.mods ?? []).map((id) => MODIFIER_BY_ID[id]).filter(Boolean);
}

export function describeContract(contract) {
  const dungeon = DUNGEON_BY_ID[contract.dungeonId];
  return `${rarityOf(contract).name} · ${dungeon?.name ?? 'Unknown'} T${contract.tier} — `
    + `${modsOf(contract).map((m) => m.name).join(', ')}`;
}
