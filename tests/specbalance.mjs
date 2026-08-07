// What each specialisation is actually worth. Run by hand, not by npm test —
// a useful sample takes minutes, which is not something to put in a suite.
//
//   node tests/specbalance.mjs <tier> <levelsBehind> <specTier>
//
// ---------------------------------------------------------------------------
// Two things this tool taught, both the hard way
// ---------------------------------------------------------------------------
//
// The band matters more than anything else. A level-matched party at Tier 14
// clears 100% with every branch and 100% with none; six levels under Tier 20
// wipes in eight seconds either way. Neither says anything. Tier 20
// level-matched sits near 50% unspecialised, and that is the only place a
// single branch on a single hero is visible at all.
//
// And the noise floor is higher than it looks. At forty runs the standard
// error on a 50% clear rate is about 8 points, so anything under ±15 points is
// indistinguishable from luck. A first pass at that sample size reported five
// branches as *net negative* and sent the tuning off after ghosts; the same
// configuration at ninety-six runs had every one of them comfortably positive.
// Do not act on a figure from this tool until the sample is large enough for
// the difference to survive its own error bar.

import { freshGuild, partyForTier, runExpedition, mean } from './sim.mjs';
import { SPECS, specPoolFor } from '../src/data/specs.js';
import { CLASS_BY_ID } from '../src/data/heroclasses.js';
import { refreshSheets } from '../src/sheets.js';

const SEEDS = [9000, 31000, 53000, 77000, 101000, 127000, 149000, 173000];
const TIER = Number(process.argv[2] ?? 20);
const BEHIND = Number(process.argv[3] ?? 0);
const SPEC_TIER = Number(process.argv[4] ?? 1);
const RUNS = 5;

// Two comps, because one party cannot host every role's representative and a
// Cleric measured in a party that already has a Templar is measuring neither.
const COMPS = {
  Tank: { comp: ['warrior', 'cleric', 'bard', 'rogue', 'wizard'], host: 'warrior' },
  Healer: { comp: ['warrior', 'cleric', 'bard', 'rogue', 'wizard'], host: 'cleric' },
  Support: { comp: ['guardian', 'templar', 'bard', 'rogue', 'warlock'], host: 'bard' },
  DPS: { comp: ['warrior', 'cleric', 'bard', 'rogue', 'wizard'], host: 'rogue' },
};

function measure(specIds, role) {
  const { comp, host } = COMPS[role];
  const clears = [];
  const secs = [];
  for (const seed of SEEDS) {
    freshGuild(seed);
    const { party, heroes } = partyForTier(comp, TIER, BEHIND);
    const hero = heroes.find((h) => h.classId === host);
    if (hero) hero.specs = specIds.slice();
    refreshSheets();
    for (let i = 0; i < RUNS; i++) {
      const r = runExpedition(party, 'mines', TIER);
      if (r.error) continue;
      clears.push(r.cleared ? 1 : 0);
      secs.push(r.seconds);
    }
  }
  return { clear: mean(clears) * 100, secs: mean(secs) };
}

const base = {};
for (const role of Object.keys(COMPS)) base[role] = measure([], role);

console.log(`Tier ${TIER}${BEHIND ? `, ${BEHIND} levels under` : ', level-matched'}, `
  + `specialisation tier ${SPEC_TIER}, ${SEEDS.length * RUNS} runs each\n`);
for (const [role, b] of Object.entries(base)) {
  console.log(`  baseline ${role.padEnd(8)} ${COMPS[role].comp.join('/').padEnd(38)} `
    + `${b.clear.toFixed(0).padStart(3)}%  ${b.secs.toFixed(0)}s`);
}
console.log('');
console.log('specialisation'.padEnd(18) + 'axis'.padEnd(8) + 'role'.padEnd(9)
  + 'clear'.padStart(7) + 'time'.padStart(7) + '   vs unspecialised');

for (const spec of SPECS.filter((s) => s.tier === SPEC_TIER)) {
  const { host } = COMPS[spec.role];
  const cls = CLASS_BY_ID[host];
  const branches = specPoolFor(cls, 1);
  let ids;
  if (SPEC_TIER === 1) {
    if (!branches.some((s) => s.id === spec.id)) continue;
    ids = [spec.id];
  } else {
    const from = branches.find((b) => specPoolFor(cls, 2, b.id).some((t) => t.id === spec.id));
    if (!from) continue;
    ids = [from.id, spec.id];
  }
  const r = measure(ids, spec.role);
  const b = base[spec.role];
  const d = r.clear - b.clear;
  console.log(
    spec.name.padEnd(18) + spec.axis.padEnd(8) + spec.role.padEnd(9)
    + `${r.clear.toFixed(0)}%`.padStart(7) + `${r.secs.toFixed(0)}s`.padStart(7)
    + `   ${d >= 0 ? '+' : ''}${d.toFixed(0)}pp`
    + (SPEC_TIER === 2 ? `   via ${ids[0]}` : ''),
  );
}
