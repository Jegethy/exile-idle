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

  await test('no page errors', () => clean(errors));
  await page.close();
}
