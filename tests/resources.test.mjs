// Resources. The point of them is that a healer can no longer cast for ever:
// measured before this existed, a Cleric restored nearly three times the
// party's entire life pool over one tier-18 run.
//
// The rule that keeps it from being miserable to watch: ordinary attacks are
// always free. What runs out is the good option, not every option.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('resources');
  const { page, errors } = await openGame(browser, { name: 'Resources' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('every class runs on something, and pays for its ability', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const { CLASS_RESOURCE, RESOURCES } = await import('./src/data/resources.js');
      const problems = [];
      for (const c of HERO_CLASSES) {
        const kind = CLASS_RESOURCE[c.id];
        if (!kind) problems.push(`${c.id}: no resource`);
        else if (!RESOURCES[kind]) problems.push(`${c.id}: unknown resource ${kind}`);
      }
      const counts = {};
      for (const c of HERO_CLASSES) counts[CLASS_RESOURCE[c.id]] = (counts[CLASS_RESOURCE[c.id]] ?? 0) + 1;
      return { problems, counts };
    });
    eq(r.problems.length, 0, r.problems.join('; '));
    ok(r.counts.mana && r.counts.rage && r.counts.energy, `kinds in use: ${JSON.stringify(r.counts)}`);
    return `mana ${r.counts.mana}, rage ${r.counts.rage}, energy ${r.counts.energy}`;
  });

  await test('a healer runs out, and healing stops', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { spend, canAfford, initResource } = await import('./src/expedition/resource.js');
      const c = initResource({ classId: 'cleric' }, 'cleric');
      let casts = 0;
      while (spend(c, 'heal')) casts++;
      return { casts, afford: canAfford(c, 'heal'), left: c.resource.cur };
    });
    ok(r.casts > 15 && r.casts < 30, `a full pool bought ${r.casts} heals`);
    ok(!r.afford, 'an empty pool still affords a heal');
    return `${r.casts} heals from a full pool, then nothing`;
  });

  await test('it comes back, so running dry is a slowdown not a stop', async () => {
    const r = await page.evaluate(async () => {
      const { initResource, spend, tickResource, resourcePct } = await import('./src/expedition/resource.js');
      const c = initResource({ classId: 'cleric' }, 'cleric');
      while (spend(c, 'heal'));
      const empty = resourcePct(c);
      for (let i = 0; i < 100; i++) tickResource(c, 0.1);   // ten seconds
      const after = resourcePct(c);
      let casts = 0;
      while (spend(c, 'heal')) casts++;
      return { empty, after, casts };
    });
    ok(r.empty < 0.05, `pool should be spent, ${(r.empty * 100).toFixed(0)}% left`);
    ok(r.after > 0.1, `only ${(r.after * 100).toFixed(0)}% regenerated in ten seconds`);
    ok(r.casts >= 3, `ten seconds of regeneration bought only ${r.casts} heals`);
    return `ten seconds buys ${r.casts} more heals`;
  });

  await test('rage is earned by fighting, not given', async () => {
    const r = await page.evaluate(async () => {
      const { initResource, gain, canAfford } = await import('./src/expedition/resource.js');
      const c = initResource({ classId: 'warrior' }, 'warrior');
      const atStart = c.resource.cur;
      const couldOpen = canAfford(c, 'ability');
      for (let i = 0; i < 4; i++) gain(c, 'onTakeHit');
      return { atStart, couldOpen, afterFighting: c.resource.cur };
    });
    eq(r.atStart, 0, 'a tank should open a fight with no rage');
    ok(!r.couldOpen, 'rage should not be spendable before any is earned');
    ok(r.afterFighting > 0, 'taking hits earned no rage');
    return `0 at the start, ${r.afterFighting} after four hits taken`;
  });

  await test('an ability that cannot be paid for does not fire', async () => {
    const r = await page.evaluate(async () => {
      const { fireTrigger, bindReactions } = await import('./src/expedition/effects.js');
      const { initResource } = await import('./src/expedition/resource.js');
      let fired = 0;
      const c = bindReactions(initResource({ classId: 'cleric' }, 'cleric'), [
        { trigger: 'hit', key: 'k', costs: 'ability', run: () => { fired++; } },
      ]);
      const run_ = { elapsed: 0 };
      for (let i = 0; i < 30; i++) fireTrigger('hit', { run: run_, self: c });
      return { fired, left: Math.round(c.resource.cur) };
    });
    ok(r.fired > 0 && r.fired < 30, `fired ${r.fired} of 30 attempts`);
    return `${r.fired} of 30 attempts affordable`;
  });

  await test('a hero with nothing left still attacks', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      while (G.state.expeditions.length) G.state.expeditions.pop();
      const cleric = rollHero({ classId: 'cleric', rarity: 'common' });
      cleric.level = 40; cleric.stamina = 100;
      G.state.heroes.push(cleric);
      G.state.parties[0].members = [cleric.uid];
      refreshSheets();
      dispatch(G.state.parties[0].id, 'mines', 4);
      const run_ = G.state.expeditions[0];
      for (let i = 0; i < 12 && !run_.enemies.length; i++) tickAll(0.1);
      const c = run_.combatants[0];
      c.resource.cur = 0;                       // dry
      const before = run_.enemies[0].life;
      for (let i = 0; i < 60; i++) tickAll(0.1);
      const enemy = run_.enemies[0];
      return { dealt: enemy ? before - enemy.life : before, killed: !enemy };
    });
    ok(r.killed || r.dealt > 0,
      'a healer with no mana did nothing at all — it should pick up its mace');
    return r.killed ? 'kept fighting and killed it' : `kept fighting for ${Math.round(r.dealt)} damage`;
  });

  await test('mana is spent down over a real fight', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      while (G.state.expeditions.length) G.state.expeditions.pop();
      G.state.heroes.length = 0;
      for (const cls of ['guardian', 'cleric', 'rogue']) {
        const h = rollHero({ classId: cls, rarity: 'common' });
        h.level = 50; h.stamina = 100;
        G.state.heroes.push(h);
      }
      G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
      refreshSheets();
      dispatch(G.state.parties[0].id, 'mines', 14);
      const run_ = G.state.expeditions[0];
      let lowest = 1;
      for (let i = 0; i < 3000 && G.state.expeditions.length; i++) {
        tickAll(0.1);
        const healer = run_.combatants.find((c) => c.classId === 'cleric');
        if (healer) lowest = Math.min(lowest, healer.resource.cur / healer.resource.max);
      }
      const healer = run_.combatants.find((c) => c.classId === 'cleric');
      return { lowest, healed: Math.round(healer?.healingDone ?? 0) };
    });
    ok(r.lowest < 0.95, `the healer never spent any mana (lowest ${(r.lowest * 100).toFixed(0)}%)`);
    return `mana fell to ${(r.lowest * 100).toFixed(0)}%, healing ${r.healed}`;
  });

  await test('the run card shows the bar', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { renderRuns } = await import('./src/ui/expeditions.js');
      if (!G.state.expeditions.length) {
        for (const h of G.state.heroes) h.stamina = 100;
        dispatch(G.state.parties[0].id, 'mines', 2);
        for (let i = 0; i < 12; i++) tickAll(0.1);
      }
      renderRuns();
      const bars = document.querySelectorAll('.bar.res');
      return { bars: bars.length, kinds: [...new Set([...bars].map((b) => b.className))] };
    });
    ok(r.bars > 0, 'no resource bars rendered on the run card');
    return `${r.bars} bars: ${r.kinds.join(' / ')}`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
