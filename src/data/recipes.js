// data/recipes.js — the crafting bench and the alchemy bench.
//
// Bench recipes replace the old orb-per-effect model. Instead of holding a
// Chaos Orb, you hold the metal and essence a reforge actually costs, and the
// cost scales with the item's level — reworking a Tier 18 weapon is a project,
// reworking a Tier 2 one is pocket change.

import { materialOf, gradeForIlvl, salvageFamilies } from './materials.js';

/**
 * Each recipe declares:
 *   `cost(item)`   -> [{ id, qty }] materials consumed
 *   `can(item)`    -> { ok, msg } legality against the item's current state
 *   `apply(item)`  -> mutates the item; returns a message
 * The apply functions live in crafting.js so this file stays pure data.
 */
export const RECIPES = [
  {
    id: 'temper', name: 'Temper', verb: 'Tempering',
    desc: 'Works the item to a finer finish. +5% quality, up to 20%.',
    families: ['self', 'stone'],
    scale: [3, 1],
  },
  {
    id: 'imbue', name: 'Imbue', verb: 'Imbuing',
    desc: 'Wakes a plain item up. Normal becomes Magic with one or two modifiers.',
    families: ['essence', 'self'],
    scale: [1, 2],
  },
  {
    id: 'enrich', name: 'Enrich', verb: 'Enriching',
    desc: 'Promotes a Magic item to Rare, keeping what it has and adding one more.',
    families: ['essence', 'stone'],
    scale: [3, 2],
  },
  {
    id: 'reforge', name: 'Reforge', verb: 'Reforging',
    desc: 'Melts a Rare item down to its bones and rolls it again from scratch.',
    families: ['essence', 'self'],
    scale: [4, 4],
  },
  {
    id: 'augment', name: 'Augment', verb: 'Augmenting',
    desc: 'Adds one more modifier to an item with room for it. Expensive.',
    families: ['essence', 'stone'],
    scale: [8, 4],
  },
  {
    id: 'refine', name: 'Refine', verb: 'Refining',
    desc: 'Keeps every modifier and rerolls only their numbers.',
    families: ['essence'],
    scale: [6],
  },
  {
    id: 'strip', name: 'Strip', verb: 'Stripping',
    desc: 'Removes every modifier, returning the item to Normal.',
    families: ['stone'],
    scale: [3],
  },
  {
    id: 'warp', name: 'Warp', verb: 'Warping',
    desc: 'Forces raw magic into the item. Unpredictable, and it can never be '
      + 'worked on again afterwards.',
    families: ['stone', 'essence'],
    scale: [2, 3],
    risky: true,
  },
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/**
 * Material cost for a recipe against a specific item.
 * `'self'` resolves to whatever family the item is made of, so tempering a
 * plate helm wants metal and tempering a robe wants cloth.
 */
export function recipeCost(recipe, item, base) {
  const grade = gradeForIlvl(item.ilvl);
  const selfFamily = salvageFamilies(base)[0] ?? 'metal';
  // Higher-grade materials are worth more, so ask for fewer of them.
  const gradeDiscount = [1, 1, 0.75, 0.6][grade] ?? 1;

  return recipe.families.map((fam, i) => {
    const family = fam === 'self' ? selfFamily : fam;
    const qty = Math.max(1, Math.round(recipe.scale[i] * gradeDiscount));
    return { id: materialOf(family, grade).id, qty };
  });
}

// ---------------------------------------------------------------------------
// Alchemy
// ---------------------------------------------------------------------------

/**
 * Flasks are brewed in batches and assigned to a party. One is consumed when
 * that party is dispatched and buffs the whole run — a real reason to gather
 * herbs, and a decision about which party gets the good one.
 */
export const FLASKS = [
  {
    id: 'ironskin', name: 'Flask of Iron Skin', grade: 1,
    desc: 'The party takes the field armoured beyond its gear.',
    effectText: '+25% Armour and +10% Life for the expedition',
    effect: { incArmour: 25, incLife: 10 },
    cost: [{ family: 'herb', grade: 1, qty: 3 }, { family: 'metal', grade: 1, qty: 2 }],
    batch: 3,
  },
  {
    id: 'vigour', name: 'Flask of Vigour', grade: 1,
    desc: 'Steadies the whole company against a long fight.',
    effectText: '+20% Life and +1% Life regenerated per second',
    effect: { incLife: 20, lifeRegenPct: 1 },
    cost: [{ family: 'herb', grade: 1, qty: 3 }, { family: 'bone', grade: 1, qty: 2 }],
    batch: 3,
  },
  {
    id: 'fury', name: 'Flask of Fury', grade: 2,
    desc: 'They will hit harder and care less about being hit.',
    effectText: '+18% Damage for the expedition',
    effect: { incDamage: 18 },
    cost: [{ family: 'herb', grade: 2, qty: 3 }, { family: 'essence', grade: 1, qty: 2 }],
    batch: 2,
  },
  {
    id: 'swiftness', name: 'Flask of Swiftness', grade: 2,
    desc: 'Everything happens faster, including the mistakes.',
    effectText: '+15% Attack Speed for the expedition',
    effect: { incAtkSpeed: 15 },
    cost: [{ family: 'herb', grade: 2, qty: 3 }, { family: 'wood', grade: 2, qty: 2 }],
    batch: 2,
  },
  {
    id: 'fortune', name: 'Elixir of Fortune', grade: 3,
    desc: 'Sharpens the eye for anything worth carrying home.',
    effectText: '+40% Item Rarity from the expedition',
    effect: {}, find: { rarity: 40 },
    cost: [{ family: 'herb', grade: 3, qty: 2 }, { family: 'stone', grade: 2, qty: 3 }],
    batch: 1,
  },
  {
    id: 'greed', name: 'Elixir of Greed', grade: 3,
    desc: 'Nobody leaves a coin behind.',
    effectText: '+50% Gold from the expedition',
    effect: {}, find: { gold: 50 },
    cost: [{ family: 'herb', grade: 3, qty: 2 }, { family: 'essence', grade: 2, qty: 3 }],
    batch: 1,
  },
];

export const FLASK_BY_ID = Object.fromEntries(FLASKS.map((f) => [f.id, f]));

/** Concrete material cost of brewing one batch. */
export function flaskCost(flask) {
  return flask.cost.map((c) => ({ id: materialOf(c.family, c.grade).id, qty: c.qty }));
}
