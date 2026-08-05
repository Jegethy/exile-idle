// The deep raids: the three bosses past Tier 22, and the two rewards that come
// only from them.
//
// They exist because the raid ladder stopped at Tier 22 while gear now improves
// to Tier 32, and because Echo Stones come only from raids — so a guild at Tier
// 30 was farming Tier 22 bosses for them.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('deep raids');
  const { page, errors } = await openGame(browser, { name: 'DeepRaids' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('the raid ladder now reaches past the tier ladder', async () => {
    const r = await page.evaluate(async () => {
      const { RAIDS } = await import('./src/data/dungeons.js');
      const tiers = RAIDS.map((x) => x.tier);
      const seals = RAIDS.map((x) => x.seals);
      const echoes = RAIDS.map((x) => x.reward.echoes);
      const rising = (xs) => xs.every((v, i) => i === 0 || v > xs[i - 1]);
      return {
        count: RAIDS.length, deepest: Math.max(...tiers),
        tiersRise: rising(tiers), sealsRise: rising(seals), echoesRise: rising(echoes),
        deep: RAIDS.filter((x) => x.reward.deepUnique).length,
      };
    });
    ok(r.deepest >= 32, `the deepest raid is only Tier ${r.deepest}, and gear improves to Tier 32`);
    ok(r.tiersRise && r.sealsRise && r.echoesRise, 'raids do not escalate consistently');
    eq(r.deep, 3, `${r.deep} raids drop deep uniques`);
    return `${r.count} raids to Tier ${r.deepest}, three of them deep`;
  });

  await test('deep uniques cannot drop from anything else', async () => {
    const r = await page.evaluate(async () => {
      const { UNIQUES, uniquesFor, deepUniques } = await import('./src/data/uniques.js');
      // Sweep well past any item level the game can reach in normal play.
      const leaked = [];
      for (const ilvl of [85, 110, 150, 300, 9999]) {
        for (const u of uniquesFor(ilvl)) if (u.deep) leaked.push(`${u.id} at ilvl ${ilvl}`);
      }
      return {
        leaked,
        deep: deepUniques().length,
        total: UNIQUES.length,
        ordinary: uniquesFor(9999).length,
      };
    });
    eq(r.leaked.length, 0, `deep uniques leaked into the ordinary pool: ${r.leaked.join(', ')}`);
    eq(r.ordinary, r.total - r.deep, 'the ordinary pool is the wrong size');
    return `${r.deep} deep uniques, invisible to every ordinary drop`;
  });

  await test('every deep unique gives something up', async () => {
    const r = await page.evaluate(async () => {
      const { deepUniques } = await import('./src/data/uniques.js');
      const bad = [];
      for (const u of deepUniques()) {
        if (!u.reactions?.length) bad.push(`${u.id}: no effect`);
        if (u.lvl < 90) bad.push(`${u.id}: item level requirement is only ${u.lvl}`);
        // A hand-made unique that is simply better than a rare in every respect
        // makes the affix system pointless at the top end. Each must cost
        // something: a reduced stat, or a line saying what it takes away.
        const text = u.mods.map((m) => m.text(m.r ? m.r[1] : 0)).join(' ').toLowerCase();
        const costs = /reduced|cannot|less|no /.test(text);
        if (!costs) bad.push(`${u.id}: pure upside`);
      }
      return { bad, names: deepUniques().map((u) => u.name) };
    });
    eq(r.bad.length, 0, r.bad.join('; '));
    return r.names.join(', ');
  });

  await test('maximum resistance cannot be stacked to immunity', async () => {
    const r = await page.evaluate(async () => {
      const { heroStats } = await import('./src/stats.js');
      const { createItem } = await import('./src/items.js');
      const empty = {
        weapon: null, offhand: null, helmet: null, body: null, gloves: null,
        boots: null, amulet: null, ring1: null, ring2: null,
      };
      const mk = (equipment, traits) => heroStats({
        uid: 'h', classId: 'guardian', rarity: 'legendary', level: 90, xp: 0,
        stamina: 100, traits, skills: [], skill: null, equipment,
      }, {}).res.fire.cap;
      return {
        plain: mk({ ...empty }, []),
        loaded: mk(
          { ...empty, offhand: createItem({ uniqueId: 'gravewarden', ilvl: 110 }) },
          ['juggernaut'],
        ),
      };
    });
    eq(r.plain, 75, `the default resistance cap is ${r.plain}`);
    ok(r.loaded > 75, 'stacking max resistance did nothing at all');
    ok(r.loaded <= 90, `max resistance reached ${r.loaded}% — near immunity`);
    return `${r.plain}% by default, ${r.loaded}% fully stacked, hard ceiling 90%`;
  });

  await test('a deep raid pays what it says, at a fixed item level', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatchRaid, tickAll } = await import('./src/expedition.js');
      const { rollHero } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');
      const { DEEP_ILVL, BLANK_ILVL, RAID_BY_ID } = await import('./src/data/dungeons.js');
      const { deepUniques } = await import('./src/data/uniques.js');

      const deepIds = new Set(deepUniques().map((u) => u.id));
      let sawUnique = 0; let blanks = 0; let runs = 0;
      for (let n = 0; n < 12; n++) {
        while (G.state.expeditions.length) G.state.expeditions.pop();
        G.state.heroes.length = 0;
        for (const cls of ['guardian', 'cleric', 'rogue', 'archer', 'wizard']) {
          const h = rollHero({ classId: cls, rarity: 'legendary' });
          h.level = 200; h.stamina = 100;
          G.state.heroes.push(h);
        }
        G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
        refreshSheets();
        G.state.guild.seals = 999;
        G.state.progress.highestTier = 40;
        G.state.vault.length = 0;
        if (!dispatchRaid(G.state.parties[0].id, 'the_hollow_star').ok) break;
        const run_ = G.state.expeditions[0];
        for (let i = 0; i < 20 && !run_.enemies.length; i++) tickAll(0.1);
        for (const e of run_.enemies) e.life = 1;
        for (let i = 0; i < 600 && G.state.expeditions.length; i++) tickAll(0.1);
        runs++;
        for (const it of G.state.vault) {
          if (it.uniqueId && deepIds.has(it.uniqueId)) { sawUnique++; if (it.ilvl !== DEEP_ILVL) return { badIlvl: it.ilvl }; }
          if (it.rarity === 'normal' && it.ilvl === BLANK_ILVL) blanks++;
        }
      }
      return {
        runs, sawUnique, blanks,
        want: RAID_BY_ID.the_hollow_star.reward.blanks, DEEP_ILVL, BLANK_ILVL,
      };
    });
    ok(!r.badIlvl, `a deep unique dropped at item level ${r.badIlvl}, not ${r.DEEP_ILVL}`);
    ok(r.runs > 0, 'the deep raid could not be dispatched');
    ok(r.sawUnique >= r.runs, `only ${r.sawUnique} deep uniques from ${r.runs} guaranteed drops`);
    // Blanks are a chase item at roughly a unique's rate, so a fixed count is
    // the wrong assertion. What matters is that they arrive at all, and at the
    // right item level.
    ok(r.blanks > 0, `no blank base in ${r.runs} kills at a ${Math.round(r.want * 100)}% rate`);
    return `${r.runs} kills: ${r.sawUnique} deep uniques at ilvl ${r.DEEP_ILVL}, `
      + `${r.blanks} blanks at ilvl ${r.BLANK_ILVL}`;
  });

  await test('a blank base is genuinely blank, and worth working on', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { createItem } = await import('./src/items.js');
      const { AFFIXES, availableTiers } = await import('./src/data/affixes.js');
      const { BLANK_ILVL, tierToIlvl } = await import('./src/data/dungeons.js');
      const blank = createItem({ ilvl: BLANK_ILVL, rarity: 'normal' });
      // The point of a blank at this level: every affix can roll its best tier,
      // and ordinary drops cannot reach it until far deeper content.
      const topTierAvailable = AFFIXES.every(
        (a) => availableTiers(a, BLANK_ILVL).length === a.tiers.length,
      );
      let firstOrdinaryTier = 0;
      for (let t = 1; t <= 60; t++) {
        if (AFFIXES.every((a) => availableTiers(a, tierToIlvl(t)).length === a.tiers.length)) {
          firstOrdinaryTier = t; break;
        }
      }
      return {
        rarity: blank.rarity,
        affixes: (blank.affixes ?? []).length,
        ilvl: blank.ilvl,
        topTierAvailable,
        firstOrdinaryTier,
      };
    });
    eq(r.rarity, 'normal', 'a blank base is not Normal rarity');
    eq(r.affixes, 0, `a blank base arrived with ${r.affixes} modifiers`);
    ok(r.topTierAvailable, `item level ${r.ilvl} cannot roll every affix's best tier`);
    ok(r.firstOrdinaryTier >= 33,
      `ordinary drops reach the top affix band at Tier ${r.firstOrdinaryTier}, so blanks are not special`);
    return `Normal, no modifiers, ilvl ${r.ilvl} — every affix at its best tier, `
      + `which ordinary drops do not reach until Tier ${r.firstOrdinaryTier}`;
  });

  await test('the raid panel shows the deep rewards', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { renderRaids } = await import('./src/ui/raids.js');
      G.state.progress.highestTier = 40;
      G.state.guild.seals = 999;
      renderRaids();
      const text = document.querySelector('#raidList')?.textContent ?? '';
      const cards = document.querySelectorAll('#raidList .boss-card').length;
      return {
        cards,
        namesDeep: ['The Sunless Court', 'The Sundered Titan', 'The Hollow Star']
          .filter((n) => text.includes(n)).length,
        mentionsUnique: text.includes('deep unique'),
        mentionsBlank: text.includes('blank base'),
      };
    });
    eq(r.cards, 8, `${r.cards} raid cards rendered`);
    eq(r.namesDeep, 3, 'the deep raids are missing from the panel');
    ok(r.mentionsUnique && r.mentionsBlank, 'the panel does not advertise the deep rewards');
    return `${r.cards} raids listed, deep rewards shown`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
