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
import { healHero } from './vitals.js';

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
      // Scoped to whoever applied it: two Wizards burning the same target
      // should burn it twice, not take turns overwriting one another.
      id: `${id}:${ctx.self.uid}`,
      name,
      duration,
      dps: (ctx.amount * shareOfHit) / duration,
      source: ctx.self.uid,
    });
  };
}

/** Healing over time on every standing ally. */
export function partyHot(id, name, totalPerAlly, duration, extra = {}) {
  return (ctx) => {
    for (const ally of ctx.run.combatants) {
      if (ally.down) continue;
      applyEffect(ally, {
        id: `${id}:${ctx.self.uid}`, name, duration,
        hps: totalPerAlly / duration, source: ctx.self.uid, ...extra,
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

/**
 * Heals the most wounded standing ally for a share of the triggering amount,
 * crediting the healer. Returns through vitals so overhealing does not pay and
 * the contribution figures stay honest.
 */
export function healWounded(share) {
  return (ctx) => {
    const wounded = ctx.run.combatants
      .filter((x) => !x.down && x.life < x.maxLife)
      .sort((a, b) => (a.life / a.maxLife) - (b.life / b.maxLife))[0];
    if (wounded) healHero(wounded, (ctx.amount ?? 0) * share, ctx.self);
    ctx.healed = wounded ?? null;
  };
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
