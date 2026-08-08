// workshop — Crafting materials, the bench recipes and the alchemy stand.

import { brew, craft, craftRepeat } from '../crafting.js';
import { hasPrivilege, REPEAT_CRAFTS } from '../charter.js';
import { flaskStatus, standingOrders } from '../alchemy.js';
import { FAMILIES, MATERIAL_BY_ID, familyMaterials } from '../data/materials.js';
import { FLASKS, RECIPES, flaskCost } from '../data/recipes.js';
import { findItem, hasMaterials } from '../inventory.js';
import { systemUnlocked } from '../story.js';
import { G, emit, on } from '../state.js';
import { el, escapeHtml, fmtInt, qs } from '../util.js';
import { gotoTab, setStatus } from './shell.js';
import { ui } from './state.js';
import { hideTooltip, moveTooltip, showMaterialTooltip } from './tooltip.js';

// ===========================================================================
// Workshop: materials, bench recipes and alchemy
// ===========================================================================

export function buildMaterialGrid() {
  const host = qs('#materialGrid');
  host.onmouseover = (e) => {
    const cell = e.target.closest('[data-mat]');
    if (cell) showMaterialTooltip(MATERIAL_BY_ID[cell.dataset.mat], e);
  };
  host.onmouseout = hideTooltip;
  host.onmousemove = moveTooltip;
}

/** Materials, grouped by family so the eight sources read at a glance. */
export function renderMaterials() {
  const s = G.state;
  const host = qs('#materialGrid');
  if (!host || !s) return;
  host.innerHTML = FAMILIES.map((f) => {
    const mats = familyMaterials(f.id);
    const held = mats.reduce((a, m) => a + (s.materials[m.id] ?? 0), 0);
    return `<div class="mat-family ${held ? '' : 'empty'}">
      <div class="mf-head" style="color:${f.colour}">${escapeHtml(f.name)}</div>
      <div class="mf-row">${mats.map((m) => {
    const n = s.materials[m.id] ?? 0;
    return `<div class="mat ${n ? '' : 'zero'} g${m.grade}" data-mat="${m.id}" style="--mat:${f.colour}">
        <span class="mat-dot"></span><span class="mat-n">${fmtInt(n)}</span>
      </div>`;
  }).join('')}</div>
    </div>`;
  }).join('');
}

export function selectRecipe(id) {
  ui.craftRecipe = id;
  renderCraftPanel(); renderVaultBanner(); emit('vault');
  if (id) {
    gotoTab('vault');
    setStatus(`${RECIPES.find((r) => r.id === id).name} selected — click a vault item. Esc to cancel.`);
  } else setStatus('Crafting cancelled.');
}

function renderVaultBanner() {
  let banner = qs('#vaultCraftBanner');
  if (!ui.craftRecipe) { if (banner) banner.remove(); return; }
  if (!banner) {
    banner = el('div', 'craft-banner');
    banner.id = 'vaultCraftBanner';
    qs('#tab-vault').prepend(banner);
  }
  const r = RECIPES.find((x) => x.id === ui.craftRecipe);
  banner.innerHTML = `<b>${escapeHtml(r.name)}</b> — click a vault item to apply it.
    <button class="btn tiny" id="btnCancelCraft">Cancel</button>`;
  qs('#btnCancelCraft').onclick = () => selectRecipe(null);
}

export function renderCraftPanel() {
  const host = qs('#craftPanel');
  const banner = qs('#craftBanner');
  if (!host || !G.state) return;

  if (ui.craftRecipe) {
    const r = RECIPES.find((x) => x.id === ui.craftRecipe);
    banner.classList.remove('hidden');
    banner.innerHTML = `<b>${escapeHtml(r.name)}</b> ready — click a valid vault item.
      <button class="btn tiny" id="btnCancelCraft2">Cancel</button>`;
    qs('#btnCancelCraft2').onclick = () => selectRecipe(null);
  } else {
    banner.classList.add('hidden');
  }

  host.innerHTML = `
    <p class="hint">The Workbench improves gear you already own. Costs go up with the item level,
      and "self" materials depend on what the item is made of — tempering plate armour wants
      metal, tempering a robe wants cloth.</p>
    <div class="recipe-list">${RECIPES.map((r) => `
      <div class="recipe ${ui.craftRecipe === r.id ? 'selected' : ''} ${r.risky ? 'risky' : ''}"
           data-recipe="${r.id}">
        <div class="rc-name">${escapeHtml(r.name)}</div>
        <div class="rc-desc">${escapeHtml(r.desc)}</div>
      </div>`).join('')}</div>
    ${repeatRow()}
  `;

  host.onclick = (e) => {
    if (e.target.closest('#btnCraftRepeat')) {
      ui.craftRepeat = !ui.craftRepeat;
      renderCraftPanel();
      return;
    }
    const rec = e.target.closest('[data-recipe]');
    if (!rec) return;
    selectRecipe(ui.craftRecipe === rec.dataset.recipe ? null : rec.dataset.recipe);
  };

  renderAlchemy();
}

/**
 * What the parties are actually waiting on.
 *
 * The stand used to be a price list. It never said that three parties were
 * assigned the same flask and the guild held two, which is the only thing
 * about alchemy a player needs to know between runs.
 */
