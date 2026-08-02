// inventory.js — the guild vault: storing, salvaging and crafting-currency flow.

import { G, log, emit, vaultCapacity, addGold, spendGold } from './state.js';
import { rng } from './rng.js';
import { itemScore, RARITY } from './items.js';
import { CURRENCIES, CURRENCY_VALUE } from './data/currency.js';
import { UPGRADE_BY_ID, upgradeCost } from './data/upgrades.js';

export function vaultCount() { return G.state.vault.length; }
export function vaultFull() { return G.state.vault.length >= vaultCapacity(); }

/**
 * Adds gear to the vault.
 * @returns {'added'|'salvaged'|'salvaged-full'|'full'}
 */
export function addToVault(item, opts = {}) {
  const s = G.state;

  if (!opts.noAutoSalvage && shouldAutoSalvage(item)) {
    salvageItem(item, true);
    return 'salvaged';
  }

  if (s.vault.length >= vaultCapacity()) {
    // A unique is the highlight of a session — never bin one for want of space.
    if (item.rarity === 'unique') {
      const victim = s.vault
        .filter((x) => x.rarity !== 'unique' && !x.locked)
        .sort((a, b) => itemScore(a) - itemScore(b))[0];
      if (!victim) return 'full';
      salvageItem(victim, true);
      s.vault.push(item);
      log(`Vault full — salvaged ${victim.name} to make room for ${item.name}.`, 'unique');
      emit('vault');
      return 'added';
    }
    salvageItem(item, true);
    return 'salvaged-full';
  }

  s.vault.push(item);
  emit('vault');
  return 'added';
}

function shouldAutoSalvage(item) {
  const set = G.state.settings;
  if (item.rarity === 'normal' && set.autoSalvageNormal) return true;
  if (item.rarity === 'magic' && set.autoSalvageMagic) return true;
  if (item.rarity === 'rare' && set.autoSalvageRare) return true;
  return false;   // uniques are never auto-salvaged
}

export function toggleLock(uid) {
  const item = findItem(uid);
  if (!item) return false;
  item.locked = !item.locked;
  emit('vault');
  return item.locked;
}

export function removeFromVault(uid) {
  const s = G.state;
  const i = s.vault.findIndex((x) => x.uid === uid);
  if (i < 0) return null;
  const [item] = s.vault.splice(i, 1);
  emit('vault');
  return item;
}

/** Finds an item anywhere: vault or worn by any hero. */
export function findItem(uid) {
  const s = G.state;
  const inVault = s.vault.find((x) => x.uid === uid);
  if (inVault) return inVault;
  for (const h of s.heroes) {
    for (const slot of Object.keys(h.equipment)) {
      if (h.equipment[slot]?.uid === uid) return h.equipment[slot];
    }
  }
  return null;
}

