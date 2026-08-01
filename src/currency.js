// currency.js — applying orbs to items. Data lives in data/currency.js.

import { rng } from './rng.js';
import { clamp } from './util.js';
import { log, emit } from './state.js';
import { spendCurrency, hasCurrency } from './inventory.js';
import { CURRENCY_BY_ID } from './data/currency.js';
import { AFFIX_BY_ID } from './data/affixes.js';
import { MAP_MOD_BY_ID } from './data/mapmods.js';
import { UNIQUE_BY_ID } from './data/uniques.js';
import {
  addRandomAffix, rerollAffixes, refreshName, divineAffix, openAffixSlots,
  corruptItem, IMPLICIT_BY_ID,
} from './items.js';
import { rollMapMods, addMapMod } from './maps.js';

const ok = (msg) => ({ ok: true, msg });
const no = (msg) => ({ ok: false, msg });

/** Can `currencyId` legally be used on `item`? Returns { ok, msg }. */
export function canApply(currencyId, item) {
  if (!item) return no('No item selected.');
  const c = CURRENCY_BY_ID[currencyId];
  if (!c) return no('Unknown currency.');
  if (currencyId === 'scroll') return no('Scrolls of Wisdom cannot be used on items.');
  if (currencyId === 'fragment') return no('Fragments are used to summon Pinnacle Bosses.');

  if (item.corrupted && currencyId !== 'vaal') return no('Corrupted items cannot be modified.');
  if (item.corrupted && currencyId === 'vaal') return no('Already corrupted.');

  const isMap = item.kind === 'map';
  const r = item.rarity;

  switch (currencyId) {
    case 'transmute':
      return r === 'normal' ? ok() : no('Requires a Normal item.');
    case 'augment':
      if (r !== 'magic') return no('Requires a Magic item.');
      return openSlots(item) > 0 ? ok() : no('No open modifier slots.');
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
      return openSlots(item) > 0 ? ok() : no('No open modifier slots.');
    case 'annul':
      return modCount(item) > 0 ? ok() : no('Item has no modifiers to remove.');
    case 'scour':
      return r === 'magic' || r === 'rare' ? ok() : no('Requires a Magic or Rare item.');
    case 'divine':
      if (r === 'unique') return ok();
      return modCount(item) > 0 || item.implicit ? ok() : no('Item has no values to reroll.');
    case 'blessed':
      if (isMap) return no('Maps have no implicit modifier.');
      return item.implicit ? ok() : no('Item has no implicit modifier.');
    case 'chisel':
      if (!isMap) return no('Chisels can only be used on Maps.');
      return (item.quality ?? 0) < 20 ? ok() : no('Map is already at maximum quality.');
    case 'vaal':
      return ok();
    default:
      return no('That orb has no effect here.');
  }
}

function openSlots(item) {
  if (item.kind === 'map') {
    const cap = item.rarity === 'magic' ? 1 : 3;
    const pre = item.mods.filter((m) => isMapPrefix(m)).length;
    return (cap - pre) + (cap - (item.mods.length - pre));
  }
  return openAffixSlots(item).total;
}

function isMapPrefix(m) {
  return MAP_MOD_BY_ID[m.defId]?.type === 'prefix';
}

function modCount(item) {
  return item.kind === 'map' ? item.mods.length : item.affixes.length;
}

/**
 * Applies an orb from the stash to an item. Handles both gear and maps.
 * @returns {{ok: boolean, msg: string}}
 */
