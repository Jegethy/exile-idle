// data/uniques.js — hand-crafted unique items.
//
// Uniques keep a fixed mod list with rolled ranges, so two copies of the same
// unique still differ. `lvl` gates them out of low-tier drop pools.

const m = (r, text, apply, dec = 0) => ({ r, text, apply, dec });

export const UNIQUES = [
  // --- Low-level uniques, so Tier 1-3 maps can still drop one -------------
  {
    id: 'rustblade', name: 'The Rusted Oath', base: 'sword1h', lvl: 1, weight: 110,
    flavour: 'It was sworn on a better blade than this.',
    mods: [
      m([30, 50], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([4, 8], (v) => `+${v} to Strength`, (b, v) => { b.str += v; }),
      m([10, 18], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
    ],
  },
  {
    id: 'driftwoodcharm', name: 'Castaway\'s Charm', base: 'amulet', lvl: 1, weight: 105,
    flavour: 'Carved on the voyage over. It is all he kept.',
    mods: [
      m([8, 14], (v) => `+${v}% to all Elemental Resistances`, (b, v) => { b.resFire += v; b.resCold += v; b.resLight += v; }),
      m([12, 22], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([10, 18], (v) => `${v}% increased Rarity of Items found`, (b, v) => { b.incRarity += v; }),
    ],
  },
  {
    id: 'shorewalkers', name: 'Shorewalkers', base: 'boot_ev', lvl: 3, weight: 100,
    flavour: 'The sand remembers every exile who made it inland.',
    mods: [
      m([15, 20], (v) => `${v}% increased Movement Speed`, (b, v) => { b.moveSpeed += v; }),
      m([20, 40], (v) => `+${v} to Evasion Rating`, (b, v) => { b.flatEvasion += v; }),
      m([1, 3], (v) => `Regenerate ${v} Life per second`, (b, v) => { b.lifeRegenFlat += v; }, 1),
    ],
  },
  {
    id: 'bramblejack', name: 'Bramblejack', base: 'body_ar', lvl: 8, weight: 100,
    flavour: 'The pain of the thorn is the price of the rose.',
    mods: [
      m([80, 120], (v) => `${v}% increased Armour`, (b, v) => { b.localIncArmour += v; }),
      m([20, 30], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([8, 14], (v) => `Reflects ${v}% of Damage taken to Attacker`, (b, v) => { b.reflect += v; }),
    ],
  },
  {
    id: 'goldrim', name: 'Goldrim', base: 'helm_ev', lvl: 10, weight: 90,
    flavour: 'The dying light reflects in the gold of a fallen king.',
    mods: [
      m([30, 40], (v) => `+${v}% to all Elemental Resistances`, (b, v) => { b.resFire += v; b.resCold += v; b.resLight += v; }),
      m([60, 80], (v) => `+${v} to Evasion Rating`, (b, v) => { b.flatEvasion += v; }),
      m([20, 30], (v) => `${v}% increased Rarity of Items found`, (b, v) => { b.incRarity += v; }),
    ],
  },
  {
    id: 'wanderlust', name: 'Wanderlust', base: 'boot_es', lvl: 12, weight: 90,
    flavour: 'Wander far enough and you will find yourself.',
    mods: [
      m([20, 25], (v) => `${v}% increased Movement Speed`, (b, v) => { b.moveSpeed += v; }),
      m([5, 10], (v) => `+${v} to Dexterity`, (b, v) => { b.dex += v; }),
      m([20, 30], (v) => `+${v} to maximum Mana`, (b, v) => { b.flatMana += v; }),
    ],
  },
  {
    id: 'tabula', name: 'Tabula Rasa', base: 'body_es', lvl: 15, weight: 40,
    flavour: 'An unwritten page holds the most potential.',
    mods: [
      m([25, 40], (v) => `${v}% increased Damage`, (b, v) => { b.incDamage += v; }),
      m([15, 25], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
      m([0, 0], () => 'You take 20% increased Damage', (b) => { b.damageTaken += 20; }),
    ],
  },
  {
    id: 'lifesprig', name: 'Lifesprig', base: 'wand', lvl: 18, weight: 85,
    flavour: 'A twig of the world tree, still green.',
    mods: [
      m([20, 30], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([25, 40], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([3, 6], (v) => `Regenerate ${v} Life per second`, (b, v) => { b.lifeRegenFlat += v; }, 1),
    ],
  },
  {
    id: 'karui_ward', name: 'Karui Ward', base: 'amulet', lvl: 22, weight: 80,
    flavour: 'The Karui do not fear death. They outrun it.',
    mods: [
      m([10, 15], (v) => `${v}% increased Movement Speed`, (b, v) => { b.moveSpeed += v; }),
      m([20, 30], (v) => `+${v} to Strength`, (b, v) => { b.str += v; }),
      m([80, 140], (v) => `+${v} to Accuracy Rating`, (b, v) => { b.accuracy += v; }),
    ],
  },
  {
    id: 'bloodseeker', name: 'Bloodseeker', base: 'dagger', lvl: 30, weight: 70,
    flavour: 'Every wound it opens, it drinks from.',
    mods: [
      m([60, 90], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([1.5, 2.5], (v) => `${v}% of Physical Attack Damage Leeched as Life`, (b, v) => { b.lifeLeech += v; }, 2),
      m([10, 18], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
    ],
  },
  {
    id: 'kaoms_heart', name: "Kaom's Heart", base: 'body_ar', lvl: 45, weight: 45,
    flavour: 'Kaom fed his rage until nothing else remained.',
    mods: [
      m([450, 650], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([25, 40], (v) => `${v}% increased Fire Damage`, (b, v) => { b.incFire += v; }),
      m([0, 0], () => 'Your Energy Shield is set to 0', (b) => { b.noES = 1; }),
    ],
  },
  {
    id: 'shavronnes', name: "Shavronne's Wrappings", base: 'body_es', lvl: 50, weight: 40,
    flavour: 'Handle with the care you would give a viper.',
    mods: [
      m([120, 180], (v) => `${v}% increased Energy Shield`, (b, v) => { b.localIncES += v; }),
      m([25, 35], (v) => `+${v}% to Lightning Resistance`, (b, v) => { b.resLight += v; }),
      m([20, 30], (v) => `+${v}% to Chaos Resistance`, (b, v) => { b.resChaos += v; }),
    ],
  },
  {
    id: 'facebreaker', name: 'Facebreaker', base: 'glove_ar', lvl: 52, weight: 55,
    flavour: 'Bare knuckles, bared teeth.',
    mods: [
      m([600, 900], (v) => `${v}% increased Physical Damage`, (b, v) => { b.incPhys += v; }),
      m([0, 0], () => 'Deal no Elemental Damage', (b) => { b.noEle = 1; }),
      m([10, 20], (v) => `+${v} to Strength`, (b, v) => { b.str += v; }),
    ],
  },
  {
    id: 'atziris', name: "Atziri's Disfavour", base: 'axe2h', lvl: 60, weight: 35,
    flavour: 'Her favour was fleeting. Her disfavour, eternal.',
    mods: [
      m([130, 180], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([20, 30], (v) => `+${v}% to Critical Strike Multiplier`, (b, v) => { b.critMulti += v; }),
      m([30, 50], (v) => `Adds ${Math.round(v * 0.6)} to ${v} Physical Damage`, (b, v) => { b.addPhysMin += Math.round(v * 0.6); b.addPhysMax += v; }),
    ],
  },
  {
    id: 'headhunter', name: 'Headhunter', base: 'amulet', lvl: 68, weight: 12,
    flavour: 'The trophies of a hundred hunts, worn as one.',
    mods: [
      m([40, 55], (v) => `+${v} to Strength`, (b, v) => { b.str += v; }),
      m([40, 55], (v) => `+${v} to Dexterity`, (b, v) => { b.dex += v; }),
      m([30, 50], (v) => `${v}% increased Damage per Rare Monster killed (capped)`, (b, v) => { b.headhunter += v; }),
      m([25, 40], (v) => `${v}% increased Rarity of Items found`, (b, v) => { b.incRarity += v; }),
    ],
  },
  {
    id: 'voidheart', name: 'Voidheart', base: 'ring', lvl: 64, weight: 45,
    flavour: 'A hollow where a heart should be.',
    mods: [
      m([25, 40], (v) => `Adds ${Math.round(v * 0.5)} to ${v} Chaos Damage`, (b, v) => { b.addChaosMin += Math.round(v * 0.5); b.addChaosMax += v; }),
      m([15, 25], (v) => `+${v}% to Chaos Resistance`, (b, v) => { b.resChaos += v; }),
      m([8, 12], (v) => `Damage Penetrates ${v}% Fire Resistance`, (b, v) => { b.penFire += v; }),
    ],
  },
  {
    id: 'mageblood', name: 'Mageblood', base: 'ring', lvl: 78, weight: 8,
    flavour: 'The blood of an archmage runs thicker than gold.',
    mods: [
      m([12, 18], (v) => `+${v}% to all Elemental Resistances`, (b, v) => { b.resFire += v; b.resCold += v; b.resLight += v; }),
      m([30, 45], (v) => `${v}% increased Elemental Damage`, (b, v) => { b.incEle += v; }),
      m([5, 8], (v) => `Damage Penetrates ${v}% of all Elemental Resistances`, (b, v) => { b.penFire += v; b.penCold += v; b.penLight += v; }),
      m([60, 100], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
    ],
  },
  {
    id: 'starforge', name: 'Starforge', base: 'sword2h', lvl: 80, weight: 10,
    flavour: 'Forged in the heart of a dying star.',
    mods: [
      m([200, 280], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([25, 40], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
      m([40, 60], (v) => `+${v}% to Critical Strike Multiplier`, (b, v) => { b.critMulti += v; }),
      m([0, 0], () => 'Deal no Elemental Damage', (b) => { b.noEle = 1; }),
    ],
  },
  {
    // Deliberately statless. Its whole argument is that it blocks both kinds of
    // hit at the cap a dedicated shield only reaches for one of them — the
    // price is every point of armour, evasion and energy shield a shield in
    // that slot would otherwise have given.
    id: 'bulwark', name: 'The Bulwark', base: 'shield_str', lvl: 20, weight: 30,
    flavour: 'No blade, no word. Nothing gets past.',
    noBaseStats: true,
    mods: [
      m([30, 30], (v) => `${v}% Chance to Block Melee`, (b, v) => { b.blockMelee += v; }),
      m([30, 30], (v) => `${v}% Chance to Block Spells`, (b, v) => { b.blockSpell += v; }),
      m([0, 0], () => 'Grants no Armour, Evasion or Energy Shield', () => {}),
    ],
  },
  {
    id: 'aegis', name: 'Aegis Aurora', base: 'shield_int', lvl: 72, weight: 25,
    flavour: 'Dawn breaks upon a wall of light.',
    mods: [
      m([100, 150], (v) => `${v}% increased Energy Shield`, (b, v) => { b.localIncES += v; }),
      m([25, 35], (v) => `+${v}% to Cold Resistance`, (b, v) => { b.resCold += v; }),
      m([3, 5], (v) => `+${v}% to all maximum Resistances`, (b, v) => { b.maxRes += v; }),
    ],
  },
];

export const UNIQUE_BY_ID = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));

/** Uniques eligible to drop at the given item level. */
export function uniquesFor(ilvl) {
  return UNIQUES.filter((u) => u.lvl <= ilvl);
}
