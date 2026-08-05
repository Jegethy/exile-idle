// achievements.js — the engine behind data/achievements.js.
//
// It knows nothing about any particular achievement. It walks the list, asks
// each one what its progress currently is, and unlocks the ones that have
// arrived. Adding an achievement is a data change and nothing else.
//
// Two decisions worth stating, because both are load-bearing:
//
// Progress is *derived*, never accumulated. Every achievement is a function of
// the current save rather than a counter ticked from an event. That means a
// save from before an achievement existed is credited for what it already did
// the first time it is checked, and no counter can drift out of step with the
// thing it counts. The cost is that anything not already recorded in the save
// needs a stat adding for it — which is why `stats` gained a few fields.
//
// Checking is *polled*, not hooked. Hanging listeners off a dozen events would
// mean every new achievement needs a new hook, and one missed emit is a bug
// nobody notices for a month. A sweep over twenty cheap functions costs
// nothing at the interval this runs at.

import { G, emit, log, addGold } from './state.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from './data/achievements.js';

/** How often the sweep runs, in seconds of game time. */
export const CHECK_INTERVAL = 2;

let sinceCheck = 0;

/** Newly unlocked achievements the interface has not yet shown. */
export const pending = [];

function store() {
  const s = G.state;
  if (!s.achievements) s.achievements = { unlocked: {} };
  if (!s.achievements.unlocked) s.achievements.unlocked = {};
  return s.achievements;
}

export function isUnlocked(id) {
  return !!store().unlocked[id];
}

export function unlockedCount() {
  return Object.keys(store().unlocked).length;
}

/**
 * Current progress towards an achievement, clamped to its goal.
 *
 * A definition's `progress` runs against live state and must never throw — but
 * "must never" is not a guarantee, so a broken one is caught and reported as
 * zero rather than taking the game down with it.
 */
export function progressOf(def) {
  if (!def) return 0;
  try {
    const raw = def.progress(G.state) ?? 0;
    return Math.max(0, Math.min(def.goal, raw));
  } catch (err) {
    return 0;
  }
}

/** Progress as a fraction, for a bar. */
export function fractionOf(def) {
  return def?.goal ? progressOf(def) / def.goal : 0;
}

/**
 * Sweeps every achievement and unlocks whatever has arrived.
 *
 * @param {boolean} quiet  suppress the log line and the reward, used when
 *                         catching up an old save that already earned them
 * @returns {string[]} ids unlocked by this sweep
 */
export function checkAchievements(quiet = false) {
  const s = G.state;
  if (!s) return [];
  const unlocked = store().unlocked;
  const got = [];

  for (const def of ACHIEVEMENTS) {
    if (unlocked[def.id]) continue;
    if (progressOf(def) < def.goal) continue;

    unlocked[def.id] = s.playtime ?? 0;
    got.push(def.id);
    if (quiet) continue;

    pending.push(def.id);
    log(`Achievement: ${def.name} — ${def.desc}`, 'unique');
    grantReward(def);
  }

  if (got.length) emit('achievements');
  return got;
}

function grantReward(def) {
  const r = def.reward;
  if (!r) return;
  const s = G.state;
  if (r.gold) addGold(r.gold);
  if (r.seals) s.guild.seals = (s.guild.seals ?? 0) + r.seals;
  if (r.echoes) s.guild.echoes = (s.guild.echoes ?? 0) + r.echoes;
}

/** Advances the poll timer, sweeping when it comes round. */
export function tickAchievements(dt) {
  if (!G.state) return;
  sinceCheck += dt;
  if (sinceCheck < CHECK_INTERVAL) return;
  sinceCheck = 0;
  checkAchievements();
}

/**
 * Credits a save for everything it has already done, without ceremony.
 *
 * Called on load. A guild that has been running for forty hours should not be
 * greeted by twenty pop-ups and a pile of reward gold for things it did last
 * week, so this unlocks silently and pays nothing.
 */
export function backfill() {
  const before = unlockedCount();
  checkAchievements(true);
  const gained = unlockedCount() - before;
  if (gained) {
    log(`${gained} achievement${gained === 1 ? '' : 's'} recorded for what this guild has `
      + 'already done.', 'sys');
  }
  return gained;
}

/** Takes and clears the queue of unlocks the interface has not yet shown. */
export function takePending() {
  if (!pending.length) return [];
  const out = pending.slice();
  pending.length = 0;
  return out;
}

/** Everything, with live progress attached — for the interface. */
export function achievementList() {
  const unlocked = store().unlocked;
  return ACHIEVEMENTS.map((def) => ({
    def,
    unlocked: !!unlocked[def.id],
    at: unlocked[def.id] ?? null,
    progress: progressOf(def),
    fraction: fractionOf(def),
  }));
}

export { ACHIEVEMENT_BY_ID };
