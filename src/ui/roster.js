// roster — The roster list and the hero sheet behind it.

import { BASE_BY_ID, EQUIP_SLOTS, SLOTS } from '../data/bases.js';
import { RARITY_BY_ID } from '../data/heroclasses.js';
import {
  BASE_STAMINA, assignToParty, boardCosts, dismiss, heroById, heroInfo, isDeployed,
  partyById, recruit, recruitBoard, rerollCost, rerollRecruits, removeFromParty,
  toggleRecruitLock, unequipFromHero, equipSkill, rerollSkills, rerollCostFor,
  canRerollSkills,
} from '../heroes.js';
import { itemBaseStats } from '../items.js';
import { G, emit, on } from '../state.js';
import { ehp, heroStats } from '../stats.js';
import { clamp, escapeHtml, fmt, fmtInt, qs } from '../util.js';
import { closeModals, confirmAction, openModal } from './modals.js';
import { gotoTab, setStatus } from './shell.js';
import { R, ui } from './state.js';
import { hideTooltip, moveTooltip, showHeroTooltip, showItemTooltip } from './tooltip.js';
import { hasPrivilege } from '../charter.js';
import { gearUpHero } from '../outfit.js';

// ===========================================================================
// Roster
// ===========================================================================

function renderRosterHeader() {
  const s = G.state;
  const cheapest = Math.min(...boardCosts());
  const afford = s.guild.gold >= cheapest;
  qs('#rosterHeader').innerHTML = `
    <div class="panel-head">
      <span class="hint">${s.heroes.length} hero${s.heroes.length === 1 ? '' : 'es'}</span>
      <button class="btn tiny ${afford ? 'primary' : ''}" id="btnRecruit">
        Hiring Hall${afford ? '' : ` — from ${fmtInt(cheapest)}g`}
      </button>
    </div>
    <div class="sort-bar" id="rosterSorts">
      <span class="hint">Order</span>
      ${ROSTER_SORTS.map((x) => `<button class="btn tiny ${ui.rosterSort === x.id ? 'active' : ''}"
        data-rsort="${x.id}">${x.name}</button>`).join('')}
      <span class="hint">${ui.rosterSort === 'custom'
    ? 'Drag a hero to reorder.' : 'Sorting never changes your own order.'}</span>
    </div>`;
  qs('#btnRecruit').onclick = () => { renderRecruitBoard(); openModal('modalRecruit'); };
  qs('#rosterSorts').onclick = (e) => {
    const b = e.target.closest('[data-rsort]');
    if (!b) return;
    ui.rosterSort = b.dataset.rsort;
    renderRoster();
  };
}

/**
 * Three candidates, priced by how good they are. Locking one holds it through
 * a reroll, which is what makes an unaffordable Legendary something to save
 * towards rather than something you watch disappear.
 */
export function renderRecruitBoard() {
  const s = G.state;
  const board = recruitBoard();
  const costs = boardCosts();
  const reroll = rerollCost(s.heroes.length, board.rerolls);

  qs('#recruitBody').innerHTML = `
    <p class="hint">Candidates are priced by their quality. Lock anyone you want
      to keep on the board through a reroll — the reroll price climbs until you
      hire someone.</p>
    <div class="recruit-grid">${board.candidates.map((h, i) => {
    const info = heroInfo(h);
    const cost = costs[i];
    const afford = s.guild.gold >= cost;
    const locked = board.locked.includes(h.uid);
    return `<div class="recruit-card ${info.rarity.cls} ${locked ? 'locked' : ''}">
        <div class="rc-top">
          <span class="rc-name">${escapeHtml(h.name)}</span>
          <button class="btn tiny ${locked ? 'active' : ''}" data-lock="${h.uid}"
            title="${locked ? 'Unlock' : 'Hold through a reroll'}">${locked ? 'Locked' : 'Lock'}</button>
        </div>
        <div class="rc-sub"><span class="rarity-word">${info.rarity.name}</span> ${escapeHtml(info.cls.name)} ·
          <span class="role role-${info.cls.role.toLowerCase()}">${info.cls.role}</span>
          <span class="row-tag ${info.cls.row}">${info.cls.row} line</span></div>
        <div class="rc-blurb">${escapeHtml(info.cls.blurb)}</div>
        <div class="rc-ability"><b>${escapeHtml(info.cls.ability.name)}</b> —
          ${escapeHtml(info.cls.ability.desc)}</div>
        <div class="rc-traits">${info.traits.length
    ? info.traits.map((t) => `<span class="trait-chip t${t.tier}"
        title="${escapeHtml(t.desc)}">${escapeHtml(t.name)}</span>`).join('')
    : '<span class="hint">No traits.</span>'}</div>
        <button class="btn ${afford ? 'primary' : ''}" data-hire="${h.uid}" ${afford ? '' : 'disabled'}>
          Hire — ${fmtInt(cost)}g</button>
      </div>`;
  }).join('')}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn ${s.guild.gold >= reroll ? '' : 'disabled'}" id="btnReroll"
        ${s.guild.gold >= reroll ? '' : 'disabled'}>Reroll unlocked — ${fmtInt(reroll)}g</button>
      <span class="hint">Guild gold: <b class="gold">${fmtInt(s.guild.gold)}</b></span>
    </div>`;

  qs('#recruitBody').onclick = (e) => {
    const hire = e.target.closest('[data-hire]');
    if (hire) {
      const res = recruit(hire.dataset.hire);
      setStatus(res.msg);
      if (res.ok) { renderRecruitBoard(); renderRosterHeader(); }
      return;
    }
    const lock = e.target.closest('[data-lock]');
    if (lock) { toggleRecruitLock(lock.dataset.lock); renderRecruitBoard(); }
  };
  qs('#btnReroll').onclick = () => {
    setStatus(rerollRecruits().msg);
    renderRecruitBoard();
  };
}

