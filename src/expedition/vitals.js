// expedition/vitals — the only two ways a hero's life changes.
//
// Every source of damage and healing funnels through here: swings, damage over
// time, leech, class abilities, unique effects. That is what makes "a hero can
// be finished by a bleed" true without each caller reimplementing death, and
// what makes the per-hero contribution figures trustworthy — there is nowhere
// else for a point of damage to come from.
//
// Imports nothing from the combat tick or from game data, so both the engine
// and the reaction vocabulary can use it without a cycle.

import { G, emit, log } from '../state.js';
import { fireTrigger } from './effects.js';

/**
 * Applies damage to a hero, through energy shield first.
 *
 * @param {object} run
 * @param {object} c      the hero taking it
 * @param {number} amount
 * @param {object} [from] combatant credited, when an ally caused it
 */
export function damageHero(run, c, amount, from = null) {
  if (c.down || amount <= 0) return 0;

  let left = amount;
  // Wards are spent first: they are the healing that arrived before the blow.
  if (c.ward > 0) {
    const absorbed = Math.min(c.ward, left);
    c.ward -= absorbed;
    left -= absorbed;
  }
  if (c.es > 0) {
    const absorbed = Math.min(c.es, left);
    c.es -= absorbed;
    left -= absorbed;
  }
  c.life -= left;
  c.damageTaken = (c.damageTaken ?? 0) + amount;
  if (from) from.damageDealt = (from.damageDealt ?? 0) + amount;

  if (c.life <= 0) {
    c.life = 0;
    c.down = true;
    G.state.stats.heroDeaths++;
    log(`${c.name} has fallen in ${run.name}.`, 'danger');
    for (const ally of run.combatants) {
      if (ally !== c && !ally.down) fireTrigger('allyDown', { run, self: ally, target: c });
    }
    emit('expeditions');
    return amount;
  }

  // Announced once per crossing, not on every tick spent below the line.
  if (c.life < c.maxLife * 0.5 && !c.wasLow) {
    c.wasLow = true;
    for (const ally of run.combatants) {
      if (!ally.down) fireTrigger('allyLow', { run, self: ally, target: c });
    }
  }
  return amount;
}

/**
 * Restores life to a hero, never past their maximum.
 *
 * @returns {number} the amount actually restored, which is what a heal-based
 *   effect should scale off — overhealing should not pay.
 */
export function healHero(c, amount, from = null) {
  if (c.down || amount <= 0) return 0;
  const healed = Math.min(amount, c.maxLife - c.life);
  c.life += healed;
  if (from) from.healingDone = (from.healingDone ?? 0) + healed;
  if (c.life >= c.maxLife * 0.5) c.wasLow = false;
  return healed;
}

/**
 * Adds an absorb shield, capped as a share of the hero's maximum life.
 *
 * This is what healing that would otherwise have been wasted turns into. A
 * heal-over-time spread across a whole party mostly lands on people who are
 * fine; converting that overflow into a ward is what makes preparing for
 * damage a different job from reacting to it.
 *
 * @returns {number} the amount actually banked
 */
export function addWard(c, amount, capFraction = 0.20, from = null) {
  if (c.down || amount <= 0) return 0;
  const cap = c.maxLife * capFraction;
  const banked = Math.min(amount, Math.max(0, cap - (c.ward ?? 0)));
  c.ward = (c.ward ?? 0) + banked;
  // Warding counts as healing done: it is the same throughput, spent early.
  if (from && banked > 0) from.healingDone = (from.healingDone ?? 0) + banked;
  return banked;
}

/** Zeroes the per-run contribution counters. */
export function initVitals(c) {
  c.damageDealt = 0;
  c.damageTaken = 0;
  c.healingDone = 0;
  c.ward = 0;
  return c;
}
