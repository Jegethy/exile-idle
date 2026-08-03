// stats.js — turns a hero's class, level, traits and gear into a stat sheet.
//
// Pipeline:  empty bag -> gear -> traits -> guild upgrades
//            -> derived (life, damage, healing, resistances, ...)
//
// "increased" values are additive within their pool; "more" values multiply.
// This is the same engine that drove Exile Idle, re-pointed from one character
// to a whole roster.

import { BASE_BY_ID } from './data/bases.js';
import { CLASS_BY_ID, RARITY_BY_ID } from './data/heroclasses.js';
import { TRAIT_BY_ID } from './data/traits.js';
import { guildEffects } from './data/upgrades.js';
import { itemBaseStats, applyItemMods } from './items.js';
import { clamp } from './util.js';

/** Every key the stat pipeline can touch, zeroed. */
export function emptyBag() {
  return {
    addPhysMin: 0, addPhysMax: 0, addFireMin: 0, addFireMax: 0,
    addColdMin: 0, addColdMax: 0, addLightMin: 0, addLightMax: 0,
    addChaosMin: 0, addChaosMax: 0,
    incDamage: 0, incPhys: 0, incFire: 0, incCold: 0, incLight: 0, incChaos: 0, incEle: 0,
    incAtkSpeed: 0, incCrit: 0, critMulti: 0, accuracy: 0, incAccuracy: 0,
    moreDamage: 0, moreEle: 0, moreFire: 0,
    flatLife: 0, incLife: 0,
    flatES: 0, incES: 0,
    flatArmour: 0, incArmour: 0, flatEvasion: 0, incEvasion: 0,
    // `block` is the untyped kind that applies to both; the other two are
    // what shield bases grant.
    block: 0, blockMelee: 0, blockSpell: 0,
    localIncPhys: 0, localIncArmour: 0, localIncEvasion: 0, localIncES: 0,
    resFire: 0, resCold: 0, resLight: 0, resChaos: 0, maxRes: 0,
    penFire: 0, penCold: 0, penLight: 0,
    lifeLeech: 0, lifeRegenFlat: 0, lifeRegenPct: 0,
    incRarity: 0, incQuant: 0, reflect: 0, damageTaken: 0,
    incHeal: 0, noES: 0, noEle: 0,
  };
}

const UNARMED = { physMin: 2, physMax: 5, aps: 1.15, crit: 5, hands: 1 };

/** Hard ceiling on either block chance, however it is stacked. */
export const BLOCK_CAP = 75;

/**
 * Computes a hero's full derived sheet.
 * @param {object} hero
 * @param {object} upgrades - guild upgrade ranks
 */
