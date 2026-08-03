// game.js — boot sequence, the fixed-step main loop and auto-save.

import { G, createState, log, emit, on } from './state.js';
import { rng } from './rng.js';
import * as Save from './save.js';
import { tickAll, dispatch } from './expedition.js';
import { restAll, startingRoster, createParty, assignToParty } from './heroes.js';
import { refreshSheets } from './sheets.js';

export { refreshSheets };
import { guildEffects } from './data/upgrades.js';
import { fmtInt } from './util.js';
import { initUI, renderAll, tick as uiTick } from './ui.js';
import { startTutorial, shouldRunTutorial, isTutorialActive } from './tutorial.js';
import { initSplash, showSplash, hideSplash } from './splash.js';

const AUTOSAVE_INTERVAL = 30;    // seconds
const UI_INTERVAL = 0.1;
const REDEPLOY_DELAY = 1.5;

// A browser stops calling requestAnimationFrame in a background tab, so an
// idle game driven by it alone stops being idle the moment you look away.
// Two things keep time honest instead:
//
//   HEARTBEAT   a timer that keeps running when hidden. Browsers throttle it
//               to about once a second, which is fine — the simulation is
//               driven by how much wall-clock time has passed, not by how
//               often we were called.
//   CATCH_STEP  when a lot of time has passed at once (a background tab, or a
//               session resumed hours later) it is replayed in steps this
//               size. Small enough that attack timers and wave gaps still
//               resolve properly, large enough to replay hours in a moment.
const HEARTBEAT_MS = 1000;
const CATCH_STEP = 0.5;
const CATCH_BUDGET_MS = 1500;    // never block the page longer than this
const MAX_OFFLINE_HOURS = 12;
// The tutorial's demonstration expedition runs accelerated. A full-length run
// is far too long to sit through, but 5x was too fast to actually watch — the
// fight was over before the step describing it had been read. 3x lands around
// ten seconds, long enough to see the bars move. Skipping the tutorial drops
// this immediately, since isTutorialActive() goes false.
const TUTORIAL_SPEED = 3;

let last = 0;
let autosaveTimer = 0;
let uiTimer = 0;
let redeployTimer = 0;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  // The game always opens on the title screen — nothing auto-loads. A
  // placeholder state exists only so the UI has something safe to render
  // behind the splash; it is never saved.
  G.slot = Save.lastUsedSlot();
  G.state = createState();
  rng.seed(Date.now() >>> 0);
  G.paused = true;

  refreshSheets();
  initUI();
  initSplash({ onStart: enterGuild, onFound: foundGuild });
  renderAll();
  showSplash();

  last = performance.now();
  requestAnimationFrame(loop);

  // The animation frame stops in a hidden tab. This keeps time moving there —
  // browsers throttle it to roughly once a second, which is enough, because
  // advance() works from how much time has passed rather than how often it was
  // called.
  setInterval(advance, HEARTBEAT_MS);

  window.addEventListener('beforeunload', () => { if (!G.paused) Save.saveToSlot(G.slot, true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!G.paused) Save.saveToSlot(G.slot, true);
      return;
    }
    // Coming back must not reset the clock: that was the bug that threw away
    // every second spent in another tab. advance() replays it instead.
    advance();
  });
}

/** Resumes a guild chosen on the title screen. */
export function enterGuild(slot) {
  G.slot = slot;
  G.paused = false;
  refreshSheets();
  renderAll();
  log(`Welcome back to ${G.state.name}.`, 'sys');
  last = performance.now();
  runOfflineProgress();
  // A guild closed mid-tutorial picks up where it left off.
  if (shouldRunTutorial(G.state)) setTimeout(() => startTutorial(), 400);
}

/**
 * Plays out the time since the guild was last saved.
 *
 * Only with Standing Orders bought and auto-redeploy on: without it a party
 * finishes its run and waits to be sent again, so there is nothing to simulate
 * beyond one expedition. Requiring it also keeps the unlock meaningful — it is
 * what turns the guild from something you operate into something that runs.
 */
function runOfflineProgress() {
  const s = G.state;
  const savedAt = s?.__savedAt ?? 0;
  if (!savedAt) return;

  const away = (Date.now() - savedAt) / 1000;
  if (away < 60) return;                      // not worth mentioning

  const gu = guildEffects(s.upgrades);
  if (!gu.autoDispatch || !s.settings.autoRedeploy) {
    log(`The guild stood idle for ${fmtAway(away)} — buy Standing Orders and leave `
      + 'auto-redeploy on to keep parties working while you are away.', 'sys');
    return;
  }

  const capped = Math.min(away, MAX_OFFLINE_HOURS * 3600);
  const before = { gold: s.guild.gold, runs: s.stats.runs, gear: s.stats.gearFound };
  const { simulated, dropped } = catchUp(capped);

  const gold = s.guild.gold - before.gold;
  const runs = s.stats.runs - before.runs;
  const gear = s.stats.gearFound - before.gear;
  log(`While you were away (${fmtAway(simulated)}): ${runs} expedition${runs === 1 ? '' : 's'}, `
    + `${fmtInt(gold)} gold, ${gear} items.`, 'loot');
  if (dropped > 60 || away > capped) {
    log(`Offline progress is capped at ${MAX_OFFLINE_HOURS} hours.`, 'sys');
  }
}

