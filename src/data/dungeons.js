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
    id: 'mines', name: 'The Deepmines', focus: 'Gold', category: 'gold', icon: 'pick',
    blurb: 'Collapsed shafts worked by things that no longer need air. The seams are still rich.',
    counter: 'Enemies are heavily armoured — physical weapons struggle here.',
    rewards: { gold: 2.40, gear: 0.55, xp: 0.75, mats: 1.10 },
    materials: { metal: 6, stone: 3, bone: 1 },
    monsters: { armour: 2.6, evasion: 0.5, life: 1.0, damage: 0.95, res: 0 },
    attackMix: { melee: 62, spell: 38 },   // pit brutes and golems in the dark
    waves: 8,
  },
  {
    id: 'crypt', name: 'The Sunken Crypt', focus: 'Equipment', category: 'gear', icon: 'skull',
    blurb: 'Flooded burial vaults. Whatever was interred here was buried with its wealth.',
    counter: 'The dead hit hard and endure — bring sustain.',
    rewards: { gold: 0.60, gear: 2.20, xp: 0.85, mats: 0.90 },
    materials: { bone: 6, cloth: 3, essence: 1 },
    monsters: { armour: 1.0, evasion: 0.7, life: 1.45, damage: 1.15, res: 0 },
    attackMix: { melee: 35, spell: 65 },   // the restless dead, and what raised them
    waves: 9,
  },
  {
    id: 'arena', name: 'The Proving Arena', focus: 'Experience', category: 'xp', icon: 'banner',
    blurb: 'A sanctioned blood sport. The crowd pays poorly; the lessons are worth more.',
    counter: 'Opponents are fast and aggressive — a Tank earns their keep.',
    rewards: { gold: 0.70, gear: 0.70, xp: 2.40, mats: 0.70 },
    materials: { leather: 5, bone: 3, metal: 2 },
    monsters: { armour: 0.8, evasion: 1.2, life: 0.85, damage: 1.35, aps: 1.30, res: 0 },
    attackMix: { melee: 55, spell: 45 },   // a blood sport, mostly fought by hand
    waves: 10,
  },
  {
    id: 'vault', name: 'The Arcane Vault', focus: 'Essence', category: 'materials', icon: 'orb',
    blurb: 'A repository of bound magic. The wards were never meant to be argued with.',
    counter: 'Wardens carry heavy elemental resistance — physical damage cuts deeper.',
    rewards: { gold: 0.85, gear: 0.80, xp: 0.70, mats: 2.10 },
    materials: { essence: 7, stone: 3 },
    monsters: { armour: 0.9, evasion: 0.9, life: 1.1, damage: 1.05, res: 45 },
    attackMix: { melee: 20, spell: 80 },   // wardens and sentinels — the caster house
    waves: 8,
  },

  // ---- Gathering runs. Poor for gear and gold, unmatched for materials. ----
  {
    id: 'forest', name: 'The Dark Forest', focus: 'Wood & Herbs', category: 'materials', icon: 'tree',
    blurb: 'Old growth that closed over the road a long time ago. Things nest in it now.',
    counter: 'Fast, evasive quarry — accuracy matters more than armour here.',
    rewards: { gold: 0.55, gear: 0.45, xp: 0.80, mats: 2.60 },
    materials: { wood: 6, herb: 4 },
    monsters: { armour: 0.5, evasion: 1.8, life: 0.85, damage: 1.0, aps: 1.15, res: 0 },
    attackMix: { melee: 45, spell: 55 },   // beasts and druids in equal measure
    waves: 8,
  },
  {
    id: 'marches', name: 'The Wild Marches', focus: 'Leather & Bone', category: 'materials', icon: 'hide',
    blurb: 'Open hunting country. Everything out here has hide worth taking, and knows it.',
    counter: 'Heavy brutes that hit hard but slowly — a Tank holds them easily.',
    rewards: { gold: 0.60, gear: 0.50, xp: 0.85, mats: 2.50 },
    materials: { leather: 6, bone: 4 },
    monsters: { armour: 1.1, evasion: 0.6, life: 1.55, damage: 1.30, aps: 0.70, res: 0 },
    attackMix: { melee: 70, spell: 30 },   // brutes, almost to a one
    waves: 8,
  },
  {
    id: 'hollow', name: 'Silkmoth Hollow', focus: 'Cloth & Herbs', category: 'materials', icon: 'silk',
    blurb: 'A gorge hung with cocoons the size of carts. The weaving never stops.',
    counter: 'Swarming attackers with weak individual hits — sustain beats armour.',
    rewards: { gold: 0.55, gear: 0.50, xp: 0.75, mats: 2.55 },
    materials: { cloth: 6, herb: 3, essence: 1 },
    monsters: { armour: 0.4, evasion: 1.2, life: 0.70, damage: 0.85, aps: 1.45, res: 0 },
    attackMix: { melee: 26, spell: 74 },   // swarms of chittering casters
    waves: 9,
  },
];

