// readiness.js — is this party ready for that tier?
//
// This exists because of a rule that was added without an interface: past ten
// levels under the content, most of what a party swings misses and a growing
// share of what hits them crushes through armour, resistance and block alike.
// That is a wall, and it is meant to be — but a wall you cannot see coming is
// the exact complaint the cliff was built to answer. "Tier 11 is fine and Tier
// 12 is impossible" is only good design if the game says which is which
// *before* the party leaves.
//
// So the number the dispatch panel has always printed — "enemy level ~30" —
// becomes a comparison instead of a fact.
//
// Nothing here blocks a dispatch. Composition notices are advice and so is
// this: an over-geared party farming something it has outgrown does not need
// permission, and a player who wants to throw a party at a wall to see what
// happens is entitled to.

import { G } from './state.js';
import { EQUIP_SLOTS } from './data/bases.js';
import { CLASS_BY_ID } from './data/heroclasses.js';
import { tierToLevel, tierToIlvl } from './data/dungeons.js';
import { HERO_CLASSES } from './data/heroclasses.js';
import { GAP_CLIFF } from './expedition/balance.js';
import { partyMembers } from './heroes.js';

/**
 * The bands, worst last.
 *
 * `hard` stops one level short of the cliff on purpose: nine levels under is
 * a hard afternoon and clears every time, ten is survivable at nearly twice
 * the duration, and twelve is a coin flip you lose. The band boundary is where
 * the arithmetic changes, not where it starts to hurt.
 */
export const BANDS = [
  {
    id: 'ready',
    name: 'Ready',
    hint: 'At or above the level of what lives down there.',
  },
  {
    id: 'fair',
    name: 'Fair fight',
    hint: 'Under-levelled, but only enough to make it slower.',
  },
  {
    id: 'hard',
    name: 'Hard',
    hint: 'Well under-levelled. Survivable, and it will show in the clear time.',
  },
  {
    id: 'wall',
    name: 'Out of reach',
    hint: `Ten or more levels under. Most of what this party swings will miss, `
      + 'and blows that land on them ignore armour, resistances and shields entirely. '
      + 'No amount of gear answers this — level up or drop a tier.',
  },
];

export const BAND_BY_ID = Object.fromEntries(BANDS.map((b) => [b.id, b]));

/** Which band a level gap falls in. */
export function bandFor(gap) {
  if (gap <= 0) return BAND_BY_ID.ready;
  if (gap >= GAP_CLIFF) return BAND_BY_ID.wall;
  return gap <= 5 ? BAND_BY_ID.fair : BAND_BY_ID.hard;
}

/** Mean level of a party, rounded. Empty parties read as level 0. */
export function partyLevel(members) {
  if (!members.length) return 0;
  return Math.round(members.reduce((a, h) => a + (h.level ?? 1), 0) / members.length);
}

/**
 * Mean item level of everything the party is wearing.
 *
 * Empty slots are left out rather than counted as zero: a hero missing a ring
 * is under-geared in a way the *number* of items already says, and averaging
 * a nothing into it would make a well-equipped party with one gap look far
 * worse than it is.
 */
export function partyItemLevel(members) {
  const worn = members.flatMap((h) => EQUIP_SLOTS.map((slot) => h.equipment?.[slot])).filter(Boolean);
  if (!worn.length) return 0;
  return Math.round(worn.reduce((a, i) => a + (i.ilvl ?? 0), 0) / worn.length);
}

/**
 * How this party stands against a tier.
 *
 * @returns {{
 *   level: number, content: number, gap: number, band: object,
 *   ilvl: number, contentIlvl: number, empties: number,
 *   roles: {tank: boolean, healer: boolean}, size: number,
 * }}
 */
export function readiness(party, tier, state = G.state) {
  const members = partyMembers(party);
  const level = partyLevel(members);
  const content = tierToLevel(tier);
  const gap = Math.max(0, content - level);
  const roles = members.map((h) => CLASS_BY_ID[h.classId]?.role);
  const filled = members.flatMap((h) => EQUIP_SLOTS.map((slot) => h.equipment?.[slot]))
    .filter(Boolean).length;

  return {
    size: members.length,
    level,
    content,
    gap,
    band: members.length ? bandFor(gap) : BAND_BY_ID.wall,
    ilvl: partyItemLevel(members),
    contentIlvl: tierToIlvl(tier),
    empties: members.length * EQUIP_SLOTS.length - filled,
    roles: { tank: roles.includes('Tank'), healer: roles.includes('Healer') },
    state,
  };
}

/** One line a player can read at a glance. */
export function readinessLine(r) {
  if (!r.size) return 'Empty party.';
  const under = r.gap > 0 ? `${r.gap} level${r.gap === 1 ? '' : 's'} under` : 'at level';
  return `Level ${r.level} vs ${r.content} — ${under}`;
}

// ---------------------------------------------------------------------------
// Which tank a dungeon wants
// ---------------------------------------------------------------------------

/**
 * The share of a blow this class would take from a given melee/spell blend.
 *
 * Straight out of the class's own `resist` numbers, which is the entire point.
 * The dispatch board used to assert in a tooltip that "a Warrior answers
 * brawlers, a Paladin answers casters, a Guardian handles either" — and
 * measured against the real dungeons, that advice was wrong in four of seven.
 * A player following it did worse than one ignoring it, which is worse than
 * saying nothing at all.
 *
 * Deriving it means the advice cannot drift from the numbers again: change a
 * resistance or an attack blend and the recommendation moves with it.
 */
export function schoolExposure(cls, mix) {
  const melee = (mix?.melee ?? 50) / 100;
  const spell = 1 - melee;
  const r = cls?.resist ?? {};
  return melee * (1 - (r.melee ?? 0) / 100) + spell * (1 - (r.spell ?? 0) / 100);
}

/**
 * The tank best suited to this blend, and by how much over the next best.
 *
 * @returns {{cls: object, margin: number, ranked: Array}}
 */
export function tankFor(mix) {
  const ranked = HERO_CLASSES
    .filter((c) => c.role === 'Tank')
    .map((cls) => ({ cls, exposure: schoolExposure(cls, mix) }))
    .sort((a, b) => a.exposure - b.exposure);
  const [best, next] = ranked;
  return {
    cls: best.cls,
    // How much less damage the best takes than the runner-up, as a percentage.
    margin: next ? ((next.exposure - best.exposure) / next.exposure) * 100 : 0,
    ranked,
  };
}

/** One line of advice for a dungeon's blend, derived rather than written down. */
export function tankAdvice(mix) {
  const { cls, margin, ranked } = tankFor(mix);
  const worst = ranked[ranked.length - 1];
  // Under a couple of percent is not a recommendation, it is a rounding error.
  if (margin < 2) return `${cls.name}s edge it here, but any tank holds this blend.`;
  return `${cls.name}s take ${Math.round(margin)}% less punishment here than the next best, `
    + `and ${Math.round(((worst.exposure - ranked[0].exposure) / worst.exposure) * 100)}% `
    + `less than a ${worst.cls.name}.`;
}
