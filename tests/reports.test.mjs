// The after-action summary.
//
// Combat resolves on its own, so the interesting part is over before you look.
// The summary is the only thing that answers "who is carrying and who is dead
// weight", which means the numbers on it have to be the real ones and it has
// to stay on screen long enough to read.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Runs one expedition to its end and returns the report it filed. */
async function runOnce(page, { auto = false, tier = 10 } = {}) {
  return page.evaluate(async ([autoFlag, t]) => {
    const { G } = await import('./src/state.js');
    const { dispatch, tickAll } = await import('./src/expedition.js');
    const { rollHero } = await import('./src/heroes.js');
    const { refreshSheets } = await import('./src/sheets.js');
    const { reports, clearReports } = await import('./src/reports.js');

    const { createItem } = await import('./src/items.js');
    clearReports();
    while (G.state.expeditions.length) G.state.expeditions.pop();
    G.state.heroes.length = 0;
    for (const cls of ['guardian', 'cleric', 'rogue']) {
      const h = rollHero({ classId: cls, rarity: 'legendary' });
      h.level = 40; h.stamina = 100;
      // Geared, and not for realism's sake. Measured over twelve runs, an
      // ungeared level-40 party never finishes a Tier 8 expedition at all --
      // it grinds past the tick budget and files no report, which is what made
      // this suite fail intermittently.
      h.equipment.weapon = createItem({ baseId: 'sword1h', ilvl: 40, rarity: 'rare' });
      h.equipment.body = createItem({ baseId: 'body_arev', ilvl: 40, rarity: 'rare' });
      h.equipment.helmet = createItem({ baseId: 'helm_ar', ilvl: 40, rarity: 'rare' });
      G.state.heroes.push(h);
    }
    const party = G.state.parties[0];
    party.members = G.state.heroes.map((h) => h.uid);
    party.autoRedeploy = autoFlag;
    refreshSheets();
    G.state.progress.highestTier = 20;
    dispatch(party.id, 'mines', t);
    for (let i = 0; i < 6000 && G.state.expeditions.length; i++) tickAll(0.1);
    return reports[0] ? JSON.parse(JSON.stringify(reports[0])) : null;
  }, [auto, tier]);
}

