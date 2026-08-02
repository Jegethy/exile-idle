// data/heroclasses.js — hero archetypes and rarity tiers.
//
// A hero's class fixes their role in a party and how their level translates
// into stats. Roles matter mechanically: tanks soak the attacks aimed at the
// party, healers restore allies between hits, damage classes do the killing.

/**
 * `mult` scales the level-derived base curve in stats.js.
 *   life/armour/evasion — survivability
 *   damage/aps          — offence
 *   heal                — healing per cast (0 for non-healers)
 *   threat              — share of incoming attacks drawn (tanks are high)
 */
export const HERO_CLASSES = [
  {
    id: 'guardian', name: 'Guardian', role: 'Tank', icon: 'shield',
    blurb: 'Stands at the front and refuses to move. Draws almost every attack away from the rest of the party.',
    mult: { life: 1.75, armour: 2.10, evasion: 0.45, damage: 0.55, aps: 0.90, heal: 0, threat: 6.0 },
    prefers: ['mace1h', 'sword1h', 'shield_str'],
  },
  {
    id: 'berserker', name: 'Berserker', role: 'Melee', icon: 'axe',
    blurb: 'Trades armour for reach and rage. The highest raw physical output in the guild.',
    mult: { life: 1.15, armour: 0.85, evasion: 0.55, damage: 1.40, aps: 1.05, heal: 0, threat: 1.4 },
    prefers: ['axe2h', 'sword2h', 'axe1h'],
  },
  {
    id: 'ranger', name: 'Ranger', role: 'Ranged', icon: 'bow',
    blurb: 'Fast, accurate and hard to pin down. Scales with attack speed and critical strikes.',
    mult: { life: 0.85, armour: 0.45, evasion: 1.80, damage: 1.15, aps: 1.30, heal: 0, threat: 0.9 },
    prefers: ['bow', 'quiver'],
  },
  {
    id: 'sorcerer', name: 'Sorcerer', role: 'Caster', icon: 'staff',
    blurb: 'Fragile, but converts elemental damage into obscene numbers given the right gear.',
    mult: { life: 0.72, armour: 0.35, evasion: 0.70, damage: 1.50, aps: 0.85, heal: 0, threat: 1.0 },
    prefers: ['staff', 'wand', 'shield_int'],
  },
  {
    id: 'cleric', name: 'Cleric', role: 'Healer', icon: 'chalice',
    blurb: 'Keeps the party standing. Heals the most wounded ally on every cast.',
    mult: { life: 1.05, armour: 0.90, evasion: 0.60, damage: 0.50, aps: 0.95, heal: 1.00, threat: 0.7 },
    prefers: ['mace1h', 'staff', 'shield_int'],
  },
  {
    id: 'rogue', name: 'Rogue', role: 'Melee', icon: 'dagger',
    blurb: 'Fights for the payout as much as the cause — expeditions with a Rogue return richer.',
    mult: { life: 0.88, armour: 0.50, evasion: 1.45, damage: 1.20, aps: 1.20, heal: 0, threat: 0.8 },
    prefers: ['dagger', 'sword1h'],
    perk: { rarity: 20, gold: 15 },
  },
];

export const CLASS_BY_ID = Object.fromEntries(HERO_CLASSES.map((c) => [c.id, c]));

/**
 * Hero rarity. Better heroes have stronger stats and more traits, and are the
 * main thing gold is spent chasing.
 */
export const HERO_RARITIES = [
  { id: 'common', name: 'Common', cls: 'h-common', mult: 1.00, traits: 1, weight: 520 },
  { id: 'uncommon', name: 'Uncommon', cls: 'h-uncommon', mult: 1.16, traits: 2, weight: 300 },
  { id: 'rare', name: 'Rare', cls: 'h-rare', mult: 1.34, traits: 3, weight: 130 },
  { id: 'epic', name: 'Epic', cls: 'h-epic', mult: 1.58, traits: 4, weight: 42 },
  { id: 'legendary', name: 'Legendary', cls: 'h-legendary', mult: 1.90, traits: 5, weight: 8 },
];

export const RARITY_BY_ID = Object.fromEntries(HERO_RARITIES.map((r) => [r.id, r]));

/** Roles used for party-composition hints. */
export const ROLES = ['Tank', 'Melee', 'Ranged', 'Caster', 'Healer'];

// ---------------------------------------------------------------------------
// Name generation
// ---------------------------------------------------------------------------

export const FIRST_NAMES = [
  'Aldric', 'Bryn', 'Cass', 'Dorn', 'Eira', 'Fenn', 'Gwyn', 'Hale', 'Isolde', 'Jorund',
  'Kesh', 'Lira', 'Maud', 'Nyle', 'Orla', 'Perrin', 'Quill', 'Roan', 'Sable', 'Tovin',
  'Ulla', 'Vex', 'Wren', 'Yarrow', 'Zeph', 'Corvin', 'Mira', 'Halden', 'Sorrel', 'Tam',
  'Edda', 'Garrick', 'Nesta', 'Oswin', 'Piety', 'Rook', 'Thane', 'Verity', 'Wulf', 'Ysolde',
];

export const EPITHETS = [
  'the Bold', 'the Quiet', 'Ironhand', 'Stormborn', 'the Patient', 'Ashfell', 'Greycloak',
  'the Unbroken', 'Nightwarden', 'of the Vale', 'Blackbriar', 'the Steadfast', 'Emberkin',
  'Coldwater', 'the Wayward', 'Thornwood', 'the Elder', 'Ninefingers', 'the Kind', 'Ravenshade',
];
