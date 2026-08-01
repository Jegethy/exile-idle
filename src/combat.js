// combat.js — the tick-based auto-combat loop, loot rolls and map resolution.

import { rng } from './rng.js';
import { clamp, fmt } from './util.js';
import { G, log, emit, grantXp, monsterXp, tierToLevel, tierToIlvl } from './state.js';
import { computeStats, hitChance, armourReduction } from './stats.js';
import { ARCHETYPES, MONSTER_RARITY, RARE_TITLES, BOSSES, BOSS_BY_ID, MAP_BOSS_TITLES } from './data/monsters.js';
import { mapModifiers, monsterCount, recordCompletion, rollMapDrops } from './maps.js';
import { createItem, rollUnique } from './items.js';
import { addItem, addCurrency, removeItem, spendCurrency } from './inventory.js';
import { DROPPABLE } from './data/currency.js';

// --- Balance constants -----------------------------------------------------
// Tier 1 is level-1 content and Tier 16 is roughly a finished character, so
// the first 16 tiers climb steeply. Past T16 the curve flattens to SOFT_GROWTH
// so uber tiers stay reachable as gear, mastery points and item level keep
// compounding — that's what makes infinite tiers a wall you push, not a cliff.
// Past the soft cap, monster LIFE grows faster than monster DAMAGE. That makes
// the uber-tier wall show up as "my clear speed collapsed" rather than "I got
// one-shot", which is both fairer and easier to read as a signal to back off.
const SOFT_CAP_TIER = 16;
const SOFT_GROWTH = 1.075;        // life / defences
const SOFT_GROWTH_DMG = 1.055;    // monster damage

const MON_LIFE_BASE = 18;
const MON_LIFE_GROWTH = 1.45;
const MON_DMG_BASE = 3;
const MON_DMG_GROWTH = 1.36;
const MON_ARMOUR_BASE = 5;
const MON_EV_BASE = 8;
const MON_ACC_BASE = 25;
const MON_DEF_GROWTH = 1.30;
const MON_ACC_GROWTH = 1.28;

const ES_RECHARGE_DELAY = 4.0;   // seconds without damage before ES recharges
const TRAVEL_TIME = 0.6;         // base seconds between packs
// Map-boss multipliers are applied to a NORMAL-rarity baseline. Stacking them
// on a rare monster instead made the Tier 1 boss ~50x a normal monster, which
// a fresh character simply cannot out-damage.
const BOSS_LIFE_MULT = 5;
const BOSS_DMG_MULT = 1.25;

const DAMAGE_TYPES = ['phys', 'fire', 'cold', 'light', 'chaos'];

// ---------------------------------------------------------------------------
// Monster construction
// ---------------------------------------------------------------------------

/** Piecewise tier scaling: steep to T16, then gentler forever. */
function tierScale(tier, base, growth, soft = SOFT_GROWTH) {
  if (tier <= SOFT_CAP_TIER) return base * Math.pow(growth, tier - 1);
  return base * Math.pow(growth, SOFT_CAP_TIER - 1) * Math.pow(soft, tier - SOFT_CAP_TIER);
}

function rareName() {
  return `${rng.pick(RARE_TITLES[0])}${rng.pick(RARE_TITLES[1])}`;
}

function makeMonster(tier, mm, rarityId = null) {
  const arch = rng.pick(ARCHETYPES);
  const rarity = MONSTER_RARITY[rarityId ?? rng.weighted(Object.values(MONSTER_RARITY)).id];

  const life = tierScale(tier, MON_LIFE_BASE, MON_LIFE_GROWTH)
    * arch.life * rarity.life * (1 + mm.mLife / 100);
  const dmg = tierScale(tier, MON_DMG_BASE, MON_DMG_GROWTH, SOFT_GROWTH_DMG)
    * arch.dmg * rarity.dmg * (1 + mm.mDmg / 100);

  const name = rarity.id === 'rare'
    ? `${rareName()}, ${arch.name}`
    : `${rarity.name}${arch.name}`;

  return {
    id: arch.id, name, rarity: rarity.id, archetype: arch.name,
    life, maxLife: life,
    dmg, split: { ...arch.split },
    aps: arch.aps * (1 + mm.mAps / 100),
    armour: tierScale(tier, MON_ARMOUR_BASE, MON_DEF_GROWTH) * arch.ar * (1 + mm.mArmour / 100),
    evasion: tierScale(tier, MON_EV_BASE, MON_DEF_GROWTH) * arch.ev * (1 + mm.mEvasion / 100),
    accuracy: tierScale(tier, MON_ACC_BASE, MON_ACC_GROWTH),
    res: clamp((tier > 10 ? 10 : 0) + mm.mRes, 0, 85),
    crit: 5 * (1 + mm.mCrit / 100),
    xpMult: rarity.xp,
    dropMult: rarity.drops,
    isBoss: false,
  };
}

