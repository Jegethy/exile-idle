// stats.js — turns equipment + passives into the derived character sheet.
//
// Pipeline:  empty bag -> gear implicits/affixes -> passive nodes -> map mods
//            -> derived (life, ES, DPS, resistances, ...)
//
// "increased" values are additive within their pool; "more" values multiply.

import { BASE_BY_ID } from './data/bases.js';
import { itemBaseStats, applyItemMods } from './items.js';
import { applyPassives } from './passives.js';
import { clamp } from './util.js';

/** Every key the stat pipeline can touch, zeroed. */
export function emptyBag() {
  return {
    // attributes
    str: 0, dex: 0, int: 0,
    // added damage
    addPhysMin: 0, addPhysMax: 0, addFireMin: 0, addFireMax: 0,
    addColdMin: 0, addColdMax: 0, addLightMin: 0, addLightMax: 0,
    addChaosMin: 0, addChaosMax: 0,
    // increases
    incDamage: 0, incPhys: 0, incFire: 0, incCold: 0, incLight: 0, incChaos: 0, incEle: 0,
    incAtkSpeed: 0, incCrit: 0, critMulti: 0, accuracy: 0, incAccuracy: 0,
    // more multipliers
    moreDamage: 0, moreEle: 0, moreArmour: 0, moreEvasion: 0, moreArmourLess: 0,
    // life pools
    flatLife: 0, incLife: 0, moreLife: 0, flatMana: 0, incMana: 0,
    flatES: 0, incES: 0, esRecharge: 0,
    flatArmour: 0, incArmour: 0, flatEvasion: 0, incEvasion: 0, block: 0,
    // local (consumed by itemBaseStats, kept here so probes don't crash)
    localIncPhys: 0, localIncArmour: 0, localIncEvasion: 0, localIncES: 0,
    // resistances
    resFire: 0, resCold: 0, resLight: 0, resChaos: 0, maxRes: 0,
    penFire: 0, penCold: 0, penLight: 0,
    // recovery & utility
    lifeLeech: 0, lifeRegenFlat: 0, lifeRegenPct: 0, moveSpeed: 0,
    incRarity: 0, incQuant: 0, reflect: 0, damageTaken: 0, headhunter: 0,
    // unique flags
    noES: 0, noEle: 0,
  };
}

const UNARMED = { physMin: 2, physMax: 6, aps: 1.2, crit: 5, hands: 1 };

/**
 * Computes the full derived sheet.
 * @param {object} state - game state
 * @param {object|null} mm - active map modifier accumulator, if in a map
 */
