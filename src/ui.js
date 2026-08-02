// ui.js — all rendering and DOM interaction for Idle Guild.
//
// Structural changes are event-driven (see state.on); fast-moving numbers
// (health bars, timers, stamina) refresh from the main loop via tick().

import {
  G, on, log, guildXpToNext, recruitCost, vaultCapacity, partySlots, createState,
} from './state.js';
import { fmt, fmtInt, fmtTime, signed, clamp, qs, qsa, el, escapeHtml } from './util.js';
import { heroStats, ehp } from './stats.js';
import { RARITY, itemBaseStats, itemMods, itemDescriptor } from './items.js';
import { EQUIP_SLOTS, SLOTS } from './data/bases.js';
import { UNIQUE_BY_ID, UNIQUES } from './data/uniques.js';
import { CURRENCIES, CURRENCY_BY_ID } from './data/currency.js';
import { CLASS_BY_ID, RARITY_BY_ID } from './data/heroclasses.js';
import {
  DUNGEONS, DUNGEON_BY_ID, RAIDS, staminaCost, expectedDuration, tierToLevel, wavesFor,
} from './data/dungeons.js';
import { UPGRADES, upgradeCost, guildEffects } from './data/upgrades.js';
import {
  salvageItem, salvageAll, countSalvageable, sortVault, toggleLock,
  findItem, wearerOf, buyUpgrade, hasOrb,
} from './inventory.js';
import { applyOrb, canApply } from './currency.js';
import {
  recruit, dismiss, heroById, heroInfo, isDeployed, partyById, partyMembers,
  createParty, deleteParty, assignToParty, removeFromParty, canDispatch,
  equipOnHero, unequipFromHero, BASE_STAMINA, MAX_MEMBERS,
} from './heroes.js';
import { dispatch, dispatchRaid, recall, runProgress } from './expedition.js';
import * as Save from './save.js';
import { tutorialTick } from './tutorial.js';
import { returnToTitle } from './splash.js';

/** Transient UI state — never persisted. */
const ui = {
  craftOrb: null,
  equipTarget: null,     // heroUid the vault is currently gearing
  dispatchTier: 1,
  logFilter: 'all',
  confirmCb: null,
};

const R = (r) => RARITY[r]?.cls ?? 'r-normal';

// ===========================================================================
// Boot
// ===========================================================================

export function initUI() {
  wireTabs();
  wireTopBar();
  wireModals();
  wireVaultActions();
  wireLogFilters();
  buildOrbGrid();

  on('roster', () => { renderRoster(); renderParties(); renderDispatch(); renderEquipTarget(); });
  on('vault', () => { renderVault(); renderEquipTarget(); });
  on('orbs', () => { renderOrbs(); renderCraftPanel(); });
  on('guild', () => { renderGuildBar(); renderQuickStats(); renderHall(); renderDispatch(); renderRaids(); });
  on('upgrades', () => { renderHall(); renderQuickStats(); renderDispatch(); });
  on('sheets', () => { renderRoster(); renderParties(); });
  on('expeditions', () => { renderRuns(); renderDispatch(); renderRoster(); renderRaids(); renderQuickStats(); });
  on('log', () => { renderLog(); });
  on('saves', () => { renderSlots(); });
  on('loaded', () => { ui.craftOrb = null; ui.equipTarget = null; renderAll(); });

  renderAll();
}

export function renderAll() {
  renderGuildBar();
  renderQuickStats();
  renderRoster();
  renderParties();
  renderRuns();
  renderDispatch();
  renderRaids();
  renderHall();
  renderCollection();
  renderEquipTarget();
  renderVault();
  renderOrbs();
  renderCraftPanel();
  renderLog();
  renderSettings();
}

/** Called ~10x a second for smoothly-moving numbers. */
export function tick() {
  updateRunBars();
  updateStaminaBars();
  renderStatus();
  tutorialTick();
}

// ===========================================================================
// Chrome
// ===========================================================================

function wireTabs() {
  for (const nav of qsa('.tabs')) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (btn) selectTab(nav, btn.dataset.tab);
    });
  }
}

function selectTab(nav, tabId) {
  const panel = nav.parentElement;
  qsa('.tab', nav).forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  qsa('.tab-body', panel).forEach((b) => b.classList.toggle('active', b.id === `tab-${tabId}`));
  if (tabId === 'hall') { renderHall(); renderCollection(); }
}

function gotoTab(tabId) {
  const btn = qs(`.tab[data-tab="${tabId}"]`);
  if (btn) selectTab(btn.parentElement, tabId);
}

function wireTopBar() {
  qs('#btnSave').onclick = () => Save.saveToSlot(G.slot);
  qs('#btnSaves').onclick = () => { renderSlots(); openModal('modalSaves'); };
  qs('#btnSettings').onclick = () => { renderSettings(); openModal('modalSettings'); };
}

