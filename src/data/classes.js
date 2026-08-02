// data/classes.js — character classes and their ascendancies.
//
// A class fixes three things: starting attributes, where you begin on the
// passive tree, and which three ascendancies you may later specialise into.
// Ascendancy nodes use the same stat-bag keys as passives, plus `flags`.

/**
 * `angle` is the class's start position on the passive tree, in SVG degrees
 * (y grows downward, so 270 is the top of the wheel). Scion sits at the centre.
 */
export const CLASSES = [
  {
    id: 'marauder', name: 'Marauder', attrs: { str: 32, dex: 14, int: 14 },
    angle: 150, primary: 'str',
    blurb: 'A mountain of muscle and scar tissue. Stacks life and armour, and hits like a collapsing building.',
    ascendancies: ['juggernaut', 'berserker', 'chieftain'],
  },
  {
    id: 'duelist', name: 'Duelist', attrs: { str: 23, dex: 23, int: 14 },
    angle: 90, primary: 'str',
    blurb: 'Equal parts brawler and swordsman. Trades between raw physical damage, attack speed and leech.',
    ascendancies: ['slayer', 'gladiator', 'champion'],
  },
  {
    id: 'ranger', name: 'Ranger', attrs: { str: 14, dex: 32, int: 14 },
    angle: 30, primary: 'dex',
    blurb: 'Fast, precise and impossible to pin down. Lives on evasion, attack speed and critical strikes.',
    ascendancies: ['deadeye', 'raider', 'pathfinder'],
  },
  {
    id: 'shadow', name: 'Shadow', attrs: { str: 14, dex: 23, int: 23 },
    angle: 330, primary: 'dex',
    blurb: 'A knife in the dark. Builds around critical multiplier, chaos damage and hybrid evasion/energy shield.',
    ascendancies: ['assassin', 'saboteur', 'trickster'],
  },
  {
    id: 'witch', name: 'Witch', attrs: { str: 14, dex: 14, int: 32 },
    angle: 270, primary: 'int',
    blurb: 'Wields the elements and the void behind them. The natural home of energy shield stacking.',
    ascendancies: ['necromancer', 'elementalist', 'occultist'],
  },
  {
    id: 'templar', name: 'Templar', attrs: { str: 23, dex: 14, int: 23 },
    angle: 210, primary: 'int',
    blurb: 'Faith expressed as force. Blends armour and energy shield with elemental damage and block.',
    ascendancies: ['inquisitor', 'hierophant', 'guardian'],
  },
  {
    id: 'scion', name: 'Scion', attrs: { str: 20, dex: 20, int: 20 },
    angle: null, primary: 'all',
    blurb: 'Exiled nobility, starting at the heart of the tree with access to every direction at once.',
    ascendancies: ['ascendant'],
  },
];

export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

/** The passive-tree node each class begins on. */
export function startNodeFor(classId) {
  return classId === 'scion' ? 'start_scion' : `start_${classId}`;
}

// ---------------------------------------------------------------------------
// Ascendancies
// ---------------------------------------------------------------------------

const n = (name, desc, stats, flags) => ({ name, desc, stats, flags });

