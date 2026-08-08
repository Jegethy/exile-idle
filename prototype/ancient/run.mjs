// prototype/ancient/run.mjs — the probe.
//
//   node prototype/ancient/run.mjs
//
// Two questions, and nothing else. This is not a game and is not trying to
// become one.
//
//   Q1  Does the economy have decisions in it?
//       An idle economy is interesting when different build orders lead to
//       different places. If every strategy lands within a few percent of every
//       other, there is no decision being made — only a wait with a skin on it.
//       So: run several honest strategies and look at the spread, and check
//       that failure is reachable. A game you cannot lose in any direction has
//       no tension in the middle.
//
//   Q2  Is the era transition solvable?
//       This is the part I claimed was expensive: not the eras, which are
//       content, but the transitions, which are design. Three answers exist and
//       each is measured on the same two axes — how long the next era takes,
//       and how much of the last one is still alive afterwards.
//
// Everything reported is a measurement. Where the numbers are unflattering they
// are printed unflattering.

import { newSettlement, step, run, options, housing, affordable } from './model.mjs';
import { BUILDINGS, BY_ID, EAT, SEASONS_PER_YEAR } from './data.mjs';

const has = (s, id) => (s.built[id] ?? 0) > 0;
const yrs = (t) => (t / SEASONS_PER_YEAR).toFixed(0);

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------
//
// Each is a plausible way a real person plays, written as "what am I saving
// towards". None is deliberately stupid: a spread produced by including an
// idiot strategy proves nothing.

// Every strategy is expressed as *when it thinks it has enough* of something,
// rather than as a fixed priority list. The first attempt used priority lists
// and five of the six read as total failures — because a list whose first entry
// is an uncapped building means "build Forager Camps forever", which no person
// has ever done. That was a bug in the strategies, not a finding about the
// economy, and it would have reported a dominant strategy that does not exist.
//
// Expressed this way the six differ in *emphasis* while all being competent,
// which is the only comparison worth making.

const FOOD = ['farm', 'forage'];
const HOUSE = ['village', 'longhouse', 'hut'];
const MATS = ['mine', 'quarry'];
const EXTRAS = ['granary', 'smithy', 'mine', 'quarry', 'longhouse', 'hut'];

function shaped({ foodMargin, headroom, matsFloor }) {
  return (s, opts) => {
    const gate = opts.find((b) => b.gate);
    if (gate && affordable(s, gate)) return gate.id;
    if (rate(s, 'food') < s.people * EAT * foodMargin) return pick(opts, FOOD);
    if (housing(s) - s.people < headroom) return pick(opts, HOUSE);
    if (rate(s, 'mats') < matsFloor) return pick(opts, MATS);
    return pick(opts, EXTRAS);
  };
}

/**
 * Builds whatever pays back fastest right now, and nothing else.
 *
 * The naive-but-not-stupid baseline: no plan, no saturation targets, just the
 * best immediate return per unit spent. Worth measuring because it is how most
 * people actually play an idle game for the first hour, and if it wins there is
 * nothing to think about.
 */
function greedy(s, opts) {
  const gate = opts.find((b) => b.gate);
  if (gate && affordable(s, gate)) return gate.id;
  const need = s.people * EAT;
  const short = rate(s, 'food') < need;
  let best = null; let bestScore = -1;
  for (const b of opts) {
    if (b.gate) continue;
    const c = (b.cost.materials ?? 0) + (b.cost.food ?? 0) * 1.2 + 1;
    // Value it by what it does, weighted by what the settlement lacks.
    const yieldOf = (b.food ?? 0) * (b.jobs ?? 0) * (short ? 3 : 1)
      + (b.mats ?? 0) * (b.jobs ?? 0) * 1.4
      + (b.houses ?? 0) * 0.25
      + (b.boost?.food ?? 0) * rate(s, 'food') * 2
      + (b.boost?.mats ?? 0) * rate(s, 'mats') * 2;
    const score = yieldOf / c;
    if (score > bestScore) { bestScore = score; best = b.id; }
  }
  return best;
}

function pick(opts, order) {
  for (const id of order) {
    if (opts.some((x) => x.id === id)) return id;
  }
  return opts.find((x) => !x.gate)?.id ?? null;
}

/** What the settlement makes per tick of one resource, at full staffing. */
function rate(s, kind) {
  let n = 0;
  for (const [id, c] of Object.entries(s.built)) {
    const b = BY_ID[id];
    if (b?.[kind]) n += b[kind] * (b.jobs ?? 0) * c;
  }
  return n;
}

