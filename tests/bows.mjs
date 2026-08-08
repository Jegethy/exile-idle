// Hand-run: what the two unique bows are actually worth, and whether either
// one breaks the shape of a fight.
//
//   node tests/bows.mjs
//
// Percentage-of-maximum-life damage is the thing to watch. It is the one
// mechanic in the game that ignores how much life a target has, so it gets
// better the deeper you go and better still against a guardian — exactly the
// two places where "better" can turn into "the only weapon worth using".
// Rending Edge already caps its bleed against the hit that applied it for this
// reason; this measures whether either bow needs the same.

import { freshGuild, makeParty, runExpedition, mean, num } from './sim.mjs';

import { createItem } from '../src/items.js';
import { refreshSheets } from '../src/sheets.js';
import { tierToLevel, tierToIlvl } from '../src/data/dungeons.js';

const PARTY = ['guardian', 'cleric', 'archer', 'archer', 'wizard'];
const RUNS = 24;

/** Puts a named unique (or a plain rare bow) into both Archers' hands. */
function armArchers(heroes, uniqueId, ilvl) {
  for (const h of heroes) {
    if (h.classId !== 'archer') continue;
    h.equipment.weapon = uniqueId
      ? createItem({ uniqueId, ilvl })
      : createItem({ baseId: 'bow', ilvl, rarity: 'rare' });
  }
  refreshSheets();
}

function trial(uniqueId, tier, dungeon) {
  const cleared = []; const seconds = []; const archerDamage = []; const share = [];
  for (let i = 0; i < RUNS; i++) {
    freshGuild(4000 + i);
    const { party, heroes } = makeParty(PARTY, {
      level: tierToLevel(tier), ilvl: tierToIlvl(tier),
    });
    armArchers(heroes, uniqueId, tierToIlvl(tier));
    const res = runExpedition(party, dungeon, tier);
    if (res.error) continue;
    cleared.push(res.cleared ? 1 : 0);
    seconds.push(res.seconds);
    const total = res.contribution.reduce((s, c) => s + c.damageDealt, 0);
    const archers = res.contribution.filter((c) => c.classId === 'archer')
      .reduce((s, c) => s + c.damageDealt, 0);
    archerDamage.push(archers);
    share.push(total > 0 ? archers / total : 0);
  }
  return {
    clear: mean(cleared), seconds: mean(seconds),
    damage: mean(archerDamage), share: mean(share),
  };
}

const BOWS = [
  ['rare bow', null],
  ['Widowmaker', 'widowmaker'],
  ["Death's Fury", 'deathsfury'],
];

for (const [dungeon, tiers] of [['mines', [10, 20, 30]], ['crypt', [20]]]) {
  console.log(`\n  ${dungeon}          tier    clear     time   archer dmg   share of party`);
  for (const tier of tiers) {
    for (const [label, id] of BOWS) {
      const t = trial(id, tier, dungeon);
      console.log(`    ${label.padEnd(14)}${String(tier).padStart(4)}`
        + `${(t.clear * 100).toFixed(0).padStart(8)}%${num(t.seconds, 8, 0)}s`
        + `${num(t.damage, 13, 0)}${(t.share * 100).toFixed(0).padStart(15)}%`);
    }
  }
}

// The question a percentage-of-maximum-life modifier has to answer.
//
// It is the one mechanic in the game that does not care how much life a target
// has, and the gap between enemy life and party damage widens with depth — a
// Tier 10 guardian dies in about three seconds and a Tier 30 one takes thirteen.
// So these bows should get *relatively* stronger the deeper they go, and the
// thing to watch is whether that curve flattens into an advantage or runs away
// into the only weapon worth carrying.
//
// Printed as a ratio against a rare bow, since the absolute numbers at Tier 40
// mean nothing next to those at Tier 10.
//
// Measured, and the answer was the opposite of the worry: +21%/+29% at Tier 10,
// +16%/+18% at Tier 20, and *behind* a rare by Tier 40. Nothing to do with the
// percentage — a unique's modifier ranges are fixed while a rare's affix tiers
// keep climbing (inc_phys reaches 232-280% at item level 118 against these
// bows' flat 80-110%), so every unique in the game that is not marked `deep`
// falls off in the same way and for the same reason. These two are strongest
// in the band their level gates them to, which is where they should be.
console.log('\n  does the percentage run away with depth?');
console.log('    tier    Widowmaker vs rare    Death’s Fury vs rare');
for (const tier of [10, 20, 30, 40]) {
  const base = trial(null, tier, 'mines');
  const wm = trial('widowmaker', tier, 'mines');
  const df = trial('deathsfury', tier, 'mines');
  const rel = (t) => (base.damage > 0 ? `${((t.damage / base.damage - 1) * 100).toFixed(0)}%` : '—');
  console.log(`    ${String(tier).padStart(4)}${rel(wm).padStart(22)}${rel(df).padStart(24)}`);
}
