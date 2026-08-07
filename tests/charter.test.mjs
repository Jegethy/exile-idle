// The Guild Charter: what Guild Level is for.
//
// Two things are worth guarding here, and they are not the obvious ones.
//
// The first is that nothing was *taken away*. Every privilege is new
// capability, so a guild at level 1 must still be able to do everything it
// could do before the Charter existed. A test that only checks the unlocks
// work would happily pass while level 1 lost the recruit board.
//
// The second is that no automation reaches past a wall the player would have
// hit. Push Orders cannot open a locked tier, Standing Seals cannot spend a
// contract the party is barred from, Reserve Roster cannot field somebody who
// is already out. Automation that can do more than you can is a second player.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Puts the guild at a guild level, and sweeps so the grants are recorded. */
async function atLevel(page, level, settings = {}) {
  await page.evaluate(async ([lvl, set]) => {
    const { G } = await import('./src/state.js');
    const { checkCharter } = await import('./src/charter.js');
    G.state.guild.level = lvl;
    G.state.charter = { granted: {} };
    Object.assign(G.state.settings, set);
    checkCharter(true);
  }, [level, settings]);
}

export default async function run(browser) {
  suite('charter');
  const { page, errors } = await openGame(browser, { name: 'Charter' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  // -------------------------------------------------------------------------
  // The ladder itself
  // -------------------------------------------------------------------------

  await test('the ladder is well formed and spans the game', async () => {
    const r = await page.evaluate(async () => {
      const { PRIVILEGES } = await import('./src/data/charter.js');
      const { ICON_IDS } = await import('./src/ui/icons.js');
      const known = new Set(ICON_IDS);
      const ids = new Set();
      const problems = [];
      let last = 0;
      for (const p of PRIVILEGES) {
        if (ids.has(p.id)) problems.push(`duplicate id ${p.id}`);
        ids.add(p.id);
        if (!known.has(p.icon)) problems.push(`${p.id}: unknown symbol ${p.icon}`);
        if (!p.name || !p.desc) problems.push(`${p.id}: missing name or description`);
        if (p.level < last) problems.push(`${p.id}: out of order`);
        if (p.level < 2) problems.push(`${p.id}: granted before the guild has done anything`);
        last = p.level;
      }
      return {
        problems, count: PRIVILEGES.length, first: PRIVILEGES[0].level, last,
        automations: PRIVILEGES.filter((p) => p.switchable).length,
      };
    });
    eq(r.problems.length, 0, r.problems.slice(0, 4).join('; '));
    ok(r.count >= 12, `only ${r.count} privileges`);
    ok(r.last >= 25, `the ladder ends at level ${r.last} — too early to carry the deep game`);
    return `${r.count} privileges, levels ${r.first} to ${r.last}, ${r.automations} switchable`;
  });

  await test('a level 1 guild can still do everything it could before', async () => {
    await atLevel(page, 1);
    const r = await page.evaluate(async () => {
      const { recruitBoard } = await import('./src/heroes.js');
      const { contractCap, offlineHours, recruitBoardSize, hasPrivilege } = await import('./src/charter.js');
      const { PRIVILEGES } = await import('./src/data/charter.js');
      return {
        board: recruitBoard().candidates.length,
        boardSize: recruitBoardSize(),
        cap: contractCap(),
        hours: offlineHours(),
        held: PRIVILEGES.filter((p) => hasPrivilege(p.id)).length,
      };
    });
    eq(r.held, 0, `a fresh guild already holds ${r.held} privileges`);
    eq(r.boardSize, 3, 'the recruit board is not the size it always was');
    ok(r.board >= 3, `the hiring hall shows ${r.board} candidates`);
    eq(r.cap, 16, 'the contract board changed size for a guild with no charter');
    eq(r.hours, 12, 'offline progress changed for a guild with no charter');
    return 'board 3, contracts 16, offline 12h — unchanged';
  });

  await test('privileges arrive at their levels, and only once', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkCharter, takeCharterPending, hasPrivilege } = await import('./src/charter.js');
      G.state.guild.level = 1;
      G.state.charter = { granted: {} };
      takeCharterPending();
      checkCharter();
      const atOne = takeCharterPending().length;

      G.state.guild.level = 5;
      const granted = checkCharter();
      const announced = takeCharterPending().length;
      const again = checkCharter();
      return {
        atOne, granted: granted.length, announced, again: again.length,
        has2: hasPrivilege('equipBest'), has5: hasPrivilege('salvageSpare'),
        has7: hasPrivilege('boardFour'),
      };
    });
    eq(r.atOne, 0, 'a level 1 guild was granted something');
    eq(r.granted, 3, `${r.granted} privileges at level 5, expected the three at or below it`);
    eq(r.announced, 3, 'the grants were not announced');
    eq(r.again, 0, 'a second sweep granted the same privileges again');
    ok(r.has2 && r.has5, 'a granted privilege does not read as held');
    ok(!r.has7, 'a privilege above the level reads as held');
    return 'three granted at level 5, announced once, never twice';
  });

  await test('an old save is credited quietly for the level it already has', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { backfillCharter, takeCharterPending } = await import('./src/charter.js');
      G.state.guild.level = 20;
      G.state.charter = { granted: {} };
      takeCharterPending();
      const gained = backfillCharter();
      return { gained, announced: takeCharterPending().length };
    });
    ok(r.gained >= 10, `only ${r.gained} privileges credited to a level 20 guild`);
    eq(r.announced, 0, 'a loaded save raised toasts for privileges it earned last week');
    return `${r.gained} credited, none announced`;
  });

  // -------------------------------------------------------------------------
  // Capacity
  // -------------------------------------------------------------------------

  await test('the ceilings move, and the higher privilege wins', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { offlineHours, recruitBoardSize, contractCap } = await import('./src/charter.js');
      const out = {};
      for (const lvl of [1, 9, 19, 24]) {
        G.state.guild.level = lvl;
        out[lvl] = {
          hours: offlineHours(), board: recruitBoardSize(), cap: contractCap(),
        };
      }
      return out;
    });
    eq(r[1].hours, 12, 'offline hours at level 1');
    eq(r[9].hours, 18, 'The Longer Watch did not extend offline progress');
    eq(r[24].hours, 24, 'The Long Watch did not win over the earlier one');
    eq(r[19].board, 5, 'Open Doors did not widen the hiring hall');
    eq(r[19].cap, 24, 'the Sealed Archive did not widen the contract board');
    return '12h → 18h → 24h, board 3 → 5, contracts 16 → 24';
  });

  await test('a wider board adds a candidate rather than replacing the lot', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { recruitBoard } = await import('./src/heroes.js');
      G.state.guild.level = 1;
      G.state.recruits = { candidates: [], locked: [], rerolls: 0 };
      const before = recruitBoard().candidates.map((h) => h.uid);
      G.state.guild.level = 7;
      const after = recruitBoard().candidates.map((h) => h.uid);
      return {
        before: before.length,
        after: after.length,
        kept: before.every((u) => after.includes(u)),
      };
    });
    eq(r.before, 3, 'the board did not start at three');
    eq(r.after, 4, `the board holds ${r.after} after Word of Mouth`);
    ok(r.kept, 'widening the board replaced the candidates already standing on it');
    return 'three became four, and the original three stayed';
  });

  // -------------------------------------------------------------------------
  // The outfitter
  // -------------------------------------------------------------------------

  await test('Best Gear fills empty slots from the vault', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { gearUpHero } = await import('./src/outfit.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const hero = G.state.heroes[0];
      for (const slot of EQUIP_SLOTS) hero.equipment[slot] = null;
      G.state.vault.length = 0;
      for (const baseId of ['sword1h', 'helm_ar', 'body_arev', 'glove_ar', 'boot_ev', 'ring', 'ring', 'amulet']) {
        G.state.vault.push(createItem({ baseId, ilvl: 20, rarity: 'rare' }));
      }
      refreshSheets();
      const before = G.sheets[hero.uid].dps;
      const filled = gearUpHero(hero.uid);
      const worn = EQUIP_SLOTS.filter((s) => hero.equipment[s]).length;
      return { filled, worn, before, after: G.sheets[hero.uid].dps, left: G.state.vault.length };
    });
    ok(r.filled >= 6, `only ${r.filled} slots were filled`);
    ok(r.worn >= 6, `${r.worn} slots worn after gearing up`);
    ok(r.after > r.before, 'gearing up did not make the hero stronger');
    return `${r.filled} slots filled, ${r.left} items left in the vault`;
  });

  await test('Best Gear never takes a locked item', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { gearUpHero } = await import('./src/outfit.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const hero = G.state.heroes[0];
      for (const slot of EQUIP_SLOTS) hero.equipment[slot] = null;
      G.state.vault.length = 0;
      // A blank base is the thing this rule exists for: Normal rarity, item
      // level 120, locked, and the most valuable object in the game.
      const blank = createItem({ baseId: 'sword1h', ilvl: 120, rarity: 'normal' });
      blank.locked = true;
      G.state.vault.push(blank);
      G.state.vault.push(createItem({ baseId: 'sword1h', ilvl: 10, rarity: 'normal' }));
      gearUpHero(hero.uid);
      return {
        wearing: hero.equipment.weapon?.ilvl ?? 0,
        stillVaulted: G.state.vault.some((i) => i.uid === blank.uid),
      };
    });
    ok(r.stillVaulted, 'the outfitter equipped a locked blank base');
    ok(r.wearing !== 120, 'the hero is wearing the locked item');
    return 'the ilvl 120 blank stayed in the vault, the ordinary sword was taken';
  });

  await test('a two-handed weapon is judged against the pair it replaces', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { bestPlacement } = await import('./src/outfit.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { heroStats, sheetScore } = await import('./src/stats.js');
      // A tank, so the shield in the off hand is worth a great deal.
      const hero = G.state.heroes.find((h) => h.classId === 'warrior');
      for (const slot of EQUIP_SLOTS) hero.equipment[slot] = null;
      hero.equipment.weapon = createItem({ baseId: 'sword1h', ilvl: 40, rarity: 'rare' });
      hero.equipment.offhand = createItem({ baseId: 'shield_str', ilvl: 40, rarity: 'rare' });
      const twoHander = createItem({ baseId: 'sword2h', ilvl: 40, rarity: 'rare' });
      const place = bestPlacement(hero, twoHander, G.state.upgrades);
      // What a naive slot-only comparison would have said: swap the weapon and
      // pretend the shield stays on.
      const naive = { ...hero.equipment, weapon: twoHander };
      const withShield = sheetScore(heroStats({ ...hero, equipment: naive }, G.state.upgrades));
      const honest = { ...naive, offhand: null };
      const noShield = sheetScore(heroStats({ ...hero, equipment: honest }, G.state.upgrades));
      return { gain: place?.gain ?? 0, withShield, noShield };
    });
    ok(r.withShield > r.noShield, 'the setup did not give the shield any value');
    // The honest score is the one without the shield, so the reported gain must
    // reflect that rather than the inflated keep-the-shield figure.
    ok(r.gain < 1, `a two-hander reported a gain of ${(r.gain * 100).toFixed(0)}%`);
    return `scored without the shield it displaces (${r.withShield.toFixed(0)} vs ${r.noShield.toFixed(0)})`;
  });

  await test('Best Gear never leaves a hero holding a shield and no weapon', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { gearUpHero } = await import('./src/outfit.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { refreshSheets } = await import('./src/sheets.js');

      // The reported case: a tank holding a two-hander, a very good shield in
      // the vault, and a weapon it could have taken instead. Planning the hands
      // one slot at a time put the shield on, which emptied the main hand, and
      // nothing put a weapon back.
      const hero = G.state.heroes.find((h) => h.classId === 'warrior')
        ?? G.state.heroes[0];
      for (const slot of EQUIP_SLOTS) hero.equipment[slot] = null;
      hero.equipment.weapon = createItem({ baseId: 'sword2h', ilvl: 20, rarity: 'normal' });
      G.state.vault.length = 0;
      G.state.vault.push(createItem({ baseId: 'shield_str', ilvl: 80, rarity: 'rare' }));
      G.state.vault.push(createItem({ baseId: 'sword1h', ilvl: 80, rarity: 'rare' }));
      refreshSheets();

      gearUpHero(hero.uid, { quiet: true });
      return {
        weapon: hero.equipment.weapon?.baseId ?? null,
        offhand: hero.equipment.offhand?.baseId ?? null,
      };
    });
    ok(r.weapon, `the hero ended up with no weapon at all (off hand: ${r.offhand})`);
    return `ended up with ${r.weapon} and ${r.offhand ?? 'nothing'} in the off hand`;
  });

  await test('a Rogue is geared with two weapons and no shield', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { gearUpHero } = await import('./src/outfit.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');

      const hero = rollHero({ classId: 'rogue', rarity: 'common' });
      hero.level = 30;
      G.state.heroes.push(hero);
      for (const slot of EQUIP_SLOTS) hero.equipment[slot] = null;
      G.state.vault.length = 0;
      // A shield and a two-hander that are, on raw numbers, far better than the
      // daggers. Neither may be worn, so neither may be chosen.
      G.state.vault.push(createItem({ baseId: 'shield_dex', ilvl: 100, rarity: 'rare' }));
      G.state.vault.push(createItem({ baseId: 'sword2h', ilvl: 100, rarity: 'rare' }));
      G.state.vault.push(createItem({ baseId: 'dagger', ilvl: 30, rarity: 'rare' }));
      G.state.vault.push(createItem({ baseId: 'dagger', ilvl: 30, rarity: 'rare' }));
      refreshSheets();

      gearUpHero(hero.uid, { quiet: true });
      return {
        weapon: hero.equipment.weapon?.baseId ?? null,
        offhand: hero.equipment.offhand?.baseId ?? null,
      };
    });
    eq(r.weapon, 'dagger', `main hand holds ${r.weapon}`);
    eq(r.offhand, 'dagger', `off hand holds ${r.offhand}`);
    return 'two daggers, and the better shield and two-hander left alone';
  });

  await test('Gear Up spreads the vault across the party, not down it', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { gearUpParty } = await import('./src/outfit.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { rollHero, removeFromParty, assignToParty } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');

      while (G.state.expeditions.length) G.state.expeditions.pop();
      for (const h of G.state.heroes) removeFromParty(h.uid);
      G.state.heroes.length = 0;
      const party = G.state.parties[0];
      party.members.length = 0;

      // Four identical heroes, so any imbalance in the result is the
      // allocation's doing and nothing else.
      for (let i = 0; i < 4; i++) {
        const h = rollHero({ classId: 'archer', rarity: 'common' });
        h.level = 30;
        h.traits = [];
        for (const slot of EQUIP_SLOTS) h.equipment[slot] = null;
        G.state.heroes.push(h);
        assignToParty(h.uid, party.id);
      }

      // Exactly one body armour each, at four wildly different item levels.
      // Handed out hero by hero, the first would take all four in turn and end
      // up wearing the best; the rest would get nothing.
      G.state.vault.length = 0;
      for (const ilvl of [80, 60, 40, 20]) {
        G.state.vault.push(createItem({ baseId: 'body_arev', ilvl, rarity: 'rare' }));
      }
      refreshSheets();

      const res = gearUpParty(party.id);
      const wearing = G.state.heroes.map((h) => h.equipment.body?.ilvl ?? 0).sort((a, b) => b - a);
      return { res, wearing, dressed: wearing.filter(Boolean).length };
    });
    eq(r.dressed, 4, `only ${r.dressed} of four heroes ended up wearing body armour`);
    eq(r.wearing.join(','), '80,60,40,20', `armour landed as ${r.wearing.join(',')}`);
    eq(r.res.heroes, 4, `${r.res.heroes} heroes were touched`);
    ok(r.res.dps > 1 || r.res.life > 1, 'the party got no stronger');
    return `one each, and the report reads damage x${r.res.dps.toFixed(2)}, life x${r.res.life.toFixed(2)}`;
  });

  await test('a unique goes to whoever it helps most', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { planParty } = await import('./src/outfit.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const { UNIQUES } = await import('./src/data/uniques.js');

      // A tank and a damage class, both bare. A heavy shield is worth a great
      // deal to one and very little to the other.
      const tank = rollHero({ classId: 'guardian', rarity: 'common' });
      const dps = rollHero({ classId: 'wizard', rarity: 'common' });
      for (const h of [tank, dps]) {
        h.level = 30; h.traits = [];
        for (const slot of EQUIP_SLOTS) h.equipment[slot] = null;
      }
      // One shield, and a weapon apiece. Without a weapon for the tank the
      // wizard is simply the hungrier hero and takes both hands, which is the
      // allocation working rather than failing -- but it is not what this
      // test is about.
      const shield = createItem({ baseId: 'shield_str', ilvl: 70, rarity: 'rare' });
      const wand = createItem({ baseId: 'wand', ilvl: 70, rarity: 'rare' });
      const mace = createItem({ baseId: 'mace1h', ilvl: 70, rarity: 'rare' });
      const pool = [shield, wand, mace];
      refreshSheets();

      const moves = planParty([dps, tank], pool, G.state.upgrades);
      const who = (uid) => moves.find((m) => m.itemUid === uid)?.heroUid ?? null;
      return {
        shieldTo: who(shield.uid) === tank.uid ? 'tank' : who(shield.uid) === dps.uid ? 'dps' : 'nobody',
        uniqueCount: UNIQUES.length,
      };
    });
    // The damage class is listed first on purpose: order must not decide it.
    eq(r.shieldTo, 'tank', `the shield went to the ${r.shieldTo}`);
    return 'the shield went to the tank even though the wizard bid first';
  });

  // -------------------------------------------------------------------------
  // Automations
  // -------------------------------------------------------------------------

  await test('an unlocked automation stays off until it is switched on', async () => {
    await atLevel(page, 30);
    const r = await page.evaluate(async () => {
      const { automationOn, hasPrivilege } = await import('./src/charter.js');
      const { PRIVILEGES } = await import('./src/data/charter.js');
      const switchable = PRIVILEGES.filter((p) => p.switchable);
      return {
        held: switchable.filter((p) => hasPrivilege(p.id)).length,
        running: switchable.filter((p) => automationOn(p.id)).length,
        total: switchable.length,
      };
    });
    eq(r.held, r.total, 'a level 30 guild does not hold every switchable privilege');
    eq(r.running, 0, `${r.running} automations started themselves without being asked`);
    return `${r.held} unlocked, none running until asked`;
  });

  await test('Discerning Eye keeps what improves somebody and bins what does not', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      G.state.guild.level = 5;
      Object.assign(G.state.settings, {
        autoSalvageNormal: false, autoSalvageMagic: false, autoSalvageRare: false,
        salvageSpare: true,
      });
      // Everyone in good gear, so a poor drop improves nobody.
      for (const hero of G.state.heroes) {
        for (const slot of EQUIP_SLOTS) {
          if (slot === 'offhand') continue;
          const baseId = { weapon: 'sword1h', helmet: 'helm_ar', body: 'body_arev', gloves: 'glove_ar', boots: 'boot_ev', amulet: 'amulet', ring1: 'ring', ring2: 'ring' }[slot];
          if (baseId) hero.equipment[slot] = createItem({ baseId, ilvl: 60, rarity: 'rare' });
        }
      }
      refreshSheets();
      G.state.vault.length = 0;
      const junk = addToVault(createItem({ baseId: 'sword1h', ilvl: 2, rarity: 'normal' }));
      const good = addToVault(createItem({ baseId: 'sword1h', ilvl: 120, rarity: 'rare' }));
      return { junk, good, vault: G.state.vault.length };
    });
    eq(r.junk, 'salvaged', `a drop that improves nobody was ${r.junk}`);
    eq(r.good, 'added', `a drop that would re-arm somebody was ${r.good}`);
    return 'the ilvl 2 sword was salvaged, the ilvl 120 one was kept';
  });

  await test('Standing Accounts buys the cheapest rank, and leaves a reserve', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { autoUpgradePass, cheapestUpgrade } = await import('./src/orders.js');
      G.state.guild.level = 15;
      G.state.settings.standingAccounts = true;
      G.state.upgrades = {};
      const next = cheapestUpgrade(G.state);
      // Enough for one but not twice over: the reserve rule should refuse.
      G.state.guild.gold = Math.floor(next.cost.amount * 1.5);
      const refused = autoUpgradePass(99);
      G.state.guild.gold = next.cost.amount * 4;
      const bought = autoUpgradePass(99);
      return {
        id: next.id, kind: next.cost.kind, refused, bought,
        rank: G.state.upgrades[next.id] ?? 0,
      };
    });
    eq(r.kind, 'gold', 'Standing Accounts would spend crafting materials');
    ok(!r.refused, 'it spent down to nearly nothing rather than keeping a reserve');
    ok(r.bought, 'it bought nothing with four times the price in hand');
    eq(r.rank, 1, `the rank ended at ${r.rank}`);
    return `bought ${r.id} only once gold covered it twice over`;
  });

  await test('Push Orders climbs on a streak and never past a locked tier', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { redeployOrders, noteOutcome, PUSH_STREAK } = await import('./src/orders.js');
      G.state.guild.level = 30;
      G.state.settings.pushOrders = true;
      G.state.settings.autoContract = false;
      G.state.progress.highestTier = 10;
      const party = G.state.parties[0];
      party.lastRun = { dungeonId: 'mines', tier: 8 };
      party.clearStreak = 0;
      party.lastOutcome = null;

      const held = redeployOrders(party).tier;                    // no streak yet
      for (let i = 0; i < PUSH_STREAK; i++) noteOutcome(party, true);
      const climbed = redeployOrders(party).tier;                 // streak met
      noteOutcome(party, false);
      const fell = redeployOrders(party).tier;                    // wiped

      // At the ceiling: one above the deepest ever cleared, and no further.
      party.lastRun = { dungeonId: 'mines', tier: 11 };
      for (let i = 0; i < PUSH_STREAK; i++) noteOutcome(party, true);
      const capped = redeployOrders(party).tier;
      return { held, climbed, fell, capped };
    });
    eq(r.held, 8, 'a party with no streak moved tier');
    eq(r.climbed, 9, `three clean clears took the party to Tier ${r.climbed}`);
    eq(r.fell, 8, `a wipe left the party at Tier ${r.fell}`);
    eq(r.capped, 11, `Push Orders opened Tier ${r.capped} past the deepest cleared + 1`);
    return '8 → 9 on a streak, back to 8 on a wipe, never past the gate';
  });

  await test('Standing Seals only spends a contract the party could have run', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { rollContract } = await import('./src/contracts.js');
      const { contractFor } = await import('./src/orders.js');
      G.state.guild.level = 30;
      G.state.settings.autoContract = true;
      const party = G.state.parties[0];

      // Rolled, then stripped of its modifiers. A freshly rolled contract can
      // carry a class ban, and if it happens to name a class the party is
      // fielding this test measures the ban rather than the matching — which
      // is what made it pass or fail depending on the seed.
      const plain = rollContract(12, 'crypt');
      plain.mods = [];
      G.state.contracts = [plain];
      const wrongPlace = contractFor(party, 'mines', 12);
      const wrongTier = contractFor(party, 'crypt', 14);
      const match = contractFor(party, 'crypt', 12);

      // A contract that bars a class the party is fielding must be left alone —
      // dispatch would refuse it at the door and it would be wasted.
      const banned = rollContract(12, 'mines');
      const cls = G.state.heroes.find((h) => h.partyId === party.id)?.classId;
      banned.mods = [`ban_${cls}`];
      G.state.contracts = [banned];
      const barred = contractFor(party, 'mines', 12);

      G.state.settings.autoContract = false;
      const offSwitch = contractFor(party, 'crypt', 12);
      return {
        wrongPlace: !!wrongPlace, wrongTier: !!wrongTier, match: !!match,
        barred: !!barred, offSwitch: !!offSwitch,
      };
    });
    ok(!r.wrongPlace, 'it offered a contract for a different dungeon');
    ok(!r.wrongTier, 'it offered a contract for a different tier');
    ok(r.match, 'it did not offer a contract that matched the orders exactly');
    ok(!r.barred, 'it would have spent a contract the party is barred from');
    ok(!r.offSwitch, 'it offered a contract with the switch off');
    return 'exact match only, never one the party would be turned away from';
  });

  await test('Reserve Roster relieves the tired and nobody else', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { rollHero, partyMembers, removeFromParty, assignToParty } = await import('./src/heroes.js');
      const { reservesPass } = await import('./src/orders.js');
      G.state.guild.level = 21;
      G.state.settings.reserves = true;

      const party = G.state.parties[0];
      for (const h of G.state.heroes) removeFromParty(h.uid);
      G.state.heroes.length = 0;

      const tired = rollHero({ classId: 'cleric', rarity: 'common' });
      tired.name = 'Tired'; tired.stamina = 1;
      const rested = rollHero({ classId: 'cleric', rarity: 'common' });
      rested.name = 'Rested'; rested.stamina = 100;
      const wrongClass = rollHero({ classId: 'wizard', rarity: 'common' });
      wrongClass.name = 'Wizard'; wrongClass.stamina = 100;
      G.state.heroes.push(tired, rested, wrongClass);
      assignToParty(tired.uid, party.id);

      const swapped = reservesPass(party, 20);
      const after = partyMembers(party).map((h) => h.name);

      // A hero with the stamina for the run is left where they are.
      const swappedAgain = reservesPass(party, 20);
      return { swapped, after, swappedAgain, benchHasTired: tired.partyId === null };
    });
    eq(r.swapped, 1, `${r.swapped} heroes were relieved`);
    ok(r.after.includes('Rested'), `the party is now ${r.after.join(', ')}`);
    ok(r.benchHasTired, 'the exhausted hero was not sent to the bench');
    eq(r.swappedAgain, 0, 'it kept swapping a party that was already rested');
    return 'the exhausted cleric was relieved by the rested one, not by the wizard';
  });

  await test('Standing Kit equips the haul on the party that carried it', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const { clearReports } = await import('./src/reports.js');
      const { EQUIP_SLOTS } = await import('./src/data/bases.js');
      const { createItem } = await import('./src/items.js');

      clearReports();
      while (G.state.expeditions.length) G.state.expeditions.pop();
      G.state.guild.level = 11;
      Object.assign(G.state.settings, {
        autoEquip: true, salvageSpare: false,
        autoSalvageNormal: false, autoSalvageMagic: false, autoSalvageRare: false,
      });
      G.state.vault.length = 0;
      G.state.heroes.length = 0;
      for (const cls of ['guardian', 'cleric', 'rogue']) {
        const h = rollHero({ classId: cls, rarity: 'legendary' });
        h.level = 40; h.stamina = 100;
        // Geared enough to finish, but with the hands and head bare so the
        // haul has somewhere obvious to go.
        h.equipment.weapon = createItem({ baseId: 'sword1h', ilvl: 40, rarity: 'rare' });
        h.equipment.body = createItem({ baseId: 'body_arev', ilvl: 40, rarity: 'rare' });
        G.state.heroes.push(h);
      }
      const party = G.state.parties[0];
      party.members = G.state.heroes.map((h) => h.uid);
      party.autoRedeploy = false;
      refreshSheets();
      G.state.progress.highestTier = 20;

      const before = G.state.heroes
        .reduce((n, h) => n + EQUIP_SLOTS.filter((sl) => h.equipment[sl]).length, 0);
      dispatch(party.id, 'crypt', 8);
      for (let i = 0; i < 6000 && G.state.expeditions.length; i++) tickAll(0.1);
      const after = G.state.heroes
        .reduce((n, h) => n + EQUIP_SLOTS.filter((sl) => h.equipment[sl]).length, 0);
      return { before, after, vault: G.state.vault.length };
    });
    // The ordering matters: until the finished run leaves s.expeditions its own
    // members still read as deployed, so a party would be barred from equipping
    // the gear it had just carried home.
    ok(r.after > r.before, `slots filled went ${r.before} to ${r.after} — the haul was not worn`);
    return `${r.after - r.before} slots equipped straight from the haul, ${r.vault} left in the vault`;
  });

  // -------------------------------------------------------------------------
  // The interface
  // -------------------------------------------------------------------------

  await test('the Guild Hall shows the ladder, held and locked alike', async () => {
    await atLevel(page, 9);
    const r = await page.evaluate(async () => {
      const { renderCharter } = await import('./src/ui/charter.js');
      const { gotoTab } = await import('./src/ui/shell.js');
      const { PRIVILEGES } = await import('./src/data/charter.js');
      gotoTab('hall');
      renderCharter();
      const host = document.querySelector('#charterPanel');
      return {
        cards: host.querySelectorAll('.charter').length,
        held: host.querySelectorAll('.charter.held').length,
        locked: host.querySelectorAll('.charter.locked').length,
        rank: host.querySelector('.rank-value')?.textContent ?? '',
        switches: host.querySelectorAll('[data-charter-set]').length,
        total: PRIVILEGES.length,
      };
    });
    eq(r.cards, r.total, `${r.cards} cards for ${r.total} privileges`);
    eq(r.held, 5, `${r.held} shown as held at guild level 9`);
    ok(r.locked > 0, 'nothing above the current level is shown');
    eq(r.rank, '9', `the panel reads guild level "${r.rank}"`);
    eq(r.switches, 1, `${r.switches} switches shown for the one automation held at level 9`);
    return `${r.cards} rungs shown, ${r.held} held, ${r.locked} still to come`;
  });

  await test('a granted privilege raises a toast', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkCharter, takeCharterPending } = await import('./src/charter.js');
      const { pumpCharterToasts } = await import('./src/ui/charter.js');
      const { pumpToasts, clearToasts } = await import('./src/ui/toast.js');
      const { closeModals } = await import('./src/ui/modals.js');
      closeModals();
      clearToasts(); takeCharterPending();
      G.state.guild.level = 3;
      G.state.charter = { granted: {} };
      checkCharter();
      pumpCharterToasts();
      pumpToasts();
      const toast = document.querySelector('.ach-toast.charter-toast');
      const out = {
        raised: !!toast,
        name: toast?.querySelector('.toast-name')?.textContent ?? '',
        kicker: toast?.querySelector('.toast-kicker')?.textContent ?? '',
        // A privilege carries no points, so no badge should be drawn.
        badge: !!toast?.querySelector('.ach-points'),
        glow: !!toast?.querySelector('.toast-glow'),
        plain: !(toast?.querySelector('.toast-desc')?.textContent ?? '').includes('<'),
      };
      clearToasts();
      return out;
    });
    ok(r.raised, 'no toast for a newly granted privilege');
    ok(r.name.length > 0, 'the toast has no privilege name');
    ok(r.kicker.includes('charter'), `the toast reads "${r.kicker}"`);
    ok(r.glow, 'the toast has no glow');
    ok(!r.badge, 'a privilege toast carries a points badge');
    ok(r.plain, 'the toast description leaked markup');
    return `"${r.name}" announced, no points badge`;
  });

  await test('the buttons appear only once their privilege is held', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { renderParties } = await import('./src/ui/parties.js');
      const { openHeroModal } = await import('./src/ui/roster.js');
      const { closeModals } = await import('./src/ui/modals.js');
      const hero = G.state.heroes[0];

      G.state.guild.level = 1;
      renderParties();
      openHeroModal(hero.uid);
      const before = {
        best: !!document.querySelector('#btnBestGear'),
        party: !!document.querySelector('[data-gearparty]'),
      };
      closeModals();

      G.state.guild.level = 30;
      renderParties();
      openHeroModal(hero.uid);
      const after = {
        best: !!document.querySelector('#btnBestGear'),
        party: !!document.querySelector('[data-gearparty]'),
      };
      closeModals();
      return { before, after };
    });
    ok(!r.before.best && !r.before.party, 'a level 1 guild was shown charter buttons');
    ok(r.after.best, 'Best Gear did not appear on the hero sheet');
    ok(r.after.party, 'Gear Up did not appear on the party card');
    return 'hidden at level 1, both present at level 30';
  });

  await test('no page errors', async () => {
    eq(errors.length, 0, errors.join(' | '));
    return 'no page errors';
  });

  clean(page);
}
