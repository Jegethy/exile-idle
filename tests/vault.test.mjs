// Browsing the vault: filters by slot and base type, sorting, and the marker
// that answers the only question that matters when eighty items look alike —
// would this improve anyone?

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** Fills the vault with a spread of slots, base types and rarities. */
async function stockVault(page) {
  return page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    const { createItem } = await import('./src/items.js');
    const { addToVault } = await import('./src/inventory.js');
    G.state.vault.length = 0;
    const bases = ['sword1h', 'axe2h', 'bow', 'dagger', 'shield_str', 'quiver',
      'helm_ar', 'body_ev', 'glove_ar', 'boot_ev', 'amulet', 'ring'];
    for (const baseId of bases) {
      for (const rarity of ['normal', 'rare']) {
        addToVault(createItem({ baseId, ilvl: 30, rarity }), { noAutoSalvage: true });
      }
    }
    return G.state.vault.length;
  });
}

export default async function run(browser) {
  suite('vault browsing');
  const { page, errors } = await openGame(browser, { name: 'Vault' });
  const total = await stockVault(page);

  await test('filters narrow to the right slots', async () => {
    const r = await page.evaluate(async () => {
      const { vaultView, VAULT_FILTERS } = await import('./src/inventory.js');
      const out = {};
      for (const f of VAULT_FILTERS) out[f.id] = vaultView({ filter: f.id }).map((i) => i.slot);
      return out;
    });
    eq(r.all.length, total, 'the "all" filter should show everything');
    ok(r.weapon.every((x) => x === 'weapon'), `weapons filter leaked: ${[...new Set(r.weapon)]}`);
    ok(r.armour.every((x) => ['helmet', 'body', 'gloves', 'boots'].includes(x)),
      `armour filter leaked: ${[...new Set(r.armour)]}`);
    ok(r.jewellery.every((x) => ['amulet', 'ring'].includes(x)),
      `jewellery filter leaked: ${[...new Set(r.jewellery)]}`);
    return `${r.weapon.length} weapons, ${r.armour.length} armour, ${r.jewellery.length} jewellery`;
  });

  await test('base-type filtering only offers what is present', async () => {
    const r = await page.evaluate(async () => {
      const { baseTypesIn, vaultView } = await import('./src/inventory.js');
      const types = baseTypesIn('weapon');
      const picked = types[0];
      return { types, picked, count: vaultView({ filter: 'weapon', baseType: picked }).length };
    });
    ok(r.types.length > 1, `only ${r.types.length} weapon type(s) offered`);
    ok(r.count > 0, `filtering to ${r.picked} showed nothing`);
    return `${r.types.length} weapon types, e.g. ${r.picked} (${r.count})`;
  });

  await test('sorting orders the view without reorganising the vault', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { vaultView } = await import('./src/inventory.js');
      const stored = G.state.vault.map((i) => i.uid).join(',');
      const byIlvl = vaultView({ sort: 'ilvl' }).map((i) => i.ilvl);
      const byName = vaultView({ sort: 'name' }).map((i) => i.name);
      return {
        untouched: stored === G.state.vault.map((i) => i.uid).join(','),
        ilvlSorted: byIlvl.every((v, i, a) => i === 0 || a[i - 1] >= v),
        nameSorted: byName.every((v, i, a) => i === 0 || a[i - 1].localeCompare(v) <= 0),
      };
    });
    ok(r.untouched, 'viewing the vault reordered the stored vault');
    ok(r.ilvlSorted, 'item level sort is not descending');
    ok(r.nameSorted, 'name sort is not alphabetical');
    return 'sorted views, stored order untouched';
  });

  await test('an upgrade is identified, and for whom', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { bestUpgrade, upgradeFor } = await import('./src/stats.js');
      const hero = G.state.heroes[0];
      const good = createItem({ baseId: 'body_arev', ilvl: 60, rarity: 'rare' });
      hero.equipment.body = createItem({ baseId: 'body_arev', ilvl: 60, rarity: 'rare' });
      const worse = createItem({ baseId: 'body_arev', ilvl: 2, rarity: 'normal' });
      const bare = { ...hero, equipment: { ...hero.equipment, body: null } };
      return {
        betterThanEmpty: upgradeFor(bare, good, G.state.upgrades).delta,
        worseThanWorn: upgradeFor(hero, worse, G.state.upgrades).delta,
        best: bestUpgrade(G.state.heroes, good, G.state.upgrades)?.hero?.name ?? null,
      };
    });
    ok(r.betterThanEmpty > 0, 'a good item did not read as an upgrade over an empty slot');
    ok(r.worseThanWorn < 0, 'a worse item still read as an upgrade');
    ok(r.best, 'no hero was identified for a clear upgrade');
    return `+${(r.betterThanEmpty * 100).toFixed(0)}% for ${r.best}; `
      + `${(r.worseThanWorn * 100).toFixed(0)}% for a downgrade`;
  });

  await test('upgrade scoring follows what the role needs', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { upgradeFor } = await import('./src/stats.js');
      const { rollHero } = await import('./src/heroes.js');
      const tank = rollHero({ classId: 'guardian', rarity: 'common' });
      const dps = rollHero({ classId: 'wizard', rarity: 'common' });
      for (const h of [tank, dps]) {
        h.level = 30;
        // Armed and armoured: against a bare hero every item is an enormous
        // relative gain, which measures the empty slots rather than the role.
        h.equipment.weapon = createItem({ baseId: 'mace1h', ilvl: 40, rarity: 'rare' });
        h.equipment.body = createItem({ baseId: 'body_arev', ilvl: 40, rarity: 'rare' });
        h.equipment.helmet = createItem({ baseId: 'helm_ar', ilvl: 40, rarity: 'rare' });
        G.state.heroes.push(h);
      }
      const shield = createItem({ baseId: 'shield_str', ilvl: 40, rarity: 'rare' });
      return {
        tank: upgradeFor(tank, shield, G.state.upgrades).delta,
        dps: upgradeFor(dps, shield, G.state.upgrades).delta,
      };
    });
    ok(r.tank > r.dps,
      `a heavy shield should matter more to a tank than a wizard (${r.tank.toFixed(2)} vs ${r.dps.toFixed(2)})`);
    return `worth +${(r.tank * 100).toFixed(0)}% to a Guardian, +${(r.dps * 100).toFixed(0)}% to a Wizard`;
  });

  await test('the panel renders its controls and markers', async () => {
    const r = await page.evaluate(async () => {
      const { renderVault } = await import('./src/ui/vault.js');
      renderVault();
      return {
        filters: document.querySelectorAll('[data-vfilter]').length,
        sorts: document.querySelectorAll('[data-vsort]').length,
        cells: document.querySelectorAll('#vaultGrid [data-uid]').length,
      };
    });
    eq(r.filters, 5, 'slot filters');
    eq(r.sorts, 5, 'sort options');
    ok(r.cells > 0, 'no items rendered');
    return `${r.filters} filters, ${r.sorts} sorts, ${r.cells} items`;
  });

  await test('clicking a filter narrows what is shown', async () => {
    const r = await page.evaluate(() => {
      const before = document.querySelectorAll('#vaultGrid [data-uid]').length;
      document.querySelector('[data-vfilter="jewellery"]').click();
      return { before, after: document.querySelectorAll('#vaultGrid [data-uid]').length };
    });
    ok(r.after < r.before && r.after > 0, `filter showed ${r.after} of ${r.before}`);
    return `${r.before} -> ${r.after} items`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
