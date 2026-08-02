// heroes.js — the roster: recruitment, levelling, stamina and equipment.

import { rng } from './rng.js';
import { uid, clamp } from './util.js';
import { G, log, emit, xpToNext, recruitCost, spendGold } from './state.js';
import {
  HERO_CLASSES, CLASS_BY_ID, HERO_RARITIES, RARITY_BY_ID, FIRST_NAMES, EPITHETS,
} from './data/heroclasses.js';
import { traitPoolFor, traitPerks, TRAIT_BY_ID } from './data/traits.js';
import { EQUIP_SLOTS, BASE_BY_ID } from './data/bases.js';
import { addToVault } from './inventory.js';
import { createItem } from './items.js';
import { guildEffects } from './data/upgrades.js';

export const BASE_STAMINA = 100;

/** Stamina regained per second while a hero is not on an expedition. */
export function staminaRegen() {
  return 0.85 * (1 + (guildEffects(G.state.upgrades).stamina ?? 0) / 100);
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------

function heroName() {
  const first = rng.pick(FIRST_NAMES);
  return rng.chance(0.45) ? `${first} ${rng.pick(EPITHETS)}` : first;
}

/**
 * Rolls a brand-new hero. `forceRarity` is used by the starting roster so a new
 * guild is never stuck with five Commons.
 */
export function rollHero(opts = {}) {
  const cls = opts.classId ? CLASS_BY_ID[opts.classId] : rng.pick(HERO_CLASSES);
  const rarityPool = HERO_RARITIES;
  const rarity = opts.rarity
    ? RARITY_BY_ID[opts.rarity]
    : rng.weighted(rarityPool, (r) => r.weight * (1 + (guildEffects(G.state?.upgrades).recruitQuality ?? 0) / 100
      * (r.id === 'common' ? -0.5 : 1)));

  const pool = traitPoolFor(rarity.id);
  const traits = rng.sample(pool, Math.min(rarity.traits, pool.length)).map((t) => t.id);

  const equipment = {};
  for (const s of EQUIP_SLOTS) equipment[s] = null;

  return {
    uid: uid('h'),
    name: heroName(),
    classId: cls.id,
    rarity: rarity.id,
    level: opts.level ?? 1,
    xp: 0,
    traits,
    equipment,
    stamina: BASE_STAMINA,
    partyId: null,
    fallen: false,          // downed during the current expedition
  };
}

/** Pays gold and adds a new hero to the roster. */
export function recruit() {
  const s = G.state;
  const cost = recruitCost(s.heroes.length);
  if (!spendGold(cost)) return { ok: false, msg: `Recruiting costs ${cost} gold.` };

  const hero = rollHero();
  s.heroes.push(hero);
  s.stats.recruited++;
  const r = RARITY_BY_ID[hero.rarity];
  log(`Recruited ${hero.name}, ${r.name} ${CLASS_BY_ID[hero.classId].name}.`,
    hero.rarity === 'common' || hero.rarity === 'uncommon' ? 'sys' : 'unique');
  emit('roster');
  return { ok: true, hero, msg: `${hero.name} joined the guild.` };
}

/** Dismisses a hero, returning a fraction of what they cost. */
export function dismiss(heroUid) {
  const s = G.state;
  const i = s.heroes.findIndex((h) => h.uid === heroUid);
  if (i < 0) return false;
  const hero = s.heroes[i];
  if (isDeployed(hero)) return false;

  // Their gear goes back to the vault rather than vanishing with them.
  for (const slot of EQUIP_SLOTS) {
    if (hero.equipment[slot]) { addToVault(hero.equipment[slot], { noAutoSalvage: true }); hero.equipment[slot] = null; }
  }
  removeFromParty(heroUid);
  s.heroes.splice(i, 1);
  log(`${hero.name} has left the guild.`, 'sys');
  emit('roster');
  return true;
}

// ---------------------------------------------------------------------------
// Levelling and stamina
// ---------------------------------------------------------------------------

/** Grants XP to a hero, processing level-ups. Returns levels gained. */
export function grantHeroXp(hero, amount) {
  const perks = traitPerks(hero.traits);
  const gained0 = hero.level;
  hero.xp += amount * (1 + (perks.xp + (guildEffects(G.state.upgrades).xp ?? 0)) / 100);
  let guard = 0;
  while (hero.xp >= xpToNext(hero.level) && guard++ < 200) {
    hero.xp -= xpToNext(hero.level);
    hero.level++;
  }
  return hero.level - gained0;
}

/** Stamina an expedition at `tier` costs this hero, after their traits. */
export function staminaCostFor(hero, baseCost) {
  const perks = traitPerks(hero.traits);
  return Math.max(1, Math.round(baseCost * (1 + perks.staminaCost / 100)));
}

export function restAll(dt) {
  const regen = staminaRegen();
  for (const hero of G.state.heroes) {
    if (isDeployed(hero) || hero.stamina >= BASE_STAMINA) continue;
    hero.stamina = Math.min(BASE_STAMINA, hero.stamina + regen * dt);
  }
}

export function isDeployed(hero) {
  return G.state.expeditions.some((e) => e.members.includes(hero.uid));
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export function createParty(name) {
  const s = G.state;
  const party = { id: uid('p'), name: name || `Party ${s.parties.length + 1}`, members: [] };
  s.parties.push(party);
  emit('roster');
  return party;
}

export function deleteParty(partyId) {
  const s = G.state;
  const i = s.parties.findIndex((p) => p.id === partyId);
  if (i < 0) return false;
  for (const h of s.heroes) if (h.partyId === partyId) h.partyId = null;
  s.parties.splice(i, 1);
  emit('roster');
  return true;
}

export function partyById(id) { return G.state.parties.find((p) => p.id === id); }

export function partyMembers(party) {
  if (!party) return [];
  return party.members.map((u) => heroById(u)).filter(Boolean);
}

export function heroById(heroUid) { return G.state.heroes.find((h) => h.uid === heroUid); }

/** Adds a hero to a party, removing them from any other first. */
export function assignToParty(heroUid, partyId) {
  const s = G.state;
  const hero = heroById(heroUid);
  const party = partyById(partyId);
  if (!hero || !party) return false;
  if (party.members.length >= MAX_MEMBERS) return false;
  if (isDeployed(hero)) return false;

  removeFromParty(heroUid);
  party.members.push(heroUid);
  hero.partyId = partyId;
  emit('roster');
  return true;
}

const MAX_MEMBERS = 5;

export function removeFromParty(heroUid) {
  const hero = heroById(heroUid);
  for (const p of G.state.parties) {
    const i = p.members.indexOf(heroUid);
    if (i >= 0) p.members.splice(i, 1);
  }
  if (hero) hero.partyId = null;
  emit('roster');
  return true;
}

/** Party is dispatchable: has members, none deployed, all with enough stamina. */
export function canDispatch(party, cost) {
  const members = partyMembers(party);
  if (!members.length) return { ok: false, msg: 'This party has no members.' };
  if (G.state.expeditions.some((e) => e.partyId === party.id)) {
    return { ok: false, msg: 'This party is already on an expedition.' };
  }
  const tired = members.filter((h) => h.stamina < staminaCostFor(h, cost));
  if (tired.length) {
    return { ok: false, msg: `${tired.map((h) => h.name).join(', ')} ${tired.length === 1 ? 'is' : 'are'} too tired.` };
  }
  return { ok: true, msg: '' };
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/** Concrete slot an item should occupy on a hero, preferring an empty ring. */
export function targetSlot(hero, item) {
  if (item.slot === 'ring') return !hero.equipment.ring1 ? 'ring1' : (!hero.equipment.ring2 ? 'ring2' : 'ring1');
  return item.slot;
}

/** Moves an item from the vault onto a hero. Anything replaced returns to the vault. */
export function equipOnHero(heroUid, itemUid, forcedSlot = null) {
  const s = G.state;
  const hero = heroById(heroUid);
  const idx = s.vault.findIndex((x) => x.uid === itemUid);
  if (!hero || idx < 0) return false;
  if (isDeployed(hero)) { log(`${hero.name} is on an expedition.`, 'danger'); return false; }

  const [item] = s.vault.splice(idx, 1);
  const slot = forcedSlot ?? targetSlot(hero, item);
  const base = BASE_BY_ID[item.baseId];
  const twoHanded = base?.slot === 'weapon' && base.hands === 2;

  const displaced = [];
  if (hero.equipment[slot]) displaced.push(hero.equipment[slot]);
  if (twoHanded && hero.equipment.offhand) displaced.push(hero.equipment.offhand);
  if (slot === 'offhand' && hero.equipment.weapon) {
    const w = BASE_BY_ID[hero.equipment.weapon.baseId];
    if (w?.hands === 2) displaced.push(hero.equipment.weapon);
  }

  hero.equipment[slot] = item;
  if (twoHanded) hero.equipment.offhand = null;
  for (const old of displaced) {
    if (old === item) continue;
    if (hero.equipment.weapon === old) hero.equipment.weapon = null;
    if (hero.equipment.offhand === old) hero.equipment.offhand = null;
    addToVault(old, { noAutoSalvage: true });
  }

  emit('roster'); emit('vault'); emit('sheets');
  return true;
}

export function unequipFromHero(heroUid, slot) {
  const hero = heroById(heroUid);
  if (!hero || !hero.equipment[slot]) return false;
  if (isDeployed(hero)) { log(`${hero.name} is on an expedition.`, 'danger'); return false; }
  const item = hero.equipment[slot];
  hero.equipment[slot] = null;
  addToVault(item, { noAutoSalvage: true });
  emit('roster'); emit('vault'); emit('sheets');
  return true;
}

/** Every item currently worn by anyone — used so equipped gear isn't salvaged. */
export function allEquippedItems() {
  const out = [];
  for (const h of G.state.heroes) {
    for (const slot of EQUIP_SLOTS) if (h.equipment[slot]) out.push(h.equipment[slot]);
  }
  return out;
}

/** Display helper: hero's class, role and rarity in one object. */
export function heroInfo(hero) {
  return {
    cls: CLASS_BY_ID[hero.classId],
    rarity: RARITY_BY_ID[hero.rarity],
    traits: hero.traits.map((t) => TRAIT_BY_ID[t]).filter(Boolean),
  };
}

/**
 * Starting roster: one of each core role, each holding a basic weapon.
 * Unarmed heroes do almost no damage, so handing out kit here is the
 * difference between a first expedition that works and one that stalls.
 */
export function startingRoster() {
  const roster = [
    rollHero({ classId: 'guardian', rarity: 'uncommon' }),
    rollHero({ classId: 'berserker', rarity: 'uncommon' }),
    rollHero({ classId: 'cleric', rarity: 'common' }),
  ];
  for (const hero of roster) {
    const prefers = CLASS_BY_ID[hero.classId].prefers ?? ['sword1h'];
    hero.equipment.weapon = createItem({ baseId: prefers[0], ilvl: 1, rarity: 'normal' });
    hero.equipment.body = createItem({ baseId: 'body_arev', ilvl: 1, rarity: 'normal' });
  }
  return roster;
}

export { MAX_MEMBERS };
