// outfit.js — filling equipment slots without doing it one click at a time.
//
// The arithmetic behind the Charter's first two privileges, and behind
// Standing Kit. It exists as its own module because the interesting part is
// not "equip the best item" — it is that *best* depends on what else the hero
// is holding, and equipping is not a slot-by-slot operation:
//
//   - a two-handed weapon empties the off hand, so its true worth is measured
//     against the pair it replaces rather than against the weapon alone;
//   - a dual wielder puts a second sword where a shield would go;
//   - a ring can go in either hand, and which one it displaces matters.
//
// So this evaluates whole *outfits* rather than items. Every candidate is
// applied to a copy of the equipment map under the same rules equipOnHero
// uses, the resulting sheet is scored, and the best whole result wins. It is
// the only way a shield-and-sword pair can beat a greatsword.
//
// Greedy, and repeated until nothing improves, rather than exhaustive. Nine
// slots against a full vault is a search far too large to solve properly and
// far too small to be worth solving: three sweeps settle every case that comes
// up in play, and the player can always overrule it by hand.

import { G, emit, log } from './state.js';
import { EQUIP_SLOTS, BASE_BY_ID } from './data/bases.js';
import { CLASS_BY_ID } from './data/heroclasses.js';
import { heroStats, sheetScore } from './stats.js';
import { equipOnHero, heroById, isDeployed, partyMembers } from './heroes.js';

/** Ignore differences below this — a 0.2% change is noise, not an upgrade. */
const MIN_GAIN = 0.002;

/** Sweeps over the slot list. Enough for a two-hander to lose to a pair. */
const PASSES = 3;

function isOneHanded(item) {
  const base = BASE_BY_ID[item?.baseId];
  return base?.slot === 'weapon' && base.hands !== 2;
}

function isTwoHanded(item) {
  const base = BASE_BY_ID[item?.baseId];
  return base?.slot === 'weapon' && base.hands === 2;
}

/** Every concrete slot this item could legally occupy on this hero. */
function slotsForItem(hero, item) {
  const dual = !!CLASS_BY_ID[hero?.classId]?.dualWield;
  const base = BASE_BY_ID[item?.baseId];
  if (!base) return [];
  if (base.slot === 'ring') return ['ring1', 'ring2'];
  if (base.slot === 'weapon') return dual && isOneHanded(item) ? ['weapon', 'offhand'] : ['weapon'];
  if (base.slot === 'offhand') return ['offhand'];
  return [base.slot];
}

/**
 * The equipment map that would result from putting `item` in `slot`.
 *
 * Mirrors equipOnHero's displacement rules exactly. Returns null when the
 * move is illegal, which is how a shield ends up refused by a class that
 * cannot hold one.
 */
function withEquipped(hero, equipment, item, slot) {
  const dual = !!CLASS_BY_ID[hero?.classId]?.dualWield;
  if (slot === 'offhand') {
    const base = BASE_BY_ID[item.baseId];
    const accepts = base?.slot === 'offhand' || (dual && isOneHanded(item));
    if (!accepts) return null;
  }
  const next = { ...equipment, [slot]: item };
  // A two-handed weapon occupies both hands; nothing may sit beside it.
  if (slot === 'weapon' && isTwoHanded(item)) next.offhand = null;
  if (slot === 'offhand' && isTwoHanded(equipment.weapon)) next.weapon = null;
  return next;
}

function scoreOf(hero, equipment, upgrades) {
  return sheetScore(heroStats({ ...hero, equipment }, upgrades));
}

/**
 * Works out what this hero should be wearing, given a pool to choose from.
 *
 * Pure: it decides, and nothing else. The caller performs the moves, which is
 * what lets the same planner answer "what would this change?" for a preview
 * and "do it" for the button.
 *
 * @returns {{itemUid: string, slot: string}[]} moves, in the order to make them
 */
export function planOutfit(hero, pool, upgrades = {}) {
  if (!hero) return [];
  // Bucket the pool by slot up front. Without this a full vault is rescored
  // nine times over per sweep for items that could never go there anyway.
  const bySlot = {};
  for (const slot of EQUIP_SLOTS) bySlot[slot] = [];
  for (const item of pool) {
    for (const slot of slotsForItem(hero, item)) bySlot[slot]?.push(item);
  }

  let equipment = { ...hero.equipment };
  let current = scoreOf(hero, equipment, upgrades);
  const taken = new Set();
  const moves = [];

  for (let pass = 0; pass < PASSES; pass++) {
    let improved = false;
    for (const slot of EQUIP_SLOTS) {
      let best = null;
      for (const item of bySlot[slot]) {
        if (taken.has(item.uid)) continue;
        if (equipment[slot] === item) continue;
        const next = withEquipped(hero, equipment, item, slot);
        if (!next) continue;
        const gain = (scoreOf(hero, next, upgrades) - current) / Math.max(1e-9, current);
        if (gain > MIN_GAIN && (!best || gain > best.gain)) best = { item, gain, next };
      }
      if (!best) continue;
      equipment = best.next;
      current = scoreOf(hero, equipment, upgrades);
      taken.add(best.item.uid);
      moves.push({ itemUid: best.item.uid, slot });
      improved = true;
    }
    if (!improved) break;
  }
  return moves;
}

