// Weapons belong to somebody.
//
// Two rules, deliberately different in kind, and most of this suite exists to
// keep them from collapsing into each other:
//
//   Training is soft. Any hero may carry any weapon; one outside their class's
//   families deals half its damage. Nothing is refused, so nobody is ever left
//   holding a slot they cannot fill.
//
//   The off hand is hard. A hand holds a thing or it does not, and a shield on
//   an Archer is not a weak choice but a wrong picture. Each class says what
//   that hand is for and nothing else goes in it.
//
// And one rule that follows from neither: a quiver rides on the belt. Every
// bow is two-handed, so without that exception the Archer — the only class
// whose off hand is a quiver — could never wear one, and the base type would
// be dead content.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('weapons and who they are for');
  const { page, errors } = await openGame(browser, { name: 'Weapons' });

  // ---- Training ----------------------------------------------------------

  await test('every class trains with something, and no family is orphaned', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES, offhandStyle } = await import('./src/data/heroclasses.js');
      const { WEAPON_FAMILIES, BASES } = await import('./src/data/bases.js');
      const declared = new Set(BASES.filter((b) => b.slot === 'weapon').map((b) => b.family));
      const trained = new Set(HERO_CLASSES.flatMap((c) => c.wields ?? []));
      return {
        untrained: HERO_CLASSES.filter((c) => !(c.wields ?? []).length).map((c) => c.id),
        unknown: HERO_CLASSES.flatMap((c) => (c.wields ?? []).filter((f) => !declared.has(f))),
        orphans: WEAPON_FAMILIES.filter((f) => !trained.has(f)),
        missingFamily: BASES.filter((b) => b.slot === 'weapon' && !b.family).map((b) => b.id),
        styles: [...new Set(HERO_CLASSES.map(offhandStyle))].sort(),
      };
    });
    eq(r.untrained.join(','), '', 'a class that can use nothing well');
    eq(r.unknown.join(','), '', 'a class trains with a family no weapon belongs to');
    eq(r.orphans.join(','), '', 'a weapon family nobody in the guild is trained with');
    eq(r.missingFamily.join(','), '', 'a weapon base with no family');
    eq(r.styles.join(','), 'quiver,shield,weapon', 'off-hand styles in use');
    return 'all 7 families trained by somebody, 3 off-hand styles';
  });

  await test('an untrained weapon still swings, at half its damage', async () => {
    // Both halves matter. Halved is the rule; *still swings* is the promise
    // that this never became a permission check by the back door.
    const r = await page.evaluate(async () => {
      const { heroStats } = await import('./src/stats.js');
      const { createItem } = await import('./src/items.js');
      const { UNTRAINED } = await import('./src/data/heroclasses.js');
      const blank = {
        helmet: null, body: null, gloves: null, boots: null, amulet: null,
        ring1: null, ring2: null, offhand: null,
      };
      const sheet = (classId, weapon) => heroStats({
        uid: 'h', classId, rarity: 'common', level: 40, xp: 0, stamina: 100, traits: [], specs: [],
        equipment: { ...blank, weapon },
      }, {});
      // The same steel in two hands. A Warrior knows a sword; a Wizard does not.
      const sword = createItem({ baseId: 'sword1h', ilvl: 40, rarity: 'normal' });
      const staff = createItem({ baseId: 'staff', ilvl: 40, rarity: 'normal' });
      const bare = sheet('wizard', null);
      return {
        wizardSword: sheet('wizard', sword).dps,
        wizardStaff: sheet('wizard', staff).dps,
        wizardBare: bare.dps,
        prof: sheet('wizard', sword).proficiency,
        trainedProf: sheet('wizard', staff).proficiency,
        expected: UNTRAINED,
      };
    });
    eq(r.prof, r.expected, 'a Wizard should be untrained with a sword');
    eq(r.trainedProf, 1, 'a Wizard should be trained with a staff');
    ok(r.wizardSword > r.wizardBare,
      'an untrained weapon left the hero no better off than bare hands — this is a penalty, not a ban');
    ok(r.wizardStaff > r.wizardSword * 1.5,
      `the staff should be decisively better (${(r.wizardStaff / r.wizardSword).toFixed(2)}x)`);
    return `staff ${(r.wizardStaff / r.wizardSword).toFixed(2)}x the sword, and the sword still beats bare hands`;
  });

  await test('nobody is refused a weapon for being untrained with it', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const { canHold } = await import('./src/heroes.js');
      const { createItem } = await import('./src/items.js');
      const { BASES } = await import('./src/data/bases.js');
      const weapons = BASES.filter((b) => b.slot === 'weapon')
        .map((b) => createItem({ baseId: b.id, ilvl: 20, rarity: 'normal' }));
      const refused = [];
      for (const c of HERO_CLASSES) {
        const hero = { uid: 'h', name: 'X', classId: c.id, equipment: {} };
        for (const item of weapons) {
          if (!canHold(hero, item, 'weapon').ok) refused.push(`${c.id}/${item.baseId}`);
        }
      }
      return { refused, pairs: HERO_CLASSES.length * weapons.length };
    });
    // The Rogue's two-handers are the only main-hand refusal in the game, and
    // they are refused for the off hand's sake rather than for training.
    eq(r.refused.join(','), 'rogue/sword2h,rogue/axe2h,rogue/staff,rogue/bow',
      'a main hand was refused for a reason other than dual wielding');
    return `${r.pairs - r.refused.length} of ${r.pairs} class/weapon pairs allowed`;
  });

  await test('a wand is a caster weapon in every hand, including the wrong one', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES, weaponProficiency } = await import('./src/data/heroclasses.js');
      const { createItem } = await import('./src/items.js');
      const wand = createItem({ baseId: 'wand', ilvl: 20, rarity: 'normal' });
      const trained = HERO_CLASSES.filter((c) => weaponProficiency(c, wand) >= 1);
      return {
        trained: trained.map((c) => c.id),
        roles: [...new Set(trained.map((c) => c.role))].sort(),
      };
    });
    // The question that started this: a wand is one-handed, so anybody may
    // hold one. Nobody who swings a blade for a living should be good with it.
    eq(r.roles.join(','), 'DPS,Healer,Support', 'roles trained with a wand');
    ok(!r.trained.includes('warrior') && !r.trained.includes('rogue') && !r.trained.includes('archer'),
      `a fighter is trained with a wand: ${r.trained.join(', ')}`);
    return `wands belong to ${r.trained.join(', ')}`;
  });

  // ---- The off hand ------------------------------------------------------

  await test('an Archer cannot hold a shield, and a Warrior cannot hold a quiver', async () => {
    const r = await page.evaluate(async () => {
      const { canHold, rollHero } = await import('./src/heroes.js');
      const { createItem } = await import('./src/items.js');
      const shield = createItem({ baseId: 'shield_dex', ilvl: 20, rarity: 'normal' });
      const quiver = createItem({ baseId: 'quiver', ilvl: 20, rarity: 'normal' });
      const archer = rollHero({ classId: 'archer', rarity: 'common' });
      const warrior = rollHero({ classId: 'warrior', rarity: 'common' });
      return {
        archerShield: canHold(archer, shield, 'offhand'),
        archerQuiver: canHold(archer, quiver, 'offhand').ok,
        warriorQuiver: canHold(warrior, quiver, 'offhand'),
        warriorShield: canHold(warrior, shield, 'offhand').ok,
      };
    });
    ok(!r.archerShield.ok, 'an Archer was allowed a shield');
    ok(r.archerShield.msg.length > 0, 'the refusal gives no reason');
    ok(r.archerQuiver, 'an Archer was refused a quiver');
    ok(!r.warriorQuiver.ok, 'a Warrior was allowed a quiver they have no bow for');
    ok(r.warriorShield, 'a Warrior was refused a shield');
    return `archer: "${r.archerShield.msg}"`;
  });

  await test('a quiver rides on the belt, so a bow does not cost it', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { equipOnHero, rollHero } = await import('./src/heroes.js');
      const hero = rollHero({ classId: 'archer', rarity: 'common' });
      G.state.heroes.push(hero);
      const quiver = createItem({ baseId: 'quiver', ilvl: 30, rarity: 'rare' });
      const bow = createItem({ baseId: 'bow', ilvl: 30, rarity: 'normal' });
      for (const it of [quiver, bow]) addToVault(it, { noAutoSalvage: true });
      // Quiver first, then the two-handed bow over the top: the order that
      // would have thrown the quiver back into the vault under the old rule.
      equipOnHero(hero.uid, quiver.uid, 'offhand');
      equipOnHero(hero.uid, bow.uid, 'weapon');
      const both = { weapon: hero.equipment.weapon?.baseId, offhand: hero.equipment.offhand?.baseId };
      // And the other order, since the displacement rule is written twice.
      const second = rollHero({ classId: 'archer', rarity: 'common' });
      G.state.heroes.push(second);
      const bow2 = createItem({ baseId: 'bow', ilvl: 30, rarity: 'normal' });
      const quiver2 = createItem({ baseId: 'quiver', ilvl: 30, rarity: 'rare' });
      for (const it of [bow2, quiver2]) addToVault(it, { noAutoSalvage: true });
      equipOnHero(second.uid, bow2.uid, 'weapon');
      equipOnHero(second.uid, quiver2.uid, 'offhand');
      return {
        both,
        reversed: { weapon: second.equipment.weapon?.baseId, offhand: second.equipment.offhand?.baseId },
      };
    });
    eq(r.both.weapon, 'bow', 'the bow should be held');
    eq(r.both.offhand, 'quiver', 'equipping a bow threw the quiver away');
    eq(r.reversed.weapon, 'bow', 'equipping a quiver put the bow down');
    eq(r.reversed.offhand, 'quiver', 'the quiver should be worn');
    return 'bow and quiver coexist, in either order';
  });

  await test('the outfitter gives an Archer a quiver and never a shield', async () => {
    // The outfitter is where this was actually going wrong: it scores whole
    // outfits, and the highest-scoring off hand for an Archer used to be a
    // buckler. It has to reach the same answer canHold does, from the other
    // direction, or the Best Gear button fights the equip rules.
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { rollHero } = await import('./src/heroes.js');
      const { gearUpHero } = await import('./src/outfit.js');
      const hero = rollHero({ classId: 'archer', rarity: 'common' });
      hero.level = 40;
      G.state.heroes.push(hero);
      for (const baseId of ['bow', 'quiver', 'shield_dex', 'shield_str', 'dagger', 'sword2h']) {
        addToVault(createItem({ baseId, ilvl: 40, rarity: 'rare' }), { noAutoSalvage: true });
      }
      gearUpHero(hero.uid, { quiet: true });
      return {
        weapon: hero.equipment.weapon?.baseId ?? null,
        offhand: hero.equipment.offhand?.baseId ?? null,
      };
    });
    // Trained, rather than specifically a bow. An Archer knows bows and
    // daggers both, and a rare bow that rolled badly genuinely can lose to a
    // rare dagger that rolled well — asserting "bow" would be pinning one
    // roll of the dice and calling it a rule.
    ok(['bow', 'dagger'].includes(r.weapon), `the outfitter armed the Archer with ${r.weapon}`);
    eq(r.offhand, 'quiver', `the outfitter put ${r.offhand} in the Archer's off hand`);
    return `${r.weapon} and quiver, chosen over two shields and a greatsword`;
  });

  await test('the outfitter will not hand anybody a weapon they are untrained with', async () => {
    // Not enforced anywhere — it falls out of the scoring, which is the point.
    // A rule the planner has to be told about is a rule that drifts.
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { rollHero } = await import('./src/heroes.js');
      const { gearUpHero } = await import('./src/outfit.js');
      const { CLASS_BY_ID, weaponProficiency } = await import('./src/data/heroclasses.js');
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const out = [];
      for (const cls of HERO_CLASSES) {
        G.state.vault.length = 0;
        const hero = rollHero({ classId: cls.id, rarity: 'common' });
        hero.level = 40;
        G.state.heroes.push(hero);
        // One of everything, so the choice is genuinely open every time — and
        // off hands included, because that is the choice a real vault offers.
        // Without them a Bard, whose two families are the two lightest bases in
        // the game, does better with a greataxe it swings badly than with a
        // wand it swings well, and rightly so: this is a penalty, not a ban.
        for (const baseId of ['sword1h', 'axe1h', 'axe2h', 'sword2h', 'mace1h', 'dagger',
          'wand', 'staff', 'bow', 'shield_str', 'shield_dex', 'shield_int', 'quiver']) {
          addToVault(createItem({ baseId, ilvl: 40, rarity: 'rare' }), { noAutoSalvage: true });
        }
        gearUpHero(hero.uid, { quiet: true });
        out.push({
          classId: cls.id,
          held: hero.equipment.weapon?.baseId ?? null,
          trained: weaponProficiency(CLASS_BY_ID[cls.id], hero.equipment.weapon) >= 1,
        });
      }
      return out;
    });
    for (const row of r) ok(row.held, `${row.classId} was left unarmed`);
    const untrained = r.filter((x) => !x.trained);
    // Not "never": an exceptional roll on a heavy weapon can still out-damage
    // an ordinary one on a light weapon at half value, and it should. Measured
    // at one case in 480 across every class. What is asserted is that the
    // scoring is decisive rather than advisory — the planner is never told this
    // rule, so if it drifted from the engine it would drift far, not slightly.
    ok(untrained.length <= 1,
      `the outfitter armed ${untrained.length} of ${r.length} classes with something they are `
      + `untrained with: ${untrained.map((x) => `${x.classId}/${x.held}`).join(', ')}`);
    return `${r.length - untrained.length} of ${r.length} classes armed with what they know`;
  });

  // ---- The affix pool ----------------------------------------------------

  await test('a fighter’s weapon and a caster’s roll different modifiers', async () => {
    const r = await page.evaluate(async () => {
      const { eligibleAffixes } = await import('./src/data/affixes.js');
      const { itemTags } = await import('./src/items.js');
      const { createItem } = await import('./src/items.js');
      const defs = (baseId) => eligibleAffixes(
        itemTags(createItem({ baseId, ilvl: 120, rarity: 'normal' })), 120,
      );
      // Weight, not just count: an affix nobody rolls is not a compensation
      // for one everybody does, and prefixes and suffixes are drawn from
      // separate pots so they have to balance separately.
      const weigh = (list, type) => list.filter((a) => a.type === type)
        .reduce((sum, a) => sum + a.weight, 0);
      const sword = defs('sword1h');
      const wand = defs('wand');
      const staff = defs('staff');
      const ids = (list) => new Set(list.map((a) => a.id));
      const s = ids(sword); const w = ids(wand);
      return {
        swordOnly: [...s].filter((id) => !w.has(id)).sort(),
        wandOnly: [...w].filter((id) => !s.has(id)).sort(),
        shared: [...s].filter((id) => w.has(id)).length,
        wandStaffAgree: [...w].sort().join(',') === [...ids(staff)].sort().join(','),
        swordSize: s.size,
        wandSize: w.size,
        swordPrefix: weigh(sword, 'prefix'), wandPrefix: weigh(wand, 'prefix'),
        swordSuffix: weigh(sword, 'suffix'), wandSuffix: weigh(wand, 'suffix'),
      };
    });
    const near = (a, b) => Math.abs(a - b) / Math.max(a, b) < 0.1;
    ok(near(r.swordPrefix, r.wandPrefix),
      `prefix weight is lopsided: sword ${r.swordPrefix}, wand ${r.wandPrefix}`);
    ok(near(r.swordSuffix, r.wandSuffix),
      `suffix weight is lopsided: sword ${r.swordSuffix}, wand ${r.wandSuffix}`);
    ok(r.wandStaffAgree, 'a wand and a staff should draw from the same pool');
    eq(r.swordOnly.join(','), 'flat_phys,inc_phys,life_leech', 'modifiers only a fighter’s weapon rolls');
    eq(r.wandOnly.join(','), 'flat_spell,inc_healing,inc_spell',
      'modifiers only a caster’s weapon rolls');
    eq(r.swordSize, r.wandSize, `pools differ in size: sword ${r.swordSize}, wand ${r.wandSize}`);
    return `${r.shared} shared, ${r.swordOnly.length} each side, `
      + `weights ${r.swordPrefix}/${r.swordSuffix} vs ${r.wandPrefix}/${r.wandSuffix}`;
  });

  await test('the split holds in practice, not just in the table', async () => {
    // Rolling real items, because eligibleAffixes is only half the path — the
    // other half is that the local weapon modifiers are read by base id in
    // itemBaseStats, and a caster line missed there would silently do nothing.
    const r = await page.evaluate(async () => {
      const { createItem, itemMods, itemBaseStats } = await import('./src/items.js');
      const seen = { sword: new Set(), wand: new Set() };
      for (let i = 0; i < 400; i++) {
        for (const [key, baseId] of [['sword', 'sword1h'], ['wand', 'wand']]) {
          for (const m of itemMods(createItem({ baseId, ilvl: 100, rarity: 'rare' }))) seen[key].add(m.text);
        }
      }
      const has = (set, re) => [...set].some((t) => re.test(t));
      // A local percentage has to move the weapon's own damage line, or the
      // caster half is a cosmetic rename of nothing.
      const plain = createItem({ baseId: 'wand', ilvl: 100, rarity: 'normal' });
      const bare = itemBaseStats(plain).physMax;
      plain.affixes.push({ defId: 'inc_spell', tierIndex: 0, values: [100] });
      const scaled = itemBaseStats(plain).physMax;
      return {
        swordPhys: has(seen.sword, /Physical Damage/),
        swordSpell: has(seen.sword, /Spell Damage/),
        swordHeal: has(seen.sword, /increased Healing/),
        wandSpell: has(seen.wand, /Spell Damage/),
        wandPhys: has(seen.wand, /Physical Damage/),
        wandHeal: has(seen.wand, /increased Healing/),
        wandLabel: itemBaseStats(plain).caster,
        bare, scaled,
      };
    });
    ok(r.swordPhys && !r.swordSpell, 'a sword rolled spell damage, or none at all');
    ok(r.wandSpell && !r.wandPhys, 'a wand rolled physical damage, or none at all');
    ok(r.wandHeal && !r.swordHeal, 'increased Healing should be a caster line and only a caster line');
    ok(r.wandLabel, 'a wand should be labelled a caster weapon');
    ok(r.scaled > r.bare * 1.5,
      `increased Spell Damage did not scale the weapon (${r.bare} → ${r.scaled})`);
    return `800 items: swords roll physical, wands roll spell, and only wands roll healing`;
  });

  await test('increased Healing reaches the healer and nobody else', async () => {
    const r = await page.evaluate(async () => {
      const { heroStats } = await import('./src/stats.js');
      const { createItem } = await import('./src/items.js');
      const blank = {
        helmet: null, body: null, gloves: null, boots: null, amulet: null,
        ring1: null, ring2: null, offhand: null,
      };
      const sheet = (classId, weapon) => heroStats({
        uid: 'h', classId, rarity: 'common', level: 50, xp: 0, stamina: 100, traits: [], specs: [],
        equipment: { ...blank, weapon },
      }, {});
      // One staff, measured before and after. Two freshly created ones are not
      // comparable: every weapon rolls its own implicit, and a caster weapon's
      // implicit pool now contains a healing line, so the control could arrive
      // already carrying the thing under test.
      const staff = createItem({ baseId: 'staff', ilvl: 60, rarity: 'normal' });
      const clericBefore = sheet('cleric', staff).healPower;
      staff.affixes.push({ defId: 'inc_healing', tierIndex: 4, values: [25] });
      return {
        clericBefore,
        clericAfter: sheet('cleric', staff).healPower,
        wizardAfter: sheet('wizard', staff).healPower,
      };
    });
    ok(r.clericAfter > r.clericBefore * 1.2,
      `a Cleric gained nothing from increased Healing (${r.clericBefore} → ${r.clericAfter})`);
    eq(r.wizardAfter, 0, 'a Wizard should heal for nothing, however much healing it carries');
    return `Cleric ${Math.round(r.clericBefore)} → ${Math.round(r.clericAfter)} per cast, Wizard unmoved at 0`;
  });

  await test('the roster marks an untrained weapon rather than hiding it', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { addToVault } = await import('./src/inventory.js');
      const { equipOnHero, rollHero } = await import('./src/heroes.js');
      const { openHeroModal } = await import('./src/ui/roster.js');
      const hero = rollHero({ classId: 'wizard', rarity: 'common' });
      G.state.heroes.push(hero);
      const axe = createItem({ baseId: 'axe2h', ilvl: 30, rarity: 'normal' });
      addToVault(axe, { noAutoSalvage: true });
      const took = equipOnHero(hero.uid, axe.uid);
      openHeroModal(hero.uid);
      const cell = document.querySelector('#heroDoll [data-slot="weapon"]');
      const marked = cell?.classList.contains('untrained');
      // And a trained one is left alone, so the marker means something.
      const staff = createItem({ baseId: 'staff', ilvl: 30, rarity: 'normal' });
      addToVault(staff, { noAutoSalvage: true });
      equipOnHero(hero.uid, staff.uid);
      openHeroModal(hero.uid);
      const quiet = !document.querySelector('#heroDoll [data-slot="weapon"]')?.classList.contains('untrained');
      return { took, marked, quiet, title: cell?.getAttribute('title') ?? '' };
    });
    ok(r.took, 'the Wizard was refused the axe — training is meant to be a penalty, not a ban');
    ok(r.marked, 'an untrained weapon was not marked on the equipment doll');
    ok(/trained with/i.test(r.title), `the marker explains nothing: "${r.title}"`);
    ok(r.quiet, 'a trained weapon was marked untrained');
    return `marked, and it says: "${r.title}"`;
  });

  await test('an older save puts down what it may no longer carry', async () => {
    // Otherwise the slot is frozen: the item is unequippable, so it can never
    // be swapped for a legal one and the hero keeps it forever.
    const r = await page.evaluate(async () => {
      const { createState } = await import('./src/state.js');
      const { deserialize } = await import('./src/save.js');
      const { createItem } = await import('./src/items.js');
      const { rollHero } = await import('./src/heroes.js');

      const state = createState('Old Save');
      const archer = rollHero({ classId: 'archer', rarity: 'common' });
      const warrior = rollHero({ classId: 'warrior', rarity: 'common' });
      archer.equipment.offhand = createItem({ baseId: 'shield_dex', ilvl: 20, rarity: 'rare' });
      warrior.equipment.offhand = createItem({ baseId: 'shield_str', ilvl: 20, rarity: 'rare' });
      state.heroes = [archer, warrior];
      state.vault = [];

      const loaded = deserialize({ version: 20, state: JSON.parse(JSON.stringify(state)) });
      const [a, w] = loaded.heroes;
      return {
        archerOffhand: a.equipment.offhand?.baseId ?? null,
        warriorOffhand: w.equipment.offhand?.baseId ?? null,
        vault: loaded.vault.length,
        note: (loaded.__notes ?? []).find((n) => /off hand/i.test(n)) ?? '',
      };
    });
    eq(r.archerOffhand, null, 'the Archer kept a shield it can never take off');
    eq(r.warriorOffhand, 'shield_str', 'a legal shield was taken away from a Warrior');
    eq(r.vault, 1, 'the displaced shield did not reach the vault');
    ok(r.note.length > 0, 'nothing told the player their hero had been disarmed');
    return `shield returned to the vault: "${r.note}"`;
  });

  await test('every class can reach a unique in both hands', async () => {
    // The off-hand rules nearly cost the Archer this: they went from borrowing
    // a unique shield to having no unique they could hold at all, since there
    // has never been a unique bow either.
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES, offhandStyle, weaponProficiency } = await import('./src/data/heroclasses.js');
      const { UNIQUES } = await import('./src/data/uniques.js');
      const { BASE_BY_ID } = await import('./src/data/bases.js');
      const bare = [];
      for (const c of HERO_CLASSES) {
        const holds = UNIQUES.filter((u) => {
          const base = BASE_BY_ID[u.base];
          if (base?.slot === 'weapon') return weaponProficiency(c, { baseId: u.base }) >= 1;
          if (base?.slot !== 'offhand') return false;
          if (offhandStyle(c) === 'quiver') return base.id === 'quiver';
          if (offhandStyle(c) === 'weapon') return false;
          return base.id !== 'quiver';
        });
        if (!holds.length) bare.push(c.id);
      }
      return { bare, total: UNIQUES.length };
    });
    eq(r.bare.join(','), '', 'a class with no unique it can hold in either hand');
    return `${r.total} uniques, every class trained for at least one`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
