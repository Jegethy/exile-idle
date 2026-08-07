// A tier is a tier, whichever dungeon you take it in.
//
// That is the game's own claim — "Tier is how hard; dungeon is what for" — and
// it is what makes cleared content stay useful: you go back to Tier 4 for gold
// because gold is what you need, not because Tier 4 is where you can survive.
//
// It was not true. Measured at Tier 20 with the same party, Silkmoth Hollow
// cleared 67% of the time and the Sunken Crypt 0%, because every dungeon
// carried its own monster multipliers and nobody had ever multiplied them out.
// The Proving Arena stacked 1.35 damage against 1.30 attack speed over ten
// waves; the Hollow put 0.85 damage on 70% life over nine.
//
// The statistical version of this question needs several hundred expeditions
// per dungeon and lives in tests/dungeonbalance.mjs, which is run by hand. What
// is here is the structural half — the things that can be checked exactly, and
// that were each individually load-bearing in the original bug.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('dungeons');
  const { page, errors } = await openGame(browser, { name: 'Dungeons' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
    G.state.progress.highestTier = 30;
  });

  await test('every dungeon runs the same number of waves', async () => {
    const r = await page.evaluate(async () => {
      const { DUNGEONS } = await import('./src/data/dungeons.js');
      return DUNGEONS.map((d) => ({ name: d.name, waves: d.waves }));
    });
    const counts = [...new Set(r.map((d) => d.waves))];
    // Waves multiply difficulty *and* payout, because rewards accrue per kill.
    // So a ten-wave dungeon was 25% harder and 25% richer than an eight-wave
    // one with identical reward rates — and the dispatch card, which draws a
    // bar per reward rate, had no way to say so. Payout differences belong in
    // the rates, where they are visible.
    eq(counts.length, 1,
      `wave counts differ: ${r.map((d) => `${d.name} ${d.waves}`).join(', ')}`);
    return `all ${r.length} dungeons run ${counts[0]} waves`;
  });

  await test('the tank a dungeon wants is derived from the tanks themselves', async () => {
    const r = await page.evaluate(async () => {
      const { DUNGEONS } = await import('./src/data/dungeons.js');
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const { tankFor, schoolExposure } = await import('./src/readiness.js');
      const tanks = HERO_CLASSES.filter((c) => c.role === 'Tank');

      const wrong = [];
      const chosen = {};
      for (const d of DUNGEONS) {
        const best = tankFor(d.attackMix);
        chosen[best.cls.id] = (chosen[best.cls.id] ?? 0) + 1;
        // Recomputed here from the raw class numbers rather than trusting the
        // helper, so the helper cannot quietly disagree with the data it reads.
        const byHand = tanks
          .map((c) => ({ c, e: schoolExposure(c, d.attackMix) }))
          .sort((a, b) => a.e - b.e)[0].c;
        if (byHand.id !== best.cls.id) wrong.push(`${d.name}: ${best.cls.id} vs ${byHand.id}`);
      }
      return { wrong, chosen, tanks: tanks.map((t) => t.id), total: DUNGEONS.length };
    });
    eq(r.wrong.length, 0, `the recommendation disagrees with the arithmetic: ${r.wrong.join('; ')}`);
    // Every tank has to be the answer to something. The dispatch board told
    // players "a Warrior answers brawlers, a Paladin answers casters" while
    // the Guardian was in fact the right pick for four of the seven, which
    // made two of the three tanks decorative.
    for (const id of r.tanks) {
      ok((r.chosen[id] ?? 0) > 0, `no dungeon calls for a ${id} — that tank is decoration`);
    }
    return `${r.total} dungeons: ${Object.entries(r.chosen).map(([k, v]) => `${v} ${k}`).join(', ')}`;
  });

  await test('bringing the wrong tank costs something', async () => {
    const r = await page.evaluate(async () => {
      const { DUNGEONS } = await import('./src/data/dungeons.js');
      const { tankFor } = await import('./src/readiness.js');
      const flat = [];
      for (const d of DUNGEONS) {
        const { ranked } = tankFor(d.attackMix);
        const gap = ((ranked[ranked.length - 1].exposure - ranked[0].exposure)
          / ranked[ranked.length - 1].exposure) * 100;
        flat.push({ name: d.name, gap });
      }
      return flat;
    });
    // If the best and worst tank are within a couple of points, the blend is
    // decoration and "which dungeon" carries no party decision at all.
    const dull = r.filter((d) => d.gap < 5);
    eq(dull.length, 0,
      `the tank barely matters in: ${dull.map((d) => `${d.name} ${d.gap.toFixed(1)}%`).join(', ')}`);
    const worst = Math.min(...r.map((d) => d.gap));
    const best = Math.max(...r.map((d) => d.gap));
    return `right tank is worth ${worst.toFixed(0)}–${best.toFixed(0)}% less damage taken`;
  });

  await test('no dungeon is unclearable by a party built for it', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { DUNGEONS, tierToLevel, tierToIlvl } = await import('./src/data/dungeons.js');
      const { tankFor } = await import('./src/readiness.js');
      const { rollHero, createParty, assignToParty } = await import('./src/heroes.js');
      const { createItem } = await import('./src/items.js');
      const { CLASS_BY_ID } = await import('./src/data/heroclasses.js');
      const { BASE_BY_ID } = await import('./src/data/bases.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');

      // Deliberately a comfortable tier rather than the hardest one. This is
      // not asking "are they balanced" — that needs hundreds of runs and lives
      // in dungeonbalance.mjs. It is asking the far cheaper question the
      // original bug would have failed outright: can this be finished at all?
      const TIER = 10;
      const out = [];
      for (const d of DUNGEONS) {
        G.state.heroes.length = 0;
        G.state.parties.length = 0;
        while (G.state.expeditions.length) G.state.expeditions.pop();
        const party = createParty('Probe');
        const comp = [tankFor(d.attackMix).cls.id, 'cleric', 'bard', 'rogue', 'wizard'];
        for (const classId of comp) {
          const h = rollHero({ classId, rarity: 'rare', level: tierToLevel(TIER) });
          h.traits = [];
          h.stamina = 100;
          const prefers = CLASS_BY_ID[classId].prefers ?? ['sword1h'];
          const weapon = prefers.find((x) => BASE_BY_ID[x]?.slot === 'weapon') ?? 'sword1h';
          h.equipment.weapon = createItem({ baseId: weapon, ilvl: tierToIlvl(TIER), rarity: 'rare' });
          h.equipment.body = createItem({ baseId: 'body_arev', ilvl: tierToIlvl(TIER), rarity: 'rare' });
          G.state.heroes.push(h);
          assignToParty(h.uid, party.id);
        }
        refreshSheets();
        const before = G.state.stats.runs;
        dispatch(party.id, d.id, TIER);
        for (let i = 0; i < 6000 && G.state.expeditions.length; i++) tickAll(0.1);
        out.push({ name: d.name, cleared: G.state.stats.runs > before });
      }
      return out;
    });
    const failed = r.filter((d) => !d.cleared).map((d) => d.name);
    eq(failed.length, 0, `level-matched party could not clear: ${failed.join(', ')}`);
    return `all ${r.length} cleared at Tier 10 by a party built for them`;
  });

  await test('reward rates are what a dungeon pays, not its length', async () => {
    const r = await page.evaluate(async () => {
      const { DUNGEONS } = await import('./src/data/dungeons.js');
      return DUNGEONS.map((d) => {
        const rw = d.rewards;
        const total = rw.gold + rw.gear + rw.xp + rw.mats;
        const top = Math.max(rw.gold, rw.gear, rw.xp, rw.mats);
        return { name: d.name, total, focus: top / total };
      });
    });
    // Every dungeon should pay about the same in total and differ in *what*.
    // With waves equalised, the rate table is now the only thing that decides
    // a payout, so a dungeon quietly paying half as much of everything would
    // be a strictly worse destination rather than a different one.
    const totals = r.map((d) => d.total);
    const spread = Math.max(...totals) / Math.min(...totals);
    ok(spread < 1.35,
      `total payout differs by ${spread.toFixed(2)}x: `
      + r.map((d) => `${d.name} ${d.total.toFixed(2)}`).join(', '));
    for (const d of r) {
      ok(d.focus > 0.35, `${d.name} has no clear speciality (best share ${(d.focus * 100).toFixed(0)}%)`);
    }
    return `totals within ${spread.toFixed(2)}x, every dungeon with a speciality`;
  });

  await test('no page errors', async () => {
    eq(errors.length, 0, errors.join(' | '));
    return 'no page errors';
  });

  clean(page);
}
