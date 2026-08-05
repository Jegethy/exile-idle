// inventory.js — the guild vault: storing, salvaging and crafting-currency flow.

import { G, log, emit, vaultCapacity, addGold, spendGold } from './state.js';
import { rng } from './rng.js';
import { itemScore, RARITY } from './items.js';
import { MATERIAL_BY_ID, materialOf, gradeForIlvl, salvageFamilies } from './data/materials.js';
import { BASE_BY_ID } from './data/bases.js';
import { UPGRADE_BY_ID, upgradeCost } from './data/upgrades.js';
import { refreshSheets } from './sheets.js';

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
  // A blank base from a deep raid is a Normal item, and auto-salvaging Normals
  // is on by default -- so without this the rarest crafting material in the
  // game is destroyed the instant the party walks in the door. It arrives
  // locked, which also keeps it out of bulk salvage.
  if (item.locked) return false;
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

/**
 * Rough worth of an item when broken down, in grade-1 material units.
 *
 * Kept deliberately lean: one salvaged rare should contribute to a craft, not
 * fund several of them, or the bench costs stop mattering.
 */
export function salvageValue(item) {
  return itemScore(item) * 0.10 * (item.corrupted ? 0.5 : 1);
}

/**
 * Breaks an item into materials and a little gold.
 *
 * What comes back depends on what the item is made of — a plate cuirass
 * returns metal, a robe returns cloth — so base type matters beyond its stats.
 */
export function salvageItem(item, quiet = false) {
  const s = G.state;
  const base = BASE_BY_ID[item.baseId];
  const families = salvageFamilies(base);
  const grade = gradeForIlvl(item.ilvl);
  const gained = {};

  let budget = salvageValue(item);
  let guard = 0;
  while (budget > 0.5 && guard++ < 30) {
    const family = rng.pick(families);
    // Prefer the best grade the budget allows so deep runs feel different.
    let g = grade;
    while (g > 1 && MATERIAL_BY_ID[materialOf(family, g).id].value > budget) g--;
    const mat = materialOf(family, g);
    if (mat.value > budget) break;
    gained[mat.id] = (gained[mat.id] ?? 0) + 1;
    budget -= mat.value;
  }
  // Never a wasted salvage.
  if (!Object.keys(gained).length) {
    const mat = materialOf(families[0], 1);
    gained[mat.id] = 1;
  }

  for (const [id, n] of Object.entries(gained)) s.materials[id] = (s.materials[id] ?? 0) + n;
  const gold = Math.max(1, Math.round(item.ilvl * 1.2
    * ({ normal: 1, magic: 2, rare: 4, unique: 10 }[item.rarity] ?? 1)));
  addGold(gold);

  removeFromVault(item.uid);
  if (!quiet) {
    const parts = Object.entries(gained)
      .map(([id, n]) => `${n}× ${MATERIAL_BY_ID[id].name}`).join(', ');
    log(`Salvaged ${item.name} → ${parts}, ${gold} gold.`, 'loot');
  }
  emit('materials'); emit('vault');
  return gained;
}

