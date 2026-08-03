// hall — Guild Hall upgrades and the unique collection.

import { MATERIAL_BY_ID } from '../data/materials.js';
import { UNIQUES } from '../data/uniques.js';
import { UPGRADES, guildEffects, upgradeCost } from '../data/upgrades.js';
import { buyUpgrade, hasMaterials } from '../inventory.js';
import { G, partySlots } from '../state.js';
import { escapeHtml, fmt, fmtInt, qs } from '../util.js';
import { setStatus } from './shell.js';

// ===========================================================================
// Guild Hall
// ===========================================================================

export function renderHall() {
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
        <span>Materials <b>+${gu.materials}%</b></span>
        <span>Experience <b>+${gu.xp}%</b></span>
        <span>Charters <b>${1 + gu.partySlots}</b></span>
      </div>
    </div>`;

  host.innerHTML = UPGRADES.map((u) => {
    const rank = s.upgrades[u.id] ?? 0;
    const maxed = rank >= u.max;
    const cost = upgradeCost(u.id, rank);
    const afford = !cost ? false
      : cost.kind === 'gold' ? s.guild.gold >= cost.amount
        : hasMaterials([{ id: cost.mat, qty: cost.amount }]);
    const now = u.effect(rank);
    const next = maxed ? null : u.effect(rank + 1);
    const key = Object.keys(u.effect(1))[0];
    const label = cost && (cost.kind === 'gold'
      ? `${fmtInt(cost.amount)}g` : `${cost.amount}× ${MATERIAL_BY_ID[cost.mat]?.name ?? ''}`);

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

export function renderCollection() {
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
