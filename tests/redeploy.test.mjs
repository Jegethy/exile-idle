// Auto-redeploy. The reported bug: with two parties and one charter, enabling
// it sent Party 1 every time and Party 2 never went out again, because the
// queue was the order the parties happened to be created in.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Two parties, both with a run on record, and the unlock bought. */
async function twoParties(page) {
  return page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    const { rollHero, createParty, assignToParty } = await import('./src/heroes.js');
    const { refreshSheets } = await import('./src/sheets.js');
    G.paused = true;
    // Clear the field too: a run left over from an earlier check belongs to a
    // party that no longer exists.
    G.state.expeditions.length = 0;
    G.state.upgrades.autoDispatch = 1;
    G.state.heroes.length = 0;
    G.state.parties.length = 0;
    const made = [];
    for (const name of ['First', 'Second']) {
      const party = createParty(name);
      for (const cls of ['guardian', 'rogue', 'cleric']) {
        const h = rollHero({ classId: cls, rarity: 'common' });
        h.level = 20; h.stamina = 100;
        G.state.heroes.push(h);
        assignToParty(h.uid, party.id);
      }
      party.lastRun = { dungeonId: 'mines', tier: 1 };
      party.autoRedeploy = true;   // opted in, one party at a time
      made.push(party.id);
    }
    refreshSheets();
    return made;
  });
}

export default async function run(browser) {
  suite('auto-redeploy');
  const { page, errors } = await openGame(browser, { name: 'Redeploy' });

  await test('a party that opted out is never sent', async () => {
    const ids = await twoParties(page);
    const r = await page.evaluate(async ([first, second]) => {
      const { G } = await import('./src/state.js');
      const { dispatch } = await import('./src/expedition.js');
      G.state.parties.find((p) => p.id === first).autoRedeploy = false;
      // One charter, and it is free: only the opted-in party should take it.
      const { handleRedeployForTest } = await import('./src/game.js');
      handleRedeployForTest();
      return G.state.expeditions.map((e) => e.partyId);
    }, ids);
    eq(r.length, 1, 'expeditions started');
    eq(r[0], ids[1], 'the opted-in party should be the one sent');
    return 'only the party that asked for it went out';
  });

  await test('a party keeps going on its own without disturbing the others', async () => {
    const ids = await twoParties(page);
    const r = await page.evaluate(async ([first, second]) => {
      const { G } = await import('./src/state.js');
      const { tickAll } = await import('./src/expedition.js');
      const { handleRedeployForTest } = await import('./src/game.js');
      // Only the second party asked to keep going.
      G.state.parties.find((p) => p.id === first).autoRedeploy = false;
      G.state.parties.find((p) => p.id === second).autoRedeploy = true;
      const sent = [];
      for (let cycle = 0; cycle < 5; cycle++) {
        handleRedeployForTest();
        const run_ = G.state.expeditions[0];
        if (!run_) break;
        sent.push(run_.partyId);
        for (let i = 0; i < 4000 && G.state.expeditions.length; i++) tickAll(0.1);
        for (const h of G.state.heroes) h.stamina = 100;   // rested, as they would be
      }
      return { sent, second };
    }, ids);
    ok(r.sent.length >= 3, `only ${r.sent.length} expeditions were dispatched`);
    ok(r.sent.every((id) => id === r.second),
      'a party that was not asked to keep going was sent anyway');
    return `${r.sent.length} runs, all by the party that asked for them`;
  });

  await test('a party already in the field is not sent again', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { handleRedeployForTest } = await import('./src/game.js');
      const before = G.state.expeditions.length;
      handleRedeployForTest();
      handleRedeployForTest();
      const ids = G.state.expeditions.map((e) => e.partyId);
      return { before, after: ids.length, unique: new Set(ids).size };
    });
    eq(r.after, r.unique, 'a party was dispatched twice at once');
    return `${r.after} expedition(s), no duplicates`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
