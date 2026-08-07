// Coverage for the panels that the rest of the suite does not touch, so that
// moving rendering code between modules is verified rather than hoped for.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('panels');
  const { page, errors } = await openGame(browser, { name: 'Panels' });

  // Enough resources that every panel has something to draw.
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    const { createItem } = await import('./src/items.js');
    const { addToVault } = await import('./src/inventory.js');
    const { refreshSheets } = await import('./src/sheets.js');
    G.state.guild.gold = 5_000_000;
    G.state.guild.seals = 20;
    for (const m of Object.keys(G.state.materials)) G.state.materials[m] = 500;
    for (const rarity of ['normal', 'magic', 'rare']) {
      addToVault(createItem({ ilvl: 40, rarity }), { noAutoSalvage: true });
    }
    addToVault(createItem({ ilvl: 70, rarity: 'unique', uniqueId: 'bulwark' }), { noAutoSalvage: true });
    refreshSheets();
    const { renderAll } = await import('./src/ui.js');
    renderAll();
  });

  await test('the raids tab lists every raid with its gate', async () => {
    await page.click('[data-tab="raids"]');
    await page.waitForTimeout(250);
    const r = await page.evaluate(async () => {
      const { RAIDS } = await import('./src/data/dungeons.js');
      const cards = document.querySelectorAll('#tab-raids .boss-card');
      return { rendered: cards.length, defined: RAIDS.length,
        mentionsSeals: /seal/i.test(document.querySelector('#tab-raids').textContent) };
    });
    eq(r.rendered, r.defined, 'raid cards');
    ok(r.mentionsSeals, 'raids never mention their Seal cost');
    return `${r.rendered} raids, seal costs shown`;
  });

  await test('the guild hall lists purchasable upgrades', async () => {
    await page.click('[data-tab="hall"]');
    await page.waitForTimeout(250);
    const r = await page.evaluate(async () => {
      const { UPGRADES } = await import('./src/data/upgrades.js');
      return {
        rendered: document.querySelectorAll('[data-upgrade]').length,
        defined: UPGRADES.length,
      };
    });
    eq(r.rendered, r.defined, 'upgrade rows');
    return `${r.rendered} upgrades`;
  });

  await test('buying an upgrade spends gold and takes effect', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const before = { gold: G.state.guild.gold, ranks: { ...G.state.upgrades } };
      // [data-buy] is the actual button; [data-upgrade] is the card around it.
      const btn = document.querySelector('.upgrade.afford [data-buy]:not([disabled])');
      const id = btn?.dataset.buy;
      btn?.click();
      return { id, spent: before.gold - G.state.guild.gold,
        rank: (G.state.upgrades[id] ?? 0) - (before.ranks[id] ?? 0) };
    });
    ok(r.id, 'no affordable upgrade to buy');
    eq(r.rank, 1, 'rank gained');
    ok(r.spent > 0, 'the upgrade was free');
    return `${r.id} +1 rank for ${r.spent} gold`;
  });

  await test('the collection records uniques that have been found', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { UNIQUES } = await import('./src/data/uniques.js');
      G.state.collection.bulwark = 1;
      const { renderAll } = await import('./src/ui.js');
      renderAll();
      const host = document.querySelector('#collectionGrid, #tab-hall');
      return {
        total: UNIQUES.length,
        found: /Bulwark/i.test(host?.textContent ?? ''),
      };
    });
    ok(r.found, 'a collected unique is not shown in the collection');
    return `collection renders (${r.total} uniques defined)`;
  });

  await test('the item menu opens for a vault item', async () => {
    await page.click('[data-tab="vault"]');
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const cell = document.querySelector('#vaultGrid [data-uid]');
      cell?.click();
      const modal = document.querySelector('#modalItem');
      return {
        open: modal && !modal.classList.contains('hidden'),
        title: document.querySelector('#itemMenuTitle')?.textContent ?? '',
        actions: document.querySelectorAll('#itemMenuBody button, #itemMenuBody [data-act]').length,
      };
    });
    ok(r.open, 'the item menu did not open');
    ok(r.actions > 0, 'the item menu has no actions');
    return `${r.title} — ${r.actions} actions`;
  });

  await test('the settings modal opens and toggles persist', async () => {
    await page.evaluate(() => document.querySelector('.modal-close')?.click());
    await page.waitForTimeout(150);
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      document.querySelector('#btnSettings').click();
      const modal = document.querySelector('#modalSettings');
      const row = document.querySelector('#modalSettings [data-set]');
      const key = row?.dataset.set;
      const before = key ? G.state.settings[key] : null;
      row?.click();
      return {
        open: modal && !modal.classList.contains('hidden'),
        key, before, after: key ? G.state.settings[key] : null,
      };
    });
    ok(r.open, 'settings did not open');
    ok(r.key, 'no toggles in settings');
    ok(r.before !== r.after, `toggle "${r.key}" did not change`);
    return `${r.key}: ${r.before} -> ${r.after}`;
  });

  await test('the saves modal exports a save', async () => {
    const r = await page.evaluate(() => {
      // Reached from Settings now, not from a button in the top bar: there is
      // almost never a reason to save by hand, so it does not deserve the
      // permanent space.
      document.querySelector('.modal-close')?.click();
      document.querySelector('#btnSettings').click();
      document.querySelector('#btnOpenSaves').click();
      document.querySelector('#btnExport').click();
      const box = document.querySelector('#saveText');
      return { open: !document.querySelector('#modalSaves').classList.contains('hidden'),
        chars: box?.value.length ?? 0 };
    });
    ok(r.open, 'saves modal did not open');
    ok(r.chars > 100, `export produced ${r.chars} characters`);
    return `exported ${r.chars} chars`;
  });

  await test('the roster sorts as a view, and never rewrites your order', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { rollHero } = await import('./src/heroes.js');
      const { rosterView, moveHero } = await import('./src/ui/roster.js');
      const { refreshSheets } = await import('./src/sheets.js');

      G.state.heroes.length = 0;
      for (const [name, lvl] of [['Cass', 5], ['Adin', 40], ['Bree', 20]]) {
        const h = rollHero({ classId: 'archer', rarity: 'common' });
        h.name = name; h.level = lvl;
        G.state.heroes.push(h);
      }
      refreshSheets();
      const stored = () => G.state.heroes.map((h) => h.name).join(',');
      const before = stored();
      const view = (sort) => rosterView(G.state.heroes, sort).map((h) => h.name).join(',');

      const byLevel = view('level');
      const byName = view('name');
      const custom = view('custom');
      const untouched = stored() === before;

      // Dragging edits the stored order itself, which is what Custom shows.
      moveHero(G.state.heroes.find((h) => h.name === 'Bree').uid,
        G.state.heroes.find((h) => h.name === 'Cass').uid);
      return { before, byLevel, byName, custom, untouched, afterDrag: stored() };
    });
    eq(r.byLevel, 'Adin,Bree,Cass', `by level: ${r.byLevel}`);
    eq(r.byName, 'Adin,Bree,Cass', `by name: ${r.byName}`);
    eq(r.custom, r.before, 'Custom is not the stored order');
    ok(r.untouched, 'sorting the view reorganised the roster underneath it');
    eq(r.afterDrag, 'Bree,Cass,Adin', `dragging left the order as ${r.afterDrag}`);
    return `sorted views over a stored order of ${r.before}, drag moved it to ${r.afterDrag}`;
  });

  await test('the Guild Hall overview reports what the guild has done', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { renderHall } = await import('./src/ui/hall.js');
      const { gotoTab } = await import('./src/ui/shell.js');
      G.state.stats.runs = 40;
      G.state.stats.runsFailed = 10;
      G.state.stats.kills = 1234;
      G.state.progress.highestTier = 12;
      gotoTab('hall');
      renderHall();
      const host = document.querySelector('#hallOverview');
      const text = host.textContent.replace(/\s+/g, ' ');
      return {
        groups: host.querySelectorAll('.ledger-group').length,
        cells: host.querySelectorAll('.ledger-cell').length,
        // 40 cleared of 50 attempted.
        clearRate: text.includes('80%'),
        deepest: text.includes('Deepest tier'),
        kills: text.includes('1,234') || text.includes('1234'),
        // The four sub-tabs, and only one of them showing at a time.
        tabs: document.querySelectorAll('#tab-hall > .tabs.sub .tab').length,
        active: document.querySelectorAll('#tab-hall > .tab-body.active').length,
      };
    });
    ok(r.groups >= 4, `only ${r.groups} groups on the overview`);
    ok(r.cells >= 24, `only ${r.cells} figures on the overview`);
    ok(r.clearRate, 'the clear rate is not derived from runs and wipes');
    ok(r.deepest, 'the deepest tier is not reported');
    ok(r.kills, 'the kill count is not reported');
    eq(r.tabs, 4, `${r.tabs} sub-tabs in the Guild Hall`);
    eq(r.active, 1, `${r.active} hall sub-panels showing at once`);
    return `${r.cells} figures across ${r.groups} groups, behind ${r.tabs} sub-tabs`;
  });

  /**
   * You are shown the expedition you just started.
   *
   * The run cards sit at the top of a scrolling column, above a dispatch board
   * tall enough to need scrolling at any ordinary window size — so reaching the
   * lower dungeons means scrolling down, and a card inserted *above* the scroll
   * position does not bring the view with it. Browsers deliberately anchor the
   * scroll to whatever you were already looking at, which here means the run
   * you asked for appears entirely off the top of the panel and stays there.
   *
   * This was reported as a tutorial bug and is not one: it hit anybody who
   * scrolled the dispatch board, at every window size where the board scrolls
   * at all, including 1920x1080.
   */
  await test('dispatching from a scrolled board still shows the run', async () => {
    const sizes = [[1920, 1080], [1440, 900], [1280, 800]];
    const out = [];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { assignToParty } = await import('./src/heroes.js');
        const { gotoTab } = await import('./src/ui/shell.js');
        const { renderAll } = await import('./src/ui.js');
        G.state.progress.highestTier = 12;
        while (G.state.expeditions.length) G.state.expeditions.pop();
        for (const h of G.state.heroes) {
          h.stamina = 100;
          assignToParty(h.uid, G.state.parties[0].id);
        }
        gotoTab('expeditions');
        renderAll();
      });
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const scroller = document.querySelector('.exped-top');
        // All the way down, as a player reaching the last dungeon card would.
        scroller.scrollTop = scroller.scrollHeight;
        const scrolled = scroller.scrollTop;
        const btns = [...document.querySelectorAll('#dispatchPanel [data-send]:not([disabled])')];
        btns[btns.length - 1]?.click();
        return { scrolled, sent: btns.length > 0 };
      });
      ok(r.sent, `${width}x${height}: no dungeon could be dispatched`);
      // The reveal waits a frame for layout, so give it one.
      await page.waitForTimeout(250);
      const seen = await page.evaluate(() => {
        const scroller = document.querySelector('.exped-top');
        const cards = document.querySelectorAll('#activeRuns .run-card');
        const card = cards[cards.length - 1];
        if (!card) return { visible: 0, missing: true };
        const box = scroller.getBoundingClientRect();
        const rect = card.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top));
        return { visible: Math.round((overlap / rect.height) * 100), missing: false };
      });
      ok(!seen.missing, `${width}x${height}: no run card was rendered at all`);
      ok(seen.visible >= 90,
        `${width}x${height}: the run card is ${seen.visible}% visible after dispatching `
        + `from a board scrolled to ${r.scrolled}px`);
      out.push(`${width}x${height} ${seen.visible}%`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    return out.join(', ');
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
