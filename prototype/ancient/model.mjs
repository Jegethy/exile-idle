// prototype/ancient/model.mjs — the settlement, ticked.
//
// Pure and headless. No rendering, no storage, no framework. The only question
// this exists to answer is whether an economy of this shape has decisions in
// it, and a UI would only make that harder to see.
//
// The loop:
//
//   people are allocated to jobs  ->  staffed buildings produce food and
//   materials  ->  everyone eats, fed or not  ->  a surplus with a roof over
//   it becomes more people  ->  more people means more labour and more eating
//
// That circularity is the point. A settlement can fail in two directions —
// too many mouths for the fields, or too few hands for the quarry — and if
// both failures are reachable then there is a decision in the middle. If only
// one is reachable, or neither, there is not.

import { BY_ID, available, EAT, HAND_FOOD, HAND_MATS, BASE_HOUSING } from './data.mjs';

export function newSettlement() {
  return {
    tick: 0,
    era: 0,
    food: 30,
    materials: 30,
    people: 6,
    built: {},                 // buildingId -> count
    saved: {},                 // carried across an era transition
    eraAt: [],                 // tick each era was entered
    starved: 0,                // ticks spent with an empty larder
    peak: 6,
  };
}

const count = (s, id) => s.built[id] ?? 0;

/** Total population the settlement can hold. */
export function housing(s) {
  // Above the founding population, deliberately. Starting a settlement already
  // over its own capacity made growth impossible from the first tick, which
  // read in the report as "this economy does not grow" when it actually meant
  // "this economy was born broken".
  let n = BASE_HOUSING;
  for (const [id, c] of Object.entries(s.built)) n += (BY_ID[id]?.houses ?? 0) * c;
  return n;
}

/** Every job in the settlement, by building. */
function jobSlots(s) {
  const out = [];
  for (const [id, c] of Object.entries(s.built)) {
    const b = BY_ID[id];
    if (b?.jobs) out.push({ id, slots: b.jobs * c, food: b.food ?? 0, mats: b.mats ?? 0 });
  }
  return out;
}

/** Settlement-wide multipliers from boost buildings. */
function boosts(s) {
  let food = 1; let mats = 1;
  for (const [id, c] of Object.entries(s.built)) {
    const b = BY_ID[id];
    if (b?.boost?.food) food += b.boost.food * c;
    if (b?.boost?.mats) mats += b.boost.mats * c;
  }
  return { food, mats };
}

/**
 * Puts people to work.
 *
 * Food first, and only as far as breaking even — then everything spare goes to
 * materials. Deliberately not a player decision: the question under test is the
 * *build order*, and leaving labour allocation open as well would mean two
 * variables and no way to attribute a result to either.
 *
 * It is also the obvious policy a real player would land on within an hour, so
 * measuring against it is measuring against a competent player rather than a
 * clumsy one.
 */
function allocate(s) {
  const slots = jobSlots(s).map((j) => ({ ...j, filled: 0 }));
  const mult = boosts(s);
  const need = s.people * EAT;
  let free = s.people;
  let food = 0; let mats = 0;

  const foodJobs = slots.filter((x) => x.food > 0);
  const matsJobs = slots.filter((x) => x.mats > 0);

  // Fields first, but only as far as breaking even — a fed settlement sends
  // its spare hands to the quarry rather than stockpiling grain forever.
  for (const j of foodJobs) {
    if (free <= 0) break;
    const rate = j.food * mult.food;
    const wanted = Math.max(0, Math.ceil((need - food) / rate));
    const put = Math.min(j.slots - j.filled, free, wanted);
    if (put <= 0) continue;
    j.filled += put; food += put * rate; free -= put;
  }
  for (const j of matsJobs) {
    if (free <= 0) break;
    const put = Math.min(j.slots - j.filled, free);
    if (put <= 0) continue;
    j.filled += put; mats += put * j.mats * mult.mats; free -= put;
  }
  // Still spare? Back to the fields, into slots that are genuinely empty.
  // Counting a second shift into slots already worked was double-dipping.
  for (const j of foodJobs) {
    if (free <= 0) break;
    const put = Math.min(j.slots - j.filled, free);
    if (put <= 0) continue;
    j.filled += put; food += put * j.food * mult.food; free -= put;
  }
  // Whoever is left works with their hands. This is what stops a settlement
  // that overspent from being stuck forever with no way to earn anything.
  food += free * HAND_FOOD * mult.food;
  mats += free * HAND_MATS * mult.mats;
  return { food, mats, idle: free };
}

/** Can this building be paid for right now? */
export function affordable(s, b) {
  return (s.food >= (b.cost.food ?? 0)) && (s.materials >= (b.cost.materials ?? 0));
}

/** Whether the settlement is allowed another of these. */
export function buildable(s, b) {
  if (b.era > s.era) return false;
  if (b.cap && count(s, b.id) >= b.cap) return false;
  return true;
}

export function build(s, id) {
  const b = BY_ID[id];
  if (!b || !buildable(s, b) || !affordable(s, b)) return false;
  s.food -= b.cost.food ?? 0;
  s.materials -= b.cost.materials ?? 0;
  s.built[id] = count(s, id) + 1;
  return true;
}

/** Everything the settlement could legally put up next. */
export function options(s) {
  return available(s.era).filter((b) => buildable(s, b));
}

/**
 * One season.
 *
 * `policy(s, options)` returns the id of what the settlement is saving towards,
 * or null to bank. It is asked every tick rather than once, so a policy may
 * change its mind as conditions change — which is what a player does.
 */
export function step(s, policy) {
  s.tick++;
  const { food, mats } = allocate(s);

  s.materials += mats;
  s.food += food - s.people * EAT;

  if (s.food < 0) {
    // Nobody is fed. People leave or die; the settlement contracts until the
    // fields can carry it. This is the failure direction that makes over-
    // expansion a real mistake rather than a slower success.
    s.food = 0;
    s.starved++;
    s.people = Math.max(2, s.people - Math.max(1, Math.round(s.people * 0.04)));
  } else {
    const room = housing(s) - s.people;
    // Growth needs both a roof and a larder with something in it beyond the
    // next meal. A settlement living hand to mouth stays exactly as big as it is.
    const spare = s.food - s.people * EAT * 3;
    if (room > 0 && spare > 0) {
      s.people += Math.min(room, Math.max(0.02 * s.people, 0.15));
    }
  }
  s.peak = Math.max(s.peak, s.people);

  // Build whatever the policy is pointing at, if it is now affordable.
  const want = policy(s, options(s));
  if (want) build(s, want);

  // Era gate.
  const gate = available(s.era).find((b) => b.gate);
  if (gate && count(s, gate.id) > 0 && s.era < 1) {
    s.era++;
    s.eraAt[s.era] = s.tick;
  }
  return s;
}

/** Runs until `until(s)` is true or the season limit is reached. */
export function run(s, policy, until, limit = 20000) {
  while (s.tick < limit && !until(s)) step(s, policy);
  return s;
}
