// data/specs.js — what a hero decides to become, and cannot undo.
//
// A hero rolls its class, its rarity, its traits and its three skills. None of
// that is a decision — it is a hand you are dealt and then keep. A
// specialisation is the one thing about a hero the player chooses, and it is
// permanent: there is no respec, at any price. If you want a different hero,
// hire one.
//
// Two of them, at level 15 and level 50. Those are Tier 5 and Tier 15 content
// on the level curve, which is deliberate — the whole point is to put decisions
// into the long middle of the game, and two thresholds crowded into the first
// twenty levels would have left the middle exactly as empty as it was.
//
// ---------------------------------------------------------------------------
// Why the pools are shared
// ---------------------------------------------------------------------------
//
// Twelve classes with private trees would be 36 branches and 108 tips: 144
// entries, each needing a name, a description worth reading, a reaction and a
// balance pass. That is more content than the rest of the game put together.
//
// So specialisations are pooled by ROLE and filtered by `req` — exactly the
// trick data/skills.js already uses, for exactly the same reason. A Warrior and
// a Paladin can both become Bulwarks; what makes them different afterwards is
// what was already different about them, which is the block profile, the school
// resistances and the class ability. The specialisation is *how a hero fights*.
// The class is *what it is*.
//
// The second tier is pooled per role rather than per branch, with each branch
// naming the ones it can reach. The overlap is a feature: two branches sharing
// a capstone is the same destination arrived at from different directions, and
// it is what keeps the count at fifty-odd instead of a hundred and forty.
//
// ---------------------------------------------------------------------------
// The shape
// ---------------------------------------------------------------------------
//
//   id/name    what it is called
//   tier       1 (level 15) or 2 (level 50)
//   axis       'edge' | 'anchor' | 'chorus' — see below
//   role       which role's pool this belongs to
//   req        { reach, school } — further filters, same rules as a skill
//   from       tier 2 only: the tier-1 branches that may reach it
//   desc       the effect, in the words a player decides on
//   flavour    one line of who they become
//   stats      folded into the stat bag exactly as a trait's are
//   reactions  the usual { trigger, key, run } shape
//
// Every branch is one of three shapes, and the same three in every role, so a
// player who has specialised once already knows what the other two mean:
//
//   edge     more of what the class already does, harder, at a price
//   anchor   reliability — fewer bad runs rather than better good ones
//   chorus   the hero makes the other four better

import {
  selfBuff, partyBuff, buffTarget, restoreResource, woundScaledBuff,
  dotFromHit, partyHot, all, healWounded,
} from '../expedition/reactions.js';
import { applyEffect } from '../expedition/effects.js';
import { healHero, addWard } from '../expedition/vitals.js';

/** The hero levels at which a choice becomes available. Index 0 is tier 1. */
export const SPEC_LEVELS = [15, 50];