export const DUNGEON_BY_ID = Object.fromEntries(DUNGEONS.map((d) => [d.id, d]));

/**
 * Dispatch-screen filters. Grouping by what a run pays out keeps the list
 * navigable as destinations are added — a player hunting leather should not
 * have to scan past every gold and experience run to find it.
 */
export const DUNGEON_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'gold', name: 'Gold' },
  { id: 'gear', name: 'Equipment' },
  { id: 'xp', name: 'Experience' },
  { id: 'materials', name: 'Materials' },
];

/** Dungeons in a category. `all` returns everything. */
export function dungeonsIn(category) {
  return category === 'all' ? DUNGEONS : DUNGEONS.filter((d) => d.category === category);
}

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

/**
 * Raids are single-encounter stat checks that consume a Raid Seal. They are the
 * guild's milestone content: guaranteed rich payouts, and each first kill
 * permanently raises the guild's reward multipliers.
 */
/**
 * Blend for anything that does not state one.
 *
 * 40/60 rather than 50/50 because a tank does not experience a dungeon's mix
 * directly: melee can only reach the front row so it concentrates on them,
 * while spells spread across the party by threat. Roughly 40/60 is what an
 * even split feels like from where the tank is standing.
 *
 * Never pure, either — a dungeon with no casters at all would leave one tank
 * with nothing to do rather than a hard afternoon.
 */
export const DEFAULT_ATTACK_MIX = { melee: 40, spell: 60 };

