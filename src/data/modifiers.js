// data/modifiers.js — what a contract does to an expedition, good and bad.
//
// These exist because Tier 20 is where the game runs out of things to give
// you. Every affix reaches its top tier at item level 85, the last unique
// enters the drop pool there, and the final raid falls two tiers later — after
// which pushing further only changes the size of the numbers on both sides.
//
// A modifier is not a difficulty setting. Tier is already an unbounded
// difficulty slider: anyone wanting a harder fight can press +. What tier
// cannot do is make a fight *different*. Once a guild has found its best five
// heroes, composition is solved for ever, and twelve classes, three tanks with
// opposed resistances and a whole skill system quietly stop mattering. A
// modifier unsolves it — a run that bans casters wants a different party than
// one where every enemy is a caster.
//
// Not every contract is meant to be run. Some combinations should read as
// "absolutely not" at a glance, and be left to rot in the shelf. That is only
// possible if bad ones are cheap to walk away from, which is why contracts
// drop often enough that discarding one costs nothing but a shrug.
//
// Five ways a modifier can bite, in ascending order of how much engine each
// needs:
//
//   profile     multiplies what the dungeon builds its enemies from. Free —
//               makeEnemy already reads every one of these keys.
//   curse       a permanent effect on every hero, using the same mod bag that
//               gear, flasks and class abilities write into.
//   boon        the same thing pointing the other way, plus find-rate bonuses.
//   restrict    a composition ban, enforced before the party leaves.
//   reactions   a hook into the combat effects layer, for anything that has to
//               answer a moment rather than sit there. The same shape as a
//               class ability or a unique's effect.
//
// `danger` is what a modifier is worth, and `danger` is *measured*, not
// guessed — see the pricing note at the foot of this file.

import { applyEffect } from '../expedition/effects.js';
import { HERO_CLASSES } from './heroclasses.js';

/**
 * @typedef {object} Modifier
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {number} danger      - reward weight. Negative for a boon.
 * @property {number} [minTier]
 * @property {object} [profile]   - multipliers on the enemy profile
 * @property {object} [curse]     - mods applied to every hero for the run
 * @property {object} [find]      - gold/rarity/quantity/material/unique bonuses
 * @property {object} [restrict]  - { reach, school, role, classId } the party may not contain
 * @property {Array}  [reactions] - reactions granted to every hero
 * @property {boolean} [boon]     - true if this is an upside
 */

// ---------------------------------------------------------------------------
// Downsides
// ---------------------------------------------------------------------------

