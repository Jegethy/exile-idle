// vault — The shared gear vault: browsing, equipping, locking and salvaging.

import { canAfford, craft } from '../crafting.js';
import { CLASS_BY_ID } from '../data/heroclasses.js';
import { equipOnHero, heroById, isDeployed, unequipFromHero } from '../heroes.js';
import {
  countSalvageable, findItem, salvageAll, salvageItem, sortVault, toggleLock, wearerOf,
} from '../inventory.js';
import { itemBaseStats, itemDescriptor, itemMods } from '../items.js';
import { G, on, vaultCapacity } from '../state.js';
import { escapeHtml, fmt, qs } from '../util.js';
import { closeModals, confirmAction, openModal } from './modals.js';
import { setStatus } from './shell.js';
import { R, ui } from './state.js';
import { hideTooltip, moveTooltip, showItemTooltip } from './tooltip.js';
import { applyCraft } from './workshop.js';

// ===========================================================================
// Vault
// ===========================================================================

const SALVAGE_FILTERS = {
  normal: { label: 'Normal', test: (i) => i.rarity === 'normal' },
  magic: { label: 'Normal and Magic', test: (i) => i.rarity === 'normal' || i.rarity === 'magic' },
  rare: { label: 'Normal, Magic and Rare', test: (i) => ['normal', 'magic', 'rare'].includes(i.rarity) },
};

export function wireVaultActions() {
  qs('#btnSortVault').onclick = () => sortVault();
  for (const [key, sel] of [['normal', '#btnSalvageNormal'], ['magic', '#btnSalvageMagic'], ['rare', '#btnSalvageRare']]) {
    qs(sel).onclick = () => {
      const f = SALVAGE_FILTERS[key];
      const n = countSalvageable(f.test);
      if (!n) { setStatus(`No unlocked ${f.label} items in the vault.`); return; }
      confirmAction(`Salvage ${n} item${n === 1 ? '' : 's'}?`,
        `All unlocked ${f.label} items in the vault are broken down for materials and gold. `
        + 'Locked and Unique items are skipped, and worn gear is never touched.',
        () => salvageAll(f.test));
    };
  }
}

export function renderEquipTarget() {
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

export function renderVault() {
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
    const legal = ui.craftRecipe ? canAfford(ui.craftRecipe, item) : null;
    const d = itemDescriptor(item);
    const bs = itemBaseStats(item);
    const num = bs.dps ? `${fmt(bs.dps)} dps`
      : [bs.armour && `${fmt(bs.armour)} ar`, bs.evasion && `${fmt(bs.evasion)} ev`, bs.es && `${fmt(bs.es)} es`]
        .filter(Boolean).join(' · ');
    return `<div class="inv-cell ${R(item.rarity)} ${legal ? (legal.ok ? 'craftable' : 'not-craftable') : ''}"
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
    if (ui.craftRecipe) { applyCraft(uid); return; }
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
