// data/heroclasses.js — hero archetypes and rarity tiers.
//
// A hero's class fixes four things: their role in a party, how their level
// translates into stats, where they stand, and the passive ability that fires
// on its own during a run. Nothing here is clicked — abilities are ordinary
// cooldowns and triggers on the effects engine, resolved by the game.
//
// Positioning follows from what a class does rather than from player choice:
//   row     'front' can be reached by melee enemies; 'back' cannot, until the
//           front line falls.
//   reach   'melee' heroes must stand in the front row to attack at all, which
//           is why a melee class is always a front-row class.
//   school  how this class's damage arrives, for enemies that resist one kind.

import {
  selfBuff, dotFromHit, partyHot, announce, all, healWounded,
} from '../expedition/reactions.js';
import { applyEffect } from '../expedition/effects.js';

/**
 * `mult` scales the level-derived base curve in stats.js.
 *   life/armour/evasion — survivability
 *   damage/aps          — offence
 *   heal                — healing per cast (0 for non-healers)
 *   threat              — share of incoming attacks drawn (tanks are high)
 * `block` is granted by the class itself, on top of any shield carried.
 * `resist` is a percentage change to damage taken from one kind of attack.
 */
export const HERO_CLASSES = [
  // ---- Tanks --------------------------------------------------------------
  {
    id: 'warrior', name: 'Warrior', role: 'Tank', icon: 'shield',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'A wall against anything holding a weapon. Steel turns steel, and does much less against a curse.',
    mult: { life: 1.90, armour: 2.15, evasion: 0.42, damage: 0.60, aps: 0.90, heal: 0, threat: 6.0 },
    block: { melee: 15, spell: 0 },
    resist: { melee: 24, spell: -22 },
    prefers: ['mace1h', 'sword1h', 'shield_str'],
    ability: {
      name: 'Bulwark Stance',
      desc: 'Blocking a blow adds 12% armour for 4s, stacking three times.',
      reactions: [{
        trigger: 'block', key: 'bulwark',
        costs: 15,
        run: selfBuff('bulwark', 'Bulwark Stance', { incArmour: 12 }, 4,
          { onReapply: 'stack', maxStacks: 3 }),
      }],
    },
  },
  {
    id: 'paladin', name: 'Paladin', role: 'Tank', icon: 'chalice',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'Faith turns aside what armour cannot. Softer to a blade than a Warrior, far harder to burn.',
    mult: { life: 1.90, armour: 2.15, evasion: 0.42, damage: 0.65, aps: 0.90, heal: 0, threat: 6.0 },
    block: { melee: 0, spell: 15 },
    resist: { melee: -16, spell: 28 },
    prefers: ['mace1h', 'sword1h', 'shield_int'],
    ability: {
      name: 'Consecrate',
      desc: 'Wards the whole party against spells while the Paladin stands, and '
        + 'turning a spell aside mends them over the next 4s.',
      reactions: [
        {
          // A tank soaks melee for the party simply by standing in front of
          // it. Nothing does that for spells, which pass the front line and
          // spread by threat — so a spell-resistant tank protected only
          // itself, and could never trade evenly with a melee-resistant one.
          // The ward is what makes the Paladin the answer to a caster house
          // rather than merely a hero who survives it.
          trigger: 'combatStart', key: 'consecrate-ward',
          run: (ctx) => {
            for (const ally of ctx.run.combatants) {
              if (ally.down) continue;
              applyEffect(ally, {
                id: `consecrate:${ctx.self.uid}`, name: 'Consecrated',
                mods: { spellResist: 18 }, duration: Infinity, source: ctx.self.uid,
              });
            }
          },
        },
        {
          trigger: 'block', key: 'consecrate-mend',
          run: (ctx) => {
            if (ctx.kind !== 'spell') return;
            applyEffect(ctx.self, {
              id: 'consecrate-mend', name: 'Consecrate', duration: 4,
              hps: ctx.self.maxLife * 0.03 / 4,
            });
          },
        },
      ],
    },
  },
  {
    id: 'guardian', name: 'Guardian', role: 'Tank', icon: 'tower',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'No particular strength and no particular weakness — simply refuses to stop standing there.',
    mult: { life: 1.90, armour: 2.15, evasion: 0.42, damage: 0.55, aps: 0.90, heal: 0, threat: 6.0 },
    block: { melee: 5, spell: 5 },
    // Even-handed rather than simply unbuffed: a small bonus to both is what
    // makes the middle of the range its home instead of nobody's.
    resist: { melee: 9, spell: 9 },
    prefers: ['mace1h', 'sword1h', 'shield_str'],
    ability: {
      name: 'Second Wind',
      desc: 'Recovers 1.2% of maximum life every second, for the whole run.',
      reactions: [{
        trigger: 'combatStart', key: 'secondwind',
        run: selfBuff('secondwind', 'Second Wind', { lifeRegenPct: 1.2 }, Infinity),
      }],
    },
  },

  // ---- Healers ------------------------------------------------------------
  {
    id: 'cleric', name: 'Cleric', role: 'Healer', icon: 'chalice',
    row: 'back', reach: 'ranged', school: 'spell',
    blurb: 'Big heals, one at a time. Copes when a single ally is being hammered; struggles when everyone is.',
    mult: { life: 1.05, armour: 0.90, evasion: 0.60, damage: 0.50, aps: 0.95, heal: 1.30, threat: 0.7 },
    prefers: ['mace1h', 'staff', 'shield_int'],
    ability: {
      name: 'Intercession',
      desc: 'When an ally falls below half life, healing is 60% stronger for 5s.',
      reactions: [{
        trigger: 'allyLow', key: 'intercession', cooldown: 8,
        costs: 'ability',
        run: selfBuff('intercession', 'Intercession', { incHeal: 60 }, 5),
      }],
    },
  },
  {
    id: 'druid', name: 'Druid', role: 'Healer', icon: 'leaf',
    row: 'back', reach: 'ranged', school: 'spell',
    blurb: 'Wards the whole party rather than answering one wound at a time. '
      + 'The healer to bring when damage is spread across everyone, or when there '
      + 'is no tank to soak it — and the wrong one when a single ally is being hammered.',
    mult: { life: 1.00, armour: 0.75, evasion: 0.70, damage: 0.50, aps: 0.90, heal: 1.00, threat: 0.7 },
    prefers: ['staff', 'wand', 'shield_dex'],
    ability: {
      name: 'Rejuvenation',
      desc: 'Every 5s the whole party regains life over the following 5s. Healing '
        + 'that would be wasted on an unhurt ally becomes a ward instead, '
        + 'absorbing the next damage they take — so a Druid prepares a party '
        + 'for a blow rather than answering one.',
      reactions: [{
        trigger: 'hit', key: 'rejuv', cooldown: 5,
        costs: 'ability',
        bind(sheet) { this.power = sheet.healPower * 6.0; },
        run(ctx) {
          // The overflow is the whole point. A party-wide heal-over-time lands
          // mostly on people who are fine, which made the Druid a worse Cleric;
          // banking that overflow as absorb is what makes it a different job.
          partyHot('rejuv', 'Rejuvenation', this.power ?? 0, 5, { wardOverflow: 1 })(ctx);
        },
      }],
    },
  },
  {
    id: 'templar', name: 'Templar', role: 'Healer', icon: 'hammer',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'Heals by fighting, and cannot heal any other way. Hits harder than any other healer, and has to stand where it hurts.',
    mult: { life: 1.30, armour: 1.20, evasion: 0.55, damage: 1.15, aps: 1.05, heal: 0, threat: 1.6 },
    prefers: ['mace1h', 'sword1h', 'shield_str'],
    ability: {
      name: 'Radiance',
      desc: 'Damage dealt heals the most wounded ally for 50% of it, and everyone else '
        + 'for 18% over 3s. Costs mana on every swing, so a long fight runs it dry.',
      reactions: [{
        trigger: 'hit', key: 'radiance',
        costs: 4,
        run: all(healWounded(0.50), (ctx) => {
          for (const ally of ctx.run.combatants) {
            if (ally.down || ally === ctx.healed) continue;
            applyEffect(ally, {
              id: `radiance:${ctx.self.uid}`, name: 'Radiance', duration: 3,
              hps: (ctx.amount * 0.18) / 3, source: ctx.self.uid,
            });
          }
        }),
      }],
    },
  },

  // ---- Damage -------------------------------------------------------------
  {
    id: 'rogue', name: 'Rogue', role: 'DPS', icon: 'dagger',
    row: 'front', reach: 'melee', school: 'melee',
    // The only class that fights with a weapon in each hand. The offhand
    // adds a share of its own damage rather than all of it, so two daggers
    // beat one but do not simply double the Rogue.
    dualWield: true,
    blurb: 'Opens a fight far ahead of anyone else and fades as it drags on. Wants short, decisive waves.',
    mult: { life: 0.95, armour: 0.65, evasion: 1.30, damage: 1.25, aps: 1.20, heal: 0, threat: 1.1 },
    prefers: ['dagger', 'sword1h', 'axe1h'],
    perk: { rarity: 20, gold: 15 },
    // A big bonus at a price energy cannot sustain: four or five ferocious
    // swings to open a wave, then one whenever the bar refills. That is the
    // burst, and it is worth most where waves are short.
    resourceCosts: { empower: 26 },
    empowerBonus: 35,
    ability: {
      name: 'Bloodlust',
      desc: 'Opens every wave with +90% damage, bleeding away over 6s.',
      reactions: [{
        trigger: 'combatStart', key: 'bloodlust',
        run: selfBuff('bloodlust', 'Bloodlust', { incDamage: 90 }, 6, { decay: 1 / 6 }),
      }],
    },
  },
  {
    id: 'archer', name: 'Archer', role: 'DPS', icon: 'bow',
    row: 'back', reach: 'ranged', school: 'melee',
    blurb: 'Steady damage from out of reach. Nothing spectacular in a burst, and untouchable while the front line holds.',
    mult: { life: 0.85, armour: 0.45, evasion: 1.60, damage: 1.20, aps: 1.30, heal: 0, threat: 0.9 },
    prefers: ['bow', 'quiver'],
    // A small bonus at a price energy comfortably sustains, so an Archer has
    // it up almost permanently and opens no stronger than it finishes.
    resourceCosts: { empower: 11 },
    empowerBonus: 18,
    ability: {
      name: 'Steady Aim',
      desc: 'Each hit builds 4% attack speed for 5s, up to five times.',
      reactions: [{
        trigger: 'hit', key: 'steadyaim',
        run: selfBuff('steadyaim', 'Steady Aim', { incAtkSpeed: 4 }, 5,
          { onReapply: 'stack', maxStacks: 5 }),
      }],
    },
  },
  {
    id: 'wizard', name: 'Wizard', role: 'DPS', icon: 'staff',
    row: 'back', reach: 'ranged', school: 'spell',
    blurb: 'The highest damage in the guild and the lowest life in it. Needs something else standing between it and everything.',
    mult: { life: 0.62, armour: 0.30, evasion: 0.65, damage: 1.70, aps: 0.85, heal: 0, threat: 1.0 },
    prefers: ['staff', 'wand', 'shield_int'],
    ability: {
      name: 'Overload',
      desc: 'Hits burn the target for a further 35% of the damage over 3s.',
      reactions: [{
        trigger: 'hit', key: 'overload',
        costs: 2,
        run: all(dotFromHit('overload', 'Overload', 0.35, 3),
          announce((ctx) => `${ctx.self.name}'s magic sets ${ctx.target.name} alight.`, 0.15)),
      }],
    },
  },
  {
    id: 'warlock', name: 'Warlock', role: 'DPS', icon: 'skull',
    row: 'back', reach: 'ranged', school: 'spell',
    blurb: 'Withers everything at once. The weakest single target in the guild, and the only one who does not care how many enemies there are.',
    mult: { life: 0.80, armour: 0.40, evasion: 0.75, damage: 1.12, aps: 0.95, heal: 0, threat: 1.0 },
    prefers: ['wand', 'staff', 'shield_int'],
    ability: {
      name: 'Contagion',
      desc: 'Every hit curses every *other* enemy for 35% of the damage over 3s, '
        + 'stacking five times. Nothing extra against a lone target.',
      reactions: [{
        // No cooldown, and the struck target is excluded: this is a cleave, so
        // it should scale with how many enemies there are and do nothing at all
        // against one. On a cooldown it was too rare to be an identity.
        trigger: 'hit', key: 'contagion',
        costs: 2,
        run: (ctx) => {
          for (const enemy of ctx.run.enemies) {
            if (enemy === ctx.target) continue;
            applyEffect(enemy, {
              // Per-caster: two Warlocks should curse a target twice over.
              id: `contagion:${ctx.self.uid}`, name: 'Contagion', duration: 3,
              dps: (ctx.amount * 0.35) / 3, source: ctx.self.uid,
              // Stacking, not refreshing: applying it on every hit would
              // otherwise collapse seven applications into one.
              onReapply: 'stack', maxStacks: 5,
            });
          }
        },
      }],
    },
  },
  {
    id: 'inquisitor', name: 'Inquisitor', role: 'DPS', icon: 'sword',
    row: 'front', reach: 'melee', school: 'hybrid',
    // Most of what it contributes lands on its allies, so a party of nothing
    // but Inquisitors wastes almost all of it. Measured alone it will always
    // look like the weakest damage class in the game, and is not.
    support: true,
    blurb: 'Blade and incantation together, excelling at neither. Armoured for a damage class, and the party fights better with one present.',
    mult: { life: 1.25, armour: 1.15, evasion: 0.80, damage: 1.00, aps: 1.00, heal: 0, threat: 1.3 },
    prefers: ['sword1h', 'mace1h', 'shield_str'],
    ability: {
      name: 'Zealotry',
      desc: 'While the Inquisitor stands, the whole party deals 12% more damage.',
      reactions: [{
        trigger: 'combatStart', key: 'zealotry',
        run: (ctx) => {
          for (const ally of ctx.run.combatants) {
            if (ally.down) continue;
            applyEffect(ally, {
              id: 'zealotry', name: 'Zealotry', mods: { incDamage: 12 },
              duration: Infinity, source: ctx.self.uid,
            });
          }
        },
      }],
    },
  },
];

