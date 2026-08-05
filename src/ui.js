// ui.js — the interface orchestrator.
//
// Rendering itself lives in ./ui/*, one module per panel. This file owns the
// wiring between them and nothing else: which game events redraw which panels,
// what a tab switch refreshes, and what runs on every frame.
//
// The rule the split rests on: a panel never imports another panel in order to
// redraw it. It emits, and the subscriptions below decide what that means.
// What remains between panels is only ever an action — the vault applying a
// craft, the party board opening a hero sheet — which keeps the graph acyclic.
//
// Structural changes are event-driven (see state.on); fast-moving numbers
// (health bars, timers, stamina) refresh from the main loop via tick().

import { on } from './state.js';
import { tutorialTick } from './tutorial.js';

import { ui } from './ui/state.js';
import {
  wireTabs, wireTopBar, renderGuildBar, renderQuickStats, renderStatus, setStatus,
} from './ui/shell.js';
import { openGuide } from './ui/guide.js';
import { openAchievements, renderAchievements, pumpAchievementToasts } from './ui/achievements.js';
import { renderCharter, pumpCharterToasts } from './ui/charter.js';
import { pumpToasts } from './ui/toast.js';
import { recordFeat } from './achievements.js';
import { wireModals, openModal, closeModals, renderSlots, renderSettings } from './ui/modals.js';
import { renderRoster, updateStaminaBars, renderRecruitBoard } from './ui/roster.js';
import { renderParties } from './ui/parties.js';
import {
  renderRuns, updateRunBars, renderDispatch, updateReportTimers,
} from './ui/expeditions.js';
import { renderRaids } from './ui/raids.js';
import { renderHall, renderCollection } from './ui/hall.js';
import { wireVaultActions, renderVault, renderEquipTarget } from './ui/vault.js';
import {
  buildMaterialGrid, renderMaterials, renderCraftPanel, selectRecipe,
} from './ui/workshop.js';
import { wireLogFilters, renderLog } from './ui/log.js';

export { setStatus };

// ===========================================================================
// Boot
// ===========================================================================

export function initUI() {
  wireTabs();
  wireTopBar({
    saves: () => { renderSlots(); openModal('modalSaves'); },
    settings: () => { recordFeat('settings'); renderSettings(); openModal('modalSettings'); },
    guide: () => { recordFeat('guide'); openGuide(); },
    achievements: () => openAchievements(),
  });
  wireModals();
  wireVaultActions();
  wireLogFilters();
  buildMaterialGrid();

  // What Escape means depends on what is going on across several panels, so it
  // is decided here rather than inside any one of them: back out of a pending
  // craft first, and only close a modal if there is no craft to cancel.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.craftRecipe) { selectRecipe(null); return; }
    closeModals();
  });

  on('roster', () => { renderRoster(); renderParties(); renderDispatch(); renderEquipTarget(); });
  on('vault', () => { renderVault(); renderEquipTarget(); });
  on('materials', () => { renderMaterials(); renderCraftPanel(); });
  on('guild', () => {
    renderGuildBar(); renderQuickStats(); renderHall(); renderCharter();
    renderDispatch(); renderRaids();
  });
  on('charter', () => { renderCharter(); renderRoster(); renderParties(); renderCraftPanel(); });
  on('upgrades', () => { renderHall(); renderQuickStats(); renderDispatch(); });
  on('sheets', () => { renderRoster(); renderParties(); });
  on('expeditions', () => { renderRuns(); renderDispatch(); renderRoster(); renderRaids(); renderQuickStats(); });
  on('contracts', () => { renderDispatch(); });
  on('achievements', () => { renderAchievements(); });
  on('reports', () => { renderRuns(); });
  on('log', () => { renderLog(); });
  on('saves', () => { renderSlots(); });
  on('recruits', () => { renderRecruitBoard(); });
  on('loaded', () => { ui.craftRecipe = null; ui.equipTarget = null; renderAll(); });

  // Arriving at a panel refreshes it, so affordability and stamina are never
  // stale from whatever happened while you were looking somewhere else.
  on('tab', (tabId) => {
    if (tabId === 'hall') { renderCharter(); renderHall(); renderCollection(); }
    if (tabId === 'workshop') { renderMaterials(); renderCraftPanel(); }
    if (tabId === 'parties') renderParties();
  });

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
  renderCharter();
  renderHall();
  renderCollection();
  renderEquipTarget();
  renderVault();
  renderMaterials();
  renderCraftPanel();
  renderLog();
  renderSettings();
}

/** Called ~10x a second for smoothly-moving numbers. */
export function tick() {
  updateRunBars();
  updateReportTimers();
  pumpAchievementToasts();
  pumpCharterToasts();
  pumpToasts();
  updateStaminaBars();
  renderStatus();
  tutorialTick();
}
