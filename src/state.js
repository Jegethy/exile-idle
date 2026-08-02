// state.js — the single mutable game state plus a tiny event bus.

import { rng } from './rng.js';
import { EQUIP_SLOTS } from './data/bases.js';
import { CURRENCIES } from './data/currency.js';
import { createItem } from './items.js';

export const SAVE_VERSION = 1;
export const INVENTORY_CAPACITY = 60;   // 12 x 5 grid
export const MAP_CAPACITY = 40;

/** Live game singleton. Modules read `G.state` and `G.derived`. */
export const G = {
  state: null,
  derived: null,
  slot: 0,
  paused: false,
};

// ---------------------------------------------------------------------------
// Experience curve — exponential, uncapped.
// ---------------------------------------------------------------------------

/** XP required to advance from `level` to `level + 1`. */
export function xpToNext(level) {
  return Math.floor(55 * Math.pow(level, 1.85) * Math.pow(1.036, level)) + 40;
}

/** XP a single monster is worth at a given map tier and monster rarity. */
export function monsterXp(tier, rarityMult, playerLevel) {
  const base = 26 * Math.pow(tier, 1.8) + tier * 14;
  // Soft penalty when heavily out-levelling the content, so tiers matter.
  const effLevel = tierToLevel(tier);
  const gap = Math.max(0, playerLevel - effLevel - 10);
  const penalty = 1 / (1 + gap * 0.06);
  return Math.max(1, base * rarityMult * penalty);
}

/**
 * Monsters in a tier-N map behave like this character level.
 * There is no campaign in Exile Idle — the Atlas *is* the whole game, so
 * Tier 1 is level-1 content and Tier 16 is roughly the level cap of a
 * "finished" character. Uber tiers continue past that forever.
 */
export function tierToLevel(tier) {
  return tier <= 16 ? Math.round(2 + (tier - 1) * 4.5) : 70 + Math.round((tier - 16) * 2.5);
}

/** Item level of drops from a tier-N map. */
export function tierToIlvl(tier) {
  return tier <= 16 ? Math.round(1 + (tier - 1) * 5.5) : 84 + Math.round((tier - 16) * 2.5);
}

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

export function createState(name = 'Exile', classId = 'scion') {
  const stash = {};
  for (const c of CURRENCIES) stash[c.id] = 0;
  // Starting kit so the first map is survivable.
  stash.transmute = 6;
  stash.alteration = 4;
  stash.augment = 3;
  stash.alchemy = 2;
  stash.chisel = 2;

  const equipment = {};
  for (const s of EQUIP_SLOTS) equipment[s] = null;

  return {
    version: SAVE_VERSION,
    name,
    createdAt: Date.now(),
    playtime: 0,

    player: { level: 1, xp: 0, class: classId, ascendancy: null },
    passives: { allocated: {}, ascendancy: {}, mastery: 0, bonusPoints: 0 },

    equipment,
    inventory: [],
    maps: [],
    stash,

    atlas: {
      highestTier: 1,       // highest tier ever completed
      unlocked: 1,          // highest tier the player may craft/run
      safeTier: 1,          // adaptive ceiling used by auto-run (see combat.js)
      completed: {},        // tier -> completions
      bossKills: {},        // bossId -> kills
    },

    combat: null,           // active run, see maps.js/combat.js

    stats: {
      kills: 0, deaths: 0, mapsRun: 0, mapsFailed: 0,
      itemsFound: 0, currencyFound: 0, uniquesFound: 0, bossKills: 0,
      bestTier: 0, totalXp: 0,
    },

    settings: {
      // Off by default: choosing which map to run is the main decision the
      // player makes, so it shouldn't be taken away from them up front.
      autoRun: false,
      autoSalvageNormal: true,
      autoSalvageMagic: false,
      autoSalvageRare: false,
      logLimit: 200,
      combatSpeed: 1,
    },

    log: [],
    rng: rng.state(),
  };
}

/**
 * A fresh character, kitted out well enough to survive Tier 1.
 * (The starter map is granted by game.js, which owns the maps module.)
 */
export function newCharacter(name = 'Exile', classId = 'scion') {
  const s = createState(name, classId);
  // Starter kit matches the class's attribute leaning so it isn't dead weight.
  const kit = {
    marauder: ['axe1h', 'body_ar'], duelist: ['sword1h', 'body_arev'],
    ranger: ['bow', 'body_ev'], shadow: ['dagger', 'body_ev'],
    witch: ['wand', 'body_es'], templar: ['mace1h', 'body_ares'],
    scion: ['sword1h', 'body_arev'],
  }[classId] ?? ['sword1h', 'body_ar'];

  s.equipment.weapon = createItem({ baseId: kit[0], ilvl: 1, rarity: 'normal' });
  s.equipment.body = createItem({ baseId: kit[1], ilvl: 1, rarity: 'normal' });
  return s;
}

// ---------------------------------------------------------------------------
// XP / levelling
// ---------------------------------------------------------------------------

/** Grants XP and processes any number of level-ups. Returns levels gained. */
export function grantXp(state, amount) {
  state.player.xp += amount;
  state.stats.totalXp += amount;
  let gained = 0;
  while (state.player.xp >= xpToNext(state.player.level)) {
    state.player.xp -= xpToNext(state.player.level);
    state.player.level++;
    gained++;
    if (gained > 500) break;   // safety valve against pathological XP grants
  }
  return gained;
}

// ---------------------------------------------------------------------------
// Combat log
// ---------------------------------------------------------------------------

const LOG_CLASSES = new Set(['sys', 'hit', 'crit', 'kill', 'loot', 'unique', 'danger', 'boss', 'xp']);

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
// Minimal event bus — the UI subscribes, systems emit.
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