const DOWNSIDES = [
  // ---- Enemy strength ------------------------------------------------------
  {
    id: 'teeming', name: 'Teeming', danger: 30,
    desc: 'Enemies have 60% more health.',
    profile: { life: 1.60 },
  },
  {
    id: 'savage', name: 'Savage', danger: 12,
    desc: 'Enemies deal 80% more damage.',
    profile: { damage: 1.80 },
  },
  {
    id: 'frenzied', name: 'Frenzied', danger: 12,
    desc: 'Enemies attack 60% faster.',
    profile: { aps: 1.60 },
  },
  {
    id: 'ironclad', name: 'Ironclad', danger: 12, minTier: 6,
    desc: 'Enemies have 150% more armour.',
    profile: { armour: 2.50 },
  },
  {
    id: 'warded', name: 'Warded', danger: 20, minTier: 6,
    desc: 'Enemies have +45% to all resistances.',
    profile: { res: 45 },
  },
  {
    id: 'elusive', name: 'Elusive', danger: 10,
    desc: 'Enemies have 140% more evasion.',
    profile: { evasion: 2.40 },
  },
  {
    id: 'martyrdom', name: 'Martyrdom', danger: 14, minTier: 10,
    desc: 'Every time an enemy dies, the rest hit 25% harder and 25% faster.',
    reactions: [{
      trigger: 'kill', key: 'mod-martyrdom',
      run: (ctx) => {
        for (const e of ctx.run.enemies) {
          if (e === ctx.target) continue;
          e.dmg *= 1.25;
          e.aps *= 1.25;
        }
      },
    }],
  },

  // ---- Composition pressure ------------------------------------------------
  // The point of the whole system: these do not make a run harder so much as
  // make a *different party* the right answer, which is the only thing that
  // brings a bench of twelve classes back into use.
  {
    id: 'hexwrought', name: 'Hexwrought', danger: 10,
    desc: 'Almost every enemy casts spells. A Tank who resists weapons will not help much.',
    profile: { attackMix: { melee: 15, spell: 85 } },
  },
  {
    id: 'brutish', name: 'Brutish', danger: 10,
    desc: 'Almost every enemy fights up close. A Tank who resists spells will not help much.',
    profile: { attackMix: { melee: 85, spell: 15 } },
  },
  {
    id: 'contempt', name: 'Contempt', danger: 16, minTier: 10,
    desc: 'Enemies ignore your Tank and attack whoever they like.',
    // Threat is a multiplier on being picked, so flattening everyone to the
    // same value makes targeting uniform — which is exactly "the tank cannot
    // hold anything" without needing a second targeting path in the engine.
    curse: { ignoreThreat: 100 },
  },

  // ---- Curses on the party -------------------------------------------------
  {
    id: 'festering', name: 'Festering', danger: 12, minTier: 8,
    desc: 'Healing is 55% less effective.',
    curse: { incHeal: -55 },
  },
  {
    id: 'mortal_wounds', name: 'Mortal Wounds', danger: 18, minTier: 12,
    desc: 'Heroes cannot be healed above half their health.',
    curse: { capHeal: 50 },
  },
  {
    id: 'withering', name: 'Withering', danger: 20, minTier: 12,
    desc: 'Heroes lose 5% of their health every second.',
    reactions: [{
      trigger: 'combatStart', key: 'mod-withering',
      run: (ctx) => {
        applyEffect(ctx.self, {
          id: 'mod-withering', name: 'Withering', duration: Infinity,
          dps: ctx.self.maxLife * 0.05,
        });
      },
    }],
  },
  {
    id: 'draining', name: 'Draining', danger: 10, minTier: 8,
    desc: 'Resources regenerate 75% more slowly.',
    curse: { resourceRegen: -75 },
  },
  {
    id: 'exposed', name: 'Exposed', danger: 14, minTier: 10,
    desc: 'The party takes 35% more damage.',
    curse: { damageTaken: 35 },
  },
  {
    id: 'leaden', name: 'Leaden', danger: 16, minTier: 8,
    desc: 'The party attacks 25% more slowly.',
    curse: { incAtkSpeed: -25 },
  },
  {
    id: 'dense_fog', name: 'Dense Fog', danger: 18, minTier: 8,
    desc: 'Every attack has a 25% chance to miss.',
    curse: { missChance: 25 },
  },
  {
    id: 'sundered', name: 'Sundered', danger: 12, minTier: 10,
    desc: 'Your party has 50% less accuracy and 50% less resistance.',
    curse: { incAccuracy: -50, resAll: -50 },
  },
  {
    id: 'dulled_edge', name: 'Dulled Edge', danger: 10, minTier: 8,
    desc: 'Critical hits do no extra damage.',
    curse: { critMulti: -100 },
  },
  {
    id: 'torpor', name: 'Torpor', danger: 10, minTier: 10,
    desc: 'Abilities take 50% longer to become ready again.',
    curse: { cooldownMult: 50 },
  },

  // ---- Reactive -----------------------------------------------------------
  {
    id: 'bloodfeast', name: 'Bloodfeast', danger: 34, minTier: 12,
    desc: 'Critical hits heal the enemy instead of hurting them.',
    reactions: [{
      trigger: 'crit', key: 'mod-bloodfeast',
      run: (ctx) => {
        const e = ctx.target;
        if (!e || e.life <= 0) return;
        e.life = Math.min(e.maxLife, e.life + (ctx.amount ?? 0) * 5);
      },
    }],
  },
  {
    id: 'thornskin', name: 'Thornskin', danger: 90, minTier: 10,
    // Deliberately the worst card in the deck. Measured, it more than doubles
    // a run's length and costs a quarter of its clears, and even at x1.90
    // rewards it loses on throughput — which is the point. A shelf where
    // every contract is worth running is a shelf with no decisions on it;
    // some should read as "absolutely not" and be left to rot.
    desc: 'Heroes take 4% of the damage they deal back at themselves.',
    reactions: [{
      trigger: 'hit', key: 'mod-thornskin',
      run: (ctx) => {
        const back = (ctx.amount ?? 0) * 0.04;
        if (back <= 0) return;
        applyEffect(ctx.self, {
          id: 'mod-thornskin', name: 'Thornskin', duration: 0.4,
          dps: back / 0.4, onReapply: 'stack', maxStacks: 10,
        });
      },
    }],
  },
  {
    id: 'shared_pain', name: 'Shared Pain', danger: 16, minTier: 12,
    desc: 'When a hero is hit, everyone else takes 30% of that damage too.',
    reactions: [{
      trigger: 'takeHit', key: 'mod-sharedpain',
      run: (ctx) => splash(ctx, ctx.run.combatants, 0.30, 'mod-sharedpain', 'Shared Pain'),
    }],
  },
  {
    id: 'corrupted', name: 'Corrupted Ground', danger: 14, minTier: 12,
    desc: 'A quarter of the damage your Tank takes is also dealt to everyone else.',
    reactions: [{
      trigger: 'takeHit', key: 'mod-corrupted',
      run: (ctx) => {
        if (ctx.self.role !== 'Tank') return;
        splash(ctx, ctx.run.combatants, 0.25, 'mod-corrupted', 'Corrupted Ground');
      },
    }],
  },
  {
    id: 'sympathetic', name: 'Sympathetic Agony', danger: 12, minTier: 12,
    desc: 'While your Tank is below half health, every hit they take also hits '
      + 'everyone else.',
    reactions: [{
      trigger: 'takeHit', key: 'mod-sympathetic',
      run: (ctx) => {
        if (ctx.self.role !== 'Tank') return;
        if (ctx.self.life > ctx.self.maxLife * 0.5) return;
        splash(ctx, ctx.run.combatants, 1.0, 'mod-sympathetic', 'Sympathetic Agony');
      },
    }],
  },
  {
    id: 'vengeful', name: 'Vengeful', danger: 10, minTier: 10,
    desc: 'Killing an enemy costs the hero who killed it 7% of their health.',
    reactions: [{
      trigger: 'kill', key: 'mod-vengeful',
      run: (ctx) => {
        applyEffect(ctx.self, {
          id: 'mod-vengeful', name: 'Vengeful', duration: 0.4,
          dps: (ctx.self.maxLife * 0.07) / 0.4, onReapply: 'stack', maxStacks: 8,
        });
      },
    }],
  },

  // ---- Mixed --------------------------------------------------------------
  // Not a downside with a sweetener attached: a genuinely different way to
  // play, where the answer is "kill it before it kills you" and a healer is
  // nearly pointless.
  {
    id: 'glass_storm', name: 'Glass Storm', danger: 14, minTier: 12,
    desc: 'The party deals 50% more damage and takes 150% more.',
    curse: { incDamage: 50, damageTaken: 150 },
  },

  // ---- Restrictions -------------------------------------------------------
  {
    id: 'sanctified', name: 'Sanctified Ground', danger: 22, minTier: 8,
    desc: 'Heroes who fight up close cannot go.',
    restrict: { reach: 'melee' },
  },
  {
    id: 'close_quarters', name: 'Close Quarters', danger: 22, minTier: 8,
    desc: 'Heroes who fight from a distance cannot go.',
    restrict: { reach: 'ranged' },
  },
  {
    id: 'silence', name: 'Silence', danger: 26, minTier: 8,
    desc: 'Heroes who cast spells cannot go.',
    restrict: { school: 'spell' },
  },
];

