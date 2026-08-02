// inventory.js — carrying, equipping and salvaging items.

import { G, log, emit, INVENTORY_CAPACITY, MAP_CAPACITY } from './state.js';
import { rng } from './rng.js';
import { BASE_BY_ID } from './data/bases.js';
import { itemScore, RARITY } from './items.js';
import { CURRENCIES, CURRENCY_VALUE } from './data/currency.js';

/** Where an item lives: gear goes to `inventory`, maps to `maps`. */
function binFor(item) { return item.kind === 'map' ? 'maps' : 'inventory'; }
function capacityFor(item) { return item.kind === 'map' ? MAP_CAPACITY : INVENTORY_CAPACITY; }

export function invCount() { return G.state.inventory.length; }
export function mapCount() { return G.state.maps.length; }

export function isFull(kind = 'gear') {
  const s = G.state;
  return kind === 'map' ? s.maps.length >= MAP_CAPACITY : s.inventory.length >= INVENTORY_CAPACITY;
}

/**
 * Adds an item to the correct bin.
 * @returns {'added'|'salvaged'|'full'}
 */
export function addItem(item, opts = {}) {
  const s = G.state;
  const bin = binFor(item);

  if (!opts.noAutoSalvage && item.kind === 'gear' && shouldAutoSalvage(item)) {
    salvageItem(item, true);
    return 'salvaged';
  }

  if (s[bin].length >= capacityFor(item)) {
    if (item.kind === 'map') return 'full';

    // A unique is the headline drop of an entire session — never throw one away
    // for want of space. Break down the least valuable unlocked item instead.
    if (item.rarity === 'unique') {
      const victim = s.inventory
        .filter((x) => x.rarity !== 'unique' && !x.locked)
        .sort((a, b) => itemScore(a) - itemScore(b))[0];
      if (!victim) return 'full';
      salvageItem(victim, true);
      s.inventory.push(item);
      log(`Inventory full — salvaged ${victim.name} to make room for ${item.name}.`, 'unique');
      emit('inventory');
      return 'added';
    }

    salvageItem(item, true);
    return 'salvaged-full';
  }
  s[bin].push(item);
  emit(bin === 'maps' ? 'maps' : 'inventory');
  return 'added';
}

function shouldAutoSalvage(item) {
  const set = G.state.settings;
  if (item.rarity === 'normal' && set.autoSalvageNormal) return true;
  if (item.rarity === 'magic' && set.autoSalvageMagic) return true;
  if (item.rarity === 'rare' && set.autoSalvageRare) return true;
  return false;   // uniques are never auto-salvaged
}

/** Toggles the "keep this" flag that protects an item from bulk salvage. */
export function toggleLock(uid) {
  const item = findItem(uid);
  if (!item) return false;
  item.locked = !item.locked;
  emit('inventory');
  return item.locked;
}

export function removeItem(uid) {
  const s = G.state;
  for (const bin of ['inventory', 'maps']) {
    const i = s[bin].findIndex((x) => x.uid === uid);
    if (i >= 0) {
      const [item] = s[bin].splice(i, 1);
      emit(bin === 'maps' ? 'maps' : 'inventory');
      return item;
    }
  }
  return null;
}

export function findItem(uid) {
  const s = G.state;
  return s.inventory.find((x) => x.uid === uid)
    || s.maps.find((x) => x.uid === uid)
    || Object.values(s.equipment).find((x) => x && x.uid === uid)
    || null;
}

// ---------------------------------------------------------------------------
// Equipping
// ---------------------------------------------------------------------------

/** Concrete equipment slot an item should occupy, preferring an empty ring. */
export function targetSlot(item) {
  const s = G.state;
  if (item.slot === 'ring') return !s.equipment.ring1 ? 'ring1' : (!s.equipment.ring2 ? 'ring2' : 'ring1');
  return item.slot;
}

export function equipItem(uid, forcedSlot = null) {
  const s = G.state;
  const item = s.inventory.find((x) => x.uid === uid);
  if (!item || item.kind !== 'gear') return false;

  const slot = forcedSlot ?? targetSlot(item);
  const base = BASE_BY_ID[item.baseId];
  const twoHanded = base?.slot === 'weapon' && base.hands === 2;

  // Removing from inventory first guarantees space for whatever comes off.
  removeItem(uid);

  const swapped = [];
  if (s.equipment[slot]) swapped.push(s.equipment[slot]);
  if (twoHanded && s.equipment.offhand) swapped.push(s.equipment.offhand);
  if (slot === 'offhand' && s.equipment.weapon) {
    const wBase = BASE_BY_ID[s.equipment.weapon.baseId];
    if (wBase?.hands === 2) swapped.push(s.equipment.weapon);
  }

  s.equipment[slot] = item;
  if (twoHanded) s.equipment.offhand = null;
  for (const old of swapped) {
    if (old === item) continue;
    if (s.equipment.weapon === old) s.equipment.weapon = null;
    if (s.equipment.offhand === old) s.equipment.offhand = null;
    addItem(old, { noAutoSalvage: true });
  }

  log(`Equipped ${item.name}.`, 'sys');
  emit('equipment'); emit('stats');
  return true;
}