function standingOrdersPanel() {
  const orders = standingOrders();
  if (!orders.length) return '';
  const auto = hasPrivilege('standingStock');
  const on = auto && !!G.state.settings.standingStock;
  return `<div class="standing-orders">
    <div class="so-head">
      <span>Standing orders</span>
      ${auto ? `<button class="toggle ${on ? 'on' : ''}" id="btnStandingStock" role="switch"
        aria-checked="${on}" title="Keep every assigned flask brewed, up to three expeditions ahead.">
        <span class="toggle-track"><span class="toggle-knob"></span></span>
        <span class="toggle-label">Keep stocked</span></button>` : ''}
    </div>
    ${orders.map((st) => `<div class="so-row ${st.short ? 'short' : ''}">
      <span class="so-name">${escapeHtml(st.def?.name ?? st.id)}</span>
      <span class="so-who">${st.parties.map((p) => escapeHtml(p.name)).join(', ')}</span>
      <span class="so-left">${st.short
    ? 'not enough to go round'
    : `${st.runsLeft} run${st.runsLeft === 1 ? '' : 's'} left`}</span>
    </div>`).join('')}
  </div>`;
}

/** The alchemy stand: flasks, brewed in batches. Its own panel so the tutorial
 *  can point at it without also pointing at every bench recipe. */
export function renderAlchemy() {
  const host = qs('#alchemyPanel');
  if (!host || !G.state) return;
  // Alchemy shares the Workshop tab with the workbench, so it cannot be hidden
  // by hiding a tab. Gated inside the panel instead, and only ever until the
  // first herb comes home — see the natural triggers in data/story.js.
  if (!systemUnlocked('alchemy')) {
    host.innerHTML = '<p class="hint">The guild has no alchemist and nothing to give one. '
      + 'Bring back herbs from the Dark Forest or Silkmoth Hollow and that will change.</p>';
    return;
  }
  host.innerHTML = `
    <p class="hint">Flasks are brewed a few at a time from herbs. Give one to a party on the
      Parties tab and they drink it as they leave, buffing everyone for the whole expedition.
      It is used up whether the run goes well or not.</p>
    ${standingOrdersPanel()}
    <div class="flask-list">${FLASKS.map((f) => {
    const cost = flaskCost(f);
    const afford = hasMaterials(cost);
    const held = G.state.flasks[f.id] ?? 0;
    return `<div class="flask ${afford ? 'afford' : ''}">
        <div class="fl-top">
          <span class="fl-name">${escapeHtml(f.name)}</span>
          <span class="fl-held">${held ? `${held} in stock` : ''}</span>
        </div>
        <div class="fl-effect">${escapeHtml(f.effectText)}</div>
        ${(() => {
      const st = flaskStatus(f.id);
      if (!st.want) return '';
      return `<div class="fl-orders ${st.short ? 'short' : ''}">
          ${st.want} part${st.want === 1 ? 'y' : 'ies'} waiting ·
          ${st.runsLeft} run${st.runsLeft === 1 ? '' : 's'} of stock</div>`;
    })()}
        <div class="fl-cost">${cost.map((c) =>
      `<span class="${(G.state.materials[c.id] ?? 0) >= c.qty ? '' : 'short'}">${c.qty}\u00d7 ${
        escapeHtml(MATERIAL_BY_ID[c.id].name)}</span>`).join('')}</div>
        <button class="btn tiny ${afford ? 'primary' : ''}" data-brew="${f.id}" ${afford ? '' : 'disabled'}>Brew ${f.batch}</button>
      </div>`;
  }).join('')}</div>`;

  host.onclick = (e) => {
    if (e.target.closest('#btnStandingStock')) {
      G.state.settings.standingStock = !G.state.settings.standingStock;
      renderAlchemy();
      setStatus(G.state.settings.standingStock
        ? 'The stand will keep every assigned flask brewed.'
        : 'Standing Stock switched off.');
      return;
    }
    const b = e.target.closest('[data-brew]');
    if (b && !b.disabled) setStatus(brew(b.dataset.brew).msg);
  };
}

/**
 * The Master's Bench switch.
 *
 * A mode rather than a second button beside every recipe, because the recipe
 * is chosen here and applied over on the vault — a per-recipe button would
 * have to ask "which item?" all over again. Warp is excluded from it outright:
 * the one-way gamble repeated ten times is not a convenience, it is a way to
 * destroy ten items by mistake.
 */
function repeatRow() {
  if (!hasPrivilege('repeatCraft')) return '';
  const r = ui.craftRecipe ? RECIPES.find((x) => x.id === ui.craftRecipe) : null;
  const allowed = !r || !r.risky;
  return `<div class="row repeat-row">
    <button class="btn tiny ${ui.craftRepeat && allowed ? 'active' : ''}" id="btnCraftRepeat"
      ${allowed ? '' : 'disabled'}>Repeat ×${REPEAT_CRAFTS}</button>
    <span class="hint">${allowed
    ? 'Runs the recipe until it lands ten times, the materials run out, or the item can take no more.'
    : 'Warp is one-way, so it is never repeated.'}</span>
  </div>`;
}

export function applyCraft(uid) {
  const item = findItem(uid);
  if (!item) return;
  const recipe = RECIPES.find((x) => x.id === ui.craftRecipe);
  const repeat = ui.craftRepeat && hasPrivilege('repeatCraft') && !recipe?.risky;
  const res = repeat
    ? craftRepeat(ui.craftRecipe, item, REPEAT_CRAFTS)
    : craft(ui.craftRecipe, item);
  setStatus(res.msg);
  if (!res.ok) return;
  emit('vault'); renderMaterials(); renderCraftPanel();
}
