// items.js — item construction, affix rolling, naming and stat application.

import { rng } from './rng.js';
import { uid, clamp } from './util.js';
import {
  BASE_BY_ID, BASES, baseNameFor, baseStatsFor, reqAttrs, slotAccepts, baseDescriptor,
} from './data/bases.js';
import { AFFIX_BY_ID, eligibleAffixes, availableTiers, tierNumber } from './data/affixes.js';
import { UNIQUE_BY_ID, uniquesFor } from './data/uniques.js';

export const RARITY = {
  normal: { id: 'normal', name: 'Normal', cls: 'r-normal', order: 0 },
  magic: { id: 'magic', name: 'Magic', cls: 'r-magic', order: 1 },
  rare: { id: 'rare', name: 'Rare', cls: 'r-rare', order: 2 },
  unique: { id: 'unique', name: 'Unique', cls: 'r-unique', order: 3 },
};

/** How many prefixes/suffixes each rarity may hold. */
export const AFFIX_CAPS = { normal: 0, magic: 1, rare: 3, unique: 0 };

// ---------------------------------------------------------------------------
// Implicit modifiers — determined by base type, rerolled by the Refine recipe.
// ---------------------------------------------------------------------------

export const IMPLICITS = [
  { id: 'imp_str', req: ['amulet'], r: [10, 24], text: (v) => `+${v} to Strength`, apply: (b, v) => { b.str += v; } },
  { id: 'imp_dex', req: ['amulet'], r: [10, 24], text: (v) => `+${v} to Dexterity`, apply: (b, v) => { b.dex += v; } },
  { id: 'imp_int', req: ['amulet'], r: [10, 24], text: (v) => `+${v} to Intelligence`, apply: (b, v) => { b.int += v; } },
  { id: 'imp_life_pct', req: ['amulet'], r: [3, 6], text: (v) => `${v}% increased maximum Life`, apply: (b, v) => { b.incLife += v; } },
  { id: 'imp_critmulti', req: ['amulet'], r: [15, 25], text: (v) => `+${v}% to Critical Strike Multiplier`, apply: (b, v) => { b.critMulti += v; } },
  { id: 'imp_life', req: ['ring'], r: [15, 35], text: (v) => `+${v} to maximum Life`, apply: (b, v) => { b.flatLife += v; } },
  { id: 'imp_res_fire', req: ['ring'], r: [15, 30], text: (v) => `+${v}% to Fire Resistance`, apply: (b, v) => { b.resFire += v; } },
  { id: 'imp_res_cold', req: ['ring'], r: [15, 30], text: (v) => `+${v}% to Cold Resistance`, apply: (b, v) => { b.resCold += v; } },
  { id: 'imp_res_light', req: ['ring'], r: [15, 30], text: (v) => `+${v}% to Lightning Resistance`, apply: (b, v) => { b.resLight += v; } },
  { id: 'imp_mana', req: ['ring'], r: [20, 45], text: (v) => `+${v} to maximum Mana`, apply: (b, v) => { b.flatMana += v; } },
  { id: 'imp_crit', req: ['weapon'], r: [15, 30], text: (v) => `${v}% increased Critical Strike Chance`, apply: (b, v) => { b.incCrit += v; } },
  { id: 'imp_acc', req: ['weapon'], r: [50, 150], text: (v) => `+${v} to Accuracy Rating`, apply: (b, v) => { b.accuracy += v; } },
  { id: 'imp_aspd', req: ['weapon'], r: [4, 9], text: (v) => `${v}% increased Attack Speed`, apply: (b, v) => { b.incAtkSpeed += v; } },
  { id: 'imp_block', req: ['shield'], r: [4, 8], text: (v) => `+${v}% Chance to Block`, apply: (b, v) => { b.block += v; } },
  { id: 'imp_shield_res', req: ['shield'], r: [10, 20], text: (v) => `+${v}% to all Elemental Resistances`, apply: (b, v) => { b.resFire += v; b.resCold += v; b.resLight += v; } },
  { id: 'imp_quiver_phys', req: ['quiver'], r: [6, 14], text: (v) => `Adds ${Math.round(v * 0.5)} to ${v} Physical Damage`, apply: (b, v) => { b.addPhysMin += Math.round(v * 0.5); b.addPhysMax += v; } },
  { id: 'imp_armour_flat', req: ['helmet', 'body'], r: [20, 60], text: (v) => `+${v} to Armour`, apply: (b, v) => { b.flatArmour += v; } },
  { id: 'imp_life_regen', req: ['gloves', 'boots'], r: [2, 6], text: (v) => `Regenerate ${v} Life per second`, apply: (b, v) => { b.lifeRegenFlat += v; }, dec: 1 },
];