/** Salvages everything matching a filter. Locked items are always skipped. */
export function salvageAll(filter) {
  const s = G.state;
  const doomed = s.vault.filter((i) => !i.locked && filter(i));
  const gained = {};
  const before = s.guild.gold;
  for (const item of doomed) {
    const got = salvageItem(item, true);
    for (const [id, n] of Object.entries(got)) gained[id] = (gained[id] ?? 0) + n;
  }
  const gold = s.guild.gold - before;
  if (doomed.length) {
    const parts = Object.entries(gained).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([id, n]) => `${n}× ${MATERIAL_BY_ID[id]?.name ?? id}`).join(', ');
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
// Materials and flasks
// ---------------------------------------------------------------------------

export function addMaterial(id, n = 1) {
  G.state.materials[id] = (G.state.materials[id] ?? 0) + n;
  emit('materials');
}

/** Do we hold every entry in a [{id, qty}] cost list? */
export function hasMaterials(cost) {
  return cost.every((c) => (G.state.materials[c.id] ?? 0) >= c.qty);
}

export function spendMaterials(cost) {
  if (!hasMaterials(cost)) return false;
  for (const c of cost) G.state.materials[c.id] -= c.qty;
  emit('materials');
  return true;
}

export function addFlask(id, n = 1) {
  G.state.flasks[id] = (G.state.flasks[id] ?? 0) + n;
  emit('materials');
}

export function spendFlask(id, n = 1) {
  const s = G.state;
  if ((s.flasks[id] ?? 0) < n) return false;
  s.flasks[id] -= n;
  emit('materials');
  return true;
}

export function hasFlask(id, n = 1) { return (G.state.flasks[id] ?? 0) >= n; }

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
  } else if (!spendMaterials([{ id: cost.mat, qty: cost.amount }])) {
    return { ok: false, msg: `Needs ${cost.amount}× ${MATERIAL_BY_ID[cost.mat]?.name ?? cost.mat}.` };
  }

  s.upgrades[id] = rank + 1;
  log(`${def.name} improved to rank ${rank + 1}.`, 'gold');
  emit('upgrades'); emit('guild'); refreshSheets();
  return { ok: true, msg: `${def.name} is now rank ${rank + 1}.` };
}

// ---------------------------------------------------------------------------
// Browsing the vault
// ---------------------------------------------------------------------------

/** Slot groups offered as vault filters, in doll order. */
export const VAULT_FILTERS = [
  { id: 'all', name: 'All', slots: null },
  { id: 'weapon', name: 'Weapons', slots: ['weapon'] },
  { id: 'offhand', name: 'Offhand', slots: ['offhand'] },
  { id: 'armour', name: 'Armour', slots: ['helmet', 'body', 'gloves', 'boots'] },
  { id: 'jewellery', name: 'Jewellery', slots: ['amulet', 'ring'] },
];

/** How a vault listing may be ordered. */
export const VAULT_SORTS = [
  { id: 'power', name: 'Power' },
  { id: 'ilvl', name: 'Item level' },
  { id: 'rarity', name: 'Rarity' },
  { id: 'slot', name: 'Slot' },
  { id: 'name', name: 'Name' },
];

/**
 * The vault as the player has asked to see it. Never mutates the stored order:
 * sorting a view is not the same as reorganising the vault, and the Sort button
 * still exists for that.
 */
export function vaultView({ filter = 'all', sort = 'power', baseType = 'all' } = {}) {
  const def = VAULT_FILTERS.find((f) => f.id === filter) ?? VAULT_FILTERS[0];
  let out = G.state.vault.slice();

  if (def.slots) out = out.filter((i) => def.slots.includes(i.slot));
  if (baseType !== 'all') out = out.filter((i) => BASE_BY_ID[i.baseId]?.class === baseType);

  const byName = (a, b) => a.name.localeCompare(b.name);
  const cmp = {
    power: (a, b) => itemScore(b) - itemScore(a),
    ilvl: (a, b) => b.ilvl - a.ilvl || itemScore(b) - itemScore(a),
    rarity: (a, b) => (RARITY[b.rarity]?.order ?? 0) - (RARITY[a.rarity]?.order ?? 0)
      || itemScore(b) - itemScore(a),
    slot: (a, b) => a.slot.localeCompare(b.slot) || itemScore(b) - itemScore(a),
    name: byName,
  }[sort] ?? byName;

  return out.sort(cmp);
}

/** Base types present in the vault for a given filter, for the sub-filter row. */
export function baseTypesIn(filter = 'all') {
  const def = VAULT_FILTERS.find((f) => f.id === filter) ?? VAULT_FILTERS[0];
  const seen = new Set();
  for (const item of G.state.vault) {
    if (def.slots && !def.slots.includes(item.slot)) continue;
    const cls = BASE_BY_ID[item.baseId]?.class;
    if (cls) seen.add(cls);
  }
  return [...seen].sort();
}
