// hall — Guild Hall upgrades and the unique collection.

import { MATERIAL_BY_ID } from '../data/materials.js';
import { UNIQUES } from '../data/uniques.js';
import { UPGRADES, guildEffects, upgradeCost } from '../data/upgrades.js';
import { buyUpgrade, hasMaterials } from '../inventory.js';
import { EQUIP_SLOTS } from '../data/bases.js';
import { RAIDS } from '../data/dungeons.js';
import { PRIVILEGES } from '../data/charter.js';
import { hasPrivilege, upcoming } from '../charter.js';
import { score } from '../achievements.js';
import { G, partySlots } from '../state.js';
import { escapeHtml, fmt, fmtInt, fmtTime, qs } from '../util.js';
import { setStatus } from './shell.js';

// ===========================================================================
// Guild Hall
// ===========================================================================

/**
 * The banner above the sub-tabs: the guild at a glance, on every hall page.
 *
 * It used to carry the whole hall's summary and sat above a wall of fourteen
 * upgrade cards, fourteen charter rungs and the collection, all on one
 * scrolling page. Splitting those into sub-tabs left this as the only thing
 * shared between them, so it stays outside the tab strip.
 */
function renderHallBanner() {
  const s = G.state;
  const host = qs('#hallSummary');
  if (!host || !s) return;
  const gu = guildEffects(s.upgrades);
  const ranks = Object.values(s.upgrades ?? {}).reduce((a, b) => a + b, 0);

  host.innerHTML = `
    <div class="map-banner">
      <div class="map-banner-top">
        <span class="map-title">${escapeHtml(s.name)}</span>
        <span class="map-meta">Guild Level ${s.guild.level} ·
          <b class="c-gold">${fmt(s.guild.gold)}</b> gold</span>
      </div>
      <div class="hideout-stats">
        <span>Gold <b>+${gu.gold}%</b></span>
        <span>Rarity <b>+${gu.rarity}%</b></span>
        <span>Quantity <b>+${gu.quantity}%</b></span>
        <span>Materials <b>+${gu.materials}%</b></span>
        <span>Experience <b>+${gu.xp}%</b></span>
        <span>Charters <b>${1 + gu.partySlots}</b></span>
        <span>Upgrade ranks <b>${ranks}</b></span>
      </div>
    </div>`;
}

/** One figure in the ledger. */
function stat(label, value, hint = '') {
  return `<div class="ledger-cell" ${hint ? `title="${escapeHtml(hint)}"` : ''}>
    <span class="lc-value">${value}</span>
    <span class="lc-label">${escapeHtml(label)}</span>
  </div>`;
}

function ledgerGroup(title, cells) {
  return `<div class="ledger-group">
    <div class="ledger-head">${escapeHtml(title)}</div>
    <div class="ledger-grid">${cells.join('')}</div>
  </div>`;
}

/**
 * The overview: what this guild has actually done.
 *
 * The hall opened on a banner and then a wall of purchases, which answered
 * "what can I buy" and nothing else. Everything here is already in the save —
 * the achievement system needs it — and none of it had anywhere to be read.
 */
