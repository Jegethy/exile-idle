// data/uniques.js — hand-crafted unique items.
//
// Uniques keep a fixed mod list with rolled ranges, so two copies of the same
// unique still differ. `lvl` gates them out of low-tier drop pools, and every
// number scales with the level the item drops at — one Rusted Oath covers tier
// one and tier sixteen rather than needing a version for each.
//
// Three things separate a unique from a rare:
//   power       a multiplier on the base's own numbers, so a unique sword is a
//               better sword before its modifiers are counted at all.
//   mods        the fixed modifier list, rolled within hand-authored ranges.
//   reactions   what it *does* — hooks into the combat effects layer, which is
//               the difference between a unique and a differently coloured
//               stat stick.
//
// Effects are written as percentages wherever possible so they stay relevant
// at every item level without needing per-tier versions.

import {
  selfBuff, dotFromHit, announce, all, repeatAttack, cleave, dealDamage,
} from '../expedition/reactions.js';
import { applyEffect } from '../expedition/effects.js';
import { log } from '../state.js';

const m = (r, text, apply, dec = 0) => ({ r, text, apply, dec });

/** A modifier line that exists to describe a reaction rather than grant a stat. */
const says = (text) => m([0, 0], () => text, () => {});

/**
 * Death's Fury's bleed, applied in two places — by the critical strike that
 * starts it and by the death that spreads it — so it lives here rather than
 * twice inside the item.
 *
 * Read off the *new* host's maximum life rather than carried over from the one
 * that died, which is the only reading that survives a wave of mixed enemies:
 * a guardian inheriting a trash mob's number would be an insult, and the
 * reverse would delete the wave.
 *
 * The engine models damage over time as a rate, so "4% every 3 seconds" is
 * delivered continuously at the same average. Over fifteen seconds the total is
 * identical and nothing in the game can observe the difference.
 */
const FURY = { share: 0.04, period: 3, duration: 15 };

function furyBleed(ctx, enemy) {
  if (!enemy || enemy.life <= 0) return;
  applyEffect(enemy, {
    id: `deathsfury:${ctx.self.uid}`, name: "Death's Fury",
    duration: FURY.duration,
    // Held to the level gap like any other damage. A share of maximum life is
    // otherwise the one number in the game that does not care how far above
    // its level a party has pushed.
    dps: enemy.maxLife * (FURY.share / FURY.period) * (ctx.gap ?? 1),
    source: ctx.self.uid,
    onHostDeath: furySpread,
  });
}

/**
 * The half that makes the bow what it is: the bleed outlives its host.
 *
 * Carried on the effect rather than on the wielder's `kill` trigger, because
 * the promise is "if the enemy dies", not "if you kill it". Hung on the trigger
 * it fired only when the archer who applied the bleed also landed the last hit,
 * which in a party of five is the minority of deaths — measured at five spreads
 * across twelve runs against roughly sixty applications.
 */
function furySpread(ctx) {
  let spread = 0;
  for (const enemy of ctx.run.enemies) {
    if (enemy === ctx.target) continue;
    furyBleed(ctx, enemy);
    spread++;
  }
  if (spread) {
    log(`${ctx.target.name} falls, and the bleeding takes hold of ${spread} more.`, 'crit');
  }
}