function makeMapBoss(tier, mm) {
  const m = makeMonster(tier, mm, 'normal');
  m.name = `${rng.pick(MAP_BOSS_TITLES)} of the ${G.state.combat.map.name}`;
  m.rarity = 'rare';
  m.life *= BOSS_LIFE_MULT;
  m.maxLife = m.life;
  m.dmg *= BOSS_DMG_MULT;
  m.res = clamp(m.res + 15, 0, 85);
  m.xpMult = 14;
  m.dropMult = 12;
  m.isBoss = true;
  return m;
}

function makePinnacleBoss(def, tier, mm) {
  const life = tierScale(tier, MON_LIFE_BASE, MON_LIFE_GROWTH) * def.life * (1 + mm.mLife / 100);
  const dmg = tierScale(tier, MON_DMG_BASE, MON_DMG_GROWTH, SOFT_GROWTH_DMG) * def.dmg * (1 + mm.mDmg / 100);
  return {
    id: def.id, name: def.name, rarity: 'rare', archetype: 'Pinnacle',
    life, maxLife: life, dmg, split: { ...def.split },
    aps: def.aps, armour: tierScale(tier, MON_ARMOUR_BASE, MON_DEF_GROWTH) * def.ar,
    evasion: tierScale(tier, MON_EV_BASE, MON_DEF_GROWTH) * def.ev,
    accuracy: tierScale(tier, MON_ACC_BASE, MON_ACC_GROWTH) * 1.15,
    res: clamp(def.res + mm.mRes, 0, 90),
    crit: 8, xpMult: 40, dropMult: 20, isBoss: true, isPinnacle: true, bossId: def.id,
  };
}

// ---------------------------------------------------------------------------
// Starting and ending runs
// ---------------------------------------------------------------------------

/** Begins a map run. The map item is consumed. */
export function startMap(mapUid) {
  const s = G.state;
  if (s.combat && s.combat.status === 'running') return false;
  const map = s.maps.find((m) => m.uid === mapUid);
  if (!map) return false;

  removeItem(mapUid);
  const mm = mapModifiers(map);
  const total = monsterCount(map, mm);

  s.combat = {
    map: { ...map }, mm, tier: map.tier,
    level: tierToLevel(map.tier), ilvl: tierToIlvl(map.tier),
    total, index: 0, monster: null,
    playerTimer: 0, monsterTimer: 0, travelTimer: 0.4,
    elapsed: 0, status: 'running', isBossRun: false, bossPending: true,
    pool: null,
    rewards: { xp: 0, items: 0, currency: 0, uniques: 0, maps: 0, frags: 0 },
  };
  refreshDerived();
  initPool();
  log(`Entering ${map.name} (Tier ${map.tier}) — ${total} monsters.`, 'sys');
  emit('combat'); emit('maps');
  return true;
}

