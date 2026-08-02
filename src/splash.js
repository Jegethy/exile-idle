// splash.js — the title screen: crest, save slots, and guild creation.
//
// Nothing loads automatically any more. The game always opens here, so a
// returning player picks which guild to run and a new one is walked straight
// into naming their first.

import { G, log } from './state.js';
import { fmt, fmtInt, fmtTime, fmtAgo, qs, qsa, escapeHtml } from './util.js';
import * as Save from './save.js';

let onStart = null;      // (slot) => void      — continue an existing guild
let onFound = null;      // (name, slot) => void — found a new one
let pendingSlot = 0;

/** Wires the splash to the game. Called once from game.js during boot. */
export function initSplash(handlers) {
  onStart = handlers.onStart;
  onFound = handlers.onFound;

  qs('#splashBody').addEventListener('click', onBodyClick);
  qs('#splashBody').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'guildNameInput') confirmFound();
  });
}

export function isSplashOpen() {
  return !qs('#splash').classList.contains('hidden');
}

/** Opens the title screen, choosing the right view for the player. */
export function showSplash() {
  const slots = Save.listSlots();
  qs('#splash').classList.remove('hidden');
  document.body.classList.add('splash-open');

  // A brand-new player has nothing to choose between, so skip straight to
  // naming their first guild rather than showing three empty boxes.
  if (slots.every((s) => s.empty)) showCreate(0, true);
  else showSlots();
}

