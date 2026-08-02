// game.js — boot sequence, the fixed-step main loop and auto-save.

import { G, createState, log, emit, on } from './state.js';
import { rng } from './rng.js';
import * as Save from './save.js';
import { tickAll, dispatch } from './expedition.js';
import { restAll, startingRoster, createParty, assignToParty } from './heroes.js';
import { rebuildSheets } from './stats.js';
import { initUI, renderAll, tick as uiTick, openNewGuild } from './ui.js';

const AUTOSAVE_INTERVAL = 30;    // seconds
const UI_INTERVAL = 0.1;
const MAX_STEP = 0.25;           // clamp so tab-switching doesn't fast-forward
const REDEPLOY_DELAY = 1.5;

let last = 0;
let autosaveTimer = 0;
let uiTimer = 0;
let redeployTimer = 0;

/** Rebuilds every hero's derived sheet. Called whenever gear or level changes. */
export function refreshSheets() {
  if (!G.state) return;
  rebuildSheets(G.state, G.sheets);
  emit('sheets');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  const slot = Save.lastUsedSlot();
  let fresh = true;

  if (Save.slotExists(slot) && Save.loadSlot(slot)) {
    fresh = false;
  } else {
    G.slot = slot;
    G.state = createState();
    rng.seed(Date.now() >>> 0);
  }

  // A brand-new guild does not exist until it has been named, so the world
  // stays frozen and unsaved behind the creation dialog.
  G.paused = fresh;

  refreshSheets();
  initUI();

  if (fresh) {
    openNewGuild(true);
  } else {
    log(`Welcome back to ${G.state.name}.`, 'sys');
  }

  renderAll();
  last = performance.now();
  requestAnimationFrame(loop);

  window.addEventListener('beforeunload', () => { if (!G.paused) Save.saveToSlot(G.slot, true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (!G.paused) Save.saveToSlot(G.slot, true); }
    else last = performance.now();
  });
}

/** Sets up the opening guild: a starting party and three heroes. */
export function foundGuild(name) {
  G.state = createState(name);
  G.state.heroes = startingRoster();
  const party = createParty('First Company');
  for (const h of G.state.heroes) assignToParty(h.uid, party.id);
  refreshSheets();
  G.paused = false;
  Save.saveToSlot(G.slot, true);
  emit('loaded');
  log(`${name} opens its doors.`, 'sys');
  log('Send your first company into the Deepmines from the Expeditions tab.', 'sys');
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
    const speed = s.settings.speed ?? 1;

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
on('sheets-request', refreshSheets);

window.IDLE_GUILD = { G, Save, rng, refreshSheets };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