/**
 * How the roster may be ordered.
 *
 * Sorting is a *view*, exactly as it is in the vault: choosing one never
 * rewrites the stored order, so switching back to Custom finds the arrangement
 * you built still intact. Custom is the stored order itself, and is the only
 * one you can drag in — dragging inside a sorted view would either be ignored
 * or silently re-sorted away, and both are worse than not offering it.
 */
export const ROSTER_SORTS = [
  { id: 'custom', name: 'Custom' },
  { id: 'level', name: 'Level' },
  { id: 'ilvl', name: 'Item Level' },
  { id: 'rarity', name: 'Rarity' },
  { id: 'name', name: 'Name' },
];

/** Mean item level of what a hero is wearing. Empty slots count as nothing. */
export function heroItemLevel(hero) {
  const worn = EQUIP_SLOTS.map((slot) => hero.equipment?.[slot]).filter(Boolean);
  if (!worn.length) return 0;
  return worn.reduce((a, i) => a + (i.ilvl ?? 0), 0) / worn.length;
}

/** The roster in the order the player asked for. Never mutates the roster. */
export function rosterView(heroes, sort = ui.rosterSort) {
  const list = heroes.slice();
  const byName = (a, b) => a.name.localeCompare(b.name);
  switch (sort) {
    case 'level':
      return list.sort((a, b) => b.level - a.level || byName(a, b));
    case 'ilvl':
      return list.sort((a, b) => heroItemLevel(b) - heroItemLevel(a) || byName(a, b));
    case 'rarity':
      return list.sort((a, b) => RARITY_BY_ID[b.rarity].mult - RARITY_BY_ID[a.rarity].mult
        || b.level - a.level || byName(a, b));
    case 'name':
      return list.sort(byName);
    default:
      return list;                      // custom: the stored order, untouched
  }
}

/**
 * Moves a hero to sit before another in the stored order.
 *
 * The roster array *is* the custom order, so this reorders it in place. There
 * is no separate ordering field to keep in step with hires and dismissals.
 */
export function moveHero(heroUid, beforeUid) {
  const list = G.state.heroes;
  const from = list.findIndex((h) => h.uid === heroUid);
  if (from < 0) return false;
  const [hero] = list.splice(from, 1);
  const to = beforeUid ? list.findIndex((h) => h.uid === beforeUid) : list.length;
  list.splice(to < 0 ? list.length : to, 0, hero);
  emit('roster');
  return true;
}

let dragUid = null;

