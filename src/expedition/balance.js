// expedition/balance — The numbers every other expedition module scales against.

import { FLASK_BY_ID } from '../data/recipes.js';

export const SOFT_CAP_TIER = 20;

export const SOFT_LIFE = 1.075;

export const SOFT_DMG = 1.055;

export const MON_LIFE_BASE = 34;

export const MON_LIFE_GROWTH = 1.33;

export const MON_DMG_BASE = 6.5;

export const MON_DMG_GROWTH = 1.30;

export const MON_ARMOUR_BASE = 6;

export const MON_EV_BASE = 9;

export const MON_ACC_BASE = 30;

export const MON_DEF_GROWTH = 1.24;

export const MON_ACC_GROWTH = 1.22;

// Per level below the content, compounding on what you deal and take.
const GAP_OUTGOING = 0.075;
const GAP_INCOMING = 0.130;

export const WAVE_GAP = 1.1;      // seconds between waves

export const DAMAGE_TYPES = ['phys', 'fire', 'cold', 'light', 'chaos'];

export function tierScale(tier, base, growth, soft = SOFT_LIFE) {
  if (tier <= SOFT_CAP_TIER) return base * Math.pow(growth, tier - 1);
  return base * Math.pow(growth, SOFT_CAP_TIER - 1) * Math.pow(soft, tier - SOFT_CAP_TIER);
}

// ---------------------------------------------------------------------------
// Enemy construction
// ---------------------------------------------------------------------------

/** Stat effect of whatever flask this run is carrying. */
export function flaskFx(run) { return run.flaskId ? (FLASK_BY_ID[run.flaskId]?.effect ?? {}) : {}; }

/** Find-rate effect (rarity, gold) of this run's flask. */
export function flaskFind(run) { return run.flaskId ? (FLASK_BY_ID[run.flaskId]?.find ?? {}) : {}; }

/**
 * What it costs to fight above your level.
 *
 * Every dungeon states the level of what lives in it, and until now that was
 * decoration: enemy strength came from the tier and hero strength from levels
 * and gear, but the distance between the two was never consulted. A level-9
 * party could grind down level-33 content because two healers out-sustained
 * damage that never got any more threatening for being far above them.
 *
 * Being under-levelled now cuts what you deal and raises what you take, which
 * is a gap healing cannot close: out-sustaining an enemy is no longer a
 * substitute for being strong enough to fight it.
 *
 * Being over-levelled grants nothing. Clearing old content quickly is already
 * the reward for having outgrown it, and a bonus on top would only make the
 * spread between tiers wider than it needs to be.
 */
export function levelGap(heroLevel, contentLevel) {
  const gap = Math.max(0, contentLevel - heroLevel);
  if (gap === 0) return { outgoing: 1, incoming: 1 };
  return {
    outgoing: 1 / (1 + gap * GAP_OUTGOING),
    incoming: 1 + gap * GAP_INCOMING,
  };
}
