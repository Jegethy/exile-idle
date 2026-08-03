// expedition/rewards — What a run earns, what it carries, and what happens to it at the end.
//
// Nothing here banks as it drops: a run accumulates a haul, and the haul
// only becomes the guild's when somebody walks out with it.

import { DUNGEON_BY_ID, RAID_BY_ID, tierToIlvl } from '../data/dungeons.js';
import { gradeForIlvl, materialOf } from '../data/materials.js';
import { guildEffects } from '../data/upgrades.js';
import { grantHeroXp, heroById, partyById } from '../heroes.js';
import { addMaterial, addToVault } from '../inventory.js';
import { createItem, rollUnique } from '../items.js';
import { rng } from '../rng.js';
import { G, addGold, emit, grantGuildXp, log } from '../state.js';
import { fmt, uid } from '../util.js';
import { flaskFind } from './balance.js';

export function onEnemyKilled(run, enemy) {
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
  run.haul.gold += gold;
  run.rewards.gold += gold;

  // --- Experience, split across the party ---
  const xpTotal = (14 * Math.pow(run.tier, 1.6) + run.tier * 10) * enemy.xpMult * focus.xp;
  const survivors = run.combatants.filter((c) => !c.down);
  for (const c of survivors) {
    const share = xpTotal / Math.max(1, survivors.length);
    run.haul.heroXp[c.uid] = (run.haul.heroXp[c.uid] ?? 0) + share;
  }
  run.rewards.xp += xpTotal;
  run.haul.guildXp += xpTotal * 0.12;

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
  run.haul.materials[mat.id] = (run.haul.materials[mat.id] ?? 0) + 1;
  run.rewards.materials++;
  if (grade >= 3 && rng.chance(0.3)) log(`${mat.name} recovered from ${run.name}.`, 'unique');
}

function dropGear(run, rarityBonus, fromBoss) {
  const roll = rng.float() * 100;
  const uniqueCut = (fromBoss ? 2.2 : 0.45) * (1 + rarityBonus / 250);
  const rareCut = uniqueCut + 8 * (1 + rarityBonus / 100);
  const magicCut = rareCut + 32 * (1 + rarityBonus / 200);

  let item = null;
  if (roll < uniqueCut) {
    item = rollUnique(run.ilvl);
    // Nothing is recorded in the collection yet — the party still has to carry
    // it out. Announcing the find is fine; banking it is not.
    if (item) log(`${item.name} — if they make it back!`, 'unique');
  }
  if (!item) {
    const rarity = roll < rareCut ? 'rare' : roll < magicCut ? 'magic' : 'normal';
    item = createItem({ ilvl: run.ilvl, rarity });
  }

  run.haul.items.push(item);
  run.rewards.gear++;
}

/**
 * Hands the haul over to the guild. Only ever called for a party that walked
 * out — on a wipe the whole thing is dropped on the dungeon floor.
 */
export function bankHaul(run) {
  const s = G.state;
  const h = run.haul;

  if (h.gold > 0) addGold(h.gold);
  if (h.guildXp > 0) grantGuildXp(h.guildXp);
  if (h.seals > 0) s.guild.seals = (s.guild.seals ?? 0) + h.seals;
  for (const [id, n] of Object.entries(h.materials)) addMaterial(id, n);

  for (const uidStr of Object.keys(h.heroXp)) {
    const hero = heroById(uidStr);
    if (hero) grantHeroXp(hero, h.heroXp[uidStr]);
  }

  let full = 0;
  for (const item of h.items) {
    const result = addToVault(item);
    if (result === 'full') { full++; continue; }
    s.stats.gearFound++;
    if (item.rarity === 'unique') {
      s.stats.uniquesFound++;
      s.collection[item.uniqueId] = (s.collection[item.uniqueId] ?? 0) + 1;
      if (s.collection[item.uniqueId] === 1) {
        log(`${item.name} is new to the collection.`, 'unique');
      }
    }
  }
  if (full > 0) log(`Vault full — ${full} item${full === 1 ? '' : 's'} left behind.`, 'danger');
}

/** Everything the party was carrying when they went down. */
function forfeitHaul(run) {
  const h = run.haul;
  const uniques = h.items.filter((i) => i.rarity === 'unique').length;
  const bits = [];
  if (h.gold > 0) bits.push(`${fmt(h.gold)} gold`);
  if (h.items.length) bits.push(`${h.items.length} item${h.items.length === 1 ? '' : 's'}`);
  const matCount = Object.values(h.materials).reduce((a, n) => a + n, 0);
  if (matCount > 0) bits.push(`${matCount} material${matCount === 1 ? '' : 's'}`);
  if (uniques > 0) bits.push(`${uniques} unique${uniques === 1 ? '' : 's'}`);
  run.haul = { gold: 0, guildXp: 0, seals: 0, items: [], materials: {}, heroXp: {} };
  return bits;
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

export function finishRun(run, success) {
  const s = G.state;
  run.status = success ? 'complete' : 'failed';
  const party = partyById(run.partyId);
  const name = party?.name ?? 'The party';

  if (success) {
    s.stats.runs++;
    if (run.raidId) grantRaidRewards(run);
    else grantClearBonus(run);
    bankHaul(run);

    const r = run.rewards;
    log(`${name}: ${fmt(r.gold)} gold · ${r.gear} items · ${r.materials} materials · `
      + `${fmt(r.xp)} xp in ${run.elapsed.toFixed(0)}s.`, 'loot');
  } else {
    s.stats.runsFailed++;
    // A wipe costs the rest of the party's stamina — they need a real rest.
    for (const uidStr of run.members) {
      const hero = heroById(uidStr);
      if (hero) hero.stamina = Math.min(hero.stamina, 10);
    }
    // Nobody walked out, so nobody carried anything out either.
    const lost = forfeitHaul(run);
    log(`${name} was wiped out in ${run.name}.`, 'danger');
    log(lost.length
      ? `Everything they were carrying is lost: ${lost.join(' · ')}.`
      : 'They were carrying nothing.', 'danger');
  }

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
  run.haul.gold += gold;
  run.rewards.gold += gold;

  const mats = Math.max(2, Math.round((dungeon.rewards.mats ?? 1) * 3 * bonusMult * (1 + gu.materials / 100)));
  for (let i = 0; i < mats; i++) dropMaterial(run);

  const gearCount = Math.max(2, Math.round(dungeon.rewards.gear * 2.5 * bonusMult));
  for (let i = 0; i < gearCount; i++) dropGear(run, gu.rarity, true);

  // Raid Seals from deep expeditions.
  if (run.tier >= 4) {
    const chance = Math.min(0.30, (0.035 + run.tier * 0.005) * (1 + gu.seals / 100));
    if (rng.chance(chance)) {
      run.haul.seals++;
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

  run.haul.gold += def.reward.gold;
  run.rewards.gold += def.reward.gold;
  for (let i = 0; i < def.reward.materials; i++) dropMaterial(run);
  if (rng.chance(def.reward.uniqueChance)) {
    const u = rollUnique(tierToIlvl(def.tier));
    if (u) {
      run.haul.items.push(u);
      run.rewards.uniques++;
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
