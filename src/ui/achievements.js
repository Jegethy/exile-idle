// ui/achievements.js — the score window and the unlock toast.
//
// Two separate jobs that share a data source. The window is a browsable list
// grouped by category, headed by the one number the whole system exists to
// make go up. The toast is what tells you the number moved without making you
// go and look.

import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, CATEGORIES, TOTAL_POINTS, achievementsIn,
} from '../data/achievements.js';
import {
  achievementList, score, isUnlocked, progressOf, fractionOf, takePending,
} from '../achievements.js';
import { escapeHtml, fmtInt, qs } from '../util.js';
import { openModal } from './modals.js';
import { icon } from './icons.js';

const esc = escapeHtml;

let current = 'summary';

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

/** Date an achievement was earned, in the short form a plaque wants. */
function earnedOn(at) {
  if (!at) return '';
  const d = new Date(at);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

/**
 * One achievement.
 *
 * Locked ones still show their name and what they take, because an achievement
 * you cannot see is not a goal. Progress bars appear only where they help — a
 * one-of-one has nothing useful to draw.
 */
function plaque(entry) {
  const { def } = entry;
  const pct = Math.round(entry.fraction * 100);
  const showBar = def.goal > 1 && !entry.unlocked;
  return `<div class="ach ${entry.unlocked ? 'earned' : 'locked'}" data-ach="${def.id}">
    <div class="ach-icon">${icon(def.icon)}</div>
    <div class="ach-body">
      <div class="ach-top">
        <span class="ach-name">${esc(def.name)}</span>
        ${entry.unlocked
    ? `<span class="ach-date">${earnedOn(entry.at)}</span>`
    : `<span class="ach-frac">${fmtInt(entry.progress)} / ${fmtInt(def.goal)}</span>`}
      </div>
      <div class="ach-desc">${esc(def.desc)}</div>
      ${showBar ? `<div class="ach-bar"><i style="width:${pct}%"></i></div>` : ''}
    </div>
    <div class="ach-points" title="${def.points} points">${def.points}</div>
  </div>`;
}

function categoryStats(catId) {
  const defs = achievementsIn(catId);
  const done = defs.filter((d) => isUnlocked(d.id));
  return {
    done: done.length,
    total: defs.length,
    points: done.reduce((n, d) => n + d.points, 0),
    max: defs.reduce((n, d) => n + d.points, 0),
  };
}

function summaryPage() {
  const list = achievementList();
  const recent = list.filter((x) => x.unlocked)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, 5);
  const earned = list.filter((x) => x.unlocked).length;

  return `
    <h3 class="g-h">Recently earned</h3>
    ${recent.length
    ? `<div class="ach-list">${recent.map(plaque).join('')}</div>`
    : '<p class="g-p">Nothing yet. Send a party out.</p>'}

    <h3 class="g-h">Progress</h3>
    <div class="ach-overview">
      <div class="ach-ov total">
        <span class="ov-name">Achievements earned</span>
        <div class="ach-bar"><i style="width:${(earned / ACHIEVEMENTS.length) * 100}%"></i></div>
        <span class="ov-count">${earned} / ${ACHIEVEMENTS.length}</span>
      </div>
      ${CATEGORIES.map((c) => {
    const st = categoryStats(c.id);
    return `<div class="ach-ov">
          <span class="ov-name">${icon(c.icon, 'tiny')} ${esc(c.name)}</span>
          <div class="ach-bar"><i style="width:${(st.done / Math.max(1, st.total)) * 100}%"></i></div>
          <span class="ov-count">${st.done} / ${st.total}</span>
        </div>`;
  }).join('')}
    </div>`;
}

function categoryPage(catId) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  const st = categoryStats(catId);
  const entries = achievementList().filter((x) => x.def.category === catId);
  // Earned first, then whatever is closest to done — so the next thing to go
  // for is near the top rather than buried at the bottom of a ladder.
  entries.sort((a, b) => (b.unlocked - a.unlocked)
    || (b.unlocked ? (b.at ?? 0) - (a.at ?? 0) : b.fraction - a.fraction));

  return `
    <h3 class="g-h">${esc(cat.name)}
      <span class="g-h-sub">${st.done} of ${st.total} · ${st.points} of ${st.max} points</span>
    </h3>
    ${catId === 'feats'
    ? '<p class="g-p">One-off achievements for doing a particular thing, rather than doing '
      + 'a thing many times. There is no ladder to climb here.</p>'
    : ''}
    <div class="ach-list">${entries.map(plaque).join('')}</div>`;
}

export function renderAchievements() {
  const host = qs('#achievementsBody');
  if (!host) return;
  const pts = score();

  const tabs = [{ id: 'summary', name: 'Summary', icon: 'star' }, ...CATEGORIES];

  host.innerHTML = `
    <div class="ach-score">
      <div class="score-emblem">
        <span class="score-value">${fmtInt(pts)}</span>
        <span class="score-label">Score</span>
      </div>
      <div class="score-side">
        <div class="score-of">of ${fmtInt(TOTAL_POINTS)} possible</div>
        <div class="ach-bar wide"><i style="width:${(pts / TOTAL_POINTS) * 100}%"></i></div>
      </div>
    </div>
    <nav class="g-tabs">${tabs.map((t) => `<button class="g-tab ${t.id === current ? 'active' : ''}"
      data-page="${t.id}">${esc(t.name)}</button>`).join('')}</nav>
    <div class="g-page" id="achPage">${current === 'summary' ? summaryPage() : categoryPage(current)}</div>`;

  host.querySelector('.g-tabs').onclick = (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    current = b.dataset.page;
    renderAchievements();
    qs('#achievementsBody').scrollTop = 0;
  };
}

export function openAchievements(pageId = null) {
  if (pageId) current = pageId;
  renderAchievements();
  openModal('modalAchievements');
}

// ---------------------------------------------------------------------------
// The toast
// ---------------------------------------------------------------------------

/** How long an unlock stays on screen. */
const TOAST_SECONDS = 6;

/**
 * How many may be on screen at once.
 *
 * A single sweep can unlock a dozen things — clearing a tier ticks several
 * ladders at the same moment — and a dozen toasts is a wall, not a
 * notification. The rest wait their turn.
 */
const MAX_VISIBLE = 3;

const showing = [];
const queued = [];

/**
 * Drains anything the engine has unlocked and puts it on screen.
 *
 * Called from the interface tick rather than from an event, for the same
 * reason the sweep is polled: one queue, one drain, and no chance of a
 * notification being emitted while the window is mid-render.
 */
export function pumpToasts() {
  for (const id of takePending()) queued.push(id);
  expireToasts();
  while (showing.length < MAX_VISIBLE && queued.length) {
    showToast(ACHIEVEMENT_BY_ID[queued.shift()]);
  }
}

function host() {
  let el = qs('#toastLayer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastLayer';
    document.body.appendChild(el);
  }
  return el;
}

function showToast(def) {
  if (!def) return;
  const el = document.createElement('div');
  el.className = 'ach-toast';
  el.innerHTML = `
    <div class="toast-glow"></div>
    <div class="toast-inner">
      <div class="ach-icon">${icon(def.icon)}</div>
      <div class="toast-body">
        <div class="toast-kicker">Achievement earned</div>
        <div class="toast-name">${esc(def.name)}</div>
        <div class="toast-desc">${esc(def.desc)}</div>
      </div>
      <div class="ach-points">${def.points}</div>
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

/** How many unlocks are still waiting for room. For tests. */
export function queuedToasts() {
  return queued.length;
}

export { progressOf, fractionOf };
