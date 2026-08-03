// raids — Raid bosses: the Seal-gated encounters at the end of each tier band.

import { RAIDS } from '../data/dungeons.js';
import { dispatchRaid } from '../expedition.js';
import { G } from '../state.js';
import { escapeHtml, qs } from '../util.js';
import { gotoTab, setStatus } from './shell.js';

// ===========================================================================
// Raids
// ===========================================================================

export function renderRaids() {
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
