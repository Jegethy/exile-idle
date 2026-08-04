// Equippable skills. A hero rolls three and uses one, which is what makes two
// Rogues play differently.
//
// The constraint that matters most is eligibility. A Warlock is a ranged
// spellcaster: if it could roll melee skills it might be offered two it can
// never use and one it can, which is not a choice at all.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('skills');
  const { page, errors } = await openGame(browser, { name: 'Skills' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('nobody is offered a skill they could never use', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const { skillPoolFor } = await import('./src/data/skills.js');
      const problems = [];
      const thin = [];
      for (const c of HERO_CLASSES) {
        const pool = skillPoolFor(c);
        for (const s of pool) {
          const req = s.req ?? {};
          if (req.role && req.role !== c.role) problems.push(`${c.id} offered ${s.id} (${req.role} only)`);
          if (req.reach && req.reach !== c.reach) problems.push(`${c.id} offered ${s.id} (${req.reach} only)`);
          if (req.school && req.school !== c.school && c.school !== 'hybrid') {
            problems.push(`${c.id} offered ${s.id} (${req.school} only)`);
          }
        }
        if (pool.length < 4) thin.push(`${c.id}:${pool.length}`);
      }
      return { problems, thin };
    });
    eq(r.problems.length, 0, r.problems.slice(0, 5).join('; '));
    eq(r.thin.length, 0, `too few skills to choose from — ${r.thin.join(', ')}`);
    return 'every class sees only skills it can use';
  });

  await test('a warlock is never offered a melee skill', async () => {
    const r = await page.evaluate(async () => {
      const { CLASS_BY_ID } = await import('./src/data/heroclasses.js');
      const { skillPoolFor } = await import('./src/data/skills.js');
      const melee = skillPoolFor(CLASS_BY_ID.warlock).filter((s) => s.req?.reach === 'melee');
      const archerSpells = skillPoolFor(CLASS_BY_ID.archer).filter((s) => s.req?.school === 'spell');
      return { melee: melee.map((s) => s.id), archerSpells: archerSpells.map((s) => s.id) };
    });
    eq(r.melee.length, 0, `warlock offered melee: ${r.melee.join(', ')}`);
    eq(r.archerSpells.length, 0, `archer offered spells: ${r.archerSpells.join(', ')}`);
    return 'warlock sees no melee, archer sees no spells';
  });

  await test('a new hero rolls three and has one equipped', async () => {
    const r = await page.evaluate(async () => {
      const { rollHero } = await import('./src/heroes.js');
      const { SKILL_BY_ID } = await import('./src/data/skills.js');
      const bad = [];
      const distinct = new Set();
      for (let i = 0; i < 60; i++) {
        const h = rollHero({});
        if (h.skills.length !== 3) bad.push(`${h.classId} rolled ${h.skills.length}`);
        if (new Set(h.skills).size !== h.skills.length) bad.push(`${h.classId} rolled a duplicate`);
        if (!h.skills.includes(h.skill)) bad.push(`${h.classId} equipped one it does not have`);
        if (h.skills.some((s) => !SKILL_BY_ID[s])) bad.push(`${h.classId} rolled an unknown skill`);
        for (const s of h.skills) distinct.add(s);
      }
      return { bad, distinct: distinct.size };
    });
    eq(r.bad.length, 0, r.bad.slice(0, 4).join('; '));
    ok(r.distinct > 8, `sixty heroes only ever saw ${r.distinct} different skills`);
    return `three each, ${r.distinct} distinct across sixty heroes`;
  });

  await test('swapping changes what the hero brings into a fight', async () => {
    const r = await page.evaluate(async () => {
      const { rollHero, equipSkill } = await import('./src/heroes.js');
      const { reactionsFor } = await import('./src/expedition/abilities.js');
      const { SKILL_BY_ID } = await import('./src/data/skills.js');
      const h = rollHero({ classId: 'rogue', rarity: 'common' });
      const sheet = { avgHit: 10, dps: 10 };
      const keysFor = (id) => {
        equipSkill(h, id);
        return reactionsFor(h, sheet).map((x) => x.key);
      };
      const a = keysFor(h.skills[0]);
      const b = keysFor(h.skills[1]);
      const none = keysFor(null);
      const wantA = SKILL_BY_ID[h.skills[0]].reactions.map((x) => x.key);
      const wantB = SKILL_BY_ID[h.skills[1]].reactions.map((x) => x.key);
      return {
        aHas: wantA.every((k) => a.includes(k)),
        bHas: wantB.every((k) => b.includes(k)),
        aDropped: wantA.every((k) => !b.includes(k)),
        noneHas: wantA.concat(wantB).some((k) => none.includes(k)),
        classAbilityKept: none.length > 0,
      };
    });
    ok(r.aHas && r.bHas, 'an equipped skill contributed no reactions');
    ok(r.aDropped, 'the previous skill kept firing after being swapped out');
    ok(!r.noneHas, 'skill reactions fired with nothing equipped');
    ok(r.classAbilityKept, 'unequipping a skill also removed the class ability');
    return 'reactions follow the equipped skill';
  });

  await test('a skill actually does something in combat', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { dispatch, tickAll } = await import('./src/expedition.js');
      const { rollHero, equipSkill } = await import('./src/heroes.js');
      const { refreshSheets } = await import('./src/sheets.js');

      const measure = (skillId) => {
        while (G.state.expeditions.length) G.state.expeditions.pop();
        G.state.heroes.length = 0;
        for (const cls of ['guardian', 'wizard', 'cleric']) {
          const h = rollHero({ classId: cls, rarity: 'common' });
          h.level = 40; h.stamina = 100;
          G.state.heroes.push(h);
        }
        const wiz = G.state.heroes.find((h) => h.classId === 'wizard');
        wiz.skills = [...new Set([skillId, ...wiz.skills])];
        equipSkill(wiz, skillId);
        G.state.parties[0].members = G.state.heroes.map((h) => h.uid);
        refreshSheets();
        dispatch(G.state.parties[0].id, 'mines', 8);
        const run_ = G.state.expeditions[0];
        let seen = false;
        for (let i = 0; i < 1200 && G.state.expeditions.length; i++) {
          tickAll(0.1);
          const c = run_.combatants.find((x) => x.classId === 'wizard');
          if (!c) break;
          if (run_.enemies.some((e) => e.effects?.some((f) => f.id.startsWith('skill-kindling')))) seen = true;
        }
        const c = run_.combatants.find((x) => x.classId === 'wizard');
        return { seen, damage: Math.round(c?.damageDealt ?? 0) };
      };
      return { with: measure('kindling'), without: measure('siphon') };
    });
    ok(r.with.seen, 'Kindling never applied its burn over a whole run');
    ok(r.with.damage > 0, 'the wizard dealt no damage at all');
    return `Kindling applied; ${r.with.damage} damage with it, ${r.without.damage} with Siphon`;
  });

  await test('an old save learns skills on load', async () => {
    const r = await page.evaluate(async () => {
      const { rollHero, grantMissingSkills } = await import('./src/heroes.js');
      const h = rollHero({ classId: 'warlock', rarity: 'common' });
      delete h.skills; delete h.skill;                    // as an old save would be
      const changed = grantMissingSkills(h);
      const again = grantMissingSkills(h);
      return { changed, again, count: h.skills.length, equipped: h.skill };
    });
    ok(r.changed, 'a hero with no skills was left with none');
    ok(!r.again, 'a hero with skills had them rerolled');
    eq(r.count, 3, 'wrong number granted');
    ok(r.equipped, 'nothing was equipped after the grant');
    return 'granted three, equipped one, idempotent';
  });

  await test('the hero sheet offers the choice', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { openHeroModal } = await import('./src/ui/roster.js');
      const hero = G.state.heroes[0];
      openHeroModal(hero.uid);
      const btns = [...document.querySelectorAll('#heroModalBody [data-skill]')];
      const before = hero.skill;
      const other = btns.find((b) => b.dataset.skill !== before);
      other?.click();
      const after = hero.skill;
      const active = document.querySelectorAll('#heroModalBody .skill.active').length;
      return { count: btns.length, before, after, active };
    });
    eq(r.count, 3, 'the hero sheet did not offer three skills');
    ok(r.before !== r.after, 'clicking a skill did not equip it');
    eq(r.active, 1, `${r.active} skills shown as active`);
    return `three offered, clicking swapped ${r.before} → ${r.after}`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
