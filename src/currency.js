// currency.js — applying crafting orbs to equipment. Data lives in data/currency.js.

import { rng } from './rng.js';
import { clamp } from './util.js';
import { log, emit } from './state.js';
import { spendOrb, hasOrb } from './inventory.js';
import { CURRENCY_BY_ID } from './data/currency.js';
import { AFFIX_BY_ID } from './data/affixes.js';
import { UNIQUE_BY_ID } from './data/uniques.js';
import {
  addRandomAffix, rerollAffixes, refreshName, divineAffix, openAffixSlots,
  corruptItem, IMPLICIT_BY_ID,
} from './items.js';

const ok = (msg) => ({ ok: true, msg });
const no = (msg) => ({ ok: false, msg });

/** Can `orbId` legally be used on `item`? Returns { ok, msg }. */
export function canApply(orbId, item) {
  if (!item) return no('No item selected.');
  const c = CURRENCY_BY_ID[orbId];
  if (!c) return no('Unknown orb.');
  if (orbId === 'scroll') return no('Scrolls of Wisdom are only worth their scrap value.');

  if (item.corrupted) {
    return orbId === 'vaal' ? no('Already corrupted.') : no('Corrupted items cannot be modified.');
  }

  const r = item.rarity;
  switch (orbId) {
    case 'transmute':
      return r === 'normal' ? ok() : no('Requires a Normal item.');
    case 'augment':
      if (r !== 'magic') return no('Requires a Magic item.');
      return openAffixSlots(item).total > 0 ? ok() : no('No open modifier slots.');
    case 'alteration':
      return r === 'magic' ? ok() : no('Requires a Magic item.');
    case 'regal':
      return r === 'magic' ? ok() : no('Requires a Magic item.');
    case 'alchemy':
      return r === 'normal' ? ok() : no('Requires a Normal item.');
    case 'chaos':
      return r === 'rare' ? ok() : no('Requires a Rare item.');
    case 'exalt':
      if (r !== 'rare') return no('Requires a Rare item.');
      return openAffixSlots(item).total > 0 ? ok() : no('No open modifier slots.');
    case 'annul':
      return item.affixes.length > 0 ? ok() : no('Item has no modifiers to remove.');
    case 'scour':
      return r === 'magic' || r === 'rare' ? ok() : no('Requires a Magic or Rare item.');
    case 'divine':
      if (r === 'unique') return ok();
      return item.affixes.length > 0 || item.implicit ? ok() : no('Item has no values to reroll.');
    case 'blessed':
      return item.implicit ? ok() : no('Item has no implicit modifier.');
    case 'whetstone':
      return (item.quality ?? 0) < 20 ? ok() : no('Already at maximum quality.');
    case 'vaal':
      return ok();
    default:
      return no('That orb has no effect here.');
  }
}

/**
 * Applies an orb from the guild's stock to a piece of equipment.
 * @returns {{ok: boolean, msg: string}}
 */
export function applyOrb(orbId, item) {
  const check = canApply(orbId, item);
  if (!check.ok) return check;
  if (!hasOrb(orbId, 1)) return no(`You have no ${CURRENCY_BY_ID[orbId].name}s.`);

  const before = item.name;
  let msg = '';

  switch (orbId) {
    case 'transmute':
      rerollAffixes(item, 'magic');
      msg = `${before} is now Magic.`;
      break;

    case 'alteration':
      rerollAffixes(item, 'magic');
      msg = `Rerolled ${before} → ${item.name}.`;
      break;

    case 'augment':
      if (!addRandomAffix(item)) return no('No modifier could be added.');
      msg = `Added a modifier to ${item.name}.`;
      break;

    case 'regal':
      item.rarity = 'rare';
      item.rareName = null;
      refreshName(item);
      addRandomAffix(item);          // a full item is still a valid outcome
      msg = `${before} is now Rare: ${item.name}.`;
      break;

    case 'alchemy':
      item.rareName = null;
      rerollAffixes(item, 'rare');
      msg = `${before} is now Rare: ${item.name}.`;
      break;

    case 'chaos':
      item.rareName = null;
      rerollAffixes(item, 'rare');
      msg = `Rerolled ${before} → ${item.name}.`;
      break;

    case 'exalt': {
      if (!addRandomAffix(item)) return no('No modifier could be added.');
      const last = item.affixes[item.affixes.length - 1];
      msg = `Exalted ${item.name}: ${AFFIX_BY_ID[last.defId]?.text(last.values)}.`;
      break;
    }

    case 'annul':
      item.affixes.splice(rng.int(0, item.affixes.length - 1), 1);
      refreshName(item);
      msg = `A modifier was annulled from ${item.name}.`;
      break;

    case 'scour':
      item.affixes = [];
      item.rarity = 'normal';
      item.rareName = null;
      refreshName(item);
      msg = `${before} was scoured clean.`;
      break;

    case 'divine':
      for (const a of item.affixes) divineAffix(a, item.ilvl);
      if (item.rarity === 'unique') divineUnique(item);
      refreshName(item);
      msg = `Rerolled the values on ${item.name}.`;
      break;

    case 'blessed': {
      const def = IMPLICIT_BY_ID[item.implicit.defId];
      const v = rng.range(def.r[0], def.r[1]);
      item.implicit.values[0] = def.dec ? Number(v.toFixed(def.dec)) : Math.round(v);
      msg = `Rerolled the implicit on ${item.name}.`;
      break;
    }

    case 'whetstone':
      item.quality = clamp((item.quality ?? 0) + 5, 0, 20);
      msg = `${item.name} is now ${item.quality}% quality.`;
      break;

    case 'vaal':
      msg = `${item.name}: ${corruptItem(item)}`;
      break;

    default:
      return no('That orb has no effect here.');
  }

  spendOrb(orbId, 1);
  log(msg, 'loot');
  emit('vault'); emit('sheets');
  return ok(msg);
}

/** Divine on a unique rerolls each preset mod within its range. */
function divineUnique(item) {
  const u = UNIQUE_BY_ID[item.uniqueId];
  if (!u) return;
  item.uniqueRolls = u.mods.map((mod) => {
    const v = rng.range(mod.r[0], mod.r[1]);
    return mod.dec ? Number(v.toFixed(mod.dec)) : Math.round(v);
  });
}
