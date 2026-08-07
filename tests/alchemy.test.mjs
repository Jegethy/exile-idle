// Alchemy: a complete system nobody used.
//
// None of the reasons were about the flasks. Measured, a Tier 12 run in the
// Dark Forest brings home about fifteen herbs against a three-herb flask, so
// supply was never the problem. The system was invisible at both ends — the
// picker hid itself until you already held a flask, and a party that had run
// out simply left without one and said nothing.
//
// So these are tests about *being told*, mostly, plus the standing order that
// stops it being a trip to the workshop every three expeditions.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Empties the guild's flasks and material stores. */
async function reset(page) {
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.state.flasks = {};
    for (const k of Object.keys(G.state.materials)) G.state.materials[k] = 0;
    for (const p of G.state.parties) p.flask = null;
    G.state.parties.length = 1;
    G.state.settings.standingStock = false;
    while (G.state.expeditions.length) G.state.expeditions.pop();
  });
}

export default async function run(browser) {
  suite('alchemy');
  const { page, errors } = await openGame(browser, { name: 'Alchemy' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
    G.state.progress.highestTier = 12;
  });

  await test('the picker is shown even with nothing brewed', async () => {
    await reset(page);
    const r = await page.evaluate(async () => {
      const { renderParties } = await import('./src/ui/parties.js');
      const { gotoTab } = await import('./src/ui/shell.js');
      gotoTab('parties');
      renderParties();
      const picker = document.querySelector('.flask-picker');
      return {
        shown: !!picker,
        text: picker?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      };
    });
    // This is the state every new guild is in, and the one moment a player
    // might have discovered flasks exist was the one moment it hid itself.
    ok(r.shown, 'a guild with no flasks is never told they exist');
    ok(/alchemy/i.test(r.text), `the empty picker does not say where flasks come from: "${r.text}"`);
    return 'shown and explained with an empty cupboard';
  });

  await test('a party that has run out is told, in the log and on the card', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { renderParties } = await import('./src/ui/parties.js');
      const { addFlask } = await import('./src/inventory.js');

      const party = G.state.parties[0];
      party.flask = 'ironskin';
      addFlask('ironskin', 1);
      for (const h of G.state.heroes) { h.stamina = 100; h.level = 40; }

      // The one it has: carried, and named on the run card.
      dispatch(party.id, 'mines', 2);
      const carried = G.state.expeditions[0]?.flaskId ?? null;
      const { renderRuns } = await import('./src/ui/expeditions.js');
      renderRuns();
      const onCard = !!document.querySelector('.run-flask');
      for (let i = 0; i < 4000 && G.state.expeditions.length; i++) tickAll(0.1);

      // The one it does not: goes without, and is told so.
      const before = G.state.log.length;
      for (const h of G.state.heroes) h.stamina = 100;
      dispatch(party.id, 'mines', 2);
      const second = G.state.expeditions[0]?.flaskId ?? null;
      const said = G.state.log.slice(before).some((l) => /without/i.test(l.msg));
      while (G.state.expeditions.length) G.state.expeditions.pop();

      renderParties();
      const picker = document.querySelector('.flask-picker');
      return {
        carried, onCard, second, said,
        cardWarns: !!picker?.classList.contains('out'),
        cardText: picker?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      };
    });
    eq(r.carried, 'ironskin', 'the flask in stock was not drunk');
    ok(r.onCard, 'the run card does not name the flask in effect');
    eq(r.second, null, 'a flask was conjured out of an empty store');
    ok(r.said, 'going without was silent — which is how the whole system died');
    ok(r.cardWarns, 'the party card does not flag that it is leaving without one');
    ok(/out/i.test(r.cardText), `the card says nothing useful: "${r.cardText}"`);
    return 'carried when held, announced when not, and flagged on the card';
  });

  await test('the stand says who is waiting on what', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createParty } = await import('./src/heroes.js');
      const { addFlask } = await import('./src/inventory.js');
      const { standingOrders, flaskStatus } = await import('./src/alchemy.js');
      const { renderAlchemy } = await import('./src/ui/workshop.js');
      const { gotoTab } = await import('./src/ui/shell.js');

      G.state.flasks = {};
      if (G.state.parties.length < 2) createParty('Second Company');
      for (const p of G.state.parties) p.flask = 'ironskin';
      addFlask('ironskin', 3);

      gotoTab('workshop');
      renderAlchemy();
      const st = flaskStatus('ironskin');
      return {
        orders: standingOrders().length,
        want: st.want,
        held: st.held,
        // Three flasks between two parties is one round each, not three.
        runsLeft: st.runsLeft,
        rows: document.querySelectorAll('.standing-orders .so-row').length,
        text: document.querySelector('.standing-orders')?.textContent.replace(/\s+/g, ' ') ?? '',
      };
    });
    eq(r.want, 2, `${r.want} parties recorded as waiting`);
    eq(r.held, 3, 'stock not counted');
    eq(r.runsLeft, 1, `three flasks between two parties reported as ${r.runsLeft} runs`);
    eq(r.orders, 1, 'the standing order list is wrong');
    eq(r.rows, 1, 'the stand does not list the order');
    ok(/Second Company/.test(r.text), `the stand does not name the parties: "${r.text}"`);
    return 'two parties, three flasks, one round each — and it says so';
  });

  await test('Standing Stock brews what is assigned, and only that', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { tickAlchemy, RESERVE_RUNS } = await import('./src/alchemy.js');

      G.state.guild.level = 12;              // the privilege's level
      G.state.flasks = {};
      G.state.parties.length = 1;
      G.state.parties[0].flask = 'ironskin';
      // Plenty of everything, so nothing is limited by materials.
      for (const k of Object.keys(G.state.materials)) G.state.materials[k] = 500;

      const offBefore = { ...G.state.flasks };
      G.state.settings.standingStock = false;
      tickAlchemy(999);
      const brewedWhileOff = (G.state.flasks.ironskin ?? 0) - (offBefore.ironskin ?? 0);

      G.state.settings.standingStock = true;
      tickAlchemy(999);
      const first = G.state.flasks.ironskin ?? 0;
      // Runs again until the reserve is met, then stops.
      for (let i = 0; i < 10; i++) tickAlchemy(999);
      const settled = G.state.flasks.ironskin ?? 0;

      return {
        brewedWhileOff,
        first,
        settled,
        target: RESERVE_RUNS,
        // Nothing anybody asked for is the only thing it may brew.
        others: Object.entries(G.state.flasks)
          .filter(([id, n]) => id !== 'ironskin' && n > 0).map(([id]) => id),
      };
    });
    eq(r.brewedWhileOff, 0, 'it brewed with the switch off');
    ok(r.first > 0, 'it brewed nothing with the switch on');
    ok(r.settled >= r.target, `it stopped at ${r.settled}, short of the ${r.target}-run reserve`);
    ok(r.settled < r.target + 4, `it kept brewing to ${r.settled} — that is hoarding, not stocking`);
    eq(r.others.length, 0, `it brewed flasks nobody asked for: ${r.others.join(', ')}`);
    return `off: nothing; on: brewed to ${r.settled} and stopped`;
  });

  await test('Standing Stock is locked until the charter grants it', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { tickAlchemy } = await import('./src/alchemy.js');
      const { PRIVILEGE_BY_ID } = await import('./src/data/charter.js');

      G.state.guild.level = 1;
      G.state.settings.standingStock = true;   // switched on, but not held
      G.state.flasks = {};
      G.state.parties[0].flask = 'ironskin';
      for (const k of Object.keys(G.state.materials)) G.state.materials[k] = 500;
      tickAlchemy(999);
      return {
        brewed: G.state.flasks.ironskin ?? 0,
        level: PRIVILEGE_BY_ID.standingStock?.level ?? null,
        switchable: !!PRIVILEGE_BY_ID.standingStock?.switchable,
      };
    });
    eq(r.brewed, 0, 'a level 1 guild brewed on its own');
    eq(r.level, 12, `Standing Stock is granted at level ${r.level}`);
    ok(r.switchable, 'an automation that spends materials has no switch');
    return `granted at level ${r.level}, and inert below it even when switched on`;
  });

  await test('no page errors', async () => {
    eq(errors.length, 0, errors.join(' | '));
    return 'no page errors';
  });

  clean(page);
}