export function heroStats(hero, upgrades = {}) {
  const bag = emptyBag();
  const cls = CLASS_BY_ID[hero.classId];
  const rarity = RARITY_BY_ID[hero.rarity];
  const gu = guildEffects(upgrades);

  // ---- 1. Gear -----------------------------------------------------------
  let weapon = null; let offhandWeapon = null;
  let gearArmour = 0; let gearEvasion = 0; let gearES = 0;
  for (const slot of Object.keys(hero.equipment)) {
    const item = hero.equipment[slot];
    if (!item) continue;
    const base = BASE_BY_ID[item.baseId];
    const bs = itemBaseStats(item);
    if (base?.slot === 'weapon' && slot === 'weapon') weapon = bs;
    if (base?.slot === 'weapon' && slot === 'offhand') offhandWeapon = bs;
    if (bs.block) {
      bag.blockMelee += bs.block.melee ?? 0;
      bag.blockSpell += bs.block.spell ?? 0;
    }
    gearArmour += bs.armour ?? 0;
    gearEvasion += bs.evasion ?? 0;
    gearES += bs.es ?? 0;
    applyItemMods(item, bag);
  }

  // ---- 2. Traits ---------------------------------------------------------
  for (const id of hero.traits ?? []) {
    const t = TRAIT_BY_ID[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.stats ?? {})) bag[k] = (bag[k] ?? 0) + v;
  }

  // ---- 3. Guild upgrades -------------------------------------------------
  bag.incLife += gu.incLife;
  bag.incArmour += gu.incArmour;
  bag.incDamage += gu.incDamage;
  bag.incRarity += gu.rarity;
  bag.incHeal += gu.healing;

  // ---- 4. Class + level base ---------------------------------------------
  const lvl = hero.level;
  const rMult = rarity.mult;
  const m = cls.mult;

  const baseLife = (55 + lvl * 13) * m.life * rMult;
  const baseArmour = (8 + lvl * 3.2) * m.armour * rMult;
  const baseEvasion = (30 + lvl * 4.0) * m.evasion * rMult;

  const life = (baseLife + bag.flatLife) * (1 + bag.incLife / 100);
  const es = bag.noES ? 0 : (gearES + bag.flatES) * (1 + bag.incES / 100);
  const armour = (baseArmour + gearArmour + bag.flatArmour) * (1 + bag.incArmour / 100);
  const evasion = (baseEvasion + gearEvasion + bag.flatEvasion) * (1 + bag.incEvasion / 100);
  // A class brings its own block on top of whatever shield is carried: a
  // Warrior turns blades aside by training, not only by equipment.
  const classBlock = cls.block ?? {};
  const blockMelee = clamp(bag.block + bag.blockMelee + (classBlock.melee ?? 0), 0, BLOCK_CAP);
  const blockSpell = clamp(bag.block + bag.blockSpell + (classBlock.spell ?? 0), 0, BLOCK_CAP);

  // ---- 5. Resistances ----------------------------------------------------
  const maxRes = Math.round(75 + bag.maxRes);
  const res = {
    fire: { raw: Math.round(bag.resFire), cap: maxRes },
    cold: { raw: Math.round(bag.resCold), cap: maxRes },
    light: { raw: Math.round(bag.resLight), cap: maxRes },
    chaos: { raw: Math.round(bag.resChaos), cap: maxRes },
  };
  for (const k of Object.keys(res)) res[k].value = Math.min(res[k].raw, res[k].cap);

  // ---- 6. Offence --------------------------------------------------------
  const w = weapon ?? UNARMED;
  // A second weapon adds a share of its own damage and a little attack speed,
  // so two blades beat one without simply doubling the hero. Only a class that
  // can dual wield ever has one here — anyone else's offhand is a shield.
  const off = offhandWeapon;
  const OFFHAND_DAMAGE = 0.45;
  const OFFHAND_SPEED = 12;
  const noEle = !!bag.noEle;
  // Class damage multiplier scales the weapon itself, so a Sorcerer with a
  // staff and a Berserker with an axe both benefit from their archetype.
  const classDmg = m.damage * rMult;
  const incAll = bag.incDamage;
  const moreMult = 1 + bag.moreDamage / 100;
  const eleMore = 1 + bag.moreEle / 100;

  const dmg = {
    phys: range(
      (w.physMin + (off ? off.physMin * OFFHAND_DAMAGE : 0) + bag.addPhysMin) * classDmg,
      (w.physMax + (off ? off.physMax * OFFHAND_DAMAGE : 0) + bag.addPhysMax) * classDmg,
      incAll + bag.incPhys, moreMult),
    fire: noEle ? [0, 0] : range(bag.addFireMin * classDmg, bag.addFireMax * classDmg,
      incAll + bag.incFire + bag.incEle, moreMult * eleMore * (1 + bag.moreFire / 100)),
    cold: noEle ? [0, 0] : range(bag.addColdMin * classDmg, bag.addColdMax * classDmg,
      incAll + bag.incCold + bag.incEle, moreMult * eleMore),
    light: noEle ? [0, 0] : range(bag.addLightMin * classDmg, bag.addLightMax * classDmg,
      incAll + bag.incLight + bag.incEle, moreMult * eleMore),
    chaos: range(bag.addChaosMin * classDmg, bag.addChaosMax * classDmg,
      incAll + bag.incChaos, moreMult),
  };

  let hitMin = 0; let hitMax = 0;
  for (const k of Object.keys(dmg)) { hitMin += dmg[k][0]; hitMax += dmg[k][1]; }
  const avgHit = (hitMin + hitMax) / 2;

  const aps = w.aps * m.aps * (1 + (bag.incAtkSpeed + (off ? OFFHAND_SPEED : 0)) / 100);
  const critChance = clamp(w.crit * (1 + bag.incCrit / 100), 0, 95);
  const critMulti = 150 + bag.critMulti;
  const accuracy = (25 + lvl * 6 + bag.accuracy) * (1 + bag.incAccuracy / 100);
  const dps = avgHit * aps * (1 + (critChance / 100) * (critMulti / 100 - 1));

  // ---- 7. Healing --------------------------------------------------------
  // Healers restore a share of a target's maximum life on each cast.
  const healPower = m.heal > 0
    ? (18 + lvl * 4.5) * m.heal * rMult * (1 + (bag.incHeal + incAll) / 100)
    : 0;

  // ---- 8. Recovery -------------------------------------------------------
  const regen = bag.lifeRegenFlat + life * bag.lifeRegenPct / 100;

  return {
    heroUid: hero.uid, classId: hero.classId, role: cls.role,
    bag,
    life: Math.round(life), es: Math.round(es),
    armour: Math.round(armour), evasion: Math.round(evasion),
    blockMelee, blockSpell,
    // How much more or less this class suffers from each kind of attack, as a
    // percentage reduction. Named apart from `res` above, which is elemental.
    // A Warrior shrugs off a blade and burns; a Paladin is the reverse.
    schoolResist: { melee: cls.resist?.melee ?? 0, spell: cls.resist?.spell ?? 0 },
    school: cls.school ?? 'melee',
    row: cls.row ?? 'front',
    reach: cls.reach ?? 'melee',
    res, dmg, hitMin: Math.round(hitMin), hitMax: Math.round(hitMax), avgHit,
    aps, critChance, critMulti, accuracy, dps, dualWielding: !!off,
    healPower, regen, leech: bag.lifeLeech,
    threat: m.threat,
    rarity: bag.incRarity, quantity: bag.incQuant,
    damageTaken: bag.damageTaken, reflect: bag.reflect,
    pen: { fire: bag.penFire, cold: bag.penCold, light: bag.penLight },
  };
}