function fmtAway(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Sets up the opening guild: a starting party and three heroes. */
export function foundGuild(name, slot = G.slot) {
  G.slot = slot;
  G.state = createState(name);
  G.state.heroes = startingRoster();
  const party = createParty('First Company');
  for (const h of G.state.heroes) assignToParty(h.uid, party.id);
  refreshSheets();
  G.paused = false;
  hideSplash();
  Save.saveToSlot(G.slot, true);
  emit('loaded');
  log(`${name} opens its doors.`, 'sys');
  renderAll();
  // Let the first render settle before measuring elements to highlight.
  setTimeout(() => startTutorial(0), 350);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

/**
 * One step of the world. Everything that advances time goes through here —
 * the animation frame, the background heartbeat, and the offline catch-up —
 * so none of them can drift from the others.
 *
 * @param {number} dt      seconds of real time
 * @param {boolean} quiet  true while replaying elapsed time, where per-step
 *                         saving would be wasteful
 */
function simulate(dt, quiet = false) {
  const s = G.state;
  if (!s || G.paused) return;

  s.playtime += dt;
  const speed = (s.settings.speed ?? 1) * (isTutorialActive() ? TUTORIAL_SPEED : 1);

  if (s.expeditions.length) {
    // Sub-stepping keeps fast speeds from skipping attack timers.
    const steps = Math.min(6, Math.ceil(speed));
    const step = (dt * speed) / steps;
    for (let i = 0; i < steps; i++) tickAll(step);
  }

  restAll(dt * speed);
  handleRedeploy(dt);

  if (quiet) return;
  autosaveTimer += dt;
  if (autosaveTimer >= AUTOSAVE_INTERVAL) {
    autosaveTimer = 0;
    Save.saveToSlot(G.slot, true);
  }
}

/**
 * Replays a stretch of elapsed time in steps, without locking the page.
 *
 * @returns {{simulated: number, dropped: number}} seconds replayed, and
 *   seconds abandoned because the budget ran out
 */
function catchUp(seconds) {
  const started = Date.now();
  let left = Math.max(0, seconds);
  let simulated = 0;
  while (left > 0) {
    const step = Math.min(CATCH_STEP, left);
    simulate(step, true);
    left -= step;
    simulated += step;
    if (Date.now() - started > CATCH_BUDGET_MS) break;
  }
  return { simulated, dropped: left };
}

/**
 * Advances the world to now, however long it has been. Called by both clocks;
 * whichever fires first does the work and the other finds nothing to do.
 */
function advance() {
  const now = performance.now();
  const dt = (now - last) / 1000;
  if (dt <= 0) return;
  last = now;

  // A frame's worth of time is simulated directly; anything larger means the
  // tab was hidden or the machine was busy, and is replayed in steps.
  if (dt <= 1) simulate(dt);
  else catchUp(dt);

  uiTimer += Math.min(dt, 1);
  if (uiTimer >= UI_INTERVAL) { uiTimer = 0; uiTick(); }
}

/**
 * Pretends `seconds` of wall-clock time have passed since the last step, then
 * advances. Exported for tests, which cannot background a real tab.
 */
export function rewindClockForTest(seconds) {
  last = performance.now() - seconds * 1000;
  advance();
}

function loop() {
  advance();
  requestAnimationFrame(loop);
}

/**
 * Optional convenience: re-send idle parties to whatever they last ran, as
 * long as they still have the stamina for it. Off by default — choosing where
 * to send each party is the game.
 */
/**
 * Runs one redeploy pass immediately, ignoring the delay timer. Exported for
 * tests, which need to drive the decision without waiting on the clock.
 */
export function handleRedeployForTest() {
  redeployTimer = REDEPLOY_DELAY;
  handleRedeploy(0);
}

function handleRedeploy(dt) {
  const s = G.state;
  // Gated behind the Standing Orders unlock so the opening expeditions are
  // dispatched by hand and the player learns what the choice is for.
  if (!guildEffects(s.upgrades).autoDispatch) return;
  if (!s.settings.autoRedeploy) return;
  redeployTimer += dt;
  if (redeployTimer < REDEPLOY_DELAY) return;
  redeployTimer = 0;

  // Longest-waiting first. With fewer charters than parties this is what
  // makes them take turns instead of the first in the list holding the only
  // charter forever.
  const waiting = s.parties
    .filter((p) => p.lastRun && p.autoRedeploy !== false)
    .filter((p) => !s.expeditions.some((e) => e.partyId === p.id))
    .sort((a, b) => (a.returnedAt ?? 0) - (b.returnedAt ?? 0));

  for (const party of waiting) {
    const res = dispatch(party.id, party.lastRun.dungeonId, party.lastRun.tier);
    // Out of charters or stamina: stop rather than churning through the rest.
    if (!res.ok) break;
  }
}

on('loaded', () => { refreshSheets(); redeployTimer = 0; });

window.IDLE_GUILD = { G, Save, rng, refreshSheets };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
