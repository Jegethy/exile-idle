// game.js — boot sequence, the fixed-step main loop, auto-save and auto-run.

import { G, newCharacter, log, emit, on } from './state.js';
import { rng } from './rng.js';
import * as Save from './save.js';
import { tickCombat, startMap, refreshDerived } from './combat.js';
import { addItem } from './inventory.js';
import { grantStarterMap } from './maps.js';
import { initUI, renderAll, tick as uiTick, openNewCharacter } from './ui.js';

const AUTOSAVE_INTERVAL = 30;    // seconds
const UI_INTERVAL = 0.1;         // seconds between light UI refreshes
const MAX_STEP = 0.25;           // clamp so tab-switching doesn't fast-forward wildly
const AUTORUN_DELAY = 1.5;       // pause between automatic map runs

let last = 0;
let autosaveTimer = 0;
let uiTimer = 0;
let autorunTimer = 0;

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
    G.state = newCharacter('Exile');
    rng.seed(Date.now() >>> 0);
  }

  // A brand-new save has no character yet, so the world stays frozen — and
  // unsaved — until the player has picked a class and a name.
  G.paused = fresh;

  refreshDerived();
  initUI();

  if (fresh) {
    openNewCharacter(true);
  } else {
    log(`Welcome back, ${G.state.name}.`, 'sys');
    ensureNotStuck();
  }

  renderAll();

  last = performance.now();
  requestAnimationFrame(loop);

  window.addEventListener('beforeunload', () => { if (!G.paused) Save.saveToSlot(G.slot, true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (!G.paused) Save.saveToSlot(G.slot, true); }
    else last = performance.now();       // don't bank hidden time as one huge step
  });
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

    const speed = s.settings.combatSpeed ?? 1;
    if (s.combat && s.combat.status === 'running') {
      // Sub-stepping keeps fast speeds from skipping attack timers.
      const steps = Math.min(6, Math.ceil(speed));
      const step = (dt * speed) / steps;
      for (let i = 0; i < steps; i++) {
        if (!s.combat || s.combat.status !== 'running') break;
        tickCombat(step);
      }
    } else {
      // Runs even with auto-run disabled, so a manual player is never stranded.
      ensureNotStuck();
      handleAutoRun(dt);
    }

    autosaveTimer += dt;
    if (autosaveTimer >= AUTOSAVE_INTERVAL) {
      autosaveTimer = 0;
      Save.saveToSlot(G.slot, true);
    }
  }

  uiTimer += dt;
  if (uiTimer >= UI_INTERVAL) {
    uiTimer = 0;
    uiTick();
  }

  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Auto-run
// ---------------------------------------------------------------------------

function handleAutoRun(dt) {
  const s = G.state;
  if (!s.settings.autoRun) return;
  autorunTimer += dt;
  if (autorunTimer < AUTORUN_DELAY) return;
  autorunTimer = 0;
  if (!s.maps.length) return;

  // Prefer the highest tier at or below the adaptive safe ceiling; that ceiling
  // rises on every clear and drops on death, so unattended play self-corrects.
  const ceiling = s.atlas.safeTier ?? 1;
  const sorted = s.maps.slice().sort((a, b) => (b.tier - a.tier) || (b.mods.length - a.mods.length));
  const best = sorted.find((m) => m.tier <= ceiling) ?? sorted[sorted.length - 1];
  if (best) startMap(best.uid);
}

/**
 * Running out of maps would strand the player with nothing to do, so the Atlas
 * always keeps a Tier 1 in reserve. T1 is the floor of the reward curve, so
 * this costs nothing in balance terms and removes the only true dead end.
 */
function ensureNotStuck() {
  const s = G.state;
  if (s.maps.length > 0) return;
  addItem(grantStarterMap());
  log('The Atlas offers a fresh path. (Tier 1 map granted.)', 'sys');
  emit('maps');
}

// ---------------------------------------------------------------------------
// Re-render on load and expose a small debug handle.
// ---------------------------------------------------------------------------

on('loaded', () => { refreshDerived(); autorunTimer = 0; });

window.EXILE = { G, Save, rng, refreshDerived };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
