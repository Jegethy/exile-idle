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

export const WAVE_GAP = 1.1;             // seconds between waves

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
