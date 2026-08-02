// expedition.js — party-versus-wave combat, run concurrently per party.
//
// This is the Exile Idle tick engine widened from one character to a party.
// Roles now matter: a Tank draws most incoming attacks via its threat weight, a
// Healer spends its turn mending the most wounded ally, and everyone else
// attacks. Heroes that fall are out for the rest of the run but not lost.

import { rng } from './rng.js';
import { clamp, fmt, uid } from './util.js';
import { G, log, emit, addGold, grantGuildXp } from './state.js';
import { hitChance, armourReduction, heroStats } from './stats.js';
import { ARCHETYPES, MONSTER_RARITY, CHAMPION_TITLES, GUARDIAN_TITLES } from './data/monsters.js';
import {
  DUNGEON_BY_ID, RAID_BY_ID, tierToLevel, tierToIlvl, staminaCost, wavesFor,
} from './data/dungeons.js';
import { createItem, rollUnique } from './items.js';
import { addToVault, addMaterial, spendFlask } from './inventory.js';
import { materialOf, gradeForIlvl } from './data/materials.js';
import { FLASK_BY_ID } from './data/recipes.js';
import { guildEffects } from './data/upgrades.js';
import {
  partyById, partyMembers, heroById, canDispatch, staminaCostFor, grantHeroXp,
} from './heroes.js';

// --- Balance ---------------------------------------------------------------
const SOFT_CAP_TIER = 20;
const SOFT_LIFE = 1.075;
const SOFT_DMG = 1.055;
const MON_LIFE_BASE = 34;
const MON_LIFE_GROWTH = 1.33;
const MON_DMG_BASE = 6.5;
const MON_DMG_GROWTH = 1.30;
const MON_ARMOUR_BASE = 6;
const MON_EV_BASE = 9;
const MON_ACC_BASE = 30;
const MON_DEF_GROWTH = 1.24;
const MON_ACC_GROWTH = 1.22;

const WAVE_GAP = 1.1;             // seconds between waves
const DAMAGE_TYPES = ['phys', 'fire', 'cold', 'light', 'chaos'];

/** Stat effect of whatever flask this run is carrying. */
function flaskFx(run) { return run.flaskId ? (FLASK_BY_ID[run.flaskId]?.effect ?? {}) : {}; }
/** Find-rate effect (rarity, gold) of this run's flask. */
function flaskFind(run) { return run.flaskId ? (FLASK_BY_ID[run.flaskId]?.find ?? {}) : {}; }

function tierScale(tier, base, growth, soft = SOFT_LIFE) {
  if (tier <= SOFT_CAP_TIER) return base * Math.pow(growth, tier - 1);
  return base * Math.pow(growth, SOFT_CAP_TIER - 1) * Math.pow(soft, tier - SOFT_CAP_TIER);
}

// ---------------------------------------------------------------------------
// Enemy construction
// ---------------------------------------------------------------------------

function championName() {
  return `${rng.pick(CHAMPION_TITLES[0])}${rng.pick(CHAMPION_TITLES[1])}`;
}

function makeEnemy(tier, profile, rarityId = null) {
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
    life, maxLife: life, dmg, split: { ...arch.split },
    aps: arch.aps * (profile.aps ?? 1),
    armour: tierScale(tier, MON_ARMOUR_BASE, MON_DEF_GROWTH) * arch.ar * (profile.armour ?? 1),
    evasion: tierScale(tier, MON_EV_BASE, MON_DEF_GROWTH) * arch.ev * (profile.evasion ?? 1),
    accuracy: tierScale(tier, MON_ACC_BASE, MON_ACC_GROWTH),
    res: clamp(profile.res ?? 0, 0, 85),
    crit: 5,
    xpMult: rarity.xp, dropMult: rarity.drops,
    timer: rng.range(0.2, 1.0),
    isBoss: false,
  };
}

