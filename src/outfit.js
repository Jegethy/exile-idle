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
import { equipOnHero, heroById, isDeployed, partyMembers, canHold } from './heroes.js';

/** Ignore differences below this — a 0.2% change is noise, not an upgrade. */
const MIN_GAIN = 0.002;

/**
 * Sweeps over the remaining slots.
 *
 * The hands are solved exactly and separately, so these passes only exist for
 * the mild interactions left — a resistance affix on a ring changing what the
 * best boots are worth.
 */
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
  if (!canHold(hero, item, slot).ok) return null;
  const next = { ...equipment, [slot]: item };
  // A two-handed weapon occupies both hands; nothing may sit beside it.
  if (slot === 'weapon' && isTwoHanded(item)) next.offhand = null;
  if (slot === 'offhand' && isTwoHanded(equipment.weapon)) next.weapon = null;
  return next;
}

/**
 * Chooses both hands at once.
 *
 * The hands are one decision, not two, and treating them as two is what
 * produced the worst bug this feature has had: a greedy sweep put a shield in
 * the off hand of a warrior holding a two-hander, which emptied the main hand,
 * and the sweep then found nothing better to put back — leaving a tank in a
 * shield and no weapon at all.
 *
 * Enumerating the pairs removes the failure mode rather than patching it. It
 * is also the only way a sword and shield can genuinely be compared against a
 * greatsword, which is the whole reason the outfitter scores outfits instead
 * of items.
 *
 * @returns {{weapon: object|null, offhand: object|null, score: number}}
 */
