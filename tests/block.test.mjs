// Shields block by type: armour shields stop melee, energy shield shields stop
// spells, evasion shields stop a little of both. The decisive test forces 100%
// block and asserts the matching damage type cannot land at all.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('shields and block');
  const { page, errors } = await openGame(browser, { name: 'Block' });

  await test('block scales toward each base\'s cap', async () => {
    const r = await page.evaluate(async () => {
      const { blockFor, BASE_BY_ID } = await import('./src/data/bases.js');
      return {
        str: blockFor(BASE_BY_ID.shield_str, 68),
        dex: blockFor(BASE_BY_ID.shield_dex, 68),
        int: blockFor(BASE_BY_ID.shield_int, 68),
        lowStr: blockFor(BASE_BY_ID.shield_str, 1),
      };
    });
    eq(r.str.melee, 30, 'armour shield melee cap');
    eq(r.dex.melee, 15, 'evasion shield melee cap');
    eq(r.dex.spell, 15, 'evasion shield spell cap');
    eq(r.int.spell, 30, 'energy shield spell cap');
    ok(r.lowStr.melee < r.str.melee, 'low-level shield should block less');
    return `str ${r.lowStr.melee}%->${r.str.melee}% melee, dex ${r.dex.melee}/${r.dex.spell}, int ${r.int.spell} spell`;
  });

  await test('a shield grants its block through the sheet', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { equipOnHero, unequipFromHero } = await import('./src/heroes.js');
      const { addToVault } = await import('./src/inventory.js');
      const hero = G.state.heroes[0];
      const base = { melee: G.sheets[hero.uid].blockMelee, spell: G.sheets[hero.uid].blockSpell };
      const out = {};
      for (const id of ['shield_str', 'shield_int']) {
        const sh = createItem({ ilvl: 68, rarity: 'normal', baseId: id });
        addToVault(sh, { noAutoSalvage: true });
        equipOnHero(hero.uid, sh.uid);
        const s = G.sheets[hero.uid];
        out[id] = { melee: s.blockMelee - base.melee, spell: s.blockSpell - base.spell };
        unequipFromHero(hero.uid, 'offhand');
      }
      return out;
    });
    ok(r.shield_str.melee >= 30, `armour shield gave ${r.shield_str.melee}% melee block`);
    ok(r.shield_int.spell >= 30, `energy shield gave ${r.shield_int.spell}% spell block`);
    return `str ${r.shield_str.melee}m, int ${r.shield_int.spell}s`;
  });

  await test('every enemy archetype declares an attack type', async () => {
    const r = await page.evaluate(async () => {
      const { ARCHETYPES } = await import('./src/data/monsters.js');
      const { RAIDS } = await import('./src/data/dungeons.js');
      return {
        missing: ARCHETYPES.filter((a) => !a.attack).map((a) => a.id),
        raidMissing: RAIDS.filter((r_) => !r_.attack).map((r_) => r_.id),
        melee: ARCHETYPES.filter((a) => a.attack === 'melee').length,
        spell: ARCHETYPES.filter((a) => a.attack === 'spell').length,
      };
    });
    eq(r.missing.length, 0, `archetypes without an attack type: ${r.missing}`);
    eq(r.raidMissing.length, 0, `raids without an attack type: ${r.raidMissing}`);
    return `${r.melee} melee / ${r.spell} spell archetypes`;
  });

  await test('block applies only to the matching damage type', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const trial = (blockMelee, blockSpell, attack) => {
        for (const h of G.state.heroes) h.stamina = 100;
        while (G.state.expeditions.length) G.state.expeditions.pop();
        dispatch(G.state.parties[0].id, 'mines', 8);
        const r_ = G.state.expeditions[0];
        for (const c of r_.combatants) {
          const sh = G.sheets[c.uid];
          sh.blockMelee = blockMelee; sh.blockSpell = blockSpell;
          sh.evasion = 0;                 // strip the other avoidance layer
        }
        const start = r_.combatants.reduce((a, c) => a + c.life + c.es, 0);
        for (let i = 0; i < 120 && G.state.expeditions.length; i++) {
          for (const e of r_.enemies) e.attack = attack;
          tickAll(0.1);
        }
        return Math.round(start - r_.combatants.reduce((a, c) => a + c.life + c.es, 0));
      };
      return {
        meleeBlocked: trial(100, 0, 'melee'),
        spellThrough: trial(100, 0, 'spell'),
        spellBlocked: trial(0, 100, 'spell'),
        unblocked: trial(0, 0, 'melee'),
      };
    });
    eq(r.meleeBlocked, 0, 'melee damage taken at 100% melee block');
    eq(r.spellBlocked, 0, 'spell damage taken at 100% spell block');
    ok(r.spellThrough > 0, 'melee block wrongly stopped spells');
    ok(r.unblocked > 0, 'no damage landed even without block — test is inert');
    return `matched 0 / mismatched ${r.spellThrough} / none ${r.unblocked}`;
  });

  await test('The Bulwark: 30/30 block and no defences', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem, itemBaseStats, itemMods } = await import('./src/items.js');
      const { equipOnHero } = await import('./src/heroes.js');
      const { addToVault } = await import('./src/inventory.js');
      const { recall } = await import('./src/expedition.js');
      const { refreshSheets } = await import('./src/sheets.js');
      // The previous check leaves a party in the field and writes directly to
      // the sheet cache; a deployed hero cannot equip anything.
      while (G.state.expeditions.length) recall(G.state.expeditions[0].id);
      refreshSheets();
      const hero = G.state.heroes[0];
      // Classes now grant block of their own, so measure what the item adds
      // rather than the total on the wearer.
      const before = { melee: G.sheets[hero.uid].blockMelee, spell: G.sheets[hero.uid].blockSpell };
      const bw = createItem({ ilvl: 70, rarity: 'unique', uniqueId: 'bulwark' });
      const bs = itemBaseStats(bw);
      addToVault(bw, { noAutoSalvage: true });
      equipOnHero(hero.uid, bw.uid);
      const s = G.sheets[hero.uid];
      return {
        name: bw.name,
        melee: s.blockMelee - before.melee, spell: s.blockSpell - before.spell,
        ar: bs.armour ?? 0, ev: bs.evasion ?? 0, es: bs.es ?? 0,
        mods: itemMods(bw).map((m) => m.text),
      };
    });
    eq(r.melee, 30, 'melee block granted by the Bulwark');
    eq(r.spell, 30, 'spell block granted by the Bulwark');
    eq(r.ar + r.ev + r.es, 0, 'Bulwark should grant no defences');
    ok(!r.mods.some((m) => /Resistance|Life|Strength/i.test(m)),
      `Bulwark rolled an extra stat: ${r.mods.join('; ')}`);
    return `${r.name} — +${r.melee}/${r.spell}% block, no base stats`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
