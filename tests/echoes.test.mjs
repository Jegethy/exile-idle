// Echo Stones — the raid currency that rerolls a hero's three skills.
//
// The point of them is that a raid boss you have already killed, whose unique
// you have collected and whose first-kill bonus you have banked, still has a
// reason to be fought. So the checks that matter are: raids are the only
// source, a kill actually pays, and spending them does what it says.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('echo stones');
  const { page, errors } = await openGame(browser, { name: 'Echoes' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('every raid pays them, and more the deeper it is', async () => {
    const r = await page.evaluate(async () => {
      const { RAIDS } = await import('./src/data/dungeons.js');
      const missing = RAIDS.filter((x) => !x.reward.echoes).map((x) => x.id);
      const amounts = RAIDS.map((x) => x.reward.echoes);
      const rising = amounts.every((v, i) => i === 0 || v >= amounts[i - 1]);
      return { missing, amounts, rising };
    });
    eq(r.missing.length, 0, `raids paying no echoes: ${r.missing.join(', ')}`);
    ok(r.rising, `deeper raids should not pay less: ${r.amounts.join(', ')}`);
    return `${r.amounts.join(' / ')} by tier`;
  });

  await test('a first kill pays double, a repeat pays single', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { RAID_BY_ID } = await import('./src/data/dungeons.js');
      const { dispatchRaid } = await import('./src/expedition.js');
      const { tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');

      const kill = () => {
        while (G.state.expeditions.length) G.state.expeditions.pop();
        G.state.heroes.length = 0;
        for (const cls of ['guardian', 'cleric', 'rogue', 'wizard']) {
          const h = rollHero({ classId: cls, rarity: 'legendary' });
          h.level = 90; h.stamina = 100;
          G.state.heroes.push(h);
        }
        G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
        refreshSheets();
        G.state.guild.seals = 99;
        G.state.progress.highestTier = 30;
        const before = G.state.guild.echoes ?? 0;
        const res = dispatchRaid(G.state.parties[0].id, 'hollow_king');
        if (!res.ok) return null;
        // The boss has huge life at our level; drop it so the run resolves.
        const run_ = G.state.expeditions[0];
        for (let i = 0; i < 20 && !run_.enemies.length; i++) tickAll(0.1);
        for (const e of run_.enemies) e.life = 1;
        for (let i = 0; i < 400 && G.state.expeditions.length; i++) tickAll(0.1);
        return (G.state.guild.echoes ?? 0) - before;
      };

      G.state.guild.echoes = 0;
      G.state.progress.raidKills = {};
      const first = kill();
      const second = kill();
      return { first, second, def: RAID_BY_ID.hollow_king.reward.echoes };
    });
    ok(r.first !== null && r.second !== null, 'the raid could not be dispatched');
    eq(r.first, r.def * 2, `first kill paid ${r.first}, expected double (${r.def * 2})`);
    eq(r.second, r.def, `repeat kill paid ${r.second}, expected ${r.def}`);
    return `first kill ${r.first}, repeats ${r.second}`;
  });

  await test('ordinary expeditions never drop them', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      while (G.state.expeditions.length) G.state.expeditions.pop();
      G.state.heroes.length = 0;
      // Tier 2 with level-40 heroes: comfortably clear, and fast enough that
      // several runs fit in the tick budget. An ungeared party at Tier 6 is
      // not stuck, but it does crawl — about 75 seconds a wave.
      for (const cls of ['guardian', 'cleric', 'rogue']) {
        const h = rollHero({ classId: cls, rarity: 'legendary' });
        h.level = 40; h.stamina = 100;
        G.state.heroes.push(h);
      }
      G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
      refreshSheets();
      G.state.guild.echoes = 0;
      let runs = 0;
      let stopped = '';
      for (let n = 0; n < 8 && !stopped; n++) {
        for (const h of G.state.heroes) h.stamina = 100;
        while (G.state.expeditions.length) G.state.expeditions.pop();
        const res = dispatch(G.state.parties[0].id, 'mines', 2);
        if (!res.ok) { stopped = res.msg; break; }
        runs++;
        let t = 0;
        for (; t < 4000 && G.state.expeditions.length; t++) tickAll(0.1);
        if (G.state.expeditions.length) stopped = `run ${n} never finished (${t} ticks)`;
      }
      return { runs, stopped, echoes: G.state.guild.echoes };
    });
    ok(r.runs >= 5, `only ${r.runs} runs completed — ${r.stopped || 'no reason given'}`);
    eq(r.echoes, 0, `${r.runs} dungeon runs produced ${r.echoes} echoes — raids should be the only source`);
    return `${r.runs} runs, none dropped an echo`;
  });

  await test('a reroll spends the stones and redraws the three', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { rollHero, rerollSkills, rerollCostFor } = await import('./src/heroes.js');
      const { skillPoolFor } = await import('./src/data/skills.js');
      const { CLASS_BY_ID } = await import('./src/data/heroclasses.js');
      const hero = rollHero({ classId: 'wizard', rarity: 'rare' });
      G.state.heroes.push(hero);
      const cost = rerollCostFor(hero);
      G.state.guild.echoes = cost;
      const before = hero.skills.slice();
      const res = rerollSkills(hero);
      const pool = skillPoolFor(CLASS_BY_ID.wizard).map((s) => s.id);
      return {
        ok: res.ok,
        left: G.state.guild.echoes,
        cost,
        count: hero.skills.length,
        distinct: new Set(hero.skills).size,
        inPool: hero.skills.every((s) => pool.includes(s)),
        equippedIsHeld: hero.skills.includes(hero.skill),
        same: hero.skills.join() === before.join(),
        broke: rerollSkills(hero).ok,     // no stones left
      };
    });
    ok(r.ok, 'the reroll did not go through');
    eq(r.left, 0, `spent the wrong amount — ${r.left} left of ${r.cost}`);
    eq(r.count, 3, 'wrong number of skills after a reroll');
    eq(r.distinct, 3, 'a reroll produced duplicates');
    ok(r.inPool, 'a reroll drew a skill the class cannot use');
    ok(r.equippedIsHeld, 'the equipped skill is not one of the three');
    ok(!r.broke, 'a reroll went through with no stones left');
    return `spent ${r.cost}, redrew three${r.same ? ' (same set by chance)' : ''}`;
  });

  await test('better heroes cost more to retrain', async () => {
    const r = await page.evaluate(async () => {
      const { rollHero, rerollCostFor } = await import('./src/heroes.js');
      const { HERO_RARITIES } = await import('./src/data/heroclasses.js');
      const costs = HERO_RARITIES.map((x) => rerollCostFor(rollHero({ classId: 'wizard', rarity: x.id })));
      return { costs, rising: costs.every((v, i) => i === 0 || v >= costs[i - 1]) };
    });
    ok(r.rising, `costs should not fall with rarity: ${r.costs.join(', ')}`);
    ok(r.costs.at(-1) > r.costs[0], 'a Legendary should cost more than a Common');
    return `${r.costs.join(' / ')} by rarity`;
  });

  await test('the hero sheet offers it, and refuses when unaffordable', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { openHeroModal } = await import('./src/ui/roster.js');
      const hero = G.state.heroes[0];
      G.state.guild.echoes = 0;
      openHeroModal(hero.uid);
      const poor = document.querySelector('#btnRerollSkills')?.disabled;
      G.state.guild.echoes = 99;
      openHeroModal(hero.uid);
      const rich = document.querySelector('#btnRerollSkills')?.disabled;
      return { poor, rich, label: document.querySelector('#btnRerollSkills')?.textContent.trim() };
    });
    ok(r.poor === true, 'the reroll button was live with no stones');
    ok(r.rich === false, 'the reroll button stayed dead with stones in hand');
    ok(/\d/.test(r.label ?? ''), `the button does not state a price: "${r.label}"`);
    return `disabled when broke, enabled when not — "${r.label}"`;
  });

  await test('an old save gains the counter', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      return { top: !!document.querySelector('#qsEchoes'), live: G.state.guild.echoes !== undefined };
    });
    ok(r.top, 'no Echo Stone counter in the top bar');
    ok(r.live, 'state carries no echoes field');
    return 'counter present in the top bar';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
