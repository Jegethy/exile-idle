// tutorial.js — a guided first session.
//
// The overlay darkens the whole screen except a cut-out over the element being
// explained. That hole is made from four solid panels surrounding the target
// rather than one translucent layer, because the panels can swallow clicks
// while leaving the highlighted element genuinely interactive — the player
// really does press the button the tutorial is pointing at.
//
// Steps are declarative. A step advances when the player clicks its target
// (`advance: 'click'`) or when they press Continue (`'next'`).
//
// `advance: 'wait'` does NOT advance on its own. The condition only *unlocks*
// the Continue button, so the player still decides when to move on. Auto-
// advancing on a condition tied reading time to however long the game took,
// which meant a fast expedition skipped the text out from under the player.

import { G, log, emit } from './state.js';
import { qs, qsa } from './util.js';

let active = false;
let index = 0;
let clickHandler = null;
let waitReady = false;

/** Steps run in order. `target` is a CSS selector resolved when the step opens. */
export const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome, Guildmaster',
    body: 'You run an adventuring guild. You will not be fighting — your heroes do that. '
      + 'Your job is deciding who goes where, and what to spend the returns on.'
      + '<br><br>This will take about a minute.',
    advance: 'next',
  },
  {
    id: 'roster',
    tab: 'roster', target: '#rosterList',
    title: 'Your Roster',
    body: 'Three heroes have signed on. Each has a <b>class</b>, a <b>role</b> and a '
      + '<b>rarity</b> — and a stamina bar that drains on expeditions and refills while they rest.'
      + '<br><br>Roles matter mechanically: a <span class="role role-tank">Tank</span> soaks the '
      + 'attacks aimed at the party, and a <span class="role role-healer">Healer</span> mends the '
      + 'most wounded ally instead of attacking.',
    advance: 'next',
  },
  {
    id: 'heroCard',
    tab: 'roster', target: '.hero-card',
    title: 'Inspect a Hero',
    body: 'Click this hero to open their sheet.',
    advance: 'click',
  },
  {
    id: 'heroSheet',
    target: '#heroModalBody',
    title: 'Traits and Equipment',
    body: '<b>Traits</b> are rolled when a hero is recruited and never change — they are the '
      + 'reason one Rare Ranger is worth more than another.'
      + '<br><br>Below them are nine equipment slots. <b>Gear from Vault</b> lets you fill them '
      + 'from the guild\'s shared stock, with tooltips showing the difference for that hero.',
    advance: 'next',
    onExit: () => closeAnyModal(),
  },
  {
    id: 'parties',
    tab: 'parties', target: '#partyList',
    title: 'Parties',
    body: 'Heroes go out in parties of up to five. Your three starters are already in '
      + '<b>First Company</b>.'
      + '<br><br>The panel warns you if a party has no Tank or no Healer. It will still go — '
      + 'it just will not come back.',
    advance: 'next',
  },
  {
    id: 'tier',
    tab: 'expeditions', target: '.dispatch-bar',
    title: 'Tier — How Hard',
    body: 'Tier sets enemy level, stamina cost and reward size. You unlock the next tier by '
      + 'clearing the current one.'
      + '<br><br>Pushing two or three tiers above your heroes is where the good loot is. '
      + 'Push six and they will be carried home.',
    advance: 'next',
  },
  {
    id: 'dungeons',
    tab: 'expeditions', target: '.dungeon-grid',
    title: 'Dungeon — What For',
    body: 'Every dungeon exists at every tier, and each pays in something different — the bars '
      + 'show what. The Deepmines pay <b>gold</b>; the Crypt pays <b>equipment</b>.'
      + '<br><br>This is why old tiers stay useful: a Tier 4 gold run you finish in twenty '
      + 'seconds can out-earn a Tier 12 you barely survive.',
    advance: 'next',
  },
  {
    id: 'dispatch',
    tab: 'expeditions', target: '.dungeon .btn[data-send]:not([disabled])',
    title: 'Send Them Out',
    body: 'Send First Company into the Deepmines. You need gold before anything else.',
    advance: 'click',
  },
  {
    id: 'watching',
    tab: 'expeditions', target: '#centerPanel',
    title: 'The Expedition',
    body: 'Combat resolves on its own. Your party is on the left, the current enemies on the '
      + 'right, and the guild log below narrates it.'
      + '<br><br>A hero who falls sits out the rest of the run — they are never lost permanently.'
      + '<br><br><i>This first run is accelerated so you are not kept waiting. Later expeditions '
      + 'take their own time.</i>',
    // Deliberately not a wait step. Reading about the live view should not be
    // racing the run: Continue is available immediately and nothing on screen
    // changes until you press it.
    advance: 'next',
  },
  {
    id: 'rewards',
    tab: 'expeditions', target: '#guildLog',
    title: 'The Returns',
    body: 'Gold, equipment, crafting materials and experience, split by whatever the dungeon '
      + 'specialises in. Clearing the final wave pays a bonus chest on top.'
      + '<br><br>The guild log keeps the full account of every run.',
    // The wait lives here rather than on the previous step, so the party
    // coming home is the only thing this step is ever waiting for.
    advance: 'wait',
    waitLabel: 'Waiting for the party…',
    waitFor: () => G.state.expeditions.length === 0
      && (G.state.stats.runs + G.state.stats.runsFailed) > 0,
    readyBody: () => (G.state.stats.runs > 0
      ? '<b>They made it back.</b> Their haul is in the log above.'
      : '<b>They were driven out.</b> A failed run keeps whatever was already looted but '
        + 'earns no completion chest. Nobody is lost permanently.'),
  },
  {
    id: 'vault',
    tab: 'vault', target: '#vaultGrid',
    title: 'The Vault',
    body: 'Recovered equipment lands here, shared across the whole guild. Click an item for its '
      + 'actions, <b>Shift-click</b> to break it down for materials and gold, or '
      + '<b>Ctrl-click</b> to lock it against bulk salvage.'
      + '<br><br>What an item breaks into depends on what it is made of — plate gives metal, '
      + 'a robe gives cloth, a bow gives wood.',
    advance: 'next',
  },
  {
    id: 'workshop',
    tab: 'workshop', target: '#materialGrid',
    title: 'Materials and the Workshop',
    body: 'Eight families of material, three grades each. They come from salvage and from '
      + 'expeditions — and <b>where you send a party decides what you bring back</b>. The Dark '
      + 'Forest yields wood and herbs; the Arcane Vault yields essence.'
      + '<br><br>Below the materials is the bench: <b>Reforge</b> rerolls a Rare, <b>Augment</b> '
      + 'adds a modifier, <b>Temper</b> raises quality. Costs scale with the item level, so '
      + 'reworking deep-tier gear is a project.'
      + '<br><br>The alchemy bench brews <b>flasks</b> from herbs. Assign one to a party and they '
      + 'drink it on their way out.',
    advance: 'next',
  },
  {
    id: 'recruit',
    tab: 'roster', target: '#rosterHeader',
    title: 'Recruiting',
    body: 'Gold buys heroes. Each recruit rolls a random class, rarity and traits, and every '
      + 'hire makes the next one dearer.'
      + '<br><br>Depth matters: heroes on an expedition cannot go on another, and tired heroes '
      + 'cannot go at all. A bigger roster keeps more parties in the field.',
    advance: 'next',
  },
  {
    id: 'hall',
    tab: 'hall', target: '#upgradeList',
    title: 'The Guild Hall',
    body: 'Permanent upgrades, bought with gold. Most raise your returns.'
      + '<br><br><b>Expedition Charters</b> are the one to aim for — each lets another party run '
      + 'at the same time, which changes how the game plays more than any stat.',
    advance: 'next',
  },
  {
    id: 'standingOrders',
    tab: 'expeditions', target: '#autoDispatchBox',
    title: 'Doing It Yourself',
    body: 'Auto-redeploy lives here, and it is locked until you buy <b>Standing Orders</b> in the '
      + 'Guild Hall for 1,500 gold.'
      + '<br><br>That is deliberate. Sending the first several expeditions by hand is how you learn '
      + 'which dungeon pays what and how far your party can be pushed. Once that is second nature, '
      + 'buy it and let idle parties repeat their last run on their own.',
    advance: 'next',
  },
  {
    id: 'done',
    title: 'You Are Set',
    body: 'Send parties out, gear the roster, buy charters, push tiers. Raid Seals start dropping '
      + 'at Tier 4 and open the milestone bosses.'
      + '<br><br>Good luck, guildmaster.',
    advance: 'next',
  },
];

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function isTutorialActive() { return active; }

