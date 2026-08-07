// heroes.js — the roster: recruitment, levelling, stamina and equipment.

import { rng } from './rng.js';
import { uid } from './util.js';
import { G, log, emit, xpToNext, recruitCost, spendGold } from './state.js';
import {
  HERO_CLASSES, CLASS_BY_ID, HERO_RARITIES, RARITY_BY_ID, FIRST_NAMES, EPITHETS,
} from './data/heroclasses.js';
import { traitPoolFor, traitPerks, TRAIT_BY_ID } from './data/traits.js';
import { skillPoolFor, SKILL_CHOICES, SKILL_BY_ID } from './data/skills.js';
import { EQUIP_SLOTS, BASE_BY_ID } from './data/bases.js';
import { addToVault } from './inventory.js';
import { refreshSheets } from './sheets.js';
import { createItem, itemScore } from './items.js';
import { guildEffects } from './data/upgrades.js';
import { recordFeat } from './achievements.js';
import { recruitBoardSize } from './charter.js';

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

  // Three offered, one usable. Rarity buys more traits but not more skills:
  // the choice is meant to be about the class you rolled, not the luck of it.
  const skills = rng.sample(skillPoolFor(cls), Math.min(SKILL_CHOICES, skillPoolFor(cls).length))
    .map((s) => s.id);

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
    skills,
    skill: skills[0] ?? null,
    equipment,
    stamina: BASE_STAMINA,
    partyId: null,
    fallen: false,          // downed during the current expedition
  };
}

/**
 * What one candidate costs: the roster-size curve from state.js, scaled by how
 * good they are. Keeping the exponential curve underneath is the point — a
 * rich guild still cannot simply buy twenty heroes.
 */
export function candidateCost(rosterSize, rarityId) {
  return Math.floor(recruitCost(rosterSize) * (RARITY_BY_ID[rarityId]?.cost ?? 1));
}

/**
 * Rerolling escalates within a sitting and resets when somebody is hired. A
 * flat fee would launder the curve away — you could reroll cheaply until a
 * Legendary appeared.
 */
export function rerollCost(rosterSize, rerolls) {
  return Math.floor(recruitCost(rosterSize) * 0.45 * Math.pow(1.6, rerolls));
}

/**
 * The candidates currently on offer, generating them if the board is empty.
 * Locked candidates survive a reroll; everyone else is replaced.
 */
export function recruitBoard() {
  const s = G.state;
  s.recruits ??= { candidates: [], locked: [], rerolls: 0 };
  const board = s.recruits;
  // Word of Mouth and Open Doors widen this; see data/charter.js. A board that
  // has already been generated keeps whoever is standing on it, so a privilege
  // arriving mid-sitting adds a candidate rather than replacing the lot.
  while (board.candidates.length < recruitBoardSize()) board.candidates.push(rollHero());
  return board;
}

/** Cost of each candidate on the board, in the same order. */
export function boardCosts() {
  const s = G.state;
  return recruitBoard().candidates.map((h) => candidateCost(s.heroes.length, h.rarity));
}

/** Locks or unlocks a candidate so a reroll leaves them alone. */
export function toggleRecruitLock(heroUid) {
  const board = recruitBoard();
  const i = board.locked.indexOf(heroUid);
  if (i >= 0) board.locked.splice(i, 1);
  else board.locked.push(heroUid);
  emit('recruits');
  return board.locked.includes(heroUid);
}

/**
 * Replaces every unlocked candidate. The price climbs with each reroll of the
 * same board, so this is a decision rather than a slot machine.
 */
export function rerollRecruits() {
  const s = G.state;
  const board = recruitBoard();
  const cost = rerollCost(s.heroes.length, board.rerolls);
  if (!spendGold(cost)) return { ok: false, msg: `Rerolling costs ${cost} gold.` };

  board.candidates = board.candidates.map((h) => (
    board.locked.includes(h.uid) ? h : rollHero()));
  board.rerolls++;
  emit('recruits'); emit('guild');
  return { ok: true, msg: `Board rerolled for ${cost} gold.` };
}

