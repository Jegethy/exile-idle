// save.js — multi-slot localStorage persistence plus base64/file export.

import { G, SAVE_VERSION, createState, log, emit, vaultCapacity } from './state.js';
import { rng } from './rng.js';
import { uidCounter, setUidFloor, defaults } from './util.js';
import { CLASS_BY_ID, RETIRED_CLASSES } from './data/heroclasses.js';

export const SLOT_COUNT = 3;
const KEY = (slot) => `idleGuild.slot${slot}`;
const SETTINGS_KEY = 'idleGuild.lastSlot';

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
  // Exile Idle saves (version < 10) describe a different game entirely; there
  // is nothing sensible to migrate, so they are rejected rather than mangled.
  if (typeof payload.version === 'number' && payload.version < 10) {
    throw new Error('That save is from Exile Idle and cannot be loaded into Idle Guild.');
  }
  if (!data.guild || !Array.isArray(data.heroes)) throw new Error('Save data is missing core fields.');

  const fresh = createState(data.name ?? 'The Wayfarers');
  const state = defaults(data, fresh);
  state.version = SAVE_VERSION;
  migrate(state);

  if (payload.rng) rng.restore(payload.rng.seed, payload.rng.calls);
  if (payload.uidCounter) setUidFloor(payload.uidCounter);
  return state;
}

/** Brings an older Idle Guild save in line with the current data. */
function migrate(state) {
  const notes = [];

  const reclassed = {};
  for (const hero of state.heroes ?? []) {
    // The class rework retired three archetypes. Move those heroes to the
    // nearest survivor so an existing roster keeps its shape.
    if (RETIRED_CLASSES[hero.classId]) {
      reclassed[hero.classId] = (reclassed[hero.classId] ?? 0) + 1;
      hero.classId = RETIRED_CLASSES[hero.classId];
    }
    if (!CLASS_BY_ID[hero.classId]) hero.classId = 'rogue';
    if (hero.stamina === undefined) hero.stamina = 100;
    if (!Array.isArray(hero.traits)) hero.traits = [];
  }
  for (const [from, n] of Object.entries(reclassed)) {
    notes.push(`${n} ${from}${n === 1 ? '' : 's'} became ${RETIRED_CLASSES[from]}s in the class rework.`);
  }

  // A save that has already played is past the tutorial, whatever it says.
  if (!state.tutorial) state.tutorial = { step: 0, done: true, skipped: false };
  if (!state.tutorial.done && (state.stats?.runs ?? 0) > 0) state.tutorial.done = true;

  // Expeditions hold live combat state that balance changes can invalidate, so
  // they do not survive a load. The party is treated as recalled rather than
  // wiped, which means they walk out with the haul they were carrying — losing
  // it to a reload would be a punishment for closing the tab.
  //
  // This banks the haul directly instead of calling into expedition.js, whose
  // reward helpers all operate on the live G.state; during a load the state
  // being repaired is still detached.
  if (state.expeditions?.length) {
    let gold = 0; let items = 0;
    for (const run of state.expeditions) {
      const h = run.haul;
      if (!h) continue;
      gold += h.gold ?? 0;
      state.guild.gold += h.gold ?? 0;
      for (const [id, n] of Object.entries(h.materials ?? {})) {
        state.materials[id] = (state.materials[id] ?? 0) + n;
      }
      for (const item of h.items ?? []) {
        if (state.vault.length >= vaultCapacity(state)) break;
        state.vault.push(item);
        items++;
      }
      for (const [heroUid, xp] of Object.entries(h.heroXp ?? {})) {
        const hero = state.heroes.find((x) => x.uid === heroUid);
        if (hero) hero.xp += xp;
      }
    }
    notes.push(`${state.expeditions.length} expedition(s) were recalled by the update`
      + (gold || items ? ` — they kept ${Math.round(gold)} gold and ${items} item(s).` : '.'));
    state.expeditions = [];
  }

  if (notes.length) {
    Object.defineProperty(state, '__notes', {
      value: notes, enumerable: false, writable: true, configurable: true,
    });
  }
}

/** Emits any migration messages now that G.state is live. */
function flushMigrationNotes() {
  const notes = G.state?.__notes;
  if (!notes) return;
  for (const n of notes) log(n, 'danger');
  delete G.state.__notes;
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
    flushMigrationNotes();
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
        name: s.name ?? 'Guild',
        level: s.guild?.level ?? 1,
        tier: s.progress?.highestTier ?? 0,
        playtime: s.playtime ?? 0,
        savedAt: p.savedAt ?? 0,
        kills: s.stats?.kills ?? 0,
        heroes: s.heroes?.length ?? 0,
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
  flushMigrationNotes();
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
  a.download = `idle-guild-${G.state.name}-g${G.state.guild.level}-${stamp}.json`;
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
