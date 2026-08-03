// expedition/reactions — the vocabulary class and item definitions are written in.
//
// Deliberately knows nothing about classes, items or combat: it builds
// reactions out of the effects layer and nothing else. That is what lets
// data/heroclasses.js and data/uniques.js import it without the data and the
// engine importing each other in a circle.
//
// A reaction is a function of the trigger context:
//   { run, self, sheet, target, amount, kind, depth }

import { rng } from '../rng.js';
import { log } from '../state.js';
import { applyEffect } from './effects.js';

/** A timed modifier on whoever acted. */
export function selfBuff(id, name, mods, duration, extra = {}) {
  return (ctx) => {
    applyEffect(ctx.self, { id, name, mods, duration, ...extra });
  };
}

/** Damage over time on the struck target, as a share of the hit that applied it. */
export function dotFromHit(id, name, shareOfHit, duration) {
  return (ctx) => {
    if (!ctx.target || !ctx.amount) return;
    applyEffect(ctx.target, {
      id,
      name,
      duration,
      dps: (ctx.amount * shareOfHit) / duration,
      source: ctx.self.uid,
    });
  };
}

/** Healing over time on every standing ally. */
export function partyHot(id, name, totalPerAlly, duration) {
  return (ctx) => {
    for (const ally of ctx.run.combatants) {
      if (ally.down) continue;
      applyEffect(ally, {
        id, name, duration, hps: totalPerAlly / duration, source: ctx.self.uid,
      });
    }
  };
}

/**
 * Asks for the attack to be resolved a second time.
 *
 * Declarative on purpose: a reaction that called back into the combat module
 * would put the item data and the engine in a cycle. The swing checks this
 * flag after its triggers have fired, and enforces the recursion limit itself.
 */
export function repeatAttack() {
  return (ctx) => { ctx.repeat = true; };
}

/** Says something in the guild log, occasionally rather than every time. */
export function announce(text, chance = 1, kind = 'crit') {
  return (ctx) => {
    if (rng.chance(chance)) log(text(ctx), kind);
  };
}

/** Runs several reactions as one. */
export function all(...fns) {
  return (ctx) => { for (const fn of fns) fn(ctx); };
}
