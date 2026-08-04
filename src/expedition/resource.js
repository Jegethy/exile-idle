// expedition/resource — spending and earning, in one place.
//
// Everything that costs a hero something goes through spend(), so there is a
// single answer to "could they afford that?" and no caller has to remember
// which classes even have a pool. A class with no resource can afford
// everything, which keeps the check safe to put anywhere.

import { resourceFor } from '../data/resources.js';

/** Gives a combatant its pool, at whatever fraction its kind opens with. */
export function initResource(combatant, classId) {
  const kind = resourceFor(classId);
  if (!kind) {
    combatant.resource = null;
    return combatant;
  }
  combatant.resource = {
    kind: kind.id,
    max: kind.max,
    cur: kind.max * kind.start,
  };
  return combatant;
}

/** The definition behind a combatant's pool, or null. */
export function kindOf(combatant) {
  return combatant?.resource ? resourceFor(combatant.classId) : null;
}

/**
 * Can this combatant pay for `action`, and if so, pay.
 *
 * @param {object} c
 * @param {'heal'|'ability'|number} action  a named cost, or points directly
 * @returns {boolean} false when they cannot afford it, having spent nothing
 */
export function spend(c, action) {
  const kind = kindOf(c);
  if (!kind) return true;                    // no pool: everything is free
  const cost = typeof action === 'number' ? action : kind.costs[action];
  if (!cost) return true;                    // not priced
  if (c.resource.cur < cost) return false;
  c.resource.cur -= cost;
  return true;
}

/** Whether they could pay, without paying. */
export function canAfford(c, action) {
  const kind = kindOf(c);
  if (!kind) return true;
  const cost = typeof action === 'number' ? action : kind.costs[action];
  return !cost || c.resource.cur >= cost;
}

/**
 * Credits resource earned from something that happened in combat.
 * @param {'onHit'|'onTakeHit'|'onBlock'|'onKill'} event
 */
export function gain(c, event) {
  const kind = kindOf(c);
  if (!kind) return;
  const amount = kind.gain[event];
  if (!amount) return;
  c.resource.cur = Math.min(c.resource.max, c.resource.cur + amount);
}

/** Passive regeneration. */
export function tickResource(c, dt) {
  const kind = kindOf(c);
  if (!kind || !kind.regen) return;
  c.resource.cur = Math.min(c.resource.max, c.resource.cur + kind.regen * dt);
}

/** Fraction full, for a bar. */
export function resourcePct(c) {
  return c?.resource ? c.resource.cur / c.resource.max : 0;
}
