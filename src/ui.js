// ui.js — all rendering and DOM interaction.
//
// Structural changes are event-driven (see state.on); fast-moving numbers
// (health bars, timers) are refreshed from the main loop via tick().

import { G, on, emit, log, xpToNext, INVENTORY_CAPACITY, MAP_CAPACITY, newCharacter } from './state.js';
import { fmt, fmtInt, fmtTime, signed, clamp, qs, qsa, el, escapeHtml } from './util.js';
import { computeStats, ehp } from './stats.js';
import { RARITY, itemBaseStats, itemMods } from './items.js';
import { BASE_BY_ID, EQUIP_SLOTS, SLOTS } from './data/bases.js';
import { UNIQUE_BY_ID } from './data/uniques.js';
import { CURRENCIES, CURRENCY_BY_ID } from './data/currency.js';
import {
  addItem, equipItem, unequipItem, salvageItem, salvageAll, sortInventory, sortMaps,
  spendCurrency, hasCurrency,
} from './inventory.js';
import { applyCurrency, canApply } from './currency.js';
import { createMap, mapModLines, mapModifiers, mapDanger, monsterCount, grantStarterMap } from './maps.js';
import { startMap, startBossFight, abandonMap, mapProgress, clearSpeed, refreshDerived } from './combat.js';
import { BOSSES } from './data/monsters.js';
import { TREE, TREE_RADIUS, nodeText, canAllocate, canRefund, pointSummary, treeIsFull } from './passives.js';
import * as Save from './save.js';

/** Transient UI state — never persisted. */
const ui = {
  craftCurrency: null,

  // scale 1 == "whole tree fits the panel", since the viewBox already frames it.
  tree: { x: 0, y: 0, scale: 1, dragging: false, lx: 0, ly: 0, built: false },
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
  wireGearActions();
  wireAtlasActions();
  wireTree();
  wireLogFilters();
  buildCurrencyGrid();

  // Structural re-renders, driven by the event bus.
  on('inventory', () => { renderInventory(); });
  on('equipment', () => { renderDoll(); renderInventory(); });
  on('stash', () => { renderCurrency(); renderCraftPanel(); });
  on('maps', () => { renderMaps(); renderAtlas(); });
  on('stats', () => { renderStatSheet(); renderQuickStats(); renderPassiveHeader(); });
  on('combat', () => { renderMapHeader(); renderArena(); renderMaps(); });
  on('log', () => { renderLog(); });
  on('passives', () => { renderTree(); renderPassiveHeader(); renderStatSheet(); });
  on('saves', () => { renderSlots(); });
  on('loaded', () => { ui.craftCurrency = null; renderAll(); });

  renderAll();
}

export function renderAll() {
  renderCharBar();
  renderQuickStats();
  renderStatSheet();
  renderPassiveHeader();
  renderTree();
  renderMapHeader();
  renderArena();
  renderLog();
  renderAtlas();
  renderMaps();
  renderBosses();
  renderDoll();
  renderInventory();
  renderCurrency();
  renderCraftPanel();
  renderSettings();
}

/** Called every animation frame for smoothly-moving numbers. */
export function tick() {
  renderCharBar();
  updateArenaBars();
  renderStatus();
}

// ===========================================================================
// Tabs & chrome
// ===========================================================================

function wireTabs() {
  for (const nav of qsa('.tabs')) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      selectTab(nav, btn.dataset.tab);
    });
  }
}

function selectTab(nav, tabId) {
  const panel = nav.parentElement;
  qsa('.tab', nav).forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  qsa('.tab-body', panel).forEach((b) => b.classList.toggle('active', b.id === `tab-${tabId}`));
  if (tabId === 'passives') requestAnimationFrame(renderTree);
}

/** Programmatic tab switch by tab id. */
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
  const c = s.combat;
  const left = c
    ? `${c.map.name} · T${c.tier} · ${c.index}/${c.total} slain · ${clearSpeed(c).toFixed(1)}/min`
    : 'Idle in the hideout.';
  qs('#statusLeft').textContent = left;
  qs('#statusRight').textContent =
    `Slot ${G.slot + 1} · ${fmtTime(s.playtime)} played · ${fmtInt(s.stats.kills)} kills`;
}

export function setStatus(msg) { qs('#statusLeft').textContent = msg; }

// ===========================================================================
// Character bar & quick stats
// ===========================================================================

function renderCharBar() {
  const s = G.state;
  if (!s) return;
  const need = xpToNext(s.player.level);
  const pct = clamp((s.player.xp / need) * 100, 0, 100);
  qs('#charName').textContent = s.name;
  qs('#charLevel').textContent = s.player.level;
  qs('#xpFill').style.width = `${pct}%`;
  qs('#xpText').textContent = `${fmt(s.player.xp)} / ${fmt(need)}  (${pct.toFixed(1)}%)`;
}

function renderQuickStats() {
  const d = G.derived;
  if (!d) return;
  qs('#qsDps').textContent = fmt(d.dps);
  qs('#qsLife').textContent = fmt(d.life);
  qs('#qsEs').textContent = fmt(d.es);
  qs('#qsTier').textContent = G.state.atlas.highestTier;
}

// ===========================================================================
// Character sheet
// ===========================================================================

function statRow(label, value, extra = '') {
  return `<div class="stat-row"><label>${label}</label><b>${value}${extra ? `<small>${extra}</small>` : ''}</b></div>`;
}