export function unequipItem(slot) {
  const s = G.state;
  const item = s.equipment[slot];
  if (!item) return false;
  if (isFull('gear')) { log('Inventory is full.', 'danger'); return false; }
  s.equipment[slot] = null;
  addItem(item, { noAutoSalvage: true });
  emit('equipment'); emit('stats');
  return true;
}

// ---------------------------------------------------------------------------
// Salvage — converts unwanted loot into currency
// ---------------------------------------------------------------------------

/** Expected currency value returned when salvaging. */
export function salvageValue(item) {
  const score = itemScore(item);
  return score * 0.014 * (item.corrupted ? 0.5 : 1);
}

/**
 * Breaks an item down. Payout is weighted toward cheap currency, with a small
 * chance at something meaningful from high-value items.
 */
export function salvageItem(item, quiet = false) {
  const s = G.state;
  const value = salvageValue(item);
  const gained = {};

  let budget = value;
  const pool = CURRENCIES.filter((c) => c.weight > 0 && CURRENCY_VALUE[c.id] <= Math.max(0.03, budget));
  let guard = 0;
  while (budget > 0.01 && guard++ < 24) {
    const affordable = pool.filter((c) => CURRENCY_VALUE[c.id] <= budget);
    if (!affordable.length) break;
    // Bias toward the most expensive thing the budget allows.
    const c = rng.weighted(affordable, (x) => x.weight * (CURRENCY_VALUE[x.id] >= budget * 0.4 ? 3 : 1));
    gained[c.id] = (gained[c.id] ?? 0) + 1;
    budget -= CURRENCY_VALUE[c.id];
  }
  // Guarantee at least a scrap so salvaging never feels wasted.
  if (!Object.keys(gained).length) gained.scroll = 1;

  for (const [id, n] of Object.entries(gained)) s.stash[id] = (s.stash[id] ?? 0) + n;
  removeItem(item.uid);

  if (!quiet) {
    const parts = Object.entries(gained)
      .map(([id, n]) => `${n}x ${CURRENCIES.find((c) => c.id === id).short}`).join(', ');
    log(`Salvaged ${item.name} → ${parts}.`, 'loot');
  }
  emit('stash'); emit('inventory');
  return gained;
}

/**
 * Salvages everything matching a filter. Locked items are always skipped, so
 * bulk-salvaging rares can't eat the piece you were saving.
 */
export function salvageAll(filter) {
  const s = G.state;
  const doomed = s.inventory.filter((i) => !i.locked && filter(i));
  const gained = {};
  for (const item of doomed) {
    const got = salvageItem(item, true);
    for (const [id, n] of Object.entries(got)) gained[id] = (gained[id] ?? 0) + n;
  }
  if (doomed.length) {
    const parts = Object.entries(gained)
      .sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([id, n]) => `${n}x ${CURRENCIES.find((c) => c.id === id)?.short ?? id}`).join(', ');
    log(`Salvaged ${doomed.length} item${doomed.length === 1 ? '' : 's'} → ${parts}.`, 'loot');
  }
  return doomed.length;
}

/** Count of inventory items a bulk-salvage filter would actually destroy. */
export function countSalvageable(filter) {
  return G.state.inventory.filter((i) => !i.locked && filter(i)).length;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export function sortInventory() {
  G.state.inventory.sort((a, b) => {
    const r = (RARITY[b.rarity]?.order ?? 0) - (RARITY[a.rarity]?.order ?? 0);
    if (r) return r;
    if (a.slot !== b.slot) return a.slot.localeCompare(b.slot);
    return itemScore(b) - itemScore(a);
  });
  emit('inventory');
}

export function sortMaps() {
  G.state.maps.sort((a, b) => (b.tier - a.tier)
    || ((RARITY[b.rarity]?.order ?? 0) - (RARITY[a.rarity]?.order ?? 0)));
  emit('maps');
}

// ---------------------------------------------------------------------------
// Stash helpers
// ---------------------------------------------------------------------------

export function addCurrency(id, n = 1) {
  G.state.stash[id] = (G.state.stash[id] ?? 0) + n;
  G.state.stats.currencyFound += n;
  emit('stash');
}

export function spendCurrency(id, n = 1) {
  const s = G.state;
  if ((s.stash[id] ?? 0) < n) return false;
  s.stash[id] -= n;
  emit('stash');
  return true;
}

export function hasCurrency(id, n = 1) { return (G.state.stash[id] ?? 0) >= n; }
