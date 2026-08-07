// ui/contracts — the sealed contract board.
//
// This lived on the Expeditions tab, wedged between the tier selector and the
// dungeon grid, and it was the wrong home for it twice over. A full board is
// sixteen cards of dense text, which pushed the thing you actually came to the
// tab for — the dungeons — off the bottom of the screen; and a contract is not
// a variation on dispatching, it is a separate decision with its own pacing.
// You browse the board occasionally and send from it deliberately.

import { CLASS_BY_ID } from '../data/heroclasses.js';
import { DUNGEON_BY_ID, staminaCost } from '../data/dungeons.js';
import { barredMembers } from '../data/modifiers.js';
import {
  contractCap, rewardMultFor, findBaseFor, rarityOf, downsidesOf, boonsOf,
  consumeContract, CONTRACT_MIN_TIER,
} from '../contracts.js';
import { dispatch } from '../expedition.js';
import { canDispatch, partyMembers } from '../heroes.js';
import { dismissReportsFor } from '../reports.js';
import { G, emit, partySlots } from '../state.js';
import { escapeHtml, qs } from '../util.js';
import { setStatus } from './shell.js';

const esc = escapeHtml;

/** Most dangerous first, since danger is what a contract is worth. */
const RARITY_ORDER = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

function sortedContracts() {
  return (G.state.contracts ?? []).slice().sort(
    (a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0) || b.danger - a.danger,
  );
}

function contractCard(c, idleParties, blocked) {
  const dungeon = DUNGEON_BY_ID[c.dungeonId];
  const rar = rarityOf(c);
  const find = findBaseFor(c);
  const bad = downsidesOf(c);
  const good = boonsOf(c);

  return `<div class="contract ${rar.cls}">
    <div class="ct-top">
      <span class="ct-name">${esc(dungeon?.name ?? 'Unknown')} <b>T${c.tier}</b></span>
      <span class="ct-rarity">${esc(rar.name)}</span>
    </div>
    <div class="ct-find">
      <span title="More items drop">+${Math.round(find.quantity)}% quantity</span>
      <span title="Items that drop are better">+${Math.round(find.rarity)}% rarity</span>
      <span title="Gold, materials and experience" class="ct-mult">&times;${rewardMultFor(c).toFixed(2)}</span>
    </div>
    ${bad.length ? `<ul class="ct-mods bad">${bad.map((m) => `<li><b>${esc(m.name)}</b>
      ${esc(m.desc)}</li>`).join('')}</ul>` : ''}
    ${good.length ? `<ul class="ct-mods good">${good.map((m) => `<li><b>${esc(m.name)}</b>
      ${esc(m.desc)}</li>`).join('')}</ul>` : ''}
    <div class="ct-foot">${idleParties.map((p) => {
    const check = canDispatch(p, staminaCost(c.tier));
    const barred = barredMembers(c.mods, partyMembers(p), (id) => CLASS_BY_ID[id]);
    const off = blocked || !check.ok || barred.length > 0;
    const why = barred.length
      ? `${[...new Set(barred.map((x) => x.mod.name))].join(', ')}: `
        + `${[...new Set(barred.map((x) => x.hero.name))].join(', ')} cannot enter`
      : (check.ok ? `Send ${p.name}` : check.msg);
    return `<button class="btn tiny ${off ? '' : 'primary'}" data-contract="${c.id}"
        data-party="${p.id}" ${off ? 'disabled' : ''} title="${esc(why)}"
        >Send ${esc(p.name)}</button>`;
  }).join('') || '<span class="hint">All parties are busy.</span>'}
      <button class="btn tiny danger" data-discard="${c.id}" title="Destroy this contract">Discard</button>
    </div>
  </div>`;
}

export function renderContracts() {
  const s = G.state;
  const host = qs('#contractPanel');
  const count = qs('#contractTabCount');
  if (!host || !s) return;

  const list = sortedContracts();
  if (count) {
    count.textContent = list.length ? String(list.length) : '';
    count.classList.toggle('hidden', !list.length);
  }

  const free = partySlots() - s.expeditions.length;
  const idleParties = s.parties.filter((p) => !s.expeditions.some((e) => e.partyId === p.id));
  const blocked = free <= 0 || !idleParties.length;

  host.innerHTML = `
    <div class="map-banner">
      <div class="map-banner-top">
        <span class="map-title">Sealed Contracts</span>
        <span class="map-meta">${list.length} of ${contractCap()} held</span>
      </div>
      <p class="hint" style="margin-top:6px">A contract fixes where a party goes and how hard it
        will be, and adds modifiers on top — some of them awful. In exchange it pays more of
        everything, and the worse the modifiers, the more it pays. It is spent the moment the party
        leaves, whether they come back or not.</p>
      <p class="hint">They drop from cleared expeditions at <b>Tier ${CONTRACT_MIN_TIER}</b> and
        above. Not every contract is worth running — <b>Discard</b> the ones that are not.</p>
    </div>
    ${list.length
    ? `<div class="cs-list">${list.map((c) => contractCard(c, idleParties, blocked)).join('')}</div>`
    : `<div class="empty-note">No contracts held. Clear a Tier ${CONTRACT_MIN_TIER} expedition or
        deeper and one will turn up sooner or later.</div>`}`;

  host.onclick = (e) => {
    const drop = e.target.closest('[data-discard]');
    if (drop) {
      // No confirmation. A bad contract is meant to be waved away without
      // ceremony, and another is always coming.
      consumeContract(drop.dataset.discard);
      renderContracts();
      return;
    }
    const b = e.target.closest('[data-contract]');
    if (!b || b.disabled) return;
    const res = dispatch(b.dataset.party, null, null, b.dataset.contract);
    setStatus(res.msg);
    // A contract fixes its own dungeon and tier, so there is no last run to
    // remember: auto-redeploy would have nothing to repeat.
    if (res.ok) dismissReportsFor(b.dataset.party);
    renderContracts();
    emit('expeditions');
  };
}
