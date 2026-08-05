// Achievements: the backend only. There is no interface for them yet.
//
// The two design decisions worth guarding are that progress is *derived* from
// the save rather than accumulated from events — so an old save is credited
// correctly the first time it is checked — and that a definition which throws
// cannot take the game down with it.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('achievements');
  const { page, errors } = await openGame(browser, { name: 'Achievements' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('every definition is well formed and cheap to ask', async () => {
    const r = await page.evaluate(async () => {
      const { ACHIEVEMENTS, CATEGORIES } = await import('./src/data/achievements.js');
      const { G } = await import('./src/state.js');
      const cats = new Set(CATEGORIES.map((c) => c.id));
      const bad = [];
      const seen = new Set();
      const started = performance.now();
      for (const a of ACHIEVEMENTS) {
        if (seen.has(a.id)) bad.push(`${a.id}: duplicate id`);
        seen.add(a.id);
        if (!a.name || !a.desc) bad.push(`${a.id}: no name or description`);
        if (!cats.has(a.category)) bad.push(`${a.id}: unknown category ${a.category}`);
        if (!(a.goal > 0)) bad.push(`${a.id}: goal is ${a.goal}`);
        if (typeof a.progress !== 'function') bad.push(`${a.id}: no progress function`);
        else {
          try {
            const v = a.progress(G.state);
            if (typeof v !== 'number' || Number.isNaN(v)) bad.push(`${a.id}: progress is ${v}`);
          } catch (e) { bad.push(`${a.id}: progress threw ${e.message}`); }
        }
      }
      return { bad, count: ACHIEVEMENTS.length, ms: performance.now() - started };
    });
    eq(r.bad.length, 0, r.bad.slice(0, 5).join('; '));
    ok(r.ms < 50, `one sweep took ${r.ms.toFixed(1)}ms — too slow to poll`);
    return `${r.count} achievements, one sweep in ${r.ms.toFixed(1)}ms`;
  });

  await test('progress is read from the save, not counted from events', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { ACHIEVEMENT_BY_ID } = await import('./src/data/achievements.js');
      const { progressOf, fractionOf } = await import('./src/achievements.js');
      const def = ACHIEVEMENT_BY_ID.tier_ten;
      const before = progressOf(def);
      // Reach in and change the world. Nothing is emitted, no event fires.
      G.state.progress.highestTier = 10;
      const after = progressOf(def);
      G.state.progress.highestTier = 40;
      return { before, after, clamped: progressOf(def), fraction: fractionOf(def) };
    });
    eq(r.before, 0, 'progress was not zero on a fresh guild');
    eq(r.after, 10, 'progress did not follow the state');
    eq(r.clamped, 10, `progress ran past its goal to ${r.clamped}`);
    eq(r.fraction, 1, 'a completed achievement is not at 100%');
    return 'derived from state, clamped at the goal';
  });

  await test('a sweep unlocks what has arrived, once', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkAchievements, isUnlocked, unlockedCount } = await import('./src/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.progress.highestTier = 0;
      G.state.stats.runs = 0;
      checkAchievements();
      const atStart = unlockedCount();

      G.state.stats.runs = 1;
      const first = checkAchievements();
      const again = checkAchievements();
      return {
        atStart, first, again,
        got: isUnlocked('first_steps'),
        stamped: typeof G.state.achievements.unlocked.first_steps === 'number',
      };
    });
    ok(r.first.includes('first_steps'), `the first run unlocked ${JSON.stringify(r.first)}`);
    eq(r.again.length, 0, 'a second sweep unlocked the same thing again');
    ok(r.got, 'the achievement is not recorded as unlocked');
    ok(r.stamped, 'no timestamp was stored');
    return `unlocked on the sweep that earned it, and not again`;
  });

  await test('rewards are paid once, on unlock', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkAchievements } = await import('./src/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.guild.echoes = 0;
      G.state.progress.highestTier = 30;
      checkAchievements();
      const afterFirst = G.state.guild.echoes;
      checkAchievements();
      return { afterFirst, afterSecond: G.state.guild.echoes };
    });
    ok(r.afterFirst > 0, 'an achievement with a reward paid nothing');
    eq(r.afterSecond, r.afterFirst, 'the reward was paid twice');
    return `${r.afterFirst} Echo Stones, paid once`;
  });

  await test('an old save is credited quietly for what it already did', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { backfill, unlockedCount, takePending } = await import('./src/achievements.js');
      // A guild that has plainly been playing for a long time, but has never
      // had achievements checked — exactly what loading an older save looks like.
      G.state.achievements = { unlocked: {} };
      G.state.guild.echoes = 0;
      G.state.stats.runs = 250;
      G.state.progress.highestTier = 22;
      G.state.stats.raidKills = 4;
      takePending();
      const gained = backfill();
      return {
        gained,
        total: unlockedCount(),
        pending: takePending().length,
        echoes: G.state.guild.echoes,
      };
    });
    ok(r.gained >= 4, `backfill only credited ${r.gained} achievements`);
    eq(r.pending, 0, 'backfill queued pop-ups for things done long ago');
    eq(r.echoes, 0, 'backfill paid out rewards retroactively');
    return `${r.gained} credited silently, no rewards, no notifications`;
  });

  await test('a broken definition cannot take the game down', async () => {
    const r = await page.evaluate(async () => {
      const { ACHIEVEMENTS } = await import('./src/data/achievements.js');
      const { progressOf, checkAchievements } = await import('./src/achievements.js');
      const landmine = {
        id: '__test_landmine', name: 'Landmine', desc: 'Throws.',
        category: 'guild', goal: 1, progress: () => { throw new Error('boom'); },
      };
      ACHIEVEMENTS.push(landmine);
      let threw = false;
      let value = null;
      try { value = progressOf(landmine); checkAchievements(); } catch (e) { threw = true; }
      ACHIEVEMENTS.pop();
      return { threw, value };
    });
    ok(!r.threw, 'a throwing progress function propagated out of the sweep');
    eq(r.value, 0, `a broken definition reported ${r.value} instead of no progress`);
    return 'reported as no progress, sweep continued';
  });

  await test('the sweep is polled, not hooked, and runs on its own', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { tickAchievements, isUnlocked, CHECK_INTERVAL } = await import('./src/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.heroes.length = 0;
      const { rollHero } = await import('./src/heroes.js');
      for (let i = 0; i < 8; i++) G.state.heroes.push(rollHero({ classId: 'rogue', rarity: 'common' }));
      // Nothing emitted an event. Only time passing should find this.
      tickAchievements(CHECK_INTERVAL + 0.1);
      return { got: isUnlocked('a_real_company'), interval: CHECK_INTERVAL };
    });
    ok(r.got, 'the polled sweep did not notice a change nothing announced');
    return `swept every ${r.interval}s without needing an event`;
  });

  await test('unlocks survive a save and load', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const Save = await import('./src/save.js');
      const { checkAchievements } = await import('./src/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.stats.runs = 1;
      checkAchievements();
      const before = Object.keys(G.state.achievements.unlocked).length;
      const restored = Save.deserialize(JSON.parse(atob(Save.exportSave())));
      return { before, after: Object.keys(restored.achievements?.unlocked ?? {}).length };
    });
    ok(r.before > 0, 'nothing was unlocked to save');
    eq(r.after, r.before, 'unlocks did not survive the round trip');
    return `${r.before} unlocks through a save and load`;
  });

  await test('the list the interface will read is complete', async () => {
    const r = await page.evaluate(async () => {
      const { achievementList } = await import('./src/achievements.js');
      const { ACHIEVEMENTS } = await import('./src/data/achievements.js');
      const list = achievementList();
      const shaped = list.every((x) => x.def && typeof x.unlocked === 'boolean'
        && typeof x.progress === 'number' && typeof x.fraction === 'number');
      return { count: list.length, total: ACHIEVEMENTS.length, shaped };
    });
    eq(r.count, r.total, 'the list is missing achievements');
    ok(r.shaped, 'a list entry is missing progress or unlock state');
    return `${r.count} entries, each with live progress`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
