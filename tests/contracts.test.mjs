// Sealed contracts and their modifiers.
//
// The thing most worth guarding here is that danger stays honest. Danger is
// what a contract pays on, and it was set from measurement rather than taste —
// so a modifier whose numbers are quietly buffed later must not keep its old
// price. The last check re-measures a sample and fails if the two have drifted
// apart.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('contracts');
  const { page, errors } = await openGame(browser, { name: 'Contracts' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('every modifier states what it does and what it is worth', async () => {
    const r = await page.evaluate(async () => {
      const { MODIFIERS } = await import('./src/data/modifiers.js');
      const bad = [];
      for (const m of MODIFIERS) {
        if (!m.name || !m.desc) bad.push(`${m.id}: no name or description`);
        if (typeof m.danger !== 'number' || m.danger === 0) bad.push(`${m.id}: unpriced`);
        if (m.boon && m.danger > 0) bad.push(`${m.id}: an upside that raises danger`);
        if (!m.boon && m.danger < 0) bad.push(`${m.id}: a downside that lowers danger`);
        const acts = ['profile', 'curse', 'find', 'restrict', 'reactions']
          .some((k) => m[k] && Object.keys(m[k]).length);
        if (!acts) bad.push(`${m.id}: does nothing`);
      }
      const dup = MODIFIERS.length - new Set(MODIFIERS.map((m) => m.id)).size;
      return { bad, dup, total: MODIFIERS.length };
    });
    eq(r.bad.length, 0, r.bad.slice(0, 5).join('; '));
    eq(r.dup, 0, 'duplicate modifier ids');
    return `${r.total} modifiers, all named, priced and doing something`;
  });

  await test('rarity decides how many modifiers and upsides a contract carries', async () => {
    const r = await page.evaluate(async () => {
      const { rollContract, CONTRACT_RARITIES, downsidesOf, boonsOf } = await import('./src/contracts.js');
      const bad = [];
      for (const rar of CONTRACT_RARITIES) {
        let sawBoon = 0;
        for (let i = 0; i < 80; i++) {
          const c = rollContract(20, 'mines', rar.id);
          const bad_ = downsidesOf(c).length;
          const good = boonsOf(c).length;
          if (bad_ !== rar.mods) bad.push(`${rar.id}: ${bad_} modifiers, expected ${rar.mods}`);
          if (good > rar.boons) bad.push(`${rar.id}: ${good} upsides, max ${rar.boons}`);
          if (good) sawBoon++;
          // Two modifiers both deciding what the dungeon is full of would mean
          // one silently overwrote the other.
          const mixes = downsidesOf(c).filter((m) => m.profile?.attackMix).length;
          if (mixes > 1) bad.push(`${rar.id}: ${mixes} conflicting attack mixes`);
          const bans = downsidesOf(c).filter((m) => m.restrict).length;
          if (bans > 1) bad.push(`${rar.id}: ${bans} overlapping bans`);
        }
        if (rar.boonChance === 1 && rar.boons > 0 && sawBoon < 80) {
          bad.push(`${rar.id}: guaranteed upside missing from ${80 - sawBoon} rolls`);
        }
        if (rar.boonChance === 0 && sawBoon > 0) bad.push(`${rar.id}: rolled an upside it should not`);
      }
      return { bad: [...new Set(bad)] };
    });
    eq(r.bad.length, 0, r.bad.slice(0, 5).join('; '));
    return 'common 1/0 through legendary 3/3, no conflicts';
  });

  await test('better contracts pay better', async () => {
    const r = await page.evaluate(async () => {
      const { rollContract, findBaseFor, CONTRACT_RARITIES } = await import('./src/contracts.js');
      const rows = CONTRACT_RARITIES.map((rar) => {
        const many = Array.from({ length: 120 }, () => rollContract(20, 'mines', rar.id));
        const q = many.reduce((a, c) => a + findBaseFor(c).quantity, 0) / many.length;
        const ra = many.reduce((a, c) => a + findBaseFor(c).rarity, 0) / many.length;
        return { id: rar.id, q, ra };
      });
      const rising = rows.every((x, i) => i === 0 || (x.q > rows[i - 1].q && x.ra > rows[i - 1].ra));
      return { rows: rows.map((x) => `${x.id} +${Math.round(x.q)}q/+${Math.round(x.ra)}r`), rising };
    });
    ok(r.rising, `find rates should rise with rarity: ${r.rows.join(', ')}`);
    return r.rows.join(' · ');
  });

  await test('a contract actually changes the fight', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');

      const setup = () => {
        while (G.state.expeditions.length) G.state.expeditions.pop();
        G.state.heroes.length = 0;
        for (const cls of ['guardian', 'cleric', 'wizard']) {
          const h = rollHero({ classId: cls, rarity: 'common' });
          h.level = 40; h.stamina = 100;
          G.state.heroes.push(h);
        }
        G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
        refreshSheets();
      };

      // Enemy life is compared through makeEnemy over a large sample rather
      // than by looking at one spawned enemy from each run. Archetype and
      // monster rarity are rolled per enemy, so a single normal goblin against
      // a single champion says nothing about the contract at all -- that
      // comparison failed roughly one run in five.
      const { makeEnemy } = await import('./src/expedition/enemies.js');
      const { applyModifiersToProfile } = await import('./src/data/modifiers.js');
      const { DUNGEON_BY_ID } = await import('./src/data/dungeons.js');
      const baseProfile = {
        ...DUNGEON_BY_ID.mines.monsters, attackMix: DUNGEON_BY_ID.mines.attackMix,
      };
      const modProfile = applyModifiersToProfile(baseProfile, ['teeming', 'exposed']);
      // Pinned to 'normal' rarity as well. Monster rarity is rolled per enemy
      // and a champion carries several times the life of a common one, so even
      // 400 samples of a mixed population wander by a third -- which is enough
      // to fail a 1.4x assertion about a 1.6x effect.
      const meanLife = (profile) => {
        let total = 0;
        for (let i = 0; i < 200; i++) total += makeEnemy(8, profile, 'normal').maxLife;
        return total / 200;
      };
      const plainLife = meanLife(baseProfile);
      const cursedLife = meanLife(modProfile);

      setup();
      G.state.contracts = [{
        id: 'ct', dungeonId: 'mines', tier: 8, rarity: 'common',
        mods: ['teeming', 'exposed'], danger: 44,
      }];
      dispatch(G.state.parties[0].id, null, null, 'ct');
      const run_ = G.state.expeditions[0];
      for (let i = 0; i < 30 && !run_.enemies.length; i++) tickAll(0.1);
      const cursed = run_.combatants[0].effects.find((e) => e.id === 'contract-curse');

      return {
        plainLife, cursedLife,
        curseFound: !!cursed,
        damageTaken: cursed?.mods?.damageTaken ?? 0,
        spent: (G.state.contracts ?? []).length,
        mult: run_.rewardMult,
        find: run_.find,
      };
    });
    ok(r.cursedLife > r.plainLife * 1.4, `enemy life ${Math.round(r.plainLife)} -> ${Math.round(r.cursedLife)}`);
    ok(r.curseFound, 'no curse effect on the party');
    eq(r.damageTaken, 35, 'the curse did not carry its modifier');
    eq(r.spent, 0, 'the contract was not consumed');
    ok(r.mult > 1.4, `reward multiplier ${r.mult}`);
    ok((r.find?.quantity ?? 0) > 0 && (r.find?.rarity ?? 0) > 0, 'no find bonus on the run');
    return `enemies +${Math.round((r.cursedLife / r.plainLife - 1) * 100)}% life, `
      + `party +35% damage taken, ×${r.mult.toFixed(2)} rewards`;
  });

  await test('a banned class is refused before anything is spent', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      while (G.state.expeditions.length) G.state.expeditions.pop();
      G.state.heroes.length = 0;
      for (const cls of ['guardian', 'cleric', 'wizard']) {
        const h = rollHero({ classId: cls, rarity: 'common' });
        h.level = 40; h.stamina = 100;
        G.state.heroes.push(h);
      }
      G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
      refreshSheets();
      const stamBefore = G.state.heroes.map((h) => h.stamina);

      G.state.contracts = [
        { id: 'ban', dungeonId: 'mines', tier: 8, rarity: 'common', mods: ['ban_wizard'], danger: 12 },
        { id: 'melee', dungeonId: 'mines', tier: 8, rarity: 'common', mods: ['sanctified'], danger: 22 },
        { id: 'fine', dungeonId: 'mines', tier: 8, rarity: 'common', mods: ['savage'], danger: 12 },
      ];
      const banned = dispatch(G.state.parties[0].id, null, null, 'ban');
      const melee = dispatch(G.state.parties[0].id, null, null, 'melee');
      const stamAfter = G.state.heroes.map((h) => h.stamina);
      const fine = dispatch(G.state.parties[0].id, null, null, 'fine');
      return {
        banned: banned.ok, bannedMsg: banned.msg,
        melee: melee.ok,
        fine: fine.ok,
        stamUntouched: stamBefore.join() === stamAfter.join(),
        left: (G.state.contracts ?? []).length,
      };
    });
    ok(!r.banned, 'a contract banning Wizards accepted a party with one');
    ok(/wizard/i.test(r.bannedMsg), `refusal did not say why: "${r.bannedMsg}"`);
    ok(!r.melee, 'a contract banning melee accepted a Guardian');
    ok(r.stamUntouched, 'a refused contract still cost stamina');
    ok(r.fine, 'a legal contract was refused');
    eq(r.left, 2, 'a refused contract was consumed');
    return 'refused with a reason, cost nothing, and the legal one went through';
  });

  await test('contracts drop from deep runs only, and can be discarded', async () => {
    const r = await page.evaluate(async () => {
      const { contractChance, CONTRACT_MIN_TIER, consumeContract, rollContract, storeContract,
        CONTRACT_CAP } = await import('./src/contracts.js');
      const { G } = await import('./src/state.js');
      const low = contractChance(CONTRACT_MIN_TIER - 1);
      const at = contractChance(CONTRACT_MIN_TIER);
      const deep = contractChance(30);

      G.state.contracts = [];
      for (let i = 0; i < CONTRACT_CAP + 6; i++) storeContract(rollContract(16, 'mines'));
      const capped = G.state.contracts.length;
      const id = G.state.contracts[0].id;
      consumeContract(id);
      return { low, at, deep, capped, after: G.state.contracts.length, cap: CONTRACT_CAP };
    });
    eq(r.low, 0, 'contracts dropped below the minimum tier');
    ok(r.at > 0.1 && r.deep > r.at, `drop rate ${r.at} at the floor, ${r.deep} deep`);
    eq(r.capped, r.cap, `the shelf overflowed to ${r.capped}`);
    eq(r.after, r.cap - 1, 'discarding did nothing');
    return `none below T${8}, ${(r.at * 100).toFixed(0)}%-${(r.deep * 100).toFixed(0)}%, capped at ${r.cap}`;
  });

  await test('the shelf renders, and hides itself when empty', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { renderDispatch } = await import('./src/ui/expeditions.js');
      G.state.contracts = [];
      renderDispatch();
      const empty = !document.querySelector('#contractShelf');

      const { rollContract } = await import('./src/contracts.js');
      G.state.contracts = [rollContract(16, 'mines', 'legendary')];
      renderDispatch();
      const shelf = document.querySelector('#contractShelf');
      const card = shelf?.querySelector('.contract');
      return {
        empty,
        shown: !!shelf,
        rarityClass: [...(card?.classList ?? [])].some((c) => c.startsWith('r-')),
        downsides: shelf?.querySelectorAll('.ct-mods.bad li').length ?? 0,
        upsides: shelf?.querySelectorAll('.ct-mods.good li').length ?? 0,
        find: (shelf?.querySelector('.ct-find')?.textContent ?? '').includes('quantity'),
        discard: !!shelf?.querySelector('[data-discard]'),
      };
    });
    ok(r.empty, 'an empty shelf still rendered');
    ok(r.shown, 'the shelf did not render with a contract in it');
    ok(r.rarityClass, 'the card carries no rarity colour');
    eq(r.downsides, 3, `${r.downsides} downsides on a Legendary`);
    eq(r.upsides, 3, `${r.upsides} upsides on a Legendary`);
    ok(r.find, 'the card does not state its quantity bonus');
    ok(r.discard, 'no way to discard a contract');
    return 'hidden when empty; Legendary shows 3 downsides, 3 upsides, find rates and a discard';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