/**
 * One ban per class, generated rather than typed.
 *
 * Twelve hand-written entries would be twelve chances to mistype a class id,
 * and would silently stop covering a class the day a thirteenth is added.
 * Danger is flat because the cost of losing any single class is roughly the
 * same: you bench one hero and field the next one down.
 */
const CLASS_BANS = HERO_CLASSES.map((cls) => ({
  id: `ban_${cls.id}`,
  name: `Warded Against ${cls.name}s`,
  desc: `No ${cls.name} may enter.`,
  danger: 12,
  minTier: 8,
  restrict: { classId: cls.id },
}));

// ---------------------------------------------------------------------------
// Upsides
// ---------------------------------------------------------------------------
//
// Negative danger, so a boon genuinely reduces what a contract pays. A
// contract that hands out free damage *and* full rewards would make the
// downsides optional, and the whole shelf would collapse into "run the ones
// with boons".

const BOONS = [
  {
    id: 'rich_veins', name: 'Rich Veins', danger: -7, boon: true,
    desc: 'Enemies drop 60% more gold.',
    find: { gold: 60 },
  },
  {
    id: 'bountiful', name: 'Bountiful', danger: -6, boon: true,
    desc: '70% more materials.',
    find: { materials: 70 },
  },
  {
    id: 'gilded', name: 'Gilded', danger: -9, boon: true,
    desc: '50% more items drop.',
    find: { quantity: 50 },
  },
  {
    id: 'auspicious', name: 'Auspicious', danger: -9, boon: true,
    desc: '80% increased rarity of items found.',
    find: { rarity: 80 },
  },
  {
    id: 'fabled', name: 'Fabled', danger: -10, boon: true,
    desc: 'Unique items are three times as likely to drop.',
    find: { unique: 200 },
  },
  {
    id: 'wellspring', name: 'Wellspring', danger: -4, boon: true,
    desc: 'Mana, Rage and Energy refill 80% faster.',
    curse: { resourceRegen: 80 },
  },
  {
    id: 'empowered', name: 'Empowered', danger: -8, boon: true,
    desc: 'The party deals 30% more damage.',
    curse: { incDamage: 30 },
  },
  {
    id: 'blessed', name: 'Blessed', danger: -5, boon: true,
    desc: 'Healing is 45% more effective.',
    curse: { incHeal: 45 },
  },
  {
    id: 'swift', name: 'Swift', danger: -7, boon: true,
    desc: 'The party attacks 20% faster.',
    curse: { incAtkSpeed: 20 },
  },
  {
    id: 'emboldened', name: 'Emboldened', danger: -6, boon: true,
    desc: 'The party takes 20% less damage.',
    curse: { damageTaken: -20 },
  },
];

