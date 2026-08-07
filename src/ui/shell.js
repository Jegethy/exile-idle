// shell — Chrome: the tab strip, the top bar, the guild header and the status line.

import { G, emit, guildXpToNext, on, partySlots } from '../state.js';
import { upcoming } from '../charter.js';
import { clamp, fmt, fmtInt, fmtTime, qs, qsa } from '../util.js';

// ===========================================================================
// Chrome
// ===========================================================================

export function wireTabs() {
  for (const nav of qsa('.tabs')) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (btn) selectTab(nav, btn.dataset.tab);
    });
  }
}

export function selectTab(nav, tabId) {
  const panel = nav.parentElement;
  qsa('.tab', nav).forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  qsa('.tab-body', panel).forEach((b) => b.classList.toggle('active', b.id === `tab-${tabId}`));
  // Announced rather than acted on: some panels want a refresh when you arrive,
  // and the orchestrator decides which. Calling them from here would make the
  // chrome depend on every panel it can show.
  emit('tab', tabId);
}

export function gotoTab(tabId) {
  const btn = qs(`.tab[data-tab="${tabId}"]`);
  if (btn) selectTab(btn.parentElement, tabId);
}

/**
 * @param {{saves: () => void, settings: () => void, guide: () => void}} handlers - supplied by the
 *   orchestrator, so the top bar does not have to import the modals it opens.
 */
export function wireTopBar(handlers) {
  qs('#btnSettings').onclick = handlers.settings;
  qs('#btnGuide').onclick = handlers.guide;
  qs('#btnAchievements').onclick = handlers.achievements;
}

export function renderStatus() {
  const s = G.state;
  if (!s) return;
  const runs = s.expeditions.length;
  qs('#statusLeft').textContent = runs
    ? `${runs} expedition${runs === 1 ? '' : 's'} in the field`
    : 'All parties are at the guild hall.';
  qs('#statusRight').textContent =
    `Slot ${G.slot + 1} · ${fmtTime(s.playtime)} played · ${fmtInt(s.stats.kills)} kills`;
}

export function setStatus(msg) { qs('#statusLeft').textContent = msg; }

export function renderGuildBar() {
  const s = G.state;
  if (!s) return;
  const need = guildXpToNext(s.guild.level);
  const pct = clamp((s.guild.xp / need) * 100, 0, 100);
  qs('#guildName').textContent = s.name;
  qs('#guildLevel').textContent = s.guild.level;
  qs('#xpFill').style.width = `${pct}%`;
  qs('#xpText').textContent = `${fmt(s.guild.xp)} / ${fmt(need)}`;
  // The bar spent the whole game meaning nothing. Now that it buys charter
  // privileges, it says which one is coming — a bar filling towards something
  // named is a reason to keep going in a way that a bar filling is not.
  const next = upcoming(s);
  qs('#guildBar').title = next
    ? `Guild Level ${s.guild.level}. Next charter privilege: ${next.def.name}, at Level `
      + `${next.def.level} (${next.levelsAway} to go). See the Guild Hall tab.`
    : `Guild Level ${s.guild.level}. Every charter privilege has been granted.`;
}

export function renderQuickStats() {
  const s = G.state;
  if (!s) return;
  qs('#qsGold').textContent = fmt(s.guild.gold);
  qs('#qsSeals').textContent = s.guild.seals ?? 0;
  qs('#qsEchoes').textContent = s.guild.echoes ?? 0;
  qs('#qsHeroes').textContent = s.heroes.length;
  qs('#qsParties').textContent = `${s.expeditions.length}/${partySlots()}`;
  qs('#qsTier').textContent = s.progress.highestTier;
}
