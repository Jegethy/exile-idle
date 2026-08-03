// parties — Party building and the flask assigned to each party.

import { CLASS_BY_ID, RARITY_BY_ID } from '../data/heroclasses.js';
import { FLASKS } from '../data/recipes.js';
import { dispatch } from '../expedition.js';
import { MAX_MEMBERS, createParty, deleteParty, partyById, partyMembers } from '../heroes.js';
import { G, on, partySlots } from '../state.js';
import { guildEffects } from '../data/upgrades.js';
import { escapeHtml, fmt, qs } from '../util.js';
import { confirmAction } from './modals.js';
import { openHeroModal } from './roster.js';
import { setStatus } from './shell.js';

// ===========================================================================
// Parties
// ===========================================================================

export function renderParties() {
  const s = G.state;
  const host = qs('#partyList');
  if (!host || !s) return;

  qs('#partyHeader').innerHTML = `
    <div class="panel-head">
      <span class="hint">${s.parties.length} part${s.parties.length === 1 ? 'y' : 'ies'} ·
        ${partySlots()} charter${partySlots() === 1 ? '' : 's'}</span>
      <button class="btn tiny" id="btnNewParty">New Party</button>
    </div>`;
  qs('#btnNewParty').onclick = () => { createParty(); setStatus('Party created.'); };

  if (!s.parties.length) {
    host.innerHTML = '<div class="empty-note">No parties yet.</div>';
    return;
  }

  const autoUnlocked = !!guildEffects(s.upgrades).autoDispatch;
  host.innerHTML = s.parties.map((p) => {
    const members = partyMembers(p);
    const running = s.expeditions.some((e) => e.partyId === p.id);
    const dps = members.reduce((a, h) => a + (G.sheets[h.uid]?.dps ?? 0), 0);
    const life = members.reduce((a, h) => a + (G.sheets[h.uid]?.life ?? 0), 0);
    const roles = members.map((h) => CLASS_BY_ID[h.classId].role);
    return `<div class="party-card ${running ? 'running' : ''}">
      <div class="party-top">
        <span class="party-name">${escapeHtml(p.name)}</span>
        <span class="hint">${members.length}/${MAX_MEMBERS}</span>
      </div>
      <div class="party-stats">
        <span><b>${fmt(dps)}</b> party dps</span>
        <span><b>${fmt(life)}</b> total life</span>
      </div>
      <div class="party-roles">
        ${roles.length ? roles.map((r) => `<span class="role role-${r.toLowerCase()}">${r}</span>`).join('')
    : '<span class="hint">Empty — assign heroes from the Roster.</span>'}
        ${roles.length && !roles.includes('Tank') && !G.state.settings.hideCompWarnings
    ? '<span class="warn" title="Nothing will hold the front line. Fine for content you outgear.">no tank</span>' : ''}
        ${roles.length && !roles.includes('Healer') && !G.state.settings.hideCompWarnings
    ? '<span class="warn" title="Nobody will mend the party. Fine for content you outgear.">no healer</span>' : ''}
      </div>
      <div class="party-members">${members.map((h) => `<span class="pm ${RARITY_BY_ID[h.rarity].cls}"
        data-hero="${h.uid}"><i class="pm-dot"></i>${escapeHtml(h.name)}
        <small>Lv${h.level}</small></span>`).join('')}</div>
      ${flaskPicker(p)}
      <div class="row">
        ${autoUnlocked ? `<label class="party-auto" title="Re-run this party's last expedition without being told.
Each party decides for itself, so one can farm while another waits for you.">
          <input type="checkbox" data-partyauto="${p.id}" ${p.autoRedeploy !== false ? 'checked' : ''}>
          <span>Auto-redeploy</span></label>` : ''}
        ${running ? '<span class="tag out">On expedition</span>'
    : `<button class="btn tiny danger" data-delparty="${p.id}">Disband</button>`}</div>
    </div>`;
  }).join('');

  host.onchange = (e) => {
    const auto = e.target.closest('[data-partyauto]');
    if (!auto) return;
    const party = partyById(auto.dataset.partyauto);
    if (party) party.autoRedeploy = auto.checked;
  };

  host.onclick = (e) => {
    const del = e.target.closest('[data-delparty]');
    if (del) {
      confirmAction('Disband this party?', 'Its members become unassigned. No heroes are lost.',
        () => deleteParty(del.dataset.delparty));
      return;
    }
    const flask = e.target.closest('[data-setflask]');
    if (flask) {
      const party = partyById(flask.dataset.party);
      if (party) {
        const id = flask.dataset.setflask;
        party.flask = party.flask === id ? null : (id || null);
        renderParties();
        setStatus(party.flask
          ? `${party.name} will drink ${FLASKS.find((f) => f.id === party.flask).name} on dispatch.`
          : `${party.name} will carry no flask.`);
      }
      return;
    }
    const hero = e.target.closest('[data-hero]');
    if (hero) openHeroModal(hero.dataset.hero);
  };
}

/**
 * Flasks brewed in the workshop are assigned per party and drunk on dispatch,
 * so the good ones are a decision about which company gets them.
 */
function flaskPicker(party) {
  const stock = FLASKS.filter((f) => (G.state.flasks[f.id] ?? 0) > 0);
  if (!stock.length && !party.flask) return '';
  const chosen = party.flask ? FLASKS.find((f) => f.id === party.flask) : null;
  return `<div class="flask-picker">
    <span class="fp-label">Flask</span>
    ${stock.map((f) => `<button class="btn tiny ${party.flask === f.id ? 'active' : ''}"
        data-setflask="${f.id}" data-party="${party.id}"
        title="${escapeHtml(f.effectText)}">${escapeHtml(f.name.replace(/^(Flask|Elixir) of /, ''))}
        <small>${G.state.flasks[f.id]}</small></button>`).join('')}
    ${chosen && !(G.state.flasks[chosen.id] > 0)
    ? `<span class="hint">${escapeHtml(chosen.name)} — none left</span>` : ''}
  </div>`;
}
