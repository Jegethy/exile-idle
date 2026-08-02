// data/traits.js — innate hero perks rolled at recruitment.
//
// Traits are what make one Rare Ranger worth keeping over another. They use the
// same stat-bag keys as gear, so they flow through the existing stat pipeline
// untouched. Rarity decides how many a hero rolls (see HERO_RARITIES).

/**
 * `tier` gates which traits a hero can roll: tier 1 is common filler, tier 3 is
 * only found on Epic and Legendary recruits.
 */
export const TRAITS = [
  // ---- Tier 1: bread and butter -----------------------------------------
  { id: 'sturdy', name: 'Sturdy', tier: 1, stats: { incLife: 12 }, desc: '12% increased Life' },
  { id: 'thick_hide', name: 'Thick Hide', tier: 1, stats: { incArmour: 25 }, desc: '25% increased Armour' },
  { id: 'nimble', name: 'Nimble', tier: 1, stats: { incEvasion: 25 }, desc: '25% increased Evasion' },
  { id: 'strong_arm', name: 'Strong Arm', tier: 1, stats: { incPhys: 15 }, desc: '15% increased Physical Damage' },
  { id: 'quick', name: 'Quick', tier: 1, stats: { incAtkSpeed: 7 }, desc: '7% increased Attack Speed' },
  { id: 'keen', name: 'Keen', tier: 1, stats: { incCrit: 25 }, desc: '25% increased Critical Chance' },
  { id: 'warded', name: 'Warded', tier: 1, stats: { resFire: 12, resCold: 12, resLight: 12 }, desc: '+12% to Elemental Resistances' },
  { id: 'hardy', name: 'Hardy', tier: 1, stats: { lifeRegenPct: 0.8 }, desc: 'Regenerate 0.8% Life per second' },
  { id: 'scholar', name: 'Scholar', tier: 1, stats: { incEle: 18 }, desc: '18% increased Elemental Damage' },
  { id: 'steady_hands', name: 'Steady Hands', tier: 1, stats: { incAccuracy: 25 }, desc: '25% increased Accuracy' },

  // ---- Tier 2: build-shaping --------------------------------------------
  { id: 'veteran', name: 'Veteran', tier: 2, stats: { incLife: 18, incArmour: 25 }, desc: '18% Life, 25% Armour' },
  { id: 'duelist', name: 'Duellist', tier: 2, stats: { incAtkSpeed: 10, critMulti: 18 }, desc: '10% Attack Speed, +18% Crit Multiplier' },
  { id: 'pyromaniac', name: 'Pyromaniac', tier: 2, stats: { incFire: 40, penFire: 5 }, desc: '40% Fire Damage, 5% Fire Penetration' },
  { id: 'frostborn', name: 'Frostborn', tier: 2, stats: { incCold: 40, penCold: 5 }, desc: '40% Cold Damage, 5% Cold Penetration' },
  { id: 'stormcaller', name: 'Stormcaller', tier: 2, stats: { incLight: 40, penLight: 5 }, desc: '40% Lightning Damage, 5% Lightning Penetration' },
  { id: 'bloodletter', name: 'Bloodletter', tier: 2, stats: { lifeLeech: 0.8 }, desc: '0.8% Physical Damage leeched as Life' },
  { id: 'bulwark', name: 'Bulwark', tier: 2, stats: { block: 10, damageTaken: -5 }, desc: '+10% Block, 5% reduced Damage taken' },
  { id: 'assassin', name: 'Assassin', tier: 2, stats: { incCrit: 45, critMulti: 22 }, desc: '45% Crit Chance, +22% Crit Multiplier' },
  { id: 'lucky', name: 'Lucky', tier: 2, stats: { incRarity: 25 }, desc: '25% increased Item Rarity' },
  { id: 'tireless', name: 'Tireless', tier: 2, stats: {}, perk: { staminaCost: -25 }, desc: '25% reduced Stamina cost' },
  { id: 'seasoned', name: 'Seasoned', tier: 2, stats: {}, perk: { xp: 25 }, desc: '25% increased Experience gained' },

  // ---- Tier 3: rare and defining ----------------------------------------
  { id: 'juggernaut', name: 'Juggernaut', tier: 3, stats: { incLife: 30, incArmour: 45, maxRes: 2 }, desc: '30% Life, 45% Armour, +2% max Resistances' },
  { id: 'executioner', name: 'Executioner', tier: 3, stats: { moreDamage: 18 }, desc: '18% MORE Damage' },
  { id: 'archmage', name: 'Archmage', tier: 3, stats: { moreEle: 22, incEle: 30 }, desc: '22% more Elemental Damage, 30% increased' },
  { id: 'guardian_angel', name: 'Guardian Angel', tier: 3, stats: { incHeal: 40, incLife: 15 }, desc: '40% increased Healing, 15% Life' },
  { id: 'treasure_hunter', name: 'Treasure Hunter', tier: 3, stats: { incRarity: 45 }, perk: { gold: 25 }, desc: '45% Item Rarity, 25% more Gold' },
  { id: 'undying', name: 'Undying', tier: 3, stats: { lifeRegenPct: 2.0, incLife: 20 }, desc: 'Regenerate 2% Life per second, 20% Life' },
  { id: 'relentless', name: 'Relentless', tier: 3, stats: { incAtkSpeed: 18, moreDamage: 10 }, desc: '18% Attack Speed, 10% more Damage' },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

/** Traits a hero of the given rarity may roll. Better heroes reach higher tiers. */
export function traitPoolFor(rarityId) {
  const maxTier = { common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 3 }[rarityId] ?? 1;
  return TRAITS.filter((t) => t.tier <= maxTier);
}

/** Sums the `perk` fields (stamina cost, gold and xp bonuses) across traits. */
export function traitPerks(traitIds = []) {
  const out = { staminaCost: 0, gold: 0, xp: 0 };
  for (const id of traitIds) {
    const t = TRAIT_BY_ID[id];
    if (!t?.perk) continue;
    for (const [k, v] of Object.entries(t.perk)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
