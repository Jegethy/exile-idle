// specs — the choice screen, and the badges that lead to it.
//
// This screen carries more weight than any other in the game, because it is the
// only one whose result cannot be undone. Three things follow from that:
//
//   1. It shows the arithmetic, not the flavour. "Berserker sounded good" is
//      not a decision anybody should have to make with no way back, so every
//      option that touches the sheet shows the hero's own numbers before and
//      after — 2,140 armour becoming 1,605, in this hero's case, today.
//   2. Choosing takes two deliberate actions. Selecting an option only opens
//      it; a second, separately worded button commits, and it says what it is
//      doing. Nothing here is one misplaced click away from permanent.
//   3. Not choosing is a first-class outcome. "Decide later" is a button of
//      equal standing, and it costs nothing — the choice stays open at any
//      level, forever.
//
// Twelve heroes cross level 15 within about an hour of each other, so nothing
// here interrupts. The prompt is a badge on the roster and a count in its
// header, and it waits.

import { AXES } from '../data/specs.js';
import { CLASS_BY_ID } from '../data/heroclasses.js';
import { heroById } from '../heroes.js';
import {
  chooseSpec, deferSpec, levelFor, optionsFor, pendingTier, previewSpec, specsOf,
} from '../specs.js';
import { escapeHtml, fmt, qs } from '../util.js';
import { closeModals, openModal } from './modals.js';
import { setStatus } from './shell.js';
import { ui } from './state.js';

/** Which option the player has opened. Cleared whenever the screen is rebuilt. */
let selected = null;

export function openSpecModal(heroUid, tier = null) {
  const hero = heroById(heroUid);
  if (!hero) return;
  selected = null;
  ui.specHero = hero.uid;
  ui.specTier = tier ?? pendingTier(hero);
  renderSpecModal();
  openModal('modalSpec');
}

function axisOf(id) { return AXES.find((a) => a.id === id); }

/**
 * The before-and-after table for one option.
 *
 * Only the flat stat lines can be shown this way. A reaction's worth cannot be
 * read off a sheet, which is exactly what the description is for — and an
 * option with no rows is not a weak option, it is one whose whole value is in
 * the sentence above the table. The screen says so rather than showing an empty
 * box that reads as "does nothing".
 */
function previewTable(hero, spec) {
  const rows = previewSpec(hero, spec.id);
  if (!rows.length) {
    return '<div class="sp-nostats hint">Changes nothing on the sheet — everything this '
      + 'specialisation does happens during a fight.</div>';
  }
  return `<table class="sp-preview"><tbody>${rows.map((r) => {
    const up = r.after > r.before;
    return `<tr>
      <th>${escapeHtml(r.label)}</th>
      <td class="sp-before">${fmt(r.before)}</td>
      <td class="sp-arrow">→</td>
      <td class="sp-after ${up ? 'up' : 'down'}">${fmt(r.after)}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function renderSpecModal() {
  const hero = heroById(ui.specHero);
  const host = qs('#specModalBody');
  if (!host || !hero) return;
  const cls = CLASS_BY_ID[hero.classId];
  const tier = ui.specTier || pendingTier(hero) || 1;
  const options = optionsFor(hero, tier);
  const taken = specsOf(hero);

  qs('#specModalTitle').textContent = `${hero.name} — Specialisation`;

  const history = taken.length
    ? `<div class="sp-taken">${taken.map((s) => `<span class="spec-chip ${s.axis}"
        title="${escapeHtml(s.desc)}">${escapeHtml(s.name)}</span>`).join('')}
        <span class="hint">already chosen, and permanent</span></div>`
    : '';

  if (!options.length) {
    const next = taken.length < 2 ? levelFor(taken.length + 1) : null;
    host.innerHTML = `${history}
      <p class="hint">${next
    ? `${escapeHtml(hero.name)} specialises again at level ${next}. `
        + `They are level ${hero.level}.`
    : `${escapeHtml(hero.name)} has made both choices. There is nothing further to decide.`}</p>`;
    return;
  }

  host.innerHTML = `
    ${history}
    <div class="sp-warn">
      <b>This cannot be undone.</b> There is no retraining, at any price, for any amount of
      gold or Echo Stones. ${escapeHtml(hero.name)} will be whatever you pick here for as long
      as they are in the guild. If you want a different hero later, you hire one.
    </div>
    <p class="hint">${escapeHtml(cls.name)}s choose from ${options.length} at level
      ${levelFor(tier)}${tier === 2 ? ', drawn from what they already are' : ''}.
      Every option is one of three shapes:
      ${AXES.map((a) => `<b class="ax-${a.id}">${a.name}</b> — ${escapeHtml(a.hint)}`).join(' ')}</p>

    <div class="spec-grid">${options.map((spec) => {
    const ax = axisOf(spec.axis);
    const open = selected === spec.id;
    return `<div class="spec-card ${spec.axis} ${open ? 'open' : ''}" data-spec="${spec.id}">
        <div class="sp-top">
          <span class="sp-name">${escapeHtml(spec.name)}</span>
          <span class="sp-axis ax-${spec.axis}">${escapeHtml(ax?.name ?? '')}</span>
        </div>
        <div class="sp-flavour">${escapeHtml(spec.flavour)}</div>
        <div class="sp-desc">${escapeHtml(spec.desc)}</div>
        ${open ? previewTable(hero, spec) : '<div class="sp-more hint">Click to see the numbers.</div>'}
      </div>`;
  }).join('')}</div>

    <div class="sp-commit">
      <button class="btn danger" id="btnSpecConfirm" ${selected ? '' : 'disabled'}>
        ${selected
    ? `Make ${escapeHtml(hero.name)} a ${escapeHtml(options.find((s) => s.id === selected)?.name ?? '')} — permanently`
    : 'Choose an option above'}</button>
      <button class="btn" id="btnSpecDefer">Decide Later</button>
      <span class="hint">Deciding later costs nothing and the choice never expires.
        ${escapeHtml(hero.name)} simply fights unspecialised until you come back.</span>
    </div>`;

  host.onclick = (e) => {
    const card = e.target.closest('[data-spec]');
    if (card) {
      selected = selected === card.dataset.spec ? null : card.dataset.spec;
      renderSpecModal();
      return;
    }
    if (e.target.closest('#btnSpecDefer')) {
      deferSpec(hero);
      closeModals();
      setStatus(`${hero.name} stays unspecialised. Reopen from their sheet whenever you like.`);
      return;
    }
    if (e.target.closest('#btnSpecConfirm') && selected) {
      const res = chooseSpec(hero, selected);
      setStatus(res.msg);
      if (!res.ok) return;
      selected = null;
      ui.specTier = pendingTier(hero);
      if (ui.specTier) renderSpecModal();
      else closeModals();
    }
  };
}
