// sheets.js — the single way to refresh cached hero stat sheets.
//
// `G.sheets` is a cache keyed by hero uid, and everything that reads a hero's
// numbers — the roster, the hero panel, party totals, combat itself — reads it
// rather than recomputing. That makes it fast, and it makes staleness silent:
// nothing looks broken, the numbers are just wrong.
//
// So there is exactly one entry point. Anything that changes what a hero's
// stats depend on (gear, level, traits, guild upgrades) calls refreshSheets(),
// which rebuilds the cache and *then* announces it. Emitting 'sheets' by hand
// only redraws the UI from whatever the cache already held.

import { G, emit } from './state.js';
import { rebuildSheets } from './stats.js';

/** Rebuilds every hero's derived sheet, then tells the UI to redraw. */
export function refreshSheets() {
  if (!G.state) return;
  rebuildSheets(G.state, G.sheets);
  emit('sheets');
}