function renderStatus() {
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

function renderGuildBar() {
  const s = G.state;
  if (!s) return;
  const need = guildXpToNext(s.guild.level);
  const pct = clamp((s.guild.xp / need) * 100, 0, 100);
  qs('#guildName').textContent = s.name;
  qs('#guildLevel').textContent = s.guild.level;
  qs('#xpFill').style.width = `${pct}%`;
  qs('#xpText').textContent = `${fmt(s.guild.xp)} / ${fmt(need)}`;
}

function renderQuickStats() {
  const s = G.state;
  if (!s) return;
  qs('#qsGold').textContent = fmt(s.guild.gold);
  qs('#qsSeals').textContent = s.guild.seals ?? 0;
  qs('#qsHeroes').textContent = s.heroes.length;
  qs('#qsParties').textContent = `${s.expeditions.length}/${partySlots()}`;
  qs('#qsTier').textContent = s.progress.highestTier;
}

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

function renderRoster() {
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

function updateStaminaBars() {
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

function showHeroTooltip(hero, event) {
  if (!hero) return;
  const info = heroInfo(hero);
  const sheet = G.sheets[hero.uid] ?? heroStats(hero, G.state.upgrades);
  const t = tip();
  t.className = `tooltip ${info.rarity.cls}`;
  t.innerHTML = `
    <div class="tt-name">${escapeHtml(hero.name)}</div>
    <div class="tt-base">${info.rarity.name} ${escapeHtml(info.cls.name)} · ${info.cls.role} · Level ${hero.level}</div>
    <div class="tt-sep"></div>
    ${line('Damage / sec', fmt(sheet.dps))}
    ${line('Life', fmt(sheet.life))}
    ${sheet.es > 0 ? line('Energy Shield', fmt(sheet.es)) : ''}
    ${line('Armour', fmt(sheet.armour))}
    ${line('Evasion', fmt(sheet.evasion))}
    ${sheet.healPower > 0 ? line('Healing / cast', fmt(sheet.healPower)) : ''}
    ${line('Attacks / sec', sheet.aps.toFixed(2))}
    ${line('Threat', `${sheet.threat.toFixed(1)}×`)}
    ${line('Resistances', `${sheet.res.fire.value}/${sheet.res.cold.value}/${sheet.res.light.value}/${sheet.res.chaos.value}`)}
    ${info.traits.length ? '<div class="tt-sep"></div>' : ''}
    ${info.traits.map((tr) => `<div class="tt-mod">${escapeHtml(tr.name)} — ${escapeHtml(tr.desc)}</div>`).join('')}
    <div class="tt-hint">Click for equipment and party assignment</div>`;
  t.classList.remove('hidden');
  moveTooltip(event);
}

// ===========================================================================
// Hero modal
// ===========================================================================

function openHeroModal(heroUid) {
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
    renderEquipTarget(); renderVault();
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

// ===========================================================================
// Parties
// ===========================================================================

function renderParties() {
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
        ${roles.length && !roles.includes('Tank') ? '<span class="warn">no tank</span>' : ''}
        ${roles.length && !roles.includes('Healer') ? '<span class="warn">no healer</span>' : ''}
      </div>
      <div class="party-members">${members.map((h) => `<span class="pm ${RARITY_BY_ID[h.rarity].cls}"
        data-hero="${h.uid}">${escapeHtml(h.name)} <small>Lv${h.level}</small></span>`).join('')}</div>
      <div class="row">${running ? '<span class="tag out">On expedition</span>'
    : `<button class="btn tiny danger" data-delparty="${p.id}">Disband</button>`}</div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const del = e.target.closest('[data-delparty]');
    if (del) {
      confirmAction('Disband this party?', 'Its members become unassigned. No heroes are lost.',
        () => deleteParty(del.dataset.delparty));
      return;
    }
    const hero = e.target.closest('[data-hero]');
    if (hero) openHeroModal(hero.dataset.hero);
  };
}

// ===========================================================================
// Expeditions
// ===========================================================================

function renderRuns() {
  const s = G.state;
  const host = qs('#activeRuns');
  if (!host || !s) return;

  if (!s.expeditions.length) {
    host.innerHTML = `<div class="map-banner"><div class="idle-state">
      <h3>No expeditions in the field</h3>
      <p>Pick a dungeon below and dispatch a party.</p></div></div>`;
    return;
  }

  host.innerHTML = s.expeditions.map((run) => {
    const party = partyById(run.partyId);
    return `<div class="map-banner running run-card">
      <div class="map-banner-top">
        <span class="map-title">${escapeHtml(party?.name ?? 'Party')} — ${escapeHtml(run.name)}</span>
        <span class="map-meta">${run.raidId ? 'RAID' : `Tier ${run.tier}`}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" data-prog="${run.id}"></div>
        <span class="progress-text" data-progtext="${run.id}"></span>
      </div>
      <div class="run-body">
        <div class="run-col" data-party-col="${run.id}"></div>
        <div class="run-col" data-enemy-col="${run.id}"></div>
      </div>
      <div class="row">
        <button class="btn tiny danger" data-recall="${run.id}">Recall</button>
        <span class="hint" data-runstats="${run.id}"></span>
      </div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const b = e.target.closest('[data-recall]');
    if (b) recall(b.dataset.recall);
  };
  updateRunBars();
}

function updateRunBars() {
  const s = G.state;
  if (!s) return;
  for (const run of s.expeditions) {
    const fill = qs(`[data-prog="${run.id}"]`);
    if (!fill) continue;
    fill.style.width = `${runProgress(run) * 100}%`;
    const pt = qs(`[data-progtext="${run.id}"]`);
    if (pt) pt.textContent = run.raidId ? 'RAID ENCOUNTER' : `Wave ${run.wave} / ${run.totalWaves + 1}`;

    const pc = qs(`[data-party-col="${run.id}"]`);
    if (pc) {
      pc.innerHTML = run.combatants.map((c) => {
        const pct = clamp((c.life / Math.max(1, c.maxLife)) * 100, 0, 100);
        return `<div class="cbt ${c.down ? 'down' : ''}">
          <div class="cbt-name">${escapeHtml(c.name)}<small>${c.role}</small></div>
          <div class="bar life"><i style="width:${pct}%"></i>
            <span>${c.down ? 'DOWN' : `${fmt(Math.max(0, c.life))} / ${fmt(c.maxLife)}`}</span></div>
        </div>`;
      }).join('');
    }

    const ec = qs(`[data-enemy-col="${run.id}"]`);
    if (ec) {
      ec.innerHTML = run.enemies.length
        ? run.enemies.map((en) => {
          const pct = clamp((en.life / en.maxLife) * 100, 0, 100);
          return `<div class="cbt enemy">
            <div class="cbt-name ${en.rarity === 'champion' ? 'champ' : ''}">${escapeHtml(en.name)}</div>
            <div class="bar mon"><i style="width:${pct}%"></i>
              <span>${fmt(Math.max(0, en.life))} / ${fmt(en.maxLife)}</span></div>
          </div>`;
        }).join('')
        : '<div class="hint" style="padding:6px">Advancing…</div>';
    }

    const st = qs(`[data-runstats="${run.id}"]`);
    if (st) {
      st.textContent = `${fmtTime(run.elapsed)} · ${fmt(run.rewards.gold)}g · `
        + `${run.rewards.gear} items · ${run.rewards.orbs} orbs`;
    }
  }
}

function renderDispatch() {
  const s = G.state;
  const host = qs('#dispatchPanel');
  if (!host || !s) return;

  const maxTier = Math.max(1, s.progress.highestTier + 1);
  ui.dispatchTier = clamp(ui.dispatchTier, 1, maxTier);
  const tier = ui.dispatchTier;
  const free = partySlots() - s.expeditions.length;
  const idleParties = s.parties.filter((p) => !s.expeditions.some((e) => e.partyId === p.id));

  host.innerHTML = `
    <div class="dispatch-bar">
      <span class="dispatch-label">Tier</span>
      <button class="btn tiny" id="tierDown" ${tier <= 1 ? 'disabled' : ''}>−</button>
      <b class="tier-value">${tier}</b>
      <button class="btn tiny" id="tierUp" ${tier >= maxTier ? 'disabled' : ''}>+</button>
      <span class="hint">enemy level ~${tierToLevel(tier)} · ${staminaCost(tier)} stamina each</span>
      <span class="hint">${free} charter${free === 1 ? '' : 's'} free</span>
      ${autoDispatchControl()}
    </div>
    <div class="dungeon-grid">${DUNGEONS.map((d) => {
    const cleared = s.progress.cleared[`${d.id}:${tier}`] ?? 0;
    return `<div class="dungeon ${cleared ? 'cleared' : ''}">
        <div class="dg-top">
          <span class="dg-name">${escapeHtml(d.name)}</span>
          <span class="dg-focus">${escapeHtml(d.focus)}</span>
        </div>
        <div class="dg-blurb">${escapeHtml(d.blurb)}</div>
        <div class="dg-counter">${escapeHtml(d.counter)}</div>
        <div class="dg-rewards">
          ${rewardBar('Gold', d.rewards.gold)}${rewardBar('Gear', d.rewards.gear)}
          ${rewardBar('XP', d.rewards.xp)}${rewardBar('Orbs', d.rewards.orbs)}
        </div>
        <div class="dg-foot"><span class="hint">${wavesFor(d, tier)} waves · ~${Math.round(expectedDuration(d, tier))}s${
      cleared ? ` · cleared ${cleared}×` : ''}</span></div>
        <div class="dg-parties">${idleParties.length
      ? idleParties.map((p) => {
        const check = canDispatch(p, staminaCost(tier));
        const blocked = free <= 0 || !check.ok;
        const why = free <= 0 ? 'No charters free' : check.ok ? `Send ${p.name}` : check.msg;
        return `<button class="btn tiny ${blocked ? '' : 'primary'}" data-send="${p.id}" data-dg="${d.id}"
              ${blocked ? 'disabled' : ''} title="${escapeHtml(why)}">Send ${escapeHtml(p.name)}</button>`;
      }).join('')
      : '<span class="hint">All parties are busy.</span>'}</div>
      </div>`;
  }).join('')}</div>`;

  const toggle = qs('#autoRedeployToggle');
  if (toggle) {
    toggle.onchange = () => {
      s.settings.autoRedeploy = toggle.checked;
      setStatus(toggle.checked
        ? 'Auto-redeploy on — idle parties will re-run their last expedition.'
        : 'Auto-redeploy off.');
      renderDispatch();
    };
  }
  qs('#tierDown').onclick = () => { ui.dispatchTier = Math.max(1, tier - 1); renderDispatch(); };
  qs('#tierUp').onclick = () => { ui.dispatchTier = Math.min(maxTier, tier + 1); renderDispatch(); };
  host.querySelector('.dungeon-grid').onclick = (e) => {
    const b = e.target.closest('[data-send]');
    if (!b || b.disabled) return;
    const res = dispatch(b.dataset.send, b.dataset.dg, ui.dispatchTier);
    setStatus(res.msg);
    if (res.ok) {
      const party = partyById(b.dataset.send);
      if (party) party.lastRun = { dungeonId: b.dataset.dg, tier: ui.dispatchTier };
    }
  };
}

/**
 * Auto-redeploy sits here rather than in Settings so it is discoverable, and is
 * locked until Standing Orders is bought — the opening expeditions are meant to
 * be dispatched by hand.
 */
function autoDispatchControl() {
  const s = G.state;
  const unlocked = guildEffects(s.upgrades).autoDispatch > 0;
  if (!unlocked) {
    return `<div class="auto-box locked" id="autoDispatchBox" title="Buy Standing Orders in the Guild Hall">
      <span class="al">Auto-redeploy</span>
      <span class="auto-lock">🔒 Guild Hall</span>
    </div>`;
  }
  const on = !!s.settings.autoRedeploy;
  return `<div class="auto-box ${on ? 'on' : ''}" id="autoDispatchBox"
               title="Idle parties re-run their last expedition automatically">
    <span class="al">Auto-redeploy</span>
    <label class="switch small"><input type="checkbox" id="autoRedeployToggle" ${on ? 'checked' : ''}><i></i></label>
  </div>`;
}

function rewardBar(label, mult) {
  const pct = clamp((mult / 2.5) * 100, 6, 100);
  return `<div class="rw"><label>${label}</label>
    <div class="rw-track"><i class="${mult >= 1.8 ? 'strong' : ''}" style="width:${pct}%"></i></div></div>`;
}

// ===========================================================================
// Raids
// ===========================================================================

function renderRaids() {
  const s = G.state;
  const host = qs('#raidList');
  if (!host || !s) return;
  const seals = s.guild.seals ?? 0;
  const idleParties = s.parties.filter((p) => !s.expeditions.some((e) => e.partyId === p.id));

  host.innerHTML = `
    <div class="map-banner" style="margin-bottom:10px">
      <div class="map-banner-top">
        <span class="map-title">Raids</span>
        <span class="map-meta"><b class="c-seal">${seals}</b> Raid Seals</span>
      </div>
      <p class="hint" style="margin-top:6px">Seals drop from Tier 4+ expeditions. Raids are pure stat
        checks with guaranteed payouts, and every first kill permanently raises guild rewards —
        currently <b class="gold">+${s.progress.bonusMult}%</b>.</p>
    </div>
  ` + RAIDS.map((r) => {
    const unlocked = s.progress.highestTier >= r.tier;
    const kills = s.progress.raidKills[r.id] ?? 0;
    const ready = unlocked && seals >= r.seals;
    return `<div class="boss-card ${ready ? 'ready' : ''} ${unlocked ? '' : 'locked'}">
      <div class="boss-top">
        <span class="boss-name">${escapeHtml(r.name)}</span>
        <span class="map-meta">${kills ? `${kills} kills` : 'never defeated'}</span>
      </div>
      <div class="boss-intro">${escapeHtml(r.blurb)}</div>
      <div class="boss-reqs">
        <span>Requires <b>Tier ${r.tier}</b></span>
        <span>Costs <b>${r.seals} Seal${r.seals === 1 ? '' : 's'}</b></span>
        <span>Unique <b>${Math.round(r.reward.uniqueChance * 100)}%</b></span>
        <span>First kill <b class="gold">+${r.reward.bonus}% rewards</b></span>
      </div>
      <div class="row">${!unlocked
      ? `<span class="hint">Clear a Tier ${r.tier} dungeon to unlock.</span>`
      : seals < r.seals
        ? `<span class="hint">Need ${r.seals - seals} more Seal${r.seals - seals === 1 ? '' : 's'}.</span>`
        : idleParties.length
          ? idleParties.map((p) => `<button class="btn tiny primary" data-raid="${r.id}"
              data-party="${p.id}">Send ${escapeHtml(p.name)}</button>`).join('')
          : '<span class="hint">All parties are busy.</span>'}</div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const b = e.target.closest('[data-raid]');
    if (!b) return;
    const res = dispatchRaid(b.dataset.party, b.dataset.raid);
    setStatus(res.msg);
    if (res.ok) gotoTab('expeditions');
  };
}

// ===========================================================================
// Guild Hall
// ===========================================================================

function renderHall() {
  const s = G.state;
  const host = qs('#upgradeList');
  if (!host || !s) return;
  const gu = guildEffects(s.upgrades);
  const ranks = Object.values(s.upgrades ?? {}).reduce((a, b) => a + b, 0);

  qs('#hallSummary').innerHTML = `
    <div class="map-banner">
      <div class="map-banner-top">
        <span class="map-title">${escapeHtml(s.name)}</span>
        <span class="map-meta">${ranks} upgrade rank${ranks === 1 ? '' : 's'} ·
          <b class="c-gold">${fmt(s.guild.gold)}</b> gold</span>
      </div>
      <p class="hint" style="margin-top:6px">Upgrades are permanent. A low tier you clear in seconds
        is often the fastest way to fund them — that is what the Deepmines are for.</p>
      <div class="hideout-stats">
        <span>Gold <b>+${gu.gold}%</b></span>
        <span>Rarity <b>+${gu.rarity}%</b></span>
        <span>Quantity <b>+${gu.quantity}%</b></span>
        <span>Orbs <b>+${gu.orbs}%</b></span>
        <span>Experience <b>+${gu.xp}%</b></span>
        <span>Charters <b>${1 + gu.partySlots}</b></span>
      </div>
    </div>`;

  host.innerHTML = UPGRADES.map((u) => {
    const rank = s.upgrades[u.id] ?? 0;
    const maxed = rank >= u.max;
    const cost = upgradeCost(u.id, rank);
    const afford = !cost ? false
      : cost.kind === 'gold' ? s.guild.gold >= cost.amount : hasOrb(cost.orb, cost.amount);
    const now = u.effect(rank);
    const next = maxed ? null : u.effect(rank + 1);
    const key = Object.keys(u.effect(1))[0];
    const label = cost && (cost.kind === 'gold'
      ? `${fmtInt(cost.amount)}g` : `${cost.amount}× ${CURRENCY_BY_ID[cost.orb]?.short ?? ''}`);

    return `<div class="upgrade ${maxed ? 'maxed' : afford ? 'afford' : ''}" data-upgrade="${u.id}">
      <div class="up-top">
        <span class="up-name">${escapeHtml(u.name)}</span>
        <span class="up-rank">${rank}/${u.max}</span>
      </div>
      <div class="up-desc">${escapeHtml(u.desc)}</div>
      <div class="up-effect">${next
      ? `<b>${fmt(now[key] ?? 0)} → ${fmt(next[key] ?? 0)}</b>${escapeHtml(u.unit)}`
      : `<b>${fmt(now[key] ?? 0)}</b>${escapeHtml(u.unit)} <span class="up-next">MAX</span>`}</div>
      <div class="up-buy">${maxed ? '<span class="up-max">Fully upgraded</span>'
      : `<button class="btn tiny ${afford ? 'primary' : ''}" data-buy="${u.id}" ${afford ? '' : 'disabled'}>${label}</button>`}</div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b || b.disabled) return;
    setStatus(buyUpgrade(b.dataset.buy).msg);
  };
}

function renderCollection() {
  const s = G.state;
  const host = qs('#collectionList');
  if (!host || !s) return;
  const found = UNIQUES.filter((u) => (s.collection?.[u.id] ?? 0) > 0).length;
  qs('#collectionCount').textContent = `${found}/${UNIQUES.length}`;
  host.innerHTML = UNIQUES.slice().sort((a, b) => a.lvl - b.lvl).map((u) => {
    const n = s.collection?.[u.id] ?? 0;
    return `<div class="col-entry ${n ? 'found' : ''}" title="${escapeHtml(u.flavour ?? '')}">
      <div class="col-name">${n ? escapeHtml(u.name) : '???'}</div>
      <div class="col-meta">${n ? `found ${n}×` : `item level ${u.lvl}`}</div>
    </div>`;
  }).join('');
}

// ===========================================================================
// Vault
// ===========================================================================

const SALVAGE_FILTERS = {
  normal: { label: 'Normal', test: (i) => i.rarity === 'normal' },
  magic: { label: 'Normal and Magic', test: (i) => i.rarity === 'normal' || i.rarity === 'magic' },
  rare: { label: 'Normal, Magic and Rare', test: (i) => ['normal', 'magic', 'rare'].includes(i.rarity) },
};

function wireVaultActions() {
  qs('#btnSortVault').onclick = () => sortVault();
  for (const [key, sel] of [['normal', '#btnSalvageNormal'], ['magic', '#btnSalvageMagic'], ['rare', '#btnSalvageRare']]) {
    qs(sel).onclick = () => {
      const f = SALVAGE_FILTERS[key];
      const n = countSalvageable(f.test);
      if (!n) { setStatus(`No unlocked ${f.label} items in the vault.`); return; }
      confirmAction(`Salvage ${n} item${n === 1 ? '' : 's'}?`,
        `All unlocked ${f.label} items in the vault become orbs and gold. `
        + 'Locked and Unique items are skipped, and worn gear is never touched.',
        () => salvageAll(f.test));
    };
  }
}

function renderEquipTarget() {
  const host = qs('#equipTarget');
  if (!host) return;
  const hero = ui.equipTarget ? heroById(ui.equipTarget) : null;
  if (!hero) { host.innerHTML = ''; return; }
  const sheet = G.sheets[hero.uid];
  host.innerHTML = `<div class="craft-banner">
    Gearing <b>${escapeHtml(hero.name)}</b> — ${fmt(sheet?.dps ?? 0)} dps, ${fmt(sheet?.life ?? 0)} life.
    Click an item to equip it.
    <button class="btn tiny" id="btnClearTarget">Done</button></div>`;
  qs('#btnClearTarget').onclick = () => { ui.equipTarget = null; renderEquipTarget(); renderVault(); };
}

function renderVault() {
  const s = G.state;
  const host = qs('#vaultGrid');
  if (!host || !s) return;
  qs('#vaultCount').textContent = `${s.vault.length}/${vaultCapacity()}`;
  renderSalvageBar();

  if (!s.vault.length) {
    host.innerHTML = '<div class="empty-note" style="grid-column:1/-1">The vault is empty.</div>';
    return;
  }

  const hero = ui.equipTarget ? heroById(ui.equipTarget) : null;
  host.innerHTML = s.vault.map((item) => {
    const craft = ui.craftOrb ? canApply(ui.craftOrb, item) : null;
    const d = itemDescriptor(item);
    const bs = itemBaseStats(item);
    const num = bs.dps ? `${fmt(bs.dps)} dps`
      : [bs.armour && `${fmt(bs.armour)} ar`, bs.evasion && `${fmt(bs.evasion)} ev`, bs.es && `${fmt(bs.es)} es`]
        .filter(Boolean).join(' · ');
    return `<div class="inv-cell ${R(item.rarity)} ${craft ? (craft.ok ? 'craftable' : 'not-craftable') : ''}"
                 data-uid="${item.uid}">
      <div class="inv-top">
        <span class="inv-name">${escapeHtml(item.name)}</span>
        <span class="inv-ilvl" title="Item level">i${item.ilvl}</span>
      </div>
      <div class="inv-type">${escapeHtml(d.category)}</div>
      <div class="inv-sub">${escapeHtml(d.subtype)}${num ? ` · ${num}` : ''}</div>
      <div class="inv-marks">
        ${item.locked ? '<span class="mark lock" title="Locked">🔒</span>' : ''}
        ${item.corrupted ? '<span class="mark corrupt" title="Corrupted">✦</span>' : ''}
      </div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const cell = e.target.closest('[data-uid]');
    if (!cell) return;
    const uid = cell.dataset.uid;
    if (ui.craftOrb) { applyCraft(uid); return; }
    if (hero) { equipOnHero(hero.uid, uid); hideTooltip(); return; }
    const item = findItem(uid);
    if (!item) return;
    if (e.shiftKey) { salvageItem(item); hideTooltip(); }
    else if (e.ctrlKey || e.metaKey) toggleLock(uid);
    else openItemMenu(uid);
  };
  host.oncontextmenu = (e) => {
    const cell = e.target.closest('[data-uid]');
    if (!cell) return;
    e.preventDefault();
    hideTooltip();
    openItemMenu(cell.dataset.uid);
  };
  host.onmouseover = (e) => {
    const cell = e.target.closest('[data-uid]');
    if (!cell) return;
    const item = s.vault.find((i) => i.uid === cell.dataset.uid);
    if (item) {
      showItemTooltip(item, e, hero ? true : null,
        hero ? `Click to equip on ${hero.name}` : 'Click for actions · Shift-click to salvage');
    }
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

function renderSalvageBar() {
  for (const [key, sel] of [['normal', '#btnSalvageNormal'], ['magic', '#btnSalvageMagic'], ['rare', '#btnSalvageRare']]) {
    const btn = qs(sel);
    if (!btn) continue;
    const n = countSalvageable(SALVAGE_FILTERS[key].test);
    const base = key === 'normal' ? 'Normal' : key === 'magic' ? '+ Magic' : '+ Rare';
    btn.textContent = n ? `${base} (${n})` : base;
    btn.disabled = !n;
  }
}

// ===========================================================================
// Item menu
// ===========================================================================

function openItemMenu(uid) {
  const item = findItem(uid);
  if (!item) return;
  const worn = wearerOf(uid);
  const d = itemDescriptor(item);
  const candidates = G.state.heroes.filter((h) => !isDeployed(h));

  qs('#itemMenuTitle').textContent = item.name;
  qs('#itemMenuBody').innerHTML = `
    <div class="menu-item ${R(item.rarity)}">
      <div class="menu-name">${escapeHtml(item.name)}</div>
      <div class="menu-sub">${escapeHtml(d.category)} · ${escapeHtml(d.subtype)} · Item Level ${item.ilvl}
        ${item.locked ? ' · 🔒 Locked' : ''}${item.corrupted ? ' · Corrupted' : ''}
        ${worn ? ` · worn by ${escapeHtml(worn.hero.name)}` : ''}</div>
      <div class="menu-mods">${itemMods(item).map((m) =>
    `<div class="${m.kind === 'implicit' ? 'tt-implicit' : m.kind === 'unique' ? 'tt-unique-mod' : 'tt-mod'}">
      ${escapeHtml(m.text)}${m.tier ? ` <span class="tier">T${m.tier}</span>` : ''}</div>`).join('')}</div>
    </div>
    ${worn ? '<div class="row"><button class="btn" data-act="unequip">Return to Vault</button></div>'
    : `<div class="section-head"><span>Equip on</span></div>
       <div class="row">${candidates.length
      ? candidates.map((h) => `<button class="btn tiny" data-equip="${h.uid}">${escapeHtml(h.name)}
          <small>${CLASS_BY_ID[h.classId].role}</small></button>`).join('')
      : '<span class="hint">Every hero is in the field.</span>'}</div>`}
    <div class="row">
      <button class="btn" data-act="lock">${item.locked ? 'Unlock' : 'Lock'}</button>
      <button class="btn danger" data-act="salvage" ${worn ? 'disabled' : ''}>Salvage</button>
    </div>
    <p class="hint" style="margin-top:8px">Shift-click salvages · Ctrl-click locks.</p>`;

  qs('#itemMenuBody').onclick = (e) => {
    const eq = e.target.closest('[data-equip]');
    if (eq) { equipOnHero(eq.dataset.equip, uid); closeModals(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === 'unequip') { unequipFromHero(worn.hero.uid, worn.slot); closeModals(); }
    else if (act === 'lock') { toggleLock(uid); openItemMenu(uid); }
    else if (act === 'salvage') {
      const doIt = () => { salvageItem(item); closeModals(); };
      if (item.rarity === 'unique' || item.locked) {
        confirmAction('Salvage this item?',
          `${item.name} is ${item.locked ? 'locked' : 'a unique'}. Salvaging destroys it permanently.`, doIt);
      } else doIt();
    }
  };
  openModal('modalItem');
}

// ===========================================================================
// Crafting orbs
// ===========================================================================

function buildOrbGrid() {
  const host = qs('#orbGrid');
  host.onclick = (e) => {
    const cell = e.target.closest('[data-orb]');
    if (!cell) return;
    const id = cell.dataset.orb;
    if ((G.state.orbs[id] ?? 0) <= 0) return;
    selectOrb(ui.craftOrb === id ? null : id);
  };
  host.onmouseover = (e) => {
    const cell = e.target.closest('[data-orb]');
    if (cell) showOrbTooltip(CURRENCY_BY_ID[cell.dataset.orb], e);
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

function renderOrbs() {
  const s = G.state;
  const host = qs('#orbGrid');
  if (!host || !s) return;
  host.innerHTML = CURRENCIES.map((c) => {
    const n = s.orbs[c.id] ?? 0;
    return `<div class="cur-cell ${n ? '' : 'zero'} ${ui.craftOrb === c.id ? 'selected' : ''}"
                 data-orb="${c.id}" data-tier="${c.tier}">
      <div class="cur-orb">${c.short}</div>
      <div class="cur-count">${fmtInt(n)}</div>
      <div class="cur-name">${escapeHtml(c.name.replace('Orb of ', '').replace(' Orb', ''))}</div>
    </div>`;
  }).join('');
}

function selectOrb(id) {
  ui.craftOrb = id;
  renderOrbs(); renderVault(); renderCraftPanel(); renderVaultBanner();
  if (id) {
    gotoTab('vault');
    setStatus(`${CURRENCY_BY_ID[id].name} selected — click a vault item to apply it. Esc to cancel.`);
  } else setStatus('Crafting cancelled.');
}

function renderVaultBanner() {
  let banner = qs('#vaultCraftBanner');
  if (!ui.craftOrb) { if (banner) banner.remove(); return; }
  if (!banner) {
    banner = el('div', 'craft-banner');
    banner.id = 'vaultCraftBanner';
    qs('#tab-vault').prepend(banner);
  }
  const c = CURRENCY_BY_ID[ui.craftOrb];
  banner.innerHTML = `<b>${escapeHtml(c.name)}</b> — click a vault item to apply.
    <button class="btn tiny" id="btnCancelCraft">Cancel</button>`;
  qs('#btnCancelCraft').onclick = () => selectOrb(null);
}

function renderCraftPanel() {
  const host = qs('#craftPanel');
  const banner = qs('#craftBanner');
  if (!host) return;

  if (!ui.craftOrb) {
    banner.classList.add('hidden');
    host.innerHTML = '<p class="hint">Select an orb above, then click an item in the Vault.</p>'
      + CURRENCIES.filter((c) => c.tier > 0).map((c) =>
        `<div class="stat-row"><label>${escapeHtml(c.name)}</label>
        <b style="font-weight:400;font-size:11px">${escapeHtml(c.use)}</b></div>`).join('');
    return;
  }
  const c = CURRENCY_BY_ID[ui.craftOrb];
  banner.classList.remove('hidden');
  banner.innerHTML = `<b>${escapeHtml(c.name)}</b> ready — click a valid vault item.
    <button class="btn tiny" id="btnCancelCraft2">Cancel</button>`;
  qs('#btnCancelCraft2').onclick = () => selectOrb(null);
  host.innerHTML = `<div class="craft-target">
    <b style="color:var(--gold)">${escapeHtml(c.name)}</b>
    <div class="hint" style="margin-top:4px">${escapeHtml(c.desc)}</div>
    <div class="hint">${escapeHtml(c.use)}</div>
    <div class="hint" style="margin-top:4px">You have <b>${fmtInt(G.state.orbs[c.id] ?? 0)}</b>.</div>
  </div>`;
}

function applyCraft(uid) {
  const item = findItem(uid);
  if (!item) return;
  const res = applyOrb(ui.craftOrb, item);
  setStatus(res.msg);
  if (!res.ok) return;
  if ((G.state.orbs[ui.craftOrb] ?? 0) <= 0) selectOrb(null);
  else { renderOrbs(); renderVault(); renderCraftPanel(); }
}

// ===========================================================================
// Tooltips
// ===========================================================================

const tip = () => qs('#tooltip');

function line(label, value) {
  return `<div class="tt-line"><label>${label}</label><span>${value}</span></div>`;
}

function showItemTooltip(item, event, compare = null, hint = '') {
  if (!item) return;
  const t = tip();
  t.className = `tooltip ${R(item.rarity)}`;
  t.innerHTML = itemTooltipHtml(item, compare, hint);
  t.classList.remove('hidden');
  moveTooltip(event);
}

function itemTooltipHtml(item, compare, hint) {
  const bs = itemBaseStats(item);
  const mods = itemMods(item);
  const d = itemDescriptor(item);
  const parts = [`<div class="tt-name">${escapeHtml(item.name)}</div>`];
  if (item.rarity !== 'normal') parts.push(`<div class="tt-base">${escapeHtml(item.baseName ?? '')}</div>`);
  parts.push(`<div class="tt-base">${escapeHtml(d.category)}${d.subtype ? ` · ${escapeHtml(d.subtype)}` : ''}</div>`);
  parts.push('<div class="tt-sep"></div>');

  if (bs.dps) {
    parts.push(line('Physical Damage', `${fmt(bs.physMin)} – ${fmt(bs.physMax)}`));
    parts.push(line('Attacks per Second', bs.aps.toFixed(2)));
    parts.push(line('Critical Chance', `${bs.crit.toFixed(1)}%`));
    parts.push(line('Weapon DPS', `<span style="color:var(--gold)">${fmt(bs.dps)}</span>`));
  } else {
    if (bs.armour) parts.push(line('Armour', fmt(bs.armour)));
    if (bs.evasion) parts.push(line('Evasion Rating', fmt(bs.evasion)));
    if (bs.es) parts.push(line('Energy Shield', fmt(bs.es)));
  }
  if (item.quality) parts.push(line('Quality', `+${item.quality}%`));
  parts.push(line('Item Level', String(item.ilvl)));

  const implicit = mods.filter((m) => m.kind === 'implicit');
  const explicit = mods.filter((m) => m.kind !== 'implicit');
  if (implicit.length) {
    parts.push('<div class="tt-sep"></div>');
    implicit.forEach((m) => parts.push(`<div class="tt-implicit">${escapeHtml(m.text)}</div>`));
  }
  if (explicit.length) {
    parts.push('<div class="tt-sep"></div>');
    explicit.forEach((m) => parts.push(
      `<div class="${m.kind === 'unique' ? 'tt-unique-mod' : 'tt-mod'}">${escapeHtml(m.text)}${
        m.tier ? ` <span class="tier">T${m.tier}</span>` : ''}</div>`,
    ));
  }
  if (item.rarity === 'unique') {
    const u = UNIQUE_BY_ID[item.uniqueId];
    if (u?.flavour) parts.push(`<div class="tt-flavour">${escapeHtml(u.flavour)}</div>`);
  }
  if (item.corrupted) parts.push('<div class="tt-corrupt">Corrupted</div>');
  if (compare && ui.equipTarget) parts.push(compareHtml(item));
  if (hint) parts.push(`<div class="tt-hint">${escapeHtml(hint)}</div>`);
  return parts.join('');
}

/** Diffs the gearing hero's sheet with this item equipped. */
function compareHtml(item) {
  const hero = heroById(ui.equipTarget);
  if (!hero) return '';
  const slot = item.slot === 'ring' ? (!hero.equipment.ring1 ? 'ring1' : 'ring2') : item.slot;

  const before = G.sheets[hero.uid] ?? heroStats(hero, G.state.upgrades);
  const saved = hero.equipment[slot];
  hero.equipment[slot] = item;
  let after;
  try { after = heroStats(hero, G.state.upgrades); } finally { hero.equipment[slot] = saved; }

  const rows = [
    ['DPS', before.dps, after.dps],
    ['Life', before.life, after.life],
    ['Armour', before.armour, after.armour],
    ['Evasion', before.evasion, after.evasion],
    ['Healing', before.healPower, after.healPower],
  ].filter(([, a, b]) => Math.abs(b - a) > 0.5);

  if (!rows.length) return `<div class="tt-compare">No change for ${escapeHtml(hero.name)}.</div>`;
  return `<div class="tt-compare"><div class="tt-kind">vs ${escapeHtml(hero.name)}</div>${rows.map(([label, a, b]) => {
    const diff = b - a;
    return `<div class="tt-line"><label>${label}</label>
      <span class="${diff > 0 ? 'tt-up' : 'tt-down'}">${signed(Math.round(diff))} (${fmt(b)})</span></div>`;
  }).join('')}</div>`;
}

function showOrbTooltip(c, event) {
  if (!c) return;
  const t = tip();
  t.className = 'tooltip';
  t.innerHTML = `<div class="tt-name" style="color:var(--r-currency)">${escapeHtml(c.name)}</div>
    <div class="tt-sep"></div>
    <div class="tt-implicit">${escapeHtml(c.desc)}</div>
    <div class="tt-mod" style="margin-top:4px">${escapeHtml(c.use)}</div>
    <div class="tt-hint">Stock: ${fmtInt(G.state.orbs[c.id] ?? 0)}</div>`;
  t.classList.remove('hidden');
  moveTooltip(event);
}

function moveTooltip(event) {
  const t = tip();
  if (t.classList.contains('hidden') || !event) return;
  const pad = 14;
  const rect = t.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - rect.height - 8);
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

function hideTooltip() { tip().classList.add('hidden'); }

// ===========================================================================
// Log
// ===========================================================================

function wireLogFilters() {
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

const LOG_GROUPS = {
  loot: new Set(['loot', 'unique', 'gold', 'xp']),
  combat: new Set(['hit', 'crit', 'kill', 'danger']),
  story: new Set(['sys', 'boss', 'unique']),
};

function renderLog() {
  const host = qs('#guildLog');
  const s = G.state;
  if (!host || !s) return;
  const group = LOG_GROUPS[ui.logFilter];
  const atBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 40;
  host.innerHTML = s.log.filter((l) => !group || group.has(l.cls)).slice(-160)
    .map((l) => `<div class="l ${l.cls}">${escapeHtml(l.msg)}</div>`).join('');
  if (atBottom) host.scrollTop = host.scrollHeight;
}

// ===========================================================================
// Modals
// ===========================================================================

function openModal(id) {
  qs('#modalBackdrop').classList.remove('hidden');
  qsa('.modal').forEach((m) => m.classList.toggle('hidden', m.id !== id));
}

function closeModals() {
  qs('#modalBackdrop').classList.add('hidden');
  qsa('.modal').forEach((m) => m.classList.add('hidden'));
}

function wireModals() {
  qsa('.modal-close').forEach((b) => { b.onclick = closeModals; });
  qs('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModals();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.craftOrb) { selectOrb(null); return; }
    closeModals();
  });

  qs('#btnExport').onclick = () => { qs('#saveText').value = Save.exportSave(); setStatus('Save exported.'); };
  qs('#btnCopy').onclick = async () => {
    const box = qs('#saveText');
    if (!box.value) box.value = Save.exportSave();
    try { await navigator.clipboard.writeText(box.value); setStatus('Copied to clipboard.'); }
    catch { box.select(); setStatus('Press Ctrl+C to copy.'); }
  };
  qs('#btnImport').onclick = () => {
    const text = qs('#saveText').value;
    confirmAction('Import this save?', 'Your current guild will be replaced.', () => {
      try { Save.importSave(text); Save.saveToSlot(G.slot, true); closeModals(); log('Save imported.', 'sys'); }
      catch (e) { setStatus(`Import failed: ${e.message}`); }
    });
  };
  qs('#btnDownload').onclick = () => Save.downloadSave();
  qs('#fileInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await Save.uploadSave(file); Save.saveToSlot(G.slot, true); closeModals(); log('Save file loaded.', 'sys'); }
    catch (err) { setStatus(`Could not load file: ${err.message}`); }
    e.target.value = '';
  };

  qs('#btnConfirmNo').onclick = () => { ui.confirmCb = null; closeModals(); };
  qs('#btnConfirmYes').onclick = () => {
    const cb = ui.confirmCb;
    ui.confirmCb = null;
    closeModals();
    if (cb) cb();
  };

  qs('#btnTitle').onclick = () => {
    Save.saveToSlot(G.slot, true);
    closeModals();
    returnToTitle();
  };
}

function confirmAction(title, text, cb) {
  qs('#confirmTitle').textContent = title;
  qs('#confirmText').textContent = text;
  ui.confirmCb = cb;
  openModal('modalConfirm');
}

function renderSlots() {
  const host = qs('#slotList');
  if (!host) return;
  host.innerHTML = Save.listSlots().map((s) => {
    if (s.empty) {
      return `<div class="slot-card"><div class="si"><div class="sn">Slot ${s.slot + 1}</div>
        <div class="sd">Empty</div></div>
        <div class="sa"><button class="btn tiny" data-save="${s.slot}">Save Here</button></div></div>`;
    }
    if (s.corrupt) {
      return `<div class="slot-card"><div class="si"><div class="sn">Slot ${s.slot + 1}</div>
        <div class="sd">Corrupt data</div></div>
        <div class="sa"><button class="btn tiny danger" data-del="${s.slot}">Delete</button></div></div>`;
    }
    const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : 'unknown';
    return `<div class="slot-card ${s.slot === G.slot ? 'current' : ''}">
      <div class="si">
        <div class="sn">Slot ${s.slot + 1} — ${escapeHtml(s.name)}</div>
        <div class="sd">Guild ${s.level} · ${s.heroes ?? 0} heroes · Tier ${s.tier} · ${fmtTime(s.playtime)}</div>
        <div class="sd">${when}</div>
      </div>
      <div class="sa">
        <button class="btn tiny" data-load="${s.slot}">Load</button>
        <button class="btn tiny" data-save="${s.slot}">Overwrite</button>
        <button class="btn tiny danger" data-del="${s.slot}">Delete</button>
      </div></div>`;
  }).join('');

  host.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.save !== undefined) { Save.saveToSlot(Number(btn.dataset.save)); renderSlots(); }
    else if (btn.dataset.load !== undefined) {
      const slot = Number(btn.dataset.load);
      confirmAction('Load this save?', 'Unsaved progress will be lost.', () => {
        if (Save.loadSlot(slot)) { closeModals(); log(`Loaded slot ${slot + 1}.`, 'sys'); }
      });
    } else if (btn.dataset.del !== undefined) {
      const slot = Number(btn.dataset.del);
      confirmAction('Delete this save?', 'This permanently erases that guild.', () => {
        Save.deleteSlot(slot); renderSlots(); openModal('modalSaves');
      });
    }
  };
}

// ===========================================================================
// Settings
// ===========================================================================

function toggleRow(key, label, hint) {
  const on = G.state.settings[key];
  return `<div class="setting-row">
    <div><div class="sl">${label}</div><div class="sh">${hint}</div></div>
    <label class="switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><i></i></label>
  </div>`;
}

function renderSettings() {
  const host = qs('#settingsBody');
  if (!host || !G.state) return;
  const s = G.state;
  host.innerHTML = `
    ${toggleRow('autoSalvageNormal', 'Auto-salvage Normal drops', 'Normal items become orbs on pickup.')}
    ${toggleRow('autoSalvageMagic', 'Auto-salvage Magic drops', 'Magic items become orbs on pickup.')}
    ${toggleRow('autoSalvageRare', 'Auto-salvage Rare drops', 'Rare items become orbs. Uniques are never auto-salvaged.')}
    <div class="setting-row">
      <div><div class="sl">Simulation speed</div><div class="sh">Higher is faster but coarser.</div></div>
      <select class="text-input" style="width:auto" id="setSpeed">
        ${[0.5, 1, 2, 3, 5].map((v) => `<option value="${v}" ${s.settings.speed === v ? 'selected' : ''}>${v}×</option>`).join('')}
      </select>
    </div>
    <div class="setting-row">
      <div><div class="sl">Log length</div><div class="sh">Lines kept in memory.</div></div>
      <select class="text-input" style="width:auto" id="setLog">
        ${[100, 200, 500, 1000].map((v) => `<option value="${v}" ${s.settings.logLimit === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="section-head"><span>Danger Zone</span></div>
    <div class="row"><button class="btn danger" id="btnWipe">Delete This Guild</button></div>`;

  host.onchange = (e) => {
    const t = e.target;
    if (t.dataset.set) s.settings[t.dataset.set] = t.checked;
    else if (t.id === 'setSpeed') s.settings.speed = Number(t.value);
    else if (t.id === 'setLog') s.settings.logLimit = Number(t.value);
  };
  qs('#btnWipe').onclick = () => confirmAction(
    'Delete this guild?',
    `Slot ${G.slot + 1} will be erased permanently and you will be returned to the title screen. `
    + 'Export a copy first if you might want it back.',
    () => {
      Save.deleteSlot(G.slot);
      G.state = createState();
      G.paused = true;
      closeModals();
      returnToTitle();
    },
  );
}
