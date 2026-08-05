// ui/charter — the privilege ladder, and the switches for the ones that act.
//
// Lives on the Guild Hall tab above the upgrades, which is the whole argument
// for the feature standing next to its opposite: the shop that sells numbers
// for gold, and the ladder that hands back time for playing. Two currencies,
// two lists, one screen.
//
// Locked privileges are shown in full — name, level and what they do. A ladder
// you cannot see the rungs of is not a ladder, it is a series of surprises,
// and "Standing Orders at level 15" is a reason to keep going in a way that
// "something at level 15" is not.

import { G, guildXpToNext } from '../state.js';
import { PRIVILEGES, PRIVILEGE_BY_ID } from '../data/charter.js';
import { hasPrivilege, upcoming, takeCharterPending } from '../charter.js';
import { escapeHtml, fmt, qs } from '../util.js';
import { icon } from './icons.js';
import { queueToast } from './toast.js';

const esc = escapeHtml;

const KIND_LABEL = {
  ability: 'Ability',
  capacity: 'Capacity',
  automation: 'Automation',
};

function card(def) {
  const s = G.state;
  const held = hasPrivilege(def.id);
  const on = def.switchable ? !!s.settings?.[def.id] : false;
  const toggle = held && def.switchable
    ? `<label class="charter-switch">
        <input type="checkbox" data-charter-set="${def.id}" ${on ? 'checked' : ''}>
        <span>${on ? 'On' : 'Off'}</span>
      </label>`
    : '';

  return `<div class="charter ${held ? 'held' : 'locked'}" data-priv="${def.id}">
    <div class="charter-icon">${icon(def.icon)}</div>
    <div class="charter-body">
      <div class="charter-top">
        <span class="charter-name">${esc(def.name)}</span>
        <span class="charter-kind">${KIND_LABEL[def.kind] ?? ''}</span>
      </div>
      <div class="charter-desc">${def.desc}</div>
    </div>
    <div class="charter-side">
      <div class="charter-level" title="Granted at Guild Level ${def.level}">Lv ${def.level}</div>
      ${toggle}
    </div>
  </div>`;
}

export function renderCharter() {
  const host = qs('#charterPanel');
  const s = G.state;
  if (!host || !s) return;

  const level = s.guild.level;
  const held = PRIVILEGES.filter((p) => hasPrivilege(p.id)).length;
  const next = upcoming();
  const need = guildXpToNext(level);
  const pct = Math.max(0, Math.min(100, (s.guild.xp / need) * 100));

  host.innerHTML = `
    <div class="charter-head">
      <div class="charter-rank">
        <span class="rank-label">Guild Level</span>
        <span class="rank-value">${level}</span>
      </div>
      <div class="charter-progress">
        <div class="charter-line">
          <b>${held} of ${PRIVILEGES.length}</b> privileges granted
          ${next
    ? `· next: <b>${esc(next.def.name)}</b> at Level ${next.def.level}`
    : '· the charter is complete'}
        </div>
        <div class="ach-bar wide"><i style="width:${pct}%"></i></div>
        <div class="hint">${fmt(Math.floor(s.guild.xp))} / ${fmt(need)} to Level ${level + 1}
          — guild experience comes from every expedition that walks home.</div>
      </div>
    </div>
    <div class="charter-list">${PRIVILEGES.map(card).join('')}</div>`;

  host.querySelectorAll('[data-charter-set]').forEach((el) => {
    el.onchange = () => {
      s.settings[el.dataset.charterSet] = el.checked;
      renderCharter();
    };
  });
}

/**
 * Hands anything newly granted to the shared toast layer.
 *
 * Charter toasts carry no badge where an achievement carries its points: a
 * privilege is not worth a number, and putting one there would invite the
 * comparison.
 */
export function pumpCharterToasts() {
  for (const id of takeCharterPending()) {
    const def = PRIVILEGE_BY_ID[id];
    if (!def) continue;
    queueToast({
      kicker: `Guild Level ${G.state?.guild?.level ?? ''} — charter privilege`,
      name: def.name,
      // The card carries markup for emphasis; a toast wants one plain line.
      desc: def.desc.replace(/<[^>]+>/g, ''),
      icon: def.icon,
      cls: 'charter-toast',
    });
  }
}
