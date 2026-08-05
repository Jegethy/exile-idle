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
import { queueToast } from './toast.js';

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

/**
 * Hands anything newly unlocked to the shared toast layer.
 *
 * The layer itself lives in ui/toast.js — the Charter raises the same kind of
 * notification, and two queues with two separate limits is how a notification
 * ends up covering a notification.
 */
export function pumpAchievementToasts() {
  for (const id of takePending()) {
    const def = ACHIEVEMENT_BY_ID[id];
    if (!def) continue;
    queueToast({
      kicker: 'Achievement earned',
      name: def.name,
      desc: def.desc,
      icon: def.icon,
      badge: def.points,
    });
  }
}

export { progressOf, fractionOf };
