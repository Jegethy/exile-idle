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

import { G, emit, log } from './state.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, TOTAL_POINTS } from './data/achievements.js';

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

/** Real-world time an achievement was earned, for the date on its plaque. */
function stamp() {
  return Date.now();
}

/**
 * Whether the guild is still being shown the ropes.
 *
 * Nothing is earned during the tutorial. Two reasons, and the second is the
 * one that made this a bug rather than a preference:
 *
 *   The demonstration expedition is scripted, dispatched under instruction and
 *   run at triple speed. Handing out "your first expedition" for it awards the
 *   tutorial rather than the player.
 *
 *   The tutorial's own rule is that *nothing on screen changes between one
 *   press and the next*, so reading is never racing the game. A toast sliding
 *   in mid-step breaks exactly that.
 *
 * Read from the save rather than from a flag tutorial.js sets, which matters
 * in three places a flag would miss: the four hundred milliseconds between a
 * guild loading and its tutorial resuming, a tab closed and reopened partway
 * through, and the load-time backfill, which must not credit a guild for a
 * tutorial it has not finished.
 */
function inTutorial() {
  const t = G.state?.tutorial;
  return !!t && !t.done;
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
  // Nothing is earned during the tour -- see inTutorial(). Whatever the
  // demonstration run happened to satisfy is credited silently the moment the
  // tutorial ends, the same treatment a save older than the achievement
  // system gets.
  if (inTutorial()) return [];
  const unlocked = store().unlocked;
  const got = [];

  for (const def of ACHIEVEMENTS) {
    if (unlocked[def.id]) continue;
    if (progressOf(def) < def.goal) continue;

    unlocked[def.id] = stamp();
    got.push(def.id);
    if (quiet) continue;

    pending.push(def.id);
    log(`Achievement earned: ${def.name} (${def.points} points) — ${def.desc}`, 'unique');
  }

  if (got.length) emit('achievements');
  return got;
}

/**
 * The guild's score.
 *
 * Achievements pay nothing else on purpose. This number going up is the whole
 * reward, in the way a Gamerscore is: an achievement worth gold stops being an
 * achievement and starts being a quest.
 */
export function score() {
  const unlocked = store().unlocked;
  let total = 0;
  for (const id of Object.keys(unlocked)) total += ACHIEVEMENT_BY_ID[id]?.points ?? 0;
  return total;
}

export function totalPoints() {
  return TOTAL_POINTS;
}

/**
 * Records a one-off thing having happened, for a Feat of Strength.
 *
 * Feats are the only achievements the game has to be *told* about: everything
 * else is read back out of the save. Setting a flag rather than unlocking
 * directly keeps the two halves separate — this records history, the sweep
 * decides what history is worth.
 */
export function recordFeat(key) {
  const s = G.state;
  if (!s) return false;
  // Opening the handbook because a tutorial step pointed at it is not a Feat
  // of Strength. The real one is still there to be earned afterwards.
  if (inTutorial()) return false;
  if (!s.feats) s.feats = {};
  if (s.feats[key]) return false;
  s.feats[key] = s.playtime ?? 0;
  return true;
}

/** Advances the poll timer, sweeping when it comes round. */
export function tickAchievements(dt) {
  if (!G.state) return;
  if (inTutorial()) return;
  sinceCheck += dt;
  if (sinceCheck < CHECK_INTERVAL) return;
  sinceCheck = 0;
  checkAchievements();
}

/**
 * Credits a save for everything it has already done, without ceremony.
 *
 * Called on load, and again the moment the tutorial ends. A guild that has been
 * running for forty hours should not be greeted by twenty pop-ups for things it
 * did last week, and a guild that has just finished the tour should not be
 * greeted by six for a scripted expedition it was told to send. Both unlock
 * silently.
 */
export function backfill() {
  const before = unlockedCount();
  checkAchievements(true);
  const gained = unlockedCount() - before;
  if (gained) {
    log(`${gained} achievement${gained === 1 ? '' : 's'} recorded for what this guild has `
      + `already done. Score: ${score()}.`, 'sys');
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
