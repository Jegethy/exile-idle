// Stamina is a pool with a floor, not a cooldown.
//
// It used to be the latter by accident. A party on auto-redeploy spent down to
// nothing once and then bounced between zero and the price of a single run
// forever: measured over twenty simulated minutes at Tier 6, thirty-nine
// consecutive expeditions with the bar never once above 15 of 100. Eighty-five
// percent of the pool was unreachable, and Guild Quarters — the upgrade whose
// entire purpose is stamina recovery — bought a slightly shorter seventeen
// second wait rather than anything a player would notice.
//
// The rule now: a hero who cannot afford to repeat what they just did is spent,
// and rests all the way back to full before going anywhere. Both halves matter
// and both are tested here, because either one alone restores the sawtooth —
// blocking without the full-rest requirement just moves the bounce, and the
// full-rest requirement without the block is unenforced.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/**
 * Installs a party builder in the page.
 *
 * Armed, which matters more than it sounds: an unarmed party at Tier 6 took
 * three hundred simulated seconds per expedition and the throughput tests
 * measured the length of a fight rather than the length of a rest.
 */
async function installBuilder(page) {
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    const { rollHero, createParty, assignToParty, BASE_STAMINA } = await import('./src/heroes.js');
    const { refreshSheets } = await import('./src/sheets.js');
    const { createItem } = await import('./src/items.js');
    const { CLASS_BY_ID } = await import('./src/data/heroclasses.js');
    const { BASE_BY_ID } = await import('./src/data/bases.js');

    window.__party = () => {
      G.state.progress.highestTier = 20;
      G.state.heroes.length = 0;
      G.state.parties.length = 0;
      while (G.state.expeditions.length) G.state.expeditions.pop();
      const party = createParty('Test Company');
      for (const classId of ['warrior', 'cleric', 'bard', 'rogue', 'wizard']) {
        const h = rollHero({ classId, rarity: 'rare', level: 60 });
        h.traits = [];                     // Tireless would skew every cost here
        h.stamina = BASE_STAMINA;
        const prefers = CLASS_BY_ID[classId].prefers ?? ['sword1h'];
        const weapon = prefers.find((x) => BASE_BY_ID[x]?.slot === 'weapon') ?? 'sword1h';
        h.equipment.weapon = createItem({ baseId: weapon, ilvl: 60, rarity: 'rare' });
        h.equipment.body = createItem({ baseId: 'body_arev', ilvl: 60, rarity: 'rare' });
        G.state.heroes.push(h);
        assignToParty(h.uid, party.id);
      }
      refreshSheets();
      return party.id;
    };
  });
}

const fresh = (page) => page.evaluate(() => window.__party());