export const IMPLICIT_BY_ID = Object.fromEntries(IMPLICITS.map((i) => [i.id, i]));

// ---------------------------------------------------------------------------
// Rare item naming
// ---------------------------------------------------------------------------

const RARE_WORDS_A = ['Vengeance', 'Doom', 'Corpse', 'Storm', 'Dread', 'Blood', 'Havoc', 'Rage',
  'Gloom', 'Soul', 'Grim', 'Death', 'Empyrean', 'Brimstone', 'Wrath', 'Morbid', 'Pandemonium',
  'Woe', 'Bramble', 'Carrion', 'Dusk', 'Eagle', 'Fate', 'Ghoul', 'Havoc', 'Rune', 'Sol', 'Torment'];
const RARE_WORDS_B = ['Bane', 'Song', 'Star', 'Whisper', 'Edge', 'Vow', 'Guard', 'Shroud', 'Chant',
  'Sorrow', 'Thirst', 'Nail', 'Mark', 'Cry', 'Beckon', 'Ruin', 'Grasp', 'Wound', 'Veil', 'Spire',
  'Gale', 'Root', 'Fang', 'Keeper', 'Pledge', 'Brand', 'Hunger'];

function rareName() {
  return `${rng.pick(RARE_WORDS_A)} ${rng.pick(RARE_WORDS_B)}`;
}

// ---------------------------------------------------------------------------
// Value rolling
// ---------------------------------------------------------------------------

/**
 * Items above the top affix tier's ilvl keep scaling — this multiplier is what
 * makes tier-300 maps meaningfully better than tier-16 ones.
 */
export function overflowScale(ilvl, tierIlvl) {
  return 1 + Math.max(0, ilvl - tierIlvl) * 0.012;
}

function rollRange([lo, hi], dec = 0, scale = 1) {
  const v = rng.range(lo * scale, hi * scale);
  return dec > 0 ? Number(v.toFixed(dec)) : Math.max(Math.round(lo * scale), Math.round(v));
}

/** Chooses a tier index for `def` at `ilvl`, biased toward (but not guaranteeing) the best. */
function pickTierIndex(def, ilvl) {
  const avail = availableTiers(def, ilvl);
  if (!avail.length) return 0;
  const window = avail.slice(-4);            // only the top 4 unlocked tiers roll
  const weights = [100, 55, 25, 10];         // worst → best within that window
  const entries = window.map((idx, i) => ({ idx, w: weights[window.length - 1 - i] ?? 10 }));
  return rng.weighted(entries, (e) => e.w).idx;
}

/** Rolls a concrete affix instance for a def at a given item level. */
export function rollAffix(def, ilvl) {
  const tierIndex = pickTierIndex(def, ilvl);
  const tier = def.tiers[tierIndex];
  const isTop = tierIndex === def.tiers.length - 1;
  const scale = isTop ? overflowScale(ilvl, tier.ilvl) : 1;
  const values = tier.ranges.map((r) => rollRange(r, def.dec ?? 0, scale));
  return { defId: def.id, tierIndex, values };
}

/** Rerolls only the numbers of an existing affix (the Refine recipe). */
export function divineAffix(aff, ilvl) {
  const def = AFFIX_BY_ID[aff.defId];
  if (!def) return aff;
  const tier = def.tiers[aff.tierIndex];
  const isTop = aff.tierIndex === def.tiers.length - 1;
  const scale = isTop ? overflowScale(ilvl, tier.ilvl) : 1;
  aff.values = tier.ranges.map((r) => rollRange(r, def.dec ?? 0, scale));
  return aff;
}

// ---------------------------------------------------------------------------
// Item construction
// ---------------------------------------------------------------------------

