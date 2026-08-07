// parties — Party building and the flask assigned to each party.

import { CLASS_BY_ID, RARITY_BY_ID } from '../data/heroclasses.js';
import { FLASKS } from '../data/recipes.js';
import { dispatch } from '../expedition.js';
import {
  MAX_MEMBERS, createParty, deleteParty, partyById, partyMembers, assignToParty,
  removeFromParty, isDeployed, heroById,
} from '../heroes.js';
import { G, on, partySlots } from '../state.js';
import { guildEffects } from '../data/upgrades.js';
import { escapeHtml, fmt, qs } from '../util.js';
import { ui } from './state.js';
import { confirmAction } from './modals.js';
import { openHeroModal } from './roster.js';
import { setStatus } from './shell.js';
import { hasPrivilege } from '../charter.js';
import { gearUpParty, pct } from '../outfit.js';

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
  // The effective target, not the stored one. The bench falls back to the
  // first party with room when nothing has been picked, and the highlight has
  // to agree with the header or they contradict each other on a fresh guild.
  const targetId = pickBenchTarget()?.id ?? null;
  host.innerHTML = s.parties.map((p) => {
    const members = partyMembers(p);
    const running = s.expeditions.some((e) => e.partyId === p.id);
    const dps = members.reduce((a, h) => a + (G.sheets[h.uid]?.dps ?? 0), 0);
    const life = members.reduce((a, h) => a + (G.sheets[h.uid]?.life ?? 0), 0);
    const roles = members.map((h) => CLASS_BY_ID[h.classId].role);
    const full = members.length >= MAX_MEMBERS;
    const target = targetId === p.id;
    return `<div class="party-card ${running ? 'running' : ''} ${target ? 'target' : ''}"
      data-party-card="${p.id}">
      <div class="party-top">
        <span class="party-name">${escapeHtml(p.name)}</span>${target
    ? '<span class="party-adding">adding here</span>' : ''}
        <span class="hint">${members.length}/${MAX_MEMBERS}${full ? ' · full' : ''}</span>
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
      <div class="party-members">${members.map((h) => `<span class="pm ${RARITY_BY_ID[h.rarity].cls}">
        <i class="pm-dot"></i><span class="pm-name" data-hero="${h.uid}"
          title="Open ${escapeHtml(h.name)}'s sheet">${escapeHtml(h.name)}</span>
        <small>${escapeHtml(CLASS_BY_ID[h.classId].role)} · Lv${h.level}</small>
        ${running ? '' : `<button class="pm-out" data-bench="${h.uid}"
          title="Send ${escapeHtml(h.name)} to the bench">✕</button>`}
      </span>`).join('')}</div>
      ${flaskPicker(p)}
      <div class="row">
        ${autoUnlocked ? `<button class="toggle ${p.autoRedeploy ? 'on' : ''}" data-partyauto="${p.id}"
          role="switch" aria-checked="${!!p.autoRedeploy}"
          title="Re-run this party's last expedition without being told.
Each party decides for itself, so one can farm while another waits for you.">
          <span class="toggle-track"><span class="toggle-knob"></span></span>
          <span class="toggle-label">Auto-redeploy</span></button>` : ''}
        ${!running && hasPrivilege('gearParty') ? `<button class="btn tiny" data-gearparty="${p.id}"
          title="Give every member the best the vault holds. Locked items are left alone.">Gear Up</button>` : ''}
        ${running ? '<span class="tag out">On expedition</span>'
    : `<button class="btn tiny danger" data-delparty="${p.id}">Disband</button>`}</div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    // First, and its own branch, because the catch-all at the bottom of this
    // handler re-renders the card. As a checkbox this toggle never worked:
    // `click` bubbles before `change` fires, so the re-render detached the
    // input and the change event was lost on an element no longer in the tree.
    const auto = e.target.closest('[data-partyauto]');
    if (auto) {
      const party = partyById(auto.dataset.partyauto);
      if (party) {
        party.autoRedeploy = !party.autoRedeploy;
        setStatus(party.autoRedeploy
          ? `${party.name} will re-run its last expedition on its own.`
          : `${party.name} will wait to be sent.`);
      }
      renderParties();
      return;
    }

    const del = e.target.closest('[data-delparty]');
    if (del) {
      confirmAction('Disband this party?', 'Its members become unassigned. No heroes are lost.',
        () => deleteParty(del.dataset.delparty));
      return;
    }
    const gear = e.target.closest('[data-gearparty]');
    if (gear) {
      const res = gearUpParty(gear.dataset.gearparty);
      setStatus(res.slots
        ? `${res.slots} slot${res.slots === 1 ? '' : 's'} across ${res.heroes} `
          + `hero${res.heroes === 1 ? '' : 'es'} · damage ${pct(res.dps)} · life ${pct(res.life)}`
        : 'Nothing in the vault beats what they are already carrying.');
      renderParties();
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
    const out = e.target.closest('[data-bench]');
    if (out) {
      removeFromParty(out.dataset.bench);
      renderParties();
      return;
    }
    const hero = e.target.closest('[data-hero]');
    if (hero) { openHeroModal(hero.dataset.hero); return; }

    // Anywhere else on a card picks it as what the bench adds to. Last, so it
    // never swallows a click meant for one of the controls above.
    const card = e.target.closest('[data-party-card]');
    if (card) {
      ui.benchTarget = card.dataset.partyCard;
      renderParties();
    }
  };

  renderBench();
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


// ===========================================================================
// The bench
// ===========================================================================

/**
 * Everyone not currently in a party, and a one-click way to put them in one.
 *
 * Before this, changing a party meant opening a hero's full character sheet
 * and assigning from inside it — seven interactions across three tabs to swap
 * two heroes. That was tolerable when a party was set once and forgotten. It
 * stopped being tolerable when contracts started banning classes, which makes
 * swapping a routine part of choosing what to run: the likely response was to
 * discard every contract carrying a ban, which would quietly delete the reason
 * bans exist.
 */
export function renderBench() {
  const host = qs('#benchPanel');
  const s = G.state;
  if (!host || !s) return;

  const benched = s.heroes.filter((h) => !h.partyId);
  const target = pickBenchTarget();
  const roomLeft = target ? MAX_MEMBERS - partyMembers(target).length : 0;

  if (!benched.length && !s.parties.length) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <div class="section-head"><span>Bench</span>
      <span class="hint">${benched.length
    ? (target
      ? `Click a hero to add them to <b>${escapeHtml(target.name)}</b>`
      : 'Every party is full or in the field')
    : 'Everyone is assigned'}</span>
    </div>
    <div class="bench">${benched.length
    ? benched.map((h) => {
      const info = CLASS_BY_ID[h.classId];
      const out = isDeployed(h);
      const blocked = out || !target || roomLeft <= 0;
      return `<button class="bench-hero ${RARITY_BY_ID[h.rarity].cls}"
          data-add="${h.uid}" ${blocked ? 'disabled' : ''}
          title="${escapeHtml(out ? 'On an expedition' : (target ? `Add to ${target.name}` : 'No party has room'))}">
          <span class="bh-name">${escapeHtml(h.name)}</span>
          <span class="bh-sub"><span class="role role-${info.role.toLowerCase()}">${info.role}</span>
            ${escapeHtml(info.name)} · Lv${h.level}</span>
        </button>`;
    }).join('')
    : '<span class="hint">Nobody is on the bench. Remove a hero from a party with ✕.</span>'}</div>`;

  host.onclick = (e) => {
    const add = e.target.closest('[data-add]');
    if (!add || add.disabled) return;
    const party = pickBenchTarget();
    if (!party) return;
    if (assignToParty(add.dataset.add, party.id)) {
      const hero = heroById(add.dataset.add);
      setStatus(`${hero?.name ?? 'Hero'} joins ${party.name}.`);
    }
    renderParties();
  };
}

/**
 * Which party the bench adds to.
 *
 * The player's choice if they made one and it still has room; otherwise the
 * first party with a space. Falling back rather than refusing means the bench
 * works on a fresh guild before anyone has clicked a party at all.
 */
function pickBenchTarget() {
  const s = G.state;
  const usable = (p) => p && !s.expeditions.some((e) => e.partyId === p.id)
    && partyMembers(p).length < MAX_MEMBERS;
  const chosen = ui.benchTarget ? partyById(ui.benchTarget) : null;
  if (usable(chosen)) return chosen;
  return s.parties.find(usable) ?? null;
}