export function hideSplash() {
  qs('#splash').classList.add('hidden');
  document.body.classList.remove('splash-open');
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function showSlots() {
  const slots = Save.listSlots();
  qs('#splashBody').innerHTML = `
    <h2 class="splash-h">Choose Your Guild</h2>
    <div class="slot-grid">${slots.map(slotCard).join('')}</div>
    <p class="splash-note">Saves live in this browser. Export a copy from the
      in-game Saves menu if you want to keep it somewhere safer.</p>`;
}

function slotCard(s) {
  if (s.corrupt) {
    return `<div class="sl-card corrupt">
      <div class="sl-head"><span class="sl-num">Slot ${s.slot + 1}</span>
        <span class="sl-tag bad">Corrupt</span></div>
      <div class="sl-name">Unreadable save</div>
      <div class="sl-meta">This slot could not be parsed.</div>
      <div class="sl-actions"><button class="btn danger" data-del="${s.slot}">Delete</button></div>
    </div>`;
  }
  if (s.empty) {
    return `<div class="sl-card empty">
      <div class="sl-head"><span class="sl-num">Slot ${s.slot + 1}</span>
        <span class="sl-tag">Empty</span></div>
      <div class="sl-name muted">No guild here</div>
      <div class="sl-meta">Found a new company and start from three heroes.</div>
      <div class="sl-actions"><button class="btn primary" data-new="${s.slot}">Found a Guild</button></div>
    </div>`;
  }
  return `<div class="sl-card">
    <div class="sl-head"><span class="sl-num">Slot ${s.slot + 1}</span>
      <span class="sl-tag good">Guild ${s.level}</span></div>
    <div class="sl-name">${escapeHtml(s.name)}</div>
    <div class="sl-meta">
      <span>${fmtInt(s.heroes ?? 0)} heroes</span>
      <span>Tier ${s.tier}</span>
      <span>${fmtInt(s.kills)} kills</span>
    </div>
    <div class="sl-meta dim">
      <span>${fmtTime(s.playtime)} played</span>
      <span>saved ${fmtAgo(s.savedAt)}</span>
    </div>
    <div class="sl-actions">
      <button class="btn primary" data-play="${s.slot}">Continue</button>
      <button class="btn danger" data-del="${s.slot}">Delete</button>
    </div>
  </div>`;
}

/** The naming form. `first` tailors the copy for a brand-new player. */
function showCreate(slot, first = false) {
  pendingSlot = slot;
  qs('#splashBody').innerHTML = `
    <h2 class="splash-h">${first ? 'Found Your Guild' : `Found a Guild — Slot ${slot + 1}`}</h2>
    <p class="splash-sub">${first
    ? 'Name your company. Three heroes have already signed on, and there is enough '
      + 'gold to send them somewhere unwise.'
    : 'This will start a fresh guild in slot ' + (slot + 1) + '.'}</p>
    <div class="splash-form">
      <input type="text" id="guildNameInput" class="splash-input" maxlength="24"
             placeholder="The Wayfarers" autocomplete="off" spellcheck="false">
      <button class="btn primary big" data-found="1">Open for Business</button>
    </div>
    ${first ? '' : '<div class="splash-links"><a href="#" data-back="1">Back to slots</a></div>'}
    <p class="splash-note">Your guild is saved to slot ${slot + 1} automatically.</p>`;
  setTimeout(() => qs('#guildNameInput')?.focus(), 60);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function onBodyClick(e) {
  const el = e.target.closest('[data-play],[data-new],[data-del],[data-found],[data-back]');
  if (!el) return;
  e.preventDefault();

  if (el.dataset.play !== undefined) {
    const slot = Number(el.dataset.play);
    if (Save.loadSlot(slot)) { hideSplash(); onStart?.(slot); }
    return;
  }
  if (el.dataset.new !== undefined) { showCreate(Number(el.dataset.new)); return; }
  if (el.dataset.back !== undefined) { showSlots(); return; }
  if (el.dataset.found !== undefined) { confirmFound(); return; }
  if (el.dataset.del !== undefined) confirmDelete(Number(el.dataset.del));
}

function confirmFound() {
  const input = qs('#guildNameInput');
  const name = (input?.value || 'The Wayfarers').trim().slice(0, 24) || 'The Wayfarers';
  hideSplash();
  onFound?.(name, pendingSlot);
}

/**
 * Deleting is irreversible and the only destructive thing on this screen, so it
 * names the guild being destroyed rather than just asking "are you sure".
 */
function confirmDelete(slot) {
  const info = Save.listSlots()[slot];
  const label = info?.corrupt ? 'this unreadable save' : `"${info?.name ?? 'this guild'}"`;
  const detail = info && !info.empty && !info.corrupt
    ? ` Guild level ${info.level}, ${info.heroes ?? 0} heroes and ${fmtTime(info.playtime)} of play `
      + 'will be gone permanently.'
    : '';

  splashConfirm(
    `Delete ${label}?`,
    `Slot ${slot + 1} will be erased.${detail} This cannot be undone — export a copy first `
    + 'if you might want it back.',
    'Delete permanently',
    () => {
      Save.deleteSlot(slot);
      const slots = Save.listSlots();
      if (slots.every((s) => s.empty)) showCreate(0, true);
      else showSlots();
    },
  );
}

/**
 * The splash sits below the modal layer, so it can reuse the game's confirm
 * dialog instead of shipping a second one.
 */
function splashConfirm(title, text, yesLabel, cb) {
  qs('#confirmTitle').textContent = title;
  qs('#confirmText').textContent = text;
  const yes = qs('#btnConfirmYes');
  const no = qs('#btnConfirmNo');
  yes.textContent = yesLabel;

  qs('#modalBackdrop').classList.remove('hidden');
  qsa('.modal').forEach((m) => m.classList.toggle('hidden', m.id !== 'modalConfirm'));

  const close = () => {
    yes.textContent = 'Confirm';
    yes.removeEventListener('click', onYes, true);
    no.removeEventListener('click', onNo, true);
    qs('#modalBackdrop').classList.add('hidden');
    qsa('.modal').forEach((m) => m.classList.add('hidden'));
  };
  const onYes = (e) => { e.stopPropagation(); close(); cb(); };
  const onNo = (e) => { e.stopPropagation(); close(); };
  yes.addEventListener('click', onYes, true);
  no.addEventListener('click', onNo, true);
}

/** Used by the in-game Saves menu to come back here. */
export function returnToTitle() {
  showSplash();
  log('Returned to the title screen.', 'sys');
}
