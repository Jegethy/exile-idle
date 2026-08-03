// Time must keep moving when the tab is not in front. A browser stops calling
// requestAnimationFrame in a background tab, and the loop used to clamp any
// gap to a quarter of a second on top of that — so an idle game stopped being
// idle the moment you looked away, and threw away the time as well.

import { openGame } from './harness.mjs';
import { suite, test, ok, clean } from './assert.mjs';

export default async function run(browser) {
  suite('background and offline progress');
  const { page, errors } = await openGame(browser, { name: 'Offline' });

  await test('a long gap is replayed, not discarded', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch } = await import('./src/expedition.js');
      const { rewindClockForTest } = await import('./src/game.js');
      const { refreshSheets } = await import('./src/sheets.js');
      for (const h of G.state.heroes) { h.stamina = 100; h.level = 20; }
      refreshSheets();
      dispatch(G.state.parties[0].id, 'mines', 1);
      const before = G.state.expeditions[0].elapsed;
      // Two minutes away.
      rewindClockForTest(120);
      const run_ = G.state.expeditions[0];
      return {
        before,
        after: run_ ? run_.elapsed : null,
        finished: !run_,
        runs: G.state.stats.runs,
      };
    });
    ok(r.finished || r.after - r.before > 10,
      `only ${(r.after - r.before).toFixed(1)}s of two minutes was simulated`);
    return r.finished ? `the run completed while away (${r.runs} clear)` : `${r.after.toFixed(0)}s simulated`;
  });

  await test('the catch-up is bounded so the page never locks up', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { rewindClockForTest } = await import('./src/game.js');
      G.state.settings.autoRedeploy = true;
      G.state.upgrades.autoDispatch = 1;
      const t0 = performance.now();
      rewindClockForTest(12 * 3600);        // twelve hours
      return { ms: performance.now() - t0, playtime: G.state.playtime };
    });
    ok(r.ms < 6000, `catching up took ${Math.round(r.ms)}ms — that would freeze the page`);
    return `twelve hours replayed in ${Math.round(r.ms)}ms`;
  });

  await test('returning to the tab does not reset the clock', async () => {
    // The old visibilitychange handler set `last = now`, throwing away every
    // second spent elsewhere. Simulate hide/show and confirm time is credited.
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const before = G.state.playtime;
      const { rewindClockForTest } = await import('./src/game.js');
      document.dispatchEvent(new Event('visibilitychange'));
      rewindClockForTest(60);
      return { gained: G.state.playtime - before };
    });
    ok(r.gained > 30, `only ${r.gained.toFixed(1)}s credited for a minute away`);
    return `${r.gained.toFixed(0)}s of a minute credited`;
  });

  await test('offline progress needs Standing Orders and the toggle', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const Save = await import('./src/save.js');
      const { enterGuild } = await import('./src/game.js');
      const out = {};
      for (const [label, unlocked] of [['locked', 0], ['unlocked', 1]]) {
        G.state.upgrades.autoDispatch = unlocked;
        G.state.settings.autoRedeploy = true;
        G.state.parties[0].lastRun = { dungeonId: 'mines', tier: 1 };
        for (const h of G.state.heroes) h.stamina = 100;
        // Pretend the save is an hour old.
        Object.defineProperty(G.state, '__savedAt', {
          value: Date.now() - 3600 * 1000, writable: true, configurable: true, enumerable: false,
        });
        const before = G.state.stats.runs;
        enterGuild(G.slot);
        out[label] = G.state.stats.runs - before;
      }
      return out;
    });
    ok(r.locked === 0, `ran ${r.locked} expeditions without the unlock`);
    ok(r.unlocked > 0, 'no expeditions ran offline even with the unlock');
    return `${r.locked} runs locked, ${r.unlocked} runs unlocked`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
