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
import { kindOf } from './resource.js';

/** A timed modifier on whoever acted. */
export function selfBuff(id, name, mods, duration, extra = {}) {
  return (ctx) => {
    applyEffect(ctx.self, { id, name, mods, duration, ...extra });
  };
}

/**
 * A timed modifier on every standing ally, including the one who acted.
 *
 * Scoped to the source, so two heroes carrying the same aura both contribute
 * rather than taking turns overwriting each other. Four class abilities had
 * hand-rolled this loop before the specialisations wanted it a dozen more
 * times.
 */
export function partyBuff(id, name, mods, duration = Infinity) {
  return (ctx) => {
    for (const ally of ctx.run.combatants) {
      if (ally.down) continue;
      applyEffect(ally, {
        id: `${id}:${ctx.self.uid}`, name, mods, duration, source: ctx.self.uid,
      });
    }
  };
}

/** A timed modifier on one other combatant, usually the target of the trigger. */
export function buffTarget(id, name, mods, duration) {
  return (ctx) => {
    if (!ctx.target || ctx.target.down) return;
    applyEffect(ctx.target, {
      id: `${id}:${ctx.self.uid}`, name, mods, duration, source: ctx.self.uid,
    });
  };
}

/**
 * Puts points back into whoever acted, never past their maximum.
 *
 * A class with no pool is unaffected rather than erroring — the same rule
 * spend() follows, so a reaction that refunds is safe to hang on any trigger.
 */
export function restoreResource(amount) {
  return (ctx) => {
    const r = ctx.self?.resource;
    if (!r || !kindOf(ctx.self)) return;
    r.cur = Math.min(r.max, r.cur + amount);
  };
}

/**
 * A self buff whose size is read from how badly hurt the hero is.
 *
 * "Stronger as life falls" cannot be a static modifier — it has to be recomputed
 * as the fight turns. Hanging it on `takeHit` is what makes that true without
 * the combat tick having to know the idea exists: a hero being beaten on is
 * getting the value refreshed constantly, and a hero standing untouched at full
 * life does not need it.
 */
export function woundScaledBuff(id, name, key, maxBonus, duration = 6) {
  return (ctx) => {
    const missing = 1 - (ctx.self.life / Math.max(1, ctx.self.maxLife));
    if (missing <= 0) return;
    applyEffect(ctx.self, {
      id, name, duration, rescale: true, mods: { [key]: Math.round(maxBonus * missing) },
    });
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
 * Queues damage dealt straight to an enemy, outside the swing that caused it.
 *
 * Declarative, like repeatAttack and for the same reason: dealing it here would
 * mean knowing how an enemy dies, which lives in the combat tick, which already
 * imports this. The engine drains the queue once the trigger has finished — see
 * resolveStrikes.
 *
 * Only `hit`, `crit` and `kill` carry a queue, those being the moments a strike
 * makes sense. Called from anywhere else it does nothing, deliberately: the
 * alternative is a reaction that appears to work and silently never lands.
 */
export function dealDamage(ctx, enemy, amount) {
  if (!ctx?.strikes || !enemy || enemy.life <= 0 || !(amount > 0)) return;
  ctx.strikes.push({ enemy, amount });
}

/**
 * Sprays a share of the hit over every *other* enemy.
 *
 * The struck target is excluded on purpose, which is what makes this a cleave
 * rather than simply more damage: it is worth nothing against a lone enemy and
 * a great deal against a full wave, so it is a reason to bring something rather
 * than a number that is always on.
 */
export function cleave(shareOfHit) {
  return (ctx) => {
    if (!ctx.amount) return;
    for (const enemy of ctx.run.enemies) {
      if (enemy === ctx.target) continue;
      dealDamage(ctx, enemy, ctx.amount * shareOfHit);
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