export default async function run(browser) {
  suite('summary');
  const { page, errors } = await openGame(browser, { name: 'Reports' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('a finished run files a summary with everyone in it', async () => {
    const r = await runOnce(page);
    ok(r, 'no summary was filed');
    ok(r.cleared, 'the test party failed a Tier 10 run');
    eq(r.heroes.length, 3, `${r.heroes.length} heroes in the summary`);
    ok(r.seconds > 0, 'the summary reports no duration');
    ok((r.rewards.gold ?? 0) > 0, 'the summary reports no gold');
    ok(r.heroes.every((h) => h.name && h.role), 'a hero is missing its name or role');
    return `${r.heroes.length} heroes, ${Math.round(r.seconds)}s, ${Math.round(r.rewards.gold)} gold`;
  });

  await test('the numbers match what each hero actually did', async () => {
    // Healing is checked across several runs rather than one. A party this
    // strong sometimes finishes a Tier 10 expedition without anyone dropping
    // below the threshold a Healer acts on -- measured, that was three runs in
    // twelve. The claim is that healing is recorded when it happens, not that
    // it happens every time.
    //
    // Eight attempts rather than four. At four this failed about once in
    // twenty runs, which is often enough to be noise in a full-suite run and
    // rare enough to look like a real regression when it lands.
    // Every attempt is run and the columns totalled, rather than breaking out
    // at the first one that healed and then asserting against whatever run
    // that happened to be. "A Tank is the one who gets hit" is a property of
    // how threat behaves over a fight, not a guarantee about any single
    // expedition: a tank that goes down early leaves the back row to be
    // chewed on, and one run in eight can legitimately end with a damage
    // class top of the column. Reading a per-run outcome as if it were the
    // rule is the same mistake this test's own healing check already fixed.
    const total = { Tank: { taken: 0, dealt: 0 }, DPS: { taken: 0, dealt: 0 }, Healer: { healed: 0 } };
    let last = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      last = await runOnce(page);
      for (const h of last.heroes) {
        if (total[h.role]) {
          total[h.role].taken = (total[h.role].taken ?? 0) + (h.damageTaken ?? 0);
          total[h.role].dealt = (total[h.role].dealt ?? 0) + (h.damageDealt ?? 0);
        }
        if (h.role === 'Healer') total.Healer.healed += h.healingDone ?? 0;
      }
    }
    const healed = total.Healer.healed;
    ok(total.DPS.dealt > 0, 'the damage class dealt nothing');
    ok(healed > 0, 'the healer healed nothing across eight expeditions');
    // A Tank exists to be hit. If it is not top of the damage-taken column
    // across eight runs, either threat is broken or the summary is reading
    // the wrong field.
    ok(total.Tank.taken > total.DPS.taken,
      `over eight runs the damage class soaked more than the Tank `
      + `(${Math.round(total.DPS.taken)} vs ${Math.round(total.Tank.taken)})`);
    ok(total.DPS.dealt > total.Tank.dealt,
      'the Tank out-damaged the damage class');
    return `over 8 runs: Tank soaked ${Math.round(total.Tank.taken)}, `
      + `DPS dealt ${Math.round(total.DPS.dealt)}, `
      + `Healer restored ${Math.round(healed)}`;
  });

  await test('it waits for a click when the party is not repeating', async () => {
    const r = await runOnce(page, { auto: false });
    const after = await page.evaluate(async () => {
      const { reports, tickReports } = await import('./src/reports.js');
      tickReports(30);                       // half a minute passes
      return reports.length;
    });
    eq(r.remaining, null, 'a manual party got a countdown it did not ask for');
    eq(after, 1, 'the summary vanished on its own without being dismissed');
    return 'stays until dismissed';
  });

  await test('it clears itself after five seconds when the party repeats', async () => {
    const r = await runOnce(page, { auto: true });
    const timeline = await page.evaluate(async () => {
      const { reports, tickReports, AUTO_DISMISS_SECONDS } = await import('./src/reports.js');
      const out = { seconds: AUTO_DISMISS_SECONDS, at3: 0, at6: 0 };
      tickReports(3);
      out.at3 = reports.length;
      tickReports(3);
      out.at6 = reports.length;
      return out;
    });
    eq(r.remaining, timeline.seconds, `countdown started at ${r.remaining}`);
    eq(timeline.at3, 1, 'the summary vanished before five seconds were up');
    eq(timeline.at6, 0, 'the summary was still there after six seconds');
    return `${timeline.seconds}s countdown, gone by six`;
  });

  await test('a wipe files a summary too, and says what was lost', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const { reports, clearReports } = await import('./src/reports.js');
      clearReports();
      while (G.state.expeditions.length) G.state.expeditions.pop();
      G.state.heroes.length = 0;
      // Level 1 heroes against Tier 12: no ambiguity about the outcome.
      for (const cls of ['guardian', 'cleric', 'rogue']) {
        const h = rollHero({ classId: cls, rarity: 'common' });
        h.level = 1; h.stamina = 100;
        G.state.heroes.push(h);
      }
      G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
      G.state.parties[0].autoRedeploy = false;
      G.state.progress.highestTier = 20;
      refreshSheets();
      dispatch(G.state.parties[0].id, 'mines', 12);
      for (let i = 0; i < 6000 && G.state.expeditions.length; i++) tickAll(0.1);
      return reports[0] ? JSON.parse(JSON.stringify(reports[0])) : null;
    });
    ok(r, 'a wipe filed no summary at all');
    ok(!r.cleared, 'the level-1 party cleared Tier 12');
    ok(r.heroes.some((h) => h.down), 'nobody is marked as fallen');
    return `wipe recorded, ${r.heroes.filter((h) => h.down).length} fell`;
  });

  await test('the card renders with a meter and a way out', async () => {
    await runOnce(page, { auto: false });
    const r = await page.evaluate(async () => {
      const { renderRuns } = await import('./src/ui/expeditions.js');
      renderRuns();
      const card = document.querySelector('.run-report');
      return {
        shown: !!card,
        rows: card?.querySelectorAll('.meter tbody tr').length ?? 0,
        bars: card?.querySelectorAll('.mr-bar').length ?? 0,
        loot: (card?.querySelector('.rp-loot')?.textContent ?? '').includes('gold'),
        dismiss: !!card?.querySelector('[data-dismiss]'),
        countdown: !!card?.querySelector('[data-countdown]'),
      };
    });
    ok(r.shown, 'no summary card rendered');
    eq(r.rows, 3, `${r.rows} rows in the meter`);
    eq(r.bars, 9, `${r.bars} bars — expected three columns for three heroes`);
    ok(r.loot, 'the card does not show what was found');
    ok(r.dismiss, 'no way to dismiss the card');
    ok(!r.countdown, 'a manual party card showed a countdown');
    return `3 rows, 9 bars, loot line and a Continue button`;
  });

  await test('dismissing it clears the way', async () => {
    const r = await page.evaluate(async () => {
      const { reports } = await import('./src/reports.js');
      const { renderRuns } = await import('./src/ui/expeditions.js');
      renderRuns();
      const before = reports.length;
      document.querySelector('[data-dismiss]')?.click();
      return { before, after: reports.length, card: !!document.querySelector('.run-report') };
    });
    eq(r.before, 1, 'no summary was waiting');
    eq(r.after, 0, 'clicking Continue did not clear the summary');
    ok(!r.card, 'the card is still on screen after being dismissed');
    return 'clicked, cleared, card gone';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
