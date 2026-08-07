// Achievements: the score, the window and the unlock toast.
//
// The two design decisions worth guarding are that progress is *derived* from
// the save rather than accumulated from events — so an old save is credited
// correctly the first time it is checked — and that a definition which throws
// cannot take the game down with it.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

export default async function run(browser) {
  suite('achievements');
  const { page, errors } = await openGame(browser, { name: 'Achievements' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  await test('every definition is well formed and cheap to ask', async () => {
    const r = await page.evaluate(async () => {
      const { ACHIEVEMENTS, CATEGORIES } = await import('./src/data/achievements.js');
      const { G } = await import('./src/state.js');
      const cats = new Set(CATEGORIES.map((c) => c.id));
      const bad = [];
      const seen = new Set();
      const started = performance.now();
      for (const a of ACHIEVEMENTS) {
        if (seen.has(a.id)) bad.push(`${a.id}: duplicate id`);
        seen.add(a.id);
        if (!a.name || !a.desc) bad.push(`${a.id}: no name or description`);
        if (!cats.has(a.category)) bad.push(`${a.id}: unknown category ${a.category}`);
        if (!(a.goal > 0)) bad.push(`${a.id}: goal is ${a.goal}`);
        if (typeof a.progress !== 'function') bad.push(`${a.id}: no progress function`);
        else {
          try {
            const v = a.progress(G.state);
            if (typeof v !== 'number' || Number.isNaN(v)) bad.push(`${a.id}: progress is ${v}`);
          } catch (e) { bad.push(`${a.id}: progress threw ${e.message}`); }
        }
      }
      return { bad, count: ACHIEVEMENTS.length, ms: performance.now() - started };
    });
    eq(r.bad.length, 0, r.bad.slice(0, 5).join('; '));
    ok(r.ms < 50, `one sweep took ${r.ms.toFixed(1)}ms — too slow to poll`);
    return `${r.count} achievements, one sweep in ${r.ms.toFixed(1)}ms`;
  });

  await test('progress is read from the save, not counted from events', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { ACHIEVEMENT_BY_ID } = await import('./src/data/achievements.js');
      const { progressOf, fractionOf } = await import('./src/achievements.js');
      const def = ACHIEVEMENT_BY_ID.tier_10;
      const before = progressOf(def);
      // Reach in and change the world. Nothing is emitted, no event fires.
      G.state.progress.highestTier = 10;
      const after = progressOf(def);
      G.state.progress.highestTier = 40;
      return { before, after, clamped: progressOf(def), fraction: fractionOf(def) };
    });
    eq(r.before, 0, 'progress was not zero on a fresh guild');
    eq(r.after, 10, 'progress did not follow the state');
    eq(r.clamped, 10, `progress ran past its goal to ${r.clamped}`);
    eq(r.fraction, 1, 'a completed achievement is not at 100%');
    return 'derived from state, clamped at the goal';
  });

  await test('a sweep unlocks what has arrived, once', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkAchievements, isUnlocked, unlockedCount } = await import('./src/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.progress.highestTier = 0;
      G.state.stats.runs = 0;
      checkAchievements();
      const atStart = unlockedCount();

      G.state.stats.runs = 1;
      const first = checkAchievements();
      const again = checkAchievements();
      return {
        atStart, first, again,
        got: isUnlocked('runs_1'),
        stamped: typeof G.state.achievements.unlocked.runs_1 === 'number',
      };
    });
    ok(r.first.includes('runs_1'), `the first run unlocked ${JSON.stringify(r.first)}`);
    eq(r.again.length, 0, 'a second sweep unlocked the same thing again');
    ok(r.got, 'the achievement is not recorded as unlocked');
    ok(r.stamped, 'no timestamp was stored');
    return `unlocked on the sweep that earned it, and not again`;
  });

  await test('achievements pay nothing but score', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkAchievements, score, totalPoints } = await import('./src/achievements.js');
      const { ACHIEVEMENTS } = await import('./src/data/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.guild.echoes = 0;
      G.state.guild.seals = 0;
      const goldBefore = G.state.guild.gold;
      G.state.progress.highestTier = 30;
      G.state.stats.runs = 500;
      checkAchievements();
      return {
        score: score(),
        total: totalPoints(),
        sumOfAll: ACHIEVEMENTS.reduce((n, a) => n + a.points, 0),
        echoes: G.state.guild.echoes,
        seals: G.state.guild.seals,
        goldMoved: G.state.guild.gold !== goldBefore,
        anyReward: ACHIEVEMENTS.some((a) => a.reward),
      };
    });
    ok(r.score > 0, 'unlocking a pile of achievements scored nothing');
    ok(!r.anyReward, 'an achievement still carries a reward');
    eq(r.echoes, 0, 'an achievement paid Echo Stones');
    eq(r.seals, 0, 'an achievement paid Raid Seals');
    ok(!r.goldMoved, 'an achievement paid gold');
    eq(r.total, r.sumOfAll, 'the advertised total does not match the sum of every achievement');
    return `scored ${r.score} of ${r.total}, paid nothing`;
  });

  await test('an old save is credited quietly for what it already did', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { backfill, unlockedCount, takePending } = await import('./src/achievements.js');
      // A guild that has plainly been playing for a long time, but has never
      // had achievements checked — exactly what loading an older save looks like.
      G.state.achievements = { unlocked: {} };
      G.state.guild.echoes = 0;
      G.state.stats.runs = 250;
      G.state.progress.highestTier = 22;
      G.state.stats.raidKills = 4;
      takePending();
      const gained = backfill();
      return {
        gained,
        total: unlockedCount(),
        pending: takePending().length,
        echoes: G.state.guild.echoes,
      };
    });
    ok(r.gained >= 4, `backfill only credited ${r.gained} achievements`);
    eq(r.pending, 0, 'backfill queued pop-ups for things done long ago');
    eq(r.echoes, 0, 'backfill paid out rewards retroactively');
    return `${r.gained} credited silently, no rewards, no notifications`;
  });

  await test('nothing is earned during the tutorial', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const {
        checkAchievements, takePending, recordFeat, unlockedCount, tickAchievements,
      } = await import('./src/achievements.js');
      const { stopTutorial, startTutorial } = await import('./src/tutorial.js');
      // The overlay itself is not what is under test, and leaving it up would
      // cover the rest of the suite.
      const stopOverlay = () => document.querySelector('#tutorial')?.classList.add('hidden');

      // Back into the tour. startTutorial takes the snapshot the restore reads,
      // exactly as it does for a real guild opening its doors.
      G.state.tutorial = { step: 0, done: false, skipped: false };
      // A clean guild, because earlier cases in this suite leave counters set
      // and the snapshot would faithfully preserve them -- which is correct
      // behaviour and useless as a starting point for this one.
      for (const k of Object.keys(G.state.stats)) G.state.stats[k] = 0;
      G.state.progress = {
        highestTier: 0, cleared: {}, firstClears: {}, raidKills: {}, bonusMult: 0,
      };
      startTutorial(0);
      stopOverlay();

      // Now the demonstration expedition happens: a real expedition raising
      // real counters.
      G.state.achievements = { unlocked: {} };
      G.state.feats = {};
      takePending();
      G.state.stats.runs = 1;
      G.state.stats.kills = 40;
      G.state.progress.highestTier = 1;

      const swept = checkAchievements().length;
      tickAchievements(60);                       // the polled sweep, too
      const feat = recordFeat('guide');
      const during = {
        swept, feat, held: unlockedCount(), pending: takePending().length,
        featStored: !!G.state.feats.guide,
      };

      // Finishing puts the counters back, so there is nothing left to credit.
      stopTutorial(false);
      const after = {
        held: unlockedCount(),
        pending: takePending().length,
        swept: checkAchievements(),
        runs: G.state.stats.runs,
        kills: G.state.stats.kills,
        tier: G.state.progress.highestTier,
      };

      // And the game is live again from here: a real action earns a real
      // achievement, loudly.
      G.state.stats.crafted = 1;
      const live = checkAchievements().length;
      return { during, after, live, announced: takePending().length };
    });
    eq(r.during.swept, 0, `${r.during.swept} achievements unlocked mid-tutorial`);
    eq(r.during.held, 0, 'the tutorial credited the guild with achievements');
    eq(r.during.pending, 0, 'a toast was queued during the tutorial');
    ok(!r.during.feat, 'a Feat of Strength was recorded during the tutorial');
    ok(!r.during.featStored, 'the tutorial wrote a feat into the save');
    eq(r.after.runs, 0, `the tour left ${r.after.runs} expeditions on the counter`);
    eq(r.after.kills, 0, `the tour left ${r.after.kills} kills on the counter`);
    eq(r.after.tier, 0, `the tour left Tier ${r.after.tier} recorded as cleared`);
    eq(r.after.held, 0, `${r.after.held} achievements were credited for the tutorial`);
    eq(r.after.swept.length, 0, `the first sweep after the tutorial unlocked: ${r.after.swept.join(', ')}`);
    eq(r.after.pending, 0, `${r.after.pending} toasts burst out as the tutorial ended`);
    ok(r.live > 0, 'achievements stayed suspended after the tutorial finished');
    ok(r.announced > 0, 'the first real unlock was not announced');
    return 'nothing during, nothing credited after, live again from the first real action';
  });

  await test('a broken definition cannot take the game down', async () => {
    const r = await page.evaluate(async () => {
      const { ACHIEVEMENTS } = await import('./src/data/achievements.js');
      const { progressOf, checkAchievements } = await import('./src/achievements.js');
      const landmine = {
        id: '__test_landmine', name: 'Landmine', desc: 'Throws.',
        category: 'guild', goal: 1, progress: () => { throw new Error('boom'); },
      };
      ACHIEVEMENTS.push(landmine);
      let threw = false;
      let value = null;
      try { value = progressOf(landmine); checkAchievements(); } catch (e) { threw = true; }
      ACHIEVEMENTS.pop();
      return { threw, value };
    });
    ok(!r.threw, 'a throwing progress function propagated out of the sweep');
    eq(r.value, 0, `a broken definition reported ${r.value} instead of no progress`);
    return 'reported as no progress, sweep continued';
  });

  await test('the sweep is polled, not hooked, and runs on its own', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { tickAchievements, isUnlocked, CHECK_INTERVAL } = await import('./src/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.heroes.length = 0;
      const { rollHero } = await import('./src/heroes.js');
      for (let i = 0; i < 10; i++) G.state.heroes.push(rollHero({ classId: 'rogue', rarity: 'common' }));
      // Nothing emitted an event. Only time passing should find this.
      tickAchievements(CHECK_INTERVAL + 0.1);
      return { got: isUnlocked('roster_ten'), interval: CHECK_INTERVAL };
    });
    ok(r.got, 'the polled sweep did not notice a change nothing announced');
    return `swept every ${r.interval}s without needing an event`;
  });

  await test('unlocks survive a save and load', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const Save = await import('./src/save.js');
      const { checkAchievements } = await import('./src/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.stats.runs = 1;
      checkAchievements();
      const before = Object.keys(G.state.achievements.unlocked).length;
      const restored = Save.deserialize(JSON.parse(atob(Save.exportSave())));
      return { before, after: Object.keys(restored.achievements?.unlocked ?? {}).length };
    });
    ok(r.before > 0, 'nothing was unlocked to save');
    eq(r.after, r.before, 'unlocks did not survive the round trip');
    return `${r.before} unlocks through a save and load`;
  });

  await test('the list the interface will read is complete', async () => {
    const r = await page.evaluate(async () => {
      const { achievementList } = await import('./src/achievements.js');
      const { ACHIEVEMENTS } = await import('./src/data/achievements.js');
      const list = achievementList();
      const shaped = list.every((x) => x.def && typeof x.unlocked === 'boolean'
        && typeof x.progress === 'number' && typeof x.fraction === 'number');
      return { count: list.length, total: ACHIEVEMENTS.length, shaped };
    });
    eq(r.count, r.total, 'the list is missing achievements');
    ok(r.shaped, 'a list entry is missing progress or unlock state');
    return `${r.count} entries, each with live progress`;
  });

  await test('every achievement has a symbol that exists', async () => {
    const r = await page.evaluate(async () => {
      const { ACHIEVEMENTS, CATEGORIES } = await import('./src/data/achievements.js');
      const { ICON_IDS, icon } = await import('./src/ui/icons.js');
      const known = new Set(ICON_IDS);
      const missing = [...ACHIEVEMENTS, ...CATEGORIES]
        .filter((a) => !known.has(a.icon)).map((a) => `${a.id}:${a.icon}`);
      const svg = icon('skull');
      return { missing, isSvg: svg.startsWith('<svg') && svg.includes('</svg>'), count: ICON_IDS.length };
    });
    eq(r.missing.length, 0, `unknown symbols: ${r.missing.slice(0, 5).join(', ')}`);
    ok(r.isSvg, 'the icon helper did not return inline SVG');
    return `${r.count} symbols, every achievement and category covered`;
  });

  await test('the window opens with a score and every category', async () => {
    const r = await page.evaluate(async () => {
      const { CATEGORIES } = await import('./src/data/achievements.js');
      document.querySelector('#btnAchievements').click();
      const modal = document.querySelector('#modalAchievements');
      const body = document.querySelector('#achievementsBody');
      const tabs = [...body.querySelectorAll('.g-tab')].map((b) => b.dataset.page);
      return {
        open: modal && !modal.classList.contains('hidden'),
        score: body.querySelector('.score-value')?.textContent ?? '',
        hasEmblem: !!body.querySelector('.score-emblem'),
        tabs: tabs.length,
        wantTabs: CATEGORIES.length + 1,
        missing: CATEGORIES.map((c) => c.id).filter((id) => !tabs.includes(id)),
        overview: body.querySelectorAll('.ach-ov').length,
      };
    });
    ok(r.open, 'the Achievements button did not open the window');
    ok(r.hasEmblem, 'no score emblem');
    ok(/^[0-9]/.test(r.score), `the score reads "${r.score}"`);
    eq(r.missing.length, 0, `categories missing a tab: ${r.missing.join(', ')}`);
    eq(r.tabs, r.wantTabs, `${r.tabs} tabs, expected ${r.wantTabs}`);
    ok(r.overview > 5, 'the summary has no progress overview');
    return `score ${r.score}, ${r.tabs} tabs, ${r.overview} progress rows`;
  });

  await test('a category page lists its achievements, earned first', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkAchievements } = await import('./src/achievements.js');
      const { openAchievements } = await import('./src/ui/achievements.js');
      G.state.achievements = { unlocked: {} };
      G.state.stats.runs = 60;
      checkAchievements();
      openAchievements('expeditions');
      const cards = [...document.querySelectorAll('#achPage .ach')];
      const earnedIdx = cards.map((c, i) => (c.classList.contains('earned') ? i : -1))
        .filter((i) => i >= 0);
      const lockedIdx = cards.map((c, i) => (c.classList.contains('locked') ? i : -1))
        .filter((i) => i >= 0);
      return {
        cards: cards.length,
        earned: earnedIdx.length,
        orderOk: !earnedIdx.length || !lockedIdx.length
          || Math.max(...earnedIdx) < Math.min(...lockedIdx),
        hasDate: !!document.querySelector('#achPage .ach.earned .ach-date'),
        hasBar: !!document.querySelector('#achPage .ach.locked .ach-bar'),
        hasPoints: !!document.querySelector('#achPage .ach-points'),
      };
    });
    ok(r.cards > 10, `only ${r.cards} achievements on the Expeditions page`);
    ok(r.earned > 0, 'nothing was earned to show');
    ok(r.orderOk, 'locked achievements are mixed in above earned ones');
    ok(r.hasDate, 'an earned achievement shows no date');
    ok(r.hasBar, 'a locked achievement shows no progress bar');
    ok(r.hasPoints, 'no points are shown');
    return `${r.cards} listed, ${r.earned} earned and sorted to the top`;
  });

  await test('unlocking raises a toast, which can be dismissed', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkAchievements, takePending } = await import('./src/achievements.js');
      const { pumpAchievementToasts } = await import('./src/ui/achievements.js');
      const { pumpToasts, clearToasts } = await import('./src/ui/toast.js');
      clearToasts();
      takePending();
      G.state.achievements = { unlocked: {} };
      G.state.stats.crafted = 1;
      checkAchievements();
      pumpAchievementToasts(); pumpToasts();
      const layer = document.querySelector('#toastLayer');
      const toast = layer?.querySelector('.ach-toast');
      const out = {
        raised: !!toast,
        name: toast?.querySelector('.toast-name')?.textContent ?? '',
        glow: !!toast?.querySelector('.toast-glow'),
        points: toast?.querySelector('.ach-points')?.textContent ?? '',
        icon: !!toast?.querySelector('svg'),
      };
      out.shown = document.querySelectorAll('#toastLayer .ach-toast').length;
      const { queuedToasts } = await import('./src/ui/toast.js');
      out.queued = queuedToasts();
      toast?.click();
      out.afterClick = document.querySelectorAll('#toastLayer .ach-toast').length;
      return out;
    });
    ok(r.raised, 'no toast appeared for a fresh unlock');
    ok(r.name.length > 0, 'the toast has no achievement name');
    ok(r.glow, 'the toast has no glow element');
    ok(r.icon, 'the toast has no symbol');
    ok(/^[0-9]+$/.test(r.points), `the toast shows points as "${r.points}"`);
    // A single sweep can unlock a dozen ladders at once. Three on screen, the
    // rest waiting, rather than a wall of notifications.
    ok(r.shown <= 3, `${r.shown} toasts on screen at once`);
    eq(r.afterClick, r.shown - 1, 'clicking a toast did not dismiss it');
    return `"${r.name}" for ${r.points} points; ${r.shown} shown, ${r.queued} queued`;
  });

  await test('the toast sits clear of everything else', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { checkAchievements, takePending } = await import('./src/achievements.js');
      const { pumpAchievementToasts } = await import('./src/ui/achievements.js');
      const { pumpToasts, clearToasts } = await import('./src/ui/toast.js');
      const { closeModals } = await import('./src/ui/modals.js');
      closeModals();
      clearToasts(); takePending();
      G.state.achievements = { unlocked: {} };
      G.state.stats.salvaged = 20;
      checkAchievements();
      pumpAchievementToasts(); pumpToasts();
      const toast = document.querySelector('.ach-toast');
      const t = toast.getBoundingClientRect();
      const overlaps = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const b = el.getBoundingClientRect();
        return !(t.right < b.left || t.left > b.right || t.bottom < b.top || t.top > b.bottom);
      };
      const out = {
        onScreen: t.top >= 0 && t.left >= 0
          && t.right <= window.innerWidth && t.bottom <= window.innerHeight,
        hitsLog: overlaps('#guildLog'),
        hitsStatus: overlaps('#statusbar'),
        hitsTopBar: overlaps('#topActions'),
      };
      clearToasts();
      return out;
    });
    ok(r.onScreen, 'the toast is off screen');
    ok(!r.hitsLog, 'the toast covers the guild log');
    ok(!r.hitsStatus, 'the toast covers the status bar');
    ok(!r.hitsTopBar, 'the toast covers the top bar');
    return 'clear of the log, the status bar and the top bar';
  });

  await test('feats of strength are recorded when they happen', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { recordFeat, checkAchievements, isUnlocked } = await import('./src/achievements.js');
      G.state.feats = {};
      G.state.achievements = { unlocked: {} };
      const first = recordFeat('guide');
      const second = recordFeat('guide');
      checkAchievements();
      return {
        first, second,
        unlocked: isUnlocked('feat_guide'),
        stamped: typeof G.state.feats.guide === 'number',
      };
    });
    ok(r.first, 'recording a feat for the first time returned false');
    ok(!r.second, 'the same feat was recorded twice');
    ok(r.stamped, 'the feat was not timestamped');
    ok(r.unlocked, 'the sweep did not turn the feat into an achievement');
    return 'recorded once, swept into an achievement';
  });

  await test('opening the guide and settings each earn a feat', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { closeModals } = await import('./src/ui/modals.js');
      G.state.feats = {};
      document.querySelector('#btnGuide').click();
      closeModals();
      document.querySelector('#btnSettings').click();
      closeModals();
      return { guide: !!G.state.feats.guide, settings: !!G.state.feats.settings };
    });
    ok(r.guide, 'opening the handbook recorded no feat');
    ok(r.settings, 'opening settings recorded no feat');
    return 'both recorded from the real buttons';
  });

  await test('no page errors', () => clean(errors));
  await page.close();
}