/** Begins a pinnacle boss fight, consuming fragments. */
export function startBossFight(bossId) {
  const s = G.state;
  if (s.combat && s.combat.status === 'running') return false;
  const def = BOSS_BY_ID[bossId];
  if (!def) return false;
  if (s.atlas.highestTier < def.tier) {
    log(`You must complete a Tier ${def.tier} map before challenging ${def.name}.`, 'danger');
    return false;
  }
  if (!spendCurrency('fragment', def.frags)) {
    log(`You need ${def.frags} Pinnacle Fragments to summon ${def.name}.`, 'danger');
    return false;
  }

  const tier = Math.max(def.tier, s.atlas.highestTier);
  const mm = { ...mapModifiers({ tier, rarity: 'normal', quality: 0, mods: [], corrupted: false }) };

  s.combat = {
    map: { name: def.name, tier, rarity: 'unique' }, mm, tier,
    level: tierToLevel(tier), ilvl: tierToIlvl(tier),
    total: 0, index: 0, monster: null,
    playerTimer: 0, monsterTimer: 0, travelTimer: 1.2,
    elapsed: 0, status: 'running', isBossRun: true, bossPending: true,
    bossDef: def, pool: null,
    rewards: { xp: 0, items: 0, currency: 0, uniques: 0, maps: 0, frags: 0 },
  };
  refreshDerived();
  initPool();
  log(def.intro, 'boss');
  emit('combat'); emit('stash');
  return true;
}

function initPool() {
  const c = G.state.combat;
  const d = G.derived;
  c.pool = { life: d.life, maxLife: d.life, es: d.es, maxES: d.es, esDelay: 0 };
}

/** Recomputes derived stats against the active map's modifiers. */
export function refreshDerived() {
  const c = G.state.combat;
  G.derived = computeStats(G.state, c && c.status === 'running' ? c.mm : null);
  // Keep current pools within any new maximums.
  if (c && c.pool) {
    c.pool.maxLife = G.derived.life;
    c.pool.maxES = G.derived.es;
    c.pool.life = Math.min(c.pool.life, c.pool.maxLife);
    c.pool.es = Math.min(c.pool.es, c.pool.maxES);
  }
  emit('stats');
}