/** The hero wearing an item, if any. */
export function wearerOf(uid) {
  for (const h of G.state.heroes) {
    for (const slot of Object.keys(h.equipment)) {
      if (h.equipment[slot]?.uid === uid) return { hero: h, slot };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Salvage
// ---------------------------------------------------------------------------

/** Expected value returned when salvaging, in "chaos equivalent". */
export function salvageValue(item) {
  return itemScore(item) * 0.014 * (item.corrupted ? 0.5 : 1);
}

/** Breaks an item down into orbs and a little gold. */
export function salvageItem(item, quiet = false) {
  const s = G.state;
  const value = salvageValue(item);
  const gained = {};

  let budget = value;
  const pool = CURRENCIES.filter((c) => c.weight > 0);
  let guard = 0;
  while (budget > 0.01 && guard++ < 24) {
    const affordable = pool.filter((c) => CURRENCY_VALUE[c.id] <= budget);
    if (!affordable.length) break;
    const c = rng.weighted(affordable, (x) => x.weight * (CURRENCY_VALUE[x.id] >= budget * 0.4 ? 3 : 1));
    gained[c.id] = (gained[c.id] ?? 0) + 1;
    budget -= CURRENCY_VALUE[c.id];
  }
  if (!Object.keys(gained).length) gained.scroll = 1;

  for (const [id, n] of Object.entries(gained)) s.orbs[id] = (s.orbs[id] ?? 0) + n;
  const gold = Math.max(1, Math.round(item.ilvl * 1.2 * ({ normal: 1, magic: 2, rare: 4, unique: 10 }[item.rarity] ?? 1)));
  addGold(gold);

  removeFromVault(item.uid);
  if (!quiet) {
    const parts = Object.entries(gained)
      .map(([id, n]) => `${n}x ${CURRENCIES.find((c) => c.id === id).short}`).join(', ');
    log(`Salvaged ${item.name} → ${parts}, ${gold} gold.`, 'loot');
  }
  emit('orbs'); emit('vault');
  return gained;
}

/** Salvages everything matching a filter. Locked items are always skipped. */
export function salvageAll(filter) {
  const s = G.state;
  const doomed = s.vault.filter((i) => !i.locked && filter(i));
  const gained = {};
  let gold = 0;
  const before = s.guild.gold;
  for (const item of doomed) {
    const got = salvageItem(item, true);
    for (const [id, n] of Object.entries(got)) gained[id] = (gained[id] ?? 0) + n;
  }
  gold = s.guild.gold - before;
  if (doomed.length) {
    const parts = Object.entries(gained).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([id, n]) => `${n}x ${CURRENCIES.find((c) => c.id === id)?.short ?? id}`).join(', ');
    log(`Salvaged ${doomed.length} item${doomed.length === 1 ? '' : 's'} → ${parts}, ${gold} gold.`, 'loot');
  }
  return doomed.length;
}

export function countSalvageable(filter) {
  return G.state.vault.filter((i) => !i.locked && filter(i)).length;
}

export function sortVault() {
  G.state.vault.sort((a, b) => {
    const r = (RARITY[b.rarity]?.order ?? 0) - (RARITY[a.rarity]?.order ?? 0);
    if (r) return r;
    if (a.slot !== b.slot) return a.slot.localeCompare(b.slot);
    return itemScore(b) - itemScore(a);
  });
  emit('vault');
}

// ---------------------------------------------------------------------------
// Orbs
// ---------------------------------------------------------------------------

export function addOrb(id, n = 1) {
  G.state.orbs[id] = (G.state.orbs[id] ?? 0) + n;
  emit('orbs');
}

export function spendOrb(id, n = 1) {
  const s = G.state;
  if ((s.orbs[id] ?? 0) < n) return false;
  s.orbs[id] -= n;
  emit('orbs');
  return true;
}

export function hasOrb(id, n = 1) { return (G.state.orbs[id] ?? 0) >= n; }

// ---------------------------------------------------------------------------
// Guild Hall upgrades
// ---------------------------------------------------------------------------

/** Buys the next rank of a Guild Hall upgrade. */
export function buyUpgrade(id) {
  const s = G.state;
  const def = UPGRADE_BY_ID[id];
  if (!def) return { ok: false, msg: 'Unknown upgrade.' };

  const rank = s.upgrades[id] ?? 0;
  if (rank >= def.max) return { ok: false, msg: `${def.name} is already at maximum rank.` };

  const cost = upgradeCost(id, rank);
  if (cost.kind === 'gold') {
    if (!spendGold(cost.amount)) return { ok: false, msg: `Needs ${cost.amount} gold.` };
  } else if (!spendOrb(cost.orb, cost.amount)) {
    const c = CURRENCIES.find((x) => x.id === cost.orb);
    return { ok: false, msg: `Needs ${cost.amount}x ${c?.name ?? cost.orb}.` };
  }

  s.upgrades[id] = rank + 1;
  log(`${def.name} improved to rank ${rank + 1}.`, 'gold');
  emit('upgrades'); emit('guild'); emit('sheets');
  return { ok: true, msg: `${def.name} is now rank ${rank + 1}.` };
}