/** Tags used for affix eligibility: base tags plus the generic slot name. */
export function itemTags(item) {
  const base = BASE_BY_ID[item.baseId];
  if (!base) return [];
  return base.tags.concat([base.slot]);
}

function rollImplicit(item) {
  const tags = itemTags(item);
  const pool = IMPLICITS.filter((i) => i.req.some((t) => tags.includes(t)));
  if (!pool.length) return null;
  const def = rng.pick(pool);
  return { defId: def.id, values: [rollRange(def.r, def.dec ?? 0, overflowScale(item.ilvl, 60))] };
}

/** Counts current prefixes / suffixes. */
export function affixCounts(item) {
  let prefix = 0; let suffix = 0;
  for (const a of item.affixes) {
    const def = AFFIX_BY_ID[a.defId];
    if (!def) continue;
    if (def.type === 'prefix') prefix++; else suffix++;
  }
  return { prefix, suffix };
}

export function openAffixSlots(item) {
  const cap = AFFIX_CAPS[item.rarity] ?? 0;
  const { prefix, suffix } = affixCounts(item);
  return { prefix: cap - prefix, suffix: cap - suffix, total: cap * 2 - prefix - suffix };
}

/**
 * Adds one random affix. Respects prefix/suffix caps and never duplicates a
 * mod group (so you can't stack two "+life" prefixes).
 */
export function addRandomAffix(item, forceType = null) {
  const open = openAffixSlots(item);
  const types = [];
  if ((forceType === null || forceType === 'prefix') && open.prefix > 0) types.push('prefix');
  if ((forceType === null || forceType === 'suffix') && open.suffix > 0) types.push('suffix');
  if (!types.length) return false;

  const type = rng.pick(types);
  const used = new Set(item.affixes.map((a) => AFFIX_BY_ID[a.defId]?.group));
  const pool = eligibleAffixes(itemTags(item), item.ilvl, type).filter((d) => !used.has(d.group));
  if (!pool.length) return false;

  const def = rng.weighted(pool, (d) => d.weight);
  item.affixes.push(rollAffix(def, item.ilvl));
  refreshName(item);
  return true;
}

/** Wipes affixes and rolls a fresh set appropriate to `rarity`. */
export function rerollAffixes(item, rarity = item.rarity) {
  item.rarity = rarity;
  item.affixes = [];
  let count = 0;
  if (rarity === 'magic') count = rng.int(1, 2);
  else if (rarity === 'rare') count = rng.int(4, 6);
  for (let i = 0; i < count; i++) addRandomAffix(item);
  refreshName(item);
  return item;
}

/** Recomputes the display name from rarity + affixes. */
export function refreshName(item) {
  const base = BASE_BY_ID[item.baseId];
  const baseName = item.baseName || (base ? baseNameFor(base, item.ilvl) : 'Unknown');

  if (item.rarity === 'unique') {
    item.name = UNIQUE_BY_ID[item.uniqueId]?.name ?? baseName;
    return item.name;
  }
  if (item.rarity === 'rare') {
    if (!item.rareName) item.rareName = rareName();
    item.name = item.rareName;
    return item.name;
  }
  if (item.rarity === 'magic') {
    const pre = item.affixes.find((a) => AFFIX_BY_ID[a.defId]?.type === 'prefix');
    const suf = item.affixes.find((a) => AFFIX_BY_ID[a.defId]?.type === 'suffix');
    const parts = [];
    if (pre) parts.push(AFFIX_BY_ID[pre.defId].tiers[pre.tierIndex].name);
    parts.push(baseName);
    if (suf) parts.push(AFFIX_BY_ID[suf.defId].tiers[suf.tierIndex].name);
    item.name = parts.join(' ');
    return item.name;
  }
  item.name = baseName;
  return item.name;
}

/**
 * Creates a gear item.
 * @param {object} opts - { baseId?, equipSlot?, ilvl, rarity, uniqueId? }
 */
