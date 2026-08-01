// data/mapmods.js — explicit modifiers rolled onto map items.
//
// Every mod makes the map harder AND more rewarding: `quant`/`rarity` are the
// payoff for whatever danger the mod introduces. Rolling a scary map is the
// core risk/reward decision of the endgame loop.

/**
 * `apply(mm)` folds into the map-modifier accumulator consumed by combat.js:
 *   mLife/mDmg/mAps/mCrit  - monster multipliers (percent)
 *   mRes                   - flat monster elemental resistance
 *   extraX                 - fraction of monster hit added as element X
 *   pMaxRes                - player maximum resistance delta
 *   pLessRegen/pLessLeech  - percent reduction to player recovery
 *   pLessArmour/pLessEvade - percent reduction to player defences
 *   quant/rarity/packSize  - reward and monster-count multipliers (percent)
 */
export const MAP_MODS = [
  // ---- Prefixes (mostly monster power) ------------------------------------
  {
    id: 'monster_life', type: 'prefix', tier: 1, weight: 100,
    r: [25, 60], text: (v) => `Monsters have ${v}% increased maximum Life`,
    apply: (mm, v) => { mm.mLife += v; mm.quant += Math.round(v * 0.30); mm.rarity += Math.round(v * 0.20); },
  },
  {
    id: 'monster_damage', type: 'prefix', tier: 1, weight: 100,
    r: [20, 45], text: (v) => `Monsters deal ${v}% increased Damage`,
    apply: (mm, v) => { mm.mDmg += v; mm.quant += Math.round(v * 0.35); mm.rarity += Math.round(v * 0.25); },
  },
  {
    id: 'monster_speed', type: 'prefix', tier: 1, weight: 90,
    r: [15, 35], text: (v) => `Monsters have ${v}% increased Attack Speed`,
    apply: (mm, v) => { mm.mAps += v; mm.quant += Math.round(v * 0.40); mm.rarity += Math.round(v * 0.25); },
  },
  {
    id: 'pack_size', type: 'prefix', tier: 1, weight: 80,
    r: [15, 40], text: (v) => `${v}% increased Monster pack size`,
    apply: (mm, v) => { mm.packSize += v; mm.quant += Math.round(v * 0.55); },
  },
  {
    id: 'extra_fire', type: 'prefix', tier: 2, weight: 70,
    r: [30, 70], text: (v) => `Monsters deal ${v}% extra Physical Damage as Fire`,
    apply: (mm, v) => { mm.extraFire += v / 100; mm.quant += Math.round(v * 0.30); mm.rarity += Math.round(v * 0.20); },
  },
  {
    id: 'extra_cold', type: 'prefix', tier: 2, weight: 70,
    r: [30, 70], text: (v) => `Monsters deal ${v}% extra Physical Damage as Cold`,
    apply: (mm, v) => { mm.extraCold += v / 100; mm.quant += Math.round(v * 0.30); mm.rarity += Math.round(v * 0.20); },
  },
  {
    id: 'extra_light', type: 'prefix', tier: 2, weight: 70,
    r: [30, 70], text: (v) => `Monsters deal ${v}% extra Physical Damage as Lightning`,
    apply: (mm, v) => { mm.extraLight += v / 100; mm.quant += Math.round(v * 0.30); mm.rarity += Math.round(v * 0.20); },
  },
  {
    id: 'extra_chaos', type: 'prefix', tier: 5, weight: 45,
    r: [25, 55], text: (v) => `Monsters deal ${v}% extra Physical Damage as Chaos`,
    apply: (mm, v) => { mm.extraChaos += v / 100; mm.quant += Math.round(v * 0.45); mm.rarity += Math.round(v * 0.30); },
  },
  {
    id: 'monster_crit', type: 'prefix', tier: 3, weight: 60,
    r: [60, 140], text: (v) => `Monsters have ${v}% increased Critical Strike Chance`,
    apply: (mm, v) => { mm.mCrit += v; mm.quant += Math.round(v * 0.14); mm.rarity += Math.round(v * 0.10); },
  },
  {
    id: 'monster_armour', type: 'prefix', tier: 2, weight: 55,
    r: [40, 90], text: (v) => `Monsters have ${v}% increased Armour and Evasion`,
    apply: (mm, v) => { mm.mArmour += v; mm.mEvasion += v; mm.quant += Math.round(v * 0.20); },
  },
  {
    id: 'monster_res', type: 'prefix', tier: 4, weight: 50,
    r: [15, 35], text: (v) => `Monsters have +${v}% to all Elemental Resistances`,
    apply: (mm, v) => { mm.mRes += v; mm.quant += Math.round(v * 0.55); mm.rarity += Math.round(v * 0.35); },
  },

  // ---- Suffixes (mostly player restrictions) ------------------------------
  {
    id: 'player_maxres', type: 'suffix', tier: 3, weight: 70,
    r: [5, 12], text: (v) => `Players have -${v}% to maximum Resistances`,
    apply: (mm, v) => { mm.pMaxRes -= v; mm.quant += Math.round(v * 2.6); mm.rarity += Math.round(v * 1.8); },
  },
  {
    id: 'player_less_regen', type: 'suffix', tier: 2, weight: 70,
    r: [40, 70], text: (v) => `Players have ${v}% less Life Regeneration`,
    apply: (mm, v) => { mm.pLessRegen += v; mm.quant += Math.round(v * 0.22); mm.rarity += Math.round(v * 0.16); },
  },
  {
    id: 'player_less_leech', type: 'suffix', tier: 3, weight: 60,
    r: [40, 70], text: (v) => `Players have ${v}% less Life Leech`,
    apply: (mm, v) => { mm.pLessLeech += v; mm.quant += Math.round(v * 0.22); mm.rarity += Math.round(v * 0.16); },
  },
  {
    id: 'player_less_armour', type: 'suffix', tier: 2, weight: 65,
    r: [30, 60], text: (v) => `Players have ${v}% less Armour`,
    apply: (mm, v) => { mm.pLessArmour += v; mm.quant += Math.round(v * 0.28); mm.rarity += Math.round(v * 0.18); },
  },
  {
    id: 'player_less_evade', type: 'suffix', tier: 2, weight: 65,
    r: [30, 60], text: (v) => `Players have ${v}% less Evasion Rating`,
    apply: (mm, v) => { mm.pLessEvade += v; mm.quant += Math.round(v * 0.28); mm.rarity += Math.round(v * 0.18); },
  },
  {
    id: 'player_less_es', type: 'suffix', tier: 4, weight: 50,
    r: [30, 60], text: (v) => `Players have ${v}% less Energy Shield`,
    apply: (mm, v) => { mm.pLessES += v; mm.quant += Math.round(v * 0.30); mm.rarity += Math.round(v * 0.20); },
  },
  {
    id: 'no_recharge', type: 'suffix', tier: 6, weight: 35,
    r: [0, 0], text: () => 'Players cannot Recharge Energy Shield',
    apply: (mm) => { mm.pNoRecharge = 1; mm.quant += 22; mm.rarity += 15; },
  },
  {
    id: 'player_damage_taken', type: 'suffix', tier: 5, weight: 40,
    r: [10, 25], text: (v) => `Players take ${v}% increased Damage`,
    apply: (mm, v) => { mm.pDamageTaken += v; mm.quant += Math.round(v * 1.5); mm.rarity += Math.round(v * 1.0); },
  },

  // ---- Pure reward mods (the carrot) --------------------------------------
  {
    id: 'quantity', type: 'suffix', tier: 1, weight: 55,
    r: [12, 30], text: (v) => `${v}% increased Quantity of Items found`,
    apply: (mm, v) => { mm.quant += v; },
  },
  {
    id: 'rarity_mod', type: 'suffix', tier: 1, weight: 55,
    r: [15, 40], text: (v) => `${v}% increased Rarity of Items found`,
    apply: (mm, v) => { mm.rarity += v; },
  },
  {
    id: 'more_currency', type: 'suffix', tier: 4, weight: 30,
    r: [20, 45], text: (v) => `${v}% increased Currency drop chance`,
    apply: (mm, v) => { mm.currency += v; mm.quant += Math.round(v * 0.2); },
  },
  {
    id: 'more_xp', type: 'prefix', tier: 3, weight: 35,
    r: [15, 35], text: (v) => `${v}% increased Experience gain`,
    apply: (mm, v) => { mm.xp += v; },
  },
];

