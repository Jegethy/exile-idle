// data/skills.js — the one active thing a hero brings, chosen from three.
//
// Traits are passive stat lines and every hero keeps all of them. A skill is a
// reaction — the same shape as a class ability or a unique item's effect — and
// a hero holds three but may only use one. That is what makes two Rogues
// different from each other, and what makes a Legendary's *rolls* worth
// reading rather than just its rarity.
//
// Eligibility is not role alone. A Warlock is a damage class, but it is a
// ranged spellcaster: offering it a skill about landing melee blows would
// hand it a choice between two options it can never use and one it can. So a
// skill may require any of role, school and reach, and a hero only ever rolls
// skills whose every stated requirement it meets.
//
// The pool is shared rather than per class. Twelve classes would mean twelve
// content pipelines all needing balance; requirements give most of the same
// flavour from one list.

import {
  selfBuff, dotFromHit, partyHot, announce, all, healWounded,
} from '../expedition/reactions.js';
import { applyEffect } from '../expedition/effects.js';

/**
 * @typedef {object} Skill
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {object} [req]    - { role, school, reach }; omitted keys match all
 * @property {Array}  reactions
 */
export const SKILLS = [
  // ---- Anyone -------------------------------------------------------------
  {
    id: 'second_wind', name: 'Second Wind',
    desc: 'Below half life, regenerate 1.5% of maximum life per second.',
    reactions: [{
      trigger: 'takeHit', key: 'skill-secondwind', cooldown: 6,
      run: (ctx) => {
        if (ctx.self.life > ctx.self.maxLife * 0.5) return;
        selfBuff('skill-secondwind', 'Second Wind', { lifeRegenPct: 1.5 }, 6)(ctx);
      },
    }],
  },
  {
    id: 'adrenaline', name: 'Adrenaline',
    desc: 'Falling below half life grants 25% attack speed for 6s.',
    reactions: [{
      trigger: 'allyLow', key: 'skill-adrenaline', cooldown: 12,
      run: (ctx) => {
        if (ctx.target !== ctx.self) return;
        selfBuff('skill-adrenaline', 'Adrenaline', { incAtkSpeed: 25 }, 6)(ctx);
      },
    }],
  },
  {
    id: 'veterans_eye', name: "Veteran's Eye",
    desc: 'Every kill grants 8% damage for 5s, stacking four times.',
    reactions: [{
      trigger: 'kill', key: 'skill-veteran',
      run: selfBuff('skill-veteran', "Veteran's Eye", { incDamage: 8 }, 5,
        { onReapply: 'stack', maxStacks: 4 }),
    }],
  },
  {
    id: 'resolute', name: 'Resolute',
    desc: 'Take 10% less damage while an ally is down.',
    reactions: [{
      trigger: 'allyDown', key: 'skill-resolute',
      run: selfBuff('skill-resolute', 'Resolute', { damageTaken: -10 }, Infinity),
    }],
  },

  // ---- Tanks --------------------------------------------------------------
  {
    id: 'bulwark', name: 'Iron Bulwark', req: { role: 'Tank' },
    desc: 'Blocking grants 8% armour for 5s, stacking five times. Costs rage.',
    reactions: [{
      trigger: 'block', key: 'skill-bulwark', costs: 12,
      run: selfBuff('skill-bulwark', 'Iron Bulwark', { incArmour: 8 }, 5,
        { onReapply: 'stack', maxStacks: 5 }),
    }],
  },
  {
    id: 'taunt', name: 'Challenging Shout', req: { role: 'Tank' },
    desc: 'Every 8s, draw more attention and take 12% less damage for 5s. Costs rage.',
    reactions: [{
      trigger: 'takeHit', key: 'skill-taunt', cooldown: 8, costs: 25,
      run: all(
        selfBuff('skill-taunt', 'Challenging Shout', { threat: 3, damageTaken: -12 }, 5),
        announce((ctx) => `${ctx.self.name} roars a challenge.`, 0.3),
      ),
    }],
  },
  {
    id: 'last_stand', name: 'Last Stand', req: { role: 'Tank' },
    desc: 'Below a quarter life, heal 3% of maximum life per second for 5s. Costs rage.',
    reactions: [{
      trigger: 'takeHit', key: 'skill-laststand', cooldown: 20, costs: 40,
      run: (ctx) => {
        if (ctx.self.life > ctx.self.maxLife * 0.25) return;
        applyEffect(ctx.self, {
          id: 'skill-laststand', name: 'Last Stand', duration: 5,
          hps: ctx.self.maxLife * 0.03,
        });
      },
    }],
  },

  // ---- Healers ------------------------------------------------------------
  {
    id: 'triage', name: 'Triage', req: { role: 'Healer' },
    desc: 'Healing an ally below half life restores an extra 40%.',
    reactions: [{
      trigger: 'heal', key: 'skill-triage',
      run: (ctx) => {
        if (!ctx.target || ctx.target.life > ctx.target.maxLife * 0.5) return;
        healWounded(0.4)(ctx);
      },
    }],
  },
  {
    id: 'renewal', name: 'Renewal', req: { role: 'Healer' },
    desc: 'Every heal also mends the party for 12% of it over 3s.',
    reactions: [{
      trigger: 'heal', key: 'skill-renewal',
      run: (ctx) => {
        if (!ctx.amount) return;
        partyHot('skill-renewal', 'Renewal', ctx.amount * 0.12, 3)(ctx);
      },
    }],
  },
  {
    id: 'meditation', name: 'Meditation', req: { role: 'Healer' },
    desc: 'Regenerate 45% more mana.',
    reactions: [{
      trigger: 'combatStart', key: 'skill-meditation',
      run: selfBuff('skill-meditation', 'Meditation', { resourceRegen: 45 }, Infinity),
    }],
  },

  // ---- Support ------------------------------------------------------------
  {
    id: 'anthem', name: 'Rousing Anthem', req: { role: 'Support' },
    desc: 'The party deals 10% more damage while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'skill-anthem',
      run: (ctx) => {
        for (const ally of ctx.run.combatants) {
          if (ally.down) continue;
          applyEffect(ally, {
            id: `skill-anthem:${ctx.self.uid}`, name: 'Rousing Anthem',
            mods: { incDamage: 10 }, duration: Infinity, source: ctx.self.uid,
          });
        }
      },
    }],
  },
  {
    id: 'dirge', name: 'Steadying Dirge', req: { role: 'Support' },
    desc: 'The party takes 8% less damage while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'skill-dirge',
      run: (ctx) => {
        for (const ally of ctx.run.combatants) {
          if (ally.down) continue;
          applyEffect(ally, {
            id: `skill-dirge:${ctx.self.uid}`, name: 'Steadying Dirge',
            mods: { damageTaken: -8 }, duration: Infinity, source: ctx.self.uid,
          });
        }
      },
    }],
  },

  // ---- Those who fight hand to hand --------------------------------------
  {
    id: 'riposte', name: 'Riposte', req: { reach: 'melee' },
    desc: 'Blocking strikes back for a share of your damage.',
    reactions: [{
      trigger: 'block', key: 'skill-riposte',
      run: (ctx) => {
        const enemy = ctx.target;
        if (!enemy) return;
        enemy.life -= (ctx.sheet?.avgHit ?? 0) * 0.6;
        ctx.self.damageDealt = (ctx.self.damageDealt ?? 0) + (ctx.sheet?.avgHit ?? 0) * 0.6;
      },
    }],
  },
  {
    id: 'rend', name: 'Rend', req: { reach: 'melee', role: 'DPS' },
    desc: 'Hits bleed the target for 25% of the damage over 3s.',
    reactions: [{
      trigger: 'hit', key: 'skill-rend', chance: 0.35,
      run: dotFromHit('skill-rend', 'Rend', 0.25, 3),
    }],
  },
  {
    id: 'flurry', name: 'Flurry', req: { reach: 'melee', role: 'DPS' },
    desc: '12% chance to strike again. Costs energy or mana.',
    reactions: [{
      trigger: 'hit', key: 'skill-flurry', chance: 0.12, costs: 18,
      run: (ctx) => { ctx.repeat = true; },
    }],
  },

  // ---- Those who fight from a distance -----------------------------------
  {
    id: 'takeaim', name: 'Take Aim', req: { reach: 'ranged', role: 'DPS' },
    desc: 'Every third second, the next hit deals 45% more.',
    reactions: [{
      trigger: 'hit', key: 'skill-takeaim', cooldown: 3,
      run: selfBuff('skill-takeaim', 'Take Aim', { incDamage: 45 }, 1.2),
    }],
  },
  {
    id: 'kiting', name: 'Kiting', req: { reach: 'ranged' },
    desc: 'Being hit grants 30% evasion for 4s — you were not meant to be here.',
    reactions: [{
      trigger: 'takeHit', key: 'skill-kiting',
      run: selfBuff('skill-kiting', 'Kiting', { incEvasion: 30 }, 4),
    }],
  },

  {
    id: 'volley', name: 'Volley', req: { reach: 'ranged', role: 'DPS' },
    desc: 'Hits scatter onto every other enemy for 20% of the damage over 2s.',
    reactions: [{
      trigger: 'hit', key: 'skill-volley', chance: 0.3,
      run: (ctx) => {
        for (const enemy of ctx.run.enemies) {
          if (enemy === ctx.target) continue;
          applyEffect(enemy, {
            id: `skill-volley:${ctx.self.uid}`, name: 'Volley', duration: 2,
            dps: (ctx.amount * 0.2) / 2, source: ctx.self.uid,
            onReapply: 'stack', maxStacks: 3,
          });
        }
      },
    }],
  },
  {
    id: 'steady_hand', name: 'Steady Hand', req: { reach: 'ranged' },
    desc: 'Standing still pays: 30% increased critical strike chance.',
    reactions: [{
      trigger: 'combatStart', key: 'skill-steadyhand',
      run: selfBuff('skill-steadyhand', 'Steady Hand', { incCrit: 30 }, Infinity),
    }],
  },

  // ---- Those who cast -----------------------------------------------------
  {
    id: 'kindling', name: 'Kindling', req: { school: 'spell' },
    desc: 'Hits burn the target for 20% of the damage over 3s.',
    reactions: [{
      trigger: 'hit', key: 'skill-kindling', chance: 0.4,
      run: dotFromHit('skill-kindling', 'Kindling', 0.2, 3),
    }],
  },
  {
    id: 'siphon', name: 'Siphon', req: { school: 'spell' },
    desc: 'Kills restore 20 mana.',
    reactions: [{
      trigger: 'kill', key: 'skill-siphon',
      run: (ctx) => {
        const r = ctx.self.resource;
        if (r) r.cur = Math.min(r.max, r.cur + 20);
      },
    }],
  },
  {
    id: 'overcharge', name: 'Overcharge', req: { school: 'spell', role: 'DPS' },
    desc: 'Every 5s, a hit deals 70% more damage. Costs mana.',
    reactions: [{
      trigger: 'hit', key: 'skill-overcharge', cooldown: 5, costs: 16,
      run: all(
        selfBuff('skill-overcharge', 'Overcharge', { incDamage: 70 }, 1.5),
        announce((ctx) => `${ctx.self.name} overcharges.`, 0.2),
      ),
    }],
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** How many a hero rolls, and may choose between. */
export const SKILL_CHOICES = 3;

/**
 * Skills a class may roll: every stated requirement must match.
 *
 * A class with `school: 'hybrid'` fights both ways and so meets a melee or a
 * spell requirement alike.
 */
export function skillPoolFor(cls) {
  if (!cls) return [];
  return SKILLS.filter((skill) => {
    const req = skill.req ?? {};
    if (req.role && req.role !== cls.role) return false;
    if (req.reach && req.reach !== cls.reach) return false;
    if (req.school && req.school !== cls.school && cls.school !== 'hybrid') return false;
    return true;
  });
}