function bestHands(hero, equipment, weapons, offhands, upgrades) {
  const oneHanders = weapons.filter(isOneHanded);
  const twoHanders = weapons.filter(isTwoHanded);
  const dual = !!CLASS_BY_ID[hero?.classId]?.dualWield;

  // Staying as you are is a candidate, so a hero already well armed is left
  // alone rather than shuffled for a rounding error.
  let best = {
    weapon: equipment.weapon ?? null,
    offhand: equipment.offhand ?? null,
    score: scoreOf(hero, equipment, upgrades),
  };
  const consider = (weapon, offhand) => {
    const next = { ...equipment, weapon: weapon ?? null, offhand: offhand ?? null };
    const score = scoreOf(hero, next, upgrades);
    if (score > best.score) best = { weapon: weapon ?? null, offhand: offhand ?? null, score };
  };

  // A two-hander fills both hands, so it is scored against the pair it costs.
  if (!dual) for (const w of twoHanders) consider(w, null);

  // A dual wielder's off hand takes a second weapon; everyone else's takes a
  // shield or a quiver. Either way the main hand must be one-handed.
  const seconds = dual ? oneHanders : offhands;
  for (const w of oneHanders) {
    consider(w, null);
    for (const o of seconds) {
      if (o === w) continue;                       // one item, not two
      if (canHold(hero, o, 'offhand').ok) consider(w, o);
    }
  }
  return best;
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
  const taken = new Set();
  const moves = [];

  // Hands first and together, then everything else one slot at a time. Only
  // the hands interact; a helmet has never had anything to say about a ring.
  const before = scoreOf(hero, equipment, upgrades);
  const hands = bestHands(hero, equipment, bySlot.weapon, bySlot.offhand, upgrades);
  const handsWorthIt = hands.score > before * (1 + MIN_GAIN);
  if (handsWorthIt
    && (hands.weapon !== (equipment.weapon ?? null) || hands.offhand !== (equipment.offhand ?? null))) {
    equipment = { ...equipment, weapon: hands.weapon, offhand: hands.offhand };
    // Main hand first: equipOnHero clears the off hand when a two-hander goes
    // in, so doing it the other way round would undo the move just made.
    if (hands.weapon && !taken.has(hands.weapon.uid) && pool.includes(hands.weapon)) {
      moves.push({ itemUid: hands.weapon.uid, slot: 'weapon' });
      taken.add(hands.weapon.uid);
    }
    if (hands.offhand && !taken.has(hands.offhand.uid) && pool.includes(hands.offhand)) {
      moves.push({ itemUid: hands.offhand.uid, slot: 'offhand' });
      taken.add(hands.offhand.uid);
    }
  }

  let current = scoreOf(hero, equipment, upgrades);
  const rest = EQUIP_SLOTS.filter((x) => x !== 'weapon' && x !== 'offhand');

  for (let pass = 0; pass < PASSES; pass++) {
    let improved = false;
    for (const slot of rest) {
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
 * Everything one hero could take from the pool, with what it would be worth.
 *
 * Only the seven slots outside the hands: those are solved as a pair, before
 * any of this, because they are one decision rather than two.
 */
function offers(hero, equipment, pool, claimed, upgrades) {
  const current = scoreOf(hero, equipment, upgrades);
  const out = [];
  for (const item of pool) {
    if (claimed.has(item.uid)) continue;
    for (const slot of slotsForItem(hero, item)) {
      if (slot === 'weapon' || slot === 'offhand') continue;
      if (equipment[slot] === item) continue;
      const next = withEquipped(hero, equipment, item, slot);
      if (!next) continue;
      const gain = (scoreOf(hero, next, upgrades) - current) / Math.max(1e-9, current);
      if (gain > MIN_GAIN) out.push({ hero, item, slot, gain });
    }
  }
  return out;
}

/** What each unclaimed off-hand item would add to this hero, as it stands. */
function offhandOffers(hero, equipment, pool, claimed, upgrades) {
  const current = scoreOf(hero, equipment, upgrades);
  const out = [];
  for (const item of pool) {
    if (claimed.has(item.uid)) continue;
    if (equipment.offhand === item) continue;
    if (!slotsForItem(hero, item).includes('offhand')) continue;
    const next = withEquipped(hero, equipment, item, 'offhand');
    if (!next) continue;
    const gain = (scoreOf(hero, next, upgrades) - current) / Math.max(1e-9, current);
    if (gain > MIN_GAIN) out.push({ hero, item, gain });
  }
  return out;
}

/**
 * Kits out a whole party from one pool.
 *
 * Emphatically *not* hero by hero, which is how this started and what made it
 * unusable: the first hero took the best of everything and the fifth got what
 * was left, so a party geared this way came out lopsided and half of it had to
 * be undone by hand.
 *
 * Every hero bids for every item instead, and the largest improvement wins,
 * repeatedly. Three things fall out of that without being asked for:
 *
 *   Empty and badly outdated slots are filled first, because a bare slot is
 *   where the largest gain always is. That is a better rule than "lowest item
 *   level" — a level 40 helmet on a Wizard can matter less than a level 60 one
 *   carrying the resistance they are short of.
 *
 *   The party comes up together. Once a hero has taken a few pieces their next
 *   bid is worth less than one from somebody still in rags, so it moves on.
 *
 *   A unique lands on whoever it helps most, for free. It is simply the bid
 *   with the largest number behind it.
 *
 * The hands are dealt first, hungriest hero first, since a pair cannot be bid
 * on one item at a time.
 *
 * @returns {{itemUid: string, slot: string, heroUid: string}[]}
 */
export function planParty(heroes, pool, upgrades = {}) {
  const claimed = new Set();
  const moves = [];
  const kit = new Map();                     // heroUid -> simulated equipment
  const shut = new Set();                    // heroes whose off hand is spoken for
  for (const hero of heroes) {
    kit.set(hero.uid, { ...hero.equipment });
    if (isTwoHanded(hero.equipment.weapon)) shut.add(hero.uid);
  }

  // --- Main hands ------------------------------------------------------
  //
  // Chosen with the whole pair in view but claiming only the weapon, which is
  // the compromise the hands need. Deciding the pair outright and claiming
  // both let a bare Wizard — whose relative gain from being armed at all is
  // enormous — walk off with the party's only shield, because nothing else
  // could go in its off hand. Deciding the main hand alone would be worse the
  // other way: a two-hander beats a one-hander on its own almost every time,
  // so a tank would take the greatsword and never be offered the shield.
  const handsLeft = new Set(heroes.map((h) => h.uid));
  while (handsLeft.size) {
    let pick = null;
    for (const hero of heroes) {
      if (!handsLeft.has(hero.uid)) continue;
      const equipment = kit.get(hero.uid);
      const free = pool.filter((i) => !claimed.has(i.uid));
      const weapons = free.filter((i) => slotsForItem(hero, i).includes('weapon'));
      const offhands = free.filter((i) => slotsForItem(hero, i).includes('offhand'));
      const before = scoreOf(hero, equipment, upgrades);
      const best = bestHands(hero, equipment, weapons, offhands, upgrades);
      const gain = (best.score - before) / Math.max(1e-9, before);
      if (gain > MIN_GAIN && (!pick || gain > pick.gain)) pick = { hero, best, gain };
    }
    if (!pick) break;
    handsLeft.delete(pick.hero.uid);
    const { hero, best } = pick;
    // A two-hander settles both hands at once; anything else leaves the off
    // hand open to the bidding below.
    const twoHanded = isTwoHanded(best.weapon);
    kit.set(hero.uid, {
      ...kit.get(hero.uid),
      weapon: best.weapon,
      offhand: twoHanded ? null : kit.get(hero.uid).offhand ?? null,
    });
    if (best.weapon && !claimed.has(best.weapon.uid) && pool.includes(best.weapon)) {
      claimed.add(best.weapon.uid);
      moves.push({ itemUid: best.weapon.uid, slot: 'weapon', heroUid: hero.uid });
    }
    if (twoHanded) shut.add(hero.uid);
  }

  // --- Off hands, by what the shield is worth to each of them -----------
  //
  // A separate round, and the point of it: the marginal value of a shield to a
  // Guardian is very large and to a Wizard very small, which only shows once
  // both are holding a weapon and the comparison is about the shield alone.
  let offBids = heroes.filter((h) => !shut.has(h.uid))
    .flatMap((h) => offhandOffers(h, kit.get(h.uid), pool, claimed, upgrades));
  while (offBids.length) {
    offBids.sort((a, b) => b.gain - a.gain);
    const top = offBids[0];
    if (top.gain <= MIN_GAIN) break;
    claimed.add(top.item.uid);
    kit.set(top.hero.uid, { ...kit.get(top.hero.uid), offhand: top.item });
    moves.push({ itemUid: top.item.uid, slot: 'offhand', heroUid: top.hero.uid });
    offBids = offBids.filter((b) => b.hero.uid !== top.hero.uid && !claimed.has(b.item.uid));
  }

  // --- Everything else, to whoever gains most ---------------------------
  let bids = heroes.flatMap((h) => offers(h, kit.get(h.uid), pool, claimed, upgrades));
  let guard = 0;
  while (bids.length && guard++ < 300) {
    bids.sort((a, b) => b.gain - a.gain);
    const top = bids[0];
    if (top.gain <= MIN_GAIN) break;

    claimed.add(top.item.uid);
    kit.set(top.hero.uid, withEquipped(top.hero, kit.get(top.hero.uid), top.item, top.slot));
    moves.push({ itemUid: top.item.uid, slot: top.slot, heroUid: top.hero.uid });

    // Only the hero who just took something needs re-pricing; everyone else's
    // bids are still true, minus whatever has been claimed.
    bids = bids.filter((b) => b.hero.uid !== top.hero.uid && !claimed.has(b.item.uid));
    bids.push(...offers(top.hero, kit.get(top.hero.uid), pool, claimed, upgrades));
  }
  return moves;
}

/** Party damage and effective life, for saying what a re-equip actually did. */
function partyTotals(heroes, upgrades) {
  let dps = 0; let life = 0;
  for (const hero of heroes) {
    const sheet = heroStats(hero, upgrades);
    dps += sheet.dps;
    life += sheet.life + sheet.es;
  }
  return { dps, life };
}

/** A multiplier as the change it represents: 1.18 becomes "+18%". */
export function pct(mult) {
  const n = Math.round((mult - 1) * 100);
  return n === 0 ? 'no change' : `${n > 0 ? '+' : ''}${n}%`;
}

/**
 * The same across a whole party, allocated rather than handed out in order.
 *
 * @returns {{heroes: number, slots: number, dps: number, life: number}}
 *   dps and life are the party's totals afterwards as a multiple of before.
 */
export function gearUpParty(partyId) {
  const s = G.state;
  const party = s.parties.find((p) => p.id === partyId);
  if (!party) return { heroes: 0, slots: 0, dps: 1, life: 1 };

  const members = partyMembers(party).filter((h) => !isDeployed(h));
  const before = partyTotals(members, s.upgrades);

  const moves = planParty(members, poolFrom(s), s.upgrades);
  const touched = new Set();
  let slots = 0;
  for (const move of moves) {
    if (!equipOnHero(move.heroUid, move.itemUid, move.slot)) continue;
    slots++;
    touched.add(move.heroUid);
  }

  const after = partyTotals(members, s.upgrades);
  const out = {
    heroes: touched.size,
    slots,
    dps: before.dps > 0 ? after.dps / before.dps : 1,
    life: before.life > 0 ? after.life / before.life : 1,
  };
  if (slots) {
    log(`${party.name} re-equips: ${slots} slot${slots === 1 ? '' : 's'} across `
      + `${out.heroes} hero${out.heroes === 1 ? '' : 'es'} — party damage ${pct(out.dps)}, `
      + `party life ${pct(out.life)}.`, 'loot');
  } else {
    log(`${party.name} is already carrying the best the vault holds.`, 'sys');
  }
  emit('roster');
  return out;
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
