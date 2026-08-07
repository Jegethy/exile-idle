// assert.mjs — the smallest test reporter that still fails a CI run.
//
// Suites are plain ES modules that call test(); the runner imports them and
// reads the counters. No framework, matching the project's zero-dependency
// stance everywhere except the browser driver.

let failures = 0;
let total = 0;
let suiteName = '';

export function suite(name) {
  suiteName = name;
  console.log(`\n=== ${name} ===`);
}

/** Runs `fn`; it should return a string describing what happened. */
export async function test(label, fn) {
  total++;
  try {
    const detail = await fn();
    console.log(`  ok   ${label.padEnd(46)} ${detail ?? ''}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label.padEnd(46)} ${e.message}`);
  }
}

export function eq(actual, expected, what = 'value') {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return actual;
}

export function ok(cond, message) {
  if (!cond) throw new Error(message ?? 'expected truthy');
  return cond;
}

/** Within `tolerance`, for figures that come out of the stat pipeline rounded. */
export function near(actual, expected, tolerance, what = 'value') {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${what}: expected ${expected} ±${tolerance}, got ${actual}`);
  }
  return actual;
}

/** Asserts the page produced no console or runtime errors. */
export function clean(errors) {
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  return 'no page errors';
}

export function results() {
  return { total, failures, suiteName };
}
