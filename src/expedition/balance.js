// expedition/balance — The numbers every other expedition module scales against.

import { FLASK_BY_ID } from '../data/recipes.js';

export const SOFT_CAP_TIER = 20;

// Growth per tier past the soft cap, for enemies.
//
// These used to be 1.075 and 1.055, and they were measured wrong. Past Tier 20
// the recommended level and item level rise at *half* their earlier rate — 2.2
// a tier instead of 4.4 — so a party's power stops compounding the way it did
// below the cap. Measured across a full affix-band cycle, party damage grows
// about 4.1% a tier past the cap and effective health about 4.0%, against
// enemies growing 7.5% and 5.5%.
//
// A 3.4-point deficit every tier, compounding, is why content at a party's own
// level went from 98% clear at Tier 18 to 62% at Tier 20 and 19% at Tier 36.
// Deep tiers were not hard, they were arithmetically out of reach.
//
// Matched to what a party can actually achieve, keeping damage growing a
// little slower than life so that deep content kills by attrition rather than
// by one-shot.
export const SOFT_LIFE = 1.052;

export const SOFT_DMG = 1.038;

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

/**
 * Where fighting above your level stops being expensive and starts being
 * pointless.
 *
 * Ten levels, and it is a cliff rather than a slope on purpose. The gradual
 * version of this was measured doing far too little: a party eleven levels
 * under content still cleared it twenty times out of twenty, because a linear
 * penalty on damage dealt and taken is something enough gear can simply
 * out-stat. What it could not do was tell the player *why* a tier was out of
 * reach — Tier 11 was fine and Tier 12 was impossible, with nothing on screen
 * to say so.
 *
 * A cliff at a stated number is legible. The dispatch panel prints the level
 * of what lives down there, and now that number means something exact.
 */
export const GAP_CLIFF = 10;

/**
 * How often a hero simply cannot land a blow on something far above them.
 *
 * Nothing at all until the cliff, then most swings, rising to almost all of
 * them. This is not accuracy — accuracy is answered by more accuracy, and the
 * point of this is that no amount of gear answers being under-levelled.
 */
export function gapMissChance(heroLevel, contentLevel) {
  const gap = Math.max(0, contentLevel - heroLevel);
  if (gap < GAP_CLIFF) return 0;
  return Math.min(0.92, 0.55 + (gap - GAP_CLIFF) * 0.045);
}

/**
 * How often a blow from far above lands as a *crushing* one.
 *
 * A crushing blow ignores armour, resistances and block outright and lands
 * half again as hard. Mitigation is the other thing gear buys, so if the miss
 * chance above were the only cliff a party could still turtle behind a
 * Guardian and grind down anything at all, slowly. This closes that door: the
 * one thing you cannot gear your way out of is being ten levels down.
 */
export function gapCrushChance(heroLevel, contentLevel) {
  const gap = Math.max(0, contentLevel - heroLevel);
  if (gap < GAP_CLIFF) return 0;
  return Math.min(0.8, 0.2 + (gap - GAP_CLIFF) * 0.06);
}

/** What a crushing blow multiplies the hit by, on top of ignoring everything. */
export const CRUSH_MULT = 1.5;
