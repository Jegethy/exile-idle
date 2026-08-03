// log — The guild log and its category filters.

import { G, log } from '../state.js';
import { escapeHtml, qs, qsa } from '../util.js';
import { ui } from './state.js';

const LOG_GROUPS = {
  loot: new Set(['loot', 'unique', 'gold', 'xp']),
  combat: new Set(['hit', 'crit', 'kill', 'danger']),
  story: new Set(['sys', 'boss', 'unique']),
};

// ===========================================================================
// Log
// ===========================================================================

export function wireLogFilters() {
  const host = qs('#logFilters');
  const filters = [['all', 'All'], ['loot', 'Loot'], ['combat', 'Combat'], ['story', 'Guild']];
  host.innerHTML = filters.map(([id, label]) =>
    `<button class="btn tiny ${id === 'all' ? 'active' : ''}" data-filter="${id}">${label}</button>`).join('');
  host.onclick = (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    ui.logFilter = b.dataset.filter;
    qsa('[data-filter]', host).forEach((x) => x.classList.toggle('active', x === b));
    renderLog();
  };
}

export function renderLog() {
  const host = qs('#guildLog');
  const s = G.state;
  if (!host || !s) return;
  const group = LOG_GROUPS[ui.logFilter];
  const atBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 40;
  host.innerHTML = s.log.filter((l) => !group || group.has(l.cls)).slice(-160)
    .map((l) => `<div class="l ${l.cls}">${escapeHtml(l.msg)}</div>`).join('');
  if (atBottom) host.scrollTop = host.scrollHeight;
}
