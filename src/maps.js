// maps.js — map items, their modifiers, and the Atlas progression.

import { rng } from './rng.js';
import { uid, clamp } from './util.js';
import { G, tierToIlvl, tierToLevel } from './state.js';
import { MAP_MODS, MAP_MOD_BY_ID, eligibleMapMods, newMapMods, MAP_NAMES } from './data/mapmods.js';

export const MAX_NAMED_TIER = 16;

/** Deterministic name per tier, so the Atlas feels like a fixed place. */
export function mapNameFor(tier) {
  if (tier <= MAX_NAMED_TIER) return MAP_NAMES[(tier * 7) % MAP_NAMES.length];
  const base = MAP_NAMES[(tier * 7) % MAP_NAMES.length];
  return `Uber ${base}`;
}

/** Mod counts per map rarity. */
function modCount(rarity) {
  if (rarity === 'magic') return rng.int(1, 2);
  if (rarity === 'rare') return rng.int(4, 6);
  return 0;
}

/** Rolls a fresh mod list onto a map. */
export function rollMapMods(map, rarity = map.rarity) {
  map.rarity = rarity;
  map.mods = [];
  const n = modCount(rarity);
  for (let i = 0; i < n; i++) addMapMod(map);
  return map;
}

/** Adds one random legal mod. Returns false if none remain. */
export function addMapMod(map) {
  const used = new Set(map.mods.map((m) => m.defId));
  const prefixes = map.mods.filter((m) => MAP_MOD_BY_ID[m.defId]?.type === 'prefix').length;
  const suffixes = map.mods.length - prefixes;
  const cap = map.rarity === 'magic' ? 1 : 3;

  const types = [];
  if (prefixes < cap) types.push('prefix');
  if (suffixes < cap) types.push('suffix');
  if (!types.length) return false;

  const pool = eligibleMapMods(map.tier, rng.pick(types)).filter((m) => !used.has(m.id));
  if (!pool.length) return false;

  const def = rng.weighted(pool, (m) => m.weight);
  const value = def.r[1] === def.r[0] ? def.r[0] : rng.int(def.r[0], def.r[1]);
  map.mods.push({ defId: def.id, value });
  return true;
}

export function createMap(opts = {}) {
  const tier = Math.max(1, Math.round(opts.tier ?? 1));
  const map = {
    uid: uid('mp'), kind: 'map', tier,
    name: mapNameFor(tier),
    rarity: opts.rarity ?? 'normal',
    quality: opts.quality ?? 0,
    corrupted: false,
    ilvl: tierToIlvl(tier),
    mods: [],
  };
  rollMapMods(map, map.rarity);
  return map;
}

/** Renderable mod lines. */
export function mapModLines(map) {
  return map.mods.map((m) => {
    const def = MAP_MOD_BY_ID[m.defId];
    return def ? { text: def.text(m.value), type: def.type } : null;
  }).filter(Boolean);
}

/**
 * Folds a map's mods into the accumulator combat reads. Quality adds pure
 * quantity, which is why Chisels are worth using on good maps.
 */
export function mapModifiers(map) {
  const mm = newMapMods();
  for (const m of map.mods) {
    const def = MAP_MOD_BY_ID[m.defId];
    if (def) def.apply(mm, m.value);
  }
  mm.quant += (map.quality ?? 0) * 2;
  // Rarity of the map itself is a baseline reward multiplier.
  if (map.rarity === 'magic') { mm.quant += 15; mm.rarity += 15; }
  if (map.rarity === 'rare') { mm.quant += 35; mm.rarity += 40; }
  if (map.corrupted) { mm.quant += 20; mm.rarity += 20; }
  return mm;
}

/** Total monsters in a map run, scaled by pack size. */
export function monsterCount(map, mm) {
  const base = 14 + Math.floor(map.tier * 0.8);
  return Math.round(base * (1 + mm.packSize / 100));
}

/** Rough danger score, shown in the UI so players can judge a map at a glance. */
export function mapDanger(map, mm) {
  return Math.round(
    map.tier * 10
    + mm.mLife * 0.4 + mm.mDmg * 0.9 + mm.mAps * 0.7 + mm.mCrit * 0.2
    + (mm.extraFire + mm.extraCold + mm.extraLight + mm.extraChaos) * 40
    + Math.abs(mm.pMaxRes) * 6 + mm.pDamageTaken * 1.4
    + mm.pLessArmour * 0.2 + mm.pLessEvade * 0.2 + mm.pLessES * 0.25,
  );
}