/** Hires one candidate. The board refills and its reroll price resets. */
export function recruit(heroUid) {
  const s = G.state;
  const board = recruitBoard();
  const i = heroUid
    ? board.candidates.findIndex((h) => h.uid === heroUid)
    : 0;
  if (i < 0) return { ok: false, msg: 'That candidate has already moved on.' };

  const hero = board.candidates[i];
  const cost = candidateCost(s.heroes.length, hero.rarity);
  const r = RARITY_BY_ID[hero.rarity];
  if (!spendGold(cost)) {
    return { ok: false, msg: `${r.name} ${CLASS_BY_ID[hero.classId].name} costs ${cost} gold.` };
  }

  board.candidates.splice(i, 1);
  const lockedAt = board.locked.indexOf(hero.uid);
  if (lockedAt >= 0) board.locked.splice(lockedAt, 1);
  // Hiring settles the board: the next reroll starts from the base price.
  board.rerolls = 0;
  recruitBoard();

  s.heroes.push(hero);
  s.stats.recruited++;
  log(`Recruited ${hero.name}, ${r.name} ${CLASS_BY_ID[hero.classId].name}, for ${cost} gold.`,
    hero.rarity === 'common' || hero.rarity === 'uncommon' ? 'sys' : 'unique');
  emit('roster'); emit('recruits');
  return { ok: true, hero, msg: `${hero.name} joined the guild.` };
}

/** Dismisses a hero, returning a fraction of what they cost. */
export function dismiss(heroUid) {
  recordFeat('dismiss');
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
  // Levelling changes every derived number, including mid-expedition. Only
  // rebuild when a level actually landed — this runs on every kill.
  if (hero.level !== gained0) refreshSheets();
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
  const party = {
    id: uid('p'), name: name || `Party ${s.parties.length + 1}`, members: [],
    // Whether this party re-runs its last expedition on its own, chosen per
    // party and off until asked for. A single global switch sent every party
    // that had ever been anywhere, which is not what "auto-redeploy this one"
    // means.
    autoRedeploy: false,
    returnedAt: 0,
  };
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
  if (item.slot === 'weapon' && canDualWield(hero) && isOneHanded(item)) {
    // A hand free takes the second weapon rather than displacing the first.
    if (!hero.equipment.offhand) return hero.equipment.weapon ? 'offhand' : 'weapon';
    if (!hero.equipment.weapon) return 'weapon';
    // Both hands full: displace the weaker of the two. Always replacing the
    // main hand meant a Rogue could only be upgraded by unequipping both
    // weapons first and putting them back in the right order.
    return itemScore(hero.equipment.offhand) < itemScore(hero.equipment.weapon)
      ? 'offhand' : 'weapon';
  }
  return item.slot;
}

/** Whether this hero's class fights with a weapon in each hand. */
export function canDualWield(hero) {
  return !!CLASS_BY_ID[hero?.classId]?.dualWield;
}

function isOneHanded(item) {
  const base = BASE_BY_ID[item?.baseId];
  return base?.slot === 'weapon' && base.hands !== 2;
}

function isTwoHanded(item) {
  const base = BASE_BY_ID[item?.baseId];
  return base?.slot === 'weapon' && base.hands === 2;
}

/**
 * Can this hero hold this item in that hand at all?
 *
 * `dualWield` is now a whole fighting style rather than a permission: a class
 * that has it fights with a one-handed weapon in each hand and cannot do
 * anything else. No shield, no quiver, no two-hander. Letting a Rogue pick up
 * a greatsword made the class's one distinguishing feature optional, and an
 * offhand slot that accepts both a second dagger and a tower shield cannot be
 * automatically filled without guessing which build the player wanted.
 *
 * @returns {{ok: boolean, msg: string}}
 */
