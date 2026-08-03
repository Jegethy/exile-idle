// Dual wielding, which only the Rogue does. The rules that matter: a second
// weapon adds damage without doubling the hero, a two-handed weapon shuts the
// offhand entirely, and nothing is unequipped without asking.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('dual wielding');
  const { page, errors } = await openGame(browser, { name: 'DualWield' });

  await test('only the Rogue may hold two weapons', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      return HERO_CLASSES.filter((c) => c.dualWield).map((c) => c.id);
    });
    eq(r.join(','), 'rogue', 'classes that dual wield');
    return 'rogue only';
  });

  await test('a second weapon adds damage without doubling it', async () => {
    const r = await page.evaluate(async () => {
      const { heroStats } = await import('./src/stats.js');
      const { createItem } = await import('./src/items.js');
      const blank = {
        helmet: null, body: null, gloves: null, boots: null, amulet: null, ring1: null, ring2: null,
      };
      const dagger = () => createItem({ baseId: 'dagger', ilvl: 40, rarity: 'normal' });
      const mk = (classId, offhand) => heroStats({
        uid: 'h', classId, rarity: 'common', level: 40, xp: 0, stamina: 100, traits: [],
        equipment: { ...blank, weapon: dagger(), offhand },
      }, {});
      const solo = mk('rogue', null);
      const dual = mk('rogue', dagger());
      // A class that cannot dual wield gains nothing from a weapon there.
      const archerSolo = mk('archer', null);
      const archerDual = mk('archer', dagger());
      return {
        solo: solo.dps, dual: dual.dps, dualFlag: dual.dualWielding,
        archerGain: archerDual.dps / archerSolo.dps,
      };
    });
    ok(r.dualFlag, 'the sheet should record that the hero is dual wielding');
    ok(r.dual > r.solo * 1.2, `two daggers barely helped (${(r.dual / r.solo).toFixed(2)}x)`);
    ok(r.dual < r.solo * 2, `two daggers should not double the Rogue (${(r.dual / r.solo).toFixed(2)}x)`);
    return `${(r.dual / r.solo * 100 - 100).toFixed(0)}% more damage from the second blade`;
  });

  await test('equipping an offhand puts down a two-handed weapon', async () => {
    // The model displaces it; the vault UI is what asks first, so that nothing
    // the player paid for is quietly unequipped.
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { equipOnHero, rollHero } = await import('./src/heroes.js');
      const hero = rollHero({ classId: 'rogue', rarity: 'common' });
      G.state.heroes.push(hero);
      const twoHander = createItem({ baseId: 'sword2h', ilvl: 30, rarity: 'normal' });
      addToVault(twoHander, { noAutoSalvage: true });
      equipOnHero(hero.uid, twoHander.uid);
      const dagger = createItem({ baseId: 'dagger', ilvl: 30, rarity: 'normal' });
      addToVault(dagger, { noAutoSalvage: true });
      equipOnHero(hero.uid, dagger.uid, 'offhand');
      return {
        offhand: hero.equipment.offhand?.baseId ?? null,
        weapon: hero.equipment.weapon?.baseId ?? null,
        backInVault: G.state.vault.some((i) => i.uid === twoHander.uid),
      };
    });
    eq(r.offhand, 'dagger', 'the dagger should be in the offhand');
    eq(r.weapon, null, 'the two-handed weapon should have been put down');
    ok(r.backInVault, 'the displaced weapon should return to the vault, not vanish');
    return 'two-hander displaced to the vault';
  });

  await test('a shield still fits any other class', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { equipOnHero, rollHero } = await import('./src/heroes.js');
      const hero = rollHero({ classId: 'warrior', rarity: 'common' });
      G.state.heroes.push(hero);
      const shield = createItem({ baseId: 'shield_str', ilvl: 30, rarity: 'normal' });
      addToVault(shield, { noAutoSalvage: true });
      const ok_ = equipOnHero(hero.uid, shield.uid);
      const dagger = createItem({ baseId: 'dagger', ilvl: 30, rarity: 'normal' });
      addToVault(dagger, { noAutoSalvage: true });
      const weaponInOffhand = equipOnHero(hero.uid, dagger.uid, 'offhand');
      return { shield: ok_, offhand: hero.equipment.offhand?.name ?? null, weaponInOffhand };
    });
    ok(r.shield, 'a Warrior could not equip a shield');
    ok(!r.weaponInOffhand, 'a Warrior should not be able to dual wield');
    return 'shield fits, second weapon refused';
  });

  await test('the offhand slot is shown shut, not empty', async () => {
    const shown = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { equipOnHero, rollHero } = await import('./src/heroes.js');
      const { openHeroModal } = await import('./src/ui/roster.js');
      // A fresh Rogue holding a two-hander and nothing else.
      const hero = rollHero({ classId: 'rogue', rarity: 'common' });
      G.state.heroes.push(hero);
      const twoHander = createItem({ baseId: 'axe2h', ilvl: 30, rarity: 'normal' });
      addToVault(twoHander, { noAutoSalvage: true });
      equipOnHero(hero.uid, twoHander.uid);
      openHeroModal(hero.uid);
      const cell = document.querySelector('#heroDoll [data-slot="offhand"]');
      return {
        blocked: cell?.classList.contains('blocked'),
        label: cell?.dataset.label,
        holding: hero.equipment.weapon?.baseId,
      };
    });
    eq(shown.holding, 'axe2h', 'the hero should be holding the two-hander');
    ok(shown.blocked, 'the offhand should be marked blocked while a two-hander is held');
    return `shown as "${shown.label}"`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
