// data/currency.js — orbs, their drop weights, and what they do.
//
// `weight` drives the drop table (Chaos is common, Divine/Exalt are not).
// The actual crafting behaviour lives in src/currency.js — this file is data.

export const CURRENCIES = [
  {
    id: 'scroll', name: 'Scroll of Wisdom', short: 'Wis', weight: 340, tier: 0,
    desc: 'Currency shards, used as vendor scrap.',
    use: 'Cannot be used on items directly.',
  },
  {
    id: 'transmute', name: 'Orb of Transmutation', short: 'Tra', weight: 200, tier: 1,
    desc: 'Upgrades a Normal item to Magic.',
    use: 'Normal → Magic (1-2 affixes).',
  },
  {
    id: 'augment', name: 'Orb of Augmentation', short: 'Aug', weight: 150, tier: 1,
    desc: 'Adds one modifier to a Magic item.',
    use: 'Magic item with an open affix → adds one.',
  },
  {
    id: 'alteration', name: 'Orb of Alteration', short: 'Alt', weight: 170, tier: 1,
    desc: 'Rerolls the modifiers of a Magic item.',
    use: 'Magic → new random Magic affixes.',
  },
  {
    id: 'regal', name: 'Regal Orb', short: 'Reg', weight: 42, tier: 2,
    desc: 'Upgrades a Magic item to Rare, keeping its mods and adding one.',
    use: 'Magic → Rare (+1 affix).',
  },
  {
    id: 'alchemy', name: 'Orb of Alchemy', short: 'Alc', weight: 90, tier: 2,
    desc: 'Upgrades a Normal item to Rare.',
    use: 'Normal → Rare (4-6 affixes).',
  },
  {
    id: 'chaos', name: 'Chaos Orb', short: 'Cha', weight: 55, tier: 2,
    desc: 'Rerolls the modifiers of a Rare item.',
    use: 'Rare → new random Rare affixes.',
  },
  {
    id: 'exalt', name: 'Exalted Orb', short: 'Exa', weight: 9, tier: 3,
    desc: 'Adds a new random modifier to a Rare item.',
    use: 'Rare with an open affix → adds one.',
  },
  {
    id: 'divine', name: 'Divine Orb', short: 'Div', weight: 7, tier: 3,
    desc: 'Rerolls the numeric values of an item\'s modifiers.',
    use: 'Any modified item → rerolls values in-tier.',
  },
  {
    id: 'annul', name: 'Orb of Annulment', short: 'Ann', weight: 16, tier: 3,
    desc: 'Removes a random modifier from an item.',
    use: 'Magic/Rare → deletes one affix.',
  },
  {
    id: 'scour', name: 'Orb of Scouring', short: 'Sco', weight: 45, tier: 2,
    desc: 'Removes all modifiers from an item.',
    use: 'Magic/Rare → Normal.',
  },
  {
    id: 'blessed', name: 'Blessed Orb', short: 'Ble', weight: 30, tier: 2,
    desc: 'Rerolls the value of an item\'s implicit modifier.',
    use: 'Any item with an implicit.',
  },
  {
    id: 'chisel', name: 'Cartographer\'s Chisel', short: 'Chi', weight: 60, tier: 2,
    desc: 'Improves the quality of a Map, increasing its rewards.',
    use: 'Map → +5% quality (max 20%).',
  },
  {
    id: 'vaal', name: 'Vaal Orb', short: 'Vaa', weight: 20, tier: 3,
    desc: 'Corrupts an item, with unpredictable results.',
    use: 'Any item → corrupt. Cannot be modified afterwards.',
  },
  {
    id: 'fragment', name: 'Pinnacle Fragment', short: 'Frg', weight: 0, tier: 4,
    desc: 'A shard of a pinnacle guardian\'s dominion. Four open a boss arena.',
    use: 'Consumed in sets of 4 to summon a Pinnacle Boss.',
  },
];

export const CURRENCY_BY_ID = Object.fromEntries(CURRENCIES.map((c) => [c.id, c]));

/** Currencies that can appear in the map drop table. */
export const DROPPABLE = CURRENCIES.filter((c) => c.weight > 0);

/** Rough vendor value used for salvage payouts, in "chaos equivalent". */
export const CURRENCY_VALUE = {
  scroll: 0.01, transmute: 0.02, augment: 0.03, alteration: 0.03, chisel: 0.1,
  blessed: 0.2, scour: 0.15, alchemy: 0.15, regal: 0.4, chaos: 1, annul: 2,
  vaal: 1, exalt: 12, divine: 15, fragment: 25,
};
