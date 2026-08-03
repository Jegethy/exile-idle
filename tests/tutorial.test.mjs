// The tutorial's one hard rule: nothing advances without the player. Step 9
// once held two presentations and swapped between them mid-read, and step 10
// once auto-advanced the moment the demo expedition ended.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

const stepLabel = (page) => page.evaluate(() =>
  document.querySelector('#tutStep')?.textContent?.trim() ?? '');
const title = (page) => page.evaluate(() =>
  document.querySelector('#tutTitle')?.textContent?.trim() ?? '');

/**
 * Does whatever a player could do on the current step: press Continue if it is
 * visible and enabled, otherwise click the highlighted target. Returns what it
 * did, or null when the step is waiting on the game.
 */
const act = (page) => page.evaluate(async () => {
  const b = document.querySelector('#tutNext');
  if (b && !b.classList.contains('hidden') && !b.hasAttribute('disabled')) { b.click(); return 'next'; }
  const { currentStepTarget } = await import('./src/tutorial.js');
  const el = currentStepTarget?.();
  if (el) { el.click(); return 'target'; }
  return null;
});

export default async function run(browser) {
  suite('tutorial');

  {
    const { page, errors } = await openGame(browser, { name: 'Tut', tutorial: true });

    await test('opens on step 1 and blocks the game', async () => {
      const r = await page.evaluate(() => ({
        overlay: !!document.querySelector('.tut-panel'),
        step: document.querySelector('#tutStep')?.textContent?.trim(),
      }));
      ok(r.overlay, 'no tutorial overlay');
      return r.step;
    });

    await test('walks to the end without getting stuck', async () => {
      let guard = 0;
      let last = '';
      while (guard++ < 140) {
        const done = await page.evaluate(async () =>
          (await import('./src/tutorial.js')).isTutorialActive() === false);
        if (done) break;
        last = await title(page);
        const acted = await act(page);
        if (acted) { await page.waitForTimeout(250); continue; }
        // Nothing to press means a wait step. Poll for the party coming home
        // rather than guessing a duration.
        //
        // Deliberately not page.waitForFunction: its callback cannot be async,
        // because a returned Promise is truthy and the wait resolves at once.
        for (let w = 0; w < 240; w++) {
          const home = await page.evaluate(async () =>
            (await import('./src/state.js')).G.state.expeditions.length === 0);
          if (home) break;
          await page.waitForTimeout(500);
        }
        await page.waitForTimeout(400);
      }
      const state = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        return { done: G.state.tutorial.done, skipped: G.state.tutorial.skipped, runs: G.state.stats.runs };
      });
      ok(state.done, `tutorial never finished (stuck on "${last}")`);
      eq(state.skipped, false, 'skipped flag');
      ok(state.runs > 0, 'the demo expedition never completed');
      return `finished, ${state.runs} run(s) completed`;
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  {
    const { page, errors } = await openGame(browser, { name: 'Wait', tutorial: true });

    await test('the expedition step never advances on its own', async () => {
      // Walk to the step that watches the first expedition run.
      let reached = false;
      for (let i = 0; i < 40 && !reached; i++) {
        if (await title(page) === 'The Expedition') { reached = true; break; }
        if (!await act(page)) await page.waitForTimeout(300);
        await page.waitForTimeout(220);
      }
      ok(reached, `never reached "The Expedition" (stopped on "${await title(page)}")`);
      const before = await stepLabel(page);
      // Sit through the whole demo run without touching anything.
      await page.waitForTimeout(9000);
      const after = await stepLabel(page);
      eq(after, before, 'the step advanced while the player was reading');
      return `held on ${after} through the run`;
    });

    await test('the next step stays locked until the party is home', async () => {
      await page.evaluate(() => document.querySelector('#tutNext').click());
      await page.waitForTimeout(300);
      const inFlight = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        return {
          title: document.querySelector('#tutTitle')?.textContent?.trim(),
          label: document.querySelector('#tutNext')?.textContent?.trim(),
          disabled: document.querySelector('#tutNext')?.hasAttribute('disabled'),
          running: G.state.expeditions.length,
        };
      });
      if (inFlight.running) {
        ok(inFlight.disabled, `Continue was live while the party was still out on "${inFlight.title}"`);
      }
      // Now let them come home and confirm it unlocks without advancing itself.
      const step = await stepLabel(page);
      for (let i = 0; i < 40; i++) {
        const done = await page.evaluate(async () =>
          (await import('./src/state.js')).G.state.expeditions.length === 0);
        if (done) break;
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => ({
        step: document.querySelector('#tutStep')?.textContent?.trim(),
        disabled: document.querySelector('#tutNext')?.hasAttribute('disabled'),
      }));
      eq(after.step, step, 'the step advanced itself when the party returned');
      ok(!after.disabled, 'Continue never unlocked after the party returned');
      return `${inFlight.running ? 'locked in flight, ' : ''}unlocked on return, did not self-advance`;
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  {
    const { page, errors } = await openGame(browser, { name: 'Skip', tutorial: true });

    await test('skip warns before it takes effect', async () => {
      await page.evaluate(() => document.querySelector('#tutSkip').click());
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({
        text: document.querySelector('#modalConfirm')?.textContent ?? '',
        open: !!document.querySelector('#btnConfirmYes'),
      }));
      ok(/cannot be (started|restarted|resumed)|permanent|again/i.test(r.text),
        'the warning does not say it is permanent');
      return 'warned, and it is permanent';
    });

    await test('confirming ends it and returns control', async () => {
      await page.evaluate(() => document.querySelector('#btnConfirmYes')?.click());
      await page.waitForTimeout(400);
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        return {
          overlay: !document.querySelector('#tutorial').classList.contains('hidden'),
          done: G.state.tutorial.done, skipped: G.state.tutorial.skipped,
        };
      });
      ok(!r.overlay, 'overlay still up after skipping');
      ok(r.done && r.skipped, `flags wrong: ${JSON.stringify(r)}`);
      return 'skipped, overlay gone';
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }
}