export function applyCurrency(currencyId, item) {
  const check = canApply(currencyId, item);
  if (!check.ok) return check;
  if (!hasCurrency(currencyId, 1)) return no(`You have no ${CURRENCY_BY_ID[currencyId].name}s.`);

  const isMap = item.kind === 'map';
  const before = item.name;
  let msg = '';

  switch (currencyId) {
    case 'transmute':
      isMap ? rollMapMods(item, 'magic') : rerollAffixes(item, 'magic');
      msg = `${before} is now Magic.`;
      break;

    case 'alteration':
      isMap ? rollMapMods(item, 'magic') : rerollAffixes(item, 'magic');
      msg = `Rerolled ${before} → ${item.name}.`;
      break;

    case 'augment':
      if (isMap ? !addMapMod(item) : !addRandomAffix(item)) return no('No modifier could be added.');
      msg = `Added a modifier to ${item.name}.`;
      break;

    case 'regal':
      item.rarity = 'rare';
      if (!isMap) { item.rareName = null; refreshName(item); }
      if (isMap ? !addMapMod(item) : !addRandomAffix(item)) { /* full is still a valid outcome */ }
      msg = `${before} is now Rare: ${item.name}.`;
      break;

    case 'alchemy':
      if (!isMap) item.rareName = null;
      isMap ? rollMapMods(item, 'rare') : rerollAffixes(item, 'rare');
      msg = `${before} is now Rare: ${item.name}.`;
      break;

    case 'chaos':
      if (!isMap) item.rareName = null;
      isMap ? rollMapMods(item, 'rare') : rerollAffixes(item, 'rare');
      msg = `Rerolled ${before} → ${item.name}.`;
      break;

    case 'exalt': {
      const added = isMap ? addMapMod(item) : addRandomAffix(item);
      if (!added) return no('No modifier could be added.');
      const last = isMap ? item.mods[item.mods.length - 1] : item.affixes[item.affixes.length - 1];
      const label = isMap
        ? `a new map modifier`
        : AFFIX_BY_ID[last.defId]?.text(last.values);
      msg = `Exalted ${item.name}: ${label}.`;
      break;
    }

    case 'annul': {
      const list = isMap ? item.mods : item.affixes;
      const i = rng.int(0, list.length - 1);
      list.splice(i, 1);
      if (!isMap) refreshName(item);
      msg = `A modifier was annulled from ${item.name}.`;
      break;
    }

    case 'scour':
      if (isMap) { item.mods = []; item.rarity = 'normal'; }
      else { item.affixes = []; item.rarity = 'normal'; item.rareName = null; refreshName(item); }
      msg = `${before} was scoured clean.`;
      break;

    case 'divine': {
      if (isMap) {
        for (const m of item.mods) {
          const def = MAP_MOD_BY_ID[m.defId];
          if (def && def.r[1] !== def.r[0]) m.value = rng.int(def.r[0], def.r[1]);
        }
      } else {
        for (const a of item.affixes) divineAffix(a, item.ilvl);
        if (item.rarity === 'unique') divineUnique(item);
        refreshName(item);
      }
      msg = `Rerolled the values on ${item.name}.`;
      break;
    }

    case 'blessed': {
      const def = IMPLICIT_BY_ID[item.implicit.defId];
      const [lo, hi] = def.r;
      const v = rng.range(lo, hi);
      item.implicit.values[0] = def.dec ? Number(v.toFixed(def.dec)) : Math.round(v);
      msg = `Rerolled the implicit on ${item.name}.`;
      break;
    }

    case 'chisel':
      item.quality = clamp((item.quality ?? 0) + 5, 0, 20);
      msg = `${item.name} is now ${item.quality}% quality.`;
      break;

    case 'vaal':
      msg = `${item.name}: ${corruptItem(item)}`;
      break;

    default:
      return no('That orb has no effect here.');
  }

  spendCurrency(currencyId, 1);
  log(msg, 'loot');
  emit(isMap ? 'maps' : 'inventory');
  emit('stats');
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

/** Bulk-apply an orb until it stops being legal or the stash runs dry. */
export function applyUntil(currencyId, item, predicate, maxUses = 200) {
  let uses = 0;
  while (uses < maxUses && hasCurrency(currencyId, 1)) {
    const res = applyCurrency(currencyId, item);
    if (!res.ok) break;
    uses++;
    if (predicate && predicate(item)) break;
  }
  return uses;
}