export const CLASS_BY_ID = Object.fromEntries(HERO_CLASSES.map((c) => [c.id, c]));

/**
 * Classes retired in the rework, mapped to their nearest survivor. An existing
 * roster keeps playing — a Berserker becomes a Rogue rather than vanishing.
 */
export const RETIRED_CLASSES = {
  berserker: 'rogue',
  ranger: 'archer',
  sorcerer: 'wizard',
};

/**
 * Hero rarity. Better heroes have stronger stats and more traits, and are the
 * main thing gold is spent chasing.
 */
/** `cost` multiplies the recruit price — a better hero is worth more gold. */
export const HERO_RARITIES = [
  { id: 'common', name: 'Common', cls: 'h-common', mult: 1.00, traits: 1, weight: 520, cost: 1.0 },
  { id: 'uncommon', name: 'Uncommon', cls: 'h-uncommon', mult: 1.16, traits: 2, weight: 300, cost: 2.1 },
  { id: 'rare', name: 'Rare', cls: 'h-rare', mult: 1.34, traits: 3, weight: 130, cost: 4.2 },
  { id: 'epic', name: 'Epic', cls: 'h-epic', mult: 1.58, traits: 4, weight: 42, cost: 9.0 },
  { id: 'legendary', name: 'Legendary', cls: 'h-legendary', mult: 1.90, traits: 5, weight: 8, cost: 20.0 },
];

