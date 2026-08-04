// expedition/effects — anything that is true for a period of time.
//
// Combat used to be stateless: a turn rolled damage, applied it and returned,
// so nothing could be true for three seconds. Classes that burst, heals that
// tick, uniques that trigger on a block — all of them need somewhere to live
// between turns. This is that place.
//
// Two concepts, deliberately kept apart:
//
//   effects   a modifier or a repeating tick attached to one combatant for a
//             duration. Buffs, debuffs, damage over time, healing over time.
//   triggers  a named moment ('hit', 'block', 'kill', ...) that abilities and
//             unique items subscribe to. Firing one is how anything reacts.
//
// Everything counts in seconds of *combat* time and advances on the same `dt`
// as the tick, so game speed and the tutorial's acceleration cannot desync it.

import { rng } from '../rng.js';
import { clamp } from '../util.js';
import { spend } from './resource.js';

/** Modifier keys an effect may contribute. Anything else is ignored. */
export const MOD_KEYS = [
  'incDamage', 'incAtkSpeed', 'incArmour', 'incEvasion', 'incHeal', 'incCrit', 'incAccuracy',
  // Written only by contract modifiers so far, but ordinary keys: a unique
  // or a class ability could use any of them tomorrow.
  'critMulti', 'missChance', 'cooldownMult', 'capHeal', 'resAll', 'ignoreThreat',
  'blockMelee', 'blockSpell', 'damageTaken', 'lifeRegenPct', 'threat',
  // Reduction against one school specifically, which is how a ward over the
  // party differs from simply being sturdier.
  'meleeResist', 'spellResist',
  // How fast a hero's pool refills. This is what a support class trades its
  // own damage for: it does not heal, it makes the healer able to keep going.
  'resourceRegen',
];

/**
 * @typedef {object} Effect
 * @property {string} id          - stacking identity; same id refreshes or stacks
 * @property {string} name        - shown in the log and on the combatant
 * @property {number} duration    - seconds remaining; Infinity for a whole run
 * @property {object} [mods]      - flat contributions keyed by MOD_KEYS
 * @property {number} [dps]       - damage per second while it lasts
 * @property {number} [hps]       - healing per second while it lasts
 * @property {'refresh'|'stack'|'ignore'} [onReapply] - default 'refresh'
 * @property {number} [stacks]    - current stack count
 * @property {number} [maxStacks]
 * @property {number} [decay]     - fraction of magnitude lost per second
 * @property {string} [source]    - uid of whoever applied it, for attribution
 */

/** Gives a combatant or enemy somewhere to hold effects. */
export function initEffects(target) {
  target.effects = [];
  return target;
}

/**
 * Applies an effect, respecting its stacking rule.
 * @returns {boolean} true if anything changed
 */
export function applyEffect(target, effect) {
  if (!target || target.down) return false;
  if (!target.effects) initEffects(target);

  const existing = target.effects.find((e) => e.id === effect.id);
  if (existing) {
    const rule = effect.onReapply ?? 'refresh';
    if (rule === 'ignore') return false;
    if (rule === 'stack') {
      const cap = effect.maxStacks ?? Infinity;
      if (existing.stacks >= cap) {
        existing.duration = Math.max(existing.duration, effect.duration);
        return false;
      }
      existing.stacks += 1;
    }
    // Refreshing never downgrades. A weaker reapply must not cut a strong one
    // short, and a stronger one should take over — otherwise the first hit of
    // a fight would pin a damage-over-time effect at its weakest value.
    existing.duration = Math.max(existing.duration, effect.duration);
    if (effect.dps) existing.dps = Math.max(existing.dps ?? 0, effect.dps);
    if (effect.hps) existing.hps = Math.max(existing.hps ?? 0, effect.hps);
    return true;
  }

  target.effects.push({
    stacks: 1, maxStacks: 1, onReapply: 'refresh', mods: {},
    ...effect,
    // `magnitude` decays independently of duration so an opener can taper.
    magnitude: 1,
  });
  return true;
}

