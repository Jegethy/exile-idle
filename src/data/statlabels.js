// data/statlabels.js — human-readable text for raw stat-bag keys.
//
// Passive nodes only declare a `stats` object; their tooltip text is generated
// from this table, which keeps the tree data terse and the wording consistent.

export const STAT_LABELS = {
  // Attributes
  str: (v) => `+${v} to Strength`,
  dex: (v) => `+${v} to Dexterity`,
  int: (v) => `+${v} to Intelligence`,

  // Life / mana / defences
  flatLife: (v) => `+${v} to maximum Life`,
  incLife: (v) => `${v}% increased maximum Life`,
  flatMana: (v) => `+${v} to maximum Mana`,
  incMana: (v) => `${v}% increased maximum Mana`,
  flatES: (v) => `+${v} to maximum Energy Shield`,
  incES: (v) => `${v}% increased maximum Energy Shield`,
  flatArmour: (v) => `+${v} to Armour`,
  incArmour: (v) => `${v}% increased Armour`,
  flatEvasion: (v) => `+${v} to Evasion Rating`,
  incEvasion: (v) => `${v}% increased Evasion Rating`,
  block: (v) => `+${v}% Chance to Block`,
  damageTaken: (v) => `${v > 0 ? v + '% increased' : Math.abs(v) + '% reduced'} Damage taken`,
  esRecharge: (v) => `${v}% increased Energy Shield Recharge Rate`,

  // Offence
  incDamage: (v) => `${v}% increased Damage`,
  incPhys: (v) => `${v}% increased Physical Damage`,
  incFire: (v) => `${v}% increased Fire Damage`,
  incCold: (v) => `${v}% increased Cold Damage`,
  incLight: (v) => `${v}% increased Lightning Damage`,
  incChaos: (v) => `${v}% increased Chaos Damage`,
  incEle: (v) => `${v}% increased Elemental Damage`,
  incAtkSpeed: (v) => `${v}% increased Attack Speed`,
  incCrit: (v) => `${v}% increased Critical Strike Chance`,
  critMulti: (v) => `+${v}% to Critical Strike Multiplier`,
  accuracy: (v) => `+${v} to Accuracy Rating`,
  incAccuracy: (v) => `${v}% increased Accuracy Rating`,
  moreDamage: (v) => `${v}% more Damage`,
  moreLife: (v) => `${v}% more maximum Life`,
  moreEle: (v) => `${v}% more Elemental Damage`,

  // Resistances
  resFire: (v) => `+${v}% to Fire Resistance`,
  resCold: (v) => `+${v}% to Cold Resistance`,
  resLight: (v) => `+${v}% to Lightning Resistance`,
  resChaos: (v) => `+${v}% to Chaos Resistance`,
  maxRes: (v) => `+${v}% to all maximum Resistances`,
  penFire: (v) => `Damage Penetrates ${v}% Fire Resistance`,
  penCold: (v) => `Damage Penetrates ${v}% Cold Resistance`,
  penLight: (v) => `Damage Penetrates ${v}% Lightning Resistance`,

  // Recovery & utility
  lifeLeech: (v) => `${v}% of Physical Attack Damage Leeched as Life`,
  lifeRegenFlat: (v) => `Regenerate ${v} Life per second`,
  lifeRegenPct: (v) => `Regenerate ${v}% of Life per second`,
  moveSpeed: (v) => `${v}% increased Movement Speed`,
  incRarity: (v) => `${v}% increased Rarity of Items found`,
  incQuant: (v) => `${v}% increased Quantity of Items found`,
  reflect: (v) => `Reflects ${v}% of Damage taken to Attacker`,
};

/** Turns a `stats` object into an array of display strings. */
export function describeStats(stats) {
  const out = [];
  for (const [k, v] of Object.entries(stats || {})) {
    const fn = STAT_LABELS[k];
    out.push(fn ? fn(v) : `${k} ${v}`);
  }
  return out;
}
