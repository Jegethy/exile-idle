// Loot is held by the party until they walk out. A wipe forfeits it; a clear
// and a recall both bank it. These tests guard the escrow against anything
// that reintroduces per-kill banking.
//
// Each check gets its own page. Sharing one made the suite flaky: a run left
// alive by an earlier check changed what the next one was looking at.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/**
 * A fresh game with the live loop stopped and two helpers installed:
 * `__snapshot()` covers every pot a run could leak into, and `__launch()` puts
 * a strong party underground at a tier they survive but cannot clear quickly.
 */
async function fresh(browser, name) {
  const { page, errors } = await openGame(browser, { name });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    const { dispatch, tickAll } = await import('./src/expedition.js');
    const { refreshSheets } = await import('./src/sheets.js');

    // These tests drive the clock themselves; leaving the real loop running as
    // well means runs advance between assertions.
    G.paused = true;

    window.__snapshot = () => JSON.stringify({
      gold: G.state.guild.gold,
      seals: G.state.guild.seals ?? 0,
      vault: G.state.vault.length,
      materials: G.state.materials,
      gearFound: G.state.stats.gearFound,
      uniques: G.state.stats.uniquesFound,
      heroes: G.state.heroes.map((h) => `${h.level}:${Math.round(h.xp)}`),
    });

    /**
     * @returns the live run once it is carrying gold, or null.
     *
     * Tier 8 is chosen from measurement, not taste: an ungeared level-60 party
     * lands its first kill within ~450 ticks there and never finishes the
     * dungeon, so the run is reliably both productive and still in progress.
     * Tier 10 took up to 844 ticks to land a kill, which is what made this
     * suite flaky.
     */
    window.__launch = () => {
      for (const h of G.state.heroes) { h.stamina = 100; h.level = 60; }
      refreshSheets();
      dispatch(G.state.parties[0].id, 'mines', 8);
      const run = G.state.expeditions[0];
      if (!run) return null;
      for (let i = 0; i < 2000 && G.state.expeditions.length; i++) {
        tickAll(0.1);
        if (run.haul.gold > 0) break;
      }
      return G.state.expeditions.length ? run : null;
    };
  });
  return { page, errors };
}

export default async function run(browser) {
  suite('loot escrow');

  {
    const { page, errors } = await fresh(browser, 'InFlight');
    await test('nothing banks while the party is still in the field', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { tickAll } = await import('./src/expedition.js');
        const run_ = window.__launch();
        if (!run_) return { inconclusive: true };
        const before = window.__snapshot();
        for (let i = 0; i < 60 && G.state.expeditions.length; i++) tickAll(0.1);
        if (!G.state.expeditions.length) return { inconclusive: true };
        return {
          leaked: before !== window.__snapshot(),
          carried: Math.round(run_.haul.gold) + run_.haul.items.length,
        };
      });
      ok(!r.inconclusive, 'the run ended before it could be observed');
      ok(r.carried > 0, 'the party gathered nothing, so this proves nothing');
      ok(!r.leaked, 'guild state changed while the party was still underground');
      return `carrying ${r.carried} units of loot, guild untouched`;
    });
    await test('no page errors', () => clean(errors));
    await page.close();
  }

  {
    const { page, errors } = await fresh(browser, 'Wipe');
    await test('a wipe forfeits every kind of reward, and says so', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { tickAll } = await import('./src/expedition.js');
        const run_ = window.__launch();
        if (!run_) return { inconclusive: true };
        const carried = {
          gold: Math.round(run_.haul.gold),
          items: run_.haul.items.length,
          heroes: Object.keys(run_.haul.heroXp).length,
        };
        const failedBefore = G.state.stats.runsFailed;
        const before = window.__snapshot();
        for (const c of run_.combatants) { c.life = 0; c.down = true; }
        tickAll(0.1);
        return {
          carried,
          leaked: before !== window.__snapshot(),
          failed: G.state.stats.runsFailed - failedBefore,
          line: G.state.log.map((l) => l.text ?? l.msg ?? '')
            .find((t) => /Everything they were carrying is lost/i.test(t)) ?? '',
        };
      });
      ok(!r.inconclusive, 'the run ended before it could be wiped');
      ok(r.carried.gold > 0, 'nothing was carried, so nothing was at stake');
      ok(!r.leaked, 'a wiped party still delivered loot to the guild');
      eq(r.failed, 1, 'failed runs recorded');
      ok(r.line, 'the log never named what was lost');
      return `dropped ${r.carried.gold}g / ${r.carried.items} items / xp for ${r.carried.heroes} heroes`;
    });
    await test('no page errors', () => clean(errors));
    await page.close();
  }

  {
    const { page, errors } = await fresh(browser, 'Clear');
    await test('a cleared run banks everything', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { dispatch, tickAll } = await import('./src/expedition.js');
        const { refreshSheets } = await import('./src/sheets.js');
        for (const h of G.state.heroes) { h.stamina = 100; h.level = 60; }
        refreshSheets();
        const before = {
          gold: G.state.guild.gold, vault: G.state.vault.length, runs: G.state.stats.runs,
        };
        dispatch(G.state.parties[0].id, 'mines', 1);
        for (let i = 0; i < 6000 && G.state.expeditions.length; i++) tickAll(0.1);
        return {
          runs: G.state.stats.runs - before.runs,
          gold: G.state.guild.gold - before.gold,
          vault: G.state.vault.length - before.vault,
        };
      });
      eq(r.runs, 1, 'completed runs');
      ok(r.gold > 0, 'a cleared run paid no gold');
      return `+${r.gold} gold, +${r.vault} vault items`;
    });
    await test('no page errors', () => clean(errors));
    await page.close();
  }

  {
    const { page, errors } = await fresh(browser, 'Recall');
    await test('recall banks what the party carried', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { recall } = await import('./src/expedition.js');
        const run_ = window.__launch();
        if (!run_) return { inconclusive: true };
        const before = G.state.guild.gold;
        const carried = Math.round(run_.haul.gold);
        recall(run_.id);
        return { carried, banked: G.state.guild.gold - before };
      });
      ok(!r.inconclusive, 'the run ended before it could be recalled');
      ok(r.carried > 0, 'nothing was carried, so nothing was at stake');
      ok(r.banked >= r.carried, `carried ${r.carried}, banked only ${r.banked}`);
      return `carried ${r.carried}g, banked ${r.banked}g`;
    });
    await test('no page errors', () => clean(errors));
    await page.close();
  }
}
