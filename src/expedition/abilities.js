// expedition/abilities — what a hero does beyond swinging.
//
// Every class has a passive profile that fires on its own: no clicking, no
// party micro-management. Internally these are ordinary cooldowns and triggers,
// which is the point — the same machinery would let a hero's ability be fired
// by hand later without the engine changing at all.
//
// A reaction is:
//   { trigger, key, chance?, cooldown?, run(ctx) }
//
// `ctx` is whatever the moment provides: { run, self, sheet, target, amount }.
// Reactions act through it; they never return anything.

import { rng } from '../rng.js';
import { log } from '../state.js';
import { fmt } from '../util.js';
import { CLASS_BY_ID } from '../data/heroclasses.js';
import { UNIQUE_BY_ID } from '../data/uniques.js';
import { applyEffect } from './effects.js';

/**
 * Every reaction a hero brings into a run: their class ability, plus the
 * effect of any unique item they are wearing.
 */
export function reactionsFor(hero, sheet) {
  const out = [];

  const cls = CLASS_BY_ID[hero.classId];
  if (cls?.ability?.reactions) out.push(...cls.ability.reactions);

  for (const slot of Object.keys(hero.equipment ?? {})) {
    const item = hero.equipment[slot];
    if (item?.rarity !== 'unique') continue;
    const def = UNIQUE_BY_ID[item.uniqueId];
    if (def?.reactions) out.push(...def.reactions);
  }

  // Scale-with-the-wearer values are resolved once here rather than on every
  // trigger, so a reaction never has to reach back into the stat sheet.
  for (const r of out) if (r.bind) r.bind(sheet);
  return out;
}

// ---------------------------------------------------------------------------
// Building blocks, so class and item definitions stay declarative
// ---------------------------------------------------------------------------

/** A timed modifier on the acting hero. */
export function selfBuff(id, name, mods, duration, extra = {}) {
  return (ctx) => {
    applyEffect(ctx.self, { id, name, mods, duration, ...extra });
  };
}

/** Damage over time on the struck enemy, as a share of the hit that applied it. */
export function dotFromHit(id, name, shareOfHit, duration) {
  return (ctx) => {
    if (!ctx.target || !ctx.amount) return;
    applyEffect(ctx.target, {
      id,
      name,
      duration,
      dps: (ctx.amount * shareOfHit) / duration,
      source: ctx.self.uid,
      onReapply: 'refresh',
    });
  };
}

/** Healing over time spread across the whole party. */
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

/** Announces something worth seeing, without flooding the log. */
export function announce(text, chance = 1, kind = 'crit') {
  return (ctx) => {
    if (rng.chance(chance)) log(text(ctx), kind);
  };
}

/** Runs several effects as one reaction. */
export function all(...fns) {
  return (ctx) => { for (const fn of fns) fn(ctx); };
}

export { fmt };
