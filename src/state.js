// state.js — the single mutable guild state plus a tiny event bus.

import { rng } from './rng.js';
import { MATERIALS } from './data/materials.js';
import { guildEffects } from './data/upgrades.js';

export const SAVE_VERSION = 11;          // 10+ = Idle Guild; 11 = crafting materials
export const BASE_VAULT_CAPACITY = 80;
export const BASE_PARTY_SLOTS = 1;
export const MAX_PARTY_SIZE = 5;

/** Live game singleton. Modules read `G.state`. */
export const G = {
  state: null,
  slot: 0,
  paused: false,
  /** heroUid -> derived stat sheet, rebuilt whenever gear or level changes. */
  sheets: {},
};

/** Gear vault size, including Guild Hall upgrades. */
export function vaultCapacity(state = G.state) {
  return BASE_VAULT_CAPACITY + (guildEffects(state?.upgrades).vaultSlots ?? 0);
}

/** How many expeditions may run at once. */
export function partySlots(state = G.state) {
  return BASE_PARTY_SLOTS + (guildEffects(state?.upgrades).partySlots ?? 0);
}

// ---------------------------------------------------------------------------
// Progression curves
// ---------------------------------------------------------------------------

/** XP a hero needs to advance from `level` to `level + 1`. */
export function xpToNext(level) {
  return Math.floor(70 * Math.pow(level, 1.92) * Math.pow(1.045, level)) + 40;
}

/**
 * XP required to raise the guild from `level` to `level + 1`.
 *
 * A marathon on purpose. Guild level buys charter privileges and nothing else,
 * and a privilege that arrives every twenty minutes is a stream of
 * interruptions rather than a ladder. Sized against a flat award per cleared
 * expedition (see guildXpFor): roughly fifteen runs to Level 2, a hundred and
 * seventy to Level 10, a thousand to Level 20, and ten thousand to Level 30 —
 * which is thirty-odd hours with four parties in the field, and is meant to
 * be.
 */
export function guildXpToNext(level) {
  return Math.floor(420 * Math.pow(1.30, level)) + 220;
}

/** Cost in gold of the next recruit. Rises so roster growth stays a decision. */
/**
 * The exponential curve on roster size, which is what stops a rich guild
 * simply buying twenty heroes. Rarity multiplies it — see candidateCost.
 */
export function recruitCost(rosterSize) {
  return Math.floor(120 * Math.pow(1.17, Math.max(0, rosterSize - 3)));
}


// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

export function createState(name = 'The Wayfarers') {
  const materials = {};
  for (const m of MATERIALS) materials[m.id] = 0;
  // A small starting stock so the bench is usable before the first salvage.
  materials.copper_ore = 8;
  materials.rough_stone = 6;
  materials.faint_essence = 4;

  return {
    version: SAVE_VERSION,
    name,
    createdAt: Date.now(),
    playtime: 0,

    guild: { level: 1, xp: 0, gold: 250, seals: 0, echoes: 0 },
    contracts: [],

    heroes: [],              // roster; see heroes.js
    parties: [],             // { id, name, members: [heroUid] }
    expeditions: [],         // active runs; see expedition.js
    vault: [],               // unequipped gear
    materials,               // crafting materials, id -> count
    flasks: {},              // flaskId -> brewed count

    upgrades: {},            // Guild Hall ranks
    collection: {},          // uniqueId -> count

    // Guided first session; see tutorial.js. `skipped` is permanent.
    tutorial: { step: 0, done: false, skipped: false },

    // The questline; see story.js. `chapter` is an index into CHAPTERS, and
    // `skipped` unlocks every system at once without ending the line — a guild
    // that skipped may still go back and play it, which is the whole reason
    // skipping is safe to offer in the first place.
    story: { chapter: 0, done: false, skipped: false, claimed: {} },

    progress: {
      highestTier: 0,        // highest tier cleared
      cleared: {},           // `${dungeonId}:${tier}` -> completions
      firstClears: {},       // dungeonId -> highest tier first-cleared
      raidKills: {},         // raidId -> kills
      bonusMult: 0,          // permanent reward % from raid first kills
    },

    // One-off things that have happened, for Feats of Strength.
    feats: {},

    // Charter privileges the guild has been told about; see charter.js.
    charter: { granted: {} },

    stats: {
      runs: 0, runsFailed: 0, kills: 0, heroDeaths: 0,
      gearFound: 0, uniquesFound: 0, goldEarned: 0, recruited: 0, raidKills: 0,
      // Recorded for achievements. Peak gold rather than current, because
      // gold is meant to be spent and "hold a million" would otherwise be
      // unwinnable for anyone who plays properly.
      contractsRun: 0, blanksFound: 0, peakGold: 0,
      bossKills: 0, crafted: 0, flasksBrewed: 0, salvaged: 0,
    },

    // Candidates on offer, their locks, and how many times this board has been
    // rerolled. Persisted so closing the tab is not a free reroll.
    recruits: { candidates: [], locked: [], rerolls: 0 },

    settings: {
      autoRedeploy: false,   // re-run the same expedition when one finishes
      autoSalvageNormal: true,
      autoSalvageMagic: false,
      autoSalvageRare: false,
      // Every Charter automation defaults to off. Unlocking one puts the
      // switch on the wall; it does not flip it. Automation that starts
      // spending your gold or rewriting a party's orders unasked is
      // indistinguishable from a bug. See data/charter.js.
      salvageSpare: false,
      autoEquip: false,
      standingAccounts: false,
      standingStock: false,
      reserves: false,
      autoContract: false,
      pushOrders: false,
      // Composition warnings are advice, not rules — an over-geared party
      // farming old content does not need a tank, and should not be nagged.
      hideCompWarnings: false,
      // Summaries off still keeps the five-second gap between auto-redeploys;
      // see reports.js.
      hideReports: false,
      logLimit: 200,
      speed: 1,
    },

    log: [],
    rng: rng.state(),
  };
}

// ---------------------------------------------------------------------------
// Gold and seals
// ---------------------------------------------------------------------------

export function addGold(n) {
  G.state.guild.gold += n;
  G.state.stats.goldEarned += n;
  // High-water mark, so "hold a million gold" survives spending it.
  if (G.state.guild.gold > (G.state.stats.peakGold ?? 0)) {
    G.state.stats.peakGold = G.state.guild.gold;
  }
  emit('guild');
}

export function spendGold(n) {
  if (G.state.guild.gold < n) return false;
  G.state.guild.gold -= n;
  emit('guild');
  return true;
}

/** Grants guild XP and processes level-ups. Returns levels gained. */
export function grantGuildXp(amount) {
  const g = G.state.guild;
  g.xp += amount;
  let gained = 0;
  while (g.xp >= guildXpToNext(g.level) && gained < 100) {
    g.xp -= guildXpToNext(g.level);
    g.level++;
    gained++;
  }
  if (gained) emit('guild');
  return gained;
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

const LOG_CLASSES = new Set(['sys', 'hit', 'crit', 'kill', 'loot', 'unique', 'danger', 'boss', 'xp', 'gold']);

export function log(msg, cls = 'sys') {
  const s = G.state;
  if (!s) return;
  if (!LOG_CLASSES.has(cls)) cls = 'sys';
  s.log.push({ t: Date.now(), msg, cls });
  const limit = s.settings.logLimit ?? 200;
  if (s.log.length > limit) s.log.splice(0, s.log.length - limit);
  emit('log');
}

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) fn(payload);
  const all = listeners.get('*');
  if (all) for (const fn of all) fn(event, payload);
}
