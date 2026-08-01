// data/monsters.js — monster archetypes, rarity scaling and boss definitions.
//
// Concrete monster stats are derived from map tier at spawn time (see
// src/combat.js) so encounters keep scaling into uber tiers forever.

/** Damage split by element. Values are fractions of the monster's hit. */
export const ARCHETYPES = [
  { id: 'skeleton', name: 'Rotting Skeleton', split: { phys: 1.0 }, life: 0.85, dmg: 1.0, aps: 1.1, ar: 1.0, ev: 0.6 },
  { id: 'zombie', name: 'Bloated Zombie', split: { phys: 0.8, chaos: 0.2 }, life: 1.35, dmg: 1.15, aps: 0.7, ar: 1.2, ev: 0.2 },
  { id: 'flamehound', name: 'Flame Hound', split: { fire: 0.9, phys: 0.1 }, life: 0.8, dmg: 1.1, aps: 1.35, ar: 0.5, ev: 1.2 },
  { id: 'frostbearer', name: 'Frostbearer', split: { cold: 0.9, phys: 0.1 }, life: 1.0, dmg: 1.05, aps: 0.95, ar: 0.8, ev: 0.8 },
  { id: 'stormcaller', name: 'Storm Caller', split: { light: 0.95, phys: 0.05 }, life: 0.75, dmg: 1.3, aps: 0.85, ar: 0.4, ev: 1.0 },
  { id: 'cultist', name: 'Blood Cultist', split: { phys: 0.6, chaos: 0.4 }, life: 0.9, dmg: 1.1, aps: 1.15, ar: 0.7, ev: 1.0 },
  { id: 'goliath', name: 'Stone Goliath', split: { phys: 1.0 }, life: 1.8, dmg: 1.35, aps: 0.6, ar: 2.0, ev: 0.1 },
  { id: 'wraith', name: 'Voidwraith', split: { chaos: 0.7, cold: 0.3 }, life: 0.7, dmg: 1.2, aps: 1.2, ar: 0.2, ev: 2.0 },
  { id: 'sentinel', name: 'Arcane Sentinel', split: { light: 0.5, fire: 0.5 }, life: 1.1, dmg: 1.25, aps: 0.9, ar: 1.0, ev: 0.7 },
  { id: 'beast', name: 'Rhoa Charger', split: { phys: 1.0 }, life: 1.15, dmg: 1.2, aps: 1.0, ar: 0.9, ev: 0.9 },
];

/** Monster rarity tiers: life/damage multipliers and loot weighting. */
export const MONSTER_RARITY = {
  normal: { id: 'normal', name: '', life: 1, dmg: 1, xp: 1, drops: 1, weight: 78 },
  magic: { id: 'magic', name: 'Possessed ', life: 2.2, dmg: 1.3, xp: 2.2, drops: 2.2, weight: 17 },
  rare: { id: 'rare', name: 'Champion ', life: 5.5, dmg: 1.75, xp: 5.5, drops: 5, weight: 5 },
};

/** Flavour prefixes/suffixes for rare monster names. */
export const RARE_TITLES = [
  ['Grim', 'Blood', 'Ash', 'Storm', 'Bone', 'Doom', 'Rot', 'Void', 'Night', 'Iron'],
  ['weaver', 'render', 'binder', 'howl', 'maw', 'thorn', 'shard', 'fang', 'wrath', 'bane'],
];

/**
 * Pinnacle bosses. `key` is how many Pinnacle Fragments a summon costs,
 * `tier` is the minimum map tier required to challenge them.
 */
export const BOSSES = [
  {
    id: 'warden', name: 'The Warden of the Gate', tier: 5, frags: 4,
    split: { phys: 0.7, fire: 0.3 }, life: 14, dmg: 2.0, aps: 0.9, ar: 2.0, ev: 0.5, res: 20,
    intro: 'Chains rattle in the dark. Something very large stands up.',
    uniqueChance: 0.45, extraCurrency: 3,
  },
  {
    id: 'shaper', name: 'The Dreaming Shaper', tier: 10, frags: 4,
    split: { cold: 0.5, chaos: 0.5 }, life: 22, dmg: 2.4, aps: 1.1, ar: 1.0, ev: 2.0, res: 35,
    intro: 'The walls fold inward. You are being dreamt.',
    uniqueChance: 0.6, extraCurrency: 5,
  },
  {
    id: 'elder', name: 'The Elder Beneath', tier: 14, frags: 4,
    split: { chaos: 0.8, phys: 0.2 }, life: 32, dmg: 2.9, aps: 0.8, ar: 1.5, ev: 1.2, res: 45,
    intro: 'A thousand tendrils taste the air. It has been waiting.',
    uniqueChance: 0.75, extraCurrency: 8,
  },
  {
    id: 'sirus', name: 'Sirus, Awakener of Worlds', tier: 16, frags: 4,
    split: { phys: 0.4, fire: 0.3, light: 0.3 }, life: 48, dmg: 3.4, aps: 1.0, ar: 2.5, ev: 2.5, res: 55,
    intro: 'He turns to face you, and the sky turns with him.',
    uniqueChance: 0.9, extraCurrency: 12,
  },
  {
    id: 'uber', name: 'The Hungering Void', tier: 20, frags: 6,
    split: { chaos: 0.5, cold: 0.25, light: 0.25 }, life: 80, dmg: 4.2, aps: 1.2, ar: 3.0, ev: 3.0, res: 70,
    intro: 'There is no arena. There is only appetite.',
    uniqueChance: 1.0, extraCurrency: 20,
  },
];

export const BOSS_BY_ID = Object.fromEntries(BOSSES.map((b) => [b.id, b]));

/** Map-area boss (the guaranteed fight at the end of every map). */
export const MAP_BOSS_TITLES = [
  'Overseer', 'Tyrant', 'Warlord', 'Devourer', 'Herald', 'Keeper', 'Sovereign', 'Butcher',
];
