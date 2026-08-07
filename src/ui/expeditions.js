// expeditions — Runs in the field, and the dispatch board that starts them.

import {
  DUNGEON_BY_ID, DUNGEON_CATEGORIES, dungeonsIn, expectedDuration, staminaCost,
  tierToLevel, wavesFor,
} from '../data/dungeons.js';
import { RESOURCES } from '../data/resources.js';
import { guildEffects } from '../data/upgrades.js';
import { dispatch, recall, runProgress } from '../expedition.js';
import { canDispatch, partyById } from '../heroes.js';
import { G, on, emit, partySlots } from '../state.js';
import { clamp, escapeHtml, fmt, fmtTime, qs } from '../util.js';
import { setStatus, gotoTab } from './shell.js';
import { ui } from './state.js';
import { reports, dismissReport, dismissReportsFor, peakOf } from '../reports.js';
import { readiness, readinessLine } from '../readiness.js';

// ===========================================================================
// Expeditions
// ===========================================================================

export function renderRuns() {
  const s = G.state;
  const host = qs('#activeRuns');
  if (!host || !s) return;

  const summaries = reports.filter((r) => !r.silent).map(reportCard).join('');

  if (!s.expeditions.length && !reports.some((r) => !r.silent)) {
    host.innerHTML = `<div class="map-banner"><div class="idle-state">
      <h3>No expeditions in the field</h3>
      <p>Pick a dungeon below and dispatch a party.</p></div></div>`;
    return;
  }

  host.innerHTML = summaries + s.expeditions.map((run) => {
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

  for (const btn of host.querySelectorAll('[data-dismiss]')) {
    btn.onclick = () => { dismissReport(btn.dataset.dismiss); renderRuns(); };
  }

  host.onclick = (e) => {
    const b = e.target.closest('[data-recall]');
    if (b) recall(b.dataset.recall);
  };
  updateRunBars();
}

export function updateRunBars() {
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
        // The resource bar matters as much as the life bar: a healer at zero
        // mana is the reason a party is dying, and without showing it that
        // looks like the healer simply stopped working.
        const res = c.resource;
        const rpct = res ? clamp((res.cur / res.max) * 100, 0, 100) : 0;
        const kind = res ? RESOURCES[res.kind] : null;
        return `<div class="cbt ${c.down ? 'down' : ''}">
          <div class="cbt-name">${escapeHtml(c.name)}<small>${c.role}</small></div>
          <div class="bar life"><i style="width:${pct}%"></i>
            <span>${c.down ? 'DOWN' : `${fmt(Math.max(0, c.life))} / ${fmt(c.maxLife)}`}</span></div>
          ${res ? `<div class="bar res ${res.kind}" title="${kind.name}">
            <i style="width:${rpct}%"></i><span>${kind.short} ${Math.round(res.cur)}</span></div>` : ''}
        </div>`;
      }).join('');
    }

    const ec = qs(`[data-enemy-col="${run.id}"]`);
    if (ec) {
      ec.innerHTML = run.enemies.length
        ? run.enemies.map((en) => {
          const pct = clamp((en.life / en.maxLife) * 100, 0, 100);
          return `<div class="cbt enemy">
            <div class="cbt-name ${en.rarity === 'champion' ? 'champ' : ''}">${escapeHtml(en.name)}
              <span class="atk-tag ${en.attack ?? 'melee'}">${en.attack ?? 'melee'}</span></div>
            <div class="bar mon"><i style="width:${pct}%"></i>
              <span>${fmt(Math.max(0, en.life))} / ${fmt(en.maxLife)}</span></div>
          </div>`;
        }).join('')
        : '<div class="hint" style="padding:6px">Advancing…</div>';
    }

    const st = qs(`[data-runstats="${run.id}"]`);
    if (st) {
      st.textContent = `${fmtTime(run.elapsed)} · carrying ${fmt(run.rewards.gold)}g · `
        + `${run.rewards.gear} items · ${run.rewards.materials} materials`;
    }
  }
}

/**
 * What this dungeon fights with. Tank choice only matters if the player can
 * see what they are walking into, so the blend is stated rather than learned
 * by dying.
 */
