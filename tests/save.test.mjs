// Saves: three slots, a title screen that never auto-loads, and a migration
// that recalls in-flight expeditions rather than deleting what they carried.

import { openGame, BASE_URL } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('saves');
  const { page, errors } = await openGame(browser, { name: 'Ironhold' });

  await test('a save round-trips through export/import', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const Save = await import('./src/save.js');
      const before = {
        heroes: G.state.heroes.length,
        names: G.state.heroes.map((h) => h.name).join(','),
        gold: G.state.guild.gold,
      };
      const blob = Save.exportSave();
      const restored = Save.deserialize(JSON.parse(atob(blob)));
      return {
        before, chars: blob.length,
        heroes: restored.heroes.length,
        names: restored.heroes.map((h) => h.name).join(','),
        gold: restored.guild.gold,
      };
    });
    eq(r.heroes, r.before.heroes, 'hero count');
    eq(r.names, r.before.names, 'hero names');
    eq(r.gold, r.before.gold, 'gold');
    return `${r.chars} chars, ${r.heroes} heroes preserved`;
  });

  await test('an in-flight expedition is recalled, not robbed', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const Save = await import('./src/save.js');
      dispatch(G.state.parties[0].id, 'mines', 2);
      const run_ = G.state.expeditions[0];
      // Stop while they are still underground: enough to gather, not to finish.
      for (let i = 0; i < 400 && G.state.expeditions.length && run_.haul.gold < 40; i++) tickAll(0.1);
      if (!G.state.expeditions.length) return { inconclusive: true };
      const carried = Math.round(run_.haul.gold);
      const goldBefore = G.state.guild.gold;
      const restored = Save.deserialize(JSON.parse(atob(Save.exportSave())));
      return {
        carried, goldBefore, restoredGold: restored.guild.gold,
        expeditions: restored.expeditions.length,
      };
    });
    ok(!r.inconclusive, 'run ended too early to observe');
    eq(r.expeditions, 0, 'expeditions should not survive a load');
    ok(r.restoredGold >= r.goldBefore + r.carried,
      `haul was lost: carried ${r.carried}, ${r.goldBefore} -> ${r.restoredGold}`);
    return `carried ${r.carried}g through the reload`;
  });

  await test('an Exile Idle save is rejected, not mangled', async () => {
    const msg = await page.evaluate(async () => {
      const Save = await import('./src/save.js');
      try {
        Save.deserialize({ version: 9, state: { guild: {}, heroes: [] } });
        return 'accepted (wrong)';
      } catch (e) { return e.message; }
    });
    ok(/Exile Idle/i.test(msg), `unexpected message: ${msg}`);
    return msg.slice(0, 60);
  });

  // ---- Title screen and slots --------------------------------------------
  // Reload the *same* page: a new page gets its own storage, so only this
  // context has the guild that was just founded.
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await test('reloading returns to the title, not straight into the game', async () => {
    const r = await page.evaluate(() => ({
      exists: !!document.querySelector('#splash'),
      shown: !document.querySelector('#splash').classList.contains('hidden'),
    }));
    ok(r.exists, '#splash is missing from the page');
    ok(r.shown, 'the game auto-loaded instead of showing the title screen');
    return 'title screen shown, nothing auto-loaded';
  });

  await test('the saved guild is offered alongside empty slots', async () => {
    const r = await page.evaluate(() => ({
      resume: document.querySelectorAll('[data-play]').length,
      empty: document.querySelectorAll('[data-new]').length,
      names: [...document.querySelectorAll('.sl-name, .slot-name')].map((e) => e.textContent.trim()),
    }));
    eq(r.resume + r.empty, 3, 'total slots');
    eq(r.resume, 1, 'resumable saves');
    return `${r.resume} resumable, ${r.empty} empty`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
