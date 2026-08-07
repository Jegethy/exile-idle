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
import { FLASK_BY_ID } from './data/recipes.js';
import { guildEffects } from './data/upgrades.js';
import { clamp, fmt } from './util.js';
import {
  partyById, partyMembers, canDispatch, spendStamina,
} from './heroes.js';

import { CLASS_BY_ID } from './data/heroclasses.js';
import { makeRaidBoss } from './expedition/enemies.js';
import { bindReactions, applyEffect } from './expedition/effects.js';
import { initResource } from './expedition/resource.js';
import { reactionsFor } from './expedition/abilities.js';
import { recordFeat } from './achievements.js';
import {
  applyModifiersToProfile, reactionsFrom, curseFrom, findFrom, barredMembers,
} from './data/modifiers.js';
import {
  contractById, consumeContract, rewardMultFor, modsOf, findBaseFor,
} from './contracts.js';
import { bankHaul } from './expedition/rewards.js';
import { tickAll } from './expedition/combat.js';

// Re-exported so callers keep talking to expedition.js, not its internals.
export { tickAll };

/** Sends a party into a dungeon. Returns { ok, msg }. */
/**
 * Sends a party out. `contractId` runs the expedition under a sealed
 * contract, which fixes the dungeon and tier to the contract's own and
 * imposes its modifiers — the contract is spent whether or not they clear it.
 */
export function dispatch(partyId, dungeonId, tier, contractId = null) {
  const s = G.state;
  const party = partyById(partyId);
  const contract = contractId ? contractById(contractId) : null;
  if (contractId && !contract) return { ok: false, msg: 'That contract is gone.' };
  if (contract) { dungeonId = contract.dungeonId; tier = contract.tier; }
  const dungeon = DUNGEON_BY_ID[dungeonId];
  if (!party || !dungeon) return { ok: false, msg: 'Unknown party or dungeon.' };
  if (s.expeditions.length >= partySlotLimit()) {
    return { ok: false, msg: 'No expedition charters free. Buy another in the Guild Hall.' };
  }

  const cost = staminaCost(tier);
  const check = canDispatch(party, cost);
  if (!check.ok) return check;

  const members = partyMembers(party);

  // Composition bans are checked before a single point of stamina is spent, so
  // a refused contract costs nothing and the contract itself is not consumed.
  if (contract) {
    const barred = barredMembers(contract.mods, members, (id) => CLASS_BY_ID[id]);
    if (barred.length) {
      const who = [...new Set(barred.map((b) => b.hero.name))].join(', ');
      const why = [...new Set(barred.map((b) => b.mod.name))].join(', ');
      return { ok: false, msg: `${why}: ${who} cannot enter.` };
    }
  }

  for (const hero of members) spendStamina(hero, cost);

  // A flask is drunk on the way out, not saved for a rainy day.
  //
  // Going without is said out loud. It used to be silent, which meant the
  // ordinary experience of alchemy was a buff that stopped working three runs
  // after it was assigned and never came back — with auto-redeploy, without
  // anyone watching, and with the party card on another tab.
  let flaskId = null;
  if (party.flask) {
    if (spendFlask(party.flask, 1)) flaskId = party.flask;
    else {
      log(`${party.name} has no ${FLASK_BY_ID[party.flask]?.name ?? 'flask'} left and goes `
        + 'without. Brew more at the alchemy stand.', 'danger');
    }
  }

  const mods = contract?.mods ?? [];
  const profile = applyModifiersToProfile(
    { ...dungeon.monsters, attackMix: dungeon.attackMix }, mods,
  );

  s.expeditions.push(buildRun({
    partyId, members, tier,
    dungeonId, dungeon, name: dungeon.name,
    totalWaves: wavesFor(dungeon, tier), profile, flaskId,
    contractId: contract?.id ?? null, mods,
    rewardMult: contract ? rewardMultFor(contract) : 1,
    contractRarity: contract?.rarity ?? null,
    // A contract's quantity and rarity come from two places: the floor its
    // own rarity sets, and whatever its boons add on top.
    find: contract
      ? (() => {
        const base = findBaseFor(contract);
        const boons = findFrom(mods);
        return {
          ...boons,
          quantity: boons.quantity + base.quantity,
          rarity: boons.rarity + base.rarity,
        };
      })()
      : null,
  }));

  // Spent on departure, not on success. A contract you can retry until it
  // works is not a decision about whether your party is ready for it.
  if (contract) {
    consumeContract(contract.id);
    s.stats.contractsRun = (s.stats.contractsRun ?? 0) + 1;
  }

  log(`${party.name} sets out for ${dungeon.name} (Tier ${tier}).`
    + (contract ? ` Under contract: ${modsOf(contract).map((m) => m.name).join(', ')}.` : '')
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
  for (const hero of members) spendStamina(hero, cost);

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
    c.empowerBonus = cls?.empowerBonus ?? 0;
    initResource(c, hero.classId, cls?.resourceCosts);
    // A contract's reactions ride along with the hero's own, because they
    // are the same shape — which is the reason modifiers cost the combat
    // engine nothing at all.
    return bindReactions(c, [...reactionsFor(hero, sheet), ...reactionsFrom(opts.mods ?? [])]);
  });

  // A curse is a single permanent effect rather than a stat edit, so it
  // shows in the same list as everything else acting on a hero and cannot
  // be mistaken for their own sheet.
  const curse = curseFrom(opts.mods ?? []);
  if (Object.keys(curse).length) {
    for (const c of combatants) {
      applyEffect(c, {
        id: 'contract-curse', name: 'Contract', mods: curse, duration: Infinity,
      });
    }
  }

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
    find: opts.find ?? null,
    contractId: opts.contractId ?? null,
    contractRarity: opts.contractRarity ?? null,
    mods: opts.mods ?? [],
    rewardMult: opts.rewardMult ?? 1,
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
  const party = partyById(run.partyId);
  recordFeat('recall');
  if (party) party.returnedAt = s.playtime;
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