/** Should a freshly-loaded save show the tutorial? */
export function shouldRunTutorial(state) {
  const t = state?.tutorial;
  return !!t && !t.done;
}

export function startTutorial(fromStep = null) {
  const s = G.state;
  if (!s || s.tutorial?.done) return;
  active = true;
  index = fromStep ?? s.tutorial?.step ?? 0;
  if (index >= STEPS.length) index = 0;
  buildOverlay();
  openStep(index);
}

/** Ends the tutorial. `skipped` marks it as never to be offered again. */
export function stopTutorial(skipped = false) {
  const s = G.state;
  active = false;
  detachClick();
  const root = qs('#tutorial');
  if (root) root.classList.add('hidden');
  if (s?.tutorial) {
    s.tutorial.done = true;
    s.tutorial.skipped = skipped;
    s.tutorial.step = index;
  }
  log(skipped ? 'Tutorial skipped.' : 'Tutorial complete. Good luck, guildmaster.', 'sys');
  emit('tutorial');
}

/** Called from the UI tick: keeps the cut-out aligned and polls wait conditions. */
export function tutorialTick() {
  if (!active) return;
  const step = STEPS[index];
  if (!step) return;
  reposition();

  if (step.advance === 'wait' && !waitReady && step.waitFor?.()) {
    waitReady = true;
    const next = qs('#tutNext');
    if (next) {
      next.disabled = false;
      next.textContent = 'Continue';
      next.classList.add('ready');
    }
    if (step.readyBody) {
      const body = qs('#tutBody');
      if (body) body.innerHTML += `<div class="tut-ready-note">${step.readyBody()}</div>`;
      reposition();
    }
  }
}

