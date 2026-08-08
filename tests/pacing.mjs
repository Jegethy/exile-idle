// How long is the game?
//
//   node tests/pacing.mjs [clearsPerHour]
//
// A save left running overnight came back with level 131 heroes farming Tier 20
// content built for level 69, 707 expeditions cleared, and all but four uniques
// collected — in twelve and a half hours. An idle game measured in hours is not
// an idle game.
//
// This walks the real curves rather than combat: award experience exactly as
// rewards.js does, level with xpToNext, and push a tier whenever the party has
// reached the level that tier is built for. Combat is the expensive part and
// the slow part is arithmetic, so this answers "how many clears" exactly and
// converts to hours with an observed clear rate.

import { xpToNext, guildXpToNext } from '../src/state.js';
import {
  tierToLevel, xpPerKill, nominalKills, xpGapMult, clearsPerLevel, guildXpFor,
} from '../src/data/dungeons.js';

const PER_HOUR = Number(process.argv[2] ?? 56);   // observed: 707 clears / 12.63h
const PARTY = 5;
const MAX_TIER = 30;

/**
 * `lead` is how far *under* the next tier's own level a party will push into
 * it. Nobody waits until they are level-matched: gear carries you above your
 * level, and the wall is ten levels under (see expedition/balance.js). Five is
 * what reproduces the measured early game — Tier 5 reached around level 15,
 * about forty minutes in.
 */
function walk(share, lead = 5) {
  let level = 1;
  let xp = 0;
  let clears = 0;
  let gLevel = 1;
  let gXp = 0;
  const marks = [];

  for (let tier = 1; tier <= MAX_TIER; tier++) {
    const target = tierToLevel(tier);
    const leave = tier < MAX_TIER
      ? Math.max(level + 1, tierToLevel(tier + 1) - lead)
      : target + 12;
    let stuck = 0;
    while (level < leave && stuck < 500000) {
      const gain = share(tier) * xpGapMult(level, target);
      if (gain <= 0) break;              // greyed out: nothing more to learn here
      xp += gain;
      clears++;
      stuck++;
      while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++; }
      gXp += guildXpFor(tier);
      while (gXp >= guildXpToNext(gLevel)) { gXp -= guildXpToNext(gLevel); gLevel++; }
    }
    marks.push({ tier, level, clears, gLevel });
  }
  return marks;
}

/** What one clear teaches one hero, under the live curve. */
const live = (tier) => (xpPerKill(tier) * nominalKills(tier)) / PARTY;
/** ...and under the flat four-clears-a-level curve this replaced. */
const old = (tier) => (xpToNext(tierToLevel(tier)) * PARTY / (4 * nominalKills(tier)))
  * nominalKills(tier) / PARTY;

const marks = walk(live);
const before = walk(old);
console.log(`Clears needed to work through the game, at ${PER_HOUR} clears an hour.\n`);
console.log('tier  content  hero lvl  guild lvl   clears   cumulative      hours');
let prev = 0;
for (const m of marks) {
  if (m.tier % 5 && m.tier !== 1 && m.tier !== MAX_TIER) { prev = m.clears; continue; }
  console.log(String(m.tier).padStart(4) + String(tierToLevel(m.tier)).padStart(9)
    + String(m.level).padStart(10) + String(m.gLevel).padStart(11)
    + String(m.clears - prev).padStart(9)
    + String(m.clears).padStart(13) + (m.clears / PER_HOUR).toFixed(1).padStart(11));
  prev = m.clears;
}
const total = marks[marks.length - 1];
console.log(`\n  ${total.clears.toLocaleString()} clears — ${(total.clears / PER_HOUR).toFixed(0)} hours `
  + `of continuous idling, ending at hero level ${total.level}, guild level ${total.gLevel}.`);
const was = before[before.length - 1];
console.log(`  Before: ${was.clears.toLocaleString()} clears `
  + `(${(was.clears / PER_HOUR).toFixed(1)}h) ending at level ${was.level} `
  + `— ${(total.clears / was.clears).toFixed(1)}x longer now.`);
console.log(`  A player idling 4 hours a day: ${(total.clears / PER_HOUR / 4).toFixed(0)} days.`);
console.log(`  clears per level, by depth: T1 ${clearsPerLevel(1).toFixed(0)}, `
  + `T10 ${clearsPerLevel(10).toFixed(0)}, T20 ${clearsPerLevel(20).toFixed(0)}, `
  + `T30 ${clearsPerLevel(30).toFixed(0)}`);
