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

import { selfBuff, dotFromHit, partyHot, announce, all } from '../expedition/abilities.js';
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
    mult: { life: 1.95, armour: 2.30, evasion: 0.40, damage: 0.60, aps: 0.90, heal: 0, threat: 6.0 },
    block: { melee: 15, spell: 0 },
    resist: { melee: 10, spell: -20 },
    prefers: ['mace1h', 'sword1h', 'shield_str'],
    ability: {
      name: 'Bulwark Stance',
      desc: 'Blocking a blow adds 12% armour for 4s, stacking three times.',
      reactions: [{
        trigger: 'block', key: 'bulwark',
        run: selfBuff('bulwark', 'Bulwark Stance', { incArmour: 12 }, 4,
          { onReapply: 'stack', maxStacks: 3 }),
      }],
    },
  },
  {
    id: 'paladin', name: 'Paladin', role: 'Tank', icon: 'chalice',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'Faith turns aside what armour cannot. Softer to a blade than a Warrior, far harder to burn.',
    mult: { life: 1.55, armour: 1.60, evasion: 0.50, damage: 0.65, aps: 0.90, heal: 0, threat: 5.4 },
    block: { melee: 0, spell: 15 },
    resist: { melee: -20, spell: 10 },
    prefers: ['mace1h', 'sword1h', 'shield_int'],
    ability: {
      name: 'Consecrate',
      desc: 'Turning a spell aside mends the Paladin over the next 4s.',
      reactions: [{
        trigger: 'block', key: 'consecrate',
        run: (ctx) => {
          if (ctx.kind !== 'spell') return;
          applyEffect(ctx.self, {
            id: 'consecrate', name: 'Consecrate', duration: 4,
            hps: ctx.self.maxLife * 0.03 / 4,
          });
        },
      }],
    },
  },
  {
    id: 'guardian', name: 'Guardian', role: 'Tank', icon: 'tower',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'No particular strength and no particular weakness — simply refuses to stop standing there.',
    mult: { life: 1.80, armour: 2.00, evasion: 0.45, damage: 0.55, aps: 0.90, heal: 0, threat: 6.0 },
    block: { melee: 5, spell: 5 },
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
        run: selfBuff('intercession', 'Intercession', { incHeal: 60 }, 5),
      }],
    },
  },
  {
    id: 'druid', name: 'Druid', role: 'Healer', icon: 'leaf',
    row: 'back', reach: 'ranged', school: 'spell',
    blurb: 'Healing that arrives steadily rather than all at once. Carries a party through a grind; poor at catching a sudden drop.',
    mult: { life: 1.00, armour: 0.75, evasion: 0.70, damage: 0.50, aps: 0.90, heal: 0.55, threat: 0.7 },
    prefers: ['staff', 'wand', 'shield_dex'],
    ability: {
      name: 'Rejuvenation',
      desc: 'Every 6s the whole party regains life over the following 6s.',
      reactions: [{
        trigger: 'hit', key: 'rejuv', cooldown: 6,
        bind(sheet) { this.power = sheet.healPower * 1.6; },
        run(ctx) { partyHot('rejuv', 'Rejuvenation', this.power ?? 0, 6)(ctx); },
      }],
    },
  },
  {
    id: 'templar', name: 'Templar', role: 'Healer', icon: 'hammer',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'Heals by fighting, and cannot heal any other way. Hits harder than any other healer, and has to stand where it hurts.',
    mult: { life: 1.30, armour: 1.20, evasion: 0.55, damage: 0.95, aps: 1.00, heal: 0, threat: 1.6 },
    prefers: ['mace1h', 'sword1h', 'shield_str'],
    ability: {
      name: 'Radiance',
      desc: 'Damage dealt heals the most wounded ally for 35% of it, and everyone else for 15% over 3s.',
      reactions: [{
        trigger: 'hit', key: 'radiance',
        run: (ctx) => {
          const wounded = ctx.run.combatants
            .filter((x) => !x.down && x.life < x.maxLife)
            .sort((a, b) => (a.life / a.maxLife) - (b.life / b.maxLife))[0];
          if (wounded) {
            wounded.life = Math.min(wounded.maxLife, wounded.life + ctx.amount * 0.35);
          }
          for (const ally of ctx.run.combatants) {
            if (ally.down || ally === wounded) continue;
            applyEffect(ally, {
              id: 'radiance', name: 'Radiance', duration: 3,
              hps: (ctx.amount * 0.15) / 3, source: ctx.self.uid,
            });
          }
        },
      }],
    },
  },

  // ---- Damage -------------------------------------------------------------
  {
    id: 'rogue', name: 'Rogue', role: 'DPS', icon: 'dagger',
    row: 'front', reach: 'melee', school: 'melee',
    blurb: 'Opens a fight far ahead of anyone else and fades as it drags on. Wants short, decisive waves.',
    mult: { life: 0.95, armour: 0.65, evasion: 1.30, damage: 1.25, aps: 1.20, heal: 0, threat: 1.1 },
    prefers: ['dagger', 'sword1h', 'axe1h'],
    perk: { rarity: 20, gold: 15 },
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
    ability: {
      name: 'Steady Aim',
      desc: 'Each hit builds 6% attack speed for 5s, up to five times.',
      reactions: [{
        trigger: 'hit', key: 'steadyaim',
        run: selfBuff('steadyaim', 'Steady Aim', { incAtkSpeed: 6 }, 5,
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
      desc: 'A critical strike burns the target for a further 60% of the hit over 3s.',
      reactions: [{
        trigger: 'crit', key: 'overload',
        run: all(dotFromHit('overload', 'Overload', 0.6, 3),
          announce((ctx) => `${ctx.self.name}'s magic sets ${ctx.target.name} alight.`, 0.15)),
      }],
    },
  },
  {
    id: 'warlock', name: 'Warlock', role: 'DPS', icon: 'skull',
    row: 'back', reach: 'ranged', school: 'spell',
    blurb: 'Withers everything at once. The weakest single target in the guild, and the only one who does not care how many enemies there are.',
    mult: { life: 0.80, armour: 0.40, evasion: 0.75, damage: 0.85, aps: 0.95, heal: 0, threat: 1.0 },
    prefers: ['wand', 'staff', 'shield_int'],
    ability: {
      name: 'Contagion',
      desc: 'Every 3s, a hit spreads a wasting curse to every enemy for 45% of it over 4s.',
      reactions: [{
        trigger: 'hit', key: 'contagion', cooldown: 3,
        run: (ctx) => {
          for (const enemy of ctx.run.enemies) {
            applyEffect(enemy, {
              id: 'contagion', name: 'Contagion', duration: 4,
              dps: (ctx.amount * 0.45) / 4, source: ctx.self.uid,
            });
          }
        },
      }],
    },
  },
  {
    id: 'inquisitor', name: 'Inquisitor', role: 'DPS', icon: 'sword',
    row: 'front', reach: 'melee', school: 'hybrid',
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
export const HERO_RARITIES = [
  { id: 'common', name: 'Common', cls: 'h-common', mult: 1.00, traits: 1, weight: 520 },
  { id: 'uncommon', name: 'Uncommon', cls: 'h-uncommon', mult: 1.16, traits: 2, weight: 300 },
  { id: 'rare', name: 'Rare', cls: 'h-rare', mult: 1.34, traits: 3, weight: 130 },
  { id: 'epic', name: 'Epic', cls: 'h-epic', mult: 1.58, traits: 4, weight: 42 },
  { id: 'legendary', name: 'Legendary', cls: 'h-legendary', mult: 1.90, traits: 5, weight: 8 },
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
