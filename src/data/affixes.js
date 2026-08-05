// data/affixes.js — the explicit modifier pool.
//
// Each affix declares which item tags it can appear on, a weight for its
// relative drop frequency, and a ladder of tiers gated by item level. Tier 1
// is the *highest* ilvl entry (PoE convention), so `tierOf()` counts down.
//
// `apply(bag, values)` folds the rolled values into the flat stat bag that
// stats.js later turns into derived character stats.

/**
 * Tier table builder. Each row is [ilvl, name, lo, hi, (lo2, hi2)...] so a
 * two-value affix like "Adds # to # Fire Damage" declares both ranges inline.
 */
function T(...rows) {
  return rows.map(([ilvl, name, ...v]) => {
    const ranges = [];
    for (let i = 0; i < v.length; i += 2) ranges.push([v[i], v[i + 1]]);
    return { ilvl, name, ranges };
  });
}

// Tag groups reused across many affixes.
const ANY = ['weapon', 'armour', 'shield', 'jewellery', 'quiver'];
const GEAR = ['armour', 'shield', 'jewellery', 'quiver'];
const HYBRID_ATK = ['weapon', 'ring', 'amulet', 'gloves'];

export const AFFIXES = [
  // =========================== PREFIXES ==================================
  {
    id: 'flat_phys', group: 'PhysicalDamage', type: 'prefix', req: ['weapon'], weight: 100,
    text: (v) => `Adds ${v[0]} to ${v[1]} Physical Damage`,
    apply: (b, v) => { b.addPhysMin += v[0]; b.addPhysMax += v[1]; },
    tiers: T(
      [1, 'Glinting', 1, 2, 3, 4], [11, 'Burnished', 2, 4, 6, 8], [23, 'Polished', 4, 7, 10, 14],
      [35, 'Honed', 7, 11, 16, 22], [46, 'Gleaming', 11, 17, 25, 33], [58, 'Annealed', 16, 24, 36, 47],
      [68, 'Razor-sharp', 22, 33, 49, 64], [77, 'Tempered', 30, 44, 66, 86], [84, 'Flaring', 40, 58, 87, 113],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Rending', 52, 75, 113, 147], [99, 'Sundering', 68, 98, 147, 191], [110, 'Worldbreaking', 88, 127, 191, 248],
    ),
  },
  {
    id: 'inc_phys', group: 'LocalPhysicalDamagePercent', type: 'prefix', req: ['weapon'], weight: 100,
    text: (v) => `${v[0]}% increased Physical Damage`,
    apply: (b, v) => { b.localIncPhys += v[0]; },
    tiers: T(
      [1, 'Heavy', 15, 24], [11, 'Serrated', 25, 39], [23, 'Wicked', 40, 54], [35, 'Vicious', 55, 69],
      [46, 'Bloodthirsty', 70, 84], [60, 'Cruel', 85, 99], [73, 'Tyrannical', 100, 119], [83, 'Merciless', 120, 144],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Remorseless', 142, 170], [99, 'Annihilating', 167, 201], [110, 'Apocalyptic', 197, 237],
    ),
  },
  {
    id: 'flat_fire', group: 'FireDamage', type: 'prefix', req: HYBRID_ATK, weight: 85,
    text: (v) => `Adds ${v[0]} to ${v[1]} Fire Damage`,
    apply: (b, v) => { b.addFireMin += v[0]; b.addFireMax += v[1]; },
    tiers: T(
      [1, 'Heated', 1, 2, 3, 5], [12, 'Smouldering', 3, 5, 8, 11], [24, 'Smoking', 6, 9, 15, 20],
      [36, 'Burning', 10, 15, 25, 33], [48, 'Flaming', 16, 24, 40, 52], [60, 'Scorching', 24, 35, 58, 76],
      [72, 'Incinerating', 34, 50, 82, 107], [82, 'Blasting', 47, 68, 112, 146],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Immolating', 61, 88, 146, 190], [99, 'Cindering', 79, 115, 189, 247], [110, 'Sunfired', 103, 149, 246, 321],
    ),
  },
  {
    id: 'flat_cold', group: 'ColdDamage', type: 'prefix', req: HYBRID_ATK, weight: 85,
    text: (v) => `Adds ${v[0]} to ${v[1]} Cold Damage`,
    apply: (b, v) => { b.addColdMin += v[0]; b.addColdMax += v[1]; },
    tiers: T(
      [1, 'Frosted', 1, 2, 3, 4], [12, 'Chilled', 2, 4, 7, 9], [24, 'Icicle', 5, 8, 13, 17],
      [36, 'Glaciated', 9, 13, 22, 29], [48, 'Polar', 14, 21, 35, 46], [60, 'Entombing', 21, 31, 51, 66],
      [72, 'Blasting', 30, 44, 72, 94], [82, 'Hoarfrost', 41, 60, 98, 128],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Glaciating', 53, 78, 127, 166], [99, 'Permafrost', 69, 101, 166, 216], [110, 'Heartfrozen', 90, 132, 215, 281],
    ),
  },
  {
    id: 'flat_light', group: 'LightningDamage', type: 'prefix', req: HYBRID_ATK, weight: 85,
    text: (v) => `Adds ${v[0]} to ${v[1]} Lightning Damage`,
    apply: (b, v) => { b.addLightMin += v[0]; b.addLightMax += v[1]; },
    tiers: T(
      [1, 'Humming', 1, 1, 5, 7], [12, 'Buzzing', 1, 2, 12, 16], [24, 'Snapping', 1, 4, 23, 30],
      [36, 'Crackling', 2, 6, 38, 50], [48, 'Sparking', 3, 9, 60, 79], [60, 'Arcing', 4, 13, 87, 114],
      [72, 'Shocking', 6, 18, 123, 161], [82, 'Discharging', 8, 25, 168, 219],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Fulminating', 10, 32, 218, 285], [99, 'Thunderstruck', 14, 42, 284, 370], [110, 'Stormforged', 18, 55, 369, 481],
    ),
  },
  {
    id: 'flat_chaos', group: 'ChaosDamage', type: 'prefix', req: ['weapon', 'amulet'], weight: 30,
    text: (v) => `Adds ${v[0]} to ${v[1]} Chaos Damage`,
    apply: (b, v) => { b.addChaosMin += v[0]; b.addChaosMax += v[1]; },
    tiers: T(
      [20, 'Corrupting', 4, 6, 10, 14], [40, 'Defiling', 12, 18, 30, 39], [60, 'Malevolent', 26, 38, 63, 82],
      [75, 'Abyssal', 44, 64, 106, 138], [85, 'Void-touched', 62, 90, 149, 194],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Void-eaten', 81, 117, 194, 252], [99, 'Blightborn', 105, 152, 252, 328], [110, 'Entropic', 136, 198, 327, 426],
    ),
  },
  {
    id: 'life', group: 'IncreasedLife', type: 'prefix', req: GEAR, weight: 130,
    text: (v) => `+${v[0]} to maximum Life`,
    apply: (b, v) => { b.flatLife += v[0]; },
    tiers: T(
      [1, 'Hale', 10, 19], [11, 'Healthy', 20, 29], [22, 'Sanguine', 30, 39], [33, 'Stalwart', 40, 54],
      [44, 'Stout', 55, 69], [55, 'Robust', 70, 84], [66, 'Rotund', 85, 99], [75, 'Virile', 100, 119],
      [84, 'Athlete’s', 120, 149],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Titanic', 151, 188], [99, 'Leviathan', 191, 237], [110, 'Undying', 240, 298],
    ),
  },
  {
    id: 'es', group: 'EnergyShield', type: 'prefix', req: ['armour', 'shield', 'jewellery'], weight: 100,
    text: (v) => `+${v[0]} to maximum Energy Shield`,
    apply: (b, v) => { b.flatES += v[0]; },
    tiers: T(
      [1, 'Shining', 3, 8], [11, 'Glittering', 9, 15], [23, 'Glimmering', 16, 24], [35, 'Radiating', 25, 35],
      [47, 'Blazing', 36, 48], [59, 'Beaming', 49, 63], [70, 'Scintillating', 64, 82], [82, 'Incandescent', 83, 105],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Radiant', 106, 134], [99, 'Empyrean', 136, 172], [110, 'Astral', 174, 220],
    ),
  },
  {
    id: 'flat_armour', group: 'Armour', type: 'prefix', req: ['armour', 'shield'], weight: 90,
    text: (v) => `+${v[0]} to Armour`,
    apply: (b, v) => { b.flatArmour += v[0]; },
    tiers: T(
      [1, 'Rough', 8, 17], [11, 'Firm', 18, 33], [23, 'Sturdy', 34, 55], [35, 'Reinforced', 56, 85],
      [47, 'Fencing', 86, 125], [59, 'Girded', 126, 175], [70, 'Bastion', 176, 240], [82, 'Adamantine', 241, 330],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Bulwarked', 318, 436], [99, 'Impervious', 420, 575], [110, 'Unyielding', 554, 759],
    ),
  },
  {
    id: 'flat_evasion', group: 'Evasion', type: 'prefix', req: ['armour', 'shield'], weight: 90,
    text: (v) => `+${v[0]} to Evasion Rating`,
    apply: (b, v) => { b.flatEvasion += v[0]; },
    tiers: T(
      [1, 'Salamander', 9, 20], [11, 'Lizard', 21, 38], [23, 'Chameleon', 39, 64], [35, 'Kraken', 65, 98],
      [47, 'Urchin', 99, 144], [59, 'Wyrm', 145, 200], [70, 'Drake', 201, 275], [82, 'Basilisk', 276, 380],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Wraithlike', 364, 502], [99, 'Phantasmal', 481, 662], [110, 'Untouchable', 635, 874],
    ),
  },
  {
    id: 'inc_armour', group: 'DefencesPercent', type: 'prefix', req: ['armour', 'shield'], weight: 70,
    text: (v) => `${v[0]}% increased Armour`,
    apply: (b, v) => { b.localIncArmour += v[0]; },
    tiers: T([1, 'Boned', 10, 19], [18, 'Lacquered', 20, 29], [36, 'Plated', 30, 41], [54, 'Carapaced', 42, 55], [72, 'Encrusted', 56, 74],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Ironbound', 68, 90], [99, 'Fortified', 83, 110], [110, 'Immovable', 102, 134],),
  },
  {
    id: 'inc_evasion', group: 'DefencesPercent', type: 'prefix', req: ['armour', 'shield'], weight: 70,
    text: (v) => `${v[0]}% increased Evasion Rating`,
    apply: (b, v) => { b.localIncEvasion += v[0]; },
    tiers: T([1, 'Shadowed', 10, 19], [18, 'Blurred', 20, 29], [36, 'Ghostly', 30, 41], [54, 'Phased', 42, 55], [72, 'Vaporous', 56, 74],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Diaphanous', 68, 90], [99, 'Spectral', 83, 110], [110, 'Unseen', 102, 134],),
  },
  {
    id: 'inc_es_local', group: 'DefencesPercent', type: 'prefix', req: ['armour', 'shield'], weight: 70,
    text: (v) => `${v[0]}% increased Energy Shield`,
    apply: (b, v) => { b.localIncES += v[0]; },
    tiers: T([1, 'Warding', 10, 19], [18, 'Shielding', 20, 29], [36, 'Sealing', 30, 41], [54, 'Guarding', 42, 55], [72, 'Sanctified', 56, 74],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Hallowed', 68, 90], [99, 'Beatified', 83, 110], [110, 'Divine', 102, 134],),
  },
  {
    id: 'inc_ele_dmg', group: 'ElementalDamagePercent', type: 'prefix', req: ['weapon', 'ring', 'amulet'], weight: 65,
    text: (v) => `${v[0]}% increased Elemental Damage`,
    apply: (b, v) => { b.incEle += v[0]; },
    tiers: T([4, 'Catalysing', 5, 10], [20, 'Infusing', 11, 17], [40, 'Empowering', 18, 25], [60, 'Overpowering', 26, 34], [80, 'Cataclysmic', 35, 45],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Ruinous', 42, 54], [99, 'Calamitous', 50, 65], [110, 'Primordial', 60, 78],),
  },
  {
    id: 'inc_spell_dmg', group: 'SpellDamage', type: 'prefix', req: ['weapon', 'shield', 'amulet'], weight: 55,
    text: (v) => `${v[0]}% increased Damage`,
    apply: (b, v) => { b.incDamage += v[0]; },
    tiers: T([8, 'Apprentice’s', 8, 14], [25, 'Adept’s', 15, 22], [45, 'Master’s', 23, 31], [65, 'Archmage’s', 32, 42], [82, 'Transcendent', 43, 56],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'Eldritch', 52, 67], [99, 'Archmagical', 62, 81], [110, 'Godtouched', 74, 97],),
  },

  // =========================== SUFFIXES ==================================
  {
    id: 'res_fire', group: 'FireResistance', type: 'suffix', req: GEAR, weight: 110,
    text: (v) => `+${v[0]}% to Fire Resistance`,
    apply: (b, v) => { b.resFire += v[0]; },
    tiers: T([1, 'of the Whelpling', 6, 11], [12, 'of the Salamander', 12, 17], [24, 'of the Drake', 18, 23],
      [36, 'of the Kiln', 24, 29], [48, 'of the Furnace', 30, 35], [60, 'of the Volcano', 36, 41], [78, 'of the Magma', 42, 48],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Forge-heart', 46, 52], [99, 'of the Inferno', 50, 57], [110, 'of the Sun', 54, 62],),
  },
  {
    id: 'res_cold', group: 'ColdResistance', type: 'suffix', req: GEAR, weight: 110,
    text: (v) => `+${v[0]}% to Cold Resistance`,
    apply: (b, v) => { b.resCold += v[0]; },
    tiers: T([1, 'of the Inuit', 6, 11], [12, 'of the Seal', 12, 17], [24, 'of the Penguin', 18, 23],
      [36, 'of the Yeti', 24, 29], [48, 'of the Walrus', 30, 35], [60, 'of the Polar Bear', 36, 41], [78, 'of the Glacier', 42, 48],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Tundra', 46, 52], [99, 'of Deep Winter', 50, 57], [110, 'of Absolute Zero', 54, 62],),
  },
  {
    id: 'res_light', group: 'LightningResistance', type: 'suffix', req: GEAR, weight: 110,
    text: (v) => `+${v[0]}% to Lightning Resistance`,
    apply: (b, v) => { b.resLight += v[0]; },
    tiers: T([1, 'of the Cloud', 6, 11], [12, 'of the Squall', 12, 17], [24, 'of the Storm', 18, 23],
      [36, 'of the Thunderhead', 24, 29], [48, 'of the Tempest', 30, 35], [60, 'of the Maelstrom', 36, 41], [78, 'of the Skies', 42, 48],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Levinbolt', 46, 52], [99, 'of the Stormwall', 50, 57], [110, 'of the Firmament', 54, 62],),
  },
  {
    id: 'res_chaos', group: 'ChaosResistance', type: 'suffix', req: GEAR, weight: 45,
    text: (v) => `+${v[0]}% to Chaos Resistance`,
    apply: (b, v) => { b.resChaos += v[0]; },
    tiers: T([16, 'of the Lost', 5, 10], [36, 'of Banishment', 11, 16], [60, 'of Exile', 17, 23], [80, 'of the Abyss', 24, 30],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Nadir', 26, 33], [99, 'of Oblivion', 29, 36], [110, 'of the Outer Dark', 31, 39],),
  },
  {
    id: 'res_all', group: 'AllResistances', type: 'suffix', req: ['armour', 'shield', 'jewellery'], weight: 35,
    text: (v) => `+${v[0]}% to all Elemental Resistances`,
    apply: (b, v) => { b.resFire += v[0]; b.resCold += v[0]; b.resLight += v[0]; },
    tiers: T([24, 'of the Rainbow', 5, 8], [45, 'of Variegation', 9, 12], [65, 'of the Prism', 13, 16], [84, 'of the Spectrum', 17, 21],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Bulwark', 19, 23], [99, 'of the Aegis', 20, 25], [110, 'of Harmony', 22, 27],),
  },
  {
    id: 'atk_speed', group: 'AttackSpeed', type: 'suffix', req: ['weapon', 'gloves', 'quiver', 'ring'], weight: 80, dec: 0,
    text: (v) => `${v[0]}% increased Attack Speed`,
    apply: (b, v) => { b.incAtkSpeed += v[0]; },
    tiers: T([1, 'of Skill', 5, 8], [11, 'of Ease', 9, 12], [22, 'of Nimbleness', 13, 16],
      [37, 'of Swiftness', 17, 20], [55, 'of Alacrity', 21, 24], [72, 'of Fury', 25, 28], [84, 'of Celerity', 29, 34],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of Fleetness', 32, 38], [99, 'of Blurring', 36, 43], [110, 'of Quickening', 41, 48],),
  },
  {
    id: 'crit_chance', group: 'CriticalStrikeChance', type: 'suffix', req: ['weapon', 'amulet', 'quiver'], weight: 70,
    text: (v) => `${v[0]}% increased Critical Strike Chance`,
    apply: (b, v) => { b.incCrit += v[0]; },
    tiers: T([1, 'of Menace', 10, 19], [20, 'of Ire', 20, 34], [40, 'of Havoc', 35, 49],
      [60, 'of Calamity', 50, 69], [80, 'of Unmaking', 70, 95],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of Ruin', 87, 118], [99, 'of Butchery', 108, 146], [110, 'of the Executioner', 133, 181],),
  },
  {
    id: 'crit_multi', group: 'CriticalStrikeMultiplier', type: 'suffix', req: ['weapon', 'amulet', 'quiver', 'ring'], weight: 55,
    text: (v) => `+${v[0]}% to Critical Strike Multiplier`,
    apply: (b, v) => { b.critMulti += v[0]; },
    tiers: T([20, 'of Ferocity', 10, 14], [40, 'of Destruction', 15, 20], [60, 'of Demolishing', 21, 27], [82, 'of Annihilation', 28, 36],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of Obliteration', 32, 41], [99, 'of Devastation', 36, 47], [110, 'of Finality', 41, 53],),
  },
  {
    id: 'accuracy', group: 'Accuracy', type: 'suffix', req: ['weapon', 'gloves', 'quiver', 'ring', 'helmet'], weight: 75,
    text: (v) => `+${v[0]} to Accuracy Rating`,
    apply: (b, v) => { b.accuracy += v[0]; },
    tiers: T([1, 'of the Marksman', 20, 60], [15, 'of the Ranger', 61, 130], [30, 'of the Sniper', 131, 220],
      [50, 'of the Deadeye', 221, 350], [70, 'of Precision', 351, 520], [84, 'of the Assassin', 521, 720],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Sharpshooter', 677, 936], [99, 'of the Hawk', 880, 1217], [110, 'of Infallibility', 1145, 1582],),
  },
  {
    id: 'life_leech', group: 'LifeLeech', type: 'suffix', req: HYBRID_ATK, weight: 40, dec: 2,
    text: (v) => `${v[0]}% of Physical Attack Damage Leeched as Life`,
    apply: (b, v) => { b.lifeLeech += v[0]; },
    tiers: T([20, 'of the Leech', 0.2, 0.4], [40, 'of the Parasite', 0.41, 0.7], [60, 'of the Vampire', 0.71, 1.0], [80, 'of Sanguination', 1.01, 1.4],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of Exsanguination', 1.19, 1.65], [99, 'of the Leech-lord', 1.41, 1.95], [110, 'of the Crimson Feast', 1.66, 2.3],),
  },
  {
    id: 'life_regen', group: 'LifeRegeneration', type: 'suffix', req: GEAR, weight: 55, dec: 1,
    text: (v) => `Regenerate ${v[0]} Life per second`,
    apply: (b, v) => { b.lifeRegenFlat += v[0]; },
    tiers: T([1, 'of the Newt', 1, 3], [12, 'of the Lizard', 3.1, 7], [24, 'of the Cloud', 7.1, 14],
      [40, 'of the Bear', 14.1, 26], [60, 'of Rejuvenation', 26.1, 45], [80, 'of Regrowth', 45.1, 72],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of Renewal', 57.7, 92.2], [99, 'of Restoration', 73.9, 118.0], [110, 'of the Wellspring', 94.6, 151.0],),
  },
  {
    id: 'rarity', group: 'ItemFoundRarity', type: 'suffix', req: ['helmet', 'jewellery', 'quiver', 'gloves'], weight: 45,
    text: (v) => `${v[0]}% increased Rarity of Items found`,
    apply: (b, v) => { b.incRarity += v[0]; },
    tiers: T([1, 'of Plunder', 6, 12], [20, 'of Raiding', 13, 20], [40, 'of Archaeology', 21, 28],
      [62, 'of Excavation', 29, 36], [84, 'of Fortune', 37, 46],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of Windfall', 44, 55], [99, 'of Avarice', 53, 66], [110, 'of the Hoard', 64, 79],),
  },
  {
    id: 'pen_fire', group: 'FirePenetration', type: 'suffix', req: ['weapon', 'amulet', 'ring'], weight: 22,
    text: (v) => `Damage Penetrates ${v[0]}% Fire Resistance`,
    apply: (b, v) => { b.penFire += v[0]; },
    tiers: T([40, 'of Scalding', 4, 7], [68, 'of Immolation', 8, 11], [84, 'of the Pyre', 12, 15],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Crucible', 14, 17], [99, 'of Cinders', 15, 19], [110, 'of the Blazing Heart', 17, 22],),
  },
  {
    id: 'pen_cold', group: 'ColdPenetration', type: 'suffix', req: ['weapon', 'amulet', 'ring'], weight: 22,
    text: (v) => `Damage Penetrates ${v[0]}% Cold Resistance`,
    apply: (b, v) => { b.penCold += v[0]; },
    tiers: T([40, 'of Rime', 4, 7], [68, 'of Permafrost', 8, 11], [84, 'of the Void', 12, 15],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of Frostbite', 14, 17], [99, 'of the Shatter', 15, 19], [110, 'of the Frozen Heart', 17, 22],),
  },
  {
    id: 'pen_light', group: 'LightningPenetration', type: 'suffix', req: ['weapon', 'amulet', 'ring'], weight: 22,
    text: (v) => `Damage Penetrates ${v[0]}% Lightning Resistance`,
    apply: (b, v) => { b.penLight += v[0]; },
    tiers: T([40, 'of Static', 4, 7], [68, 'of Conduction', 8, 11], [84, 'of Thunder', 12, 15],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Storm', 14, 17], [99, 'of the Bolt', 15, 19], [110, 'of the Raging Heart', 17, 22],),
  },
  {
    id: 'inc_life_pct', group: 'MaximumLifePercent', type: 'suffix', req: ['armour', 'jewellery'], weight: 28,
    text: (v) => `${v[0]}% increased maximum Life`,
    apply: (b, v) => { b.incLife += v[0]; },
    tiers: T([30, 'of the Ox', 3, 5], [55, 'of the Mammoth', 6, 8], [80, 'of the Colossus', 9, 12],
      // Deep tiers: unlocked past Tier 20, where every other affix has
      // already reached its ceiling.
      [88, 'of the Behemoth', 10, 14], [99, 'of the Titan', 12, 16], [110, 'of the Worldbearer', 14, 19],),
  },
];

export const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** Tier number (1 = best) for a given tier index within an affix's ladder. */
export function tierNumber(def, tierIndex) { return def.tiers.length - tierIndex; }

/** Affixes legal on an item with `tags` at `ilvl`, optionally filtered by type. */
export function eligibleAffixes(tags, ilvl, type) {
  return AFFIXES.filter((a) => {
    if (type && a.type !== type) return false;
    if (!a.req.some((t) => tags.includes(t))) return false;
    return a.tiers[0].ilvl <= ilvl;
  });
}

/** All tiers of `def` available at `ilvl` (highest tier is weighted heaviest). */
export function availableTiers(def, ilvl) {
  const out = [];
  for (let i = 0; i < def.tiers.length; i++) {
    if (def.tiers[i].ilvl <= ilvl) out.push(i);
  }
  return out;
}