export const SPECS = [
  // =========================================================================
  // TANK — Warrior, Paladin, Guardian
  // =========================================================================
  {
    id: 'bulwark', name: 'Bulwark', tier: 1, axis: 'anchor', role: 'Tank',
    flavour: 'Turns blows aside for a living, and gets paid in rage for it.',
    desc: '+10% Block of both kinds. Every block restores 8 rage.',
    stats: { block: 10 },
    reactions: [{
      trigger: 'block', key: 'spec-bulwark',
      run: restoreResource(8),
    }],
  },
  {
    id: 'berserker', name: 'Berserker', tier: 1, axis: 'edge', role: 'Tank',
    flavour: 'Stops trying to survive the fight and starts trying to end it.',
    // 25% armour for 70% damage measured at twelve points of clear rate for
    // three seconds off the clock, which is not a trade, it is a tax. An Edge
    // branch should cost something; it should not simply be worse.
    desc: '18% less Armour. Damage rises as your life falls, to +85% at the brink.',
    stats: { incArmour: -18 },
    reactions: [{
      trigger: 'takeHit', key: 'spec-berserker',
      run: woundScaledBuff('spec-berserker', 'Berserk', 'incDamage', 85),
    }],
  },
  {
    id: 'warden', name: 'Warden', tier: 1, axis: 'chorus', role: 'Tank',
    flavour: 'Not hard to kill. Hard to get past.',
    // The life comes with the job. Redirect alone measured as a net loss: the
    // Warden soaked more, fell sooner, and the party folded behind it — which
    // is a chorus branch that makes the party worse.
    desc: '15% increased Life. Takes 18% of every blow aimed at a front-line ally, '
      + 'and draws more attention.',
    stats: { incLife: 15 },
    reactions: [{
      trigger: 'combatStart', key: 'spec-warden',
      run: selfBuff('spec-warden', 'Warden', { redirect: 18, threat: 2 }, Infinity),
    }],
  },

  {
    id: 'defender', name: 'Defender', tier: 2, axis: 'anchor', role: 'Tank',
    from: ['bulwark', 'warden'],
    flavour: 'The shield stopped being only theirs some time ago.',
    desc: 'Blocking also shields the party\'s most wounded for 8% of their life, at most every 3s.',
    reactions: [{
      trigger: 'block', key: 'spec-defender', cooldown: 3,
      run: (ctx) => {
        const hurt = ctx.run.combatants
          .filter((x) => !x.down && x !== ctx.self)
          .sort((a, b) => (a.life / a.maxLife) - (b.life / b.maxLife))[0];
        if (hurt) addWard(hurt, hurt.maxLife * 0.08, 0.25, ctx.self);
      },
    }],
  },
  {
    id: 'anvil', name: 'Anvil', tier: 2, axis: 'anchor', role: 'Tank',
    from: ['bulwark'],
    flavour: 'Everything that hits them makes them harder to hit.',
    desc: 'Every block adds 4% Armour for 25s, without limit.',
    reactions: [{
      trigger: 'block', key: 'spec-anvil',
      run: selfBuff('spec-anvil', 'Anvil', { incArmour: 4 }, 25,
        { onReapply: 'stack', maxStacks: 40 }),
    }],
  },
  {
    id: 'bastion', name: 'Bastion', tier: 2, axis: 'anchor', role: 'Tank',
    from: ['bulwark', 'warden'],
    flavour: 'Nothing lands cleanly. Nothing ever lands cleanly.',
    // The only answer in the game to a crushing blow, which is otherwise the
    // one thing nothing mitigates. Halved rather than negated on purpose: a
    // tank who simply ignored the level cliff would undo it.
    desc: 'You cannot be critically struck, and crushing blows land at half force. '
      + 'Your Block can never exceed 60%.',
    stats: { blockCap: 60 },
    reactions: [{
      trigger: 'combatStart', key: 'spec-bastion',
      run: selfBuff('spec-bastion', 'Bastion', { noCrit: 1, crushResist: 50 }, Infinity),
    }],
  },
  {
    id: 'daredevil', name: 'Daredevil', tier: 2, axis: 'edge', role: 'Tank',
    from: ['berserker'],
    flavour: 'Half dead is the best they ever fight.',
    desc: 'Critical strikes heal you for 12% of the damage. Critical chance rises as '
      + 'your life falls, to +100%.',
    reactions: [
      {
        trigger: 'crit', key: 'spec-daredevil-heal',
        run: (ctx) => { healHero(ctx.self, (ctx.amount ?? 0) * 0.12, ctx.self); },
      },
      {
        trigger: 'takeHit', key: 'spec-daredevil-crit',
        run: woundScaledBuff('spec-daredevil', 'Daredevil', 'incCrit', 100),
      },
    ],
  },
  {
    id: 'reaver', name: 'Reaver', tier: 2, axis: 'edge', role: 'Tank',
    from: ['berserker'],
    flavour: 'Killing is the only thing that makes them faster.',
    desc: 'Every kill grants 20% Attack Speed for 6s, stacking three times.',
    reactions: [{
      trigger: 'kill', key: 'spec-reaver',
      run: selfBuff('spec-reaver', 'Reaver', { incAtkSpeed: 20 }, 6,
        { onReapply: 'stack', maxStacks: 3 }),
    }],
  },
  {
    id: 'doomsayer', name: 'Doomsayer', tier: 2, axis: 'edge', role: 'Tank',
    from: ['berserker'],
    flavour: 'They have read the ending. They are not in it.',
    desc: 'Below a quarter life you deal double damage and take 25% more.',
    reactions: [{
      trigger: 'takeHit', key: 'spec-doomsayer',
      run: (ctx) => {
        if (ctx.self.life > ctx.self.maxLife * 0.25) return;
        selfBuff('spec-doomsayer', 'Doomsayer',
          { incDamage: 100, damageTaken: 25 }, 5)(ctx);
      },
    }],
  },
  {
    id: 'vanguard', name: 'Vanguard', tier: 2, axis: 'chorus', role: 'Tank',
    from: ['warden'],
    flavour: 'There is no back line any more. There is only behind them.',
    desc: 'Your guard reaches the back line too, and takes a further 6% of every blow.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-vanguard',
      run: selfBuff('spec-vanguard', 'Vanguard', { redirectAll: 1, redirect: 6 }, Infinity),
    }],
  },
  {
    id: 'aegis', name: 'Aegis', tier: 2, axis: 'chorus', role: 'Tank',
    from: ['warden'],
    flavour: 'What arrives has already been through them once.',
    desc: 'Damage you take on an ally\'s behalf is reduced by 35% on the way across.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-aegis',
      run: selfBuff('spec-aegis', 'Aegis', { redirectShave: 35 }, Infinity),
    }],
  },
  {
    id: 'standard', name: 'Standard-Bearer', tier: 2, axis: 'chorus', role: 'Tank',
    from: ['warden', 'bulwark'],
    flavour: 'Everyone fights better with somebody to stand behind.',
    desc: 'The whole party takes 8% less damage while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-standard',
      run: partyBuff('spec-standard', 'Standard-Bearer', { damageTaken: -8 }),
    }],
  },

  // =========================================================================
  // HEALER — Cleric and Druid heal by casting; the Templar heals by fighting.
  //
  // The split is not decoration. A Templar's healPower is zero: everything it
  // mends comes out of Radiance, which runs on 'hit' and never fires the
  // 'heal' trigger. A branch built on heals would be a dead option on its
  // sheet, so the melee healer gets three of its own rather than three it
  // cannot use.
  // =========================================================================
  {
    id: 'oracle', name: 'Oracle', tier: 1, axis: 'edge', role: 'Healer',
    req: { reach: 'ranged' },
    flavour: 'Sometimes the mending simply arrives, and more of it than was asked for.',
    desc: 'Heals have a 25% chance to surge, restoring a further 80% and mending the '
      + 'rest of the party for 35% of it over 3s.',
    reactions: [{
      trigger: 'heal', key: 'spec-oracle', chance: 0.25,
      run: (ctx) => {
        if (!ctx.target || !ctx.amount) return;
        healHero(ctx.target, ctx.amount * 0.8, ctx.self);
        partyHot('spec-oracle', 'Oracle', ctx.amount * 0.35, 3)(ctx);
      },
    }],
  },
  {
    id: 'preserver', name: 'Preserver', tier: 1, axis: 'anchor', role: 'Healer',
    req: { reach: 'ranged' },
    flavour: 'Heals the wound that has not happened yet.',
    desc: 'Every heal also banks a quarter of its value as a ward, which absorbs the '
      + 'next damage taken and survives between waves.',
    reactions: [{
      trigger: 'heal', key: 'spec-preserver',
      run: (ctx) => {
        if (!ctx.target || !ctx.amount) return;
        addWard(ctx.target, ctx.amount * 0.25, 0.25, ctx.self);
      },
    }],
  },
  {
    id: 'chaplain', name: 'Chaplain', tier: 1, axis: 'chorus', role: 'Healer',
    req: { reach: 'ranged' },
    flavour: 'Mending as encouragement.',
    desc: 'Anyone you heal deals 12% more damage for 5s.',
    reactions: [{
      trigger: 'heal', key: 'spec-chaplain',
      run: buffTarget('spec-chaplain', 'Chaplain', { incDamage: 12 }, 5),
    }],
  },
  {
    id: 'zealot', name: 'Zealot', tier: 1, axis: 'edge', role: 'Healer',
    req: { reach: 'melee' },
    flavour: 'Heals harder by hitting harder. There is no other lever.',
    desc: '20% increased Damage — which is where your healing comes from. Every kill '
      + 'mends the whole party for 4% of their life over 3s.',
    stats: { incDamage: 20 },
    reactions: [{
      trigger: 'kill', key: 'spec-zealot',
      run: (ctx) => {
        for (const ally of ctx.run.combatants) {
          if (ally.down) continue;
          applyEffect(ally, {
            id: `spec-zealot:${ctx.self.uid}`, name: 'Zealot', duration: 3,
            hps: (ally.maxLife * 0.04) / 3, source: ctx.self.uid,
          });
        }
      },
    }],
  },
  {
    id: 'crusader', name: 'Crusader', tier: 1, axis: 'anchor', role: 'Healer',
    req: { reach: 'melee' },
    flavour: 'A healer who has to stand where it hurts had better be able to.',
    desc: '20% increased Life and 30% increased Armour. Being hit mends you for 4% of '
      + 'your life over 4s, at most every 6s.',
    stats: { incLife: 20, incArmour: 30 },
    reactions: [{
      trigger: 'takeHit', key: 'spec-crusader', cooldown: 6,
      run: (ctx) => {
        applyEffect(ctx.self, {
          id: 'spec-crusader', name: 'Crusader', duration: 4,
          hps: (ctx.self.maxLife * 0.04) / 4,
        });
      },
    }],
  },
  {
    id: 'almoner', name: 'Almoner', tier: 1, axis: 'chorus', role: 'Healer',
    req: { reach: 'melee' },
    flavour: 'Gives away everything, including the swing.',
    desc: 'The whole party regenerates 0.8% of their life per second and recovers '
      + '35% more of their resource while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-almoner',
      run: partyBuff('spec-almoner', 'Almoner', { lifeRegenPct: 0.8, resourceRegen: 35 }),
    }],
  },

  {
    id: 'prophet', name: 'Prophet', tier: 2, axis: 'edge', role: 'Healer',
    from: ['oracle', 'chaplain'],
    flavour: 'Knows which blow is coming, and mends for it first.',
    desc: 'Anyone you heal takes 15% less damage for 4s.',
    reactions: [{
      trigger: 'heal', key: 'spec-prophet',
      run: buffTarget('spec-prophet', 'Prophet', { damageTaken: -15 }, 4),
    }],
  },
  {
    id: 'revelator', name: 'Revelator', tier: 2, axis: 'edge', role: 'Healer',
    from: ['oracle'],
    flavour: 'The surge is no longer a matter of luck.',
    desc: 'Every fourth heal surges without needing to roll for it.',
    reactions: [{
      trigger: 'heal', key: 'spec-revelator',
      run: (ctx) => {
        if (!ctx.target || !ctx.amount) return;
        ctx.self.revelator = (ctx.self.revelator ?? 0) + 1;
        if (ctx.self.revelator % 4) return;
        healHero(ctx.target, ctx.amount * 0.8, ctx.self);
        partyHot('spec-revelator', 'Revelator', ctx.amount * 0.35, 3)(ctx);
      },
    }],
  },
  {
    id: 'seer', name: 'Seer', tier: 2, axis: 'anchor', role: 'Healer',
    from: ['oracle', 'preserver'],
    flavour: 'Never runs dry, which is most of what a healer is asked for.',
    desc: '50% increased resource regeneration, and every kill in the party restores '
      + '12 of your mana.',
    reactions: [
      {
        trigger: 'combatStart', key: 'spec-seer',
        run: selfBuff('spec-seer', 'Seer', { resourceRegen: 50 }, Infinity),
      },
      { trigger: 'kill', key: 'spec-seer-kill', run: restoreResource(12) },
    ],
  },
  {
    id: 'grovekeeper', name: 'Grovekeeper', tier: 2, axis: 'anchor', role: 'Healer',
    from: ['preserver', 'chaplain'],
    flavour: 'The ward is not only a wall. It is also a slow mending.',
    desc: 'Anyone you heal regenerates 1.2% of their life per second for 6s.',
    reactions: [{
      trigger: 'heal', key: 'spec-grovekeeper',
      run: buffTarget('spec-grovekeeper', 'Grovekeeper', { lifeRegenPct: 1.2 }, 6),
    }],
  },
  {
    id: 'sealbearer', name: 'Sealbearer', tier: 2, axis: 'anchor', role: 'Healer',
    from: ['preserver'],
    flavour: 'What is turned aside has to go somewhere.',
    desc: 'Wards you place absorb 45% more.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-sealbearer',
      run: selfBuff('spec-sealbearer', 'Sealbearer', { wardPower: 45 }, Infinity),
    }],
  },
  {
    id: 'martyr', name: 'Martyr', tier: 2, axis: 'chorus', role: 'Healer',
    from: ['chaplain', 'oracle'],
    flavour: 'Spends themselves. There was never any other plan.',
    desc: '40% increased Healing. You take 20% more damage.',
    stats: { incHeal: 40, damageTaken: 20 },
  },
  {
    id: 'exemplar', name: 'Exemplar', tier: 2, axis: 'edge', role: 'Healer',
    from: ['zealot', 'almoner'],
    flavour: 'Fights at the front and is somehow the reason the back row is alive.',
    desc: 'Your hits mend the most wounded ally for a further 20% of the damage.',
    reactions: [{
      trigger: 'hit', key: 'spec-exemplar',
      run: healWounded(0.20),
    }],
  },
  {
    id: 'warpriest', name: 'War-Priest', tier: 2, axis: 'edge', role: 'Healer',
    from: ['zealot', 'crusader'],
    flavour: 'The mace is the sermon.',
    desc: 'Each hit builds 5% damage for 4s, stacking six times.',
    reactions: [{
      trigger: 'hit', key: 'spec-warpriest',
      run: selfBuff('spec-warpriest', 'War-Priest', { incDamage: 5 }, 4,
        { onReapply: 'stack', maxStacks: 6 }),
    }],
  },
  {
    id: 'hospitaller', name: 'Hospitaller', tier: 2, axis: 'anchor', role: 'Healer',
    from: ['crusader', 'almoner'],
    flavour: 'Holds the line and the ward at once.',
    desc: 'The party gains a ward worth 8% of their life at the start of every wave.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-hospitaller',
      run: (ctx) => {
        for (const ally of ctx.run.combatants) {
          if (ally.down) continue;
          addWard(ally, ally.maxLife * 0.08, 0.25, ctx.self);
        }
      },
    }],
  },
  {
    id: 'redeemer', name: 'Redeemer', tier: 2, axis: 'chorus', role: 'Healer',
    from: ['zealot', 'crusader', 'almoner'],
    flavour: 'Somebody has to pick people up.',
    desc: 'When an ally falls, the rest of the party is mended for 15% of their life '
      + 'over 4s and takes 12% less damage for 8s.',
    reactions: [{
      trigger: 'allyDown', key: 'spec-redeemer',
      run: (ctx) => {
        for (const ally of ctx.run.combatants) {
          if (ally.down) continue;
          applyEffect(ally, {
            id: `spec-redeemer:${ctx.self.uid}`, name: 'Redeemer', duration: 8,
            mods: { damageTaken: -12 }, hps: (ally.maxLife * 0.15) / 4,
            source: ctx.self.uid,
          });
        }
      },
    }],
  },

  // =========================================================================
  // SUPPORT — Bard
  // =========================================================================
  {
    id: 'skald', name: 'Skald', tier: 1, axis: 'edge', role: 'Support',
    flavour: 'A marching song played at a running pace.',
    desc: 'The party gains 12% Attack Speed while you stand. You lose your own '
      + 'life regeneration entirely.',
    stats: { lifeRegenPct: -1.0 },
    reactions: [{
      trigger: 'combatStart', key: 'spec-skald',
      run: partyBuff('spec-skald', 'Skald', { incAtkSpeed: 12 }),
    }],
  },
  {
    id: 'lorekeeper', name: 'Lorekeeper', tier: 1, axis: 'anchor', role: 'Support',
    flavour: 'Knows what is coming because it has all happened before.',
    // resAll raises resistances the party already has rather than granting
    // them, which is what the combat tick does with the key. The two school
    // resistances are the flat part, and the part that always does something.
    // Settled at 7 after landing either side of it. School resistance is
    // applied to the finished figure at the end of the damage calculation, so
    // a few points of it across five heroes is worth far more than it reads:
    // at 10 this was +28 points of clear rate against +8 for Skald, which is
    // one option and two decorations rather than a choice; at 5 it was worth
    // nothing at all.
    desc: 'The party takes 7% less from both melee and spells, and its elemental '
      + 'resistances are 15% higher, while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-lorekeeper',
      run: partyBuff('spec-lorekeeper', 'Lorekeeper',
        { resAll: 15, meleeResist: 7, spellResist: 7 }),
    }],
  },
  {
    id: 'conductor', name: 'Conductor', tier: 1, axis: 'chorus', role: 'Support',
    flavour: 'Does nothing at all, and everyone else does it twice as often.',
    // Cooldowns alone were measurably nothing: a party of five holds about one
    // cooldown between them, and twenty simulated runs came back identical to
    // the decimal. What actually stops a class ability from firing is the
    // price of it — the Templar runs dry, the Cleric cannot afford to cast —
    // so that is where a support belongs.
    desc: 'While you stand, every ally\'s cooldowns run 30% shorter and their abilities, '
      + 'including healing, cost 35% less.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-conductor',
      run: partyBuff('spec-conductor', 'Conductor', { cooldownMult: -30, costMult: -35 }),
    }],
  },

  {
    id: 'warchanter', name: 'Warchanter', tier: 2, axis: 'edge', role: 'Support',
    from: ['skald', 'conductor'],
    flavour: 'The song has a beat now, and things die on it.',
    desc: 'The party deals 14% more damage and crits 20% more often while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-warchanter',
      run: partyBuff('spec-warchanter', 'Warchanter', { incDamage: 14, incCrit: 20 }),
    }],
  },
  {
    id: 'drummer', name: 'Drummer', tier: 2, axis: 'edge', role: 'Support',
    from: ['skald', 'lorekeeper'],
    flavour: 'Nobody in earshot has ever run out of anything.',
    desc: 'The party recovers 90% more of its resource while you stand, and every kill '
      + 'restores 8 to whoever made it.',
    reactions: [
      {
        trigger: 'combatStart', key: 'spec-drummer',
        run: partyBuff('spec-drummer', 'Drummer', { resourceRegen: 90 }),
      },
      { trigger: 'kill', key: 'spec-drummer-kill', run: restoreResource(8) },
    ],
  },
  {
    id: 'wardsinger', name: 'Wardsinger', tier: 2, axis: 'anchor', role: 'Support',
    from: ['lorekeeper', 'conductor'],
    flavour: 'Sings a wall up before the first blow reaches it.',
    desc: 'The party gains a ward worth 10% of their life at the start of every wave.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-wardsinger',
      run: (ctx) => {
        for (const ally of ctx.run.combatants) {
          if (ally.down) continue;
          addWard(ally, ally.maxLife * 0.10, 0.25, ctx.self);
        }
      },
    }],
  },
  {
    id: 'keeper', name: 'Keeper of Names', tier: 2, axis: 'anchor', role: 'Support',
    from: ['lorekeeper', 'conductor'],
    flavour: 'Says the name of everyone who falls, and the party fights on it.',
    desc: 'When an ally falls, the rest take 15% less damage and deal 15% more for the '
      + 'rest of the run.',
    reactions: [{
      trigger: 'allyDown', key: 'spec-keeper',
      run: partyBuff('spec-keeper', 'Keeper of Names',
        { damageTaken: -15, incDamage: 15 }),
    }],
  },
  {
    id: 'maestro', name: 'Maestro', tier: 2, axis: 'chorus', role: 'Support',
    from: ['skald', 'conductor'],
    flavour: 'Everything the party can do, it can do sooner.',
    desc: 'Abilities cost a further 25% less, and the party gains 10% Attack Speed '
      + 'and 15% increased Healing while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-maestro',
      run: partyBuff('spec-maestro', 'Maestro',
        { costMult: -25, incAtkSpeed: 10, incHeal: 15 }),
    }],
  },

  // =========================================================================
  // DAMAGE — Rogue, Archer, Wizard, Warlock, Inquisitor
  //
  // Eight branches; each class meets at least three. The Inquisitor, being
  // 'hybrid', meets both the melee and the spell requirements and so sees the
  // most — which is what a class that fights both ways ought to get.
  // =========================================================================
  {
    id: 'assassin', name: 'Assassin', tier: 1, axis: 'edge', role: 'DPS',
    req: { reach: 'melee' },
    flavour: 'The first blow is the one that was planned.',
    // "At full life" was measured at almost nothing: five heroes focus the
    // same enemy, so the hero who actually lands the opener is whichever
    // happened to swing first, about one time in five. Above 80% is the same
    // idea — the start of the fight — and is a window a Rogue can reach.
    desc: 'Hits against an enemy above 80% of its life deal 80% more.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-assassin',
      run: selfBuff('spec-assassin', 'Assassin', { openerDamage: 80 }, Infinity),
    }],
  },
  {
    id: 'duelist', name: 'Duelist', tier: 1, axis: 'anchor', role: 'DPS',
    req: { reach: 'melee' },
    flavour: 'Fights better the longer it goes on, which is the opposite of a Rogue.',
    desc: '20% increased Evasion. Being hit grants 10% damage for 5s, stacking five times.',
    stats: { incEvasion: 20 },
    reactions: [{
      trigger: 'takeHit', key: 'spec-duelist',
      run: selfBuff('spec-duelist', 'Duelist', { incDamage: 10 }, 5,
        { onReapply: 'stack', maxStacks: 5 }),
    }],
  },
  {
    id: 'ravager', name: 'Ravager', tier: 1, axis: 'chorus', role: 'DPS',
    req: { reach: 'melee' },
    flavour: 'Opens the wounds everyone else finishes.',
    desc: 'Hits leave the target taking 10% more damage from everyone for 4s.',
    reactions: [{
      trigger: 'hit', key: 'spec-ravager',
      run: buffTarget('spec-ravager', 'Ravaged', { damageTaken: 10 }, 4),
    }],
  },
  {
    id: 'marksman', name: 'Marksman', tier: 1, axis: 'edge', role: 'DPS',
    req: { reach: 'ranged', school: 'melee' },
    flavour: 'One shot at a time, and each one counts for more.',
    desc: '30% increased Critical Chance and +45% Critical Multiplier.',
    stats: { incCrit: 30, critMulti: 45 },
  },
  {
    id: 'skirmisher', name: 'Skirmisher', tier: 1, axis: 'anchor', role: 'DPS',
    req: { reach: 'ranged' },
    flavour: 'Was never supposed to be within reach in the first place.',
    desc: '25% increased Evasion. Being hit grants 30% Evasion for 5s and 10% reduced '
      + 'damage taken.',
    stats: { incEvasion: 25 },
    reactions: [{
      trigger: 'takeHit', key: 'spec-skirmisher',
      run: selfBuff('spec-skirmisher', 'Skirmisher',
        { incEvasion: 30, damageTaken: -10 }, 5),
    }],
  },
  {
    id: 'hunter', name: 'Hunter', tier: 1, axis: 'chorus', role: 'DPS',
    req: { reach: 'ranged' },
    flavour: 'Picks the target. Everyone else agrees.',
    desc: 'Your kills grant the whole party 10% damage for 6s, stacking three times.',
    reactions: [{
      trigger: 'kill', key: 'spec-hunter',
      run: (ctx) => {
        for (const ally of ctx.run.combatants) {
          if (ally.down) continue;
          applyEffect(ally, {
            id: `spec-hunter:${ctx.self.uid}`, name: 'Hunter', duration: 6,
            mods: { incDamage: 10 }, source: ctx.self.uid,
            onReapply: 'stack', maxStacks: 3,
          });
        }
      },
    }],
  },
  {
    id: 'elementalist', name: 'Elementalist', tier: 1, axis: 'edge', role: 'DPS',
    req: { school: 'spell' },
    flavour: 'Sets things alight and lets the fire do the arithmetic.',
    desc: 'Hits burn the target for 30% of the damage over 3s.',
    reactions: [{
      trigger: 'hit', key: 'spec-elementalist',
      run: dotFromHit('spec-elementalist', 'Kindled', 0.30, 3),
    }],
  },
  {
    id: 'hexer', name: 'Hexer', tier: 1, axis: 'chorus', role: 'DPS',
    req: { school: 'spell' },
    flavour: 'Does very little damage and makes everyone else\'s worse.',
    desc: 'Enemies you hit take 14% more damage from everyone for 4s.',
    reactions: [{
      trigger: 'hit', key: 'spec-hexer',
      run: buffTarget('spec-hexer', 'Hexed', { damageTaken: 14 }, 4),
    }],
  },

  {
    id: 'executioner', name: 'Executioner', tier: 2, axis: 'edge', role: 'DPS',
    from: ['assassin', 'marksman', 'duelist'],
    flavour: 'Finishing is a separate skill from starting.',
    desc: 'Hits against an enemy below a third of its life deal 60% more.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-executioner',
      run: selfBuff('spec-executioner', 'Executioner', { finisherDamage: 60 }, Infinity),
    }],
  },
  {
    id: 'shadowblade', name: 'Shadowblade', tier: 2, axis: 'edge', role: 'DPS',
    from: ['assassin', 'duelist'],
    flavour: 'Every kill is the start of the next fight.',
    desc: 'Every kill grants 45% damage for 5s and refunds 20 energy.',
    reactions: [{
      trigger: 'kill', key: 'spec-shadowblade',
      run: all(
        selfBuff('spec-shadowblade', 'Shadowblade', { incDamage: 45 }, 5),
        restoreResource(20),
      ),
    }],
  },
  {
    id: 'cutthroat', name: 'Cutthroat', tier: 2, axis: 'edge', role: 'DPS',
    from: ['assassin', 'ravager', 'marksman'],
    flavour: 'The wound does more work than the blow did.',
    desc: 'Critical strikes bleed the target for 55% of the damage over 4s.',
    reactions: [{
      trigger: 'crit', key: 'spec-cutthroat',
      run: dotFromHit('spec-cutthroat', 'Cutthroat', 0.55, 4),
    }],
  },
  {
    id: 'bladedancer', name: 'Bladedancer', tier: 2, axis: 'anchor', role: 'DPS',
    from: ['duelist', 'skirmisher'],
    flavour: 'Hard to hit, and faster every time somebody fails.',
    desc: 'Being hit grants 12% Attack Speed for 4s, stacking four times.',
    reactions: [{
      trigger: 'takeHit', key: 'spec-bladedancer',
      run: selfBuff('spec-bladedancer', 'Bladedancer', { incAtkSpeed: 12 }, 4,
        { onReapply: 'stack', maxStacks: 4 }),
    }],
  },
  {
    id: 'blademaster', name: 'Blademaster', tier: 2, axis: 'anchor', role: 'DPS',
    from: ['duelist', 'skirmisher', 'ravager'],
    flavour: 'Not durable. Simply very hard to land a clean blow on.',
    desc: 'You cannot be critically struck, and crushing blows land at 30% less force.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-blademaster',
      run: selfBuff('spec-blademaster', 'Blademaster',
        { noCrit: 1, crushResist: 30 }, Infinity),
    }],
  },
  {
    id: 'sharpshooter', name: 'Sharpshooter', tier: 2, axis: 'edge', role: 'DPS',
    from: ['marksman', 'hunter'],
    flavour: 'Aims for a moment and then does not miss.',
    desc: 'Every 3s, the next hit deals 70% more damage and cannot be evaded.',
    reactions: [{
      trigger: 'hit', key: 'spec-sharpshooter', cooldown: 3,
      run: selfBuff('spec-sharpshooter', 'Sharpshooter',
        { incDamage: 70, incAccuracy: 200 }, 1.5),
    }],
  },
  {
    id: 'ghost', name: 'Ghost', tier: 2, axis: 'anchor', role: 'DPS',
    // Marksman reaches this one so the Archer's most committed branch still
    // has somewhere defensive to go. Without it the class with the fewest
    // branches also had the fewest tips, which is the wrong way round.
    from: ['skirmisher', 'hunter', 'marksman'],
    flavour: 'Nothing has ever quite worked out where they are.',
    desc: '35% increased Evasion, and enemies have a 12% chance to miss you outright.',
    stats: { incEvasion: 35 },
    reactions: [{
      trigger: 'combatStart', key: 'spec-ghost',
      run: selfBuff('spec-ghost', 'Ghost', { dodgeChance: 12 }, Infinity),
    }],
  },
  {
    id: 'pyromancer', name: 'Pyromancer', tier: 2, axis: 'edge', role: 'DPS',
    from: ['elementalist'],
    flavour: 'The burn is the spell. The spell is just how it starts.',
    desc: 'Critical strikes burn for a further 90% of the damage over 3s.',
    reactions: [{
      trigger: 'crit', key: 'spec-pyromancer',
      run: dotFromHit('spec-pyromancer', 'Pyre', 0.90, 3),
    }],
  },
  {
    id: 'stormcaller', name: 'Stormcaller', tier: 2, axis: 'edge', role: 'DPS',
    from: ['elementalist', 'hexer'],
    flavour: 'It does not stop at the one you were aiming at.',
    desc: 'Every hit scatters onto every other enemy for 25% of the damage over 2s, '
      + 'stacking three times.',
    reactions: [{
      trigger: 'hit', key: 'spec-stormcaller',
      run: (ctx) => {
        for (const enemy of ctx.run.enemies) {
          if (enemy === ctx.target) continue;
          applyEffect(enemy, {
            id: `spec-stormcaller:${ctx.self.uid}`, name: 'Storm', duration: 2,
            dps: ((ctx.amount ?? 0) * 0.25) / 2, source: ctx.self.uid,
            onReapply: 'stack', maxStacks: 3,
          });
        }
      },
    }],
  },
  {
    id: 'plaguebearer', name: 'Plaguebearer', tier: 2, axis: 'chorus', role: 'DPS',
    from: ['hexer', 'elementalist'],
    flavour: 'Everything in the room is already dying. Some of it faster.',
    desc: 'Your curse deepens to 22% and lasts 8s, and it lands on every enemy at once.',
    reactions: [{
      trigger: 'hit', key: 'spec-plaguebearer',
      run: (ctx) => {
        for (const enemy of ctx.run.enemies) {
          applyEffect(enemy, {
            id: `spec-plague:${ctx.self.uid}`, name: 'Plague', duration: 8,
            mods: { damageTaken: 22 }, source: ctx.self.uid,
          });
        }
      },
    }],
  },
  {
    id: 'bloodmagus', name: 'Blood Magus', tier: 2, axis: 'edge', role: 'DPS',
    from: ['hexer', 'elementalist'],
    flavour: 'Pays in the only currency that never runs out until it does.',
    desc: '30% increased Damage. You take 20% more damage, and regenerate 1% of your '
      + 'life per second.',
    stats: { incDamage: 30, damageTaken: 20, lifeRegenPct: 1.0 },
  },
  {
    id: 'warcaller', name: 'Warcaller', tier: 2, axis: 'chorus', role: 'DPS',
    from: ['ravager', 'hunter', 'hexer'],
    flavour: 'Damage is not the contribution. The contribution is everyone else\'s.',
    desc: 'The whole party deals 12% more damage and crits 15% more often while you stand.',
    reactions: [{
      trigger: 'combatStart', key: 'spec-warcaller',
      run: partyBuff('spec-warcaller', 'Warcaller', { incDamage: 12, incCrit: 15 }),
    }],
  },
];

export const SPEC_BY_ID = Object.fromEntries(SPECS.map((s) => [s.id, s]));

/** The three axes, in the order they are offered, for the choice screen. */
export const AXES = [
  { id: 'edge', name: 'Edge', hint: 'More of what this class already does, at a price.' },
  { id: 'anchor', name: 'Anchor', hint: 'Reliability — fewer bad runs rather than better good ones.' },
  { id: 'chorus', name: 'Chorus', hint: 'Makes the rest of the party better.' },
];

/**
 * Every specialisation of `tier` this class could ever be offered.
 *
 * Requirements work exactly as a skill's do, including the rule that a hybrid
 * school meets a melee or a spell requirement alike — which is why the
 * Inquisitor sees more options than anyone.
 */
export function specPoolFor(cls, tier, from = null) {
  if (!cls) return [];
  return SPECS.filter((spec) => {
    if (spec.tier !== tier) return false;
    if (spec.role !== cls.role) return false;
    if (tier === 2 && (!from || !spec.from?.includes(from))) return false;
    const req = spec.req ?? {};
    if (req.reach && req.reach !== cls.reach) return false;
    if (req.school && req.school !== cls.school && cls.school !== 'hybrid') return false;
    return true;
  });
}
