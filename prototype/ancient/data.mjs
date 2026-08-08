// prototype/ancient/data.mjs — buildings and eras.
//
// THE NUMBERS HERE ARE FIRST GUESSES AND HAVE NOT BEEN TUNED.
//
// That is deliberate and it is the whole discipline of this probe. If I sit
// here adjusting yields until the report says "interesting", I have proved
// nothing except that I can fit a curve. The question is whether an economy of
// roughly this shape has decisions in it *before* anybody balances it — a shape
// that is only interesting after careful tuning is a shape that will need
// careful tuning in all nine remaining eras, which is precisely the cost we are
// trying to measure.
//
// Three resources, as scoped:
//
//   food       feeds people, and is consumed every tick whether or not you
//              are doing anything. The clock nobody can pause.
//   materials  what buildings are made of. Accumulates.
//   labour     not stored. It *is* the population, allocated to jobs, and this
//              is where the tension lives: a building with nobody in it
//              produces nothing, and people eat whether they are working or not.
//
// Population is both the engine and the load, which is the one structural idea
// this prototype is really testing. Every building either feeds people, houses
// people, or needs people.

/** Food eaten per person per tick. The metronome everything else plays against. */
export const EAT = 0.5;

/**
 * What a person produces with no building to work in.
 *
 * Not flavour — this is the fix for the worst bug the first run found. With
 * materials arriving only from quarries, and quarries costing materials, a
 * settlement that spent down to zero without one could never build anything
 * again. Not a hard difficulty: an absorbing state, reachable in five seasons,
 * from which every strategy read as "failed" for the same uninformative reason.
 *
 * It is also the more truthful model. Neolithic people foraged and knapped
 * flint without a Forager Camp; the building is a multiplier on what people
 * already do rather than a licence to do it. And the food figure is set below
 * EAT on purpose — bare hands cannot feed the hands they belong to, so
 * buildings remain necessary rather than merely nice.
 */
export const HAND_FOOD = 0.34;
export const HAND_MATS = 0.10;

/** People a settlement holds before anybody builds a roof. */
export const BASE_HOUSING = 8;

/** A tick is a season. Ten years to build a henge is not a bug. */
export const SEASONS_PER_YEAR = 4;

export const ERAS = [
  { id: 'neolithic', name: 'Neolithic', gate: 'henge' },
  { id: 'bronze', name: 'Bronze Age', gate: 'ziggurat' },
];

/**
 * A building is:
 *   cost     one-off, paid from stock
 *   jobs     how many people it can occupy
 *   food     produced per worker per tick
 *   mats     produced per worker per tick
 *   houses   population capacity added
 *   boost    { food?, mats? } multiplier on the whole settlement, per copy
 *   gate     true if building it opens the next era
 *   cap      most you may build (housing is uncapped; multipliers are not)
 */
export const BUILDINGS = [
  // --- Era 0: Neolithic ---------------------------------------------------
  {
    id: 'forage', era: 0, name: 'Forager Camp',
    cost: { materials: 6 }, jobs: 2, food: 1.5,
  },
  {
    id: 'hut', era: 0, name: 'Hut',
    cost: { materials: 9 }, houses: 4,
  },
  {
    id: 'quarry', era: 0, name: 'Quarry',
    cost: { materials: 10, food: 8 }, jobs: 2, mats: 0.85,
  },
  {
    id: 'granary', era: 0, name: 'Granary',
    // A multiplier rather than a producer, so there is something in the list
    // that is worth building *later* rather than sooner. Capped, or the
    // dominant strategy is obvious and infinite.
    cost: { materials: 24, food: 12 }, boost: { food: 0.12 }, cap: 4,
  },
  {
    id: 'longhouse', era: 0, name: 'Longhouse',
    cost: { materials: 30, food: 18 }, houses: 11,
  },
  {
    id: 'henge', era: 0, name: 'Stone Circle',
    // The era gate: enormous, produces nothing, occupies people for a long
    // time. It exists to make the transition something you *aim at* rather
    // than something that happens to you.
    cost: { materials: 110, food: 90 }, gate: true, cap: 1,
  },

  // --- Era 1: Bronze Age --------------------------------------------------
  {
    id: 'farm', era: 1, name: 'Farm',
    cost: { materials: 22 }, jobs: 3, food: 2.6,
  },
  {
    id: 'village', era: 1, name: 'Village Block',
    cost: { materials: 40, food: 25 }, houses: 26,
  },
  {
    id: 'mine', era: 1, name: 'Mine',
    cost: { materials: 34, food: 20 }, jobs: 3, mats: 1.9,
  },
  {
    id: 'smithy', era: 1, name: 'Smithy',
    cost: { materials: 60, food: 30 }, boost: { mats: 0.15 }, cap: 4,
  },
  {
    id: 'ziggurat', era: 1, name: 'Ziggurat',
    cost: { materials: 420, food: 340 }, gate: true, cap: 1,
  },
];

export const BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** Everything legal in this era or any before it. */
export function available(era) {
  return BUILDINGS.filter((b) => b.era <= era);
}