export const MODIFIERS = [...DOWNSIDES, ...CLASS_BANS, ...BOONS];
export const MODIFIER_BY_ID = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));
export const DOWNSIDE_IDS = [...DOWNSIDES, ...CLASS_BANS].map((m) => m.id);
export const BOON_IDS = BOONS.map((m) => m.id);

/** Splashes a share of a hit onto everyone else, as a real damage event. */
function splash(ctx, everyone, share, id, name) {
  const amount = (ctx.amount ?? 0) * share;
  if (amount <= 0) return;
  for (const ally of everyone) {
    if (ally === ctx.self || ally.down) continue;
    // Delivered as a very short effect so it routes through the same damage
    // path as everything else, and a hero finished by it is reported as such.
    applyEffect(ally, {
      id: `${id}:${ctx.self.uid}`, name, duration: 0.4,
      dps: amount / 0.4, onReapply: 'stack', maxStacks: 8,
    });
  }
}

// ---------------------------------------------------------------------------
// Reading a set of modifiers
// ---------------------------------------------------------------------------

/**
 * Downside modifiers a contract of this tier may roll.
 *
 * The twelve class bans collapse to a *single* entry, chosen at random by the
 * caller. Left as twelve they were nearly half the pool, and measured, almost
 * every contract rolled banned somebody — which turns a modifier meant to be
 * occasional flavour into a permanent tax on having a shallow roster.
 */
