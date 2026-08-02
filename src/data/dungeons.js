// data/dungeons.js — expedition destinations.
//
// Every dungeon exists at every tier. Tier is "how hard", dungeon is "what for",
// and those are deliberately independent axes: you pick the highest tier your
// party survives, then pick the dungeon that pays what you currently need.
// That is what keeps cleared-out low tiers useful — a Tier 3 Deepmines run you
// finish in twenty seconds can out-earn gold from a Tier 12 you barely survive.
//
// Each dungeon also has a defensive slant, so party composition is a real
// decision rather than "bring the five strongest heroes".

export const DUNGEONS = [
  {
    id: 'mines', name: 'The Deepmines', focus: 'Gold', icon: 'pick',
    blurb: 'Collapsed shafts worked by things that no longer need air. The seams are still rich.',
    counter: 'Enemies are heavily armoured — physical weapons struggle here.',
    rewards: { gold: 2.40, gear: 0.55, xp: 0.75, orbs: 0.70 },
    monsters: { armour: 2.6, evasion: 0.5, life: 1.0, damage: 0.95, res: 0 },
    waves: 8,
  },
  {
    id: 'crypt', name: 'The Sunken Crypt', focus: 'Equipment', icon: 'skull',
    blurb: 'Flooded burial vaults. Whatever was interred here was buried with its wealth.',
    counter: 'The dead hit hard and endure — bring sustain.',
    rewards: { gold: 0.60, gear: 2.20, xp: 0.85, orbs: 0.95 },
    monsters: { armour: 1.0, evasion: 0.7, life: 1.45, damage: 1.15, res: 0 },
    waves: 9,
  },
  {
    id: 'arena', name: 'The Proving Arena', focus: 'Experience', icon: 'banner',
    blurb: 'A sanctioned blood sport. The crowd pays poorly; the lessons are worth more.',
    counter: 'Opponents are fast and aggressive — a Tank earns their keep.',
    rewards: { gold: 0.70, gear: 0.70, xp: 2.40, orbs: 0.55 },
    monsters: { armour: 0.8, evasion: 1.2, life: 0.85, damage: 1.35, aps: 1.30, res: 0 },
    waves: 10,
  },
  {
    id: 'vault', name: 'The Arcane Vault', focus: 'Currency', icon: 'orb',
    blurb: 'A repository of bound magic. The wards were never meant to be argued with.',
    counter: 'Wardens carry heavy elemental resistance — physical damage cuts deeper.',
    rewards: { gold: 0.85, gear: 0.80, xp: 0.70, orbs: 2.50 },
    monsters: { armour: 0.9, evasion: 0.9, life: 1.1, damage: 1.05, res: 45 },
    waves: 8,
  },
];

export const DUNGEON_BY_ID = Object.fromEntries(DUNGEONS.map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

/**
 * Raids are single-encounter stat checks that consume a Raid Seal. They are the
 * guild's milestone content: guaranteed rich payouts, and each first kill
 * permanently raises the guild's reward multipliers.
 */
export const RAIDS = [
  {
    id: 'hollow_king', name: 'The Hollow King', tier: 4, seals: 1,
    blurb: 'A crowned corpse that never accepted the verdict of its own death.',
    life: 26, damage: 1.9, aps: 0.85, armour: 2.0, res: 20,
    split: { phys: 0.7, chaos: 0.3 },
    reward: { gold: 4000, orbs: 6, uniqueChance: 0.55, bonus: 3 },
  },
  {
    id: 'brood_matron', name: 'The Brood Matron', tier: 8, seals: 2,
    blurb: 'She has been laying since before the mines were dug. The tunnels are her nursery.',
    life: 44, damage: 2.3, aps: 1.15, armour: 1.2, res: 35,
    split: { phys: 0.5, chaos: 0.5 },
    reward: { gold: 14000, orbs: 12, uniqueChance: 0.7, bonus: 4 },
  },
  {
    id: 'ember_tyrant', name: 'The Ember Tyrant', tier: 12, seals: 3,
    blurb: 'It sleeps beneath the forge-mountain, and the mountain is beginning to crack.',
    life: 70, damage: 2.9, aps: 1.0, armour: 2.4, res: 50,
    split: { fire: 0.75, phys: 0.25 },
    reward: { gold: 48000, orbs: 20, uniqueChance: 0.85, bonus: 5 },
  },
  {
    id: 'drowned_choir', name: 'The Drowned Choir', tier: 16, seals: 4,
    blurb: 'Nine voices beneath the water, singing the same note since the flood.',
    life: 105, damage: 3.4, aps: 1.25, armour: 1.8, res: 60,
    split: { cold: 0.5, light: 0.3, chaos: 0.2 },
    reward: { gold: 150000, orbs: 32, uniqueChance: 0.95, bonus: 6 },
  },
  {
    id: 'worldeater', name: 'The Worldeater', tier: 22, seals: 6,
    blurb: 'There is no arena. There is only the mouth, and how long you last inside it.',
    life: 180, damage: 4.2, aps: 1.1, armour: 3.0, res: 70,
    split: { phys: 0.35, fire: 0.25, cold: 0.2, chaos: 0.2 },
    reward: { gold: 600000, orbs: 50, uniqueChance: 1.0, bonus: 8 },
  },
];

export const RAID_BY_ID = Object.fromEntries(RAIDS.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// Tier scaling
// ---------------------------------------------------------------------------

/** Recommended hero level for a tier. Tier 1 is level-1 content. */
export function tierToLevel(tier) {
  return tier <= 20 ? Math.round(1 + (tier - 1) * 3.6) : 69 + Math.round((tier - 20) * 2.2);
}

/** Item level of gear dropped at a tier. */
export function tierToIlvl(tier) {
  return tier <= 20 ? Math.round(1 + (tier - 1) * 4.4) : 85 + Math.round((tier - 20) * 2.2);
}

/** Stamina a single hero spends on one expedition at this tier. */
export function staminaCost(tier) {
  return Math.min(45, 8 + Math.floor(tier * 1.2));
}

/** Roughly how long an expedition takes, used for the UI estimate only. */
export function expectedDuration(dungeon, tier) {
  return dungeon.waves * (2.2 + tier * 0.05);
}