/** Removes an effect by id. */
export function removeEffect(target, id) {
  if (!target?.effects) return false;
  const i = target.effects.findIndex((e) => e.id === id);
  if (i < 0) return false;
  target.effects.splice(i, 1);
  return true;
}

export function hasEffect(target, id) {
  return !!target?.effects?.some((e) => e.id === id);
}

/**
 * Total contribution of every active effect for one modifier key.
 * Scaled by stacks and by any decay the effect has undergone.
 */
export function modFrom(target, key) {
  if (!target?.effects?.length) return 0;
  let total = 0;
  for (const e of target.effects) {
    const v = e.mods?.[key];
    if (v) total += v * e.stacks * e.magnitude;
  }
  return total;
}

/**
 * Advances every effect on `target` by `dt`.
 *
 * @param {object} target
 * @param {number} dt
 * @param {{onDamage: function, onHeal: function, onExpire: function}} hooks
 */
export function tickEffects(target, dt, hooks = {}) {
  const list = target?.effects;
  if (!list?.length) return;

  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];

    if (e.decay) {
      // Taper toward nothing rather than dropping off a cliff at expiry.
      e.magnitude = clamp(e.magnitude - e.decay * dt, 0, 1);
    }

    if (e.dps) hooks.onDamage?.(e.dps * e.stacks * e.magnitude * dt, e);
    if (e.hps) hooks.onHeal?.(e.hps * e.stacks * e.magnitude * dt, e);

    e.duration -= dt;
    if (e.duration <= 0 || (e.decay && e.magnitude <= 0)) {
      list.splice(i, 1);
      hooks.onExpire?.(e);
    }
  }
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/**
 * Named moments anything can react to. Kept as a closed list so a typo in a
 * unique item's definition fails loudly rather than silently never firing.
 */
export const TRIGGERS = [
  'combatStart',   // a wave begins
  'hit',           // this combatant landed an attack
  'crit',          // ...and it was a critical
  'takeHit',       // this combatant was hit
  'block',         // this combatant blocked
  'kill',          // this combatant killed something
  'heal',          // this combatant healed someone
  'allyDown',      // an ally fell
  'allyLow',       // an ally dropped below half life
];

/**
 * Collects every reaction a combatant has for `trigger` — from their class
 * ability and from any unique item they are wearing — and fires the ones whose
 * chance rolls true.
 *
 * `ctx` carries whatever the moment provides: { run, self, target, amount }.
 * A reaction returns nothing; it acts through the context it is given.
 */
export function fireTrigger(trigger, ctx) {
  const reactions = ctx.self?.reactions?.[trigger];
  if (!reactions?.length) return;
  for (const r of reactions) {
    if (r.chance != null && !rng.chance(r.chance)) continue;
    // A class ability costs the hero's resource; an item's effect does not.
    // Paying is checked after the roll and before the cooldown, so a reaction
    // that could not be afforded has not burnt its cooldown either.
    if (r.costs && !spend(ctx.self, r.costs)) continue;
    if (r.cooldown) {
      const until = ctx.self.cooldowns?.[r.key] ?? 0;
      if (ctx.run.elapsed < until) continue;
      // A contract can stretch every cooldown in the run at once.
      const stretch = 1 + modFrom(ctx.self, 'cooldownMult') / 100;
      ctx.self.cooldowns[r.key] = ctx.run.elapsed + r.cooldown * stretch;
    }
    r.run(ctx);
  }
}

/**
 * Indexes a combatant's reactions by trigger so firing one is a lookup rather
 * than a scan. Call once when the run is built.
 *
 * @param {object} combatant
 * @param {Array<{trigger: string, key: string, chance?: number,
 *   cooldown?: number, run: function}>} sources
 */
export function bindReactions(combatant, sources) {
  combatant.reactions = {};
  combatant.cooldowns = {};
  for (const r of sources) {
    if (!TRIGGERS.includes(r.trigger)) {
      throw new Error(`unknown trigger "${r.trigger}" on ${r.key ?? 'reaction'}`);
    }
    (combatant.reactions[r.trigger] ??= []).push(r);
  }
  return combatant;
}