export function canHold(hero, item, slot) {
  if (!hero || !item) return { ok: false, msg: 'Nothing to equip.' };
  const dual = canDualWield(hero);
  const cls = CLASS_BY_ID[hero.classId]?.name ?? 'This hero';

  if (dual && isTwoHanded(item)) {
    return { ok: false, msg: `A ${cls} fights with a weapon in each hand and cannot hold a two-handed weapon.` };
  }
  if (slot === 'offhand') {
    if (dual) {
      return isOneHanded(item)
        ? { ok: true, msg: '' }
        : { ok: false, msg: `A ${cls} carries a second weapon in that hand, not ${item.name}.` };
    }
    return BASE_BY_ID[item.baseId]?.slot === 'offhand'
      ? { ok: true, msg: '' }
      : { ok: false, msg: `${hero.name} cannot hold that in their off hand.` };
  }
  return { ok: true, msg: '' };
}

/**
 * Can this item go in this hero's offhand at all?
 * @returns {boolean}
 */
export function offhandAccepts(hero, item) {
  return canHold(hero, item, 'offhand').ok;
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

  const allowed = canHold(hero, item, slot);
  if (!allowed.ok) {
    s.vault.splice(idx, 0, item);
    log(allowed.msg, 'danger');
    return false;
  }

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

  emit('roster'); emit('vault'); refreshSheets();
  return true;
}

export function unequipFromHero(heroUid, slot) {
  const hero = heroById(heroUid);
  if (!hero || !hero.equipment[slot]) return false;
  if (isDeployed(hero)) { log(`${hero.name} is on an expedition.`, 'danger'); return false; }
  const item = hero.equipment[slot];
  hero.equipment[slot] = null;
  addToVault(item, { noAutoSalvage: true });
  emit('roster'); emit('vault'); refreshSheets();
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
    skills: skillsOf(hero),
    skill: equippedSkill(hero),
  };
}

/**
 * Starting roster: one of each core role, each holding a basic weapon.
 *
 * All three are deliberately Common. Handing out free Uncommons would make the
 * first genuinely better recruit feel like a sidegrade, and the whole point of
 * the recruit roll is that rarity is something you go and find.
 *
 * They do get basic kit, though — unarmed heroes deal almost no damage, which
 * is the difference between a first expedition that works and one that stalls.
 */
/**
 * The three heroes a new guild opens with. Fixed, not rolled.
 *
 * Every part of them is the plainest the game can produce: Common rarity, one
 * tier-1 trait apiece, and three skills drawn from the handful any class can
 * take rather than anything their class is actually known for. That is the
 * whole point — the first genuinely good recruit has to read as an *upgrade*,
 * and it cannot if the starters were rolled and one of them happened to come
 * out holding Flurry and a Rare's worth of traits.
 *
 * The names say the job out loud. A new player has no idea what a Templar is
 * or what Rare means, but "Brak the Defender" needs no glossary.
 */
const STARTERS = [
  {
    classId: 'warrior', name: 'Brak the Defender',
    trait: 'sturdy',
  },
  {
    classId: 'cleric', name: 'Elowen the Restorer',
    trait: 'hardy',
  },
  {
    classId: 'rogue', name: 'Flynn the Assassin',
    trait: 'quick',
  },
];

/** The three skills every starter is offered. Available to any class, and dull. */
const STARTER_SKILLS = ['second_wind', 'adrenaline', 'resolute'];

export function startingRoster() {
  const roster = STARTERS.map((spec) => {
    const hero = rollHero({ classId: spec.classId, rarity: 'common' });
    hero.name = spec.name;
    hero.traits = [spec.trait];
    hero.skills = STARTER_SKILLS.slice();
    [hero.skill] = hero.skills;
    return hero;
  });
  for (const hero of roster) {
    const prefers = CLASS_BY_ID[hero.classId].prefers ?? ['sword1h'];
    hero.equipment.weapon = createItem({ baseId: prefers[0], ilvl: 1, rarity: 'normal' });
    hero.equipment.body = createItem({ baseId: 'body_arev', ilvl: 1, rarity: 'normal' });
  }
  return roster;
}

