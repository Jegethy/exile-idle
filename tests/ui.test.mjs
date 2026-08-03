// Panel rendering, the crafting bench, and the dispatch list's layout budget.
// The layout tests exist because a smaller window once crushed the centre
// panel to 400px and the dungeon list needed scrolling to show one card.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('interface');
  const { page, errors } = await openGame(browser, { name: 'Interface' });

  await test('roster, parties and raids render', async () => {
    const r = await page.evaluate(() => ({
      heroes: document.querySelectorAll('.hero-card').length,
      dungeons: document.querySelectorAll('.dungeon').length,
    }));
    eq(r.heroes, 3, 'starter heroes');
    ok(r.dungeons > 0, 'no dungeons rendered');
    return `${r.heroes} heroes, ${r.dungeons} dungeons`;
  });

  await test('starter heroes are all Common', async () => {
    const rarities = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      return G.state.heroes.map((h) => h.rarity);
    });
    ok(rarities.every((r_) => r_ === 'common'), `got ${rarities.join(', ')}`);
    return rarities.join(', ');
  });

  await test('the vault shows category and sub-type', async () => {
    const label = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      addToVault(createItem({ ilvl: 30, rarity: 'rare', baseId: 'axe2h' }), { noAutoSalvage: true });
      const { renderAll } = await import('./src/ui.js');
      renderAll();
      const row = document.querySelector('#vaultGrid [data-uid]');
      return row?.textContent.replace(/\s+/g, ' ').trim() ?? '';
    });
    ok(/weapon/i.test(label), `no category in "${label}"`);
    return label.slice(0, 60);
  });

  await test('the workshop renders materials and recipes', async () => {
    await page.click('[data-tab="workshop"], [data-tab="orbs"]');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      materials: document.querySelectorAll('[data-mat]').length,
      recipes: document.querySelectorAll('[data-recipe]').length,
      flasks: document.querySelectorAll('[data-flask]').length,
    }));
    ok(r.materials > 0, 'no materials rendered');
    ok(r.recipes > 0, 'no recipes rendered');
    return `${r.materials} materials, ${r.recipes} recipes, ${r.flasks} flasks`;
  });

  await test('Escape cancels a selected recipe without throwing', async () => {
    await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      for (const m of Object.keys(G.state.materials)) G.state.materials[m] = 500;
    });
    const recipe = await page.$('[data-recipe]');
    if (recipe) { await recipe.click(); await page.waitForTimeout(200); }
    const mark = errors.length;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    ok(errors.length === mark, `Escape threw: ${errors.slice(mark).join(' | ')}`);
    // .craft-banner is a shared style class (the gear-a-hero banner uses it
    // too), so assert on the crafting banner's own id.
    const cleared = await page.evaluate(() => ({
      banner: !document.querySelector('#vaultCraftBanner'),
      selected: !document.querySelector('.recipe.selected'),
    }));
    ok(cleared.selected, 'Escape did not deselect the recipe');
    ok(cleared.banner, 'Escape left the crafting banner on screen');
    return 'recipe cleared, no error';
  });

  await test('dispatch filters cover every dungeon', async () => {
    await page.click('[data-tab="expeditions"]');
    await page.waitForTimeout(300);
    const r = await page.evaluate(async () => {
      const { DUNGEONS, DUNGEON_CATEGORIES, dungeonsIn } = await import('./src/data/dungeons.js');
      const covered = new Set();
      for (const c of DUNGEON_CATEGORIES) {
        if (c.id === 'all') continue;
        for (const d of dungeonsIn(c.id)) covered.add(d.id);
      }
      return { total: DUNGEONS.length, covered: covered.size,
        buttons: document.querySelectorAll('[data-dfilter]').length };
    });
    eq(r.covered, r.total, 'dungeons reachable through a category');
    eq(r.buttons, 5, 'filter buttons');
    return `${r.covered}/${r.total} dungeons across ${r.buttons} filters`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();

  // ---- Layout budget, at the sizes that used to break ---------------------
  for (const [w, h] of [[1180, 900], [900, 700], [1600, 900]]) {
    const { page: p2, errors: e2 } = await openGame(browser, {
      name: 'Layout', viewport: { width: w, height: h },
    });
    await test(`a filtered category needs no inner scroll at ${w}x${h}`, async () => {
      const worst = await p2.evaluate(async () => {
        const out = [];
        for (const f of ['gold', 'gear', 'xp']) {
          document.querySelector(`[data-dfilter="${f}"]`).click();
          await new Promise((r) => setTimeout(r, 120));
          const top = document.querySelector('.exped-top');
          out.push({ f, over: Math.max(0, top.scrollHeight - top.clientHeight) });
        }
        return out.sort((a, b) => b.over - a.over)[0];
      });
      eq(worst.over, 0, `"${worst.f}" overflowed`);
      return 'no overflow on any single-focus category';
    });
    await test(`no page errors at ${w}x${h}`, () => clean(e2));
    await p2.close();
  }
}