export function computeStats(state, mm = null) {
  const bag = emptyBag();
  const p = state.player;

  // ---- 1. Gear -----------------------------------------------------------
  let weapon = null;
  let gearArmour = 0; let gearEvasion = 0; let gearES = 0;
  const equipped = [];

  for (const slot of Object.keys(state.equipment)) {
    const item = state.equipment[slot];
    if (!item) continue;
    equipped.push(item);
    const base = BASE_BY_ID[item.baseId];
    const bs = itemBaseStats(item);
    if (base?.slot === 'weapon' && slot === 'weapon') weapon = bs;
    gearArmour += bs.armour ?? 0;
    gearEvasion += bs.evasion ?? 0;
    gearES += bs.es ?? 0;
    applyItemMods(item, bag);
  }

  // ---- 2. Passives -------------------------------------------------------
  const flags = applyPassives(state, bag);

  // ---- 3. Map modifiers --------------------------------------------------
  if (mm) {
    bag.damageTaken += mm.pDamageTaken;
    bag.maxRes += mm.pMaxRes;
  }

  // ---- 4. Attributes -----------------------------------------------------
  const lvl = p.level;
  const baseAttr = 14 + Math.floor(lvl * 0.6);
  const str = Math.round(baseAttr + bag.str);
  const dex = Math.round(baseAttr + bag.dex);
  const int = Math.round(baseAttr + bag.int);

  // Attributes grant their classic PoE side benefits.
  const strLife = str * 0.5;
  const dexEvasionInc = dex / 5;
  const dexAccuracy = dex * 2;
  const intESInc = int / 5;
  const intMana = int * 0.5;

  // ---- 5. Life / Mana / Energy Shield ------------------------------------
  let life = (40 + lvl * 11 + strLife + bag.flatLife)
    * (1 + bag.incLife / 100) * (1 + bag.moreLife / 100);

  let es = (gearES + bag.flatES) * (1 + (bag.incES + intESInc) / 100);
  if (bag.noES) es = 0;
  if (flags.ci) { life = 1; es *= 1.8; }
  if (mm) es *= (1 - mm.pLessES / 100);

  const mana = (30 + lvl * 6 + intMana + bag.flatMana) * (1 + bag.incMana / 100);

  // ---- 6. Defences -------------------------------------------------------
  let armour = (gearArmour + bag.flatArmour) * (1 + bag.incArmour / 100)
    * (1 + bag.moreArmour / 100) * (1 - bag.moreArmourLess / 100);
  let evasion = (55 + gearEvasion + bag.flatEvasion)
    * (1 + (bag.incEvasion + dexEvasionInc) / 100) * (1 + bag.moreEvasion / 100);
  if (mm) { armour *= (1 - mm.pLessArmour / 100); evasion *= (1 - mm.pLessEvade / 100); }
  if (flags.cannotEvade) evasion = 0;

  const block = clamp(bag.block, 0, 75);

  // ---- 7. Resistances ----------------------------------------------------
  const maxRes = Math.round(75 + bag.maxRes);
  const res = {
    fire: { raw: Math.round(bag.resFire), cap: maxRes },
    cold: { raw: Math.round(bag.resCold), cap: maxRes },
    light: { raw: Math.round(bag.resLight), cap: maxRes },
    chaos: { raw: flags.ci ? 100 : Math.round(bag.resChaos), cap: flags.ci ? 100 : maxRes },
  };
  for (const k of Object.keys(res)) res[k].value = Math.min(res[k].raw, res[k].cap);

  // ---- 8. Offence --------------------------------------------------------
  const w = weapon ?? UNARMED;
  const noEle = !!bag.noEle;

  const incAll = bag.incDamage;
  const moreMult = (1 + bag.moreDamage / 100);
  const eleMore = (1 + bag.moreEle / 100);

  const dmg = {
    phys: scaleRange(w.physMin + bag.addPhysMin, w.physMax + bag.addPhysMax,
      incAll + bag.incPhys, moreMult),
    fire: noEle ? [0, 0] : scaleRange(bag.addFireMin, bag.addFireMax,
      incAll + bag.incFire + bag.incEle, moreMult * eleMore),
    cold: noEle ? [0, 0] : scaleRange(bag.addColdMin, bag.addColdMax,
      incAll + bag.incCold + bag.incEle, moreMult * eleMore),
    light: noEle ? [0, 0] : scaleRange(bag.addLightMin, bag.addLightMax,
      incAll + bag.incLight + bag.incEle, moreMult * eleMore),
    chaos: scaleRange(bag.addChaosMin, bag.addChaosMax, incAll + bag.incChaos, moreMult),
  };

  let hitMin = 0; let hitMax = 0;
  for (const k of Object.keys(dmg)) { hitMin += dmg[k][0]; hitMax += dmg[k][1]; }
  const avgHit = (hitMin + hitMax) / 2;

  const aps = w.aps * (1 + bag.incAtkSpeed / 100) * (mm ? 1 : 1);
  const critChance = flags.resoluteTechnique
    ? 0
    : clamp(w.crit * (1 + bag.incCrit / 100), 0, 95);
  const critMulti = flags.eleOverload ? 100 : 150 + bag.critMulti;
  const accuracy = flags.resoluteTechnique
    ? Infinity
    : (20 + lvl * 3 + dexAccuracy + bag.accuracy) * (1 + bag.incAccuracy / 100);

  const critFactor = 1 + (critChance / 100) * (critMulti / 100 - 1);
  const dps = avgHit * aps * critFactor;

  // ---- 9. Recovery -------------------------------------------------------
  let regen = bag.lifeRegenFlat + life * bag.lifeRegenPct / 100;
  if (flags.vaalPact) regen = 0;
  if (mm) regen *= (1 - mm.pLessRegen / 100);

  let leech = bag.lifeLeech * (flags.vaalPact ? 2 : 1);
  if (mm) leech *= (1 - mm.pLessLeech / 100);

  const esRechargeRate = es * 0.20 * (1 + bag.esRecharge / 100);
  const canRecharge = !(mm && mm.pNoRecharge);

  return {
    bag, flags,
    attrs: { str, dex, int },
    life: Math.round(life), es: Math.round(es), mana: Math.round(mana),
    armour: Math.round(armour), evasion: Math.round(evasion), block,
    res,
    dmg, hitMin: Math.round(hitMin), hitMax: Math.round(hitMax), avgHit,
    aps, critChance, critMulti, accuracy, dps,
    regen, leech, esRechargeRate, canRecharge,
    moveSpeed: bag.moveSpeed,
    rarity: bag.incRarity, quantity: bag.incQuant,
    reflect: bag.reflect, damageTaken: bag.damageTaken,
    weaponClass: weapon ? 'weapon' : 'unarmed',
    pen: { fire: bag.penFire, cold: bag.penCold, light: bag.penLight },
  };
}

function scaleRange(min, max, incPct, moreMult) {
  const m = (1 + incPct / 100) * moreMult;
  return [Math.max(0, min * m), Math.max(0, max * m)];
}

/**
 * Effective HP against a hit of the given element — the number the UI shows so
 * players can compare defensive layers meaningfully.
 */
export function ehp(d, element = 'phys') {
  const pool = d.life + d.es;
  if (element === 'phys') {
    // Armour reduction is damage-dependent; assume a hit of ~15% of the pool.
    const ref = Math.max(1, pool * 0.15);
    const reduction = d.armour / (d.armour + 5 * ref);
    return pool / Math.max(0.05, (1 - reduction) * (1 + d.damageTaken / 100));
  }
  const r = d.res[element]?.value ?? 0;
  return pool / Math.max(0.05, (1 - r / 100) * (1 + d.damageTaken / 100));
}

/** Chance for an incoming attack with `accuracy` to hit a defender's evasion. */
export function hitChance(accuracy, evasion) {
  if (!isFinite(accuracy)) return 1;
  if (evasion <= 0) return 1;
  const c = accuracy / (accuracy + Math.pow(evasion / 4, 0.8));
  return clamp(c, 0.05, 1);
}

/** Physical damage reduction from armour against a specific hit size. */
export function armourReduction(armour, hit) {
  if (armour <= 0 || hit <= 0) return 0;
  return clamp(armour / (armour + 5 * hit), 0, 0.90);
}