function renderStatSheet() {
  const d = G.derived;
  const s = G.state;
  if (!d || !s) return;

  const dmgLines = [];
  for (const [key, label, cls] of [
    ['phys', 'Physical', 'phys'], ['fire', 'Fire', 'fire'], ['cold', 'Cold', 'cold'],
    ['light', 'Lightning', 'light'], ['chaos', 'Chaos', 'chaos'],
  ]) {
    const [lo, hi] = d.dmg[key];
    if (hi <= 0) continue;
    dmgLines.push(statRow(
      `<span style="color:var(--${cls})">${label}</span>`,
      `${fmt(lo)} – ${fmt(hi)}`,
    ));
  }

  const resHtml = ['fire', 'cold', 'light', 'chaos'].map((k) => {
    const r = d.res[k];
    const capped = r.raw >= r.cap;
    const neg = r.value < 0;
    return `<div class="res ${k} ${capped ? 'capped' : ''} ${neg ? 'neg' : ''}">
      <label>${k === 'light' ? 'LIGHT' : k.toUpperCase()}</label>
      <b>${r.value}%</b>
      <small>${r.raw > r.cap ? `+${r.raw - r.cap} over` : `max ${r.cap}%`}</small>
    </div>`;
  }).join('');

  const keystones = Object.keys(d.flags).length
    ? `<div class="stat-group"><h3>Keystones</h3><div class="keystone-list">${
      Object.keys(d.flags).map((f) => `<span class="keystone-chip">${keystoneLabel(f)}</span>`).join('')
    }</div></div>` : '';

  qs('#statSheet').innerHTML = `
    <div class="attr-grid">
      <div class="attr str"><label>STR</label><b>${d.attrs.str}</b></div>
      <div class="attr dex"><label>DEX</label><b>${d.attrs.dex}</b></div>
      <div class="attr int"><label>INT</label><b>${d.attrs.int}</b></div>
    </div>

    <div class="stat-group">
      <h3>Offence</h3>
      ${statRow('Damage per Second', `<span style="color:var(--gold)">${fmt(d.dps)}</span>`)}
      ${statRow('Hit Damage', `${fmt(d.hitMin)} – ${fmt(d.hitMax)}`)}
      ${statRow('Attacks per Second', d.aps.toFixed(2))}
      ${statRow('Critical Chance', `${d.critChance.toFixed(1)}%`)}
      ${statRow('Critical Multiplier', `${d.critMulti.toFixed(0)}%`)}
      ${statRow('Accuracy', isFinite(d.accuracy) ? fmt(d.accuracy) : 'Always Hits')}
      ${dmgLines.join('')}
    </div>

    <div class="stat-group">
      <h3>Defence</h3>
      ${statRow('Life', `<span class="c-life">${fmt(d.life)}</span>`, `+${fmt(d.regen)}/s`)}
      ${statRow('Energy Shield', `<span class="c-es">${fmt(d.es)}</span>`, d.canRecharge ? `${fmt(d.esRechargeRate)}/s` : 'no recharge')}
      ${statRow('Armour', fmt(d.armour))}
      ${statRow('Evasion', fmt(d.evasion))}
      ${d.block > 0 ? statRow('Block Chance', `${d.block.toFixed(0)}%`) : ''}
      ${statRow('EHP vs Physical', fmt(ehp(d, 'phys')))}
      ${statRow('EHP vs Fire', fmt(ehp(d, 'fire')))}
      ${d.leech > 0 ? statRow('Life Leech', `${d.leech.toFixed(2)}%`) : ''}
    </div>

    <div class="stat-group">
      <h3>Resistances</h3>
      <div class="res-grid">${resHtml}</div>
    </div>

    <div class="stat-group">
      <h3>Utility</h3>
      ${statRow('Movement Speed', `${signed(d.moveSpeed)}%`)}
      ${statRow('Item Rarity', `${signed(d.rarity)}%`)}
      ${statRow('Mana', fmt(d.mana))}
      ${d.reflect > 0 ? statRow('Damage Reflected', `${d.reflect.toFixed(0)}%`) : ''}
    </div>

    ${keystones}

    <div class="stat-group">
      <h3>Records</h3>
      ${statRow('Monsters Slain', fmtInt(s.stats.kills))}
      ${statRow('Maps Completed', fmtInt(s.stats.mapsRun))}
      ${statRow('Deaths', fmtInt(s.stats.deaths))}
      ${statRow('Items Found', fmtInt(s.stats.itemsFound))}
      ${statRow('Uniques Found', fmtInt(s.stats.uniquesFound))}
      ${statRow('Pinnacle Kills', fmtInt(s.stats.bossKills))}
      ${statRow('Highest Tier', s.atlas.highestTier)}
    </div>`;
}

function keystoneLabel(flag) {
  return ({
    resoluteTechnique: 'Resolute Technique', eleOverload: 'Elemental Overload',
    ci: 'Chaos Inoculation', vaalPact: 'Vaal Pact', acrobatics: 'Acrobatics',
    cannotEvade: 'Unwavering Stance',
  })[flag] ?? flag;
}

// ===========================================================================
// Passive tree
// ===========================================================================

function renderPassiveHeader() {
  const s = G.state;
  if (!s) return;
  const p = pointSummary(s);
  const full = treeIsFull(s);
  qs('#passiveBadge').textContent = p.available;
  qs('#passiveHeader').innerHTML = `
    <span class="points-pill ${p.available ? '' : 'none'}">${p.available} point${p.available === 1 ? '' : 's'} unspent</span>
    <span class="hint">${p.spent} allocated${full ? ` · ${s.passives.mastery} mastery` : ''}</span>
    <button class="btn tiny" id="btnRefundAll">Refund All</button>`;
  qs('#btnRefundAll').onclick = () => confirmAction(
    'Refund all passives?',
    'Every allocated node and mastery point will be returned. This cannot be undone.',
    () => {
      s.passives.allocated = {};
      s.passives.mastery = 0;
      emit('passives'); refreshDerived();
      log('All passive points refunded.', 'sys');
    },
  );
}

function wireTree() {
  const wrap = qs('#treeWrap');
  const svg = qs('#tree');

  wrap.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tn') || e.target.closest('.btn')) return;
    ui.tree.dragging = true;
    ui.tree.lx = e.clientX; ui.tree.ly = e.clientY;
    wrap.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!ui.tree.dragging) return;
    ui.tree.x += e.clientX - ui.tree.lx;
    ui.tree.y += e.clientY - ui.tree.ly;
    ui.tree.lx = e.clientX; ui.tree.ly = e.clientY;
    applyTreeTransform();
  });
  window.addEventListener('mouseup', () => {
    ui.tree.dragging = false;
    wrap.classList.remove('dragging');
  });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTree(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  qs('#btnTreeZoomIn').onclick = () => zoomTree(1.2);
  qs('#btnTreeZoomOut').onclick = () => zoomTree(1 / 1.2);
  qs('#btnTreeReset').onclick = () => {
    ui.tree.x = 0; ui.tree.y = 0; ui.tree.scale = 1;
    applyTreeTransform();
  };

  svg.addEventListener('click', (e) => {
    const g = e.target.closest('.tn');
    if (g) onNodeClick(g.dataset.id);
  });
  svg.addEventListener('mouseover', (e) => {
    const g = e.target.closest('.tn');
    if (g) showNodeInfo(g.dataset.id);
  });
}

