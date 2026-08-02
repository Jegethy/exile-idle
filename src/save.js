// save.js — multi-slot localStorage persistence plus base64/file export.

import { G, SAVE_VERSION, createState, log, emit } from './state.js';
import { rng } from './rng.js';
import { uidCounter, setUidFloor, defaults } from './util.js';
import { TREE, START_IDS } from './passives.js';
import { CLASS_BY_ID } from './data/classes.js';

export const SLOT_COUNT = 3;
const KEY = (slot) => `exileIdle.slot${slot}`;
const SETTINGS_KEY = 'exileIdle.lastSlot';

// ---------------------------------------------------------------------------
// Base64 helpers that survive non-ASCII characters (item names use ’ and é).
// ---------------------------------------------------------------------------

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/** Snapshot of the live state, ready for JSON. */
export function serialize(state = G.state) {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    uidCounter: uidCounter(),
    rng: rng.state(),
    state,
  };
}

/**
 * Rebuilds live state from a payload, filling in anything a newer version
 * added so old saves keep working.
 */
export function deserialize(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Save data is not an object.');
  const data = payload.state ?? payload;
  if (!data.player || !data.equipment) throw new Error('Save data is missing core fields.');

  const fresh = createState(data.name ?? 'Exile');
  const state = defaults(data, fresh);
  state.version = SAVE_VERSION;
  migrate(state);

  // A run in progress can't be trusted across a reload of balance data.
  if (state.combat && state.combat.status !== 'running') state.combat = null;

  if (payload.rng) rng.restore(payload.rng.seed, payload.rng.calls);
  if (payload.uidCounter) setUidFloor(payload.uidCounter);
  return state;
}

/**
 * Brings an older save in line with the current data.
 *
 * The passive tree was rebuilt around per-class start nodes, so saves from
 * before that carry allocated ids that no longer exist. Left alone they would
 * still count as "spent" and silently strand the player's points, so any node
 * we no longer recognise is dropped and refunded.
 */
function migrate(state) {
  if (!CLASS_BY_ID[state.player.class]) state.player.class = 'scion';
  if (!state.passives.ascendancy || typeof state.passives.ascendancy !== 'object') {
    state.passives.ascendancy = {};
  }

  const alloc = state.passives.allocated ?? {};
  let dropped = 0;
  for (const id of Object.keys(alloc)) {
    if (!TREE[id] || START_IDS.has(id)) { delete alloc[id]; dropped++; }
  }
  if (dropped) {
    state.passives.allocated = alloc;
    log(`The passive tree has changed — ${dropped} point${dropped === 1 ? '' : 's'} refunded.`, 'sys');
  }
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export function saveToSlot(slot = G.slot, quiet = false) {
  try {
    const payload = serialize();
    localStorage.setItem(KEY(slot), JSON.stringify(payload));
    localStorage.setItem(SETTINGS_KEY, String(slot));
    G.slot = slot;
    if (!quiet) log(`Game saved to slot ${slot + 1}.`, 'sys');
    emit('saves');
    return true;
  } catch (e) {
    log(`Save failed: ${e.message}`, 'danger');
    return false;
  }
}

export function loadSlot(slot) {
  const raw = localStorage.getItem(KEY(slot));
  if (!raw) return false;
  try {
    const state = deserialize(JSON.parse(raw));
    G.state = state;
    G.slot = slot;
    localStorage.setItem(SETTINGS_KEY, String(slot));
    emit('loaded');
    return true;
  } catch (e) {
    log(`Could not load slot ${slot + 1}: ${e.message}`, 'danger');
    return false;
  }
}

export function deleteSlot(slot) {
  localStorage.removeItem(KEY(slot));
  emit('saves');
}

export function slotExists(slot) { return localStorage.getItem(KEY(slot)) !== null; }

/** Summary of every slot, for the save manager UI. */
export function listSlots() {
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const raw = localStorage.getItem(KEY(i));
    if (!raw) { out.push({ slot: i, empty: true }); continue; }
    try {
      const p = JSON.parse(raw);
      const s = p.state ?? p;
      out.push({
        slot: i, empty: false,
        name: s.name ?? 'Exile',
        level: s.player?.level ?? 1,
        tier: s.atlas?.highestTier ?? 0,
        playtime: s.playtime ?? 0,
        savedAt: p.savedAt ?? 0,
        kills: s.stats?.kills ?? 0,
      });
    } catch {
      out.push({ slot: i, empty: false, corrupt: true, name: 'Corrupt save' });
    }
  }
  return out;
}

export function lastUsedSlot() {
  const v = Number(localStorage.getItem(SETTINGS_KEY));
  return Number.isInteger(v) && v >= 0 && v < SLOT_COUNT ? v : 0;
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/** Base64 string suitable for pasting into a text box. */
export function exportSave() {
  return toBase64(JSON.stringify(serialize()));
}

/** Accepts either a base64 export string or raw JSON. */
export function importSave(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new Error('Nothing to import.');
  let json;
  if (trimmed.startsWith('{')) {
    json = trimmed;
  } else {
    json = fromBase64(trimmed);
  }
  const state = deserialize(JSON.parse(json));
  G.state = state;
  emit('loaded');
  return true;
}

/** Triggers a .json file download of the current save. */
export function downloadSave() {
  const payload = serialize();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `exile-idle-${G.state.name}-lv${G.state.player.level}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a File object chosen from an <input type="file">. */
export function uploadSave(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { importSave(reader.result); resolve(true); } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}
