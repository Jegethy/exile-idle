// Balance: are eleven classes actually eleven classes, or three classes and
// eight traps?
//
// Every figure comes from the real combat engine running real parties — see
// sim.mjs. Assertions are about design intent rather than exact numbers,
// because the numbers should be free to move; what must not happen is a class
// being useless, or two classes being the same class.
//
// Needs no browser, so it runs in plain Node and can afford hundreds of full
// expeditions.
//
// The measure is **clear time**, not damage dealt. Total damage is very nearly
// fixed by the content — every party has to chew through the same enemies — so
// damage per hero says almost nothing. How long it takes says everything.

import { suite, test, ok, clean } from './assert.mjs';
import { freshGuild, makeParty, runExpedition, mean } from './sim.mjs';

const TRIALS = 30;

// Measured, not guessed. At level 40 in rare item-level 40 gear a reference
// party clears T15 comfortably, T16 most of the time, and T17 rarely. Waves
// last ~1.9s at T8 and ~7s at T16, which is what makes those two tiers a fair
// short-fight/long-fight pair.
const LONG = 16;
const SHORT = 8;
const PRESSURE = 17;

function trial(classIds, tier, trials = TRIALS) {
  const runs = [];
  for (let t = 0; t < trials; t++) {
    freshGuild(9000 + t);
    const { party } = makeParty(classIds);
    const r = runExpedition(party, 'mines', tier);
    if (!r.error) runs.push(r);
  }
  const cleared = runs.filter((r) => r.cleared);
  const pick = (id, key) => mean(runs.map(
    (r) => mean(r.contribution.filter((c) => c.classId === id).map((c) => c[key])),
  ));
  return {
    clearRate: cleared.length / Math.max(1, runs.length),
    // Only cleared runs have a meaningful duration; a wipe stops early.
    seconds: mean(cleared.map((r) => r.seconds)),
    deaths: mean(runs.map((r) => r.contribution.filter((c) => c.down).length)),
    partyDamage: mean(runs.map((r) => r.contribution.reduce((a, c) => a + c.damageDealt, 0))),
    damageOf: (id) => pick(id, 'damageDealt'),
    takenBy: (id) => pick(id, 'damageTaken'),
    healedBy: (id) => pick(id, 'healingDone'),
    shareOf: (id) => mean(runs.map((r) => {
      const total = r.contribution.reduce((a, c) => a + c.damageDealt, 0);
      const mine = r.contribution.filter((c) => c.classId === id)
        .reduce((a, c) => a + c.damageDealt, 0);
      return total > 0 ? mine / total : 0;
    })),
  };
}

const DPS = ['rogue', 'archer', 'wizard', 'warlock', 'inquisitor'];
const TANKS = ['warrior', 'paladin', 'guardian'];
const HEALERS = ['cleric', 'druid', 'templar'];

const pct = (n) => `${(n * 100).toFixed(0)}%`;