export function createItem(opts) {
  const ilvl = Math.max(1, Math.round(opts.ilvl ?? 1));

  // Unique items pin their own base.
  if (opts.uniqueId) {
    const u = UNIQUE_BY_ID[opts.uniqueId];
    const base = BASE_BY_ID[u.base];
    const item = {
      uid: uid('it'), kind: 'gear', baseId: u.base, slot: base.slot, ilvl,
      rarity: 'unique', uniqueId: u.id, quality: 0, corrupted: false,
      baseName: baseNameFor(base, ilvl), implicit: null, affixes: [],
      uniqueRolls: u.mods.map((mod) => rollRange(mod.r, mod.dec ?? 0)),
    };
    item.implicit = rollImplicit(item);
    refreshName(item);
    return item;
  }

  let baseId = opts.baseId;
  if (!baseId) {
    let pool = BASES;
    if (opts.equipSlot) pool = BASES.filter((b) => slotAccepts(opts.equipSlot, b.slot));
    // Only offer bases whose first name tier is unlocked, so low maps drop low bases.
    const unlocked = pool.filter((b) => b.names[0].ilvl <= ilvl);
    baseId = rng.pick(unlocked.length ? unlocked : pool).id;
  }
  const base = BASE_BY_ID[baseId];

  const item = {
    uid: uid('it'), kind: 'gear', baseId, slot: base.slot, ilvl,
    rarity: opts.rarity ?? 'normal', quality: 0, corrupted: false,
    baseName: baseNameFor(base, ilvl), implicit: null, affixes: [], uniqueId: null,
  };
  item.implicit = rollImplicit(item);
  rerollAffixes(item, item.rarity);
  return item;
}

// ---------------------------------------------------------------------------
// Reading an item
// ---------------------------------------------------------------------------

/** Base (pre-affix) numbers for display: damage, defences. */
export function itemBaseStats(item) {
  const base = BASE_BY_ID[item.baseId];
  if (!base) return {};
  const s = baseStatsFor(base, item.ilvl);
  const q = 1 + (item.quality ?? 0) / 100;

  // Local "increased" mods apply to the base numbers, PoE-style.
  const local = { phys: 0, armour: 0, evasion: 0, es: 0 };
  for (const a of item.affixes) {
    const def = AFFIX_BY_ID[a.defId];
    if (!def) continue;
    if (def.id === 'inc_phys') local.phys += a.values[0];
    if (def.id === 'inc_armour') local.armour += a.values[0];
    if (def.id === 'inc_evasion') local.evasion += a.values[0];
    if (def.id === 'inc_es_local') local.es += a.values[0];
  }
  if (item.rarity === 'unique') {
    const u = UNIQUE_BY_ID[item.uniqueId];
    u?.mods.forEach((mod, i) => {
      const probe = { localIncPhys: 0, localIncArmour: 0, localIncEvasion: 0, localIncES: 0 };
      try { mod.apply(probe, item.uniqueRolls[i]); } catch { /* non-local mod */ }
      local.phys += probe.localIncPhys || 0;
      local.armour += probe.localIncArmour || 0;
      local.evasion += probe.localIncEvasion || 0;
      local.es += probe.localIncES || 0;
    });
  }

  const out = {};
  if (base.slot === 'weapon') {
    // Flat added phys from affixes is local to the weapon and scales with inc phys.
    let addMin = 0; let addMax = 0;
    for (const a of item.affixes) {
      if (a.defId === 'flat_phys') { addMin += a.values[0]; addMax += a.values[1]; }
    }
    const mult = (1 + (local.phys + (item.quality ?? 0)) / 100);
    out.physMin = Math.round((s.physMin + addMin) * mult);
    out.physMax = Math.round((s.physMax + addMax) * mult);
    out.aps = s.aps;
    out.crit = s.crit;
    out.hands = s.hands;
    out.dps = Math.round(((out.physMin + out.physMax) / 2) * s.aps);
  } else {
    if (s.armour) out.armour = Math.round(s.armour * q * (1 + local.armour / 100));
    if (s.evasion) out.evasion = Math.round(s.evasion * q * (1 + local.evasion / 100));
    if (s.es) out.es = Math.round(s.es * q * (1 + local.es / 100));
  }
  out.req = reqAttrs(base, item.ilvl);
  out.class = base.class;
  return out;
}