function zoomTree(factor) {
  ui.tree.scale = clamp(ui.tree.scale * factor, 0.22, 2.2);
  applyTreeTransform();
}

function applyTreeTransform() {
  const g = qs('#treeG');
  if (!g) return;
  const { x, y, scale } = ui.tree;
  g.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
}

function renderTree() {
  const svg = qs('#tree');
  const s = G.state;
  if (!svg || !s) return;

  const size = TREE_RADIUS * 2;
  svg.setAttribute('viewBox', `${-TREE_RADIUS} ${-TREE_RADIUS} ${size} ${size}`);

  if (!ui.tree.built) {
    const parts = ['<g id="treeG">'];

    // Links first so nodes draw on top.
    const drawn = new Set();
    for (const node of Object.values(TREE)) {
      for (const other of node.links) {
        const key = [node.id, other].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const o = TREE[other];
        parts.push(`<line class="tl" data-link="${key}" x1="${node.x.toFixed(1)}" y1="${node.y.toFixed(1)}" x2="${o.x.toFixed(1)}" y2="${o.y.toFixed(1)}"/>`);
      }
    }

    for (const node of Object.values(TREE)) {
      const label = node.kind === 'minor' ? '' :
        `<text class="tn-l" x="${node.x.toFixed(1)}" y="${(node.y + (node.kind === 'start' ? 58 : 50)).toFixed(1)}">${escapeHtml(node.name)}</text>`;
      parts.push(
        `<g class="tn ${node.kind}" data-id="${node.id}">` +
        `<circle class="tn-c" cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}"/>` +
        label + '</g>',
      );
    }
    parts.push('</g>');
    svg.innerHTML = parts.join('');
    ui.tree.built = true;
    applyTreeTransform();
  }

  // Refresh allocation classes.
  const alloc = s.passives.allocated;
  for (const g of qsa('.tn', svg)) {
    const id = g.dataset.id;
    const isOn = id === 'start' || !!alloc[id];
    g.classList.toggle('on', isOn);
    g.classList.toggle('avail', !isOn && canAllocate(alloc, id));
  }
  for (const line of qsa('.tl', svg)) {
    const [a, b] = line.dataset.link.split('|');
    const on = (a === 'start' || alloc[a]) && (b === 'start' || alloc[b]);
    line.classList.toggle('on', on);
  }
}

function showNodeInfo(id) {
  const node = TREE[id];
  if (!node) return;
  const s = G.state;
  const allocated = !!s.passives.allocated[id];
  const lines = nodeText(node).map((t) =>
    `<div class="${node.kind === 'keystone' ? 'ks' : 'mod'}">${escapeHtml(t)}</div>`).join('');
  const action = allocated
    ? (canRefund(s.passives.allocated, id) ? 'Click to refund' : 'Cannot refund — other nodes depend on it')
    : (canAllocate(s.passives.allocated, id)
      ? (pointSummary(s).available > 0 ? 'Click to allocate' : 'No points available')
      : 'Not connected to your tree');
  qs('#passiveInfo').innerHTML =
    `<h4>${escapeHtml(node.name)} <span class="hint">· ${node.kind}</span></h4>${lines}
     <div class="hint" style="margin-top:4px">${action}</div>`;
}

function onNodeClick(id) {
  const s = G.state;
  if (id === 'start') return;
  const alloc = s.passives.allocated;

  if (alloc[id]) {
    if (!canRefund(alloc, id)) { setStatus('That node cannot be refunded without orphaning others.'); return; }
    delete alloc[id];
  } else {
    if (!canAllocate(alloc, id)) { setStatus('That node is not connected to your tree.'); return; }
    if (pointSummary(s).available <= 0) { setStatus('No passive points available.'); return; }
    alloc[id] = true;
  }
  emit('passives');
  refreshDerived();
  showNodeInfo(id);
}

// ===========================================================================
// Combat panel
// ===========================================================================

function renderMapHeader() {
  const s = G.state;
  const c = s.combat;
  const host = qs('#mapHeader');

  if (!c) {
    const best = s.maps.length
      ? s.maps.slice().sort((a, b) => b.tier - a.tier)[0]
      : null;
    host.innerHTML = `
      <div class="map-banner">
        <div class="idle-state">
          <h3>Hideout</h3>
          <p>Select a map from the Atlas to begin.</p>
          ${best ? `<div class="row" style="justify-content:center">
            <button class="btn primary" id="btnQuickRun">Run ${escapeHtml(best.name)} (T${best.tier})</button>
          </div>` : `<p class="hint" style="margin-top:8px">No maps left — craft one in the Atlas tab.</p>`}
        </div>
      </div>`;
    if (best) qs('#btnQuickRun').onclick = () => { startMap(best.uid); gotoTab('combat'); };
    return;
  }

  const pct = mapProgress(c) * 100;
  const mods = c.map.mods ? mapModLines(c.map) : [];
  host.innerHTML = `
    <div class="map-banner running">
      <div class="map-banner-top">
        <span class="map-title" style="color:var(--${R(c.map.rarity)})">
          ${escapeHtml(c.map.name)}</span>
        <span class="map-meta">Tier ${c.tier} · mlvl ${c.level} · ilvl ${c.ilvl}</span>
      </div>
      <div class="map-mods">
        ${mods.map((m) => `<span class="mm ${m.type === 'suffix' ? 'bad' : ''}">${escapeHtml(m.text)}</span>`).join('')}
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="mapProgressFill" style="width:${pct}%"></div>
        <span class="progress-text" id="mapProgressText"></span>
      </div>
      <div class="row">
        <button class="btn tiny danger" id="btnAbandon">Abandon Run</button>
        <span class="hint" id="runStats"></span>
      </div>
    </div>`;
  qs('#btnAbandon').onclick = () => abandonMap();
}

