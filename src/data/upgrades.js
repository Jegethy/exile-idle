// data/upgrades.js — Guild Hall upgrades, the permanent gold sink.
//
// Gold is the guild's primary currency and this is where most of it goes.
// Party Slots are deliberately the most expensive line: each one lets another
// expedition run concurrently, which is the single biggest change to how the
// game plays.

export const UPGRADES = [
  {
    id: 'partySlots', name: 'Expedition Charters', cost: 'gold',
    baseCost: 2500, growth: 6.5, max: 3,
    desc: 'Permits another party to be in the field at the same time.',
    unit: ' extra concurrent expedition',
    effect: (r) => ({ partySlots: r }),
  },
  {
    id: 'autoDispatch', name: 'Standing Orders', cost: 'gold',
    baseCost: 1500, growth: 1, max: 1,
    desc: 'Lets idle parties re-run their last expedition without being told. '
      + 'Bought once; the toggle then lives on the Expeditions tab.',
    unit: ' — auto-redeploy unlocked',
    effect: (r) => ({ autoDispatch: r }),
  },
  {
    id: 'quarters', name: 'Guild Quarters', cost: 'gold',
    baseCost: 300, growth: 1.55, max: 15,
    desc: 'Better beds. Heroes recover stamina faster between expeditions.',
    unit: '% faster Stamina recovery',
    effect: (r) => ({ stamina: r * 12 }),
  },
  {
    id: 'vault', name: 'Vault Expansion', cost: 'gold',
    baseCost: 220, growth: 1.48, max: 12,
    desc: 'Store more equipment before drops start being salvaged.',
    unit: ' extra vault slots',
    effect: (r) => ({ vaultSlots: r * 10 }),
  },
  {
    id: 'appraiser', name: 'Guild Appraiser', cost: 'gold',
    baseCost: 400, growth: 1.42, max: 20,
    desc: 'Expeditions return more gold.',
    unit: '% increased Gold found',
    effect: (r) => ({ gold: r * 10 }),
  },
  {
    id: 'quartermaster', name: 'Quartermaster', cost: 'gold',
    baseCost: 500, growth: 1.44, max: 20,
    desc: 'Better equipment comes back from the field.',
    unit: '% increased Item Rarity',
    effect: (r) => ({ rarity: r * 9 }),
  },
  {
    id: 'scavengers', name: 'Scavenger Crews', cost: 'gold',
    baseCost: 450, growth: 1.43, max: 20,
    desc: 'More equipment comes back from the field.',
    unit: '% increased Item Quantity',
    effect: (r) => ({ quantity: r * 8 }),
  },
  {
    id: 'archive', name: 'Arcane Archive', cost: 'gold',
    baseCost: 600, growth: 1.46, max: 20,
    desc: 'Expeditions recover more crafting orbs.',
    unit: '% increased Orb drops',
    effect: (r) => ({ orbs: r * 10 }),
  },
  {
    id: 'trainers', name: 'Training Yard', cost: 'gold',
    baseCost: 550, growth: 1.45, max: 20,
    desc: 'Heroes learn faster from every expedition.',
    unit: '% increased Experience',
    effect: (r) => ({ xp: r * 9 }),
  },
  {
    id: 'reputation', name: 'Guild Reputation', cost: 'gold',
    baseCost: 1800, growth: 1.85, max: 10,
    desc: 'Word spreads. Recruits are more likely to be exceptional.',
    unit: '% better recruit quality',
    effect: (r) => ({ recruitQuality: r * 18 }),
  },
  {
    id: 'infirmary', name: 'Infirmary', cost: 'gold',
    baseCost: 700, growth: 1.50, max: 15,
    desc: 'Healers trained here mend wounds faster in the field.',
    unit: '% increased Healing',
    effect: (r) => ({ healing: r * 10 }),
  },
  {
    id: 'armoury', name: 'Guild Armoury', cost: 'gold',
    baseCost: 900, growth: 1.52, max: 20,
    desc: 'Standard-issue kit toughens every hero in the guild.',
    unit: '% increased Life and Armour for all heroes',
    effect: (r) => ({ incLife: r * 3, incArmour: r * 4 }),
  },
  {
    id: 'wargames', name: 'War Games', cost: 'gold',
    baseCost: 1200, growth: 1.55, max: 20,
    desc: 'Constant drilling sharpens every hero in the guild.',
    unit: '% increased Damage for all heroes',
    effect: (r) => ({ incDamage: r * 3 }),
  },
  {
    id: 'sealsmith', name: 'Sealsmith', cost: 'mats',
    mat: 'radiant_essence', baseCost: 2, growth: 1.5, max: 10,
    desc: 'Raid Seals are recovered more often from deep expeditions.',
    unit: '% increased Raid Seal drops',
    effect: (r) => ({ seals: r * 18 }),
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Cost of taking `id` from its current rank to the next. */
export function upgradeCost(id, rank) {
  const u = UPGRADE_BY_ID[id];
  if (!u || rank >= u.max) return null;
  const amount = Math.ceil(u.baseCost * Math.pow(u.growth, rank));
  return u.cost === 'mats' ? { kind: 'mat', mat: u.mat, amount } : { kind: 'gold', amount };
}

/** Accumulated effects of every purchased upgrade. */
export function guildEffects(ranks = {}) {
  const out = {
    partySlots: 0, autoDispatch: 0, stamina: 0, vaultSlots: 0, gold: 0, rarity: 0, quantity: 0,
    orbs: 0, xp: 0, recruitQuality: 0, healing: 0, incLife: 0, incArmour: 0,
    incDamage: 0, seals: 0,
  };
  for (const u of UPGRADES) {
    const r = ranks?.[u.id] ?? 0;
    if (!r) continue;
    for (const [k, v] of Object.entries(u.effect(r))) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
