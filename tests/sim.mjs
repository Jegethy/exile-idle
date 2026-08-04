// sim.mjs — runs the real combat engine headlessly, with no browser.
//
// Nothing here reimplements the game: it boots the actual state, builds real
// parties out of real heroes, and drives the real tick. A balance figure that
// came from a parallel model would only tell us about the model.

import { G, createState } from '../src/state.js';
import { rng } from '../src/rng.js';
import { rollHero, createParty, assignToParty } from '../src/heroes.js';
import { refreshSheets } from '../src/sheets.js';
import { dispatch, tickAll } from '../src/expedition.js';
import { createItem } from '../src/items.js';
import { EQUIP_SLOTS, BASE_BY_ID } from '../src/data/bases.js';
import { tierToLevel, tierToIlvl } from '../src/data/dungeons.js';
import { CLASS_BY_ID } from '../src/data/heroclasses.js';

const DT = 0.1;
const MAX_TICKS = 20000;          // ~33 simulated minutes; a wall, not a budget

/** A fresh guild with nothing in it, seeded for repeatability. */
export function freshGuild(seed = 1) {
  rng.seed(seed);
  G.state = createState('Sim');
  G.state.heroes = [];
  G.state.parties = [];
  G.paused = true;
  return G.state;
}

/**
 * Gear appropriate to a level, so a class is measured with equipment rather
 * than bare-handed — an ungeared party is dominated by base multipliers and
 * tells you nothing about how the classes actually compare.
 */
function equipFor(hero, ilvl) {
  const cls = CLASS_BY_ID[hero.classId];
  const prefers = cls.prefers ?? ['sword1h'];
  const weapon = prefers.find((id) => BASE_BY_ID[id]?.slot === 'weapon') ?? 'sword1h';
  const offhand = prefers.find((id) => BASE_BY_ID[id]?.slot === 'offhand');

  hero.equipment.weapon = createItem({ baseId: weapon, ilvl, rarity: 'rare' });
  if (BASE_BY_ID[weapon]?.hands !== 2) {
    // A dual wielder takes a second weapon rather than a shield, which is how
    // the class is actually played — measuring it with an empty offhand would
    // understate it.
    const second = cls.dualWield ? weapon : offhand;
    if (second) hero.equipment.offhand = createItem({ baseId: second, ilvl, rarity: 'rare' });
  }
  const armour = {
    helmet: 'helm_ar', body: 'body_arev', gloves: 'glove_ar', boots: 'boot_ev',
    amulet: 'amulet', ring1: 'ring', ring2: 'ring',
  };
  for (const [slot, baseId] of Object.entries(armour)) {
    if (!EQUIP_SLOTS.includes(slot) || !BASE_BY_ID[baseId]) continue;
    hero.equipment[slot] = createItem({ baseId, ilvl, rarity: 'rare' });
  }
  return hero;
}

/**
 * Builds a party from a list of class ids.
 * @returns {{party: object, heroes: object[]}}
 */
export function makeParty(classIds, { level = 40, ilvl = 40, rarity = 'common' } = {}) {
  const heroes = classIds.map((classId) => {
    const hero = rollHero({ classId, rarity });
    hero.level = level;
    hero.stamina = 100;
    // Traits are noise for a class comparison — strip them so the figures
    // reflect the class rather than which perks happened to roll.
    hero.traits = [];
    // Skills likewise, and for a stronger reason: they are a real lever.
    // Measured on a Templar, a rolled skill moved a crypt push from 40% to
    // 53%, so leaving them in means every class figure carries whichever of
    // three a hero happened to draw. Tests that want one set it explicitly.
    hero.skill = null;
    equipFor(hero, ilvl);
    G.state.heroes.push(hero);
    return hero;
  });
  const party = createParty();
  for (const h of heroes) assignToParty(h.uid, party.id);
  refreshSheets();
  return { party, heroes };
}

/**
 * Runs one expedition to its conclusion.
 *
 * @returns {{cleared: boolean, seconds: number, waves: number,
 *   contribution: object[]}}
 */
export function runExpedition(party, dungeonId, tier) {
  for (const uid of party.members) {
    const hero = G.state.heroes.find((h) => h.uid === uid);
    if (hero) hero.stamina = 100;
  }
  const before = G.state.stats.runs;
  const res = dispatch(party.id, dungeonId, tier);
  if (!res.ok) return { error: res.msg };

  const run = G.state.expeditions[0];
  let ticks = 0;
  const snapshot = () => run.combatants.map((c) => ({
    uid: c.uid,
    classId: c.classId,
    damageDealt: c.damageDealt ?? 0,
    damageTaken: c.damageTaken ?? 0,
    healingDone: c.healingDone ?? 0,
    down: c.down,
    lifeLeft: c.life / c.maxLife,
  }));

  let last = snapshot();
  while (G.state.expeditions.length && ticks < MAX_TICKS) {
    tickAll(DT);
    if (G.state.expeditions.length) last = snapshot();
    ticks++;
  }
  return {
    cleared: G.state.stats.runs > before,
    seconds: ticks * DT,
    waves: run.wave,
    contribution: last,
    timedOut: ticks >= MAX_TICKS,
  };
}

/**
 * A party levelled and geared for the tier it is about to run.
 *
 * Class comparisons have to hold this constant: since fighting above your
 * level now costs real damage in both directions, a party that is under-levelled
 * for the content is measuring the level gap rather than the classes.
 */
export function partyForTier(classIds, tier, levelsBehind = 0) {
  return makeParty(classIds, {
    level: Math.max(1, tierToLevel(tier) - levelsBehind),
    ilvl: Math.max(1, tierToIlvl(tier) - levelsBehind),
  });
}

/** Mean of a list, or 0. */
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Formats a number for a report column. */
export const num = (n, w = 7, d = 0) => n.toFixed(d).padStart(w);