function renderArena() {
  const c = G.state.combat;
  const host = qs('#combatArena');
  if (!c) { host.innerHTML = ''; return; }

  const d = G.derived;
  host.innerHTML = `
    <div class="fight">
      <div class="fighter player">
        <div class="fighter-name"><span style="color:var(--gold)">${escapeHtml(G.state.name)}</span>
          <small>Level ${G.state.player.level}</small></div>
        <div class="bar life"><i id="pLifeBar"></i><span id="pLifeText"></span></div>
        ${d.es > 0 ? '<div class="bar es"><i id="pEsBar"></i><span id="pEsText"></span></div>' : ''}
        <div class="fighter-stats">
          <span><b>${fmt(d.dps)}</b> dps</span>
          <span><b>${d.aps.toFixed(2)}</b> aps</span>
          <span><b>${fmt(d.armour)}</b> ar</span>
          <span><b>${fmt(d.evasion)}</b> ev</span>
        </div>
      </div>
      <div class="vs">VS</div>
      <div class="fighter monster" id="monsterCard"></div>
    </div>`;
  updateArenaBars();
}

function updateArenaBars() {
  const c = G.state?.combat;
  if (!c || !c.pool) return;
  const d = G.derived;

  const lifeBar = qs('#pLifeBar');
  if (lifeBar) {
    const pct = clamp((c.pool.life / Math.max(1, c.pool.maxLife)) * 100, 0, 100);
    lifeBar.style.width = `${pct}%`;
    qs('#pLifeText').textContent = `${fmt(Math.max(0, c.pool.life))} / ${fmt(c.pool.maxLife)}`;
  }
  const esBar = qs('#pEsBar');
  if (esBar) {
    const pct = clamp((c.pool.es / Math.max(1, c.pool.maxES)) * 100, 0, 100);
    esBar.style.width = `${pct}%`;
    qs('#pEsText').textContent = `${fmt(Math.max(0, c.pool.es))} / ${fmt(c.pool.maxES)}`;
  }

  const card = qs('#monsterCard');
  if (card) {
    const m = c.monster;
    if (!m) {
      card.innerHTML = `<div class="idle-state" style="padding:14px">Advancing… ${c.travelTimer > 0 ? `${c.travelTimer.toFixed(1)}s` : ''}</div>`;
    } else {
      const pct = clamp((m.life / m.maxLife) * 100, 0, 100);
      card.innerHTML = `
        <div class="fighter-name"><span class="${m.isBoss ? 'boss-name' : ''}"
          style="color:${m.isBoss ? '#d88ae0' : m.rarity === 'rare' ? 'var(--r-rare)' : m.rarity === 'magic' ? 'var(--r-magic)' : 'var(--r-normal)'}">
          ${escapeHtml(m.name)}</span><small>${m.rarity}</small></div>
        <div class="bar mon"><i style="width:${pct}%"></i><span>${fmt(Math.max(0, m.life))} / ${fmt(m.maxLife)}</span></div>
        <div class="fighter-stats">
          <span><b>${fmt(m.dmg)}</b> hit</span>
          <span><b>${m.aps.toFixed(2)}</b> aps</span>
          <span><b>${fmt(m.armour)}</b> ar</span>
          <span><b>${m.res}%</b> res</span>
        </div>`;
    }
  }

  const fill = qs('#mapProgressFill');
  if (fill) {
    fill.style.width = `${mapProgress(c) * 100}%`;
    qs('#mapProgressText').textContent = c.isBossRun
      ? 'PINNACLE ENCOUNTER'
      : `${c.index} / ${c.total}${c.bossPending ? '' : ' + BOSS'}`;
    const rs = qs('#runStats');
    if (rs) {
      rs.textContent = `${fmtTime(c.elapsed)} · ${fmt(c.rewards.xp)} xp · ${c.rewards.items} items · ${c.rewards.currency} currency`;
    }
  }
}

function wireLogFilters() {
  const host = qs('#logFilters');
  const filters = [['all', 'All'], ['loot', 'Loot'], ['combat', 'Combat'], ['boss', 'Story']];
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
  loot: new Set(['loot', 'unique', 'xp']),
  combat: new Set(['hit', 'crit', 'kill', 'danger']),
  boss: new Set(['boss', 'sys', 'unique']),
};

function renderLog() {
  const host = qs('#combatLog');
  const s = G.state;
  if (!host || !s) return;
  const group = LOG_GROUPS[ui.logFilter];
  const atBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 40;

  const rows = s.log
    .filter((l) => !group || group.has(l.cls))
    .slice(-160)
    .map((l) => `<div class="l ${l.cls}">${escapeHtml(l.msg)}</div>`);
  host.innerHTML = rows.join('');
  if (atBottom) host.scrollTop = host.scrollHeight;
}

// ===========================================================================
// Atlas & maps
// ===========================================================================

function wireAtlasActions() {
  qs('#btnSortMaps').onclick = () => sortMaps();
  qs('#btnCraftMap').onclick = () => {
    if (!hasCurrency('alchemy', 1)) { setStatus('You need an Orb of Alchemy to craft a map.'); return; }
    if (G.state.maps.length >= MAP_CAPACITY) { setStatus('Map stash is full.'); return; }
    spendCurrency('alchemy', 1);
    const map = createMap({ tier: 1, rarity: 'rare' });
    addItem(map);
    log(`Crafted ${map.name} (T1).`, 'loot');
  };
}

function renderAtlas() {
  const s = G.state;
  const a = s.atlas;
  const host = qs('#atlasSummary');
  const maxShown = Math.max(16, a.unlocked + 2);

  let cells = '';
  for (let t = 1; t <= maxShown; t++) {
    const done = (a.completed[t] ?? 0) > 0;
    const locked = t > a.unlocked;
    cells += `<div class="atlas-cell ${done ? 'done' : ''} ${locked ? 'locked' : ''}"
      title="Tier ${t}${done ? ` — completed ${a.completed[t]}x` : ''}${locked ? ' — locked' : ''}">
      ${t}${done ? `<small>${a.completed[t]}</small>` : ''}</div>`;
  }

  host.innerHTML = `
    <div class="map-banner">
      <div class="map-banner-top">
        <span class="map-title">The Atlas</span>
        <span class="map-meta">Highest T${a.highestTier} · Unlocked T${a.unlocked} · ${fmtInt(s.stats.mapsRun)} runs</span>
      </div>
      <div class="atlas-grid">${cells}</div>
    </div>`;
  qs('#mapBadge').textContent = s.maps.length;
}