function range(min, max, incPct, moreMult) {
  const mult = (1 + incPct / 100) * moreMult;
  return [Math.max(0, min * mult), Math.max(0, max * mult)];
}

/** Rebuilds and caches every hero's sheet. */
export function rebuildSheets(state, cache) {
  for (const hero of state.heroes) cache[hero.uid] = heroStats(hero, state.upgrades);
  return cache;
}

/** Effective HP against a given element, used by the roster UI. */
export function ehp(d, element = 'phys') {
  const pool = d.life + d.es;
  if (element === 'phys') {
    const ref = Math.max(1, pool * 0.15);
    const reduction = d.armour / (d.armour + 5 * ref);
    return pool / Math.max(0.05, (1 - reduction) * (1 + d.damageTaken / 100));
  }
  const r = d.res[element]?.value ?? 0;
  return pool / Math.max(0.05, (1 - r / 100) * (1 + d.damageTaken / 100));
}

/** Chance for an attack with `accuracy` to land against `evasion`. */
export function hitChance(accuracy, evasion) {
  if (!isFinite(accuracy)) return 1;
  if (evasion <= 0) return 1;
  return clamp(accuracy / (accuracy + Math.pow(evasion / 4, 0.8)), 0.05, 1);
}

/** Physical damage reduction from armour against a specific hit size. */
export function armourReduction(armour, hit) {
  if (armour <= 0 || hit <= 0) return 0;
  return clamp(armour / (armour + 5 * hit), 0, 0.90);
}