export const ASCENDANCIES = {
  // ---- Marauder ----------------------------------------------------------
  juggernaut: {
    name: 'Juggernaut', class: 'marauder',
    blurb: 'An unstoppable wall. Converts armour and endurance into raw survivability.',
    nodes: [
      n('Unbreakable', null, { incArmour: 60, flatLife: 120 }),
      n('Unyielding', null, { incLife: 10, lifeRegenPct: 1.2 }),
      n('Unrelenting', null, { damageTaken: -8, maxRes: 2 }),
      n('Undeniable', 'Your hits cannot be Evaded', { incAtkSpeed: 12, incAccuracy: 40 }, { alwaysHit: true }),
    ],
  },
  berserker: {
    name: 'Berserker', class: 'marauder',
    blurb: 'Pure aggression. Enormous damage bought with the blood it costs you.',
    nodes: [
      n('Rite of Ruin', 'Take 10% increased Damage', { moreDamage: 20, damageTaken: 10 }),
      n('Aspect of Carnage', null, { moreDamage: 15, incAtkSpeed: 10 }),
      n('Blitz', null, { incAtkSpeed: 18, incCrit: 40 }),
      n('Flawless Savagery', null, { critMulti: 30, lifeLeech: 0.6 }),
    ],
  },
  chieftain: {
    name: 'Chieftain', class: 'marauder',
    blurb: 'Ancestral fire. Everything you touch burns, and the flames sustain you.',
    nodes: [
      n('Hinekora, Death\'s Fury', null, { incFire: 50, penFire: 6 }),
      n('Tasalio, Cleansing Water', null, { resFire: 20, lifeRegenPct: 1.0 }),
      n('Arohongui, Moon\'s Presence', null, { incEle: 30, incLife: 8 }),
      n('Ngamahu, Flame\'s Advance', null, { incFire: 40, incPhys: 30 }),
    ],
  },

  // ---- Duelist -----------------------------------------------------------
  slayer: {
    name: 'Slayer', class: 'duelist',
    blurb: 'Overwhelming force with the leech to sustain it indefinitely.',
    nodes: [
      n('Endless Hunger', null, { lifeLeech: 1.0, incLife: 6 }),
      n('Brutal Fervour', null, { moreDamage: 12, lifeLeech: 0.5 }),
      n('Headsman', null, { incPhys: 45, incAtkSpeed: 8 }),
      n('Impact', null, { incDamage: 30, critMulti: 20 }),
    ],
  },
  gladiator: {
    name: 'Gladiator', class: 'duelist',
    blurb: 'Fights behind a shield wall, turning blocked hits into openings.',
    nodes: [
      n('Violent Retaliation', null, { block: 12, incPhys: 35 }),
      n('Painforged', null, { damageTaken: -6, incArmour: 40 }),
      n('Gratuitous Violence', null, { incDamage: 25, reflect: 10 }),
      n('Versatile Combatant', null, { block: 10, incAtkSpeed: 10, flatLife: 100 }),
    ],
  },
  champion: {
    name: 'Champion', class: 'duelist',
    blurb: 'A disciplined front-liner: accurate, armoured, and impossible to shake.',
    nodes: [
      n('Unstoppable Hero', null, { incAccuracy: 60, moveSpeed: 12 }),
      n('Fortitude', null, { damageTaken: -10, flatLife: 140 }),
      n('Inspirational', null, { incDamage: 25, incEle: 25 }),
      n('Conqueror', null, { incArmour: 50, maxRes: 2 }),
    ],
  },

  // ---- Ranger ------------------------------------------------------------
  deadeye: {
    name: 'Deadeye', class: 'ranger',
    blurb: 'Every shot lands, and every shot hurts more than the last.',
    nodes: [
      n('Gathering Winds', null, { incAtkSpeed: 15, moveSpeed: 10 }),
      n('Far Shot', null, { incDamage: 35, incAccuracy: 50 }),
      n('Ricochet', null, { incCrit: 60, critMulti: 15 }),
      n('Endless Munitions', null, { moreDamage: 12, incEle: 25 }),
    ],
  },
  raider: {
    name: 'Raider', class: 'ranger',
    blurb: 'Speed as a defensive layer. Nothing that cannot catch you can kill you.',
    nodes: [
      n('Way of the Poacher', null, { incAtkSpeed: 20, incEvasion: 40 }),
      n('Avatar of the Slaughter', null, { incDamage: 30, incAtkSpeed: 10 }),
      n('Avatar of the Chase', null, { moveSpeed: 20, incEvasion: 50 }),
      n('Quartz Infusion', null, { moreEvasion: 20, maxRes: 1 }),
    ],
  },
  pathfinder: {
    name: 'Pathfinder', class: 'ranger',
    blurb: 'A toxicologist. Elemental and chaos damage bleed through every defence.',
    nodes: [
      n('Nature\'s Boon', null, { resFire: 15, resCold: 15, resLight: 15 }),
      n('Master Toxicist', null, { incChaos: 60, resChaos: 20 }),
      n('Nature\'s Adrenaline', null, { incAtkSpeed: 12, moveSpeed: 12, incEle: 25 }),
      n('Master Surgeon', null, { lifeRegenPct: 1.5, incLife: 6 }),
    ],
  },

  // ---- Shadow ------------------------------------------------------------
  assassin: {
    name: 'Assassin', class: 'shadow',
    blurb: 'Critical strikes as a whole build. Multiplies the top end of every hit.',
    nodes: [
      n('Unstable Infusion', null, { incCrit: 80 }),
      n('Deadly Infusion', null, { critMulti: 35 }),
      n('Ambush', null, { incCrit: 50, critMulti: 20 }),
      n('Noxious Strike', null, { incChaos: 50, lifeLeech: 0.4 }),
    ],
  },
  saboteur: {
    name: 'Saboteur', class: 'shadow',
    blurb: 'Elemental demolitions, delivered from somewhere you are not.',
    nodes: [
      n('Perfect Crime', null, { incEle: 45, incDamage: 20 }),
      n('Chain Reaction', null, { incAtkSpeed: 15, incCrit: 40 }),
      n('Explosives Expert', null, { penFire: 5, penCold: 5, penLight: 5 }),
      n('Born in the Shadows', null, { incEvasion: 50, damageTaken: -6 }),
    ],
  },
  trickster: {
    name: 'Trickster', class: 'shadow',
    blurb: 'Hybrid evasion and energy shield, recovering faster than anything can remove it.',
    nodes: [
      n('Patient Reaper', null, { incES: 40, lifeLeech: 0.5 }),
      n('Swift Killer', null, { incAtkSpeed: 16, incEvasion: 35 }),
      n('Ghost Dance', null, { esRecharge: 60, incEvasion: 40 }),
      n('Weave the Arcane', null, { incDamage: 30, incES: 30 }),
    ],
  },

  // ---- Witch -------------------------------------------------------------
  necromancer: {
    name: 'Necromancer', class: 'witch',
    blurb: 'Draws power from the dead. Deep energy shield backed by chaos damage.',
    nodes: [
      n('Essence Glutton', null, { incES: 50, esRecharge: 40 }),
      n('Bone Barrier', null, { incES: 35, damageTaken: -7 }),
      n('Plaguebringer', null, { incChaos: 70, resChaos: 20 }),
      n('Commander of Darkness', null, { incDamage: 30, resFire: 15, resCold: 15, resLight: 15 }),
    ],
  },
  elementalist: {
    name: 'Elementalist', class: 'witch',
    blurb: 'Master of all three elements, and of getting past resistances entirely.',
    nodes: [
      n('Shaper of Storms', null, { incLight: 60, penLight: 6 }),
      n('Shaper of Flames', null, { incFire: 60, penFire: 6 }),
      n('Shaper of Winter', null, { incCold: 60, penCold: 6 }),
      n('Mastermind of Discord', null, { moreEle: 20, incEle: 30 }),
    ],
  },
  occultist: {
    name: 'Occultist', class: 'witch',
    blurb: 'Curses and corrosion. Strips resistances and feeds on what remains.',
    nodes: [
      n('Profane Bloom', null, { incChaos: 60, incDamage: 20 }),
      n('Void Beacon', 'Enemies have 15% reduced Elemental Resistance', { penFire: 5, penCold: 5, penLight: 5 }, { curseRes: 15 }),
      n('Frigid Wake', null, { incES: 45, resCold: 20 }),
      n('Forbidden Power', null, { incES: 35, incDamage: 25, resChaos: 25 }),
    ],
  },

  // ---- Templar -----------------------------------------------------------
  inquisitor: {
    name: 'Inquisitor', class: 'templar',
    blurb: 'Elemental damage that simply ignores the resistances in front of it.',
    nodes: [
      n('Righteous Providence', null, { incCrit: 60, incEle: 30 }),
      n('Inevitable Judgement', 'Enemies have 25% reduced Elemental Resistance', {}, { curseRes: 25 }),
      n('Instruments of Virtue', null, { incDamage: 35, incAtkSpeed: 10 }),
      n('Sanctuary', null, { incArmour: 45, incES: 30 }),
    ],
  },
  hierophant: {
    name: 'Hierophant', class: 'templar',
    blurb: 'Channels mana and conviction into an enormous defensive buffer.',
    nodes: [
      n('Pursuit of Faith', null, { incES: 45, incMana: 40 }),
      n('Divine Guidance', null, { incES: 35, incDamage: 25 }),
      n('Illuminated Devotion', null, { incEle: 40, flatLife: 100 }),
      n('Conviction of Power', null, { maxRes: 2, incDamage: 20 }),
    ],
  },
  guardian: {
    name: 'Guardian', class: 'templar',
    blurb: 'The immovable object. Maximum resistances, block and armour.',
    nodes: [
      n('Radiant Faith', null, { incES: 50, incArmour: 40 }),
      n('Unwavering Faith', null, { lifeRegenPct: 1.4, damageTaken: -8 }),
      n('Harmony of Purpose', null, { maxRes: 3 }),
      n('Bastion of Hope', null, { block: 15, flatLife: 120 }),
    ],
  },

  // ---- Scion -------------------------------------------------------------
  ascendant: {
    name: 'Ascendant', class: 'scion',
    blurb: 'A little of everything — the generalist\'s answer to specialisation.',
    nodes: [
      n('Path of the Warrior', null, { incPhys: 35, flatLife: 90, incArmour: 30 }),
      n('Path of the Hunter', null, { incAtkSpeed: 12, incEvasion: 40, incCrit: 40 }),
      n('Path of the Savant', null, { incES: 40, incEle: 35, incDamage: 15 }),
      n('Path of the Exile', null, { str: 20, dex: 20, int: 20, maxRes: 1, moveSpeed: 8 }),
    ],
  },
};

/** Ascendancy ids available to a class. */
export function ascendanciesFor(classId) {
  return (CLASS_BY_ID[classId]?.ascendancies ?? []).map((id) => ({ id, ...ASCENDANCIES[id] }));
}

/** Level at which the ascendancy choice unlocks. */
export const ASCENDANCY_UNLOCK_LEVEL = 20;

/** Levels that each grant an ascendancy point. */
export const ASCENDANCY_POINT_LEVELS = [20, 40, 60, 80];

export function ascendancyPointsFor(level) {
  return ASCENDANCY_POINT_LEVELS.filter((l) => level >= l).length * 2;
}
