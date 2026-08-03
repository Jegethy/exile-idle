// The combat effects layer: timed modifiers, damage and healing over time,
// stacking rules, decay, and the triggers that classes and unique items hang
// off. Everything else being built on top of this makes it worth pinning down.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('combat effects');
  const { page, errors } = await openGame(browser, { name: 'Effects' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;                    // these tests drive the clock
  });

  await test('a timed modifier applies, then expires', async () => {
    const r = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      const t = fx.initEffects({});
      fx.applyEffect(t, { id: 'rage', name: 'Rage', mods: { incDamage: 50 }, duration: 3 });
      const during = fx.modFrom(t, 'incDamage');
      fx.tickEffects(t, 2.0);
      const midway = fx.modFrom(t, 'incDamage');
      fx.tickEffects(t, 1.5);
      return { during, midway, after: fx.modFrom(t, 'incDamage'), left: t.effects.length };
    });
    eq(r.during, 50, 'modifier while active');
    eq(r.midway, 50, 'modifier before expiry');
    eq(r.after, 0, 'modifier after expiry');
    eq(r.left, 0, 'effect should be removed');
    return '50 -> 50 -> 0, cleaned up';
  });

  await test('reapplying refreshes but never shortens', async () => {
    const r = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      const t = fx.initEffects({});
      fx.applyEffect(t, { id: 'x', name: 'X', mods: { incDamage: 10 }, duration: 10 });
      fx.applyEffect(t, { id: 'x', name: 'X', mods: { incDamage: 10 }, duration: 2 });
      const afterShort = t.effects[0].duration;
      fx.applyEffect(t, { id: 'x', name: 'X', mods: { incDamage: 10 }, duration: 20 });
      return { count: t.effects.length, afterShort, afterLong: t.effects[0].duration };
    });
    eq(r.count, 1, 'should not duplicate');
    eq(r.afterShort, 10, 'a shorter reapply must not cut it short');
    eq(r.afterLong, 20, 'a longer reapply should extend');
    return 'refreshes upward only';
  });

  await test('stacking respects its cap', async () => {
    const r = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      const t = fx.initEffects({});
      for (let i = 0; i < 8; i++) {
        fx.applyEffect(t, {
          id: 's', name: 'S', mods: { incAtkSpeed: 5 }, duration: 5,
          onReapply: 'stack', maxStacks: 3,
        });
      }
      return { stacks: t.effects[0].stacks, total: fx.modFrom(t, 'incAtkSpeed') };
    });
    eq(r.stacks, 3, 'stack count');
    eq(r.total, 15, 'modifier scales with stacks');
    return '8 applications -> 3 stacks, +15%';
  });

  await test('damage over time deals its total across its duration', async () => {
    const r = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      const t = fx.initEffects({});
      let dealt = 0;
      fx.applyEffect(t, { id: 'bleed', name: 'Bleed', duration: 4, dps: 25 });
      for (let i = 0; i < 60; i++) fx.tickEffects(t, 0.1, { onDamage: (d) => { dealt += d; } });
      return { dealt: Math.round(dealt), left: t.effects.length };
    });
    eq(r.dealt, 100, 'total damage over 4s at 25 dps');
    eq(r.left, 0, 'should have expired');
    return `${r.dealt} damage over 4s`;
  });

  await test('a decaying opener tapers instead of dropping off', async () => {
    const r = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      const t = fx.initEffects({});
      fx.applyEffect(t, {
        id: 'blood', name: 'Bloodlust', mods: { incDamage: 100 },
        duration: 10, decay: 0.2,            // gone after 5s of taper
      });
      const at0 = fx.modFrom(t, 'incDamage');
      fx.tickEffects(t, 2.5);
      const at2 = Math.round(fx.modFrom(t, 'incDamage'));
      fx.tickEffects(t, 2.5);
      return { at0, at2, at5: Math.round(fx.modFrom(t, 'incDamage')), left: t.effects.length };
    });
    eq(r.at0, 100, 'full strength at the start');
    eq(r.at2, 50, 'half strength halfway through the taper');
    eq(r.at5, 0, 'spent');
    eq(r.left, 0, 'a fully decayed effect should be removed');
    return '100% -> 50% -> 0%, removed on exhaustion';
  });

  await test('triggers only fire for their own moment', async () => {
    const r = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      const fired = [];
      const c = fx.bindReactions({}, [
        { trigger: 'hit', key: 'a', run: () => fired.push('hit') },
        { trigger: 'block', key: 'b', run: () => fired.push('block') },
      ]);
      fx.fireTrigger('hit', { run: { elapsed: 0 }, self: c });
      fx.fireTrigger('kill', { run: { elapsed: 0 }, self: c });
      fx.fireTrigger('block', { run: { elapsed: 0 }, self: c });
      return fired;
    });
    eq(r.join(','), 'hit,block', 'fired triggers');
    return 'hit and block fired, kill ignored';
  });

  await test('an unknown trigger fails loudly', async () => {
    const msg = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      try {
        fx.bindReactions({}, [{ trigger: 'onHitt', key: 'typo', run: () => {} }]);
        return 'accepted (wrong)';
      } catch (e) { return e.message; }
    });
    ok(/unknown trigger/i.test(msg), `expected a loud failure, got: ${msg}`);
    return msg;
  });

  await test('a reaction cooldown holds it back', async () => {
    const r = await page.evaluate(async () => {
      const fx = await import('./src/expedition/effects.js');
      let fired = 0;
      const c = fx.bindReactions({}, [
        { trigger: 'hit', key: 'cd', cooldown: 5, run: () => { fired++; } },
      ]);
      const run_ = { elapsed: 0 };
      for (let i = 0; i < 20; i++) { run_.elapsed = i * 0.5; fx.fireTrigger('hit', { run: run_, self: c }); }
      return fired;                     // 10 seconds elapsed, 5s cooldown
    });
    ok(r === 2 || r === 3, `expected 2-3 firings on a 5s cooldown over 10s, got ${r}`);
    return `${r} firings in 10s on a 5s cooldown`;
  });

  await test('repeat-attack cannot recurse without bound', async () => {
    const r = await page.evaluate(async () => {
      const combat = await import('./src/expedition/combat.js');
      const { G } = await import('./src/state.js');
      const { dispatch } = await import('./src/expedition.js');
      for (const h of G.state.heroes) { h.stamina = 100; h.level = 40; }
      (await import('./src/sheets.js')).refreshSheets();
      dispatch(G.state.parties[0].id, 'mines', 2);
      const run_ = G.state.expeditions[0];
      // The first wave does not exist until waveTimer (0.7s) has run down.
      for (let i = 0; i < 12 && !run_.enemies.length; i++) combat.tickAll(0.1);
      const c = run_.combatants[0];
      const sheet = G.sheets[c.uid];
      let depths = [];
      // A reaction that always asks to repeat would spin forever if the swing
      // did not enforce the limit itself.
      c.reactions = { hit: [{ key: 'r', run: (ctx) => { depths.push(ctx.depth); ctx.repeat = true; } }] };
      run_.enemies[0].life = 1e9;        // keep it alive so repeats can chain
      combat.swing(run_, c, sheet, run_.enemies[0], 0);
      return { max: Math.max(...depths), cap: combat.MAX_REPEAT_DEPTH, calls: depths.length };
    });
    ok(r.max <= r.cap, `recursion reached depth ${r.max}, cap is ${r.cap}`);
    ok(r.calls <= r.cap + 1, `too many repeats: ${r.calls}`);
    return `stopped at depth ${r.max} (cap ${r.cap})`;
  });

  await test('a bleed can finish an enemy off between swings', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { tickAll } = await import('./src/expedition.js');
      const fx = await import('./src/expedition/effects.js');
      const run_ = G.state.expeditions[0];
      for (let i = 0; i < 12 && !run_.enemies.length; i++) tickAll(0.1);
      const target = run_.enemies[0];
      const killer = run_.combatants[0];
      target.life = 50;
      const before = G.state.stats.kills;
      fx.applyEffect(target, { id: 'bleed', name: 'Bleed', duration: 3, dps: 200, source: killer.uid });
      for (let i = 0; i < 10; i++) tickAll(0.1);
      return { killed: G.state.stats.kills > before, gone: !run_.enemies.includes(target) };
    });
    ok(r.killed, 'the bleed did not register a kill');
    ok(r.gone, 'the enemy is still in the wave');
    return 'killed by damage over time';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