// Boss life and damage are multipliers on the tier curve, and they are
// *measured* against what a party at that tier can actually do -- party damage
// for the life figure, tank effective health plus healing for the damage one.
//
// They had never been checked. The Worldeater at Tier 22 killed a full
// Legendary party in seventeen seconds with 82% of its life remaining: its
// damage multiplier was 4.2 where the measurement says 1.3, because the
// multiplier had been chosen by eye while the curve underneath it compounded.
// The first four had the opposite problem and died in one to nine seconds,
// which made a milestone boss feel like a button. They are calibrated the same
// way now, against the party a player can plausibly field when each unlocks --
// Common heroes at Tier 4, not the Legendary roster the first pass assumed.
export const RAIDS = [
  {
    id: 'hollow_king', name: 'The Hollow King', tier: 4, seals: 1,
    blurb: 'A crowned corpse that never accepted the verdict of its own death.',
    life: 460, damage: 9.6, aps: 0.85, armour: 2.0, res: 20,
    attack: 'melee', split: { phys: 0.7, chaos: 0.3 },
    reward: { gold: 4000, materials: 6, uniqueChance: 0.55, bonus: 3, echoes: 2 },
  },
  {
    id: 'brood_matron', name: 'The Brood Matron', tier: 8, seals: 2,
    blurb: 'She has been laying since before the mines were dug. The tunnels are her nursery.',
    life: 290, damage: 4.8, aps: 1.15, armour: 1.2, res: 35,
    attack: 'melee', split: { phys: 0.5, chaos: 0.5 },
    reward: { gold: 14000, materials: 12, uniqueChance: 0.7, bonus: 4, echoes: 3 },
  },
  {
    id: 'ember_tyrant', name: 'The Ember Tyrant', tier: 12, seals: 3,
    blurb: 'It sleeps beneath the forge-mountain, and the mountain is beginning to crack.',
    life: 250, damage: 3.6, aps: 1.0, armour: 2.4, res: 50,
    attack: 'spell', split: { fire: 0.75, phys: 0.25 },
    reward: { gold: 48000, materials: 20, uniqueChance: 0.85, bonus: 5, echoes: 4 },
  },
  {
    id: 'drowned_choir', name: 'The Drowned Choir', tier: 16, seals: 4,
    blurb: 'Nine voices beneath the water, singing the same note since the flood.',
    life: 140, damage: 1.5, aps: 1.25, armour: 1.8, res: 60,
    attack: 'spell', split: { cold: 0.5, light: 0.3, chaos: 0.2 },
    reward: { gold: 150000, materials: 32, uniqueChance: 0.95, bonus: 6, echoes: 6 },
  },
  {
    id: 'worldeater', name: 'The Worldeater', tier: 22, seals: 6,
    blurb: 'There is no arena. There is only the mouth, and how long you last inside it.',
    life: 138, damage: 1.15, aps: 1.1, armour: 3.0, res: 70,
    attack: 'mixed', split: { phys: 0.35, fire: 0.25, cold: 0.2, chaos: 0.2 },
    reward: { gold: 600000, materials: 50, uniqueChance: 1.0, bonus: 8, echoes: 10 },
  },

  // ---- The deep raids ----------------------------------------------------
  // Everything above used to be the whole ladder, and the last of them fell at
  // Tier 22 — long before a party runs out of tiers to push. These exist
  // because Echo Stones come only from raids, so a guild at Tier 30 was
  // farming Tier 22 bosses for them, and because gear now improves to Tier 32
  // while the boss list stopped ten tiers earlier.
  //
  // They are also the only source of two things: uniques that cannot drop
  // anywhere else, and blank high-level bases to craft on.
  {
    id: 'sunless_court', name: 'The Sunless Court', tier: 26, seals: 8,
    blurb: 'A throne room that has not seen daylight since it was buried. The court still sits.',
    life: 118, damage: 1.06, aps: 1.15, armour: 2.6, res: 66,
    attack: 'mixed', split: { phys: 0.4, cold: 0.3, chaos: 0.3 },
    reward: {
      gold: 1400000, materials: 60, uniqueChance: 1.0, bonus: 6, echoes: 14,
      deepUnique: 0.30, blanks: 0.22,
    },
  },
  {
    id: 'sundered_titan', name: 'The Sundered Titan', tier: 31, seals: 11,
    blurb: 'It was broken apart and buried in four places. Three of them are now empty.',
    life: 158, damage: 1.35, aps: 0.95, armour: 3.6, res: 72,
    attack: 'melee', split: { phys: 0.65, light: 0.35 },
    reward: {
      gold: 3600000, materials: 85, uniqueChance: 1.0, bonus: 7, echoes: 20,
      deepUnique: 0.55, blanks: 0.38,
    },
  },
  {
    id: 'the_hollow_star', name: 'The Hollow Star', tier: 36, seals: 15,
    blurb: 'Something fell here a long time ago, and the crater has been getting deeper ever since.',
    life: 268, damage: 1.14, aps: 1.3, armour: 3.0, res: 78,
    attack: 'spell', split: { fire: 0.3, cold: 0.2, light: 0.2, chaos: 0.3 },
    reward: {
      gold: 9000000, materials: 120, uniqueChance: 1.0, bonus: 9, echoes: 30,
      deepUnique: 1.0, blanks: 0.60,
    },
  },
];

export const RAID_BY_ID = Object.fromEntries(RAIDS.map((r) => [r.id, r]));

/**
 * Item level of everything the deep raids hand out.
 *
 * Fixed, not scaled from the tier that dropped it. There is no item level cap
 * in this game — it climbs 2.2 a tier for ever — so scaling these would make
 * them grow without limit, and a unique whose numbers depend on which raid
 * happened to drop it is a unique nobody can talk about.
 *
 * A deep unique sits at 110, where the third affix band unlocks.
 */
export const DEEP_ILVL = 110;

/**
 * Item level of a blank base, and the reason they are worth chasing.
 *
 * The fourth and final affix band unlocks at 118. Ordinary drops do not reach
 * that until Tier 35; a blank arrives at 120 from the Tier 26 raid onwards, so
 * for most of the deep game it is the only item in existence that can roll the
 * best version of anything.
 *
 * That is the whole bargain: they are as rare as a unique, they arrive with
 * nothing on them, and finishing one costs materials and several attempts —
 * in exchange, a well-crafted blank beats anything else you can find.
 */
export const BLANK_ILVL = 120;

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

/**
 * Waves in a run at this tier.
 *
 * Early dungeons are deliberately short. A full-length Tier 1 run took over a
 * minute of watching a log scroll, which is the worst possible pacing for the
 * first few expeditions a player ever sends. Runs reach their full advertised
 * length by around Tier 8, once there is enough else to be doing between them.
 */
export function wavesFor(dungeon, tier) {
  return Math.max(3, Math.min(dungeon.waves, 2 + Math.ceil(tier * 0.8)));
}

/** Roughly how long an expedition takes, used for the UI estimate only. */
export function expectedDuration(dungeon, tier) {
  return wavesFor(dungeon, tier) * (2.4 + tier * 0.05);
}
