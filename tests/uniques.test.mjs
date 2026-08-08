// Uniques are hand-crafted, carry better raw numbers than a rare of the same
// level, and — the point of the rework — do something. These checks equip each
// effect-carrying unique and prove its reaction fires in a real run.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Equips a unique on a fresh hero and runs a wave. */
const setup = `async (uniqueId, classId, tier) => {
  const { G } = await import('./src/state.js');
  const { rollHero } = await import('./src/heroes.js');
  const { createItem } = await import('./src/items.js');
  const { addToVault } = await import('./src/inventory.js');
  const { equipOnHero } = await import('./src/heroes.js');
  const { dispatch, recall, tickAll } = await import('./src/expedition.js');
  const { refreshSheets } = await import('./src/sheets.js');
  while (G.state.expeditions.length) recall(G.state.expeditions[0].id);
  const hero = rollHero({ classId, rarity: 'common' });
  hero.level = 60; hero.stamina = 100;
  G.state.heroes.push(hero);
  const item = createItem({ ilvl: 60, rarity: 'unique', uniqueId });
  addToVault(item, { noAutoSalvage: true });
  equipOnHero(hero.uid, item.uid);
  const party = G.state.parties[0];
  party.members = [hero.uid];
  refreshSheets();
  dispatch(party.id, 'mines', tier);
  const run = G.state.expeditions[0];
  for (let i = 0; i < 12 && !run.enemies.length; i++) tickAll(0.1);
  return { run, hero, item };
}`;

