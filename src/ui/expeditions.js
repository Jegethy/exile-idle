// expeditions — Runs in the field, and the dispatch board that starts them.

import {
  DUNGEON_BY_ID, DUNGEON_CATEGORIES, dungeonsIn, expectedDuration, staminaCost,
  tierToLevel, wavesFor,
} from '../data/dungeons.js';
import { RESOURCES } from '../data/resources.js';
import { guildEffects } from '../data/upgrades.js';
import { dispatch, recall, runProgress } from '../expedition.js';
import { canDispatch, partyById, partyMembers } from '../heroes.js';
import { G, on, emit, partySlots } from '../state.js';
import { clamp, escapeHtml, fmt, fmtTime, qs } from '../util.js';
import { setStatus } from './shell.js';
import {
  CONTRACT_CAP, rewardMultFor, findBaseFor, rarityOf, downsidesOf, boonsOf,
  consumeContract,
} from '../contracts.js';
import { barredMembers } from '../data/modifiers.js';
import { CLASS_BY_ID } from '../data/heroclasses.js';
import { ui } from './state.js';

// ===========================================================================
// Expeditions
// ===========================================================================

export function renderRuns() {
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
      <span class="hint">enemy level ~${tierToLevel(tier)} · ${staminaCost(tier)} stamina each</span>
      <span class="hint">${free} charter${free === 1 ? '' : 's'} free</span>
      ${autoDispatchControl()}
    </div>
    ${contractShelf(idleParties, free)}
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
        const why = free <= 0 ? 'No charters free' : check.ok ? `Send ${p.name}` : check.msg;
        return `<button class="btn tiny ${blocked ? '' : 'primary'}" data-send="${p.id}" data-dg="${d.id}"
              ${blocked ? 'disabled' : ''} title="${escapeHtml(why)}">Send ${escapeHtml(p.name)}</button>`;
      }).join('')
      : '<span class="hint">All parties are busy.</span>'}</div>
      </div>`;
  }).join('')}${shown.length ? '' : '<div class="empty-note">Nothing in this category yet.</div>'}</div>`;

  const shelf = host.querySelector('#contractShelf');
  if (shelf) {
    shelf.onclick = (e) => {
      const drop = e.target.closest('[data-discard]');
      if (drop) {
        // No confirmation. A bad contract is meant to be waved away without
        // ceremony, and another is always coming.
        consumeContract(drop.dataset.discard);
        renderDispatch();
        return;
      }
      const b = e.target.closest('[data-contract]');
      if (!b || b.disabled) return;
      const res = dispatch(b.dataset.party, null, null, b.dataset.contract);
      setStatus(res.msg);
      // A contract fixes its own dungeon and tier, so there is no last-run to
      // remember: auto-redeploy would have nothing to repeat.
      renderDispatch();
      emit('expeditions');
    };
  }

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
function contractShelf(idleParties, free) {
  const list = G.state.contracts ?? [];
  if (!list.length) return '';

  const order = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
  const sorted = list.slice().sort(
    (a, b) => (order[b.rarity] ?? 0) - (order[a.rarity] ?? 0) || b.danger - a.danger,
  );
  return `<div class="contract-shelf" id="contractShelf">
    <div class="cs-head">
      <span class="dispatch-label">Sealed Contracts</span>
      <span class="hint">${list.length}/${CONTRACT_CAP} · spent when the party leaves, win or lose</span>
    </div>
    <div class="cs-list">${sorted.map((c) => {
    const dungeon = DUNGEON_BY_ID[c.dungeonId];
    const rar = rarityOf(c);
    const find = findBaseFor(c);
    const bad = downsidesOf(c);
    const good = boonsOf(c);
    const blocked = free <= 0 || !idleParties.length;
    return `<div class="contract ${rar.cls}">
        <div class="ct-top">
          <span class="ct-name">${escapeHtml(dungeon?.name ?? 'Unknown')} <b>T${c.tier}</b></span>
          <span class="ct-rarity">${escapeHtml(rar.name)}</span>
        </div>
        <div class="ct-find">
          <span title="More items drop">+${Math.round(find.quantity)}% quantity</span>
          <span title="Items that drop are better">+${Math.round(find.rarity)}% rarity</span>
          <span title="Gold, materials and experience" class="ct-mult">×${rewardMultFor(c).toFixed(2)}</span>
        </div>
        ${bad.length ? `<ul class="ct-mods bad">${bad.map((m) => `<li><b>${escapeHtml(m.name)}</b>
          ${escapeHtml(m.desc)}</li>`).join('')}</ul>` : ''}
        ${good.length ? `<ul class="ct-mods good">${good.map((m) => `<li><b>${escapeHtml(m.name)}</b>
          ${escapeHtml(m.desc)}</li>`).join('')}</ul>` : ''}
        <div class="ct-foot">${idleParties.map((p) => {
      const check = canDispatch(p, staminaCost(c.tier));
      const barred = barredMembers(c.mods, partyMembers(p), (id) => CLASS_BY_ID[id]);
      const off = blocked || !check.ok || barred.length > 0;
      const why = barred.length
        ? `${[...new Set(barred.map((x) => x.mod.name))].join(', ')}: `
          + `${[...new Set(barred.map((x) => x.hero.name))].join(', ')} cannot enter`
        : (check.ok ? `Send ${p.name}` : check.msg);
      return `<button class="btn tiny ${off ? '' : 'primary'}" data-contract="${c.id}"
            data-party="${p.id}" ${off ? 'disabled' : ''} title="${escapeHtml(why)}"
            >Send ${escapeHtml(p.name)}</button>`;
    }).join('') || '<span class="hint">All parties are busy.</span>'}
          <button class="btn tiny danger" data-discard="${c.id}" title="Destroy this contract">Discard</button>
        </div>
      </div>`;
  }).join('')}</div>
  </div>`;
}