export default async function run() {
  suite('balance');

  // ---- Damage classes ----------------------------------------------------
  const dps = {};
  for (const id of DPS) dps[id] = trial(['guardian', 'cleric', id, id, id], LONG);

  await test('no damage class is dead weight', async () => {
    const rows = DPS.map((id) => ({ id, ...dps[id] }))
      .sort((a, b) => a.seconds - b.seconds);
    const fastest = rows[0].seconds;
    console.log(`\n     three of each, T${LONG}      clear     time   vs fastest`);
    for (const r of rows) {
      console.log(`       ${r.id.padEnd(11)} ${pct(r.clearRate).padStart(7)}`
        + `${r.seconds.toFixed(0).padStart(8)}s${(r.seconds / fastest).toFixed(2).padStart(10)}x`);
    }
    const slowest = rows[rows.length - 1];
    ok(slowest.seconds < fastest * 2,
      `${slowest.id} takes ${(slowest.seconds / fastest).toFixed(2)}x as long as ${rows[0].id} — a trap`);
    for (const r of rows) {
      ok(r.clearRate > 0.4, `${r.id} only clears ${pct(r.clearRate)} of the time`);
    }
    return `${rows[0].id} fastest, ${slowest.id} slowest at ${(slowest.seconds / fastest).toFixed(2)}x`;
  });

  await test('an opener holds up better in short waves than a ramp', async () => {
    // Share of party damage rather than a raw rate: every class idles equally
    // between waves, and at T8 that downtime is most of the run.
    const short = {};
    for (const id of ['rogue', 'archer']) {
      short[id] = trial(['guardian', 'cleric', id, id, id], SHORT);
    }
    // Both classes lose share in short waves — a 1.9s wave is mostly the
    // tank's opening swing — so what matters is which loses less. The Rogue's
    // burst is at full strength before a short wave ends; the Archer's ramp
    // never gets going.
    const rogueDrop = dps.rogue.shareOf('rogue') - short.rogue.shareOf('rogue');
    const archerDrop = dps.archer.shareOf('archer') - short.archer.shareOf('archer');
    console.log('\n     share of party damage      1.9s waves   7.0s waves');
    for (const id of ['rogue', 'archer']) {
      console.log(`       ${id.padEnd(11)} ${pct(short[id].shareOf(id)).padStart(16)}`
        + `${pct(dps[id].shareOf(id)).padStart(13)}`);
    }
    ok(rogueDrop < archerDrop,
      "the Rogue's opener should survive a short wave better than the Archer's ramp "
      + `(loses ${(rogueDrop * 100).toFixed(1)}pp vs ${(archerDrop * 100).toFixed(1)}pp)`);
    return `in short waves the Rogue loses ${(rogueDrop * 100).toFixed(1)}pp of party share, the Archer ${(archerDrop * 100).toFixed(1)}pp`;
  });

  await test('the Warlock trades single-target damage for a cleave', async () => {
    // Its curse only touches enemies other than the one struck, so its value
    // is entirely in how many there are.
    const r = dps.warlock;
    ok(r.damageOf('warlock') > 0, 'the Warlock dealt no damage');
    ok(r.seconds > dps.archer.seconds,
      'the Warlock should be slower than the Archer on ordinary content');
    ok(r.clearRate > 0.5, `the Warlock only clears ${pct(r.clearRate)} — its cleave is not paying`);
    return `${r.seconds.toFixed(0)}s vs the Archer's ${dps.archer.seconds.toFixed(0)}s, ${pct(r.clearRate)} clear`;
  });

  await test('a support class pays for itself in a mixed party', async () => {
    // Zealotry buffs the party, so three Inquisitors is the wrong test: the
    // buff does not stack with itself. One, in a real party, is the question.
    const withIt = trial(['guardian', 'cleric', 'inquisitor', 'archer', 'wizard'], LONG);
    const without = trial(['guardian', 'cleric', 'rogue', 'archer', 'wizard'], LONG);
    console.log('\n     one Inquisitor in a mixed party');
    console.log(`       with       ${withIt.seconds.toFixed(0).padStart(6)}s   ${pct(withIt.clearRate)} clear`);
    console.log(`       without    ${without.seconds.toFixed(0).padStart(6)}s   ${pct(without.clearRate)} clear`);
    ok(withIt.clearRate >= without.clearRate - 0.15,
      `an Inquisitor makes the party worse (${pct(withIt.clearRate)} vs ${pct(without.clearRate)})`);
    return `${pct(withIt.clearRate)} clear with, ${pct(without.clearRate)} without`;
  });

  // ---- Tanks -------------------------------------------------------------
  await test('every tank beats bringing none', async () => {
    const noTank = trial(['rogue', 'cleric', 'archer', 'wizard', 'warlock'], PRESSURE);
    console.log(`\n     under pressure, T${PRESSURE}      clear   deaths   soaked`);
    console.log(`       ${'(no tank)'.padEnd(11)} ${pct(noTank.clearRate).padStart(7)}`
      + `${noTank.deaths.toFixed(1).padStart(9)}`);
    const rows = [];
    for (const id of TANKS) {
      const t = trial([id, 'cleric', 'rogue', 'archer', 'wizard'], PRESSURE);
      rows.push({ id, ...t, soaked: t.takenBy(id) });
      console.log(`       ${id.padEnd(11)} ${pct(t.clearRate).padStart(7)}${t.deaths.toFixed(1).padStart(9)}`
        + `${Math.round(t.takenBy(id)).toString().padStart(9)}`);
    }
    for (const r of rows) {
      ok(r.deaths < noTank.deaths, `${r.id} loses as many heroes as bringing no tank`);
      ok(r.soaked > 0, `${r.id} soaked nothing — threat weighting is broken`);
    }
    return `all three beat no tank (${noTank.deaths.toFixed(1)} deaths)`;
  });

  await test('tanks answer different content', async () => {
    // The real proof that the Warrior/Paladin trade is a trade and not a
    // gradient: force a wave to be all melee, then all spell, and the right
    // answer should swap. Mixed content averages this away, which is why the
    // Paladin looks weak until you give it something to be strong against.
    const forced = async (attack) => {
      const { ARCHETYPES } = await import('../src/data/monsters.js');
      const saved = ARCHETYPES.map((a) => a.attack);
      ARCHETYPES.forEach((a) => { a.attack = attack; });
      const out = {};
      for (const id of TANKS) {
        out[id] = trial([id, 'cleric', 'rogue', 'archer', 'wizard'], LONG, 24).clearRate;
      }
      ARCHETYPES.forEach((a, i) => { a.attack = saved[i]; });
      return out;
    };
    const melee = await forced('melee');
    const spell = await forced('spell');
    console.log('\n     forced content        warrior   paladin  guardian');
    console.log(`       all melee     ${TANKS.map((t) => pct(melee[t]).padStart(9)).join('')}`);
    console.log(`       all spell     ${TANKS.map((t) => pct(spell[t]).padStart(9)).join('')}`);
    ok(melee.warrior > melee.paladin,
      'the Warrior should be the answer to a melee wave');
    ok(spell.paladin > spell.warrior,
      'the Paladin should be the answer to a caster wave');
    ok(spell.paladin > melee.paladin,
      'the Paladin should prefer casters to brawlers');
    return `warrior ${pct(melee.warrior)}/${pct(spell.warrior)}, `
      + `paladin ${pct(melee.paladin)}/${pct(spell.paladin)} (melee/spell)`;
  });

  await test('tanks are not the same tank', async () => {
    const w = trial(['warrior', 'cleric', 'rogue', 'archer', 'wizard'], PRESSURE);
    const p = trial(['paladin', 'cleric', 'rogue', 'archer', 'wizard'], PRESSURE);
    const a = w.takenBy('warrior');
    const b = p.takenBy('paladin');
    const diff = Math.abs(a - b) / Math.max(a, b);
    ok(diff > 0.05, `Warrior and Paladin take near-identical damage (${pct(diff)} apart)`);
    return `${pct(diff)} apart in damage taken`;
  });

  // ---- Healers -----------------------------------------------------------
  await test('every healer earns its slot', async () => {
    const none = trial(['guardian', 'rogue', 'archer', 'wizard', 'warlock'], LONG);
    console.log(`\n     T${LONG}                  clear   deaths   healed`);
    console.log(`       ${'(no healer)'.padEnd(11)} ${pct(none.clearRate).padStart(7)}`
      + `${none.deaths.toFixed(1).padStart(9)}`);
    for (const id of HEALERS) {
      const t = trial(['guardian', id, 'rogue', 'archer', 'wizard'], LONG);
      console.log(`       ${id.padEnd(11)} ${pct(t.clearRate).padStart(7)}${t.deaths.toFixed(1).padStart(9)}`
        + `${Math.round(t.healedBy(id)).toString().padStart(9)}`);
      ok(t.healedBy(id) > 0, `${id} healed nothing`);
      ok(t.deaths < none.deaths, `${id} is no better than bringing no healer at all`);
    }
    return 'all three reduce deaths versus no healer';
  });

  await test('healers have the niches their descriptions claim', async () => {
    // The Cleric's is one ally being hammered, which is what a tank produces.
    // The Druid's is damage spread over everyone, which is what happens
    // without one — a party-wide heal-over-time is wasted on the healthy.
    const spike = {}; const spread = {};
    for (const id of ['cleric', 'druid']) {
      spike[id] = trial(['guardian', id, 'rogue', 'archer', 'wizard'], LONG);
      spread[id] = trial([id, 'rogue', 'archer', 'wizard', 'warlock'], LONG);
    }
    const clericCost = spread.cleric.deaths - spike.cleric.deaths;
    const druidCost = spread.druid.deaths - spike.druid.deaths;
    console.log('\n     deaths per run        with a tank   without one');
    for (const id of ['cleric', 'druid']) {
      console.log(`       ${id.padEnd(11)} ${spike[id].deaths.toFixed(2).padStart(14)}`
        + `${spread[id].deaths.toFixed(2).padStart(14)}`);
    }
    ok(clericCost > druidCost,
      'losing the tank should hurt the Cleric more than the Druid '
      + `(cleric +${clericCost.toFixed(2)}, druid +${druidCost.toFixed(2)} deaths)`);
    return `without a tank the Cleric loses ${clericCost.toFixed(2)} deaths/run, the Druid ${druidCost.toFixed(2)}`;
  });

  await test('no damage class is beaten everywhere', async () => {
    // A trap is a class with no scenario in which it is not the worst pick.
    const traps = [];
    for (const a of DPS) {
      const beaten = DPS.filter((b) => b !== a
        && dps[b].seconds < dps[a].seconds * 0.9
        && dps[b].clearRate > dps[a].clearRate + 0.05);
      if (beaten.length === DPS.length - 1) {
        traps.push(`${a} is beaten on both speed and reliability by every other class`);
      }
    }
    ok(traps.length === 0, traps.join('; '));
    return 'every damage class wins on some axis';
  });

  await test('no page errors', () => clean([]));
}