function makeGuardian(tier, profile, dungeonName) {
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

function makeRaidBoss(def, tier) {
  const life = tierScale(tier, MON_LIFE_BASE, MON_LIFE_GROWTH) * def.life;
  const dmg = tierScale(tier, MON_DMG_BASE, MON_DMG_GROWTH, SOFT_DMG) * def.damage;
  return {
    uid: uid('e'), name: def.name, rarity: 'champion',
    life, maxLife: life, dmg, split: { ...def.split },
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

/** Sends a party into a dungeon. Returns { ok, msg }. */
export function dispatch(partyId, dungeonId, tier) {
  const s = G.state;
  const party = partyById(partyId);
  const dungeon = DUNGEON_BY_ID[dungeonId];
  if (!party || !dungeon) return { ok: false, msg: 'Unknown party or dungeon.' };
  if (s.expeditions.length >= partySlotLimit()) {
    return { ok: false, msg: 'No expedition charters free. Buy another in the Guild Hall.' };
  }

  const cost = staminaCost(tier);
  const check = canDispatch(party, cost);
  if (!check.ok) return check;

  const members = partyMembers(party);
  for (const hero of members) hero.stamina -= staminaCostFor(hero, cost);

  // A flask is drunk on the way out, not saved for a rainy day.
  let flaskId = null;
  if (party.flask && spendFlask(party.flask, 1)) flaskId = party.flask;

  s.expeditions.push(buildRun({
    partyId, members, tier,
    dungeonId, dungeon, name: dungeon.name,
    totalWaves: wavesFor(dungeon, tier), profile: dungeon.monsters, flaskId,
  }));

  log(`${party.name} sets out for ${dungeon.name} (Tier ${tier}).`
    + (flaskId ? ` They carry ${FLASK_BY_ID[flaskId].name}.` : ''), 'sys');
  emit('expeditions'); emit('roster');
  return { ok: true, msg: `${party.name} dispatched.` };
}

/** Sends a party at a raid, consuming Raid Seals. */
export function dispatchRaid(partyId, raidId) {
  const s = G.state;
  const party = partyById(partyId);
  const def = RAID_BY_ID[raidId];
  if (!party || !def) return { ok: false, msg: 'Unknown party or raid.' };
  if (s.expeditions.length >= partySlotLimit()) {
    return { ok: false, msg: 'No expedition charters free.' };
  }
  if (s.progress.highestTier < def.tier) {
    return { ok: false, msg: `Clear a Tier ${def.tier} dungeon first.` };
  }
  if ((s.guild.seals ?? 0) < def.seals) {
    return { ok: false, msg: `Needs ${def.seals} Raid Seal${def.seals === 1 ? '' : 's'}.` };
  }

  const cost = staminaCost(def.tier) * 2;
  const check = canDispatch(party, cost);
  if (!check.ok) return check;

  s.guild.seals -= def.seals;
  const members = partyMembers(party);
  for (const hero of members) hero.stamina -= staminaCostFor(hero, cost);

  const run = buildRun({
    partyId, members, tier: def.tier,
    dungeonId: null, dungeon: null, name: def.name,
    totalWaves: 0, profile: {}, raidId,
  });
  run.enemies = [makeRaidBoss(def, def.tier)];
  run.waveTimer = 1.4;
  s.expeditions.push(run);

  log(`${party.name} descends on ${def.name}.`, 'boss');
  log(def.blurb, 'boss');
  emit('expeditions'); emit('roster'); emit('guild');
  return { ok: true, msg: `${party.name} is raiding ${def.name}.` };
}

function partySlotLimit() {
  return 1 + guildEffects(G.state.upgrades).partySlots;
}

function buildRun(opts) {
  const flask = opts.flaskId ? FLASK_BY_ID[opts.flaskId] : null;
  const fx = flask?.effect ?? {};
  const lifeMult = 1 + (fx.incLife ?? 0) / 100;

  const combatants = opts.members.map((hero) => {
    const sheet = G.sheets[hero.uid] ?? heroStats(hero, G.state.upgrades);
    const maxLife = Math.round(sheet.life * lifeMult);
    return {
      uid: hero.uid, name: hero.name, classId: hero.classId, role: sheet.role,
      life: maxLife, maxLife,
      es: sheet.es, maxES: sheet.es,
      timer: rng.range(0.1, 0.6), down: false,
    };
  });

  return {
    id: uid('x'),
    partyId: opts.partyId,
    members: opts.members.map((h) => h.uid),
    dungeonId: opts.dungeonId,
    raidId: opts.raidId ?? null,
    name: opts.name,
    tier: opts.tier,
    ilvl: tierToIlvl(opts.tier),
    level: tierToLevel(opts.tier),
    profile: opts.profile,
    wave: 0,
    totalWaves: opts.totalWaves,
    enemies: [],
    combatants,
    waveTimer: 0.7,
    elapsed: 0,
    flaskId: opts.flaskId ?? null,
    status: 'running',
    rewards: { gold: 0, gear: 0, materials: 0, xp: 0, uniques: 0, seals: 0 },
  };
}

/** Recalls a party early. Loot already banked is kept; the clear bonus is not. */
export function recall(expeditionId) {
  const s = G.state;
  const i = s.expeditions.findIndex((e) => e.id === expeditionId);
  if (i < 0) return false;
  const run = s.expeditions[i];
  log(`${partyName(run)} returns early from ${run.name}.`, 'sys');
  s.expeditions.splice(i, 1);
  emit('expeditions'); emit('roster');
  return true;
}

function partyName(run) { return partyById(run.partyId)?.name ?? 'The party'; }

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/** Advances every running expedition by `dt` seconds. */
export function tickAll(dt) {
  const s = G.state;
  for (let i = s.expeditions.length - 1; i >= 0; i--) {
    const run = s.expeditions[i];
    if (run.status !== 'running') { s.expeditions.splice(i, 1); continue; }
    tickRun(run, dt);
  }
}

function tickRun(run, dt) {
  run.elapsed += dt;

  if (!run.enemies.length) {
    run.waveTimer -= dt;
    if (run.waveTimer <= 0) spawnWave(run);
    return;
  }

  const alive = run.combatants.filter((c) => !c.down);
  if (!alive.length) { finishRun(run, false); return; }

  // --- Heroes act ---
  for (const c of alive) {
    const sheet = G.sheets[c.uid];
    if (!sheet) continue;
    c.timer -= dt;
    const aps = sheet.aps * (1 + (flaskFx(run).incAtkSpeed ?? 0) / 100);
    let guard = 0;
    while (c.timer <= 0 && guard++ < 12 && run.enemies.length) {
      heroAct(run, c, sheet);
      c.timer += 1 / Math.max(0.15, aps);
    }
    if (!run.enemies.length) break;
  }

  if (!run.enemies.length) {
    // Wave cleared.
    if (run.raidId || (run.wave >= run.totalWaves + 1)) { finishRun(run, true); return; }
    run.waveTimer = WAVE_GAP;
    emit('expeditions');
    return;
  }

  // --- Enemies act ---
  for (const e of run.enemies) {
    e.timer -= dt;
    let guard = 0;
    while (e.timer <= 0 && guard++ < 12) {
      enemyAct(run, e);
      e.timer += 1 / Math.max(0.15, e.aps);
      if (run.combatants.every((c) => c.down)) { finishRun(run, false); return; }
    }
  }

  // --- Regeneration ---
  for (const c of alive) {
    const sheet = G.sheets[c.uid];
    const flaskRegen = c.maxLife * (flaskFx(run).lifeRegenPct ?? 0) / 100;
    const regen = (sheet?.regen ?? 0) + flaskRegen;
    if (regen > 0 && c.life < c.maxLife) {
      c.life = Math.min(c.maxLife, c.life + regen * dt);
    }
  }
}

function spawnWave(run) {
  run.wave++;
  const profile = run.profile ?? {};
  const isGuardian = run.wave > run.totalWaves;
  if (isGuardian) {
    run.enemies = [makeGuardian(run.tier, profile, run.name)];
    log(`${run.name}: ${run.enemies[0].name} bars the way.`, 'boss');
  } else {
    const count = rng.int(2, 4);
    run.enemies = [];
    for (let i = 0; i < count; i++) run.enemies.push(makeEnemy(run.tier, profile));
  }
  emit('expeditions');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function heroAct(run, c, sheet) {
  // Healers mend instead of attacking when someone is meaningfully hurt.
  if (sheet.healPower > 0) {
    const wounded = run.combatants
      .filter((x) => !x.down && x.life < x.maxLife * 0.92)
      .sort((a, b) => (a.life / a.maxLife) - (b.life / b.maxLife))[0];
    if (wounded) {
      const healed = Math.min(sheet.healPower, wounded.maxLife - wounded.life);
      wounded.life += healed;
      if (rng.chance(0.10)) log(`${c.name} heals ${wounded.name} for ${fmt(healed)}.`, 'kill');
      return;
    }
  }

  const target = run.enemies[0];
  if (!target) return;

  if (!rng.chance(hitChance(sheet.accuracy, target.evasion))) {
    if (rng.chance(0.05)) log(`${c.name} misses ${target.name}.`, 'hit');
    return;
  }

  const crit = rng.chance(sheet.critChance / 100);
  const critMult = crit ? sheet.critMulti / 100 : 1;
  const dmgMult = 1 + (flaskFx(run).incDamage ?? 0) / 100;

  let total = 0; let physDealt = 0;
  for (const type of DAMAGE_TYPES) {
    const [lo, hi] = sheet.dmg[type];
    if (hi <= 0) continue;
    let d = rng.range(lo, hi) * critMult * dmgMult;
    if (type === 'phys') {
      d *= (1 - armourReduction(target.armour, d));
      physDealt += d;
    } else {
      const pen = type === 'chaos' ? 0 : (sheet.pen[type] ?? 0);
      d *= (1 - clamp(target.res - pen, -60, 90) / 100);
    }
    total += d;
  }

  target.life -= total;
  if (sheet.leech > 0 && physDealt > 0) {
    c.life = Math.min(c.maxLife, c.life + physDealt * sheet.leech / 100);
  }

  if (crit && rng.chance(0.25)) log(`${c.name} crits ${target.name} for ${fmt(total)}.`, 'crit');
  else if (rng.chance(0.05)) log(`${c.name} hits ${target.name} for ${fmt(total)}.`, 'hit');

  if (target.life <= 0) onEnemyKilled(run, target);
}

function enemyAct(run, e) {
  const alive = run.combatants.filter((c) => !c.down);
  if (!alive.length) return;

  // Threat weighting is what makes a Tank a Tank.
  const target = rng.weighted(alive, (c) => (G.sheets[c.uid]?.threat ?? 1));
  const sheet = G.sheets[target.uid];
  if (!sheet) return;

  if (!rng.chance(hitChance(e.accuracy, sheet.evasion))) return;
  if (sheet.block > 0 && rng.chance(sheet.block / 100)) return;

  const crit = rng.chance(e.crit / 100);
  const base = e.dmg * rng.range(0.85, 1.15) * (crit ? 1.5 : 1);

  let taken = 0;
  for (const [type, frac] of Object.entries(e.split)) {
    const raw = base * frac;
    const armour = sheet.armour * (1 + (flaskFx(run).incArmour ?? 0) / 100);
    if (type === 'phys') taken += raw * (1 - armourReduction(armour, raw));
    else taken += raw * (1 - (sheet.res[type]?.value ?? 0) / 100);
  }
  taken *= (1 + sheet.damageTaken / 100);

  if (target.es > 0) {
    const absorbed = Math.min(target.es, taken);
    target.es -= absorbed;
    taken -= absorbed;
  }
  target.life -= taken;

  if (sheet.reflect > 0) {
    e.life -= taken * sheet.reflect / 100;
    if (e.life <= 0) { onEnemyKilled(run, e); return; }
  }

  if (target.life <= 0) {
    target.life = 0;
    target.down = true;
    G.state.stats.heroDeaths++;
    log(`${target.name} has fallen in ${run.name}.`, 'danger');
    emit('expeditions');
  }
}

function onEnemyKilled(run, enemy) {
  const s = G.state;
  const i = run.enemies.indexOf(enemy);
  if (i >= 0) run.enemies.splice(i, 1);
  s.stats.kills++;

  const gu = guildEffects(s.upgrades);
  const partyRarity = partyBonus(run, 'rarity');
  const partyGold = partyBonus(run, 'gold');
  const dungeon = run.dungeonId ? DUNGEON_BY_ID[run.dungeonId] : null;
  const focus = dungeon?.rewards ?? { gold: 1, gear: 1, xp: 1, mats: 1 };

  // --- Gold ---
  const gold = Math.round(
    (1.6 + run.tier * 1.15) * enemy.dropMult * focus.gold
    * (1 + (gu.gold + partyGold + (flaskFind(run).gold ?? 0)) / 100),
  );
  addGold(gold);
  run.rewards.gold += gold;

  // --- Experience, split across the party ---
  const xpTotal = (14 * Math.pow(run.tier, 1.6) + run.tier * 10) * enemy.xpMult * focus.xp;
  const survivors = run.combatants.filter((c) => !c.down);
  for (const c of survivors) {
    const hero = heroById(c.uid);
    if (hero) grantHeroXp(hero, xpTotal / Math.max(1, survivors.length));
  }
  run.rewards.xp += xpTotal;
  grantGuildXp(xpTotal * 0.12);

  // --- Gear ---
  // A guild equips a whole roster, not one character: five heroes across nine
  // slots is ~45 slots to fill, so the drop rate has to be far higher than a
  // single-character game would use or nobody ever gets a weapon.
  const quant = 1 + (gu.quantity + partyBonus(run, 'quantity')) / 100;
  const rarityBonus = gu.rarity + partyRarity + (flaskFind(run).rarity ?? 0);
  let gearRolls = 0.22 * enemy.dropMult * focus.gear * quant;
  let n = Math.floor(gearRolls);
  if (rng.chance(gearRolls - n)) n++;
  for (let k = 0; k < Math.min(n, 5); k++) dropGear(run, rarityBonus, enemy.isBoss);

  // --- Materials ---
  let matChance = 0.30 * enemy.dropMult * (focus.mats ?? 1) * quant * (1 + gu.materials / 100);
  let o = Math.floor(matChance);
  if (rng.chance(matChance - o)) o++;
  for (let k = 0; k < Math.min(o, 8); k++) dropMaterial(run);
}

/**
 * Materials come from the dungeon's own family table, so where you send a party
 * decides what you can craft with afterwards.
 */
function dropMaterial(run) {
  const dungeon = run.dungeonId ? DUNGEON_BY_ID[run.dungeonId] : null;
  const table = dungeon?.materials ?? { metal: 1, stone: 1, essence: 1 };
  const families = Object.entries(table);
  const total = families.reduce((a, [, w]) => a + w, 0);
  let roll = rng.float() * total;
  let family = families[0][0];
  for (const [f, w] of families) { roll -= w; if (roll <= 0) { family = f; break; } }

  // Mostly the grade the tier supports, occasionally one better.
  let grade = gradeForIlvl(run.ilvl);
  if (grade < 3 && rng.chance(0.08)) grade++;
  const mat = materialOf(family, grade);
  addMaterial(mat.id, 1);
  run.rewards.materials++;
  if (grade >= 3 && rng.chance(0.3)) log(`${mat.name} recovered from ${run.name}.`, 'unique');
}

function dropGear(run, rarityBonus, fromBoss) {
  const s = G.state;
  const roll = rng.float() * 100;
  const uniqueCut = (fromBoss ? 2.2 : 0.45) * (1 + rarityBonus / 250);
  const rareCut = uniqueCut + 8 * (1 + rarityBonus / 100);
  const magicCut = rareCut + 32 * (1 + rarityBonus / 200);

  let item = null;
  if (roll < uniqueCut) {
    item = rollUnique(run.ilvl);
    if (item) {
      s.stats.uniquesFound++;
      s.collection[item.uniqueId] = (s.collection[item.uniqueId] ?? 0) + 1;
      const isNew = s.collection[item.uniqueId] === 1;
      run.rewards.uniques++;
      log(`${item.name} recovered!${isNew ? ' (new to the collection)' : ''}`, 'unique');
    }
  }
  if (!item) {
    const rarity = roll < rareCut ? 'rare' : roll < magicCut ? 'magic' : 'normal';
    item = createItem({ ilvl: run.ilvl, rarity });
  }

  const result = addToVault(item);
  if (result === 'added') { run.rewards.gear++; s.stats.gearFound++; }
  else if (result === 'full') log('Vault full — an item was left behind.', 'danger');
  else {
    s.stats.gearFound++;
    if (result === 'salvaged-full' && rng.chance(0.12)) {
      log('Vault full — drops are being salvaged automatically.', 'danger');
    }
  }
}

/**
 * Sums a find-bonus across the whole party, so who you bring changes the payout
 * — a Rogue or a Treasure Hunter earns their slot even if they kill less.
 */
function partyBonus(run, key) {
  let total = 0;
  for (const c of run.combatants) {
    if (key === 'rarity') total += G.sheets[c.uid]?.rarity ?? 0;
    else if (key === 'quantity') total += G.sheets[c.uid]?.quantity ?? 0;
    else if (key === 'gold') {
      const hero = heroById(c.uid);
      if (!hero) continue;
      if (hero.classId === 'rogue') total += 15;
      if (hero.traits?.includes('treasure_hunter')) total += 25;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

function finishRun(run, success) {
  const s = G.state;
  run.status = success ? 'complete' : 'failed';
  const party = partyById(run.partyId);
  const name = party?.name ?? 'The party';

  if (success) {
    s.stats.runs++;
    if (run.raidId) grantRaidRewards(run);
    else grantClearBonus(run);
  } else {
    s.stats.runsFailed++;
    // A wipe costs the rest of the party's stamina — they need a real rest.
    for (const uidStr of run.members) {
      const hero = heroById(uidStr);
      if (hero) hero.stamina = Math.min(hero.stamina, 10);
    }
    log(`${name} was driven out of ${run.name}. No completion bonus.`, 'danger');
  }

  const r = run.rewards;
  log(`${name}: ${fmt(r.gold)} gold · ${r.gear} items · ${r.materials} materials · ${fmt(r.xp)} xp `
    + `in ${run.elapsed.toFixed(0)}s.`, success ? 'loot' : 'danger');

  const i = s.expeditions.indexOf(run);
  if (i >= 0) s.expeditions.splice(i, 1);
  emit('expeditions'); emit('roster'); emit('guild');
}

function grantClearBonus(run) {
  const s = G.state;
  const gu = guildEffects(s.upgrades);
  const dungeon = DUNGEON_BY_ID[run.dungeonId];
  const key = `${run.dungeonId}:${run.tier}`;
  const first = !s.progress.cleared[key];

  s.progress.cleared[key] = (s.progress.cleared[key] ?? 0) + 1;
  if (run.tier > s.progress.highestTier) s.progress.highestTier = run.tier;
  const prevBest = s.progress.firstClears[run.dungeonId] ?? 0;
  if (run.tier > prevBest) s.progress.firstClears[run.dungeonId] = run.tier;

  // Completion chest, weighted by the dungeon's focus.
  const bonusMult = 1 + s.progress.bonusMult / 100;
  const gold = Math.round((40 + run.tier * 26) * dungeon.rewards.gold * bonusMult * (1 + gu.gold / 100));
  addGold(gold);
  run.rewards.gold += gold;

  const mats = Math.max(2, Math.round((dungeon.rewards.mats ?? 1) * 3 * bonusMult * (1 + gu.materials / 100)));
  for (let i = 0; i < mats; i++) dropMaterial(run);

  const gearCount = Math.max(2, Math.round(dungeon.rewards.gear * 2.5 * bonusMult));
  for (let i = 0; i < gearCount; i++) dropGear(run, gu.rarity, true);

  // Raid Seals from deep expeditions.
  if (run.tier >= 4) {
    const chance = Math.min(0.30, (0.035 + run.tier * 0.005) * (1 + gu.seals / 100));
    if (rng.chance(chance)) {
      s.guild.seals = (s.guild.seals ?? 0) + 1;
      run.rewards.seals++;
      log('A Raid Seal was recovered.', 'unique');
    }
  }

  if (first) {
    log(`First clear of ${dungeon.name} Tier ${run.tier}.`, 'unique');
  }
  log(`${dungeon.name} (T${run.tier}) cleared.`, 'sys');
}

function grantRaidRewards(run) {
  const s = G.state;
  const def = RAID_BY_ID[run.raidId];
  const first = !s.progress.raidKills[def.id];

  s.progress.raidKills[def.id] = (s.progress.raidKills[def.id] ?? 0) + 1;
  s.stats.raidKills++;

  addGold(def.reward.gold);
  run.rewards.gold += def.reward.gold;
  for (let i = 0; i < def.reward.materials; i++) dropMaterial(run);
  if (rng.chance(def.reward.uniqueChance)) {
    const u = rollUnique(tierToIlvl(def.tier));
    if (u && addToVault(u) === 'added') {
      run.rewards.uniques++;
      s.stats.uniquesFound++;
      s.collection[u.uniqueId] = (s.collection[u.uniqueId] ?? 0) + 1;
      log(`${def.name} yields ${u.name}!`, 'unique');
    }
  }
  for (let i = 0; i < 4; i++) dropGear(run, 120, true);

  if (first) {
    s.progress.bonusMult += def.reward.bonus;
    log(`${def.name} has fallen for the first time! Guild rewards permanently +${def.reward.bonus}%.`, 'unique');
  } else {
    log(`${def.name} has fallen.`, 'boss');
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function runProgress(run) {
  if (run.raidId) {
    const e = run.enemies[0];
    return e ? 1 - e.life / e.maxLife : 1;
  }
  return clamp((run.wave - 1 + (run.enemies.length ? 0 : 1)) / (run.totalWaves + 1), 0, 1);
}

export { DUNGEON_BY_ID, RAID_BY_ID, partySlotLimit };