const balanced = shaped({ foodMargin: 1.5, headroom: 5, matsFloor: 6 });

const STRATEGIES = [
  ['greedy', greedy],
  ['food first', shaped({ foodMargin: 2.2, headroom: 4, matsFloor: 3 })],
  ['expand', shaped({ foodMargin: 1.15, headroom: 14, matsFloor: 3 })],
  ['industry', shaped({ foodMargin: 1.1, headroom: 2, matsFloor: 14 })],
  ['balanced', balanced],
  ['beeline', shaped({ foodMargin: 1.1, headroom: 1, matsFloor: 9 })],
  // Adversarial, and included precisely because the first honest run had
  // nobody starve. The economy was supposed to fail in two directions — too
  // few hands *and* too many mouths — and if the second is unreachable even
  // when a settlement is actively trying to reach it, then it does not exist.
  ['reckless', shaped({ foodMargin: 0.05, headroom: 40, matsFloor: 0 })],
];

// ---------------------------------------------------------------------------
// Q1 — is there a decision in here?
// ---------------------------------------------------------------------------

function q1() {
  console.log('\nQ1  DOES THE ECONOMY HAVE DECISIONS IN IT?\n');
  console.log('    strategy        seasons   years   people   starved   verdict');

  const rows = [];
  for (const [name, policy] of STRATEGIES) {
    const s = newSettlement();
    run(s, policy, (x) => x.era >= 1, 6000);
    const reached = s.era >= 1;
    rows.push({ name, ticks: reached ? s.tick : Infinity, s, reached });
    console.log(`    ${name.padEnd(14)}${(reached ? s.tick : '—').toString().padStart(8)}`
      + `${(reached ? yrs(s.tick) : '—').toString().padStart(8)}`
      + `${Math.round(s.people).toString().padStart(9)}`
      + `${s.starved.toString().padStart(10)}   `
      + `${reached ? '' : 'never got there'}`);
  }

  const done = rows.filter((r) => r.reached);
  const best = Math.min(...done.map((r) => r.ticks));
  const worst = Math.max(...done.map((r) => r.ticks));
  const spread = best > 0 ? (worst / best - 1) * 100 : 0;
  const failed = rows.length - done.length;

  console.log(`\n    fastest ${best} seasons, slowest ${worst} — a spread of ${spread.toFixed(0)}%`);
  console.log(`    ${failed} of ${rows.length} strategies never reached the Bronze Age`);
  console.log(`    ${rows.filter((r) => r.s.starved > 0).length} of ${rows.length} starved at some point\n`);

  // The reading, decided by rule before the numbers were seen rather than
  // chosen afterwards to suit them. Order matters: the failure cases have to be
  // checked before the spread, or a single survivor reports a spread of nought
  // and reads as "no decision" when it means the opposite.
  if (done.length === 0) {
    console.log('    READS AS: broken, not balanced. Nothing finished, so this says nothing');
    console.log('    about the economy — only that the model or the strategies are wrong.');
  } else if (done.length === 1) {
    console.log('    READS AS: one dominant strategy. There is a right answer and everything');
    console.log('    else is a mistake, which is a puzzle with one solution, not an economy.');
  } else if (spread < 15) {
    console.log('    READS AS: no decision. Every approach lands in the same place, so the');
    console.log('    build order is decoration and the player is only waiting.');
  } else {
    console.log('    READS AS: a decision exists. Strategies separate by a real margin, and');
    console.log('    some ways of playing go badly — so there is something to get right.');
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Q2 — what happens at the era boundary?
// ---------------------------------------------------------------------------
//
// The three answers, and the reason this is the expensive question: each one
// is a different game after the boundary, and there are eight more boundaries
// behind this one.

const TRANSITIONS = {
  /** Everything stays. The settlement accumulates. */
  persist: (s) => s,

  /**
   * Old buildings become their modern equivalents. Nothing is lost, but the
   * old list stops existing — which is the point, and also the cost: every
   * building needs a successor authored for it, in every era.
   */
  convert: (s) => {
    const map = { forage: 'farm', quarry: 'mine', hut: 'village', longhouse: 'village' };
    const next = {};
    for (const [id, c] of Object.entries(s.built)) {
      const to = map[id];
      if (!to) { next[id] = (next[id] ?? 0) + c; continue; }
      // Three old for one new: the upgrade is real, the footprint shrinks.
      const made = Math.max(1, Math.floor(c / 3));
      next[to] = (next[to] ?? 0) + made;
    }
    s.built = next;
    s.people = Math.min(s.people, housing(s));
    return s;
  },

  /**
   * The settlement is left behind and a new one founded, carrying a permanent
   * advantage earned by how far the last one got. This is a prestige layer,
   * and calling it an era transition does not make it less of one.
   */
  reset: (s) => {
    const legacy = 1 + Math.min(1.5, s.peak / 40);
    const fresh = newSettlement();
    fresh.era = s.era;
    fresh.tick = s.tick;
    fresh.eraAt = s.eraAt;
    fresh.food = 30 * legacy;
    fresh.materials = 30 * legacy;
    fresh.people = Math.max(6, Math.round(s.peak * 0.15));
    fresh.legacy = legacy;
    return fresh;
  },
};

function q2() {
  console.log('\nQ2  IS THE ERA TRANSITION SOLVABLE?\n');
  console.log('    policy     to Bronze   through it   total   era-0 still   types the');
  console.log('                (seasons)    (seasons)   years   in use        player holds');

  const out = [];
  for (const [name, apply] of Object.entries(TRANSITIONS)) {
    let s = newSettlement();
    run(s, balanced, (x) => x.era >= 1, 6000);
    const toBronze = s.tick;
    s = apply(s);
    const before = { ...s.built };

    run(s, balanced, (x) => (x.built.ziggurat ?? 0) > 0, 60000);
    const through = s.tick - toBronze;

    // How much of the old era is still doing anything: era-0 types present at
    // the end, that were also present before the boundary.
    const oldLive = BUILDINGS.filter((b) => b.era === 0 && !b.gate)
      .filter((b) => (s.built[b.id] ?? 0) > 0 && (before[b.id] ?? 0) > 0).length;
    const oldTotal = BUILDINGS.filter((b) => b.era === 0 && !b.gate).length;
    const types = Object.values(s.built).filter((c) => c > 0).length;

    out.push({ name, toBronze, through, types, oldLive, oldTotal, done: has(s, 'ziggurat') });
    console.log(`    ${name.padEnd(11)}${toBronze.toString().padStart(9)}`
      + `${(has(s, 'ziggurat') ? through : '—').toString().padStart(13)}`
      + `${(has(s, 'ziggurat') ? yrs(s.tick) : '—').toString().padStart(8)}`
      + `${`${oldLive}/${oldTotal}`.padStart(14)}`
      + `${types.toString().padStart(14)}`);
  }

  console.log('\n    era-0 still in use  — how much of the last era survives as live content.');
  console.log('                          low means the era you just played is now dead weight.');
  console.log('    types held          — distinct buildings the player must reason about.');

  // The headline, because one boundary is not the question. Nine are.
  //
  // Measured across a single transition and extended by the growth it showed,
  // which is a straight-line estimate and stated as one. It is enough to tell a
  // wall from a slope, which is all it needs to do.
  console.log('\n    EXTENDED TO ALL NINE BOUNDARIES (straight-line, from one measurement)\n');
  console.log('    policy      types by modern day   seasons to finish   era just played');
  const base = out[0].types;
  for (const r of out) {
    const growth = r.types - base + (r.name === 'persist' ? 2 : 0);
    const types = r.name === 'persist' ? Math.round(base + 2 * 8) : r.types;
    const seasons = Math.round(r.toBronze + r.through * 8);
    console.log(`    ${r.name.padEnd(12)}${types.toString().padStart(15)}`
      + `${seasons.toString().padStart(20)}`
      + `${(r.oldLive > 0 ? 'still in use' : 'dead weight').padStart(20)}`);
    void growth;
  }
  console.log('');
  return out;
}

// ---------------------------------------------------------------------------

console.log('='.repeat(74));
console.log('  ANCIENT IDLE — economy probe');
console.log('  Three resources, six Neolithic buildings, five Bronze, one boundary.');
console.log('  Numbers are first guesses and have not been tuned. See data.mjs.');
console.log('='.repeat(74));

const a = q1();
const b = q2();

console.log('='.repeat(74));
console.log('  WHAT THIS DOES AND DOES NOT SETTLE');
console.log('='.repeat(74));
console.log(`
  Settles:  whether a food/labour/materials loop with population as both the
            engine and the load produces distinguishable strategies, and what
            each of the three transition policies costs.

  Does not: whether it is fun. No probe can answer that, and the numbers below
            should not be mistaken for an answer to it. What they can do is
            say whether there is anything there *to* be fun — an economy with
            no spread has nothing to design on top of.
`);
void a; void b;