export const UNIQUES = [
  // --- Low-level uniques, so Tier 1-3 maps can still drop one -------------
  {
    id: 'rustblade', name: 'The Rusted Oath', base: 'sword1h', lvl: 1, weight: 110,
    flavour: 'It was sworn on a better blade than this.',
    mods: [
      m([30, 50], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([15, 30], (v) => `+${v} to Armour`, (b, v) => { b.flatArmour += v; }),
      m([10, 18], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
    ],
  },
  {
    id: 'driftwoodcharm', name: 'Castaway\'s Charm', base: 'amulet', lvl: 1, weight: 105,
    flavour: 'Carved on the voyage over. It is all he kept.',
    mods: [
      m([8, 14], (v) => `+${v}% to all Elemental Resistances`, (b, v) => { b.resFire += v; b.resCold += v; b.resLight += v; }),
      m([12, 22], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([10, 18], (v) => `${v}% increased Rarity of Items found`, (b, v) => { b.incRarity += v; }),
    ],
  },
  {
    id: 'shorewalkers', name: 'Shorewalkers', base: 'boot_ev', lvl: 3, weight: 100,
    flavour: 'The sand remembers every exile who made it inland.',
    mods: [
      m([15, 25], (v) => `${v}% increased Evasion Rating`, (b, v) => { b.incEvasion += v; }),
      m([20, 40], (v) => `+${v} to Evasion Rating`, (b, v) => { b.flatEvasion += v; }),
      m([1, 3], (v) => `Regenerate ${v} Life per second`, (b, v) => { b.lifeRegenFlat += v; }, 1),
    ],
  },
  {
    id: 'bramblejack', name: 'Bramblejack', base: 'body_ar', lvl: 8, weight: 100,
    flavour: 'The pain of the thorn is the price of the rose.',
    mods: [
      m([80, 120], (v) => `${v}% increased Armour`, (b, v) => { b.localIncArmour += v; }),
      m([20, 30], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([8, 14], (v) => `Reflects ${v}% of Damage taken to Attacker`, (b, v) => { b.reflect += v; }),
    ],
  },
  {
    id: 'goldrim', name: 'Goldrim', base: 'helm_ev', lvl: 10, weight: 90,
    flavour: 'The dying light reflects in the gold of a fallen king.',
    mods: [
      m([30, 40], (v) => `+${v}% to all Elemental Resistances`, (b, v) => { b.resFire += v; b.resCold += v; b.resLight += v; }),
      m([60, 80], (v) => `+${v} to Evasion Rating`, (b, v) => { b.flatEvasion += v; }),
      m([20, 30], (v) => `${v}% increased Rarity of Items found`, (b, v) => { b.incRarity += v; }),
    ],
  },
  {
    id: 'wanderlust', name: 'Wanderlust', base: 'boot_es', lvl: 12, weight: 90,
    flavour: 'Wander far enough and you will find yourself.',
    mods: [
      m([20, 30], (v) => `${v}% increased Energy Shield`, (b, v) => { b.incES += v; }),
      m([20, 40], (v) => `+${v} to Evasion Rating`, (b, v) => { b.flatEvasion += v; }),
      m([2, 4], (v) => `Regenerate ${v} Life per second`, (b, v) => { b.lifeRegenFlat += v; }, 1),
    ],
  },
  {
    id: 'tabula', name: 'Tabula Rasa', base: 'body_es', lvl: 15, weight: 40,
    flavour: 'An unwritten page holds the most potential.',
    mods: [
      m([25, 40], (v) => `${v}% increased Damage`, (b, v) => { b.incDamage += v; }),
      m([15, 25], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
      m([0, 0], () => 'You take 20% increased Damage', (b) => { b.damageTaken += 20; }),
    ],
  },
  {
    id: 'lifesprig', name: 'Lifesprig', base: 'wand', lvl: 18, weight: 85,
    flavour: 'A twig of the world tree, still green.',
    mods: [
      // Named for the weapon it is on. A wand's damage line is Spell Damage;
      // localIncPhys is the engine's name for "scales this weapon", not a claim
      // about what kind of damage comes out of it.
      m([20, 30], (v) => `${v}% increased Spell Damage`, (b, v) => { b.localIncPhys += v; }),
      m([25, 40], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([3, 6], (v) => `Regenerate ${v} Life per second`, (b, v) => { b.lifeRegenFlat += v; }, 1),
    ],
  },
  {
    id: 'karui_ward', name: 'Karui Ward', base: 'amulet', lvl: 22, weight: 80,
    flavour: 'The Karui do not fear death. They outrun it.',
    mods: [
      m([8, 12], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
      m([25, 40], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([80, 140], (v) => `+${v} to Accuracy Rating`, (b, v) => { b.accuracy += v; }),
    ],
  },
  {
    id: 'bloodseeker', name: 'Bloodseeker', base: 'dagger', lvl: 30, weight: 70,
    flavour: 'Every wound it opens, it drinks from.',
    mods: [
      m([60, 90], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([1.5, 2.5], (v) => `${v}% of Physical Attack Damage Leeched as Life`, (b, v) => { b.lifeLeech += v; }, 2),
      m([10, 18], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
    ],
  },
  {
    id: 'kaoms_heart', name: "Kaom's Heart", base: 'body_ar', lvl: 45, weight: 45,
    flavour: 'Kaom fed his rage until nothing else remained.',
    mods: [
      m([450, 650], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      m([25, 40], (v) => `${v}% increased Fire Damage`, (b, v) => { b.incFire += v; }),
      m([0, 0], () => 'Your Energy Shield is set to 0', (b) => { b.noES = 1; }),
    ],
  },
  {
    id: 'shavronnes', name: "Shavronne's Wrappings", base: 'body_es', lvl: 50, weight: 40,
    flavour: 'Handle with the care you would give a viper.',
    mods: [
      m([120, 180], (v) => `${v}% increased Energy Shield`, (b, v) => { b.localIncES += v; }),
      m([25, 35], (v) => `+${v}% to Lightning Resistance`, (b, v) => { b.resLight += v; }),
      m([20, 30], (v) => `+${v}% to Chaos Resistance`, (b, v) => { b.resChaos += v; }),
    ],
  },
  {
    id: 'facebreaker', name: 'Facebreaker', base: 'glove_ar', lvl: 52, weight: 55,
    flavour: 'Bare knuckles, bared teeth.',
    mods: [
      m([600, 900], (v) => `${v}% increased Physical Damage`, (b, v) => { b.incPhys += v; }),
      m([0, 0], () => 'Deal no Elemental Damage', (b) => { b.noEle = 1; }),
      m([10, 20], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
    ],
  },
  {
    id: 'atziris', name: "Atziri's Disfavour", base: 'axe2h', lvl: 60, weight: 35,
    flavour: 'Her favour was fleeting. Her disfavour, eternal.',
    mods: [
      m([130, 180], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([20, 30], (v) => `+${v}% to Critical Strike Multiplier`, (b, v) => { b.critMulti += v; }),
      m([30, 50], (v) => `Adds ${Math.round(v * 0.6)} to ${v} Physical Damage`, (b, v) => { b.addPhysMin += Math.round(v * 0.6); b.addPhysMax += v; }),
    ],
  },
  {
    id: 'headhunter', name: 'Headhunter', base: 'amulet', lvl: 68, weight: 12,
    flavour: 'The trophies of a hundred hunts, worn as one.',
    mods: [
      m([25, 40], (v) => `${v}% increased Damage`, (b, v) => { b.incDamage += v; }),
      m([20, 35], (v) => `${v}% increased Quantity of Items found`, (b, v) => { b.incQuant += v; }),
      m([25, 40], (v) => `${v}% increased Rarity of Items found`, (b, v) => { b.incRarity += v; }),
    ],
  },
  {
    id: 'voidheart', name: 'Voidheart', base: 'ring', lvl: 64, weight: 45,
    flavour: 'A hollow where a heart should be.',
    mods: [
      m([25, 40], (v) => `Adds ${Math.round(v * 0.5)} to ${v} Chaos Damage`, (b, v) => { b.addChaosMin += Math.round(v * 0.5); b.addChaosMax += v; }),
      m([15, 25], (v) => `+${v}% to Chaos Resistance`, (b, v) => { b.resChaos += v; }),
      m([8, 12], (v) => `Damage Penetrates ${v}% Fire Resistance`, (b, v) => { b.penFire += v; }),
    ],
  },
  {
    id: 'mageblood', name: 'Mageblood', base: 'ring', lvl: 78, weight: 8,
    flavour: 'The blood of an archmage runs thicker than gold.',
    mods: [
      m([12, 18], (v) => `+${v}% to all Elemental Resistances`, (b, v) => { b.resFire += v; b.resCold += v; b.resLight += v; }),
      m([30, 45], (v) => `${v}% increased Elemental Damage`, (b, v) => { b.incEle += v; }),
      m([5, 8], (v) => `Damage Penetrates ${v}% of all Elemental Resistances`, (b, v) => { b.penFire += v; b.penCold += v; b.penLight += v; }),
      m([60, 100], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
    ],
  },
  {
    id: 'starforge', name: 'Starforge', base: 'sword2h', lvl: 80, weight: 10,
    flavour: 'Forged in the heart of a dying star.',
    mods: [
      m([200, 280], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([25, 40], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
      m([40, 60], (v) => `+${v}% to Critical Strike Multiplier`, (b, v) => { b.critMulti += v; }),
      m([0, 0], () => 'Deal no Elemental Damage', (b) => { b.noEle = 1; }),
    ],
  },
  {
    // Deliberately statless. Its whole argument is that it blocks both kinds of
    // hit at the cap a dedicated shield only reaches for one of them — the
    // price is every point of armour, evasion and energy shield a shield in
    // that slot would otherwise have given.
    id: 'bulwark', name: 'The Bulwark', base: 'shield_str', lvl: 20, weight: 30,
    flavour: 'No blade, no word. Nothing gets past.',
    noBaseStats: true,
    mods: [
      m([30, 30], (v) => `${v}% Chance to Block Melee`, (b, v) => { b.blockMelee += v; }),
      m([30, 30], (v) => `${v}% Chance to Block Spells`, (b, v) => { b.blockSpell += v; }),
      m([0, 0], () => 'Grants no Armour, Evasion or Energy Shield', () => {}),
    ],
  },
  {
    id: 'aegis', name: 'Aegis Aurora', base: 'shield_int', lvl: 72, weight: 25,
    flavour: 'Dawn breaks upon a wall of light.',
    mods: [
      m([100, 150], (v) => `${v}% increased Energy Shield`, (b, v) => { b.localIncES += v; }),
      m([25, 35], (v) => `+${v}% to Cold Resistance`, (b, v) => { b.resCold += v; }),
      m([3, 5], (v) => `+${v}% to all maximum Resistances`, (b, v) => { b.maxRes += v; }),
    ],
  },

  // --- Uniques that do something ------------------------------------------
  // Each of these is built around a reaction rather than a stat line. The stat
  // lines are deliberately modest: the effect is the reason to wear it.
  {
    id: 'heartseeker', name: 'Heartseeker', base: 'dagger', lvl: 8, weight: 70,
    power: 1.35,
    flavour: 'It knows the way in.',
    mods: [
      m([40, 60], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([15, 25], (v) => `${v}% increased Critical Strike Chance`, (b, v) => { b.incCrit += v; }),
      says('5% chance on hit to restore the wielder to full life'),
    ],
    reactions: [{
      trigger: 'hit', key: 'heartseeker', chance: 0.05,
      run: all(
        (ctx) => { ctx.self.life = ctx.self.maxLife; },
        announce((ctx) => `${ctx.self.name} is made whole by Heartseeker.`, 1, 'unique'),
      ),
    }],
  },
  {
    id: 'twinstrike', name: 'Twinstrike', base: 'sword1h', lvl: 14, weight: 55,
    power: 1.20,
    flavour: 'Once for the wound. Once for the memory of it.',
    mods: [
      m([30, 45], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([8, 14], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
      says('15% chance for an attack to strike twice'),
    ],
    reactions: [{
      trigger: 'hit', key: 'twinstrike', chance: 0.15,
      run: repeatAttack(),
    }],
  },
  {
    id: 'lastresort', name: 'Last Resort', base: 'amulet', lvl: 18, weight: 50,
    power: 1.0,
    flavour: 'Worn by those who expect the worst and intend to survive it.',
    mods: [
      m([25, 40], (v) => `+${v} to maximum Life`, (b, v) => { b.flatLife += v; }),
      says('When an ally falls below half life, deal 50% more damage for 3s'),
    ],
    reactions: [{
      trigger: 'allyLow', key: 'lastresort', cooldown: 10,
      run: all(
        selfBuff('lastresort', 'Last Resort', { incDamage: 50 }, 3),
        announce((ctx) => `${ctx.self.name} fights harder as ${ctx.target.name} falters.`, 0.5),
      ),
    }],
  },
  {
    id: 'emberbrand', name: 'Emberbrand', base: 'wand', lvl: 22, weight: 55,
    power: 1.30,
    flavour: 'The burn outlasts the spell.',
    mods: [
      m([30, 45], (v) => `${v}% increased Fire Damage`, (b, v) => { b.incFire += v; }),
      m([20, 30], (v) => `Adds ${Math.round(v * 0.4)} to ${v} Fire Damage`,
        (b, v) => { b.addFireMin += Math.round(v * 0.4); b.addFireMax += v; }),
      says('Hits burn the target for a further 20% of the damage over 3s'),
    ],
    reactions: [{
      trigger: 'hit', key: 'emberbrand',
      run: dotFromHit('emberbrand', 'Emberbrand', 0.2, 3),
    }],
  },
  {
    id: 'rendingedge', name: 'Rending Edge', base: 'axe1h', lvl: 26, weight: 50,
    power: 1.25,
    flavour: 'The cut is the smallest part of it.',
    mods: [
      m([45, 65], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      says('Attacks cause bleeding for 2% of the target\'s maximum life per '
        + 'second for 5s, up to three times the damage of the hit'),
    ],
    reactions: [{
      trigger: 'hit', key: 'rendingedge',
      run: (ctx) => {
        if (!ctx.target) return;
        // Percentage-of-life bleeds scale alarmingly against high-life bosses,
        // so the total is capped against the hit that applied it.
        const byLife = ctx.target.maxLife * 0.02;
        const cap = (ctx.amount * 3) / 5;
        applyEffect(ctx.target, {
          id: 'bleed', name: 'Bleeding', duration: 5,
          dps: Math.min(byLife, cap), source: ctx.self.uid,
        });
      },
    }],
  },
  {
    id: 'quickening', name: 'The Quickening', base: 'glove_ev', lvl: 30, weight: 50,
    power: 1.25,
    flavour: 'Faster than thought, and about as considered.',
    mods: [
      m([30, 50], (v) => `+${v} to Evasion Rating`, (b, v) => { b.flatEvasion += v; }),
      says('10% chance on hit to gain 25% attack speed for 5s'),
    ],
    reactions: [{
      trigger: 'hit', key: 'quickening', chance: 0.10,
      run: selfBuff('quickening', 'Quickened', { incAtkSpeed: 25 }, 5),
    }],
  },
  /**
   * The first of two unique bows, and between them the reason `strikes` exists
   * on the trigger context: both deal damage that is not a swing.
   *
   * The two halves are one idea seen from either side. A critical strike is the
   * spray; every hit that is *not* one still takes its half a percent. So the
   * bow is never idle and never merely a crit stick — the more of the fight
   * that goes ordinarily, the more of it the rider is carrying.
   *
   * Half a percent of maximum life per hit is about seven tenths of a percent a
   * second at an Archer's speed: no threat to anything on its own, and a steady
   * tax that does not care how much life a guardian has. Which is the point of
   * bringing it to a guardian.
   */
  {
    id: 'widowmaker', name: 'Widowmaker', base: 'bow', lvl: 40, weight: 45,
    power: 1.20,
    flavour: 'She only ever needed the one arrow. The rest are for the walk home.',
    mods: [
      m([80, 110], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([120, 170], (v) => `${v}% increased Critical Strike Chance`, (b, v) => { b.incCrit += v; }),
      m([25, 40], (v) => `+${v}% to Critical Strike Multiplier`, (b, v) => { b.critMulti += v; }),
      says('Critical strikes have a 35% chance to spray chaos damage over every '
        + 'other enemy, for 60% of the damage dealt'),
      says('Non-critical hits deal added chaos damage equal to 1.5% of the '
        + 'target\'s maximum life'),
    ],
    reactions: [
      {
        // Excludes the enemy actually struck, so it is worth nothing against a
        // lone target and a great deal against a full wave — a reason to bring
        // the bow somewhere rather than a number that is always on.
        trigger: 'crit', key: 'widowmaker-spray', chance: 0.35,
        run: all(cleave(0.60),
          announce((ctx) => `${ctx.self.name}'s arrow bursts, and the chaos goes wide.`, 0.12)),
      },
      {
        // `hit` fires for critical strikes too, which is what ctx.crit is for.
        // Without it this line would read "every hit" and quietly double up on
        // the one above.
        trigger: 'hit', key: 'widowmaker-bite',
        run: (ctx) => {
          if (ctx.crit || !ctx.target) return;
          dealDamage(ctx, ctx.target, ctx.target.maxLife * 0.015 * (ctx.gap ?? 1));
        },
      },
    ],
  },
  /**
   * The other bow, and the opposite temperament: Widowmaker pays out constantly
   * and never much, this pays out rarely and then keeps paying.
   *
   * Ten percent of a target's maximum life over fifteen seconds is slow enough
   * that it never kills anything by itself, which is what makes the spread fair
   * — it needs the party to finish what it started, and it is the party's next
   * kill that carries it on. A wave dying one at a time keeps it alive across
   * the whole of it; a wave that dies all at once wasted it.
   *
   * The chance is low and the duration long on purpose. At an Archer's crit
   * rate this lands roughly once every fifteen seconds, so it feels rare and
   * behaves as though it were permanent — the two things a signature modifier
   * has to be at the same time.
   */
  {
    id: 'deathsfury', name: "Death's Fury", base: 'bow', lvl: 55, weight: 40,
    power: 1.25,
    flavour: 'What it starts, it finishes. It is simply not in a hurry.',
    mods: [
      m([110, 150], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([15, 22], (v) => `${v}% increased Attack Speed`, (b, v) => { b.incAtkSpeed += v; }),
      says('Critical strikes have a 35% chance to inflict a bleed dealing chaos '
        + 'damage equal to 4% of the target\'s maximum life every 3s for 15s'),
      says('If a bleeding enemy dies, the bleed spreads to every other enemy '
        + 'and begins again'),
    ],
    reactions: [
      {
        trigger: 'crit', key: 'deathsfury', chance: 0.35,
        run: all((ctx) => furyBleed(ctx, ctx.target),
          announce((ctx) => `${ctx.target.name} will not stop bleeding.`, 0.20)),
      },
    ],
  },
  /**
   * The only unique quiver, and it exists because the off-hand rules created
   * a hole where there had not been one. An Archer's off hand takes a quiver
   * and nothing else now — which is right — but there has never been a unique
   * bow either, so the class went from borrowing a unique shield to having no
   * unique it could hold in either hand. Every other class has one.
   *
   * Built around the fact that an Archer opens no stronger than it finishes:
   * Steady Aim ramps, so a quiver that pays for the ramp is the piece that
   * suits the class rather than a stat stick that would suit anyone.
   */
  {
    id: 'lastarrow', name: 'The Last Arrow', base: 'quiver', lvl: 30, weight: 45,
    power: 1.20,
    flavour: 'Kept for the shot that matters. Every shot matters.',
    mods: [
      m([25, 40], (v) => `${v}% increased Critical Strike Chance`, (b, v) => { b.incCrit += v; }),
      m([120, 200], (v) => `+${v} to Accuracy Rating`, (b, v) => { b.accuracy += v; }),
      says('Every third hit strikes for 40% more'),
    ],
    reactions: [{
      // Counted rather than rolled: a ramping class wants a rhythm it can
      // rely on, and a chance-based version of this would just be more damage.
      trigger: 'hit', key: 'lastarrow',
      run: (ctx) => {
        ctx.self.__lastArrow = (ctx.self.__lastArrow ?? 0) + 1;
        if (ctx.self.__lastArrow % 3) return;
        selfBuff('lastarrow', 'The Last Arrow', { incDamage: 40 }, 1.2)(ctx);
      },
    }],
  },
  {
    id: 'wardstone', name: 'Wardstone', base: 'shield_str', lvl: 34, weight: 45,
    power: 1.20,
    flavour: 'Every blow turned teaches it the next one.',
    mods: [
      m([60, 90], (v) => `${v}% increased Armour`, (b, v) => { b.localIncArmour += v; }),
      says('Blocking a blow has a 10% chance to grant 30% spell block for 5s'),
    ],
    reactions: [{
      trigger: 'block', key: 'wardstone', chance: 0.10,
      run: (ctx) => {
        if (ctx.kind !== 'melee') return;
        selfBuff('wardstone', 'Wardstone', { blockSpell: 30 }, 5)(ctx);
      },
    }],
  },
  {
    id: 'benediction', name: 'Benediction', base: 'staff', lvl: 38, weight: 45,
    power: 1.15,
    flavour: 'Mercy, spread thin, still covers everyone.',
    mods: [
      m([25, 40], (v) => `${v}% increased Healing`, (b, v) => { b.incHeal += v; }),
      says('Healing radiates, mending the rest of the party for 25% of it over 3s'),
    ],
    reactions: [{
      trigger: 'heal', key: 'benediction',
      run: (ctx) => {
        if (!ctx.amount) return;
        for (const ally of ctx.run.combatants) {
          if (ally.down || ally === ctx.target) continue;
          applyEffect(ally, {
            id: 'benediction', name: 'Benediction', duration: 3,
            hps: (ctx.amount * 0.25) / 3, source: ctx.self.uid,
          });
        }
      },
    }],
  },

  // =========================================================================
  // Deep uniques
  // =========================================================================
  //
  // `deep: true` takes an item out of every ordinary drop table. These come
  // only from the three deep raids, at a fixed item level, and they are the
  // one reward in the game that cannot be reached by farming something easier
  // for longer.
  //
  // They are built to be *build-defining* rather than merely large: each one
  // gives up something real, so equipping it is a decision rather than an
  // upgrade. A hand-made unique that is simply better than a rare in every
  // respect makes the whole affix system pointless at the top end.
  {
    id: 'starfall', name: 'Starfall', base: 'staff', lvl: 100, weight: 100, deep: true,
    flavour: 'It came down burning, and it has not finished falling.',
    power: 1.35,
    mods: [
      // `incSpellDmg` was not a key the stat bag declares, so this line added a
      // NaN to a property nothing reads: the headline modifier on the deepest
      // caster unique in the game did exactly nothing. incDamage is what
      // "increased Spell Damage" has always meant here.
      m([60, 80], (v) => `${v}% increased Spell Damage`, (b, v) => { b.incDamage += v; }),
      m([40, 55], (v) => `${v}% increased Elemental Damage`, (b, v) => { b.incEle += v; }),
      m([25, 35], (v) => `${v}% reduced maximum Life`, (b, v) => { b.incLife -= v; }),
      says('Every ninth spell strikes for 400% damage'),
    ],
    reactions: [{
      trigger: 'hit', key: 'starfall',
      run: (ctx) => {
        ctx.self.starfallCount = (ctx.self.starfallCount ?? 0) + 1;
        if (ctx.self.starfallCount < 9) return;
        ctx.self.starfallCount = 0;
        const target = ctx.target;
        if (!target || target.life <= 0) return;
        const extra = (ctx.amount ?? 0) * 3;
        target.life -= extra;
        ctx.self.damageDealt = (ctx.self.damageDealt ?? 0) + extra;
        announce((c) => `${c.self.name} calls down a star.`, 0.5)(ctx);
      },
    }],
  },
  {
    id: 'gravewarden', name: 'The Gravewarden', base: 'shield_str', lvl: 100, weight: 100, deep: true,
    flavour: 'It has stood over the same door for four hundred years. The door has never opened.',
    power: 1.30,
    mods: [
      m([220, 300], (v) => `+${v}% increased Armour`, (b, v) => { b.incArmour += v; }),
      // Three to five, not fifteen to twenty-two. A tier-3 trait gives +2, so
      // the first draft of this was nine times the best trait in the game and
      // would have put a hero at a 93% resistance cap on its own.
      m([3, 5], (v) => `+${v}% to all maximum Resistances`, (b, v) => { b.maxRes += v; }, 0),
      m([40, 55], (v) => `${v}% reduced Damage dealt`, (b, v) => { b.incDamage -= v; }),
      says('While you stand, allies below half life take 30% less damage'),
    ],
    reactions: [{
      trigger: 'allyLow', key: 'gravewarden',
      run: (ctx) => {
        if (!ctx.target || ctx.target === ctx.self) return;
        applyEffect(ctx.target, {
          id: 'gravewarden', name: 'Gravewarden', duration: 6,
          mods: { damageTaken: -30 }, source: ctx.self.uid,
        });
      },
    }],
  },
  {
    id: 'lifedrinker', name: 'Lifedrinker', base: 'axe2h', lvl: 100, weight: 100, deep: true,
    flavour: 'The wound it opens does not close, and neither does the one it healed.',
    power: 1.32,
    mods: [
      m([80, 110], (v) => `${v}% increased Physical Damage`, (b, v) => { b.localIncPhys += v; }),
      m([2.5, 4.0], (v) => `${v}% of Physical Damage leeched as Life`, (b, v) => { b.lifeLeech += v; }, 1),
      says('You cannot be healed by others'),
      says('Kills restore 6% of maximum life'),
    ],
    reactions: [
      {
        trigger: 'combatStart', key: 'lifedrinker-curse',
        run: (ctx) => {
          applyEffect(ctx.self, {
            id: 'lifedrinker-curse', name: 'Lifedrinker', duration: Infinity,
            mods: { incHeal: -100 },
          });
        },
      },
      {
        trigger: 'kill', key: 'lifedrinker-feed',
        run: (ctx) => {
          applyEffect(ctx.self, {
            id: 'lifedrinker-feed', name: 'Lifedrinker', duration: 0.4,
            hps: (ctx.self.maxLife * 0.06) / 0.4, onReapply: 'stack', maxStacks: 6,
          });
        },
      },
    ],
  },
];

export const UNIQUE_BY_ID = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));

/**
 * Uniques eligible to drop at the given item level.
 *
 * Deep uniques are excluded. They are not gated by item level but by *where*
 * they come from, and a level gate alone would leak them into ordinary drops
 * the moment a player pushed deep enough — which is the opposite of the point.
 */
export function uniquesFor(ilvl) {
  return UNIQUES.filter((u) => u.lvl <= ilvl && !u.deep);
}

/** The deep-raid-only pool. */
export function deepUniques() {
  return UNIQUES.filter((u) => u.deep);
}
