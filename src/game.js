// game.js — boot sequence, the fixed-step main loop and auto-save.

import { G, createState, log, emit, on } from './state.js';
import { rng } from './rng.js';
import * as Save from './save.js';
import { tickAll, dispatch } from './expedition.js';
import { restAll, startingRoster, createParty, assignToParty } from './heroes.js';
import { refreshSheets } from './sheets.js';

export { refreshSheets };
import { guildEffects } from './data/upgrades.js';
import { initUI, renderAll, tick as uiTick } from './ui.js';
import { startTutorial, shouldRunTutorial, isTutorialActive } from './tutorial.js';
import { initSplash, showSplash, hideSplash } from './splash.js';

const AUTOSAVE_INTERVAL = 30;    // seconds
const UI_INTERVAL = 0.1;
const MAX_STEP = 0.25;           // clamp so tab-switching doesn't fast-forward
const REDEPLOY_DELAY = 1.5;
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

  window.addEventListener('beforeunload', () => { if (!G.paused) Save.saveToSlot(G.slot, true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (!G.paused) Save.saveToSlot(G.slot, true); }
    else last = performance.now();
  });
}

/** Resumes a guild chosen on the title screen. */
export function enterGuild(slot) {
  G.slot = slot;
  G.paused = false;
  refreshSheets();
  renderAll();
  log(`Welcome back to ${G.state.name}.`, 'sys');
  // A guild closed mid-tutorial picks up where it left off.
  if (shouldRunTutorial(G.state)) setTimeout(() => startTutorial(), 400);
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

function loop(now) {
  const dt = Math.min((now - last) / 1000, MAX_STEP);
  last = now;

  const s = G.state;
  if (s && !G.paused) {
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

    autosaveTimer += dt;
    if (autosaveTimer >= AUTOSAVE_INTERVAL) {
      autosaveTimer = 0;
      Save.saveToSlot(G.slot, true);
    }
  }

  uiTimer += dt;
  if (uiTimer >= UI_INTERVAL) { uiTimer = 0; uiTick(); }

  requestAnimationFrame(loop);
}

/**
 * Optional convenience: re-send idle parties to whatever they last ran, as
 * long as they still have the stamina for it. Off by default — choosing where
 * to send each party is the game.
 */
function handleRedeploy(dt) {
  const s = G.state;
  // Gated behind the Standing Orders unlock so the opening expeditions are
  // dispatched by hand and the player learns what the choice is for.
  if (!guildEffects(s.upgrades).autoDispatch) return;
  if (!s.settings.autoRedeploy) return;
  redeployTimer += dt;
  if (redeployTimer < REDEPLOY_DELAY) return;
  redeployTimer = 0;

  for (const party of s.parties) {
    if (!party.lastRun) continue;
    if (s.expeditions.some((e) => e.partyId === party.id)) continue;
    dispatch(party.id, party.lastRun.dungeonId, party.lastRun.tier);
  }
}

on('loaded', () => { refreshSheets(); redeployTimer = 0; });

window.IDLE_GUILD = { G, Save, rng, refreshSheets };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
