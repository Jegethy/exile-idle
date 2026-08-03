// vault — The shared gear vault: browsing, equipping, locking and salvaging.

import { canAfford, craft } from '../crafting.js';
import { BASE_BY_ID } from '../data/bases.js';
import { CLASS_BY_ID } from '../data/heroclasses.js';
import {
  canDualWield, equipOnHero, heroById, isDeployed, unequipFromHero,
} from '../heroes.js';
import {
  VAULT_FILTERS, VAULT_SORTS, baseTypesIn, countSalvageable, findItem, salvageAll,
  salvageItem, sortVault, toggleLock, vaultView, wearerOf,
} from '../inventory.js';
import { itemBaseStats, itemDescriptor, itemMods } from '../items.js';
import { G, on, vaultCapacity } from '../state.js';
import { bestUpgrade, upgradeFor } from '../stats.js';
import { el, escapeHtml, fmt, qs } from '../util.js';
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
  const shown = vaultView({
    filter: ui.vaultFilter, sort: ui.vaultSort, baseType: ui.vaultBaseType,
  });

  renderVaultControls(shown.length);

  if (!shown.length) {
    host.innerHTML = '<div class="empty-note" style="grid-column:1/-1">'
      + 'Nothing here matches that filter.</div>';
    return;
  }

  host.innerHTML = shown.map((item) => {
    const legal = ui.craftRecipe ? canAfford(ui.craftRecipe, item) : null;
    const d = itemDescriptor(item);
    const bs = itemBaseStats(item);
    const num = bs.dps ? `${fmt(bs.dps)} dps`
      : [bs.armour && `${fmt(bs.armour)} ar`, bs.evasion && `${fmt(bs.evasion)} ev`, bs.es && `${fmt(bs.es)} es`]
        .filter(Boolean).join(' · ');
    // Who, if anyone, this would improve — the single most useful thing a
    // vault full of similar-looking items can tell you.
    const up = hero
      ? { hero, delta: upgradeFor(hero, item, s.upgrades).delta }
      : bestUpgrade(s.heroes.filter((h) => !isDeployed(h)), item, s.upgrades);
    const isUp = up && up.delta > 0.01;
    return `<div class="inv-cell ${R(item.rarity)} ${legal ? (legal.ok ? 'craftable' : 'not-craftable') : ''}
                 ${isUp ? 'upgrade' : ''}" data-uid="${item.uid}">
      <div class="inv-top">
        <span class="inv-name">${escapeHtml(item.name)}</span>
        ${isUp ? `<span class="inv-up" title="An upgrade for ${escapeHtml(up.hero.name)}: `
      + `${(up.delta * 100).toFixed(0)}% better for their role">▲${(up.delta * 100).toFixed(0)}%</span>`
      : `<span class="inv-ilvl" title="Item level">i${item.ilvl}</span>`}
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
    if (hero) { equipFromVault(hero, uid); hideTooltip(); return; }
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

/**
 * Equips a vault item, asking first when it would cost the hero their
 * two-handed weapon. Silently unequipping something the player spent gold on
 * is the kind of thing that is only noticed later.
 */
function equipFromVault(hero, itemUid) {
  const item = findItem(itemUid);
  if (!item) return;
  const base = BASE_BY_ID[item.baseId];
  const held = hero.equipment.weapon ? BASE_BY_ID[hero.equipment.weapon.baseId] : null;
  const wouldDisplace = held?.hands === 2
    && (base?.slot === 'offhand' || (base?.slot === 'weapon' && base.hands !== 2 && canDualWield(hero)));

  if (!wouldDisplace) { setStatus(equipMsg(hero, itemUid)); return; }

  confirmAction(
    'Put down the two-handed weapon?',
    `${hero.name} is holding ${hero.equipment.weapon.name} in both hands. Equipping `
    + `${item.name} means unequipping it — it goes back to the vault.`,
    () => setStatus(equipMsg(hero, itemUid)),
  );
}

function equipMsg(hero, itemUid) {
  const ok = equipOnHero(hero.uid, itemUid);
  return ok ? '' : `${hero.name} cannot equip that.`;
}

/**
 * Filter, base-type and sort controls. A vault of eighty similar items is
 * unusable without them, and the base-type row only lists what is actually
 * present so it never offers an empty choice.
 */
function renderVaultControls(count) {
  let host = qs('#vaultControls');
  if (!host) {
    host = el('div', 'vault-controls');
    host.id = 'vaultControls';
    qs('#vaultGrid').before(host);
  }
  const types = baseTypesIn(ui.vaultFilter);
  host.innerHTML = `
    <div class="vc-row">${VAULT_FILTERS.map((f) => `<button class="btn tiny
      ${ui.vaultFilter === f.id ? 'active' : ''}" data-vfilter="${f.id}">${f.name}</button>`).join('')}
      <span class="vc-count">${count} shown</span>
    </div>
    ${types.length > 1 ? `<div class="vc-row sub">
      <button class="btn tiny ${ui.vaultBaseType === 'all' ? 'active' : ''}" data-vtype="all">Any type</button>
      ${types.map((t) => `<button class="btn tiny ${ui.vaultBaseType === t ? 'active' : ''}"
        data-vtype="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
    </div>` : ''}
    <div class="vc-row sub">
      <span class="vc-label">Sort</span>
      ${VAULT_SORTS.map((o) => `<button class="btn tiny ${ui.vaultSort === o.id ? 'active' : ''}"
        data-vsort="${o.id}">${o.name}</button>`).join('')}
    </div>`;

  host.onclick = (e) => {
    const f = e.target.closest('[data-vfilter]');
    if (f) { ui.vaultFilter = f.dataset.vfilter; ui.vaultBaseType = 'all'; renderVault(); return; }
    const t = e.target.closest('[data-vtype]');
    if (t) { ui.vaultBaseType = t.dataset.vtype; renderVault(); return; }
    const o = e.target.closest('[data-vsort]');
    if (o) { ui.vaultSort = o.dataset.vsort; renderVault(); }
  };
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
