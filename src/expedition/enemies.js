// expedition/enemies — Building the things a party fights, from tier and dungeon profile.

import {
  ARCHETYPES, CHAMPION_TITLES, GUARDIAN_TITLES, MONSTER_RARITY,
} from '../data/monsters.js';
import { rng } from '../rng.js';
import { clamp, uid } from '../util.js';
import {
  MON_ACC_BASE, MON_ACC_GROWTH, MON_ARMOUR_BASE, MON_DEF_GROWTH, MON_DMG_BASE,
  MON_DMG_GROWTH, MON_EV_BASE, MON_LIFE_BASE, MON_LIFE_GROWTH, SOFT_DMG, tierScale,
} from './balance.js';

function championName() {
  return `${rng.pick(CHAMPION_TITLES[0])}${rng.pick(CHAMPION_TITLES[1])}`;
}

export function makeEnemy(tier, profile, rarityId = null) {
  const arch = rng.pick(ARCHETYPES);
  const rarity = MONSTER_RARITY[rarityId ?? rng.weighted(Object.values(MONSTER_RARITY)).id];

  const life = tierScale(tier, MON_LIFE_BASE, MON_LIFE_GROWTH)
    * arch.life * rarity.life * (profile.life ?? 1);
  const dmg = tierScale(tier, MON_DMG_BASE, MON_DMG_GROWTH, SOFT_DMG)
    * arch.dmg * rarity.dmg * (profile.damage ?? 1);

  return {
    uid: uid('e'),
    name: rarity.id === 'champion' ? `${championName()}, ${arch.name}` : `${rarity.name}${arch.name}`,
    rarity: rarity.id,
    life, maxLife: life, dmg, split: { ...arch.split }, attack: arch.attack ?? 'melee',
    aps: arch.aps * (profile.aps ?? 1),
    armour: tierScale(tier, MON_ARMOUR_BASE, MON_DEF_GROWTH) * arch.ar * (profile.armour ?? 1),
    evasion: tierScale(tier, MON_EV_BASE, MON_DEF_GROWTH) * arch.ev * (profile.evasion ?? 1),
    accuracy: tierScale(tier, MON_ACC_BASE, MON_ACC_GROWTH),
    res: clamp(profile.res ?? 0, 0, 85),
    crit: 5,
    xpMult: rarity.xp, dropMult: rarity.drops,
    timer: rng.range(0.2, 1.0),
    isBoss: false,
    effects: [],
  };
}

export function makeGuardian(tier, profile, dungeonName) {
  const e = makeEnemy(tier, profile, 'normal');
  e.name = `${rng.pick(GUARDIAN_TITLES)} of ${dungeonName}`;
  e.rarity = 'champion';
  e.life *= 6; e.maxLife = e.life;
  e.dmg *= 1.35;
  e.res = clamp(e.res + 10, 0, 85);
  e.xpMult = 16; e.dropMult = 14;
  e.isBoss = true;
  return e;
}

export function makeRaidBoss(def, tier) {
  const life = tierScale(tier, MON_LIFE_BASE, MON_LIFE_GROWTH) * def.life;
  const dmg = tierScale(tier, MON_DMG_BASE, MON_DMG_GROWTH, SOFT_DMG) * def.damage;
  return {
    effects: [],
    uid: uid('e'), name: def.name, rarity: 'champion',
    life, maxLife: life, dmg, split: { ...def.split }, attack: def.attack ?? 'melee',
    aps: def.aps,
    armour: tierScale(tier, MON_ARMOUR_BASE, MON_DEF_GROWTH) * def.armour,
    evasion: tierScale(tier, MON_EV_BASE, MON_DEF_GROWTH) * 1.0,
    accuracy: tierScale(tier, MON_ACC_BASE, MON_ACC_GROWTH) * 1.1,
    res: def.res, crit: 8,
    xpMult: 55, dropMult: 30,
    timer: 1.0, isBoss: true, isRaid: true,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