export default async function run(browser) {
  suite('stamina');
  const { page, errors } = await openGame(browser, { name: 'Stamina' });
  await page.evaluate(async () => { (await import('./src/state.js')).G.paused = true; });
  await installBuilder(page);

  await test('running out latches a hero into resting', async () => {
    const pid = await fresh(page);
    const r = await page.evaluate(async (id) => {
      const { G } = await import('./src/state.js');
      const { partyById, partyMembers, staminaCostFor } = await import('./src/heroes.js');
      const { staminaCost } = await import('./src/data/dungeons.js');
      const { dispatch } = await import('./src/expedition.js');
      const party = partyById(id);
      const members = partyMembers(party);
      const cost = staminaCost(6);

      // Exactly enough for one more run, and not a point over.
      for (const h of members) h.stamina = staminaCostFor(h, cost);
      const before = members.map((h) => !!h.resting);
      const sent = dispatch(id, 'mines', 6);
      return {
        sent: sent.ok,
        before: before.some(Boolean),
        after: members.every((h) => h.resting),
        left: Math.round(Math.max(...members.map((h) => h.stamina))),
      };
    }, pid);
    ok(r.sent, 'a party with exactly enough stamina was refused');
    eq(r.before, false, 'somebody was already resting before the run');
    ok(r.after, 'spending the last of the pool did not latch anyone into resting');
    eq(r.left, 0, `${r.left} stamina left after spending it all`);
    return 'the last run of the pool leaves the party spent';
  });

  await test('enough for one more run is not enough — only full is', async () => {
    const pid = await fresh(page);
    const r = await page.evaluate(async (id) => {
      const { G } = await import('./src/state.js');
      const {
        partyById, partyMembers, canDispatch, restAll, staminaCostFor, BASE_STAMINA,
      } = await import('./src/heroes.js');
      const { staminaCost } = await import('./src/data/dungeons.js');
      const { dispatch } = await import('./src/expedition.js');
      const party = partyById(id);
      const members = partyMembers(party);
      const cost = staminaCost(6);

      for (const h of members) h.stamina = staminaCostFor(h, cost);
      dispatch(id, 'mines', 6);
      while (G.state.expeditions.length) G.state.expeditions.pop();

      const spent = canDispatch(party, cost).ok;

      // This is the exact state the old behaviour dispatched from, over and
      // over: enough for one run and nothing more. It must still refuse.
      for (const h of members) h.stamina = staminaCostFor(h, cost);
      restAll(0.1);
      const atCost = { ok: canDispatch(party, cost).ok, resting: members.every((h) => h.resting) };

      // One point short of full is still short.
      for (const h of members) h.stamina = BASE_STAMINA - 1;
      restAll(0);
      const nearly = canDispatch(party, cost).ok;

      // And full clears it.
      for (const h of members) h.stamina = BASE_STAMINA;
      restAll(0);
      const full = { ok: canDispatch(party, cost).ok, resting: members.some((h) => h.resting) };
      return { spent, atCost, nearly, full };
    }, pid);
    eq(r.spent, false, 'a spent party could still be dispatched');
    eq(r.atCost.ok, false, 'a resting party dispatched again the moment it could afford one run');
    ok(r.atCost.resting, 'the latch cleared at the price of a single run');
    eq(r.nearly, false, 'a party one point short of full was sent out');
    ok(r.full.ok, 'a fully rested party is still refused');
    eq(r.full.resting, false, 'the latch never cleared at full stamina');
    return 'refused at the cost of a run, refused one point short, allowed at full';
  });

  await test('auto-redeploy goes through the same door', async () => {
    const pid = await fresh(page);
    const r = await page.evaluate(async (id) => {
      const { G } = await import('./src/state.js');
      const { partyById, partyMembers, staminaCostFor } = await import('./src/heroes.js');
      const { staminaCost } = await import('./src/data/dungeons.js');
      const { dispatch } = await import('./src/expedition.js');
      const party = partyById(id);
      const members = partyMembers(party);
      const cost = staminaCost(6);

      for (const h of members) h.stamina = staminaCostFor(h, cost);
      dispatch(id, 'mines', 6);
      while (G.state.expeditions.length) G.state.expeditions.pop();
      party.autoRedeploy = true;
      party.lastRun = { dungeonId: 'mines', tier: 6 };

      // Whatever the automation decides, the dispatch itself is the gate — so
      // there is no route to the field that skips the rest.
      const { redeployOrders } = await import('./src/orders.js');
      const orders = redeployOrders(party);
      const res = dispatch(id, orders.dungeonId, orders.tier, orders.contractId);
      return { ok: res.ok, msg: res.msg, launched: G.state.expeditions.length };
    }, pid);
    eq(r.ok, false, 'auto-redeploy sent a resting party out');
    eq(r.launched, 0, 'an expedition started anyway');
    ok(/resting/i.test(r.msg), `the refusal does not explain itself: "${r.msg}"`);
    return 'refused, and it says why';
  });

  await test('the bar reaches full again instead of sawtoothing', async () => {
    const pid = await fresh(page);
    const r = await page.evaluate(async (id) => {
      const { G } = await import('./src/state.js');
      const { partyById, partyMembers, canDispatch, restAll, BASE_STAMINA } = await import('./src/heroes.js');
      const { staminaCost } = await import('./src/data/dungeons.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const party = partyById(id);
      const hero = partyMembers(party)[0];
      const cost = staminaCost(6);

      let runs = 0;
      let rests = 0;
      let peak = 0;
      let trough = BASE_STAMINA;
      // Long enough to get well past the opening burst, which is where the old
      // behaviour settled into its bounce.
      for (let t = 0; t < 9000; t++) {
        restAll(0.1);
        tickAll(0.1);
        // Sampled here, before the dispatch below spends any of it. Reading the
        // bar after dispatch measures the trough of every cycle and reports the
        // peak as 85 of 100, which is the cost of one run rather than a ceiling.
        if (runs > 3) {
          peak = Math.max(peak, hero.stamina);
          trough = Math.min(trough, hero.stamina);
        }
        if (!G.state.expeditions.length && canDispatch(party, cost).ok) {
          dispatch(id, 'mines', 6);
          runs++;
        }
        if (hero.resting) rests++;
      }
      return {
        runs,
        peak: Math.round(peak),
        trough: Math.round(trough),
        restShare: Math.round((rests / 9000) * 100),
        cost,
      };
    }, pid);
    ok(r.runs > 5, `only ${r.runs} expeditions ran`);
    // The old behaviour pinned this at the price of one run — 15 of 100.
    ok(r.peak >= 95,
      `after the opening burst the bar never got above ${r.peak} of 100 (a run costs ${r.cost}) `
      + '— that is the sawtooth, not a pool');
    // Not zero: six runs at fifteen leaves ten, and ten is already too few for
    // a seventh. "Spent" means cannot afford another, not exactly empty.
    ok(r.trough < r.cost,
      `the pool bottomed at ${r.trough} with a run costing ${r.cost} — it was never spent`);
    ok(r.peak - r.trough >= 80,
      `the bar only ever moved through ${r.peak - r.trough} of 100`);
    ok(r.restShare > 10, `the party only rested ${r.restShare}% of the time`);
    return `${r.runs} runs cycling ${r.trough}–${r.peak} of 100, resting ${r.restShare}% of the time`;
  });

  await test('Guild Quarters buys back the downtime', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { partyById, canDispatch, restAll } = await import('./src/heroes.js');
      const { staminaCost } = await import('./src/data/dungeons.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');

      const throughput = (rank) => {
        const id = window.__party();
        G.state.upgrades.quarters = rank;
        const party = partyById(id);
        const cost = staminaCost(6);
        let runs = 0;
        for (let t = 0; t < 9000; t++) {
          restAll(0.1);
          tickAll(0.1);
          if (!G.state.expeditions.length && canDispatch(party, cost).ok) {
            dispatch(party.id, 'mines', 6);
            runs++;
          }
        }
        return runs;
      };
      const none = throughput(0);
      const maxed = throughput(15);
      G.state.upgrades.quarters = 0;
      return { none, maxed };
    });
    // The upgrade the player complained about. It used to shave a few seconds
    // off a wait nobody could see; it now decides how much of the guild's day
    // is spent in the field.
    ok(r.maxed > r.none * 1.2,
      `Guild Quarters at full rank ran ${r.maxed} expeditions against ${r.none} unbought `
      + '— under a fifth better is not worth fifteen ranks');
    return `${r.none} runs unbought, ${r.maxed} at rank 15 — `
      + `${Math.round(((r.maxed - r.none) / r.none) * 100)}% more expeditions`;
  });

  await test('the Reserve Roster relieves a hero who is resting', async () => {
    const pid = await fresh(page);
    const r = await page.evaluate(async (id) => {
      const { G } = await import('./src/state.js');
      const {
        partyById, partyMembers, rollHero, BASE_STAMINA, staminaCostFor,
      } = await import('./src/heroes.js');
      const { reservesPass } = await import('./src/orders.js');
      const { staminaCost } = await import('./src/data/dungeons.js');
      const cost = staminaCost(6);
      const party = partyById(id);
      const tank = partyMembers(party).find((h) => h.classId === 'warrior');

      // A fresh Warrior on the bench, and a rested one who is nonetheless
      // latched — the latch has to be what the swap reads, not the bar.
      const relief = rollHero({ classId: 'warrior', rarity: 'rare', level: 60 });
      relief.stamina = BASE_STAMINA;
      G.state.heroes.push(relief);

      G.state.guild.level = 30;
      G.state.settings.reserves = true;
      tank.resting = true;
      tank.stamina = BASE_STAMINA - 1;
      ok: {
        // A resting hero on the bench must not be pulled in as relief either.
        const decoy = rollHero({ classId: 'cleric', rarity: 'rare', level: 60 });
        decoy.stamina = BASE_STAMINA;
        decoy.resting = true;
        G.state.heroes.push(decoy);
        const healer = partyMembers(party).find((h) => h.classId === 'cleric');
        healer.resting = true;
        healer.stamina = staminaCostFor(healer, cost);
      }

      const swapped = reservesPass(party, cost);
      const now = partyMembers(party);
      return {
        swapped,
        tankReplaced: now.some((h) => h.uid === relief.uid),
        // The Cleric had only a resting stand-in available, so it stays put.
        healerHeld: now.some((h) => h.classId === 'cleric' && h.resting),
      };
    }, pid);
    ok(r.swapped >= 1, 'the Reserve Roster ignored a resting hero');
    ok(r.tankReplaced, 'the rested Warrior never came on');
    ok(r.healerHeld, 'a resting hero was brought in off the bench as relief');
    return 'relieves the spent, and will not field the spent';
  });

  await test('the party card says who is resting and for how long', async () => {
    const pid = await fresh(page);
    const r = await page.evaluate(async (id) => {
      const { G } = await import('./src/state.js');
      const { partyById, partyMembers, staminaCostFor } = await import('./src/heroes.js');
      const { staminaCost } = await import('./src/data/dungeons.js');
      const { dispatch } = await import('./src/expedition.js');
      const { renderParties } = await import('./src/ui/parties.js');
      const { renderDispatch, updateDispatchButtons } = await import('./src/ui/expeditions.js');
      const { gotoTab } = await import('./src/ui/shell.js');
      const { ui } = await import('./src/ui/state.js');

      const party = partyById(id);
      const members = partyMembers(party);
      const cost = staminaCost(6);
      for (const h of members) h.stamina = staminaCostFor(h, cost);
      dispatch(id, 'mines', 6);
      while (G.state.expeditions.length) G.state.expeditions.pop();

      gotoTab('parties');
      renderParties();
      const banner = document.querySelector('.party-resting');

      gotoTab('expeditions');
      ui.dispatchTier = 6;
      renderDispatch();
      updateDispatchButtons();
      const btn = document.querySelector(`#dispatchPanel [data-send="${id}"]`);
      return {
        banner: !!banner,
        text: banner?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        named: banner ? members.some((h) => banner.textContent.includes(h.name)) : false,
        btnDisabled: !!btn?.disabled,
        btnWhy: btn?.title ?? '',
      };
    }, pid);
    ok(r.banner, 'a resting party says nothing about why it will not go');
    ok(r.named, 'the banner does not name who is resting');
    ok(/ready in/i.test(r.text), `the banner gives no countdown: "${r.text}"`);
    ok(/full/i.test(r.text), 'the banner does not explain that rest goes all the way to full');
    ok(r.btnDisabled, 'the dispatch button is still live for a resting party');
    ok(/resting/i.test(r.btnWhy), `the disabled button explains nothing: "${r.btnWhy}"`);
    return 'named, explained and counted down on the card and the button';
  });

  await test('no page errors', async () => {
    eq(errors.length, 0, errors.join(' | '));
    return 'no page errors';
  });

  clean(page);
}
