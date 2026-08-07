// Is a tier a tier, whichever dungeon you take it in?
//
//   node tests/dungeonbalance.mjs [tier] [seeds]
//
// The game's central claim, in its own words: "Tier and dungeon are
// deliberately independent. Tier is how hard; dungeon is what for." That is
// what makes cleared content stay useful — you go back to Tier 4 for gold
// because gold is what you need, not because Tier 4 is where you can survive.
//
// It was not true. Measured at Tier 20 level-matched, the same party cleared
// Silkmoth Hollow 63% of the time and the Proving Arena 0%, because every
// dungeon carries its own monster multipliers and nothing had ever multiplied
// them out. The Arena stacked damage 1.35 against attack speed 1.30 over ten
// waves; the Hollow put 0.85 damage on 70% life over nine.
//
// So this measures the one thing the design promises: the spread. Character —
// armoured, evasive, warded, swarming — is supposed to change *how* you beat a
// dungeon, never *whether* you can.

import { freshGuild, partyForTier, runExpedition, mean } from './sim.mjs';
import { DUNGEONS } from '../src/data/dungeons.js';
import { tankFor } from '../src/readiness.js';
import { refreshSheets } from '../src/sheets.js';

const TIER = Number(process.argv[2] ?? 20);
const SEED_COUNT = Number(process.argv[3] ?? 6);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 9000 + i * 7919);
const RUNS = 4;

/**
 * The reference party: one of each role, and the tank the dungeon's blend
 * actually calls for.
 *
 * Measuring every dungeon with the same fixed tank stopped being honest the
 * moment the tanks were made to matter — a Warrior in a 68% melee dungeon is
 * measuring how well a Warrior suits it, not how hard it is. What the design
 * promises is that a tier is a tier *when you answer it correctly*; bringing
 * the wrong tank is supposed to hurt, and that is measured separately.
 */
const REST = ['cleric', 'bard', 'rogue', 'wizard'];
const compFor = (d) => [tankFor(d.attackMix).cls.id, ...REST];

export function measure(dungeonId, comp = null, tier = TIER) {
  const def = DUNGEONS.find((d) => d.id === dungeonId);
  const party = comp ?? compFor(def);
  const clears = [];
  const secs = [];
  for (const seed of SEEDS) {
    freshGuild(seed);
    const { party: p } = partyForTier(party, tier);
    refreshSheets();
    for (let i = 0; i < RUNS; i++) {
      const r = runExpedition(p, dungeonId, tier);
      if (r.error) continue;
      clears.push(r.cleared ? 1 : 0);
      secs.push(r.seconds);
    }
  }
  return { clear: mean(clears) * 100, secs: mean(secs) };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || process.argv[1].endsWith('dungeonbalance.mjs')) {
  console.log(`Tier ${TIER}, level-matched, ${SEEDS.length * RUNS} runs each, `
    + 'each dungeon answered with the tank its blend calls for\n');
  console.log('dungeon'.padEnd(18) + 'blend'.padEnd(9) + 'tank'.padEnd(10)
    + 'clear'.padStart(8) + 'time'.padStart(8) + '   character');

  const rows = [];
  for (const d of DUNGEONS) {
    const r = measure(d.id);
    rows.push({ d, ...r });
    const mix = d.attackMix ?? { melee: 50, spell: 50 };
    const m = d.monsters ?? {};
    const character = [
      m.armour >= 1.5 && 'armoured', m.evasion >= 1.4 && 'evasive',
      m.res >= 30 && 'warded', (m.aps ?? 1) >= 1.25 && 'fast',
      (m.aps ?? 1) <= 0.8 && 'slow', m.life >= 1.35 && 'tough',
      m.damage >= 1.25 && 'hits hard',
    ].filter(Boolean).join(', ') || 'plain';
    console.log(
      d.name.padEnd(18)
      + `${mix.melee}/${mix.spell}`.padEnd(9)
      + tankFor(mix).cls.name.padEnd(10)
      + `${r.clear.toFixed(0)}%`.padStart(8)
      + `${r.secs.toFixed(0)}s`.padStart(8)
      + `   ${character}`,
    );
  }

  const clears = rows.map((r) => r.clear);
  const spread = Math.max(...clears) - Math.min(...clears);
  const hardest = rows.reduce((a, b) => (b.clear < a.clear ? b : a));
  const easiest = rows.reduce((a, b) => (b.clear > a.clear ? b : a));
  console.log(`\nspread ${spread.toFixed(0)}pp — hardest ${hardest.d.name} `
    + `${hardest.clear.toFixed(0)}%, easiest ${easiest.d.name} ${easiest.clear.toFixed(0)}%`);
}
