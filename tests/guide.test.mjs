// The Guild Handbook. Its whole value is that it is generated from the game's
// own data rather than typed out, so the checks here are mostly "does every
// page still build, and does it still contain the things it claims to list".
// A guide that silently loses half the traits is worse than no guide.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('handbook');
  const { page, errors } = await openGame(browser, { name: 'Guide' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('the button opens it', async () => {
    const r = await page.evaluate(() => {
      document.querySelector('#btnGuide').click();
      const modal = document.querySelector('#modalGuide');
      return {
        open: modal && !modal.classList.contains('hidden'),
        tabs: document.querySelectorAll('#guideBody .g-tab').length,
        hasContent: (document.querySelector('#guidePage')?.textContent ?? '').length,
      };
    });
    ok(r.open, 'clicking Guide did not open the handbook');
    ok(r.tabs >= 10, `only ${r.tabs} pages`);
    ok(r.hasContent > 200, 'the opening page is empty');
    return `${r.tabs} pages, ${r.hasContent} chars on the first`;
  });

  await test('every page builds, and none is a stub', async () => {
    const r = await page.evaluate(async () => {
      const { GUIDE_PAGES } = await import('./src/ui/guide.js');
      const bad = [];
      const thin = [];
      for (const pg of GUIDE_PAGES) {
        let html;
        try { html = pg.render(); } catch (e) { bad.push(`${pg.id}: ${e.message}`); continue; }
        if (/undefined|\[object |NaN/.test(html)) bad.push(`${pg.id}: rendered a hole`);
        const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length < 250) thin.push(`${pg.id}:${text.length}`);
      }
      return { bad, thin, count: GUIDE_PAGES.length };
    });
    eq(r.bad.length, 0, r.bad.join('; '));
    eq(r.thin.length, 0, `too little on a page — ${r.thin.join(', ')}`);
    return `${r.count} pages, all substantial`;
  });

  await test('clicking a tab switches page and returns to the top', async () => {
    const r = await page.evaluate(async () => {
      const body = document.querySelector('#guideBody');
      const before = document.querySelector('#guidePage').textContent.slice(0, 60);
      body.scrollTop = 400;
      [...body.querySelectorAll('.g-tab')].find((b) => b.dataset.page === 'raids').click();
      const { currentGuidePage } = await import('./src/ui/guide.js');
      return {
        page: currentGuidePage(),
        changed: document.querySelector('#guidePage').textContent.slice(0, 60) !== before,
        scroll: body.scrollTop,
        active: document.querySelectorAll('#guideBody .g-tab.active').length,
      };
    });
    eq(r.page, 'raids', 'the tab did not change page');
    ok(r.changed, 'the content did not change');
    eq(r.scroll, 0, `switching page left the scroll at ${r.scroll}`);
    eq(r.active, 1, `${r.active} tabs marked active`);
    return 'switched to Raids, scrolled back to the top';
  });

  await test('the traits page lists every trait', async () => {
    const r = await page.evaluate(async () => {
      const { openGuide } = await import('./src/ui/guide.js');
      const { TRAITS } = await import('./src/data/traits.js');
      openGuide('traits');
      const text = document.querySelector('#guidePage').textContent;
      const missing = TRAITS.filter((t) => !text.includes(t.name)).map((t) => t.name);
      const noDesc = TRAITS.filter((t) => !text.includes(t.desc)).map((t) => t.name);
      return { total: TRAITS.length, missing, noDesc };
    });
    eq(r.missing.length, 0, `traits missing from the guide: ${r.missing.join(', ')}`);
    eq(r.noDesc.length, 0, `traits listed without their effect: ${r.noDesc.join(', ')}`);
    return `all ${r.total} traits with their effects`;
  });

  await test('the skills page lists every skill and who can take it', async () => {
    const r = await page.evaluate(async () => {
      const { openGuide } = await import('./src/ui/guide.js');
      const { SKILLS } = await import('./src/data/skills.js');
      openGuide('skills');
      const text = document.querySelector('#guidePage').textContent;
      return {
        total: SKILLS.length,
        missing: SKILLS.filter((s) => !text.includes(s.name)).map((s) => s.id),
        noDesc: SKILLS.filter((s) => !text.includes(s.desc)).map((s) => s.id),
      };
    });
    eq(r.missing.length, 0, `skills missing: ${r.missing.join(', ')}`);
    eq(r.noDesc.length, 0, `skills without an effect line: ${r.noDesc.join(', ')}`);
    return `all ${r.total} skills`;
  });

  await test('the classes page covers every class and its ability', async () => {
    const r = await page.evaluate(async () => {
      const { openGuide } = await import('./src/ui/guide.js');
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      openGuide('classes');
      const text = document.querySelector('#guidePage').textContent;
      return {
        total: HERO_CLASSES.length,
        missing: HERO_CLASSES.filter((c) => !text.includes(c.name)).map((c) => c.id),
        noAbility: HERO_CLASSES.filter((c) => !text.includes(c.ability.name)).map((c) => c.id),
      };
    });
    eq(r.missing.length, 0, `classes missing: ${r.missing.join(', ')}`);
    eq(r.noAbility.length, 0, `classes without their ability: ${r.noAbility.join(', ')}`);
    return `all ${r.total} classes and abilities`;
  });

  await test('reference pages cover dungeons, raids and the Guild Hall', async () => {
    const r = await page.evaluate(async () => {
      const { openGuide } = await import('./src/ui/guide.js');
      const { DUNGEONS, RAIDS } = await import('./src/data/dungeons.js');
      const { UPGRADES } = await import('./src/data/upgrades.js');
      const textOf = (id) => { openGuide(id); return document.querySelector('#guidePage').textContent; };
      const exped = textOf('expeditions');
      const raids = textOf('raids');
      const guild = textOf('guild');
      return {
        dungeons: DUNGEONS.filter((d) => !exped.includes(d.name)).map((d) => d.id),
        raids: RAIDS.filter((x) => !raids.includes(x.name)).map((x) => x.id),
        upgrades: UPGRADES.filter((u) => !guild.includes(u.name)).map((u) => u.id),
      };
    });
    eq(r.dungeons.length, 0, `dungeons missing: ${r.dungeons.join(', ')}`);
    eq(r.raids.length, 0, `raids missing: ${r.raids.join(', ')}`);
    eq(r.upgrades.length, 0, `upgrades missing: ${r.upgrades.join(', ')}`);
    return 'dungeons, raids and upgrades all listed';
  });

  await test('nothing overflows the window sideways', async () => {
    for (const [w, h] of [[1180, 900], [900, 700]]) {
      await page.setViewportSize({ width: w, height: h });
      const bad = await page.evaluate(async () => {
        const { openGuide, GUIDE_PAGES } = await import('./src/ui/guide.js');
        const out = [];
        for (const pg of GUIDE_PAGES) {
          openGuide(pg.id);
          const body = document.querySelector('#guideBody');
          if (body.scrollWidth > body.clientWidth + 1) out.push(pg.id);
        }
        return out;
      });
      if (bad.length) throw new Error(`sideways scroll at ${w}x${h}: ${bad.join(', ')}`);
    }
    await page.setViewportSize({ width: 1400, height: 900 });
    return 'no horizontal overflow at 1180x900 or 900x700';
  });

  await test('the tutorial points at it', async () => {
    const r = await page.evaluate(async () => {
      const { STEPS } = await import('./src/tutorial.js');
      const step = STEPS.find((x) => x.id === 'guide');
      return { found: !!step, target: step?.target, resolves: !!document.querySelector(step?.target ?? 'x') };
    });
    ok(r.found, 'the tutorial has no step for the handbook');
    ok(r.resolves, `the step points at ${r.target}, which is not on the page`);
    return `step targets ${r.target}`;
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