/**
 * Everything in the vault this hero may be given.
 *
 * Locked items are excluded on purpose. A lock already means "hands off" to
 * auto-salvage, and the most valuable thing a player ever locks is a blank
 * base being saved for crafting — having the outfitter sweep that onto a
 * Warlock because its item level is 120 would be the single worst thing this
 * feature could do.
 */
function poolFrom(state = G.state) {
  return state.vault.filter((item) => !item.locked);
}

/**
 * Puts the best the vault holds on one hero.
 * @returns {number} slots changed
 */
export function gearUpHero(heroUid, { quiet = false } = {}) {
  const s = G.state;
  const hero = heroById(heroUid);
  if (!hero) return 0;
  if (isDeployed(hero)) {
    if (!quiet) log(`${hero.name} is on an expedition.`, 'danger');
    return 0;
  }

  const moves = planOutfit(hero, poolFrom(s), s.upgrades);
  let done = 0;
  // equipOnHero re-reads the vault each time, so a move whose item was
  // displaced by an earlier one simply fails and is skipped.
  for (const move of moves) if (equipOnHero(hero.uid, move.itemUid, move.slot)) done++;

  if (done && !quiet) {
    log(`${hero.name} re-equips: ${done} slot${done === 1 ? '' : 's'} improved.`, 'loot');
  }
  return done;
}

/**
 * The same across a whole party, in turn.
 *
 * Sequential rather than jointly optimal: the first hero takes the best sword
 * and the second takes the next one. Solving it properly is an assignment
 * problem, and the honest reason not to is that the answer would be within a
 * percent of this one and impossible for a player to predict or overrule.
 *
 * @returns {{heroes: number, slots: number}}
 */
export function gearUpParty(partyId) {
  const s = G.state;
  const party = s.parties.find((p) => p.id === partyId);
  if (!party) return { heroes: 0, slots: 0 };

  let heroes = 0; let slots = 0;
  for (const hero of partyMembers(party)) {
    const n = gearUpHero(hero.uid, { quiet: true });
    if (n) { heroes++; slots += n; }
  }
  if (slots) {
    log(`${party.name} re-equips: ${slots} slot${slots === 1 ? '' : 's'} improved across `
      + `${heroes} hero${heroes === 1 ? '' : 'es'}.`, 'loot');
  } else {
    log(`${party.name} is already carrying the best the vault holds.`, 'sys');
  }
  emit('roster');
  return { heroes, slots };
}

/**
 * The best slot on this hero for one item, and what it would be worth.
 *
 * Evaluates every slot the item could legally take, which is what makes a
 * two-handed weapon honest: putting one on empties the off hand, and this
 * scores the hand-and-a-half result rather than pretending the shield stays.
 *
 * @returns {{slot: string, gain: number} | null}
 */
export function bestPlacement(hero, item, upgrades = {}) {
  const equipment = hero.equipment;
  const current = scoreOf(hero, equipment, upgrades);
  let best = null;
  for (const slot of slotsForItem(hero, item)) {
    const next = withEquipped(hero, equipment, item, slot);
    if (!next) continue;
    const gain = (scoreOf(hero, next, upgrades) - current) / Math.max(1e-9, current);
    if (!best || gain > best.gain) best = { slot, gain };
  }
  return best;
}

/**
 * Standing Kit: gear that came home better than what somebody is wearing goes
 * straight onto them.
 *
 * Scoped to the haul rather than to the whole vault, which is both the honest
 * reading of "gear that came home" and the only affordable one — a full
 * re-outfit of twenty heroes against a two-hundred item vault runs thousands
 * of stat sheets, and offline catch-up finishes dozens of expeditions inside a
 * budget of a second and a half.
 *
 * Heroes in the field are skipped: an expedition's combatants hold live stat
 * sheets, and re-equipping mid-run would change a fight already in progress.
 *
 * @param {object[]} items  what the party walked in with
 * @returns {number} slots changed
 */
export function autoEquipHaul(items) {
  const s = G.state;
  let slots = 0;
  for (const item of items) {
    if (item.locked) continue;
    // Auto-salvage may already have eaten it, or the vault may have been full.
    if (!s.vault.some((x) => x.uid === item.uid)) continue;

    let best = null;
    for (const hero of s.heroes) {
      if (isDeployed(hero)) continue;
      const place = bestPlacement(hero, item, s.upgrades);
      if (!place || place.gain <= MIN_GAIN) continue;
      if (!best || place.gain > best.gain) best = { hero, ...place };
    }
    if (!best) continue;
    if (equipOnHero(best.hero.uid, item.uid, best.slot)) slots++;
  }
  if (slots) {
    log(`Standing Kit: ${slots} piece${slots === 1 ? '' : 's'} of the haul went straight `
      + 'onto the roster.', 'loot');
  }
  return slots;
}
