// expedition/abilities — collecting what a hero reacts to.
//
// The vocabulary reactions are written in lives in ./reactions.js, which knows
// nothing about classes or items. This module is the other half: it reads the
// data and hands the engine a flat list. Keeping the two apart is what stops
// the data and the engine importing each other in a circle.

import { CLASS_BY_ID } from '../data/heroclasses.js';
import { UNIQUE_BY_ID } from '../data/uniques.js';

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

  // Values that scale with the wearer are resolved once, here, so a reaction
  // never has to reach back into the stat sheet while combat is running.
  for (const r of out) if (r.bind) r.bind(sheet);
  return out;
}