export function renderHallOverview() {
  const s = G.state;
  const host = qs('#hallOverview');
  if (!host || !s) return;

  const st = s.stats ?? {};
  const runs = st.runs ?? 0;
  const failed = st.runsFailed ?? 0;
  const attempts = runs + failed;
  const clearRate = attempts ? Math.round((runs / attempts) * 100) : 0;
  const deepest = s.progress?.highestTier ?? 0;
  const raidKills = Object.values(s.progress?.raidKills ?? {}).reduce((a, b) => a + b, 0);
  const raidsBeaten = Object.keys(s.progress?.raidKills ?? {}).length;
  const collected = Object.keys(s.collection ?? {}).length;
  const perHour = s.playtime > 60 ? (st.goldEarned ?? 0) / (s.playtime / 3600) : 0;
  const held = PRIVILEGES.filter((x) => hasPrivilege(x.id)).length;
  const next = upcoming();

  const roster = s.heroes ?? [];
  const levels = roster.map((h) => h.level ?? 1);
  const avgLevel = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
  const worn = roster.flatMap((h) => EQUIP_SLOTS.map((slot) => h.equipment?.[slot]))
    .filter(Boolean);
  const avgIlvl = worn.length
    ? Math.round(worn.reduce((a, i) => a + (i.ilvl ?? 0), 0) / worn.length) : 0;
  const emptySlots = roster.length * EQUIP_SLOTS.length - worn.length;

  host.innerHTML = `
    ${ledgerGroup('In the field', [
    stat('Expeditions cleared', fmtInt(runs)),
    stat('Wipes', fmtInt(failed), 'Runs where the whole party went down and the haul was lost.'),
    stat('Clear rate', `${clearRate}%`, 'Of every expedition ever dispatched.'),
    stat('Deepest tier', deepest || '—', 'The hardest expedition this guild has finished.'),
    stat('Enemies killed', fmtInt(st.kills ?? 0)),
    stat('Guardians slain', fmtInt(st.bossKills ?? 0), 'The boss at the end of an expedition.'),
  ])}

    ${ledgerGroup('The roster', [
    stat('Heroes', fmtInt(roster.length)),
    stat('Average level', avgLevel || '—'),
    stat('Average item level', avgIlvl || '—', 'Across every piece of equipment anyone is wearing.'),
    stat('Empty slots', fmtInt(Math.max(0, emptySlots)),
      'Equipment slots nobody has filled. Gear Up on the Parties tab fills them.'),
    stat('Heroes lost in the field', fmtInt(st.heroDeaths ?? 0),
      'Downed during an expedition. Nobody is ever lost permanently.'),
    stat('Hired', fmtInt(st.recruited ?? 0)),
  ])}

    ${ledgerGroup('The vault', [
    stat('Items found', fmtInt(st.gearFound ?? 0)),
    stat('Uniques found', fmtInt(st.uniquesFound ?? 0)),
    stat('Collection', `${collected}/${UNIQUES.length}`, 'Distinct uniques recorded.'),
    stat('Salvaged', fmtInt(st.salvaged ?? 0)),
    stat('Items worked', fmtInt(st.crafted ?? 0), 'Bench recipes applied.'),
    stat('Flasks brewed', fmtInt(st.flasksBrewed ?? 0)),
  ])}

    ${ledgerGroup('Gold and deeper things', [
    stat('Gold earned', fmtInt(st.goldEarned ?? 0)),
    stat('Gold an hour', perHour ? fmtInt(Math.round(perHour)) : '—',
      'Averaged over this guild\'s whole playtime, including the time you were away.'),
    stat('Most gold held', fmtInt(st.peakGold ?? 0)),
    stat('Raid bosses killed', fmtInt(raidKills), `${raidsBeaten} of ${RAIDS.length} ever beaten.`),
    stat('Contracts run', fmtInt(st.contractsRun ?? 0)),
    stat('Blank bases found', fmtInt(st.blanksFound ?? 0),
      'Unworked item level 120 bases, from the deep raids.'),
  ])}

    ${ledgerGroup('The guild itself', [
    stat('Guild level', s.guild.level),
    stat('Charter privileges', `${held}/${PRIVILEGES.length}`),
    stat('Next privilege', next ? `Lv ${next.def.level}` : 'complete',
      next ? next.def.name : 'Every privilege has been granted.'),
    stat('Achievement score', fmtInt(score())),
    stat('Playtime', fmtTime(s.playtime ?? 0)),
    stat('Reward bonus', `+${Math.round(s.progress?.bonusMult ?? 0)}%`,
      'From first kills on raid bosses. Applies to everything an expedition pays.'),
  ])}`;
}

export function renderHall() {
  const s = G.state;
  const host = qs('#upgradeList');
  if (!host || !s) return;
  renderHallBanner();
  renderHallOverview();

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
