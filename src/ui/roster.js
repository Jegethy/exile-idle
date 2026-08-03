// roster — The roster list and the hero sheet behind it.

import { EQUIP_SLOTS, SLOTS } from '../data/bases.js';
import { RARITY_BY_ID } from '../data/heroclasses.js';
import {
  BASE_STAMINA, assignToParty, dismiss, heroById, heroInfo, isDeployed, partyById, recruit, removeFromParty, unequipFromHero,
} from '../heroes.js';
import { itemBaseStats } from '../items.js';
import { G, emit, on, recruitCost } from '../state.js';
import { ehp, heroStats } from '../stats.js';
import { clamp, escapeHtml, fmt, fmtInt, qs } from '../util.js';
import { closeModals, confirmAction, openModal } from './modals.js';
import { gotoTab, setStatus } from './shell.js';
import { R, ui } from './state.js';
import { hideTooltip, moveTooltip, showHeroTooltip, showItemTooltip } from './tooltip.js';

// ===========================================================================
// Roster
// ===========================================================================

function renderRosterHeader() {
  const s = G.state;
  const cost = recruitCost(s.heroes.length);
  const afford = s.guild.gold >= cost;
  qs('#rosterHeader').innerHTML = `
    <div class="panel-head">
      <span class="hint">${s.heroes.length} hero${s.heroes.length === 1 ? '' : 'es'}</span>
      <button class="btn tiny ${afford ? 'primary' : ''}" id="btnRecruit" ${afford ? '' : 'disabled'}>
        Recruit — ${fmtInt(cost)}g
      </button>
    </div>`;
  qs('#btnRecruit').onclick = () => { setStatus(recruit().msg); renderRosterHeader(); };
}