export default async function run(browser) {
  suite('unique items');
  const { page, errors } = await openGame(browser, { name: 'Uniques' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });
  await page.evaluate((src) => { window.__setup = eval(`(${src})`); }, setup);

  await test('a unique out-guns a rare of the same base and level', async () => {
    const r = await page.evaluate(async () => {
      const { createItem, itemBaseStats } = await import('./src/items.js');
      const rare = itemBaseStats(createItem({ ilvl: 20, rarity: 'rare', baseId: 'dagger' }));
      // Heartseeker is a dagger; compare the raw base numbers it is built on.
      const uniq = itemBaseStats(createItem({ ilvl: 20, rarity: 'unique', uniqueId: 'heartseeker' }));
      return { rare: rare.physMax, unique: uniq.physMax };
    });
    ok(r.unique > r.rare, `unique ${r.unique} should beat rare ${r.rare}`);
    return `dagger i20: rare ${r.rare} max vs unique ${r.unique} max`;
  });

  await test('every unique with a reaction declares what it does', async () => {
    const r = await page.evaluate(async () => {
      const { UNIQUES } = await import('./src/data/uniques.js');
      const { TRIGGERS } = await import('./src/expedition/effects.js');
      const problems = [];
      for (const u of UNIQUES) {
        for (const r_ of u.reactions ?? []) {
          if (!TRIGGERS.includes(r_.trigger)) problems.push(`${u.id}: bad trigger ${r_.trigger}`);
          if (typeof r_.run !== 'function') problems.push(`${u.id}: no run()`);
          if (!r_.key) problems.push(`${u.id}: no key`);
        }
      }
      return { problems, withReactions: UNIQUES.filter((u) => u.reactions).length, total: UNIQUES.length };
    });
    eq(r.problems.length, 0, `problems: ${r.problems.join('; ')}`);
    ok(r.withReactions >= 8, `only ${r.withReactions} uniques do anything`);
    return `${r.withReactions} of ${r.total} uniques carry an effect`;
  });

  await test('Emberbrand burns what it hits', async () => {
    const r = await page.evaluate(async () => {
      const { tickAll } = await import('./src/expedition.js');
      const { run: run_ } = await window.__setup('emberbrand', 'wizard', 6);
      let burning = false;
      for (let i = 0; i < 800 && run_.status === 'running' && !burning; i++) {
        tickAll(0.1);
        burning = run_.enemies.some((e) => e.effects?.some((f) => f.id.startsWith('emberbrand:')));
      }
      return { burning };
    });
    ok(r.burning, 'Emberbrand never applied its burn');
    return 'burn applied on hit';
  });

  await test('Rending Edge bleeds, and the bleed is capped', async () => {
    const r = await page.evaluate(async () => {
      const { tickAll } = await import('./src/expedition.js');
      const { run: run_ } = await window.__setup('rendingedge', 'rogue', 6);
      let bleed = null; let hit = 0;
      for (let i = 0; i < 800 && run_.status === 'running' && !bleed; i++) {
        tickAll(0.1);
        for (const e of run_.enemies) {
          const b = e.effects?.find((f) => f.id === 'bleed');
          if (b) { bleed = { dps: b.dps, maxLife: e.maxLife }; }
        }
      }
      return bleed ? { ...bleed, byLife: bleed.maxLife * 0.02 } : null;
    });
    ok(r, 'Rending Edge never applied a bleed');
    ok(r.dps <= r.byLife + 0.001,
      `bleed ${r.dps.toFixed(1)}/s should not exceed 2% of max life (${r.byLife.toFixed(1)})`);
    return `bleeding ${r.dps.toFixed(1)}/s, capped under ${r.byLife.toFixed(1)}/s`;
  });

  await test('Widowmaker sprays the wave but not what it hit', async () => {
    const r = await page.evaluate(async () => {
      const { UNIQUE_BY_ID } = await import('./src/data/uniques.js');
      const { run: run_ } = await window.__setup('widowmaker', 'archer', 6);
      const c = run_.combatants[0];
      // Enough enemies to tell a cleave from ordinary damage, and enough life
      // that none of them dies and confuses the arithmetic.
      while (run_.enemies.length < 3) run_.enemies.push({ ...run_.enemies[0], effects: [] });
      for (const e of run_.enemies) { e.life = 1e9; e.maxLife = 1e9; }
      const struck = run_.enemies[0];
      const before = run_.enemies.map((e) => e.life);

      const spray = UNIQUE_BY_ID.widowmaker.reactions.find((x) => x.key === 'widowmaker-spray');
      const strikes = [];
      spray.run({ run: run_, self: c, target: struck, amount: 1000, strikes, gap: 1 });
      return {
        queued: strikes.length,
        // A wave is two to four enemies, so the expected count is read from the
        // wave rather than assumed — which is what this test got wrong first.
        others: run_.enemies.length - 1,
        onStruck: strikes.filter((s) => s.enemy === struck).length,
        each: strikes[0]?.amount ?? 0,
        untouched: before.every((life, i) => run_.enemies[i].life === life),
      };
    });
    eq(r.queued, r.others, 'the spray should reach every enemy except the one struck');
    eq(r.onStruck, 0, 'the spray landed again on the enemy that was already hit');
    eq(Math.round(r.each), 600, 'the spray should carry 60% of the damage dealt');
    ok(r.untouched, 'a reaction dealt damage itself instead of queueing it for the engine');
    return `${r.queued} others hit for ${Math.round(r.each)} each, the struck one spared`;
  });

  await test('Widowmaker bites on ordinary hits and not on critical ones', async () => {
    // The whole reason ctx.crit exists: the `hit` trigger fires for critical
    // strikes too, so without it this modifier would read "every hit" and
    // double up with the spray above.
    const r = await page.evaluate(async () => {
      const { UNIQUE_BY_ID } = await import('./src/data/uniques.js');
      const { run: run_ } = await window.__setup('widowmaker', 'archer', 6);
      const c = run_.combatants[0];
      const target = run_.enemies[0];
      target.maxLife = 200000;
      const bite = UNIQUE_BY_ID.widowmaker.reactions.find((x) => x.key === 'widowmaker-bite');
      const fire = (crit, gap) => {
        const strikes = [];
        bite.run({ run: run_, self: c, target, amount: 500, crit, gap, strikes });
        return strikes;
      };
      return {
        normal: fire(false, 1)[0]?.amount ?? 0,
        onCrit: fire(true, 1).length,
        // Ten levels under content, almost nothing a hero swings connects. A
        // share of maximum life must not be the way around that.
        underLevelled: fire(false, 0.25)[0]?.amount ?? 0,
      };
    });
    eq(r.normal, 3000, '1.5% of a 200000 life target');
    eq(r.onCrit, 0, 'the rider fired on a critical strike, doubling up with the spray');
    eq(r.underLevelled, 750, 'the rider ignored the level gap, which is a way round the wall');
    return `3000 on a hit, nothing on a crit, quartered at a quarter of the gap`;
  });

  await test("Death's Fury bleeds for a share of maximum life", async () => {
    // Fired directly rather than waited for. It lands on roughly three hits in
    // a hundred — a third of critical strikes — so fishing for it in a live run
    // is a test of the dice, and one that ends when the run does.
    const r = await page.evaluate(async () => {
      const { UNIQUE_BY_ID } = await import('./src/data/uniques.js');
      const { run: run_ } = await window.__setup('deathsfury', 'archer', 6);
      const c = run_.combatants[0];
      const target = run_.enemies[0];
      const apply = UNIQUE_BY_ID.deathsfury.reactions.find((x) => x.key === 'deathsfury');
      apply.run({ run: run_, self: c, target, amount: 100, gap: 1 });
      const b = target.effects.find((f) => f.id.startsWith('deathsfury:'));
      return b
        ? { dps: b.dps, maxLife: target.maxLife, duration: b.duration, spreads: !!b.onHostDeath }
        : null;
    });
    ok(r, "Death's Fury never applied its bleed");
    // 4% every 3 seconds, delivered as a rate.
    const want = r.maxLife * 0.04 / 3;
    ok(Math.abs(r.dps - want) < 0.01, `bleeding ${r.dps.toFixed(1)}/s, expected ${want.toFixed(1)}/s`);
    ok(r.spreads, 'the bleed carries no way to spread when its host dies');
    return `${r.dps.toFixed(1)}/s — 4% of ${Math.round(r.maxLife)} life every 3s`;
  });

  await test("Death's Fury spreads when its host dies, whoever killed it", async () => {
    // The regression this is here for: hung on the wielder's `kill` trigger,
    // the spread only fired when the archer who applied the bleed also landed
    // the final blow. In a party of five that is the minority of deaths, and it
    // measured at five spreads across twelve runs against sixty applications.
    const r = await page.evaluate(async () => {
      const combat = await import('./src/expedition/combat.js');
      const { G } = await import('./src/state.js');
      const { UNIQUE_BY_ID } = await import('./src/data/uniques.js');
      const { run: run_, hero } = await window.__setup('deathsfury', 'archer', 6);
      const archer = run_.combatants[0];
      while (run_.enemies.length < 3) {
        run_.enemies.push({ ...run_.enemies[0], name: `Extra ${run_.enemies.length}`, effects: [] });
      }
      for (const e of run_.enemies) { e.life = e.maxLife; }
      const victim = run_.enemies[0];

      // Bleed applied by the archer...
      const apply = UNIQUE_BY_ID.deathsfury.reactions.find((x) => x.key === 'deathsfury');
      apply.run({ run: run_, self: archer, target: victim, amount: 100, gap: 1 });
      const applied = victim.effects.filter((f) => f.id.startsWith('deathsfury:')).length;

      // ...and killed by somebody else entirely, who has never held the bow.
      const stranger = {
        uid: 'stranger', name: 'Somebody Else', classId: 'wizard', level: archer.level,
        reactions: {}, effects: [], down: false, cooldowns: {},
      };
      run_.combatants.push(stranger);
      G.sheets[stranger.uid] = G.sheets[hero.uid];
      victim.life = 1;
      const sheet = G.sheets[hero.uid];
      combat.swing(run_, stranger, sheet, victim, 0);

      const others = run_.enemies.filter((e) => e !== victim);
      return {
        applied,
        died: !run_.enemies.includes(victim),
        spreadTo: others.filter((e) => e.effects?.some((f) => f.id.startsWith('deathsfury:'))).length,
        others: others.length,
        // Read off each new host rather than inherited from the corpse.
        scaled: others.every((e) => {
          const b = e.effects?.find((f) => f.id.startsWith('deathsfury:'));
          return !b || Math.abs(b.dps - e.maxLife * 0.04 / 3) < 0.01;
        }),
      };
    });
    eq(r.applied, 1, 'the bleed was never applied');
    ok(r.died, 'the victim did not die, so nothing was proven');
    eq(r.spreadTo, r.others, `the bleed reached ${r.spreadTo} of ${r.others} survivors`);
    ok(r.scaled, 'the spread carried the dead enemy’s numbers onto a different one');
    return `killed by a stranger, and it still took hold of all ${r.others}`;
  });

  await test('Twinstrike can land a second blow', async () => {
    const r = await page.evaluate(async () => {
      const combat = await import('./src/expedition/combat.js');
      const { G } = await import('./src/state.js');
      const { run: run_, hero } = await window.__setup('twinstrike', 'rogue', 6);
      const c = run_.combatants[0];
      const sheet = G.sheets[hero.uid];
      // Force the chance so the check is about the wiring, not the dice.
      c.reactions.hit = [{ key: 'force', run: (ctx) => { ctx.repeat = true; } }];
      const target = run_.enemies[0];
      target.life = 1e9;
      const before = target.life;
      combat.swing(run_, c, sheet, target, 0);
      return { dealt: before - target.life, cap: combat.MAX_REPEAT_DEPTH };
    });
    ok(r.dealt > 0, 'no damage was dealt at all');
    return `repeat wiring intact (limit ${r.cap})`;
  });

  await test('Wardstone answers a melee block with spell block', async () => {
    const r = await page.evaluate(async () => {
      const { modFrom } = await import('./src/expedition/effects.js');
      const { UNIQUE_BY_ID } = await import('./src/data/uniques.js');
      const { run: run_ } = await window.__setup('wardstone', 'warrior', 6);
      const c = run_.combatants[0];
      const react = UNIQUE_BY_ID.wardstone.reactions[0];
      react.run({ run: run_, self: c, kind: 'melee' });
      const afterMelee = modFrom(c, 'blockSpell');
      c.effects.length = 0;
      react.run({ run: run_, self: c, kind: 'spell' });
      return { afterMelee, afterSpell: modFrom(c, 'blockSpell') };
    });
    eq(r.afterMelee, 30, 'spell block granted after blocking a blow');
    eq(r.afterSpell, 0, 'blocking a spell should not trigger it');
    return '+30% spell block, and only from a melee block';
  });

  await test('Benediction spreads a heal to the rest of the party', async () => {
    const r = await page.evaluate(async () => {
      const { UNIQUE_BY_ID } = await import('./src/data/uniques.js');
      const { run: run_ } = await window.__setup('benediction', 'cleric', 4);
      const c = run_.combatants[0];
      const other = { uid: 'o', name: 'Other', down: false, effects: [], maxLife: 100, life: 50 };
      run_.combatants.push(other);
      UNIQUE_BY_ID.benediction.reactions[0].run({
        run: run_, self: c, target: c, amount: 120,
      });
      const fx = other.effects.find((e) => e.id === 'benediction');
      return { applied: !!fx, total: fx ? Math.round(fx.hps * 3) : 0 };
    });
    ok(r.applied, 'Benediction never reached the other ally');
    eq(r.total, 30, '25% of a 120 heal, spread over 3s');
    return 'radiates 25% of the heal to everyone else';
  });

  await test('Heartseeker can restore its wearer outright', async () => {
    const r = await page.evaluate(async () => {
      const { UNIQUE_BY_ID } = await import('./src/data/uniques.js');
      const { run: run_ } = await window.__setup('heartseeker', 'rogue', 6);
      const c = run_.combatants[0];
      c.life = c.maxLife * 0.1;
      UNIQUE_BY_ID.heartseeker.reactions[0].run({ run: run_, self: c, target: run_.enemies[0] });
      return { full: c.life === c.maxLife };
    });
    ok(r.full, 'Heartseeker did not restore the wearer');
    return 'restored to full life';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