function advance() {
  const step = STEPS[index];
  // Single choke point for the wait invariant. Nothing — a stray timer, a
  // click handler left over from the previous step, a double-fire — may push
  // past a wait step until its condition has actually been met.
  if (step?.advance === 'wait' && !waitReady) return;
  step?.onExit?.();
  if (index + 1 >= STEPS.length) { stopTutorial(false); return; }
  index++;
  if (G.state.tutorial) G.state.tutorial.step = index;
  openStep(index);
}

// ---------------------------------------------------------------------------
// Overlay construction
// ---------------------------------------------------------------------------

function buildOverlay() {
  let root = qs('#tutorial');
  if (!root) {
    root = document.createElement('div');
    root.id = 'tutorial';
    root.innerHTML = `
      <div class="tut-panel" data-side="top"></div>
      <div class="tut-panel" data-side="bottom"></div>
      <div class="tut-panel" data-side="left"></div>
      <div class="tut-panel" data-side="right"></div>
      <div class="tut-ring" id="tutRing"></div>
      <div class="tut-pop" id="tutPop">
        <div class="tut-step" id="tutStep"></div>
        <h3 id="tutTitle"></h3>
        <div class="tut-body" id="tutBody"></div>
        <div class="tut-actions">
          <button class="btn tiny" id="tutSkip">Skip Tutorial</button>
          <button class="btn primary" id="tutNext">Continue</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    qs('#tutSkip').onclick = confirmSkip;
    qs('#tutNext').onclick = () => {
      const step = STEPS[index];
      if (!step) return;
      if (step.advance === 'next' || (step.advance === 'wait' && waitReady)) advance();
    };
    window.addEventListener('resize', reposition);
  }
  root.classList.remove('hidden');
}

function openStep(i) {
  const step = STEPS[i];
  if (!step) return;
  detachClick();

  // Switch to whichever tab actually contains the target.
  if (step.tab) selectTabById(step.tab);
  step.onEnter?.();

  qs('#tutStep').textContent = `Step ${i + 1} of ${STEPS.length}`;
  qs('#tutTitle').textContent = step.title;
  qs('#tutBody').innerHTML = step.body;

  const next = qs('#tutNext');
  waitReady = false;
  next.classList.remove('ready');
  if (step.advance === 'next') {
    next.classList.remove('hidden');
    next.disabled = false;
    next.textContent = i + 1 >= STEPS.length ? 'Finish' : 'Continue';
  } else if (step.advance === 'wait') {
    // Present but inert until the game catches up, so the player can see that
    // moving on is their call rather than wondering if it is stuck.
    next.classList.remove('hidden');
    next.disabled = true;
    next.textContent = step.waitLabel ?? 'Waiting…';
  } else {
    next.classList.add('hidden');
  }

  // The DOM may have just re-rendered from the tab switch.
  requestAnimationFrame(() => {
    reposition();
    if (step.advance === 'click') attachClick(step);
  });
}

/**
 * Advances when the player clicks inside the highlighted element.
 *
 * Listening on the bubble phase means the app's own handler has already run by
 * the time we see the click — and that handler often re-renders the panel,
 * detaching the very button that was clicked. So we test against the element
 * captured when the step opened as well as whatever the selector resolves to
 * now; otherwise pressing "Send" would dispatch the party and then strand the
 * tutorial, because its target no longer existed.
 */
function attachClick(step) {
  const captured = resolveTarget(step);
  clickHandler = (e) => {
    const live = resolveTarget(step);
    const hit = (captured && captured.contains(e.target))
      || (live && live.contains(e.target));
    if (!hit) return;
    detachClick();
    setTimeout(() => advance(), 260);
  };
  document.addEventListener('click', clickHandler, false);
}

function detachClick() {
  if (!clickHandler) return;
  document.removeEventListener('click', clickHandler, false);
  clickHandler = null;
}

function resolveTarget(step) {
  if (!step?.target) return null;
  return qs(step.target);
}

/**
 * The element the current step is pointing at, or null. Exported so a test can
 * drive a 'click' step the way a player would, without hard-coding each step's
 * selector into the suite.
 */
export function currentStepTarget() {
  return active ? resolveTarget(STEPS[index]) : null;
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

const PAD = 6;

function reposition() {
  if (!active) return;
  const step = STEPS[index];
  const root = qs('#tutorial');
  if (!root || !step) return;

  const target = resolveTarget(step);
  const ring = qs('#tutRing');
  const pop = qs('#tutPop');
  const panels = Object.fromEntries(qsa('.tut-panel', root).map((p) => [p.dataset.side, p]));
  const W = window.innerWidth;
  const H = window.innerHeight;

  if (!target) {
    // No target: darken everything and centre the popup.
    ring.classList.add('hidden');
    panels.top.style.cssText = 'top:0;left:0;right:0;bottom:0';
    panels.bottom.style.cssText = 'display:none';
    panels.left.style.cssText = 'display:none';
    panels.right.style.cssText = 'display:none';
    pop.style.left = `${Math.round(W / 2 - pop.offsetWidth / 2)}px`;
    pop.style.top = `${Math.round(H / 2 - pop.offsetHeight / 2)}px`;
    return;
  }

  const r = target.getBoundingClientRect();
  const x = Math.max(0, r.left - PAD);
  const y = Math.max(0, r.top - PAD);
  const w = Math.min(W - x, r.width + PAD * 2);
  const h = Math.min(H - y, r.height + PAD * 2);

  ring.classList.remove('hidden');
  ring.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;

  // Four solid panels around the hole. They block clicks; the hole does not.
  panels.top.style.cssText = `top:0;left:0;width:100%;height:${y}px`;
  panels.bottom.style.cssText = `top:${y + h}px;left:0;width:100%;height:${Math.max(0, H - y - h)}px`;
  panels.left.style.cssText = `top:${y}px;left:0;width:${x}px;height:${h}px`;
  panels.right.style.cssText = `top:${y}px;left:${x + w}px;width:${Math.max(0, W - x - w)}px;height:${h}px`;

  placePopup(pop, x, y, w, h, W, H);
}

/** Puts the popup on whichever side of the hole has room. */
function placePopup(pop, x, y, w, h, W, H) {
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const gap = 14;
  let left;
  let top;

  if (x + w + gap + pw < W) {            // right of the hole
    left = x + w + gap;
    top = clampTo(y, ph, H);
  } else if (x - gap - pw > 0) {         // left of it
    left = x - gap - pw;
    top = clampTo(y, ph, H);
  } else if (y + h + gap + ph < H) {     // below it
    top = y + h + gap;
    left = clampTo(x, pw, W);
  } else if (y - gap - ph > 0) {         // above it
    top = y - gap - ph;
    left = clampTo(x, pw, W);
  } else {                                // nowhere clear: centre it
    left = Math.round(W / 2 - pw / 2);
    top = Math.round(H / 2 - ph / 2);
  }
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function clampTo(v, size, limit) {
  return Math.max(8, Math.min(v, limit - size - 8));
}

// ---------------------------------------------------------------------------
// Skip
// ---------------------------------------------------------------------------

function confirmSkip() {
  qs('#confirmTitle').textContent = 'Skip the tutorial?';
  qs('#confirmText').textContent =
    'You are strongly advised to finish it — it covers parties, dispatching, stamina, the vault '
    + 'and expedition charters, and takes about a minute. It cannot be restarted once skipped.';
  qs('#btnConfirmYes').textContent = 'Skip anyway';

  // The confirm dialog lives above the overlay for this one interaction.
  const root = qs('#tutorial');
  root.classList.add('behind');

  const backdrop = qs('#modalBackdrop');
  backdrop.classList.remove('hidden');
  qsa('.modal').forEach((m) => m.classList.toggle('hidden', m.id !== 'modalConfirm'));

  const cleanup = () => {
    root.classList.remove('behind');
    qs('#btnConfirmYes').textContent = 'Confirm';
    qs('#btnConfirmYes').removeEventListener('click', onYes, true);
    qs('#btnConfirmNo').removeEventListener('click', onNo, true);
  };
  const onYes = () => { cleanup(); stopTutorial(true); };
  const onNo = () => { cleanup(); };
  qs('#btnConfirmYes').addEventListener('click', onYes, true);
  qs('#btnConfirmNo').addEventListener('click', onNo, true);
}

// ---------------------------------------------------------------------------
// Small helpers the tutorial needs from the UI
// ---------------------------------------------------------------------------

/** Switches to a tab by its data-tab id, wherever it lives. */
function selectTabById(tabId) {
  const btn = qs(`.tab[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

function closeAnyModal() {
  const backdrop = qs('#modalBackdrop');
  if (!backdrop || backdrop.classList.contains('hidden')) return;
  backdrop.classList.add('hidden');
  qsa('.modal').forEach((m) => m.classList.add('hidden'));
}