function mixBar(mix) {
  const m = mix?.melee ?? 50;
  const s = mix?.spell ?? 50;
  const lean = m >= 60 ? 'brawlers' : m <= 35 ? 'casters' : 'mixed';
  return `<div class="dg-mix" title="${m}% melee, ${s}% spellcasters — a Warrior answers `
    + `brawlers, a Paladin answers casters, a Guardian handles either">
    <span class="mix-bar"><i style="width:${m}%"></i></span>
    <span class="mix-label ${lean}">${m}% melee · ${s}% spell</span>
  </div>`;
}

/**
 * One line per idle party: how it stands against the tier on the selector.
 *
 * The panel has always printed the level of what lives down there and never
 * once compared it to anything. That was survivable while the penalty for
 * being under-levelled was a gentle slope; it is not survivable now that ten
 * levels under is an outright wall. A wall you cannot see coming is the same
 * complaint the cliff was built to answer.
 */
function readinessRow(idleParties, tier) {
  if (!idleParties.length) return '';
  return `<div class="ready-row">${idleParties.map((p) => {
    const r = readiness(p, tier);
    if (!r.size) return '';
    const gearBehind = r.ilvl > 0 && r.contentIlvl - r.ilvl >= 12;
    return `<span class="ready ready-${r.band.id}" title="${escapeHtml(r.band.hint)}">
      <b>${escapeHtml(p.name)}</b>
      <span class="ready-lv">Lv ${r.level} vs ${r.content}</span>
      <span class="ready-band">${escapeHtml(r.band.name)}</span>
      ${gearBehind ? `<span class="ready-gear" title="Average item level of what they are wearing,
        against what this tier drops.">gear ${r.ilvl}/${r.contentIlvl}</span>` : ''}
      ${r.empties > 0 ? `<span class="ready-gear" title="Equipment slots nobody has filled.
        Gear Up on the Parties tab fills them.">${r.empties} empty</span>` : ''}
    </span>`;
  }).join('')}</div>`;
}