/** Abandons the current run. The map is already consumed. */
export function abandonMap() {
  const s = G.state;
  if (!s.combat || s.combat.status !== 'running') return;
  log('You leave the area.', 'sys');
  s.combat.status = 'abandoned';
  s.combat = null;
  refreshDerived();
  emit('combat');
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/** Advances combat by `dt` seconds. Called from the main loop. */
export function tickCombat(dt) {
  const s = G.state;
  const c = s.combat;
  if (!c || c.status !== 'running') return;

  const d = G.derived;
  c.elapsed += dt;

  // Recovery ticks regardless of whether a monster is present.
  regenerate(c, d, dt);

  if (!c.monster) {
    c.travelTimer -= dt * (1 + d.moveSpeed / 100);
    if (c.travelTimer <= 0) spawnNext(c);
    return;
  }

  // Player attacks.
  c.playerTimer -= dt;
  let guard = 0;
  while (c.playerTimer <= 0 && c.monster && guard++ < 20) {
    playerAttack(c, d);
    c.playerTimer += 1 / Math.max(0.1, d.aps);
  }
  if (!c.monster) return;

  // Monster attacks.
  c.monsterTimer -= dt;
  guard = 0;
  while (c.monsterTimer <= 0 && guard++ < 20) {
    const aps = c.monster.aps;
    monsterAttack(c, d);
    // The monster can die mid-swing to reflect, and the player can die outright.
    if (c.status !== 'running' || !c.monster) return;
    c.monsterTimer += 1 / Math.max(0.1, aps);
  }
}

function regenerate(c, d, dt) {
  const p = c.pool;
  if (p.life < p.maxLife && d.regen > 0) {
    p.life = Math.min(p.maxLife, p.life + d.regen * dt);
  }
  if (p.esDelay > 0) p.esDelay -= dt;
  else if (d.canRecharge && p.es < p.maxES) {
    p.es = Math.min(p.maxES, p.es + d.esRechargeRate * dt);
  }
}

function spawnNext(c) {
  if (c.isBossRun) {
    c.monster = makePinnacleBoss(c.bossDef, c.tier, c.mm);
    c.bossPending = false;
    log(`${c.monster.name} rises. ${fmt(c.monster.maxLife)} Life.`, 'boss');
  } else if (c.index >= c.total) {
    if (c.bossPending) {
      c.monster = makeMapBoss(c.tier, c.mm);
      c.bossPending = false;
      log(`${c.monster.name} blocks your path!`, 'boss');
    } else {
      completeMap();
      return;
    }
  } else {
    c.monster = makeMonster(c.tier, c.mm);
  }
  c.playerTimer = 0;
  c.monsterTimer = 1 / Math.max(0.1, c.monster.aps) * 0.5;  // player gets first swing
  emit('combat');
}

// ---------------------------------------------------------------------------
// Attack resolution
// ---------------------------------------------------------------------------

function playerAttack(c, d) {
  const m = c.monster;
  if (!m) return;

  if (!d.flags.resoluteTechnique) {
    if (!rng.chance(hitChance(d.accuracy, m.evasion))) {
      if (rng.chance(0.12)) log(`You miss ${m.name}.`, 'hit');
      return;
    }
  }

  const crit = rng.chance(d.critChance / 100);
  const critMult = crit ? d.critMulti / 100 : 1;

  let total = 0;
  let physDealt = 0;
  for (const type of DAMAGE_TYPES) {
    const [lo, hi] = d.dmg[type];
    if (hi <= 0) continue;
    let dmg = rng.range(lo, hi) * critMult;
    if (type === 'phys') {
      dmg *= (1 - armourReduction(m.armour, dmg));
      physDealt += dmg;
    } else {
      const pen = type === 'chaos' ? 0 : (d.pen[type] ?? 0);
      const res = clamp(m.res - pen, -60, 90);
      dmg *= (1 - res / 100);
    }
    total += dmg;
  }

  m.life -= total;

  // Leech converts a slice of physical damage back into life.
  if (d.leech > 0 && physDealt > 0) {
    const heal = physDealt * d.leech / 100;
    c.pool.life = Math.min(c.pool.maxLife, c.pool.life + heal);
  }

  if (crit && rng.chance(0.5)) {
    log(`Critical! You hit ${m.name} for ${fmt(total)}.`, 'crit');
  } else if (rng.chance(0.10)) {
    log(`You hit ${m.name} for ${fmt(total)}.`, 'hit');
  }

  if (m.life <= 0) onKill(c, d, m);
}

function monsterAttack(c, d) {
  const m = c.monster;
  if (!m) return;

  if (!rng.chance(hitChance(m.accuracy, d.evasion))) {
    if (rng.chance(0.10)) log(`${m.name} misses you.`, 'hit');
    return;
  }
  if (d.block > 0 && rng.chance(d.block / 100)) {
    if (rng.chance(0.25)) log(`You block ${m.name}'s attack.`, 'hit');
    return;
  }

  const crit = rng.chance(m.crit / 100);
  const base = m.dmg * rng.range(0.8, 1.2) * (crit ? 1.5 : 1);

  // Split the hit into elements, then add any map-mod conversions.
  const parts = {};
  for (const [type, frac] of Object.entries(m.split)) parts[type] = (parts[type] ?? 0) + base * frac;
  const physPart = parts.phys ?? 0;
  const mm = c.mm;
  if (physPart > 0) {
    parts.fire = (parts.fire ?? 0) + physPart * mm.extraFire;
    parts.cold = (parts.cold ?? 0) + physPart * mm.extraCold;
    parts.light = (parts.light ?? 0) + physPart * mm.extraLight;
    parts.chaos = (parts.chaos ?? 0) + physPart * mm.extraChaos;
  }

  let taken = 0;
  for (const [type, raw] of Object.entries(parts)) {
    if (raw <= 0) continue;
    if (type === 'phys') {
      taken += raw * (1 - armourReduction(d.armour, raw));
    } else if (type === 'chaos' && d.flags.ci) {
      continue;   // Chaos Inoculation
    } else {
      const r = d.res[type]?.value ?? 0;
      taken += raw * (1 - r / 100);
    }
  }
  taken *= (1 + d.damageTaken / 100);

  applyDamage(c, d, taken, m);

  if (crit && rng.chance(0.4)) log(`${m.name} critically strikes you for ${fmt(taken)}!`, 'danger');
  else if (rng.chance(0.08)) log(`${m.name} hits you for ${fmt(taken)}.`, 'hit');

  // Reflect can kill the attacker.
  if (d.reflect > 0) {
    m.life -= taken * d.reflect / 100;
    if (m.life <= 0) onKill(c, d, m);
  }
}

function applyDamage(c, d, amount, source) {
  const p = c.pool;
  p.esDelay = ES_RECHARGE_DELAY;
  if (p.es > 0) {
    const absorbed = Math.min(p.es, amount);
    p.es -= absorbed;
    amount -= absorbed;
  }
  p.life -= amount;
  if (p.life <= 0) onDeath(c, source);
}

// ---------------------------------------------------------------------------
// Kill / death / completion
// ---------------------------------------------------------------------------

function onKill(c, d, m) {
  const s = G.state;
  s.stats.kills++;
  c.monster = null;

  const xp = monsterXp(c.tier, m.xpMult, s.player.level) * (1 + c.mm.xp / 100);
  c.rewards.xp += xp;
  const levels = grantXp(s, xp);
  if (levels > 0) {
    log(`Level up! You are now level ${s.player.level}.`, 'xp');
    refreshDerived();
  }

  rollLoot(c, d, m);

  if (m.isPinnacle) { completeBossFight(m); return; }
  if (m.isBoss) {
    s.stats.bossKills++;
    log(`${m.name} falls.`, 'boss');
    completeMap();
    return;
  }

  c.index++;
  c.travelTimer = TRAVEL_TIME;
  emit('combat');
}

function onDeath(c, source) {
  const s = G.state;
  s.stats.deaths++;
  s.stats.mapsFailed++;
  c.status = 'failed';

  // Losing a slice of the current level's progress is the death penalty.
  const lost = Math.floor(s.player.xp * 0.10);
  s.player.xp = Math.max(0, s.player.xp - lost);

  // Back the auto-run ceiling off so an over-reaching build stops feeding
  // itself into the same wall while unattended.
  if (!c.isBossRun) s.atlas.safeTier = Math.max(1, Math.min(s.atlas.safeTier, c.tier) - 1);

  log(`You have been slain by ${source?.name ?? 'the darkness'}. Lost ${fmt(lost)} experience.`, 'danger');
  logRunSummary(c, 'failed');
  s.combat = null;
  refreshDerived();
  emit('combat'); emit('stats');
}

function completeMap() {
  const s = G.state;
  const c = s.combat;
  c.status = 'complete';
  s.stats.mapsRun++;
  recordCompletion(c.tier);
  // Clearing a map proves the build can handle one step further.
  s.atlas.safeTier = Math.max(s.atlas.safeTier ?? 1, c.tier + 1);

  // Map drops.
  const drops = rollMapDrops(c.map, c.mm);
  for (const mapItem of drops) {
    if (addItem(mapItem) === 'added') c.rewards.maps++;
  }

  // Pinnacle fragments start appearing once the player is deep enough.
  if (c.tier >= 5) {
    const chance = 0.10 + c.tier * 0.012 + c.mm.quant / 1200;
    if (rng.chance(Math.min(0.65, chance))) {
      const n = 1 + (rng.chance(0.2) ? 1 : 0);
      addCurrency('fragment', n);
      c.rewards.frags += n;
      log(`Found ${n} Pinnacle Fragment${n > 1 ? 's' : ''}.`, 'unique');
    }
  }

  log(`${c.map.name} (T${c.tier}) cleared.`, 'sys');
  logRunSummary(c, 'complete');
  s.combat = null;
  refreshDerived();
  emit('combat'); emit('maps'); emit('stats');
}

function completeBossFight(m) {
  const s = G.state;
  const c = s.combat;
  const def = c.bossDef;
  c.status = 'complete';
  s.stats.bossKills++;
  s.atlas.bossKills[def.id] = (s.atlas.bossKills[def.id] ?? 0) + 1;

  // Guaranteed rich payout — this is what fragments are spent for.
  for (let i = 0; i < def.extraCurrency; i++) {
    const cur = rng.weighted(DROPPABLE.filter((x) => x.tier >= 2), (x) => x.weight);
    addCurrency(cur.id, 1);
    c.rewards.currency++;
  }
  if (rng.chance(def.uniqueChance)) {
    const u = rollUnique(c.ilvl);
    if (u && addItem(u) === 'added') {
      c.rewards.uniques++;
      s.stats.uniquesFound++;
      log(`${def.name} drops ${u.name}!`, 'unique');
    }
  }
  for (let i = 0; i < 3; i++) {
    const item = createItem({ ilvl: c.ilvl, rarity: 'rare' });
    if (addItem(item) === 'added') c.rewards.items++;
  }
  s.atlas.unlocked = Math.max(s.atlas.unlocked, def.tier + 2);

  log(`${def.name} has been defeated!`, 'boss');
  logRunSummary(c, 'complete');
  s.combat = null;
  refreshDerived();
  emit('combat'); emit('stats');
}

function logRunSummary(c, outcome) {
  const r = c.rewards;
  const parts = [`${fmt(r.xp)} XP`];
  if (r.items) parts.push(`${r.items} items`);
  if (r.uniques) parts.push(`${r.uniques} unique`);
  if (r.currency) parts.push(`${r.currency} currency`);
  if (r.maps) parts.push(`${r.maps} maps`);
  log(`Run ${outcome} in ${c.elapsed.toFixed(0)}s — ${parts.join(', ')}.`, outcome === 'complete' ? 'loot' : 'danger');
}

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

function rollLoot(c, d, m) {
  const s = G.state;
  const quant = 1 + (c.mm.quant + d.quantity) / 100;
  const rarityBonus = c.mm.rarity + d.rarity;

  // --- Currency ---
  const curChance = 0.055 * m.dropMult * quant * (1 + c.mm.currency / 100);
  let curDrops = Math.floor(curChance);
  if (rng.chance(curChance - curDrops)) curDrops++;
  for (let i = 0; i < Math.min(curDrops, 6); i++) {
    const cur = rng.weighted(DROPPABLE, (x) => x.weight * (x.tier >= 3 ? 1 + rarityBonus / 400 : 1));
    addCurrency(cur.id, 1);
    c.rewards.currency++;
    if (cur.tier >= 3) log(`${cur.name} dropped!`, 'unique');
  }

  // --- Gear ---
  const itemChance = 0.22 * m.dropMult * quant;
  let itemDrops = Math.floor(itemChance);
  if (rng.chance(itemChance - itemDrops)) itemDrops++;

  for (let i = 0; i < Math.min(itemDrops, 5); i++) {
    const roll = rng.float() * 100;
    const uniqueCut = 0.28 * (1 + rarityBonus / 100);
    const rareCut = uniqueCut + 7 * (1 + rarityBonus / 100);
    const magicCut = rareCut + 30 * (1 + rarityBonus / 200);

    let item;
    if (roll < uniqueCut) {
      item = rollUnique(c.ilvl);
      if (item) { s.stats.uniquesFound++; log(`${item.name} dropped!`, 'unique'); }
    }
    if (!item) {
      const rarity = roll < rareCut ? 'rare' : roll < magicCut ? 'magic' : 'normal';
      item = createItem({ ilvl: c.ilvl, rarity });
      if (rarity === 'rare' && rng.chance(0.25)) log(`${item.name} dropped.`, 'loot');
    }

    const result = addItem(item);
    if (result === 'added') {
      c.rewards.items++; s.stats.itemsFound++;
    } else if (result === 'full') {
      log(`Inventory full — ${item.name} was left behind.`, 'danger');
    } else {
      s.stats.itemsFound++;
      // Auto-salvage by setting is silent; salvage forced by a full bag is not.
      if (result === 'salvaged-full' && rng.chance(0.15)) {
        log('Inventory full — drops are being salvaged automatically.', 'danger');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Read-only helpers for the UI
// ---------------------------------------------------------------------------

/** Progress through the current map, 0..1. */
export function mapProgress(c) {
  if (!c) return 0;
  if (c.isBossRun) return c.monster ? 1 - c.monster.life / c.monster.maxLife : 0;
  return clamp((c.index + (c.bossPending ? 0 : 1)) / (c.total + 1), 0, 1);
}

/** Monsters killed per minute, for the clear-speed readout. */
export function clearSpeed(c) {
  if (!c || c.elapsed < 1) return 0;
  return (c.index / c.elapsed) * 60;
}

export { BOSSES };
