// harness.mjs — shared bootstrap for the browser test suites.
//
// Every suite needs the same three things: a static server, a browser page with
// console errors captured, and a guild that has skipped the tutorial and the
// questline. Doing it once here keeps the suites themselves about behaviour.
//
// The questline hides tabs until it opens them, so a guild that has not set it
// aside cannot reach Raids or the Guild Hall — which is the feature working,
// and would otherwise make three hundred tests about something they are not
// about. `story: true` opts back in, and tests/story.test.mjs is the suite that
// does.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT || 8749);
export const BASE_URL = `http://localhost:${PORT}`;

/** Starts serve.js and resolves once it is accepting connections. */
export async function startServer() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
    cwd: ROOT, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/index.html`);
      if (res.ok) return proc;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error(`serve.js did not come up on ${PORT}`);
}

/**
 * Opens the game with a freshly founded guild.
 * @returns {{page: object, errors: string[]}} errors accumulates page and
 *   console errors so a suite can assert the run was clean.
 */
export async function openGame(browser, {
  name = 'Testing', viewport, tutorial = false, story = false,
} = {}) {
  const errors = [];
  const page = await browser.newPage({ viewport: viewport ?? { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  await page.fill('#guildNameInput', name);
  await page.click('[data-found]');
  await page.waitForTimeout(900);

  if (!tutorial) {
    await page.evaluate(async () => { (await import('./src/tutorial.js')).stopTutorial(true); });
    await page.waitForTimeout(300);
  }
  if (!story) {
    await page.evaluate(async () => { (await import('./src/story.js')).skipStory(); });
    await page.waitForTimeout(200);
  }
  return { page, errors };
}