export const MAP_MOD_BY_ID = Object.fromEntries(MAP_MODS.map((m) => [m.id, m]));

/** Map mods legal at the given map tier. */
export function eligibleMapMods(tier, type) {
  return MAP_MODS.filter((m) => m.tier <= tier && (!type || m.type === type));
}

/** Fresh, zeroed map-modifier accumulator. */
export function newMapMods() {
  return {
    mLife: 0, mDmg: 0, mAps: 0, mCrit: 0, mRes: 0, mArmour: 0, mEvasion: 0,
    extraFire: 0, extraCold: 0, extraLight: 0, extraChaos: 0,
    pMaxRes: 0, pLessRegen: 0, pLessLeech: 0, pLessArmour: 0, pLessEvade: 0,
    pLessES: 0, pNoRecharge: 0, pDamageTaken: 0,
    quant: 0, rarity: 0, packSize: 0, currency: 0, xp: 0,
  };
}

/** Map name pools, indexed loosely by tier band for flavour. */
export const MAP_NAMES = [
  'Dunes', 'Crypt', 'Arcade', 'Grotto', 'Tropical Island', 'Dry Sea', 'Ashen Wood',
  'Burial Chambers', 'Cage', 'Cells', 'Channel', 'Colonnade', 'Coral Ruins', 'Courtyard',
  'Crater', 'Dark Forest', 'Defiled Cathedral', 'Desert Spring', 'Dig', 'Excavation',
  'Factory', 'Gardens', 'Ghetto', 'Glacier', 'Haunted Mansion', 'Iceberg', 'Infested Valley',
  'Jungle Valley', 'Laboratory', 'Lava Chamber', 'Lighthouse', 'Malformation', 'Marshes',
  'Mausoleum', 'Mesa', 'Mineral Pools', 'Necropolis', 'Orchard', 'Overgrown Shrine',
  'Palace', 'Park', 'Phantasmagoria', 'Pit', 'Plateau', 'Precinct', 'Primordial Pool',
  'Racecourse', 'Ramparts', 'Reef', 'Residence', 'Sepulchre', 'Shipyard', 'Shrine',
  'Spider Forest', 'Strand', 'Sulphur Vents', 'Temple', 'Terrace', 'Thicket', 'Tower',
  'Toxic Sewer', 'Underground River', 'Vaal Pyramid', 'Vault', 'Villa', 'Volcano', 'Wasteland',
];