function wireRosterDrag(host, enabled) {
  if (!enabled) {
    host.ondragstart = null; host.ondragover = null; host.ondrop = null; host.ondragend = null;
    return;
  }
  host.ondragstart = (e) => {
    const card = e.target.closest('[data-hero]');
    if (!card) return;
    dragUid = card.dataset.hero;
    card.classList.add('dragging');
    // Firefox refuses to start a drag without payload, and hides the tooltip
    // machinery behind a native drag image otherwise.
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragUid);
  };
  host.ondragover = (e) => {
    if (!dragUid) return;
    e.preventDefault();
    const card = e.target.closest('[data-hero]');
    for (const el of host.querySelectorAll('.drop-before')) el.classList.remove('drop-before');
    if (card && card.dataset.hero !== dragUid) card.classList.add('drop-before');
  };
  host.ondrop = (e) => {
    if (!dragUid) return;
    e.preventDefault();
    const card = e.target.closest('[data-hero]');
    moveHero(dragUid, card?.dataset.hero ?? null);
    dragUid = null;
  };
  host.ondragend = () => {
    dragUid = null;
    for (const el of host.querySelectorAll('.dragging, .drop-before')) {
      el.classList.remove('dragging', 'drop-before');
    }
  };
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

  const sorted = rosterView(s.heroes);
  const dragging = ui.rosterSort === 'custom';

  host.innerHTML = sorted.map((h) => {
    const info = heroInfo(h);
    const sheet = G.sheets[h.uid];
    const out = isDeployed(h);
    const party = h.partyId ? partyById(h.partyId) : null;
    const stam = clamp((h.stamina / BASE_STAMINA) * 100, 0, 100);
    return `<div class="hero-card ${info.rarity.cls} ${out ? 'deployed' : ''}"
      data-hero="${h.uid}" ${dragging ? 'draggable="true"' : ''}>
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
  wireRosterDrag(host, dragging);
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

  const mainBase = hero.equipment.weapon ? BASE_BY_ID[hero.equipment.weapon.baseId] : null;
  const twoHanded = mainBase?.hands === 2;

  qs('#heroModalTitle').textContent = hero.name;
  qs('#heroModalBody').innerHTML = `
    <div class="hm-head ${info.rarity.cls}">
      <div>
        <div class="hm-name">${escapeHtml(hero.name)}</div>
        <div class="hm-sub"><span class="rarity-word">${info.rarity.name}</span> ${escapeHtml(info.cls.name)} ·
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

    <div class="section-head"><span>Skill</span>
      <div class="head-actions">
        <span class="hint">One of three</span>
        <button class="btn tiny" id="btnRerollSkills" ${canRerollSkills(hero) ? '' : 'disabled'}
          title="Redraw all three from this class's pool">Reroll
          <b class="c-echo">${rerollCostFor(hero)}</b></button>
      </div>
    </div>
    <div class="skill-list" id="skillList">${info.skills.length
    ? info.skills.map((s) => `<button class="skill ${hero.skill === s.id ? 'active' : ''}" data-skill="${s.id}">
        <b>${escapeHtml(s.name)}</b><span>${escapeHtml(s.desc)}</span></button>`).join('')
    : '<span class="hint">No skills.</span>'}</div>

    <div class="section-head"><span>Equipment</span>
      <div class="head-actions">
        ${hasPrivilege('equipBest') ? `<button class="btn tiny" id="btnBestGear" ${out ? 'disabled' : ''}
          title="Fill every slot with the best the vault holds. Locked items are left alone.">Best Gear</button>` : ''}
        <button class="btn tiny ${ui.equipTarget === hero.uid ? 'active' : ''}" id="btnGearFor">Gear from Vault</button>
      </div>
    </div>
    <div class="doll" id="heroDoll">${EQUIP_SLOTS.map((slotId) => {
    const item = hero.equipment[slotId];
    const label = SLOTS.find((x) => x.id === slotId)?.label ?? slotId;
    // A two-handed weapon occupies both hands, so the offhand is shown shut
    // rather than merely empty — an empty slot reads as "put something here".
    if (!item && slotId === 'offhand' && twoHanded) {
      return `<div class="slot blocked" style="grid-area:${slotId}" data-slot="${slotId}"
        data-label="Held in both hands"
        title="${escapeHtml(hero.equipment.weapon?.name ?? 'A two-handed weapon')} is two-handed, so this hand is full. Equip a one-handed weapon to free it."></div>`;
    }
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

  for (const btn of qs('#heroModalBody').querySelectorAll('[data-skill]')) {
    btn.onclick = () => { equipSkill(hero, btn.dataset.skill); openHeroModal(hero.uid); };
  }

  // Rerolling destroys two skills the player may have been using, so it asks
  // first and names what it costs. It is confirmed rather than undoable
  // because the roll is random — an undo would just be a free reroll.
  qs('#btnRerollSkills').onclick = () => {
    const cost = rerollCostFor(hero);
    confirmAction(
      'Reroll skills?',
      `This draws three new skills for ${hero.name} and discards the current three. `
      + `Costs ${cost} Echo Stone${cost === 1 ? '' : 's'}.`,
      () => {
        const res = rerollSkills(hero);
        setStatus(res.ok
          ? `${hero.name} retrained.${res.kept ? ' Kept the equipped skill.' : ''}`
          : res.msg);
        if (res.ok) openHeroModal(hero.uid);
      },
    );
  };

  const bestBtn = qs('#btnBestGear');
  if (bestBtn) {
    bestBtn.onclick = () => {
      const n = gearUpHero(hero.uid);
      setStatus(n
        ? `${hero.name}: ${n} slot${n === 1 ? '' : 's'} improved.`
        : `${hero.name} is already carrying the best the vault holds.`);
      openHeroModal(hero.uid);
    };
  }

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
