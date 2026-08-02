// data/upgrades.js — permanent, account-wide upgrades bought with currency.
//
// This is the game's long-term currency sink and the reason to farm content you
// have already outgrown: a Tier 4 map you clear in 20 seconds can out-earn a
// Tier 12 map you limp through in four minutes. Every upgrade is permanent and
// survives everything except deleting the save.
//
// Costs are paid in a specific orb type per upgrade, so the whole currency
// table stays useful rather than everything collapsing into Chaos Orbs.

/**
 * `effect(rank)` returns the accumulated bonus at that rank (not per-rank), so
 * the UI can show the current and next value without re-deriving anything.
 */
export const UPGRADES = [
  {
    id: 'cartographer', name: "Cartographer's Eye", currency: 'chisel',
    baseCost: 2, growth: 1.28, max: 20,
    desc: 'Maps you complete drop more maps.',
    unit: '% increased Map drops',
    effect: (r) => ({ mapDrops: r * 8 }),
  },
  {
    id: 'treasure', name: 'Treasure Sense', currency: 'alchemy',
    baseCost: 3, growth: 1.30, max: 20,
    desc: 'Everything that drops is more likely to be good.',
    unit: '% increased Item Rarity',
    effect: (r) => ({ rarity: r * 8 }),
  },
  {
    id: 'plunder', name: 'Plunderer', currency: 'alteration',
    baseCost: 8, growth: 1.26, max: 20,
    desc: 'More items drop from every monster.',
    unit: '% increased Item Quantity',
    effect: (r) => ({ quantity: r * 6 }),
  },
  {
    id: 'scavenger', name: 'Scavenger', currency: 'chaos',
    baseCost: 2, growth: 1.32, max: 20,
    desc: 'Monsters are more likely to drop currency.',
    unit: '% increased Currency drops',
    effect: (r) => ({ currency: r * 7 }),
  },
  {
    id: 'collector', name: "Collector's Instinct", currency: 'regal',
    baseCost: 4, growth: 1.34, max: 15,
    desc: 'Improves your chance of finding Unique items.',
    unit: '% increased Unique chance',
    effect: (r) => ({ unique: r * 10 }),
  },
  {
    id: 'veteran', name: "Veteran's Insight", currency: 'transmute',
    baseCost: 10, growth: 1.27, max: 20,
    desc: 'You learn more from every kill.',
    unit: '% increased Experience',
    effect: (r) => ({ xp: r * 6 }),
  },
  {
    id: 'swift', name: 'Swift Passage', currency: 'augment',
    baseCost: 8, growth: 1.29, max: 10,
    desc: 'You move between packs faster, raising clear speed.',
    unit: '% faster travel between packs',
    effect: (r) => ({ travel: r * 6 }),
  },
  {
    id: 'pack', name: 'Bulging Pack', currency: 'scour',
    baseCost: 3, growth: 1.40, max: 10,
    desc: 'Carry more items before drops start being salvaged.',
    unit: ' extra inventory slots',
    effect: (r) => ({ invSlots: r * 6 }),
  },
  {
    id: 'case', name: "Cartographer's Case", currency: 'blessed',
    baseCost: 3, growth: 1.40, max: 10,
    desc: 'Store more maps before your stash overflows.',
    unit: ' extra map stash slots',
    effect: (r) => ({ mapSlots: r * 8 }),
  },
  {
    id: 'hardened', name: 'Hardened', currency: 'vaal',
    baseCost: 2, growth: 1.36, max: 20,
    desc: 'Permanently tougher, on every character in this save.',
    unit: '% increased Life and Energy Shield',
    effect: (r) => ({ incLife: r * 2, incES: r * 2 }),
  },
  {
    id: 'sharpened', name: 'Sharpened', currency: 'exalt',
    baseCost: 1, growth: 1.42, max: 20,
    desc: 'Permanently deadlier, on every character in this save.',
    unit: '% increased Damage',
    effect: (r) => ({ incDamage: r * 3 }),
  },
  {
    id: 'fortune', name: 'Fortune Favours', currency: 'divine',
    baseCost: 1, growth: 1.45, max: 10,
    desc: 'Pinnacle Fragments drop more often from Tier 5+ maps.',
    unit: '% increased Fragment drops',
    effect: (r) => ({ fragments: r * 15 }),
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Cost of taking `id` from its current rank to the next one. */
export function upgradeCost(id, rank) {
  const u = UPGRADE_BY_ID[id];
  if (!u || rank >= u.max) return null;
  return { currency: u.currency, amount: Math.ceil(u.baseCost * Math.pow(u.growth, rank)) };
}

/** Accumulated effects of every purchased upgrade. */
export function upgradeEffects(ranks = {}) {
  const out = {
    mapDrops: 0, rarity: 0, quantity: 0, currency: 0, unique: 0, xp: 0,
    travel: 0, invSlots: 0, mapSlots: 0, incLife: 0, incES: 0, incDamage: 0, fragments: 0,
  };
  for (const u of UPGRADES) {
    const r = ranks[u.id] ?? 0;
    if (!r) continue;
    for (const [k, v] of Object.entries(u.effect(r))) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
