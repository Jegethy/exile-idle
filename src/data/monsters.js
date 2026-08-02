// data/monsters.js — enemy archetypes encountered on expeditions.

/** `split` is the fraction of a hit dealt as each damage type. */
export const ARCHETYPES = [
  { id: 'skeleton', name: 'Rattling Skeleton', split: { phys: 1.0 }, life: 0.85, dmg: 1.00, aps: 1.10, ar: 1.0, ev: 0.6 },
  { id: 'ghoul', name: 'Crypt Ghoul', split: { phys: 0.8, chaos: 0.2 }, life: 1.30, dmg: 1.10, aps: 0.75, ar: 1.2, ev: 0.3 },
  { id: 'hound', name: 'Cinder Hound', split: { fire: 0.9, phys: 0.1 }, life: 0.80, dmg: 1.10, aps: 1.35, ar: 0.5, ev: 1.2 },
  { id: 'revenant', name: 'Frost Revenant', split: { cold: 0.9, phys: 0.1 }, life: 1.00, dmg: 1.05, aps: 0.95, ar: 0.8, ev: 0.8 },
  { id: 'warden', name: 'Storm Warden', split: { light: 0.95, phys: 0.05 }, life: 0.75, dmg: 1.30, aps: 0.85, ar: 0.4, ev: 1.0 },
  { id: 'cultist', name: 'Hooded Cultist', split: { phys: 0.6, chaos: 0.4 }, life: 0.90, dmg: 1.10, aps: 1.15, ar: 0.7, ev: 1.0 },
  { id: 'golem', name: 'Stone Golem', split: { phys: 1.0 }, life: 1.85, dmg: 1.35, aps: 0.60, ar: 2.2, ev: 0.1 },
  { id: 'wraith', name: 'Hollow Wraith', split: { chaos: 0.7, cold: 0.3 }, life: 0.70, dmg: 1.20, aps: 1.20, ar: 0.2, ev: 2.0 },
  { id: 'sentinel', name: 'Vault Sentinel', split: { light: 0.5, fire: 0.5 }, life: 1.15, dmg: 1.25, aps: 0.90, ar: 1.1, ev: 0.7 },
  { id: 'brute', name: 'Pit Brute', split: { phys: 1.0 }, life: 1.20, dmg: 1.20, aps: 1.00, ar: 0.9, ev: 0.9 },
  { id: 'spider', name: 'Brood Spider', split: { chaos: 0.6, phys: 0.4 }, life: 0.65, dmg: 1.05, aps: 1.45, ar: 0.4, ev: 1.5 },
];

/** Enemy rarity: multipliers and how much extra loot they carry. */
export const MONSTER_RARITY = {
  normal: { id: 'normal', name: '', life: 1, dmg: 1, xp: 1, drops: 1, weight: 76 },
  elite: { id: 'elite', name: 'Elite ', life: 2.3, dmg: 1.30, xp: 2.4, drops: 2.4, weight: 19 },
  champion: { id: 'champion', name: '', life: 5.8, dmg: 1.75, xp: 6.0, drops: 5.5, weight: 5 },
};

/** Name fragments for champion enemies. */
export const CHAMPION_TITLES = [
  ['Grim', 'Blood', 'Ash', 'Storm', 'Bone', 'Doom', 'Rot', 'Void', 'Night', 'Iron'],
  ['weaver', 'render', 'binder', 'howl', 'maw', 'thorn', 'shard', 'fang', 'wrath', 'bane'],
];

/** Titles for the guardian waiting at the end of every expedition. */
export const GUARDIAN_TITLES = [
  'Overseer', 'Tyrant', 'Warlord', 'Devourer', 'Herald', 'Keeper', 'Sovereign', 'Butcher',
];