export function renderDispatch() {
  const s = G.state;
  const host = qs('#dispatchPanel');
  if (!host || !s) return;

  const maxTier = Math.max(1, s.progress.highestTier + 1);
  ui.dispatchTier = clamp(ui.dispatchTier, 1, maxTier);
  const tier = ui.dispatchTier;
  const free = partySlots() - s.expeditions.length;
  const idleParties = s.parties.filter((p) => !s.expeditions.some((e) => e.partyId === p.id));
  const shown = dungeonsIn(ui.dungeonFilter);

  host.innerHTML = `
    <div class="dispatch-bar">
      <span class="dispatch-label">Tier</span>
      <button class="btn tiny" id="tierDown" ${tier <= 1 ? 'disabled' : ''}>−</button>
      <b class="tier-value">${tier}</b>
      <button class="btn tiny" id="tierUp" ${tier >= maxTier ? 'disabled' : ''}>+</button>
      <span class="hint">enemies level ${tierToLevel(tier)} · ${staminaCost(tier)} stamina each</span>
      <span class="hint">${free} charter${free === 1 ? '' : 's'} free</span>
      ${(s.contracts?.length ?? 0)
    ? `<button class="btn tiny" id="btnToContracts">${s.contracts.length} sealed
        contract${s.contracts.length === 1 ? '' : 's'}</button>`
    : ''}
      ${autoDispatchControl()}
    </div>
    ${readinessRow(idleParties, tier)}
    <div class="dungeon-filters">${DUNGEON_CATEGORIES.map((c) => {
    const n = dungeonsIn(c.id).length;
    return `<button class="btn tiny ${ui.dungeonFilter === c.id ? 'active' : ''}"
        data-dfilter="${c.id}">${escapeHtml(c.name)} <span class="df-n">${n}</span></button>`;
  }).join('')}</div>
    <div class="dungeon-grid">${shown.map((d) => {
    const cleared = s.progress.cleared[`${d.id}:${tier}`] ?? 0;
    return `<div class="dungeon ${cleared ? 'cleared' : ''}">
        <div class="dg-top">
          <span class="dg-name">${escapeHtml(d.name)}</span>
          <span class="dg-focus">${escapeHtml(d.focus)}</span>
        </div>
        <div class="dg-blurb">${escapeHtml(d.blurb)}</div>
        <div class="dg-counter">${escapeHtml(d.counter)}</div>
        ${mixBar(d.attackMix)}
        <div class="dg-rewards">
          ${rewardBar('Gold', d.rewards.gold)}${rewardBar('Gear', d.rewards.gear)}
          ${rewardBar('XP', d.rewards.xp)}${rewardBar('Mats', d.rewards.mats)}
        </div>
        <div class="dg-foot"><span class="hint">${wavesFor(d, tier)} waves · ~${Math.round(expectedDuration(d, tier))}s${
      cleared ? ` · cleared ${cleared}×` : ''}</span></div>
        <div class="dg-parties">${idleParties.length
      ? idleParties.map((p) => {
        const check = canDispatch(p, staminaCost(tier));
        const blocked = free <= 0 || !check.ok;
        const r = readiness(p, tier);
        const wall = !blocked && r.band.id === 'wall';
        const why = free <= 0 ? 'No charters free'
          : !check.ok ? check.msg
            : `${readinessLine(r)}. ${r.band.hint}`;
        return `<button class="btn tiny ${blocked ? '' : wall ? 'warn-send' : 'primary'}"
              data-send="${p.id}" data-dg="${d.id}"
              ${blocked ? 'disabled' : ''} title="${escapeHtml(why)}"
              >Send ${escapeHtml(p.name)}${wall ? ' \u26a0' : ''}</button>`;
      }).join('')
      : '<span class="hint">All parties are busy.</span>'}</div>
      </div>`;
  }).join('')}${shown.length ? '' : '<div class="empty-note">Nothing in this category yet.</div>'}</div>`;

  const toContracts = qs('#btnToContracts');
  if (toContracts) toContracts.onclick = () => gotoTab('contracts');

  host.querySelector('.dungeon-filters').onclick = (e) => {
    const b = e.target.closest('[data-dfilter]');
    if (!b) return;
    ui.dungeonFilter = b.dataset.dfilter;
    renderDispatch();
  };
  qs('#tierDown').onclick = () => { ui.dispatchTier = Math.max(1, tier - 1); renderDispatch(); };
  qs('#tierUp').onclick = () => { ui.dispatchTier = Math.min(maxTier, tier + 1); renderDispatch(); };
  host.querySelector('.dungeon-grid').onclick = (e) => {
    const b = e.target.closest('[data-send]');
    if (!b || b.disabled) return;
    const res = dispatch(b.dataset.send, b.dataset.dg, ui.dispatchTier);
    setStatus(res.msg);
    if (res.ok) {
      dismissReportsFor(b.dataset.send);
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
  // Auto-redeploy belongs to each party, not to the guild: the switch lives on
  // the party card. This is a status line so the Expeditions tab still says
  // whether anything is running itself, and where to change it.
  const auto = s.parties.filter((p) => p.autoRedeploy).length;
  return `<div class="auto-box ${auto ? 'on' : ''}" id="autoDispatchBox"
               title="Each party decides for itself, on the Parties tab.">
    <span class="al">Auto-redeploy</span>
    <span class="auto-count">${auto
    ? `${auto} part${auto === 1 ? 'y' : 'ies'}`
    : 'set per party'}</span>
  </div>`;
}

function rewardBar(label, mult) {
  const pct = clamp((mult / 2.5) * 100, 6, 100);
  return `<div class="rw"><label>${label}</label>
    <div class="rw-track"><i class="${mult >= 1.8 ? 'strong' : ''}" style="width:${pct}%"></i></div></div>`;
}


// ===========================================================================
// Contracts
// ===========================================================================

/**
 * The shelf of sealed contracts, shown only once one has been found.
 *
 * Hidden while empty on purpose: a permanent empty box on the busiest panel in
 * the game teaches nothing except that something is missing.
 */
// ===========================================================================
// After-action summary
// ===========================================================================

/**
 * The three columns a damage meter shows, and what each is for.
 *
 * Damage taken is included deliberately. On its own it looks like a measure of
 * failure, but for a Tank it is the job: a Tank at the top of this column and
 * a Wizard near the bottom is a party working correctly, and the reverse is a
 * problem you would otherwise never see.
 */
const METER_COLUMNS = [
  { key: 'damageDealt', label: 'Damage', cls: 'm-dmg' },
  { key: 'damageTaken', label: 'Taken', cls: 'm-taken' },
  { key: 'healingDone', label: 'Healing', cls: 'm-heal' },
];

function meterRow(report, hero) {
  return `<tr class="${hero.down ? 'fallen' : ''}">
    <td class="mr-name">
      <span class="role role-${(hero.role ?? 'dps').toLowerCase()}">${escapeHtml(hero.role ?? '')}</span>
      ${escapeHtml(hero.name)}${hero.down ? ' <span class="mr-down">fell</span>' : ''}
    </td>
    ${METER_COLUMNS.map((col) => {
    const value = hero[col.key] ?? 0;
    const pct = (value / peakOf(report, col.key)) * 100;
    return `<td class="mr-cell">
        <span class="mr-bar ${col.cls}" style="width:${pct.toFixed(1)}%"></span>
        <span class="mr-val">${value ? fmt(value) : '—'}</span>
      </td>`;
  }).join('')}
  </tr>`;
}

function reportCard(report) {
  const r = report.rewards ?? {};
  const won = report.cleared;
  return `<div class="map-banner run-report ${won ? 'won' : 'lost'}" data-report="${report.id}">
    <div class="map-banner-top">
      <span class="map-title">${escapeHtml(report.partyName ?? 'Party')} —
        ${escapeHtml(report.name)}</span>
      <span class="map-meta ${won ? 'good' : 'bad'}">${won ? 'Cleared' : 'Wiped'}
        · ${report.raid ? 'Raid' : `Tier ${report.tier}`}
        · ${Math.round(report.seconds)}s</span>
    </div>

    <div class="rp-loot">
      ${won
    ? `<span><b class="gold">${fmt(r.gold ?? 0)}</b> gold</span>
         <span><b>${r.gear ?? 0}</b> item${(r.gear ?? 0) === 1 ? '' : 's'}</span>
         <span><b>${r.materials ?? 0}</b> materials</span>
         <span><b>${fmt(r.xp ?? 0)}</b> xp</span>
         ${r.uniques ? `<span class="r-unique"><b>${r.uniques}</b> unique</span>` : ''}
         ${r.seals ? `<span class="c-seal"><b>${r.seals}</b> seal</span>` : ''}
         ${r.echoes ? `<span class="c-echo"><b>${r.echoes}</b> echo</span>` : ''}`
    : `<span class="bad">Everything they were carrying is lost —
         <b>${fmt(r.gold ?? 0)}</b> gold, <b>${r.gear ?? 0}</b> items,
         <b>${r.materials ?? 0}</b> materials.</span>`}
    </div>

    <table class="meter">
      <thead><tr><th></th>${METER_COLUMNS.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${report.heroes
    .slice()
    .sort((a, b) => b.damageDealt - a.damageDealt)
    .map((h) => meterRow(report, h)).join('')}</tbody>
    </table>

    <div class="row">
      ${report.remaining == null
    ? `<button class="btn tiny primary" data-dismiss="${report.id}">Continue</button>`
    : `<button class="btn tiny" data-dismiss="${report.id}">Continue now</button>
         <span class="hint" data-countdown="${report.id}">Next run in
           ${Math.ceil(report.remaining)}s…</span>`}
    </div>
  </div>`;
}

/**
 * Re-checks the Send buttons against live stamina.
 *
 * They used to be decided once, when the panel was drawn, and nothing redrew
 * it as stamina came back. After a wipe — which drops the whole party to ten
 * stamina — every button read "too tired" and stayed that way indefinitely,
 * long after the party had recovered. Nudging the tier redrew the panel and
 * the party could go, which made it look as though changing tier bypassed the
 * check rather than merely refreshing it.
 *
 * Attributes only: rebuilding the panel ten times a second would fight the
 * player's scroll position and their pointer.
 */
export function updateDispatchButtons() {
  const s = G.state;
  if (!s) return;
  const cost = staminaCost(ui.dispatchTier);
  const free = partySlots() - s.expeditions.length;
  for (const btn of document.querySelectorAll('#dispatchPanel [data-send]')) {
    const party = partyById(btn.dataset.send);
    if (!party) continue;
    const check = canDispatch(party, cost);
    const blocked = free <= 0 || !check.ok;
    if (btn.disabled !== blocked) {
      btn.disabled = blocked;
      btn.classList.toggle('primary', !blocked);
    }
    const why = free <= 0 ? 'No charters free' : check.ok ? `Send ${party.name}` : check.msg;
    if (btn.title !== why) btn.title = why;
  }
}

/** Re-times the countdown without rebuilding the card. */
export function updateReportTimers() {
  for (const report of reports) {
    if (report.remaining == null) continue;
    const el = qs(`[data-countdown="${report.id}"]`);
    if (el) el.textContent = `Next run in ${Math.max(0, Math.ceil(report.remaining))}s…`;
  }
}
