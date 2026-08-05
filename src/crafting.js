// crafting.js — the guild's workshop: bench recipes and alchemy.

import { rng } from './rng.js';
import { clamp } from './util.js';
import { G, log, emit } from './state.js';
import { BASE_BY_ID } from './data/bases.js';
import { MATERIAL_BY_ID } from './data/materials.js';
import { RECIPE_BY_ID, recipeCost, FLASK_BY_ID, flaskCost } from './data/recipes.js';
import { UNIQUE_BY_ID } from './data/uniques.js';
import {
  addRandomAffix, rerollAffixes, refreshName, divineAffix, openAffixSlots,
  corruptItem,
} from './items.js';
import { hasMaterials, spendMaterials, addFlask } from './inventory.js';
import { refreshSheets } from './sheets.js';

const ok = (msg) => ({ ok: true, msg });
const no = (msg) => ({ ok: false, msg });

/** Material cost of running `recipeId` on `item`. */
export function costOf(recipeId, item) {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe || !item) return [];
  return recipeCost(recipe, item, BASE_BY_ID[item.baseId]);
}

/** Is this recipe legal on this item, ignoring materials? */
export function canCraft(recipeId, item) {
  if (!item) return no('No item selected.');
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) return no('Unknown recipe.');

  if (item.corrupted) {
    return no('Warped items cannot be worked on again.');
  }

  const r = item.rarity;
  switch (recipeId) {
    case 'temper':
      return (item.quality ?? 0) < 20 ? ok() : no('Already at maximum quality.');
    case 'imbue':
      return r === 'normal' ? ok() : no('Requires a Normal item.');
    case 'enrich':
      return r === 'magic' ? ok() : no('Requires a Magic item.');
    case 'reforge':
      return r === 'rare' ? ok() : no('Requires a Rare item.');
    case 'augment':
      if (r !== 'magic' && r !== 'rare') return no('Requires a Magic or Rare item.');
      return openAffixSlots(item).total > 0 ? ok() : no('No open modifier slots.');
    case 'refine':
      if (r === 'unique') return ok();
      return item.affixes.length ? ok() : no('Item has no modifiers to reroll.');
    case 'strip':
      return r === 'magic' || r === 'rare' ? ok() : no('Requires a Magic or Rare item.');
    case 'warp':
      return ok();
    default:
      return no('That recipe does nothing here.');
  }
}

/** Legality plus affordability, for the UI. */
export function canAfford(recipeId, item) {
  const legal = canCraft(recipeId, item);
  if (!legal.ok) return legal;
  const cost = costOf(recipeId, item);
  if (!hasMaterials(cost)) {
    const missing = cost
      .filter((c) => (G.state.materials[c.id] ?? 0) < c.qty)
      .map((c) => `${c.qty}× ${MATERIAL_BY_ID[c.id]?.name ?? c.id}`)
      .join(', ');
    return no(`Needs ${missing}.`);
  }
  return ok();
}

/**
 * Runs a bench recipe against an item.
 * @returns {{ok: boolean, msg: string}}
 */
export function craft(recipeId, item) {
  const check = canAfford(recipeId, item);
  if (!check.ok) return check;

  const cost = costOf(recipeId, item);
  const before = item.name;
  let msg = '';

  switch (recipeId) {
    case 'temper':
      item.quality = clamp((item.quality ?? 0) + 5, 0, 20);
      msg = `${item.name} tempered to ${item.quality}% quality.`;
      break;

    case 'imbue':
      rerollAffixes(item, 'magic');
      msg = `${before} is now Magic: ${item.name}.`;
      break;

    case 'enrich':
      item.rarity = 'rare';
      item.rareName = null;
      refreshName(item);
      addRandomAffix(item);
      msg = `${before} is now Rare: ${item.name}.`;
      break;

    case 'reforge':
      item.rareName = null;
      rerollAffixes(item, 'rare');
      msg = `Reforged ${before} into ${item.name}.`;
      break;

    case 'augment':
      if (!addRandomAffix(item)) return no('No modifier could be added.');
      msg = `Augmented ${item.name}.`;
      break;

    case 'refine':
      for (const a of item.affixes) divineAffix(a, item.ilvl);
      if (item.rarity === 'unique') refineUnique(item);
      refreshName(item);
      msg = `Refined the values on ${item.name}.`;
      break;

    case 'strip':
      item.affixes = [];
      item.rarity = 'normal';
      item.rareName = null;
      refreshName(item);
      msg = `${before} was stripped back to Normal.`;
      break;

    case 'warp':
      msg = `${item.name}: ${corruptItem(item)}`;
      break;

    default:
      return no('That recipe does nothing here.');
  }

  spendMaterials(cost);
  G.state.stats.crafted = (G.state.stats.crafted ?? 0) + 1;
  log(msg, 'loot');
  emit('vault'); emit('materials'); refreshSheets();
  return ok(msg);
}

/**
 * Runs a recipe over and over — the Master's Bench privilege.
 *
 * Stops the moment it cannot continue rather than reporting a failure, because
 * "it ran seven times and then the essence ran out" is the answer, not an
 * error. Warp is excluded by the caller and not here: this module does not
 * know what a privilege is, and a one-way gamble repeated ten times is a
 * design decision rather than an arithmetic one.
 *
 * @returns {{ok: boolean, msg: string, times: number}}
 */
export function craftRepeat(recipeId, item, times) {
  let done = 0;
  let last = '';
  for (let i = 0; i < times; i++) {
    const res = craft(recipeId, item);
    if (!res.ok) break;
    last = res.msg;
    done++;
  }
  if (!done) return { ...canAfford(recipeId, item), times: 0 };
  return {
    ok: true,
    msg: done === 1 ? last : `${last} (×${done})`,
    times: done,
  };
}

/** Refine on a unique rerolls each preset mod within its range. */
function refineUnique(item) {
  const u = UNIQUE_BY_ID[item.uniqueId];
  if (!u) return;
  item.uniqueRolls = u.mods.map((mod) => {
    const v = rng.range(mod.r[0], mod.r[1]);
    return mod.dec ? Number(v.toFixed(mod.dec)) : Math.round(v);
  });
}

// ---------------------------------------------------------------------------
// Alchemy
// ---------------------------------------------------------------------------

/** Brews one batch of a flask. */
export function brew(flaskId) {
  const flask = FLASK_BY_ID[flaskId];
  if (!flask) return no('Unknown recipe.');
  const cost = flaskCost(flask);
  if (!hasMaterials(cost)) {
    const missing = cost
      .filter((c) => (G.state.materials[c.id] ?? 0) < c.qty)
      .map((c) => `${c.qty}× ${MATERIAL_BY_ID[c.id]?.name ?? c.id}`)
      .join(', ');
    return no(`Needs ${missing}.`);
  }
  spendMaterials(cost);
  addFlask(flaskId, flask.batch);
  G.state.stats.flasksBrewed = (G.state.stats.flasksBrewed ?? 0) + flask.batch;
  const msg = `Brewed ${flask.batch}× ${flask.name}.`;
  log(msg, 'loot');
  emit('materials');
  return ok(msg);
}

export { RECIPE_BY_ID, FLASK_BY_ID };