export function renderRoster() {
  const s = G.state;
  const host = qs('#rosterList');
  if (!host || !s) return;
  renderRosterHeader();

  if (!s.heroes.length) {
    host.innerHTML = '<div class="empty-note">No heroes. Recruit someone.</div>';
    return;
  }

  const sorted = s.heroes.slice().sort((a, b) => b.level - a.level
    || (RARITY_BY_ID[b.rarity].mult - RARITY_BY_ID[a.rarity].mult));

  host.innerHTML = sorted.map((h) => {
    const info = heroInfo(h);
    const sheet = G.sheets[h.uid];
    const out = isDeployed(h);
    const party = h.partyId ? partyById(h.partyId) : null;
    const stam = clamp((h.stamina / BASE_STAMINA) * 100, 0, 100);
    return `<div class="hero-card ${info.rarity.cls} ${out ? 'deployed' : ''}" data-hero="${h.uid}">
      <div class="hero-top">
        <span class="hero-name">${escapeHtml(h.name)}</span>
        <span class="hero-lvl">Lv ${h.level}</span>
      </div>
      <div class="hero-sub">
        <span class="hero-class">${escapeHtml(info.cls.name)}</span>
        <span class="role role-${info.cls.role.toLowerCase()}">${info.cls.role}</span>
        <span class="hero-rarity">${info.rarity.name}</span>
      </div>
      <div class="hero-stats">
        <span>${fmt(sheet?.dps ?? 0)} dps</span>
        <span>${fmt(sheet?.life ?? 0)} hp</span>
        ${sheet?.healPower > 0 ? `<span>${fmt(sheet.healPower)} heal</span>` : ''}
      </div>
      <div class="stam-track" title="Stamina">
        <i class="stam-fill" data-stam="${h.uid}" style="width:${stam}%"></i>
        <span class="stam-text" data-stamtext="${h.uid}">${Math.round(h.stamina)}</span>
      </div>
      <div class="hero-foot">${out ? '<span class="tag out">In the field</span>'
    : party ? `<span class="tag">${escapeHtml(party.name)}</span>`
      : '<span class="tag idle">Unassigned</span>'}</div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const card = e.target.closest('[data-hero]');
    if (card) openHeroModal(card.dataset.hero);
  };
  host.onmouseover = (e) => {
    const card = e.target.closest('[data-hero]');
    if (card) showHeroTooltip(heroById(card.dataset.hero), e);
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

export function updateStaminaBars() {
  const s = G.state;
  if (!s) return;
  for (const h of s.heroes) {
    const bar = qs(`[data-stam="${h.uid}"]`);
    if (!bar) continue;
    bar.style.width = `${clamp((h.stamina / BASE_STAMINA) * 100, 0, 100)}%`;
    const txt = qs(`[data-stamtext="${h.uid}"]`);
    if (txt) txt.textContent = Math.round(h.stamina);
  }
}

// ===========================================================================
// Hero modal
// ===========================================================================

export function openHeroModal(heroUid) {
  const hero = heroById(heroUid);
  if (!hero) return;
  const info = heroInfo(hero);
  const sheet = G.sheets[hero.uid] ?? heroStats(hero, G.state.upgrades);
  const out = isDeployed(hero);

  qs('#heroModalTitle').textContent = hero.name;
  qs('#heroModalBody').innerHTML = `
    <div class="hm-head ${info.rarity.cls}">
      <div>
        <div class="hm-name">${escapeHtml(hero.name)}</div>
        <div class="hm-sub">${info.rarity.name} ${escapeHtml(info.cls.name)} ·
          <span class="role role-${info.cls.role.toLowerCase()}">${info.cls.role}</span> · Level ${hero.level}</div>
      </div>
      <div class="hm-stats">
        <span><b>${fmt(sheet.dps)}</b> dps</span>
        <span><b>${fmt(sheet.life)}</b> life</span>
        <span><b>${fmt(sheet.armour)}</b> armour</span>
        ${sheet.blockMelee || sheet.blockSpell
    ? `<span><b>${sheet.blockMelee}/${sheet.blockSpell}%</b> block</span>` : ''}
        <span><b>${fmt(ehp(sheet))}</b> ehp</span>
      </div>
    </div>

    <div class="section-head"><span>Traits</span></div>
    <div class="trait-list">${info.traits.length
    ? info.traits.map((t) => `<div class="trait t${t.tier}"><b>${escapeHtml(t.name)}</b>${escapeHtml(t.desc)}</div>`).join('')
    : '<span class="hint">No traits.</span>'}</div>

    <div class="section-head"><span>Equipment</span>
      <div class="head-actions">
        <button class="btn tiny ${ui.equipTarget === hero.uid ? 'active' : ''}" id="btnGearFor">Gear from Vault</button>
      </div>
    </div>
    <div class="doll" id="heroDoll">${EQUIP_SLOTS.map((slotId) => {
    const item = hero.equipment[slotId];
    const label = SLOTS.find((x) => x.id === slotId)?.label ?? slotId;
    if (!item) return `<div class="slot empty" style="grid-area:${slotId}" data-slot="${slotId}" data-label="${label}"></div>`;
    const bs = itemBaseStats(item);
    const sub = bs.dps ? `${fmt(bs.dps)} dps`
      : [bs.armour && `${fmt(bs.armour)} ar`, bs.evasion && `${fmt(bs.evasion)} ev`, bs.es && `${fmt(bs.es)} es`]
        .filter(Boolean).join(' · ') || `ilvl ${item.ilvl}`;
    return `<div class="slot ${R(item.rarity)}" style="grid-area:${slotId}" data-slot="${slotId}" data-uid="${item.uid}">
        <div class="slot-name">${escapeHtml(item.name)}</div><div class="slot-sub">${sub}</div></div>`;
  }).join('')}</div>

    <div class="section-head"><span>Party</span></div>
    <div class="row" id="partyPicker">
      ${G.state.parties.map((p) => `<button class="btn tiny ${hero.partyId === p.id ? 'active' : ''}"
        data-assign="${p.id}" ${out ? 'disabled' : ''}>${escapeHtml(p.name)}</button>`).join('')}
      <button class="btn tiny" data-assign="none" ${out ? 'disabled' : ''}>Unassigned</button>
    </div>
    ${out ? '<p class="hint" style="margin-top:8px">This hero is on an expedition and cannot be changed.</p>' : ''}

    <div class="section-head"><span>Danger Zone</span></div>
    <div class="row"><button class="btn danger" id="btnDismiss" ${out ? 'disabled' : ''}>Dismiss Hero</button></div>`;

  qs('#btnGearFor').onclick = () => {
    ui.equipTarget = ui.equipTarget === hero.uid ? null : hero.uid;
    const gearing = ui.equipTarget;
    emit('vault');
    closeModals();
    gotoTab('vault');
    setStatus(gearing ? `Vault is gearing ${hero.name}. Click an item to equip it.` : 'Gearing cancelled.');
  };
  const doll = qs('#heroDoll');
  doll.onclick = (e) => {
    const cell = e.target.closest('[data-slot]');
    if (!cell || out) return;
    if (hero.equipment[cell.dataset.slot]) {
      unequipFromHero(hero.uid, cell.dataset.slot);
      openHeroModal(hero.uid);
    }
  };
  doll.onmouseover = (e) => {
    const cell = e.target.closest('[data-uid]');
    if (cell) showItemTooltip(hero.equipment[cell.dataset.slot], e, null, 'Click to unequip');
  };
  doll.onmouseout = hideTooltip;
  doll.onmousemove = moveTooltip;

  qs('#partyPicker').onclick = (e) => {
    const b = e.target.closest('[data-assign]');
    if (!b || b.disabled) return;
    if (b.dataset.assign === 'none') removeFromParty(hero.uid);
    else assignToParty(hero.uid, b.dataset.assign);
    openHeroModal(hero.uid);
  };
  qs('#btnDismiss').onclick = () => confirmAction(
    `Dismiss ${hero.name}?`,
    'Their equipment returns to the vault. The hero is gone for good.',
    () => { dismiss(hero.uid); closeModals(); },
  );

  openModal('modalHero');
}
