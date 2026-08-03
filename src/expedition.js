// expedition.js — starting, recalling and reporting on expeditions.
//
// The work itself lives in ./expedition/: balance curves, enemy construction,
// the combat tick, and rewards. This file is the entry point the rest of the
// game talks to — everything that begins or ends a run.
//
// Roles matter in the tick: a Tank draws most incoming attacks via its threat
// weight, a Healer spends its turn mending the most wounded ally, and everyone
// else attacks. Heroes that fall are out for the rest of the run but not lost.

import { rng } from './rng.js';
import { uid } from './util.js';
import { G, log, emit } from './state.js';
import { heroStats } from './stats.js';
import {
  DUNGEON_BY_ID, RAID_BY_ID, tierToLevel, tierToIlvl, staminaCost, wavesFor,
} from './data/dungeons.js';
import { spendFlask } from './inventory.js';
import { guildEffects } from './data/upgrades.js';
import { clamp, fmt } from './util.js';
import {
  partyById, partyMembers, canDispatch, staminaCostFor,
} from './heroes.js';

import { CLASS_BY_ID } from './data/heroclasses.js';
import { makeRaidBoss } from './expedition/enemies.js';
import { bindReactions } from './expedition/effects.js';
import { reactionsFor } from './expedition/abilities.js';
import { bankHaul } from './expedition/rewards.js';
import { tickAll } from './expedition/combat.js';

// Re-exported so callers keep talking to expedition.js, not its internals.
export { tickAll };

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
    totalWaves: wavesFor(dungeon, tier), profile: { ...dungeon.monsters, attackMix: dungeon.attackMix }, flaskId,
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
    const cls = CLASS_BY_ID[hero.classId];
    const c = {
      uid: hero.uid, name: hero.name, classId: hero.classId, role: sheet.role,
      level: hero.level,
      // Where a hero stands follows from what they do: anyone who fights hand
      // to hand has to be within reach of the thing they are hitting, and
      // being within reach cuts both ways.
      row: cls?.row ?? 'front',
      reach: cls?.reach ?? 'melee',
      life: maxLife, maxLife,
      es: sheet.es, maxES: sheet.es,
      timer: rng.range(0.1, 0.6), down: false,
      wasLow: false,
      effects: [],
      damageDealt: 0, damageTaken: 0, healingDone: 0, ward: 0,
    };
    // Everything that can react to a moment in combat — the class's own
    // ability and any unique item worn — is indexed once, here.
    return bindReactions(c, reactionsFor(hero, sheet));
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
    // Everything found is carried by the party, not teleported to the guild
    // vault the instant it drops. A wiped party carries nothing home, so this
    // is discarded on failure. `rewards` above stays a running tally for the
    // UI — what is currently at stake.
    haul: { gold: 0, guildXp: 0, seals: 0, items: [], materials: {}, heroXp: {} },
  };
}

/**
 * Recalls a party early. They walk out under their own power, so they keep
 * what they are carrying — the clear bonus is what they give up. That is the
 * real decision a recall exists to offer: bank a partial haul now, or push a
 * hurt party deeper for the completion chest and risk losing all of it.
 */
export function recall(expeditionId) {
  const s = G.state;
  const i = s.expeditions.findIndex((e) => e.id === expeditionId);
  if (i < 0) return false;
  const run = s.expeditions[i];
  bankHaul(run);
  const r = run.rewards;
  log(`${partyName(run)} returns early from ${run.name} with ${fmt(r.gold)} gold · `
    + `${r.gear} items · ${r.materials} materials.`, 'loot');
  s.expeditions.splice(i, 1);
  emit('expeditions'); emit('roster');
  return true;
}

function partyName(run) { return partyById(run.partyId)?.name ?? 'The party'; }

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

export function runProgress(run) {
  if (run.raidId) {
    const e = run.enemies[0];
    return e ? 1 - e.life / e.maxLife : 1;
  }
  return clamp((run.wave - 1 + (run.enemies.length ? 0 : 1)) / (run.totalWaves + 1), 0, 1);
}

export { DUNGEON_BY_ID, RAID_BY_ID, partySlotLimit };
