#!/usr/bin/env node
// run.mjs — starts the static server, runs every *.test.mjs, reports.
//
//   npm test              all suites
//   npm test -- block     only suites whose name matches

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './harness.mjs';
import { results } from './assert.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2];

const suites = fs.readdirSync(HERE)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (!suites.length) {
  console.error(filter ? `No suites match "${filter}".` : 'No test suites found.');
  process.exit(1);
}

const server = await startServer();
const browser = await chromium.launch();
const started = Date.now();

try {
  for (const file of suites) {
    // pathToFileURL: a bare Windows path is not a valid ESM specifier.
    const mod = await import(pathToFileURL(path.join(HERE, file)).href);
    await mod.default(browser);
  }
} finally {
  await browser.close();
  server.kill();
}

const { total, failures } = results();
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${failures ? 'FAILED' : 'PASSED'} — ${total - failures}/${total} checks in ${secs}s`);
process.exit(failures ? 1 : 0);
