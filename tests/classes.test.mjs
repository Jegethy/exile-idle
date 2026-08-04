// Classes: positioning, school resistance, and the passive abilities that fire
// on their own. The point of the rework is that eleven classes play
// differently, so these check behaviour rather than stat blocks.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Puts one hero of a given class into a party, alone, and starts a run. */
const soloRun = `async (classId, tier) => {
  const { G } = await import('./src/state.js');
  const { rollHero } = await import('./src/heroes.js');
  const { dispatch, recall } = await import('./src/expedition.js');
  const { refreshSheets } = await import('./src/sheets.js');
  while (G.state.expeditions.length) recall(G.state.expeditions[0].id);
  const hero = rollHero({ classId, rarity: 'common' });
  hero.level = 60; hero.stamina = 100;
  G.state.heroes.push(hero);
  const party = G.state.parties[0];
  party.members = [hero.uid];
  refreshSheets();
  dispatch(party.id, 'mines', tier);
  return G.state.expeditions[0];
}`;

export default async function run(browser) {
  suite('classes');
  const { page, errors } = await openGame(browser, { name: 'Classes' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });
  await page.evaluate((src) => { window.__solo = eval(`(${src})`); }, soloRun);

  await test('every class is complete and internally consistent', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const problems = [];
      for (const c of HERO_CLASSES) {
        if (!c.ability?.reactions?.length) problems.push(`${c.id}: no ability`);
        if (!['Tank', 'Healer', 'Support', 'DPS'].includes(c.role)) problems.push(`${c.id}: role ${c.role}`);
        // A melee class in the back row could never attack anything.
        if (c.reach === 'melee' && c.row !== 'front') problems.push(`${c.id}: melee but back row`);
        for (const k of ['life', 'armour', 'damage', 'aps', 'threat']) {
          if (typeof c.mult[k] !== 'number') problems.push(`${c.id}: mult.${k}`);
        }
      }
      return {
        problems,
        counts: HERO_CLASSES.reduce((a, c) => ({ ...a, [c.role]: (a[c.role] ?? 0) + 1 }), {}),
      };
    });
    eq(r.problems.length, 0, `class problems: ${r.problems.join('; ')}`);
    eq(r.counts.Tank, 3, 'tanks');
    eq(r.counts.Healer, 3, 'healers');
    eq(r.counts.DPS, 5, 'damage classes');
    eq(r.counts.Support, 1, 'support classes');
    return '3 tanks / 3 healers / 1 support / 5 DPS, all with abilities';
  });

  await test('melee enemies cannot reach the back row', async () => {
    const r = await page.evaluate(async () => {
      const { reachableTo } = await import('./src/expedition/combat.js');
      const party = [
        { name: 'Front', row: 'front', down: false },
        { name: 'Back', row: 'back', down: false },
      ];
      return {
        melee: reachableTo({ attack: 'melee' }, party).map((c) => c.name),
        spell: reachableTo({ attack: 'spell' }, party).map((c) => c.name),
        collapsed: reachableTo({ attack: 'melee' }, [party[1]]).map((c) => c.name),
      };
    });
    eq(r.melee.join(','), 'Front', 'melee reach');
    eq(r.spell.join(','), 'Front,Back', 'spell reach');
    eq(r.collapsed.join(','), 'Back', 'melee should reach the back once the front falls');
    return 'melee held at the front until it collapses';
  });

  await test('the Rogue opens with Bloodlust and it decays', async () => {
    const r = await page.evaluate(async () => {
      const { tickAll } = await import('./src/expedition.js');
      const { modFrom } = await import('./src/expedition/effects.js');
      const run_ = await window.__solo('rogue', 4);
      for (let i = 0; i < 12 && !run_.enemies.length; i++) tickAll(0.1);
      const c = run_.combatants[0];
      const opening = Math.round(modFrom(c, 'incDamage'));
      for (let i = 0; i < 30; i++) tickAll(0.1);
      const later = Math.round(modFrom(c, 'incDamage'));
      for (let i = 0; i < 40; i++) tickAll(0.1);
      return { opening, later, spent: Math.round(modFrom(c, 'incDamage')) };
    });
    ok(r.opening > 60, `Bloodlust should open strong, got +${r.opening}%`);
    ok(r.later < r.opening, `should have decayed: +${r.opening}% -> +${r.later}%`);
    eq(r.spent, 0, 'should be spent by the end');
    return `+${r.opening}% -> +${r.later}% -> +${r.spent}%`;
  });

  await test('the Archer stacks Steady Aim to its cap', async () => {
    const r = await page.evaluate(async () => {
      const { tickAll } = await import('./src/expedition.js');
      const run_ = await window.__solo('archer', 3);
      for (let i = 0; i < 200 && G_stacks(run_) < 5 && run_.status === 'running'; i++) tickAll(0.1);
      function G_stacks(rr) {
        return rr.combatants[0].effects?.find((e) => e.id === 'steadyaim')?.stacks ?? 0;
      }
      return { stacks: G_stacks(run_) };
    });
    eq(r.stacks, 5, 'Steady Aim stacks');
    return 'reached 5 stacks';
  });

  await test('the Warlock curses the enemies it is not hitting', async () => {
    const r = await page.evaluate(async () => {
      const { tickAll } = await import('./src/expedition.js');
      const run_ = await window.__solo('warlock', 4);
      const cursed = (e) => e.effects?.some((f) => f.id.startsWith('contagion:'));
      for (let i = 0; i < 300 && run_.status === 'running'; i++) {
        tickAll(0.1);
        // It is a cleave: the struck target takes the hit itself, everything
        // else takes the curse. So the ones *behind* the front are the tell.
        if (run_.enemies.length > 1 && run_.enemies.slice(1).every(cursed)) break;
      }
      return {
        enemies: run_.enemies.length,
        others: run_.enemies.slice(1).length,
        cursedOthers: run_.enemies.slice(1).filter(cursed).length,
      };
    });
    ok(r.enemies > 1, 'needed more than one enemy to prove it spreads');
    eq(r.cursedOthers, r.others, 'every enemy but the one being hit should be cursed');
    return `${r.cursedOthers}/${r.others} bystanders cursed`;
  });

  await test('the Templar heals the party by dealing damage', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { rollHero } = await import('./src/heroes.js');
      const { dispatch, recall, tickAll } = await import('./src/expedition.js');
      const { refreshSheets } = await import('./src/sheets.js');
      while (G.state.expeditions.length) recall(G.state.expeditions[0].id);

      // A Templar cannot cast, so pair it with a tank to soak: the question is
      // whether swinging a hammer mends the party, not whether it can solo.
      const templar = rollHero({ classId: 'templar', rarity: 'common' });
      const tank = rollHero({ classId: 'guardian', rarity: 'common' });
      for (const h of [templar, tank]) { h.level = 60; h.stamina = 100; G.state.heroes.push(h); }
      const party = G.state.parties[0];
      party.members = [templar.uid, tank.uid];
      refreshSheets();
      dispatch(party.id, 'mines', 1);
      const run_ = G.state.expeditions[0];
      for (let i = 0; i < 12 && !run_.enemies.length; i++) tickAll(0.1);

      const t = run_.combatants.find((c) => c.uid === templar.uid);
      const g = run_.combatants.find((c) => c.uid === tank.uid);
      g.life = g.maxLife * 0.4;
      const before = g.life;
      let sawHot = false;
      for (let i = 0; i < 150 && run_.status === 'running'; i++) {
        tickAll(0.1);
        if ([t, g].some((x) => x.effects?.some((e) => e.id.startsWith('radiance:')))) {
          sawHot = true;
        }
      }
      return {
        healPower: G.sheets[templar.uid].healPower,
        before: Math.round(before), after: Math.round(g.life), sawHot,
      };
    });
    eq(r.healPower, 0, 'the Templar should have no direct heal');
    ok(r.after > r.before, `the tank was not mended: ${r.before} -> ${r.after}`);
    ok(r.sawHot, 'Radiance never applied its lingering heal');
    return `tank ${r.before} -> ${r.after} with no heal cast`;
  });

  await test('the Guardian regenerates without any healer', async () => {
    const r = await page.evaluate(async () => {
      const { tickAll } = await import('./src/expedition.js');
      const run_ = await window.__solo('guardian', 1);
      for (let i = 0; i < 12 && !run_.enemies.length; i++) tickAll(0.1);
      const c = run_.combatants[0];
      const has = c.effects?.some((e) => e.id === 'secondwind');
      c.life = c.maxLife * 0.5;
      const before = c.life;
      for (let i = 0; i < 40; i++) tickAll(0.1);
      return { has, healed: c.life > before };
    });
    ok(r.has, 'Second Wind never applied');
    ok(r.healed, 'the Guardian did not regenerate');
    return 'Second Wind applied and ticking';
  });

  await test('Warrior and Paladin resist opposite schools', async () => {
    const r = await page.evaluate(async () => {
      const { heroStats } = await import('./src/stats.js');
      const mk = (classId) => heroStats({
        uid: 'p', classId, rarity: 'common', level: 40, xp: 0, stamina: 100, traits: [],
        equipment: {
          weapon: null, offhand: null, helmet: null, body: null, gloves: null,
          boots: null, amulet: null, ring1: null, ring2: null,
        },
      }, {});
      const w = mk('warrior'); const p = mk('paladin'); const g = mk('guardian');
      return {
        warrior: w.schoolResist, paladin: p.schoolResist, guardian: g.schoolResist,
        wBlock: [w.blockMelee, w.blockSpell], pBlock: [p.blockMelee, p.blockSpell],
      };
    });
    ok(r.warrior.melee > 0 && r.warrior.spell < 0, `warrior: ${JSON.stringify(r.warrior)}`);
    ok(r.paladin.spell > 0 && r.paladin.melee < 0, `paladin: ${JSON.stringify(r.paladin)}`);
    // "Even" means equal against both, not zero against both — the Guardian
    // carries a small bonus to each, which is what gives it the middle of the
    // range rather than nobody's territory.
    eq(r.guardian.melee, r.guardian.spell, 'the Guardian should be even against both');
    ok(r.wBlock[0] > r.wBlock[1], 'Warrior should block more melee than spell');
    ok(r.pBlock[1] > r.pBlock[0], 'Paladin should block more spell than melee');
    return `warrior ${r.wBlock.join('/')} block, paladin ${r.pBlock.join('/')} block`;
  });

  await test('a retired class is carried across, not lost', async () => {
    const r = await page.evaluate(async () => {
      const Save = await import('./src/save.js');
      const { G } = await import('./src/state.js');
      const blob = JSON.parse(atob(Save.exportSave()));
      const state = blob.state ?? blob;
      state.heroes[0].classId = 'berserker';
      state.heroes[1].classId = 'sorcerer';
      const restored = Save.deserialize(blob);
      return {
        first: restored.heroes[0].classId,
        second: restored.heroes[1].classId,
        count: restored.heroes.length,
        original: G.state.heroes.length,
      };
    });
    eq(r.first, 'rogue', 'Berserker should become a Rogue');
    eq(r.second, 'wizard', 'Sorcerer should become a Wizard');
    eq(r.count, r.original, 'no hero should be lost');
    return 'berserker -> rogue, sorcerer -> wizard';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
