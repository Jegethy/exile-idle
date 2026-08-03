// Hero stat sheets are cached in G.sheets. This suite exists because that
// cache was once never rebuilt: equipping an item redrew the roster from stale
// numbers, so an 81-evasion body armour kept reading 38 forever.

import { openGame } from './harness.mjs';
import { suite, test, ok, clean } from './assert.mjs';

export default async function run(browser) {
  suite('stat sheets');
  const { page, errors } = await openGame(browser, { name: 'Sheets' });

  await test('equipping a weapon moves DPS', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { equipOnHero } = await import('./src/heroes.js');
      const { addToVault } = await import('./src/inventory.js');
      const hero = G.state.heroes[1];
      const before = G.sheets[hero.uid].dps;
      const axe = createItem({ ilvl: 60, rarity: 'rare', baseId: 'axe2h' });
      addToVault(axe, { noAutoSalvage: true });
      equipOnHero(hero.uid, axe.uid);
      return { before, after: G.sheets[hero.uid].dps };
    });
    ok(r.after > r.before * 2, `dps only moved ${r.before} -> ${r.after}`);
    return `${r.before.toFixed(1)} -> ${r.after.toFixed(1)}`;
  });

  await test('the roster DOM matches the sheet', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const hero = G.state.heroes[1];
      // By uid: two heroes can share a name fragment, and matching on text
      // picked the wrong card.
      const card = document.querySelector(`.hero-card[data-hero="${hero.uid}"]`);
      const shown = card?.textContent.replace(/\s+/g, ' ').match(/([\d.]+) dps/)?.[1];
      return { shown: Number(shown), sheet: G.sheets[hero.uid].dps, found: !!card };
    });
    ok(r.found, 'no card rendered for that hero');
    ok(Math.abs(r.shown - r.sheet) < 0.5, `DOM ${r.shown} vs sheet ${r.sheet}`);
    return `${r.shown} dps on screen`;
  });

  await test('armour piece moves evasion', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { equipOnHero } = await import('./src/heroes.js');
      const { addToVault } = await import('./src/inventory.js');
      const hero = G.state.heroes[0];
      const before = G.sheets[hero.uid].evasion;
      const body = createItem({ ilvl: 40, rarity: 'rare', baseId: 'body_ev' });
      addToVault(body, { noAutoSalvage: true });
      equipOnHero(hero.uid, body.uid);
      return { before, after: G.sheets[hero.uid].evasion };
    });
    ok(r.after > r.before, `evasion did not move: ${r.before} -> ${r.after}`);
    return `${r.before} -> ${r.after}`;
  });

  await test('unequipping takes the stats back off', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { unequipFromHero } = await import('./src/heroes.js');
      const hero = G.state.heroes[0];
      const before = G.sheets[hero.uid].evasion;
      unequipFromHero(hero.uid, 'body');
      return { before, after: G.sheets[hero.uid].evasion };
    });
    ok(r.after < r.before, `evasion did not drop: ${r.before} -> ${r.after}`);
    return `${r.before} -> ${r.after}`;
  });

  await test('levelling up rebuilds the sheet', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { grantHeroXp } = await import('./src/heroes.js');
      const hero = G.state.heroes[0];
      const before = { lv: hero.level, life: G.sheets[hero.uid].life };
      grantHeroXp(hero, 500000);
      return { before, lv: hero.level, life: G.sheets[hero.uid].life };
    });
    ok(r.lv > r.before.lv, 'hero did not level');
    ok(r.life > r.before.life, `life stale after level-up: ${r.before.life} -> ${r.life}`);
    return `lv ${r.before.lv}->${r.lv}, life ${r.before.life}->${r.life}`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
