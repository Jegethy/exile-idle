// specs.js — the one decision a hero ever presents, and the refusal to undo it.
//
// A specialisation is chosen at level 15 and again at level 50, from three (or
// more) options the hero's class and first choice make available. It is
// permanent. There is no respec at any price, and this module is where that is
// enforced rather than merely intended: chooseSpec refuses to overwrite a slot
// that is already filled, so no caller anywhere — a UI bug, a future feature, a
// console — can quietly hand one back.
//
// Not choosing is allowed and always remains allowed. `defer` silences the
// prompt without spending anything, and the choice stays open at any later
// level. An unspecialised hero is simply weaker, which is a decision a player
// is entitled to make; forcing the choice would turn it into paperwork.

import { CLASS_BY_ID } from './data/heroclasses.js';
import { SPECS, SPEC_BY_ID, SPEC_LEVELS, specPoolFor } from './data/specs.js';
import { G, emit, log } from './state.js';
import { refreshSheets } from './sheets.js';
import { heroStats } from './stats.js';

export { SPEC_LEVELS, SPEC_BY_ID, SPECS };

/** The level at which `tier` unlocks. Tiers are 1-based; the array is not. */
export function levelFor(tier) {
  return SPEC_LEVELS[tier - 1] ?? Infinity;
}

/** The definitions a hero has taken, in tier order, skipping any since retired. */
export function specsOf(hero) {
  return (hero?.specs ?? []).map((id) => SPEC_BY_ID[id]).filter(Boolean);
}

/** The id a hero holds at `tier`, or null. */
export function specAt(hero, tier) {
  return hero?.specs?.[tier - 1] ?? null;
}

/**
 * What this hero could take at `tier` right now.
 *
 * Empty when the tier is already spent, when the hero is too low, or — for the
 * second tier — when the first has not been taken. That last one is the rule
 * the whole design rests on: a Bulwark can become a Defender and can never
 * become a Daredevil, because the second tier is drawn from the first.
 */
export function optionsFor(hero, tier) {
  if (!hero || specAt(hero, tier)) return [];
  if ((hero.level ?? 1) < levelFor(tier)) return [];
  const cls = CLASS_BY_ID[hero.classId];
  if (tier === 1) return specPoolFor(cls, 1);
  const first = specAt(hero, 1);
  return first ? specPoolFor(cls, 2, first) : [];
}

/**
 * The next tier this hero has earned and not yet spent, or 0.
 *
 * Deferring does not change the answer — a deferred choice is still owed. It
 * only stops the roster nagging about it, which is what `nagging` reads.
 */
export function pendingTier(hero) {
  for (let tier = 1; tier <= SPEC_LEVELS.length; tier++) {
    if (optionsFor(hero, tier).length) return tier;
  }
  return 0;
}

/** Whether this hero should be flagged on the roster as having a choice waiting. */
export function nagging(hero) {
  const tier = pendingTier(hero);
  return tier > 0 && (hero.specDeferred ?? 0) < tier;
}

/** Every hero with an unspent, un-deferred choice. */
export function heroesAwaitingChoice(state = G.state) {
  return (state?.heroes ?? []).filter(nagging);
}

/**
 * Silences the prompt for a hero without spending anything.
 *
 * The choice itself stays open forever — this only records that the player has
 * seen it and would rather not decide yet. Twelve heroes cross level 15 within
 * about an hour of each other, and a game that insists on twelve decisions
 * before it will stop flashing is a game that gets the decisions made at random.
 */
export function deferSpec(hero) {
  const tier = pendingTier(hero);
  if (!tier) return false;
  hero.specDeferred = tier;
  emit('roster');
  return true;
}

/**
 * Takes a specialisation. This is the irreversible one.
 *
 * @returns {{ok: boolean, msg: string}}
 */
export function chooseSpec(hero, specId) {
  const spec = SPEC_BY_ID[specId];
  if (!hero || !spec) return { ok: false, msg: 'No such specialisation.' };

  const { tier } = spec;
  // Refused here rather than merely hidden in the UI. A permanent choice that
  // any caller could overwrite is not permanent, it is undocumented.
  if (specAt(hero, tier)) {
    return {
      ok: false,
      msg: `${hero.name} is already ${SPEC_BY_ID[specAt(hero, tier)]?.name ?? 'specialised'}, `
        + 'and that cannot be changed.',
    };
  }
  if (!optionsFor(hero, tier).some((s) => s.id === specId)) {
    return { ok: false, msg: `${hero.name} cannot become a ${spec.name}.` };
  }

  hero.specs ??= [];
  hero.specs[tier - 1] = specId;
  hero.specDeferred = 0;

  refreshSheets();
  log(`${hero.name} is now a ${spec.name}. There is no going back.`, 'unique');
  emit('roster');
  return { ok: true, msg: `${hero.name} is now a ${spec.name}.` };
}

/**
 * What taking `spec` would do to this hero's sheet, right now.
 *
 * The choice screen shows these rather than the flavour text, because the
 * choice is permanent and "Berserker sounded good" is not a decision anybody
 * should have to make. Only the flat stat lines can be previewed this way —
 * a reaction's worth cannot be read off a sheet, which is what the description
 * is for.
 *
 * @returns {Array<{label: string, before: number, after: number}>}
 */
export function previewSpec(hero, specId) {
  const spec = SPEC_BY_ID[specId];
  if (!hero || !spec?.stats) return [];

  const before = heroStats(hero, G.state?.upgrades ?? {});
  const saved = hero.specs ? hero.specs.slice() : [];
  hero.specs = saved.slice();
  hero.specs[spec.tier - 1] = specId;
  let after;
  try { after = heroStats(hero, G.state?.upgrades ?? {}); } finally { hero.specs = saved; }

  const rows = [];
  for (const [label, key] of PREVIEW_FIELDS) {
    const a = before[key];
    const b = after[key];
    if (typeof a !== 'number' || Math.round(a) === Math.round(b)) continue;
    rows.push({ label, before: a, after: b });
  }
  return rows;
}

/** Sheet fields worth showing side by side, in the order a player reads them. */
const PREVIEW_FIELDS = [
  ['Damage', 'dps'],
  ['Life', 'life'],
  ['Armour', 'armour'],
  ['Evasion', 'evasion'],
  ['Healing', 'healPower'],
  ['Block (melee)', 'blockMelee'],
  ['Block (spells)', 'blockSpell'],
];

/**
 * Gives an older save the field, and drops anything since retired.
 *
 * Saves predate this system, so every returning hero arrives without it. A
 * missing array is the unspecialised state and needs nothing done to it; what
 * does need doing is clearing an id that no longer exists, which would
 * otherwise sit in the slot forever blocking a choice it can no longer make.
 */
export function migrateSpecs(hero) {
  if (!Array.isArray(hero.specs)) { hero.specs = []; return false; }
  let changed = false;
  for (let i = 0; i < hero.specs.length; i++) {
    const id = hero.specs[i];
    if (id && !SPEC_BY_ID[id]) { hero.specs[i] = null; changed = true; }
  }
  return changed;
}