/** Renderable modifier lines: { text, kind, tier }. */
export function itemMods(item) {
  const out = [];
  if (item.implicit) {
    const def = IMPLICIT_BY_ID[item.implicit.defId];
    if (def) out.push({ text: def.text(item.implicit.values[0]), kind: 'implicit' });
  }
  if (item.rarity === 'unique') {
    const u = UNIQUE_BY_ID[item.uniqueId];
    u?.mods.forEach((mod, i) => out.push({ text: mod.text(item.uniqueRolls[i]), kind: 'unique' }));
    return out;
  }
  for (const a of item.affixes) {
    const def = AFFIX_BY_ID[a.defId];
    if (!def) continue;
    out.push({
      text: def.text(a.values),
      kind: def.type,
      tier: tierNumber(def, a.tierIndex),
      group: def.group,
    });
  }
  return out;
}

/**
 * Folds every non-local modifier on `item` into the stat bag.
 * Local weapon/armour mods are skipped — they already shaped itemBaseStats().
 */
const LOCAL_IDS = new Set(['inc_phys', 'inc_armour', 'inc_evasion', 'inc_es_local', 'flat_phys']);

export function applyItemMods(item, bag) {
  if (item.implicit) {
    const def = IMPLICIT_BY_ID[item.implicit.defId];
    if (def) def.apply(bag, item.implicit.values[0]);
  }
  if (item.rarity === 'unique') {
    const u = UNIQUE_BY_ID[item.uniqueId];
    u?.mods.forEach((mod, i) => mod.apply(bag, item.uniqueRolls[i]));
    return;
  }
  for (const a of item.affixes) {
    const def = AFFIX_BY_ID[a.defId];
    if (!def || LOCAL_IDS.has(def.id)) continue;
    def.apply(bag, a.values);
  }
}

/** Category / sub-type descriptor for inventory and tooltip display. */
export function itemDescriptor(item) {
  return baseDescriptor(BASE_BY_ID[item.baseId]);
}

/** Rough desirability score, used for auto-sorting and salvage payouts. */
export function itemScore(item) {
  const rarityMult = { normal: 1, magic: 2.2, rare: 4.5, unique: 9 }[item.rarity] ?? 1;
  let modScore = 0;
  for (const a of item.affixes) {
    const def = AFFIX_BY_ID[a.defId];
    if (!def) continue;
    modScore += tierNumber(def, a.tierIndex) <= 2 ? 3 : 1;
  }
  return Math.round((item.ilvl * 0.6 + modScore * 4) * rarityMult);
}

/**
 * Drops a random unique appropriate to the item level, or null if none fit.
 *
 * Weighting is biased toward uniques whose own level requirement is near the
 * map's item level. Without this, a Tier 16 map would roll the level-1 uniques
 * just as often as its own, and no tier band would ever be the *right* place to
 * hunt a specific item. Low-level uniques stay possible, just rarer.
 */
export function rollUnique(ilvl) {
  const pool = uniquesFor(ilvl);
  if (!pool.length) return null;
  const weightFor = (u) => u.weight / (1 + Math.max(0, ilvl - u.lvl) * 0.035);
  return createItem({ uniqueId: rng.weighted(pool, weightFor).id, ilvl });
}

/** Corrupts an item — small chance of a bonus, small chance of a downgrade. */
export function corruptItem(item) {
  item.corrupted = true;
  const roll = rng.float();
  if (roll < 0.25 && item.rarity !== 'unique') {
    // Implicit gets supercharged.
    if (item.implicit) {
      const def = IMPLICIT_BY_ID[item.implicit.defId];
      item.implicit.values[0] = Number((item.implicit.values[0] * rng.range(1.2, 1.5)).toFixed(def?.dec ?? 0));
      return 'The implicit modifier surges with Vaal energy.';
    }
  }
  if (roll < 0.45 && item.affixes.length && item.rarity !== 'unique') {
    if (addRandomAffix(item)) return 'A new modifier claws its way onto the item.';
  }
  if (roll < 0.6 && item.affixes.length) {
    item.affixes.splice(rng.int(0, item.affixes.length - 1), 1);
    refreshName(item);
    return 'A modifier is consumed by the corruption.';
  }
  if (roll < 0.72) {
    item.quality = clamp((item.quality ?? 0) + rng.int(5, 15), 0, 30);
    return 'The item is tempered by corruption.';
  }
  return 'Nothing happens. The item is now corrupted.';
}
