// charter.js — the engine behind data/charter.js.
//
// Small on purpose. It answers one question — "does this guild have that
// privilege?" — and every system that gained a capability asks it rather than
// checking a level number, so the ladder can be reordered in the data file
// without touching a single feature.
//
// Granting is polled rather than hooked, for the same reason achievements are:
// guild XP arrives from four places and a missed hook is a privilege that
// silently never appears. A sweep over fourteen comparisons costs nothing.
//
// What has been granted is *recorded* rather than derived, even though it is
// derivable from the level. That is not redundancy — it is the difference
// between "you have this" and "you have just been given this", and only the
// second one is worth a fanfare. A save that predates the Charter is credited
// silently on load; a level earned while you are watching announces itself.

import { G, emit, log } from './state.js';
import { PRIVILEGES, PRIVILEGE_BY_ID, nextPrivilege } from './data/charter.js';

/** How often the sweep runs, in seconds of game time. */
export const CHECK_INTERVAL = 2;

let sinceCheck = 0;

/** Newly granted privileges the interface has not yet shown. */
const pending = [];

function store() {
  const s = G.state;
  if (!s.charter) s.charter = { granted: {} };
  if (!s.charter.granted) s.charter.granted = {};
  return s.charter;
}

/** Whether the guild holds a privilege. The only question this module answers. */
export function hasPrivilege(id, state = G.state) {
  const def = PRIVILEGE_BY_ID[id];
  if (!def || !state) return false;
  return (state.guild?.level ?? 1) >= def.level;
}

/**
 * Whether an automation is both unlocked *and* switched on.
 *
 * Every privilege that spends something or changes a party's orders defaults
 * to off. Unlocking it puts the switch on the wall; it does not flip it.
 */
export function automationOn(id, state = G.state) {
  const def = PRIVILEGE_BY_ID[id];
  if (!def?.switchable || !hasPrivilege(id, state)) return false;
  // The switch is stored under the privilege's own id — see data/charter.js
  // for why there is no separate settings key.
  return !!state?.settings?.[id];
}

/** The next privilege and how far off it is, or null once the ladder ends. */
export function upcoming(state = G.state) {
  const level = state?.guild?.level ?? 1;
  const next = nextPrivilege(level);
  return next ? { def: next, levelsAway: next.level - level } : null;
}

/**
 * Sweeps for privileges the guild has reached but not yet been told about.
 *
 * @param {boolean} quiet  record without announcing, for a save being loaded
 * @returns {string[]} ids granted by this sweep
 */
export function checkCharter(quiet = false) {
  const s = G.state;
  if (!s) return [];
  const { granted: rec } = store();
  const got = [];

  for (const def of PRIVILEGES) {
    if (rec[def.id]) continue;
    if (!hasPrivilege(def.id)) continue;
    rec[def.id] = s.guild.level;
    got.push(def.id);
    if (quiet) continue;
    pending.push(def.id);
    log(`Guild Level ${s.guild.level} — the charter grants ${def.name}.`, 'unique');
  }

  if (got.length) emit('charter');
  return got;
}

/** Advances the poll timer, sweeping when it comes round. */
export function tickCharter(dt) {
  if (!G.state) return;
  sinceCheck += dt;
  if (sinceCheck < CHECK_INTERVAL) return;
  sinceCheck = 0;
  checkCharter();
}

/**
 * Records everything an existing guild has already earned, without ceremony.
 *
 * Called on load, so a guild that reached level 20 before any of this existed
 * opens with thirteen privileges in hand rather than thirteen pop-ups.
 */
export function backfillCharter() {
  const before = Object.keys(store().granted).length;
  checkCharter(true);
  const gained = Object.keys(store().granted).length - before;
  if (gained) {
    log(`The guild charter recognises ${gained} privilege${gained === 1 ? '' : 's'} `
      + 'this guild has already earned.', 'sys');
  }
  return gained;
}

/** Takes and clears the queue of grants the interface has not yet shown. */
export function takeCharterPending() {
  if (!pending.length) return [];
  const out = pending.slice();
  pending.length = 0;
  return out;
}

// ---------------------------------------------------------------------------
// What the privileges are worth, in numbers
// ---------------------------------------------------------------------------
//
// Kept here rather than at each call site so the ladder reads in one place: if
// two privileges both raise the same ceiling, the higher one has to win, and
// that is much easier to get wrong when the comparison lives in game.js.

export const BASE_OFFLINE_HOURS = 12;

/** How far back offline progress is counted. */
export function offlineHours(state = G.state) {
  if (hasPrivilege('watch24', state)) return 24;
  if (hasPrivilege('watch18', state)) return 18;
  return BASE_OFFLINE_HOURS;
}

export const BASE_BOARD_SIZE = 3;

/** How many candidates the Hiring Hall shows. */
export function recruitBoardSize(state = G.state) {
  if (hasPrivilege('boardFive', state)) return 5;
  if (hasPrivilege('boardFour', state)) return 4;
  return BASE_BOARD_SIZE;
}

export const BASE_CONTRACT_CAP = 16;

/** How many sealed contracts the board holds. */
export function contractCap(state = G.state) {
  return hasPrivilege('archive24', state) ? 24 : BASE_CONTRACT_CAP;
}

/** How many times a bench recipe may be repeated by one press. */
export const REPEAT_CRAFTS = 10;
