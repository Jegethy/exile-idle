// Party readiness: can the player see the wall before they walk into it?
//
// Ten levels under the content is an outright wall — most swings miss and the
// blows that land ignore armour, resistances and block. That is deliberate,
// and it is only good design if the game says so before the party leaves. The
// original complaint was precisely an invisible one: Tier 11 fine, Tier 12
// impossible, nothing on screen to explain the difference.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Puts the whole roster at a level and rebuilds the panel. */
async function atLevel(page, level, tier) {
  return page.evaluate(async ([lv, t]) => {
    const { G } = await import('./src/state.js');
    const { refreshSheets } = await import('./src/sheets.js');
    const { renderDispatch } = await import('./src/ui/expeditions.js');
    const { ui } = await import('./src/ui/state.js');
    for (const h of G.state.heroes) { h.level = lv; h.stamina = 100; }
    G.state.progress.highestTier = Math.max(G.state.progress.highestTier, t);
    ui.dispatchTier = t;
    refreshSheets();
    renderDispatch();
    const chip = document.querySelector('.ready');
    const send = document.querySelector('[data-send]');
    return {
      band: [...(chip?.classList ?? [])].find((c) => c.startsWith('ready-') && c !== 'ready-lv'
        && c !== 'ready-band' && c !== 'ready-gear') ?? null,
      text: chip?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      warned: !!send && send.classList.contains('warn-send'),
      title: send?.title ?? '',
      disabled: !!send?.disabled,
    };
  }, [level, tier]);
}

export default async function run(browser) {
  suite('readiness');
  const { page, errors } = await openGame(browser, { name: 'Readiness' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('the bands line up with where the arithmetic changes', async () => {
    const r = await page.evaluate(async () => {
      const { bandFor } = await import('./src/readiness.js');
      const { GAP_CLIFF } = await import('./src/expedition/balance.js');
      return {
        cliff: GAP_CLIFF,
        at: bandFor(0).id,
        over: bandFor(-4).id,
        five: bandFor(5).id,
        nine: bandFor(GAP_CLIFF - 1).id,
        cliffBand: bandFor(GAP_CLIFF).id,
        deep: bandFor(GAP_CLIFF + 20).id,
      };
    });
    eq(r.at, 'ready', 'at the content level');
    eq(r.over, 'ready', 'above the content level');
    eq(r.five, 'fair', 'five levels under');
    eq(r.nine, 'hard', `one level short of the cliff (${r.cliff})`);
    eq(r.cliffBand, 'wall', `exactly at the cliff (${r.cliff})`);
    eq(r.deep, 'wall', 'far past the cliff');
    return `ready / fair / hard up to ${r.cliff - 1} under, wall from ${r.cliff}`;
  });

  await test('the dispatch panel says where the party stands', async () => {
    // Tier 9's enemies are level 30, which is the case from the report.
    const ready = await atLevel(page, 30, 9);
    const fair = await atLevel(page, 27, 9);
    const hard = await atLevel(page, 22, 9);
    const wall = await atLevel(page, 12, 9);

    eq(ready.band, 'ready-ready', `at level reads ${ready.band}`);
    eq(fair.band, 'ready-fair', `three under reads ${fair.band}`);
    eq(hard.band, 'ready-hard', `eight under reads ${hard.band}`);
    eq(wall.band, 'ready-wall', `eighteen under reads ${wall.band}`);
    ok(ready.text.includes('30'), `the chip does not name the levels: "${ready.text}"`);
    ok(wall.text.includes('12') && wall.text.includes('30'),
      `the chip does not compare the two levels: "${wall.text}"`);
    return `"${wall.text}"`;
  });

  await test('a party being sent at a wall is warned, never blocked', async () => {
    const wall = await atLevel(page, 12, 9);
    const ready = await atLevel(page, 30, 9);
    ok(!wall.disabled, 'the Send button was disabled — this is advice, not a rule');
    ok(wall.warned, 'no warning on a Send button pointed at a wall');
    ok(!ready.warned, 'a party at level was warned about nothing');
    ok(/miss/i.test(wall.title), `the warning does not say what happens: "${wall.title}"`);
    return 'marked and explained, and still perfectly possible to press';
  });

  await test('empty slots and outdated gear are called out too', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { readiness } = await import('./src/readiness.js');
      const { renderDispatch } = await import('./src/ui/expeditions.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const { ui } = await import('./src/ui/state.js');

      for (const h of G.state.heroes) {
        for (const slot of EQUIP_SLOTS) h.equipment[slot] = null;
        h.level = 30;
      }
      ui.dispatchTier = 9;
      refreshSheets();
      renderDispatch();
      const bare = readiness(G.state.parties[0], 9);
      return {
        empties: bare.empties,
        ilvl: bare.ilvl,
        shown: [...document.querySelectorAll('.ready-gear')].map((e) => e.textContent.trim()),
      };
    });
    ok(r.empties > 0, 'a bare party reported no empty slots');
    eq(r.ilvl, 0, 'a bare party reported an item level');
    ok(r.shown.some((t) => t.includes('empty')), `nothing said about empty slots: ${r.shown.join(' | ')}`);
    return `${r.empties} empty slots called out`;
  });

  await test('no page errors', async () => {
    eq(errors.length, 0, errors.join(' | '));
    return 'no page errors';
  });

  clean(page);
}
