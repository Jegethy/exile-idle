// Recruitment is a choice between three named candidates rather than a button
// that emits a random hero. The economics matter: rarity sets the price, the
// exponential roster curve stays underneath it, and rerolling escalates so the
// board cannot be farmed for a Legendary.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('recruitment');
  const { page, errors } = await openGame(browser, { name: 'Hiring' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
    G.state.guild.gold = 10_000_000;
  });

  await test('the board offers three named candidates', async () => {
    const r = await page.evaluate(async () => {
      const { recruitBoard, boardCosts } = await import('./src/heroes.js');
      const board = recruitBoard();
      return {
        n: board.candidates.length,
        costs: boardCosts(),
        named: board.candidates.every((h) => h.name && h.classId && h.rarity),
      };
    });
    eq(r.n, 3, 'candidates on the board');
    ok(r.named, 'every candidate should be fully rolled');
    eq(r.costs.length, 3, 'a price for each');
    return `3 candidates at ${r.costs.join('g, ')}g`;
  });

  await test('price follows rarity', async () => {
    const r = await page.evaluate(async () => {
      const { candidateCost } = await import('./src/heroes.js');
      return {
        common: candidateCost(3, 'common'),
        uncommon: candidateCost(3, 'uncommon'),
        rare: candidateCost(3, 'rare'),
        epic: candidateCost(3, 'epic'),
        legendary: candidateCost(3, 'legendary'),
      };
    });
    ok(r.common < r.uncommon && r.uncommon < r.rare && r.rare < r.epic && r.epic < r.legendary,
      `prices should climb: ${JSON.stringify(r)}`);
    return `${r.common}g common -> ${r.legendary}g legendary`;
  });

  await test('the exponential roster curve survives underneath', async () => {
    const r = await page.evaluate(async () => {
      const { candidateCost } = await import('./src/heroes.js');
      return { small: candidateCost(3, 'common'), large: candidateCost(20, 'common') };
    });
    ok(r.large > r.small * 4, `a big roster should pay far more: ${r.small} -> ${r.large}`);
    return `common costs ${r.small}g at 3 heroes, ${r.large}g at 20`;
  });

  await test('hiring takes that candidate and refills the board', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { recruitBoard, recruit, candidateCost } = await import('./src/heroes.js');
      const board = recruitBoard();
      const pick = board.candidates[1];
      const cost = candidateCost(G.state.heroes.length, pick.rarity);
      const goldBefore = G.state.guild.gold;
      const rosterBefore = G.state.heroes.length;
      const res = recruit(pick.uid);
      return {
        ok: res.ok,
        hired: G.state.heroes.some((h) => h.uid === pick.uid),
        stillOffered: recruitBoard().candidates.some((h) => h.uid === pick.uid),
        refilled: recruitBoard().candidates.length,
        spent: goldBefore - G.state.guild.gold,
        cost,
        grew: G.state.heroes.length - rosterBefore,
      };
    });
    ok(r.ok, 'hire failed');
    ok(r.hired, 'the chosen candidate did not join');
    ok(!r.stillOffered, 'the hired candidate is still on the board');
    eq(r.refilled, 3, 'the board should refill');
    eq(r.spent, r.cost, 'gold spent should match the quoted price');
    eq(r.grew, 1, 'roster growth');
    return `hired for ${r.spent}g, board refilled`;
  });

  await test('rerolling replaces the unlocked and spares the locked', async () => {
    const r = await page.evaluate(async () => {
      const { recruitBoard, rerollRecruits, toggleRecruitLock } = await import('./src/heroes.js');
      const board = recruitBoard();
      const keep = board.candidates[0];
      toggleRecruitLock(keep.uid);
      const others = board.candidates.slice(1).map((h) => h.uid);
      const res = rerollRecruits();
      const after = recruitBoard().candidates.map((h) => h.uid);
      return {
        ok: res.ok,
        keptLocked: after.includes(keep.uid),
        replaced: others.every((uid) => !after.includes(uid)),
        size: after.length,
      };
    });
    ok(r.ok, 'reroll failed');
    ok(r.keptLocked, 'a locked candidate was rerolled away');
    ok(r.replaced, 'unlocked candidates were not replaced');
    eq(r.size, 3, 'board size after reroll');
    return 'locked kept, unlocked replaced';
  });

  await test('reroll price escalates, then resets on a hire', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { recruitBoard, rerollRecruits, rerollCost, recruit } = await import('./src/heroes.js');
      const n = G.state.heroes.length;
      const prices = [];
      for (let i = 0; i < 3; i++) {
        prices.push(rerollCost(n, recruitBoard().rerolls));
        rerollRecruits();
      }
      const beforeHire = rerollCost(G.state.heroes.length, recruitBoard().rerolls);
      recruit(recruitBoard().candidates[0].uid);
      return {
        prices,
        beforeHire,
        afterHire: rerollCost(G.state.heroes.length, recruitBoard().rerolls),
        base: rerollCost(G.state.heroes.length, 0),
      };
    });
    ok(r.prices[0] < r.prices[1] && r.prices[1] < r.prices[2],
      `reroll price should climb: ${r.prices.join(' -> ')}`);
    eq(r.afterHire, r.base, 'hiring should reset the reroll price');
    return `${r.prices.join('g -> ')}g, reset to ${r.afterHire}g after hiring`;
  });

  await test('an unaffordable candidate is refused, not part-charged', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { recruitBoard, recruit } = await import('./src/heroes.js');
      G.state.guild.gold = 1;
      const before = G.state.heroes.length;
      const res = recruit(recruitBoard().candidates[0].uid);
      return { ok: res.ok, msg: res.msg, gold: G.state.guild.gold, grew: G.state.heroes.length - before };
    });
    ok(!r.ok, 'a broke guild should not be able to hire');
    eq(r.gold, 1, 'gold should be untouched');
    eq(r.grew, 0, 'no hero should have joined');
    return r.msg;
  });

  await test('the board survives a save and reload', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const Save = await import('./src/save.js');
      const { recruitBoard, toggleRecruitLock } = await import('./src/heroes.js');
      G.state.guild.gold = 10_000_000;
      const board = recruitBoard();
      toggleRecruitLock(board.candidates[0].uid);
      const before = board.candidates.map((h) => h.uid);
      const restored = Save.deserialize(JSON.parse(atob(Save.exportSave())));
      return {
        before,
        after: restored.recruits?.candidates?.map((h) => h.uid) ?? [],
        locked: restored.recruits?.locked ?? [],
      };
    });
    eq(r.after.join(','), r.before.join(','), 'the same candidates should be offered');
    eq(r.locked.length, 1, 'the lock should persist — a reload is not a free reroll');
    return 'candidates and locks persisted';
  });

  await test('the hiring hall renders every candidate', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      G.state.guild.gold = 10_000_000;
      document.querySelector('#btnRecruit').click();
      const modal = document.querySelector('#modalRecruit');
      return {
        open: modal && !modal.classList.contains('hidden'),
        cards: document.querySelectorAll('.recruit-card').length,
        hires: document.querySelectorAll('[data-hire]').length,
        locks: document.querySelectorAll('[data-lock]').length,
        showsAbility: document.querySelectorAll('.rc-ability').length,
      };
    });
    ok(r.open, 'the hiring hall did not open');
    eq(r.cards, 3, 'candidate cards');
    eq(r.hires, 3, 'hire buttons');
    eq(r.locks, 3, 'lock buttons');
    eq(r.showsAbility, 3, 'each candidate should show its class ability');
    return '3 cards, each with ability, lock and price';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
