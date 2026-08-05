// ui/toast.js — the bottom-right notification, and the queue behind it.
//
// Lifted out of ui/achievements.js when the Charter arrived and needed the
// same thing. Two systems raising two visually different toasts, each with its
// own queue and its own idea of how many may be on screen, is how you end up
// with a notification covering a notification.
//
// One layer, one queue, one limit.

import { escapeHtml, qs } from '../util.js';
import { icon } from './icons.js';

const esc = escapeHtml;

/** How long a toast stays on screen. */
const TOAST_SECONDS = 6;

/**
 * How many may be on screen at once.
 *
 * A single sweep can unlock a dozen things — clearing a tier ticks several
 * achievement ladders at the same moment — and a dozen toasts is a wall, not a
 * notification. The rest wait their turn.
 */
const MAX_VISIBLE = 3;

const showing = [];
const queued = [];

function host() {
  let el = qs('#toastLayer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastLayer';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Queues a toast.
 *
 * @param {object} t
 * @param {string} t.kicker  small line above the name — what kind of thing this is
 * @param {string} t.name
 * @param {string} t.desc
 * @param {string} t.icon    symbol id from icons.js
 * @param {string} [t.badge] short right-hand marker: points, a level, nothing
 * @param {string} [t.cls]   extra class, so one kind can be recoloured
 */
export function queueToast(t) {
  queued.push(t);
}

/**
 * Puts whatever fits on screen and retires whatever has had its time.
 *
 * Driven from the interface tick rather than from an event, for the same
 * reason the achievement sweep is polled: one queue, one drain, and no chance
 * of a notification arriving while a window is mid-render.
 */
export function pumpToasts() {
  expireToasts();
  while (showing.length < MAX_VISIBLE && queued.length) show(queued.shift());
}

function show(t) {
  if (!t) return;
  const el = document.createElement('div');
  el.className = `ach-toast ${t.cls ?? ''}`;
  el.innerHTML = `
    <div class="toast-glow"></div>
    <div class="toast-inner">
      <div class="ach-icon">${icon(t.icon)}</div>
      <div class="toast-body">
        <div class="toast-kicker">${esc(t.kicker ?? '')}</div>
        <div class="toast-name">${esc(t.name ?? '')}</div>
        <div class="toast-desc">${esc(t.desc ?? '')}</div>
      </div>
      ${t.badge ? `<div class="ach-points">${esc(String(t.badge))}</div>` : ''}
    </div>`;
  const entry = { el, until: performance.now() + TOAST_SECONDS * 1000 };
  el.onclick = () => {
    el.remove();
    const i = showing.indexOf(entry);
    if (i >= 0) showing.splice(i, 1);
  };
  host().appendChild(el);
  // Next frame, so the entry transition actually runs.
  requestAnimationFrame(() => el.classList.add('in'));
  showing.push(entry);
}

function expireToasts() {
  const now = performance.now();
  for (let i = showing.length - 1; i >= 0; i--) {
    if (now < showing[i].until) continue;
    const { el } = showing[i];
    el.classList.remove('in');
    setTimeout(() => el.remove(), 400);
    showing.splice(i, 1);
  }
}

/** Clears anything on screen — used when switching guilds. */
export function clearToasts() {
  for (const { el } of showing) el.remove();
  showing.length = 0;
  queued.length = 0;
}

/** How many are still waiting for room. For tests. */
export function queuedToasts() {
  return queued.length;
}