export const RARITY_BY_ID = Object.fromEntries(HERO_RARITIES.map((r) => [r.id, r]));

/** Roles used for party-composition hints. Damage is damage. */
export const ROLES = ['Tank', 'Healer', 'DPS'];

// ---------------------------------------------------------------------------
// Name generation
// ---------------------------------------------------------------------------

export const FIRST_NAMES = [
  'Aldric', 'Bryn', 'Cass', 'Dorn', 'Eira', 'Fenn', 'Gwyn', 'Hale', 'Isolde', 'Jorund',
  'Kesh', 'Lira', 'Maud', 'Nyle', 'Orla', 'Perrin', 'Quill', 'Roan', 'Sable', 'Tovin',
  'Ulla', 'Vex', 'Wren', 'Yarrow', 'Zeph', 'Corvin', 'Mira', 'Halden', 'Sorrel', 'Tam',
  'Edda', 'Garrick', 'Nesta', 'Oswin', 'Piety', 'Rook', 'Thane', 'Verity', 'Wulf', 'Ysolde',
];

export const EPITHETS = [
  'the Bold', 'the Quiet', 'Ironhand', 'Stormborn', 'the Patient', 'Ashfell', 'Greycloak',
  'the Unbroken', 'Nightwarden', 'of the Vale', 'Blackbriar', 'the Steadfast', 'Emberkin',
  'Coldwater', 'the Wayward', 'Thornwood', 'the Elder', 'Ninefingers', 'the Kind', 'Ravenshade',
];