export function downsidePoolFor(tier, pickBan = null) {
  const plain = DOWNSIDES.filter((m) => tier >= (m.minTier ?? 1));
  const bans = CLASS_BANS.filter((m) => tier >= (m.minTier ?? 1));
  if (!bans.length) return plain;
  const ban = pickBan ? pickBan(bans) : bans[0];
  return [...plain, ban];
}

/** Boons a contract of this tier may roll. */
export function boonPoolFor() {
  return BOON_IDS.map((id) => MODIFIER_BY_ID[id]);
}

/**
 * Merges modifiers into the multipliers makeEnemy already reads.
 *
 * Multiplicative for the scalar keys so two life modifiers compound rather
 * than one silently replacing the other; additive for resistance, which is
 * already a percentage. `attackMix` is replaced rather than blended, and a
 * contract is never rolled with two modifiers that both claim it.
 */
export function applyModifiersToProfile(profile, modIds) {
  const out = { ...profile };
  for (const id of modIds) {
    const mod = MODIFIER_BY_ID[id];
    if (!mod?.profile) continue;
    for (const [key, value] of Object.entries(mod.profile)) {
      if (key === 'attackMix') out.attackMix = { ...value };
      else if (key === 'res') out.res = (out.res ?? 0) + value;
      else out[key] = (out[key] ?? 1) * value;
    }
  }
  return out;
}

/** The combined mod bag every hero carries under these modifiers. */
export function curseFrom(modIds) {
  const out = {};
  for (const id of modIds) {
    const mod = MODIFIER_BY_ID[id];
    if (!mod?.curse) continue;
    for (const [key, value] of Object.entries(mod.curse)) {
      out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}

/** Find-rate bonuses: gold, materials, quantity, rarity, unique chance. */
export function findFrom(modIds) {
  const out = { gold: 0, materials: 0, quantity: 0, rarity: 0, unique: 0 };
  for (const id of modIds) {
    const mod = MODIFIER_BY_ID[id];
    if (!mod?.find) continue;
    for (const [key, value] of Object.entries(mod.find)) out[key] += value;
  }
  return out;
}

/** Reactions every hero gains under these modifiers. */
export function reactionsFrom(modIds) {
  return modIds.flatMap((id) => MODIFIER_BY_ID[id]?.reactions ?? []);
}

/** Every composition ban these modifiers impose. */
export function restrictionsFrom(modIds) {
  return modIds.map((id) => MODIFIER_BY_ID[id])
    .filter((m) => m?.restrict)
    .map((m) => ({ mod: m, ...m.restrict }));
}

/**
 * Which heroes a set of modifiers refuses to admit.
 * @returns {{hero: object, mod: object}[]}
 */
export function barredMembers(modIds, heroes, classOf) {
  const bans = restrictionsFrom(modIds);
  if (!bans.length) return [];
  const out = [];
  for (const hero of heroes) {
    const cls = classOf(hero.classId);
    for (const ban of bans) {
      if (ban.classId && hero.classId === ban.classId) { out.push({ hero, mod: ban.mod }); break; }
      if (ban.reach && cls?.reach === ban.reach) { out.push({ hero, mod: ban.mod }); break; }
      if (ban.school && cls?.school === ban.school) { out.push({ hero, mod: ban.mod }); break; }
      if (ban.role && cls?.role === ban.role) { out.push({ hero, mod: ban.mod }); break; }
    }
  }
  return out;
}

/**
 * Total danger — what the contract pays on. Boons subtract.
 *
 * Danger is measured rather than judged. Each downside was run headlessly at
 * Tier 16 against a party geared for it, and priced on what it actually cost:
 * how much longer the run took (throughput is what matters in an idle game,
 * so a modifier that only inflates enemy life is expensive) plus how often it
 * turned a clear into a wipe. See tests/contracts.test.mjs, which fails if a
 * modifier's stated danger drifts far from its measured cost.
 */
export function dangerOf(modIds) {
  return Math.max(0, modIds.reduce((a, id) => a + (MODIFIER_BY_ID[id]?.danger ?? 0), 0));
}