function renderMaps() {
  const s = G.state;
  const host = qs('#mapList');
  if (!host) return;
  qs('#mapBadge').textContent = s.maps.length;

  if (!s.maps.length) {
    host.innerHTML = `<div class="empty-note">No maps in stash.<br>Complete a map to find more, or craft a Tier 1 above.</div>`;
    return;
  }

  const running = !!s.combat;
  host.innerHTML = s.maps.map((m) => {
    const mm = mapModifiers(m);
    const danger = mapDanger(m, mm);
    const dcls = danger < 90 ? 'low' : danger < 220 ? 'mid' : 'high';
    const craft = ui.craftCurrency ? canApply(ui.craftCurrency, m) : null;
    return `<div class="map-row ${R(m.rarity)} ${craft ? (craft.ok ? 'craftable' : 'not-craftable') : ''}"
                 data-uid="${m.uid}" data-kind="map">
      <div class="map-tier">${m.tier}</div>
      <div class="map-info">
        <div class="map-name">${escapeHtml(m.name)}${m.quality ? ` <small style="color:var(--gold)">+${m.quality}%</small>` : ''}${m.corrupted ? ' <small style="color:#a4322a">corrupted</small>' : ''}</div>
        <div class="map-sub">${m.mods.length} mods · ${monsterCount(m, mm)} monsters ·
          <span style="color:var(--good)">+${mm.quant}% quant</span> ·
          <span style="color:var(--r-rare)">+${mm.rarity}% rarity</span></div>
      </div>
      <span class="danger-pill ${dcls}">${danger}</span>
      <div class="map-actions">
        <button class="btn tiny primary" data-run="${m.uid}" ${running ? 'disabled' : ''}>Run</button>
      </div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const runBtn = e.target.closest('[data-run]');
    if (runBtn) {
      if (startMap(runBtn.dataset.run)) gotoTab('combat');
      return;
    }
    const row = e.target.closest('[data-uid]');
    if (row && ui.craftCurrency) applyCraft(row.dataset.uid);
  };
  host.onmouseover = (e) => {
    const row = e.target.closest('[data-uid]');
    if (row) showMapTooltip(findMap(row.dataset.uid), e);
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

function findMap(uid) { return G.state.maps.find((m) => m.uid === uid); }

// ===========================================================================
// Pinnacle bosses
// ===========================================================================

function renderBosses() {
  const s = G.state;
  const host = qs('#bossList');
  const frags = s.stash.fragment ?? 0;

  host.innerHTML = `
    <div class="map-banner" style="margin-bottom:10px">
      <div class="map-banner-top">
        <span class="map-title">Pinnacle Encounters</span>
        <span class="map-meta"><b style="color:var(--r-unique)">${frags}</b> Pinnacle Fragments</span>
      </div>
      <p class="hint" style="margin-top:6px">Fragments drop from completing Tier 5+ maps. Spend them
        to summon a pinnacle guardian — a pure stat check with a guaranteed unique-weighted loot table.</p>
    </div>
  ` + BOSSES.map((b) => {
    const unlocked = s.atlas.highestTier >= b.tier;
    const ready = unlocked && frags >= b.frags && !s.combat;
    const kills = s.atlas.bossKills[b.id] ?? 0;
    return `<div class="boss-card ${ready ? 'ready' : ''} ${unlocked ? '' : 'locked'}">
      <div class="boss-top">
        <span class="boss-name">${escapeHtml(b.name)}</span>
        <span class="map-meta">${kills ? `${kills} kills` : 'never defeated'}</span>
      </div>
      <div class="boss-intro">${escapeHtml(b.intro)}</div>
      <div class="boss-reqs">
        <span>Requires <b>Tier ${b.tier}</b></span>
        <span>Costs <b>${b.frags} Fragments</b></span>
        <span>Unique chance <b>${Math.round(b.uniqueChance * 100)}%</b></span>
      </div>
      <button class="btn ${ready ? 'primary' : ''}" data-boss="${b.id}" ${ready ? '' : 'disabled'}>
        ${!unlocked ? `Locked — reach Tier ${b.tier}` : frags < b.frags ? `Need ${b.frags - frags} more Fragments` : s.combat ? 'Finish your current run' : 'Summon'}
      </button>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const btn = e.target.closest('[data-boss]');
    if (!btn || btn.disabled) return;
    if (startBossFight(btn.dataset.boss)) gotoTab('combat');
    renderBosses();
  };
}

// ===========================================================================
// Equipment doll & inventory
// ===========================================================================

function wireGearActions() {
  qs('#btnSortInv').onclick = () => sortInventory();
  qs('#btnSalvageNormal').onclick = () => confirmAction(
    'Salvage all Normal items?', 'Every Normal item in your inventory will be broken down into currency.',
    () => salvageAll((i) => i.rarity === 'normal'),
  );
  qs('#btnSalvageMagic').onclick = () => confirmAction(
    'Salvage all Normal and Magic items?', 'Normal and Magic items will be broken down into currency.',
    () => salvageAll((i) => i.rarity === 'normal' || i.rarity === 'magic'),
  );
}

function renderDoll() {
  const s = G.state;
  const host = qs('#equipDoll');
  host.innerHTML = EQUIP_SLOTS.map((slotId) => {
    const item = s.equipment[slotId];
    const label = SLOTS.find((x) => x.id === slotId)?.label ?? slotId;
    if (!item) {
      return `<div class="slot empty" style="grid-area:${slotId}" data-slot="${slotId}" data-label="${label}"></div>`;
    }
    const bs = itemBaseStats(item);
    const sub = bs.dps ? `${fmt(bs.dps)} dps`
      : [bs.armour && `${fmt(bs.armour)} ar`, bs.evasion && `${fmt(bs.evasion)} ev`, bs.es && `${fmt(bs.es)} es`]
        .filter(Boolean).join(' · ') || `ilvl ${item.ilvl}`;
    return `<div class="slot ${R(item.rarity)}" style="grid-area:${slotId}"
                 data-slot="${slotId}" data-uid="${item.uid}">
      <div class="slot-name">${escapeHtml(item.name)}</div>
      <div class="slot-sub">${sub}</div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const cell = e.target.closest('[data-slot]');
    if (!cell) return;
    const slotId = cell.dataset.slot;
    if (ui.craftCurrency && s.equipment[slotId]) { applyCraft(s.equipment[slotId].uid); return; }
    if (s.equipment[slotId]) { unequipItem(slotId); hideTooltip(); }
  };
  host.onmouseover = (e) => {
    const cell = e.target.closest('[data-uid]');
    if (cell) showItemTooltip(s.equipment[cell.dataset.slot], e, null, 'Click to unequip');
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

function renderInventory() {
  const s = G.state;
  const host = qs('#invGrid');
  qs('#invCount').textContent = `${s.inventory.length}/${INVENTORY_CAPACITY}`;

  if (!s.inventory.length) {
    host.innerHTML = `<div class="empty-note" style="grid-column:1/-1">Your inventory is empty.</div>`;
    return;
  }

  host.innerHTML = s.inventory.map((item) => {
    const craft = ui.craftCurrency ? canApply(ui.craftCurrency, item) : null;
    return `<div class="inv-cell ${R(item.rarity)} ${craft ? (craft.ok ? 'craftable' : 'not-craftable') : ''}"
                 data-uid="${item.uid}">
      <div class="inv-name">${escapeHtml(item.name)}</div>
      <span class="inv-ilvl">${item.ilvl}</span>
      ${item.corrupted ? '<span class="corrupt-mark">✦</span>' : ''}
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const cell = e.target.closest('[data-uid]');
    if (!cell) return;
    const uid = cell.dataset.uid;
    if (ui.craftCurrency) { applyCraft(uid); return; }
    const item = s.inventory.find((i) => i.uid === uid);
    if (!item) return;
    if (e.shiftKey) { salvageItem(item); hideTooltip(); }
    else { equipItem(uid); hideTooltip(); }
  };
  host.onmouseover = (e) => {
    const cell = e.target.closest('[data-uid]');
    if (!cell) return;
    const item = s.inventory.find((i) => i.uid === cell.dataset.uid);
    if (item) showItemTooltip(item, e, comparisonFor(item), 'Click to equip · Shift-click to salvage');
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

/** The currently-equipped item this one would replace. */
function comparisonFor(item) {
  const s = G.state;
  if (item.kind !== 'gear') return null;
  if (item.slot === 'ring') return s.equipment.ring1 ?? s.equipment.ring2 ?? null;
  return s.equipment[item.slot] ?? null;
}

// ===========================================================================
// Currency stash & crafting
// ===========================================================================

function buildCurrencyGrid() {
  const host = qs('#currencyGrid');
  host.onclick = (e) => {
    const cell = e.target.closest('[data-cur]');
    if (!cell) return;
    const id = cell.dataset.cur;
    if ((G.state.stash[id] ?? 0) <= 0) return;
    selectCurrency(ui.craftCurrency === id ? null : id);
  };
  host.onmouseover = (e) => {
    const cell = e.target.closest('[data-cur]');
    if (cell) showCurrencyTooltip(CURRENCY_BY_ID[cell.dataset.cur], e);
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

function renderCurrency() {
  const s = G.state;
  const host = qs('#currencyGrid');
  host.innerHTML = CURRENCIES.map((c) => {
    const n = s.stash[c.id] ?? 0;
    return `<div class="cur-cell ${n ? '' : 'zero'} ${ui.craftCurrency === c.id ? 'selected' : ''}"
                 data-cur="${c.id}" data-tier="${c.tier}">
      <div class="cur-orb">${c.short}</div>
      <div class="cur-count">${fmtInt(n)}</div>
      <div class="cur-name">${escapeHtml(c.name.replace('Orb of ', '').replace(' Orb', ''))}</div>
    </div>`;
  }).join('');
}

function selectCurrency(id) {
  ui.craftCurrency = id;
  renderCurrency();
  renderInventory();
  renderMaps();
  renderCraftPanel();
  renderGearBanner();
  if (id) {
    gotoTab('gear');
    setStatus(`${CURRENCY_BY_ID[id].name} selected — click an item to apply it. Press Esc to cancel.`);
  } else {
    setStatus('Crafting cancelled.');
  }
}

function renderCraftPanel() {
  const host = qs('#craftPanel');
  const banner = qs('#craftBanner');
  if (!host) return;

  if (!ui.craftCurrency) {
    banner.classList.add('hidden');
    host.innerHTML = `<p class="hint">Select a currency orb above, then click an item in your
      Equipment tab, an equipped item, or a map in the Atlas to apply it.</p>
      <div class="section-head"><span>Crafting Reference</span></div>
      ${CURRENCIES.filter((c) => c.tier > 0).map((c) =>
    `<div class="stat-row"><label>${escapeHtml(c.name)}</label><b style="font-weight:400;font-size:11px">${escapeHtml(c.use)}</b></div>`).join('')}`;
    return;
  }

  const c = CURRENCY_BY_ID[ui.craftCurrency];
  banner.classList.remove('hidden');
  banner.innerHTML = `<b>${escapeHtml(c.name)}</b> ready — click a valid item.
    <button class="btn tiny" id="btnCancelCraft">Cancel</button>`;
  qs('#btnCancelCraft').onclick = () => selectCurrency(null);

  host.innerHTML = `<div class="craft-target">
      <b style="color:var(--gold)">${escapeHtml(c.name)}</b>
      <div class="hint" style="margin-top:4px">${escapeHtml(c.desc)}</div>
      <div class="hint">${escapeHtml(c.use)}</div>
      <div class="hint" style="margin-top:4px">You have <b>${fmtInt(G.state.stash[c.id] ?? 0)}</b>.</div>
    </div>`;
}

/** A duplicate banner inside the Equipment tab, where the items actually are. */
function renderGearBanner() {
  let banner = qs('#gearCraftBanner');
  if (!ui.craftCurrency) { if (banner) banner.remove(); return; }
  if (!banner) {
    banner = el('div', 'craft-banner');
    banner.id = 'gearCraftBanner';
    qs('#tab-gear').prepend(banner);
  }
  const c = CURRENCY_BY_ID[ui.craftCurrency];
  banner.innerHTML = `<b>${escapeHtml(c.name)}</b> — click a valid item to apply.
    <button class="btn tiny" id="btnCancelCraft2">Cancel</button>`;
  qs('#btnCancelCraft2').onclick = () => selectCurrency(null);
}

function applyCraft(uid) {
  const s = G.state;
  const item = s.inventory.find((i) => i.uid === uid)
    || s.maps.find((i) => i.uid === uid)
    || Object.values(s.equipment).find((i) => i && i.uid === uid);
  if (!item) return;

  const res = applyCurrency(ui.craftCurrency, item);
  setStatus(res.msg);
  if (!res.ok) return;

  if ((s.stash[ui.craftCurrency] ?? 0) <= 0) selectCurrency(null);
  else { renderCurrency(); renderInventory(); renderMaps(); renderCraftPanel(); }
  renderDoll();
  refreshDerived();
}

// ===========================================================================
// Tooltips
// ===========================================================================

const tip = () => qs('#tooltip');

function showItemTooltip(item, event, compare = null, hint = '') {
  if (!item) return;
  const t = tip();
  t.className = `tooltip ${R(item.rarity)}`;
  t.innerHTML = itemTooltipHtml(item, compare, hint);
  t.classList.remove('hidden');
  moveTooltip(event);
}

function itemTooltipHtml(item, compare, hint) {
  const base = BASE_BY_ID[item.baseId];
  const bs = itemBaseStats(item);
  const mods = itemMods(item);
  const parts = [];

  parts.push(`<div class="tt-name">${escapeHtml(item.name)}</div>`);
  if (item.rarity !== 'normal') parts.push(`<div class="tt-base">${escapeHtml(item.baseName ?? base?.class ?? '')}</div>`);
  else parts.push(`<div class="tt-base">${escapeHtml(bs.class ?? '')}</div>`);

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
  if (bs.req) {
    parts.push(line('Requires', Object.entries(bs.req).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(', ')));
  }
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

  if (compare) parts.push(compareHtml(item, compare));
  if (hint) parts.push(`<div class="tt-hint">${escapeHtml(hint)}</div>`);
  return parts.join('');
}

function line(label, value) {
  return `<div class="tt-line"><label>${label}</label><span>${value}</span></div>`;
}

/**
 * Diffs the character sheet with `item` equipped versus what's there now.
 * Equipment is swapped temporarily; computeStats never mutates state.
 */
function compareHtml(item, current) {
  const s = G.state;
  const slot = item.slot === 'ring'
    ? (s.equipment.ring1 === current ? 'ring1' : s.equipment.ring2 === current ? 'ring2' : 'ring1')
    : item.slot;

  const before = G.derived ?? computeStats(s);
  const saved = s.equipment[slot];
  s.equipment[slot] = item;
  let after;
  try { after = computeStats(s); } finally { s.equipment[slot] = saved; }

  const rows = [
    ['DPS', before.dps, after.dps],
    ['Life', before.life, after.life],
    ['Energy Shield', before.es, after.es],
    ['Armour', before.armour, after.armour],
    ['Evasion', before.evasion, after.evasion],
  ].filter(([, a, b]) => Math.abs(b - a) > 0.5);

  if (!rows.length) return '<div class="tt-compare">No net change to your defences or damage.</div>';
  return `<div class="tt-compare">${rows.map(([label, a, b]) => {
    const diff = b - a;
    const cls = diff > 0 ? 'tt-up' : 'tt-down';
    return `<div class="tt-line"><label>${label}</label>
      <span class="${cls}">${signed(diff > 0 ? Math.round(diff) : Math.round(diff))} (${fmt(b)})</span></div>`;
  }).join('')}</div>`;
}

function showMapTooltip(map, event) {
  if (!map) return;
  const mm = mapModifiers(map);
  const t = tip();
  t.className = `tooltip ${R(map.rarity)}`;
  t.innerHTML = `
    <div class="tt-name">${escapeHtml(map.name)}</div>
    <div class="tt-base">Tier ${map.tier} Map${map.quality ? ` · ${map.quality}% Quality` : ''}</div>
    <div class="tt-sep"></div>
    ${line('Monster Level', String(mapLevelOf(map)))}
    ${line('Item Level', String(map.ilvl))}
    ${line('Monsters', String(monsterCount(map, mm)))}
    ${line('Item Quantity', `<span style="color:var(--good)">+${mm.quant}%</span>`)}
    ${line('Item Rarity', `<span style="color:var(--r-rare)">+${mm.rarity}%</span>`)}
    ${map.mods.length ? '<div class="tt-sep"></div>' : ''}
    ${mapModLines(map).map((m) => `<div class="tt-mod">${escapeHtml(m.text)}</div>`).join('')}
    ${map.corrupted ? '<div class="tt-corrupt">Corrupted</div>' : ''}
    <div class="tt-hint">Click Run to enter${ui.craftCurrency ? ' · click the row to craft' : ''}</div>`;
  t.classList.remove('hidden');
  moveTooltip(event);
}

function mapLevelOf(map) { return 66 + map.tier * 2; }

function showCurrencyTooltip(c, event) {
  if (!c) return;
  const t = tip();
  t.className = 'tooltip';
  t.innerHTML = `
    <div class="tt-name" style="color:var(--r-currency)">${escapeHtml(c.name)}</div>
    <div class="tt-sep"></div>
    <div class="tt-implicit">${escapeHtml(c.desc)}</div>
    <div class="tt-mod" style="margin-top:4px">${escapeHtml(c.use)}</div>
    <div class="tt-hint">Stack: ${fmtInt(G.state.stash[c.id] ?? 0)}</div>`;
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
    if (ui.craftCurrency) { selectCurrency(null); return; }
    closeModals();
  });

  // Save manager
  qs('#btnExport').onclick = () => {
    qs('#saveText').value = Save.exportSave();
    setStatus('Save exported to the text box.');
  };
  qs('#btnCopy').onclick = async () => {
    const box = qs('#saveText');
    if (!box.value) box.value = Save.exportSave();
    try {
      await navigator.clipboard.writeText(box.value);
      setStatus('Save string copied to clipboard.');
    } catch {
      box.select();
      setStatus('Press Ctrl+C to copy the selected text.');
    }
  };
  qs('#btnImport').onclick = () => {
    const text = qs('#saveText').value;
    confirmAction('Import this save?', 'Your current character will be replaced by the imported data.', () => {
      try {
        Save.importSave(text);
        Save.saveToSlot(G.slot, true);
        closeModals();
        log('Save imported.', 'sys');
      } catch (e) {
        setStatus(`Import failed: ${e.message}`);
      }
    });
  };
  qs('#btnDownload').onclick = () => Save.downloadSave();
  qs('#fileInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await Save.uploadSave(file);
      Save.saveToSlot(G.slot, true);
      closeModals();
      log('Save file loaded.', 'sys');
    } catch (err) {
      setStatus(`Could not load file: ${err.message}`);
    }
    e.target.value = '';
  };

  // Confirm dialog
  qs('#btnConfirmNo').onclick = () => { ui.confirmCb = null; closeModals(); };
  qs('#btnConfirmYes').onclick = () => {
    const cb = ui.confirmCb;
    ui.confirmCb = null;
    closeModals();
    if (cb) cb();
  };

  // New character
  qs('#btnCreateChar').onclick = () => {
    const name = (qs('#newName').value || 'Exile').trim().slice(0, 18);
    G.state = newCharacter(name);
    addItem(grantStarterMap());
    Save.saveToSlot(G.slot, true);
    emit('loaded');
    closeModals();
    log(`${name} arrives on the shore. Welcome to the Atlas.`, 'sys');
  };
}

export function openNewCharacter() {
  qs('#newName').value = '';
  openModal('modalNew');
  setTimeout(() => qs('#newName').focus(), 50);
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
      return `<div class="slot-card">
        <div class="si"><div class="sn">Slot ${s.slot + 1}</div><div class="sd">Empty</div></div>
        <div class="sa"><button class="btn tiny" data-save="${s.slot}">Save Here</button></div>
      </div>`;
    }
    if (s.corrupt) {
      return `<div class="slot-card">
        <div class="si"><div class="sn">Slot ${s.slot + 1}</div><div class="sd">Corrupt data</div></div>
        <div class="sa"><button class="btn tiny danger" data-del="${s.slot}">Delete</button></div>
      </div>`;
    }
    const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : 'unknown';
    return `<div class="slot-card ${s.slot === G.slot ? 'current' : ''}">
      <div class="si">
        <div class="sn">Slot ${s.slot + 1} — ${escapeHtml(s.name)}</div>
        <div class="sd">Level ${s.level} · Tier ${s.tier} · ${fmtInt(s.kills)} kills · ${fmtTime(s.playtime)}</div>
        <div class="sd">${when}</div>
      </div>
      <div class="sa">
        <button class="btn tiny" data-load="${s.slot}">Load</button>
        <button class="btn tiny" data-save="${s.slot}">Overwrite</button>
        <button class="btn tiny danger" data-del="${s.slot}">Delete</button>
      </div>
    </div>`;
  }).join('');

  host.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.save !== undefined) {
      Save.saveToSlot(Number(btn.dataset.save));
      renderSlots();
    } else if (btn.dataset.load !== undefined) {
      const slot = Number(btn.dataset.load);
      confirmAction('Load this save?', 'Unsaved progress on your current character will be lost.', () => {
        if (Save.loadSlot(slot)) { closeModals(); log(`Loaded slot ${slot + 1}.`, 'sys'); }
      });
    } else if (btn.dataset.del !== undefined) {
      const slot = Number(btn.dataset.del);
      confirmAction('Delete this save?', 'This permanently erases the character in that slot.', () => {
        Save.deleteSlot(slot);
        renderSlots();
        openModal('modalSaves');
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
  if (!host) return;
  const s = G.state;
  host.innerHTML = `
    ${toggleRow('autoRun', 'Auto-run maps', 'Automatically enter the best available map when idle.')}
    ${toggleRow('autoSalvageNormal', 'Auto-salvage Normal drops', 'Normal items are converted to currency on pickup.')}
    ${toggleRow('autoSalvageMagic', 'Auto-salvage Magic drops', 'Magic items are converted to currency on pickup.')}
    <div class="setting-row">
      <div><div class="sl">Combat speed</div><div class="sh">Simulation multiplier. Higher is faster but coarser.</div></div>
      <select class="text-input" style="width:auto" id="setSpeed">
        ${[0.5, 1, 2, 3, 5].map((v) => `<option value="${v}" ${s.settings.combatSpeed === v ? 'selected' : ''}>${v}×</option>`).join('')}
      </select>
    </div>
    <div class="setting-row">
      <div><div class="sl">Combat log length</div><div class="sh">Lines kept in memory.</div></div>
      <select class="text-input" style="width:auto" id="setLog">
        ${[100, 200, 500, 1000].map((v) => `<option value="${v}" ${s.settings.logLimit === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="section-head"><span>Danger Zone</span></div>
    <div class="row">
      <button class="btn" id="btnNewChar">New Character</button>
      <button class="btn danger" id="btnWipe">Delete This Save</button>
    </div>`;

  host.onchange = (e) => {
    const t = e.target;
    if (t.dataset.set) {
      s.settings[t.dataset.set] = t.checked;
    } else if (t.id === 'setSpeed') {
      s.settings.combatSpeed = Number(t.value);
    } else if (t.id === 'setLog') {
      s.settings.logLimit = Number(t.value);
    }
  };
  qs('#btnNewChar').onclick = () => { closeModals(); openNewCharacter(); };
  qs('#btnWipe').onclick = () => confirmAction(
    'Delete this save?', `Slot ${G.slot + 1} will be erased and a new character created.`,
    () => {
      Save.deleteSlot(G.slot);
      G.state = newCharacter('Exile');
      addItem(grantStarterMap());
      Save.saveToSlot(G.slot, true);
      emit('loaded');
      log('A new exile washes ashore.', 'sys');
    },
  );
}