// ---------------------------------------------------------------------------
// Atlas progression
// ---------------------------------------------------------------------------

/**
 * Records a completion and unlocks the next tier.
 *
 * Clearing a tier on a *Rare* map also ticks its "bonus objective", which is
 * the mechanism that makes outgrown tiers worth revisiting: bonuses are
 * permanent, stack across the whole Atlas, and can only be earned one per tier.
 *
 * @returns {{firstClear: boolean, firstBonus: boolean}}
 */
export function recordCompletion(tier, map) {
  const a = G.state.atlas;
  const firstClear = !a.completed[tier];
  a.completed[tier] = (a.completed[tier] ?? 0) + 1;
  if (tier > a.highestTier) a.highestTier = tier;
  if (tier >= a.unlocked) a.unlocked = tier + 1;
  if (tier > G.state.stats.bestTier) G.state.stats.bestTier = tier;

  let firstBonus = false;
  if (map && map.rarity === 'rare' && !a.bonus[tier]) {
    a.bonus[tier] = true;
    firstBonus = true;
  }
  return { firstClear, firstBonus };
}

/** Permanent Atlas rewards: +1% quant/rarity per tier cleared, +3% per bonus. */
export const ATLAS_CLEAR_BONUS = 1;
export const ATLAS_OBJECTIVE_BONUS = 3;

export function atlasBonuses(state = G.state) {
  const a = state.atlas;
  const cleared = Object.keys(a.completed ?? {}).length;
  const bonuses = Object.keys(a.bonus ?? {}).length;
  const amount = cleared * ATLAS_CLEAR_BONUS + bonuses * ATLAS_OBJECTIVE_BONUS;
  return { cleared, bonuses, quant: amount, rarity: amount };
}

// Where dropped maps land relative to the map you just ran. Mirrors Path of
// Exile: mostly sideways, often down, sometimes up. Same-tier weight is high
// enough that a map roughly replaces itself, so a tier sustains once you can
// clear it, while the downward flow builds a backlog for farming and the
// upward flow feeds progression.
const TIER_SPREAD = [
  { delta: -1, weight: 30 },
  { delta: 0, weight: 45 },
  { delta: +1, weight: 25 },
];

/** Average maps returned per map completed, before quantity bonuses. */
const BASE_MAP_DROPS = 2.2;

/**
 * Maps dropped on completion.
 *
 * Expected count is deliberately above 1: dropping a single map made every run
 * feel like breaking even at best, and one bad roll stranded the player on the
 * Atlas's free Tier 1. Item Quantity and the Cartographer's Eye upgrade both
 * push it higher.
 */
export function rollMapDrops(map, mm, bonusPct = 0) {
  const drops = [];
  const expected = BASE_MAP_DROPS * (1 + (mm.quant / 100) * 0.55 + bonusPct / 100);

  let n = Math.floor(expected);
  if (rng.chance(expected - n)) n++;
  n = clamp(n, 1, 8);              // never zero — a run always feeds the next one

  for (let i = 0; i < n; i++) {
    const spread = rng.weighted(TIER_SPREAD, (t) => t.weight);
    // Can't leap past what the Atlas has unlocked; at Tier 1 a "down" roll has
    // nowhere to go, so it becomes another map of the same tier.
    const tier = clamp(map.tier + spread.delta, 1, G.state.atlas.unlocked + 1);

    let rarity = 'normal';
    const rr = rng.float() * 100;
    if (rr < 5 + mm.rarity / 20) rarity = 'rare';
    else if (rr < 28 + mm.rarity / 8) rarity = 'magic';

    drops.push(createMap({ tier, rarity }));
  }
  return drops;
}

/** The starting map handed out when a player has none — never leaves them stuck. */
export function grantStarterMap() {
  return createMap({ tier: 1, rarity: 'normal' });
}

/** Convenience: the effective monster level of a map. */
export function mapLevel(map) { return tierToLevel(map.tier); }

/** All map mod defs (for the UI's mod reference panel). */
export { MAP_MODS };
