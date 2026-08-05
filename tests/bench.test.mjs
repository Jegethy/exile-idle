// The bench: changing a party without leaving the Parties tab.
//
// This exists because contracts can ban a class, which turns swapping heroes
// from a one-off into a routine part of choosing what to run. Doing it through
// the hero sheet took seven interactions across three tabs.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Puts the guild in a known shape: n heroes, the first three in a party. */
async function setup(page, extra = 3) {
  await page.evaluate(async (n) => {
    const { G } = await import('./src/state.js');
    const { rollHero, removeFromParty, assignToParty } = await import('./src/heroes.js');
    const { refreshSheets } = await import('./src/sheets.js');
    const { ui } = await import('./src/ui/state.js');
    while (G.state.expeditions.length) G.state.expeditions.pop();
    ui.benchTarget = null;
    for (const h of G.state.heroes) removeFromParty(h.uid);
    // Back to one party. An earlier test creates a second, and a spare empty
    // party is somewhere the bench can legitimately add to — which quietly
    // invalidated the "no room anywhere" cases below.
    G.state.parties.length = 1;
    G.state.parties[0].members.length = 0;
    // Keep the three starters, add a few spares to sit on the bench.
    G.state.heroes.length = 3;
    for (let i = 0; i < n; i++) {
      const h = rollHero({ classId: ['cleric', 'archer', 'paladin'][i % 3], rarity: 'common' });
      h.stamina = 100;
      G.state.heroes.push(h);
    }
    for (const h of G.state.heroes.slice(0, 3)) assignToParty(h.uid, G.state.parties[0].id);
    refreshSheets();
    const { renderParties } = await import('./src/ui/parties.js');
    renderParties();
  }, extra);
}

export default async function run(browser) {
  suite('bench');
  const { page, errors } = await openGame(browser, { name: 'Bench' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
    const { gotoTab } = await import('./src/ui/shell.js');
    gotoTab('parties');
  });

  await test('everyone unassigned appears on the bench', async () => {
    await setup(page, 3);
    const r = await page.evaluate(() => ({
      benched: document.querySelectorAll('#benchPanel [data-add]').length,
      inParty: document.querySelectorAll('#partyList .pm').length,
    }));
    eq(r.benched, 3, `${r.benched} heroes on the bench`);
    eq(r.inParty, 3, `${r.inParty} heroes in the party`);
    return `${r.inParty} in the party, ${r.benched} on the bench`;
  });

  await test('one click moves a hero off the bench and into a party', async () => {
    await setup(page, 3);
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      // Make room first, so the party is not already full.
      document.querySelector('#partyList [data-bench]').click();
      const btn = document.querySelector('#benchPanel [data-add]:not([disabled])');
      const uidStr = btn.dataset.add;
      btn.click();
      const hero = G.state.heroes.find((h) => h.uid === uidStr);
      return {
        joined: hero.partyId === G.state.parties[0].id,
        members: G.state.parties[0].members.length,
        stillBenched: !!document.querySelector(`#benchPanel [data-add="${uidStr}"]`),
      };
    });
    ok(r.joined, 'the hero did not join the party');
    eq(r.members, 3, `party has ${r.members} members`);
    ok(!r.stillBenched, 'the hero is still shown on the bench');
    return 'one click, hero moved';
  });

  await test('one click sends a hero the other way', async () => {
    await setup(page, 3);
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const before = G.state.parties[0].members.length;
      document.querySelector('#partyList [data-bench]').click();
      return {
        before,
        after: G.state.parties[0].members.length,
        benched: document.querySelectorAll('#benchPanel [data-add]').length,
      };
    });
    eq(r.after, r.before - 1, 'the hero was not removed from the party');
    eq(r.benched, 4, `${r.benched} on the bench after removing one`);
    return `${r.before} -> ${r.after} in the party`;
  });

  await test('clicking a party chooses where the bench adds', async () => {
    await setup(page, 3);
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createParty } = await import('./src/heroes.js');
      const second = createParty('Second Company');
      const { renderParties } = await import('./src/ui/parties.js');
      renderParties();
      document.querySelector(`[data-party-card="${second.id}"]`).click();
      const marked = document.querySelectorAll('#partyList .party-card.target').length;
      const btn = document.querySelector('#benchPanel [data-add]:not([disabled])');
      const uidStr = btn.dataset.add;
      btn.click();
      const hero = G.state.heroes.find((h) => h.uid === uidStr);
      return { marked, wentTo: hero.partyId === second.id, secondId: second.id };
    });
    eq(r.marked, 1, `${r.marked} parties marked as the target`);
    ok(r.wentTo, 'the hero joined the wrong party');
    return 'the selected party receives them';
  });

  await test('a full party cannot take more, and says so', async () => {
    await setup(page, 4);
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { assignToParty } = await import('./src/heroes.js');
      const { renderParties } = await import('./src/ui/parties.js');
      // Fill the only party to five.
      for (const h of G.state.heroes) assignToParty(h.uid, G.state.parties[0].id);
      renderParties();
      const full = G.state.parties[0].members.length;
      const disabled = [...document.querySelectorAll('#benchPanel [data-add]')]
        .every((b) => b.disabled);
      const label = document.querySelector('#partyList .party-top .hint')?.textContent ?? '';
      return { full, disabled, benched: G.state.heroes.filter((h) => !h.partyId).length, label };
    });
    eq(r.full, 5, `party holds ${r.full}`);
    ok(r.benched > 0, 'nobody was left over to test with');
    ok(r.disabled, 'the bench offered to add to a full party');
    ok(r.label.includes('full'), `the party does not say it is full: "${r.label.trim()}"`);
    return `5/5, ${r.benched} left on the bench, all disabled`;
  });

  await test('a party in the field cannot be edited', async () => {
    await setup(page, 3);
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch } = await import('./src/expedition.js');
      const { renderParties } = await import('./src/ui/parties.js');
      dispatch(G.state.parties[0].id, 'mines', 1);
      renderParties();
      return {
        dispatched: G.state.expeditions.length,
        removeButtons: document.querySelectorAll('#partyList [data-bench]').length,
        addable: document.querySelectorAll('#benchPanel [data-add]:not([disabled])').length,
      };
    });
    eq(r.dispatched, 1, 'the party did not go out');
    eq(r.removeButtons, 0, 'a deployed party still offers to bench its members');
    eq(r.addable, 0, 'the bench offered to add to a party in the field');
    return 'no edits while they are underground';
  });

  await test('the name still opens the hero sheet', async () => {
    await setup(page, 3);
    const r = await page.evaluate(async () => {
      const { closeModals } = await import('./src/ui/modals.js');
      closeModals();
      document.querySelector('#partyList .pm-name').click();
      const modal = document.querySelector('#modalHero');
      const open = modal && !modal.classList.contains('hidden');
      closeModals();
      return { open };
    });
    ok(r.open, 'clicking a party member no longer opens their sheet');
    return 'still one click to the full sheet';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