export { MAX_MEMBERS };

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** The three a hero rolled, as definitions, skipping any since retired. */
export function skillsOf(hero) {
  return (hero?.skills ?? []).map((id) => SKILL_BY_ID[id]).filter(Boolean);
}

/** The one in use, or null. */
export function equippedSkill(hero) {
  return hero?.skill ? SKILL_BY_ID[hero.skill] ?? null : null;
}

/**
 * Swaps which of a hero's three is active. Free and instant: a skill is a
 * choice about how to play a hero, not a resource to be hoarded, and charging
 * for it would only mean players never experiment.
 */
export function equipSkill(hero, skillId) {
  if (skillId !== null && !hero.skills?.includes(skillId)) return false;
  hero.skill = skillId;
  refreshSheets();
  emit('roster');
  return true;
}

/**
 * Gives an older hero the skills it was born too early for.
 *
 * Saves predate this system, so a returning player would otherwise find every
 * hero with nothing to equip. Rolled fresh from the class pool, matching what
 * a new hero of that class would have seen.
 */
export function grantMissingSkills(hero) {
  if (hero.skills?.length) return false;
  const pool = skillPoolFor(CLASS_BY_ID[hero.classId]);
  hero.skills = rng.sample(pool, Math.min(SKILL_CHOICES, pool.length)).map((s) => s.id);
  hero.skill = hero.skills[0] ?? null;
  return true;
}

/**
 * Echo Stones a reroll costs, by how good the hero is.
 *
 * Better heroes cost more because they are the ones worth optimising: a
 * Legendary is the hero you will still be using in fifty hours, so paying five
 * stones to fix its skills is a decision, while a Common is cheap enough to
 * fiddle with. Flat pricing would make the Legendary the *only* sensible
 * target and everything else a waste of a stone.
 */
export const REROLL_COST = {
  common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 5,
};

export function rerollCostFor(hero) {
  return REROLL_COST[hero?.rarity] ?? 1;
}

/** Whether the guild can pay for one, and has anything to reroll. */
export function canRerollSkills(hero) {
  const pool = skillPoolFor(CLASS_BY_ID[hero?.classId]);
  return !!hero
    && pool.length > SKILL_CHOICES
    && (G.state?.guild.echoes ?? 0) >= rerollCostFor(hero);
}

/**
 * Spends Echo Stones to redraw a hero's three skills.
 *
 * The equipped skill survives if it comes up again, which is not generosity —
 * it stops a reroll aimed at the other two slots from silently changing how a
 * hero fights. If it does not, the first of the new three takes over, because
 * a hero with an empty skill slot is a hero quietly running at less than full
 * strength.
 */
export function rerollSkills(hero) {
  if (!hero) return { ok: false, msg: 'No hero.' };
  const cost = rerollCostFor(hero);
  if ((G.state.guild.echoes ?? 0) < cost) {
    return { ok: false, msg: `Needs ${cost} Echo Stone${cost === 1 ? '' : 's'}.` };
  }
  const pool = skillPoolFor(CLASS_BY_ID[hero.classId]);
  if (pool.length <= SKILL_CHOICES) {
    return { ok: false, msg: `A ${CLASS_BY_ID[hero.classId]?.name} has no other skills to draw.` };
  }

  G.state.guild.echoes -= cost;
  recordFeat('skillReroll');
  const was = hero.skill;
  hero.skills = rng.sample(pool, SKILL_CHOICES).map((s) => s.id);
  hero.skill = hero.skills.includes(was) ? was : hero.skills[0];

  refreshSheets();
  log(`${hero.name} retrains: ${hero.skills.map((id) => SKILL_BY_ID[id].name).join(', ')}.`, 'craft');
  emit('roster');
  emit('guild');
  return { ok: true, kept: hero.skill === was };
}
