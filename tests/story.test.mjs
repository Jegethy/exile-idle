// The questline: what it hides, what it opens, and what it must never take away.
//
// Most of this suite is about the second half of the unlock rule rather than
// the first. Hiding a tab is easy and the story engine does it in one line;
// what is hard, and what these checks exist for, is that hiding can only ever
// be temporary and can only ever apply to a guild that has not got there yet.
// A questline that could lock an established guild out of its own workshop
// would be worse than having no questline at all.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, clean } from './assert.mjs';

/** A page whose guild is still on the questline — the harness skips it by default. */
function guided(browser, name) {
  return openGame(browser, { name, story: true });
}

export default async function run(browser) {
  suite('the questline');

  // ---- What a new guild can and cannot see -------------------------------

  {
    const { page, errors } = await guided(browser, 'StoryGates');

    await test('a new guild starts on chapter one with the deep systems shut', async () => {
      const r = await page.evaluate(async () => {
        const { currentChapter, unlockedSystems } = await import('./src/story.js');
        const { CHAPTERS } = await import('./src/data/story.js');
        const visible = (tab) => {
          const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
          return !!btn && !btn.hidden;
        };
        return {
          chapter: currentChapter()?.id ?? null,
          total: CHAPTERS.length,
          open: unlockedSystems(),
          tabs: {
            expeditions: visible('expeditions'), vault: visible('vault'),
            quests: visible('quests'), roster: visible('roster'),
            hall: visible('hall'), raids: visible('raids'), contracts: visible('contracts'),
            workshop: visible('workshop'),
          },
        };
      });
      eq(r.chapter, 'honest_work', 'a new guild should open on the first chapter');
      // The game must be playable on its first second.
      for (const always of ['expeditions', 'vault', 'quests', 'roster']) {
        ok(r.tabs[always], `${always} was hidden, and it is the game`);
      }
      for (const shut of ['hall', 'raids', 'contracts', 'workshop']) {
        ok(!r.tabs[shut], `${shut} was open before the questline reached it`);
      }
      return `chapter 1 of ${r.total}, four tabs open and four shut`;
    });

    await test('the line is written, ordered, and opens each system exactly once', async () => {
      // Structural, because the prose will be edited again and the ordering is
      // the part that quietly breaks. A depth objective that goes backwards
      // between chapters is a questline that completes two at a time.
      const r = await page.evaluate(async () => {
        const { CHAPTERS, LEGENDS, SYSTEMS } = await import('./src/data/story.js');
        const { CLASS_BY_ID } = await import('./src/data/heroclasses.js');
        const opened = CHAPTERS.flatMap((c) => c.unlocks ?? []);
        const tiers = CHAPTERS.filter((c) => /Tier (\d+)/.test(c.objective.text))
          .map((c) => c.objective.goal);
        return {
          thin: CHAPTERS.filter((c) => !c.title || !c.act || (c.narrative ?? '').length < 80)
            .map((c) => c.id),
          dupIds: CHAPTERS.length - new Set(CHAPTERS.map((c) => c.id)).size,
          opened,
          dupOpens: opened.length - new Set(opened).size,
          unopened: SYSTEMS.map((x) => x.id).filter((id) => !opened.includes(id)),
          ascending: tiers.every((t, i) => i === 0 || t > tiers[i - 1]),
          tiers,
          rewards: CHAPTERS.filter((c) => c.reward).map((c) => c.id),
          roles: LEGENDS.map((l) => CLASS_BY_ID[l.classId]?.role).sort(),
        };
      });
      eq(r.thin.join(','), '', 'a chapter has no beat written for it');
      eq(r.dupIds, 0, 'two chapters share an id, and the id is what the save stores');
      eq(r.dupOpens, 0, `a system is opened by two chapters: ${r.opened.join(',')}`);
      eq(r.unopened.join(','), '', 'a gated system is never opened by any chapter');
      ok(r.ascending, `tier objectives do not ascend: ${r.tiers.join(', ')}`);
      eq(r.rewards.join(','), 'one_of_you', 'the reward should hang off the last chapter alone');
      // One per role is the whole shape of the choice.
      eq(r.roles.join(','), 'DPS,Healer,Tank', 'the three at the door should be one per role');
      return `12 chapters, ${r.opened.length} systems opened once each, tiers ${r.tiers.join('/')}`;
    });

    await test('a chapter opens its system on arrival, not on completion', async () => {
      // Otherwise the chapter that unlocks recruiting cannot ask you to
      // recruit, which is a deadlock rather than a nuisance.
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, currentChapter, systemUnlocked } = await import('./src/story.js');
        G.state.stats.runs = 4;                       // satisfies chapters 1 and 2
        checkStory();
        return {
          chapter: currentChapter()?.id ?? null,
          recruit: systemUnlocked('recruit'),
          hall: systemUnlocked('hall'),
        };
      });
      eq(r.chapter, 'more_hands', 'two chapters should have completed');
      ok(r.recruit, 'the chapter that asks you to recruit had recruiting shut');
      ok(!r.hall, 'a later chapter opened its system early');
      return 'recruiting open on the chapter that needs it, the hall still shut';
    });

    await test('a chapter that opens a system redraws the control it asks for', async () => {
      // The hard lock, and the reason it deserves a check of its own: chapter
      // three opens recruiting and then tells the player to recruit, but the
      // Hiring Hall button lives in the roster header. Redrawing only the quest
      // panel left the button that completes the chapter not existing, so the
      // questline stopped dead with no way forward and no error to explain it.
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, currentChapter, systemUnlocked } = await import('./src/story.js');
        const btn = () => !!document.querySelector('#btnRecruit');
        G.state.stats.runs = 0;
        G.state.story = { chapter: 0, done: false, skipped: false, claimed: {} };
        const { renderAll } = await import('./src/ui.js');
        renderAll();
        const before = btn();
        // Reach the chapter the way play does, through the sweep alone.
        G.state.stats.runs = 2; checkStory();
        G.state.stats.runs = 4; checkStory();
        return {
          before,
          chapter: currentChapter()?.id ?? null,
          unlocked: systemUnlocked('recruit'),
          // No renderAll here on purpose: the emit the engine fires is the only
          // thing that may be relied on to put the button on screen.
          after: btn(),
        };
      });
      eq(r.chapter, 'more_hands', 'the guild did not reach the recruiting chapter');
      ok(!r.before, 'the Hiring Hall was on screen before the chapter opened it');
      ok(r.unlocked, 'the chapter did not open recruiting');
      ok(r.after, 'recruiting opened but the Hiring Hall button was never drawn — hard lock');
      return 'the button the chapter asks for appears when the chapter opens';
    });

    await test('Show Me reaches a real element on every chapter that offers it', async () => {
      // "More Hands" points at the roster, which is the tab a new guild is
      // already looking at — so switching tab changed nothing on screen and the
      // button read as broken. The tab is only half the instruction.
      const r = await page.evaluate(async () => {
        const { CHAPTERS } = await import('./src/data/story.js');
        const missing = [];
        for (const ch of CHAPTERS) {
          if (!ch.teaches) continue;
          if (!ch.teaches.target) { missing.push(`${ch.id}: no target`); continue; }
          const tab = document.querySelector(`.tab[data-tab="${ch.teaches.tab}"]`);
          if (!tab) { missing.push(`${ch.id}: no tab ${ch.teaches.tab}`); continue; }
          if (!document.querySelector(ch.teaches.target)) {
            missing.push(`${ch.id}: ${ch.teaches.target}`);
          }
        }
        return { missing, teaching: CHAPTERS.filter((c) => c.teaches).length };
      });
      eq(r.missing.join(', '), '', 'a Show Me button points at nothing');
      return `${r.teaching} chapters offer it, every target resolves`;
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  // ---- The tutorial and the questline, running together ------------------

  {
    // The state every genuinely new player is in, and the one the shared
    // harness hides by skipping both. The two systems collided here: six
    // tutorial steps navigated to tabs the questline had just started hiding,
    // so the tour walked into a wall and every suite still passed.
    const { page, errors } = await openGame(browser, {
      name: 'StoryTutorial', tutorial: true, story: true,
    });

    await test('every tutorial step points at something a new guild can see', async () => {
      const r = await page.evaluate(async () => {
        const { STEPS } = await import('./src/tutorial.js');
        const bad = [];
        for (const step of STEPS) {
          if (step.tab) {
            const btn = document.querySelector(`.tab[data-tab="${step.tab}"]`);
            if (!btn || btn.hidden) { bad.push(`${step.id} -> ${step.tab}`); continue; }
          }
          if (step.target && !document.querySelector(step.target)) {
            bad.push(`${step.id} -> ${step.target}`);
          }
        }
        return { bad, steps: STEPS.length };
      });
      eq(r.bad.join(', '), '', 'a tutorial step points at a tab the questline is hiding');
      return `${r.steps} steps, every tab and target reachable`;
    });

    await test('the questline stands still while the tour is running', async () => {
      // The tutorial's own rule is that nothing on screen changes between one
      // press and the next, and its expedition is scripted — a chapter
      // completing underneath it would break both.
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, currentChapter } = await import('./src/story.js');
        G.state.stats.runs = 50;
        const moved = checkStory();
        const during = currentChapter()?.id ?? null;
        G.state.tutorial.done = true;
        const after = checkStory();
        return { moved, during, after, then: currentChapter()?.id ?? null };
      });
      eq(r.moved, 0, 'the questline advanced during the tutorial');
      eq(r.during, 'honest_work', 'the guild left chapter one mid-tour');
      ok(r.after > 0, 'the questline did not catch up once the tour ended');
      return `held at chapter one, then caught up ${r.after} chapters at the end`;
    });

    await test('the tour pays nothing towards the questline', async () => {
      // The demonstration expedition is scripted, dispatched under instruction,
      // run at triple speed and impossible to lose. Crediting it towards
      // "complete two expeditions" would award the tutorial rather than the
      // player, and would hand back a chapter the guild never earned.
      //
      // Two mechanisms have to hold together: the questline stands still while
      // the tour runs, and the tour puts its counters back before it ends. The
      // second is what this is really checking, because the first alone would
      // simply defer the credit by a few seconds.
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { STEPS, startTutorial, stopTutorial } = await import('./src/tutorial.js');
        const { checkStory, currentChapter, objectiveProgress } = await import('./src/story.js');

        G.state.tutorial = { step: 0, done: false, skipped: false };
        G.state.story = { chapter: 0, done: false, skipped: false, claimed: {} };
        G.state.stats.runs = 0;
        G.state.progress.highestTier = 0;
        startTutorial(0);
        // Whatever the tour gets up to, in one lump.
        G.state.stats.runs += 3;
        G.state.progress.highestTier = 2;
        const during = checkStory();
        stopTutorial(false);
        const after = checkStory();
        const p = objectiveProgress();
        return {
          steps: STEPS.length,
          during,
          after,
          runs: G.state.stats.runs,
          tier: G.state.progress.highestTier,
          chapter: currentChapter()?.id ?? null,
          have: p?.have ?? -1,
        };
      });
      eq(r.during, 0, 'the questline advanced during the tour');
      eq(r.after, 0, 'the tour paid for a chapter the moment it ended');
      eq(r.runs, 0, 'the demonstration expedition was left on the counter');
      eq(r.tier, 0, 'the tour left the guild credited with a tier it did not push');
      eq(r.chapter, 'honest_work', 'the guild did not start the questline where it should');
      eq(r.have, 0, 'the first chapter opened with progress already on it');
      return 'counters back to zero, chapter one at 0/2';
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  // ---- Each chapter asks for its own work --------------------------------

  {
    const { page, errors } = await guided(browser, 'StoryCounts');

    await test('a chapter counts from where it opened, not from zero', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, currentChapter, objectiveProgress } = await import('./src/story.js');
        const shot = () => {
          const p = objectiveProgress();
          return `${currentChapter()?.id}:${p.have}/${p.goal}`;
        };
        const seen = [shot()];
        G.state.stats.runs = 1; seen.push(shot());
        G.state.stats.runs = 2; checkStory(); seen.push(shot());
        G.state.stats.runs = 3; seen.push(shot());
        G.state.stats.runs = 4; checkStory(); seen.push(shot());
        return { seen };
      });
      // Two expeditions, then two more. The second chapter must not open with
      // its bar already half full from work done before the beat existed.
      eq(r.seen.join(' '),
        'honest_work:0/2 honest_work:1/2 wage_ledger:0/2 wage_ledger:1/2 more_hands:0/1',
        'a chapter inherited progress from the one before it');
      return r.seen.join(' → ');
    });

    await test('finishing several chapters at once does not charge twice', async () => {
      // Offline catch-up lands ten expeditions in one sweep. Taking the next
      // baseline from the clock rather than from the goal would complete "run
      // two" and then ask for two more on top of the eight already banked,
      // quietly charging the player for having idled.
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, currentChapter } = await import('./src/story.js');
        // Both reset together: a fresh questline on a save that already had
        // runs banked is the resume case, not the offline case, and there the
        // baseline is meant to be taken from now.
        G.state.story = { chapter: 0, done: false, skipped: false, claimed: {} };
        G.state.stats.runs = 0;
        checkStory();
        G.state.stats.runs = 10;                 // one sweep, ten runs banked
        const moved = checkStory();
        return { moved, chapter: currentChapter()?.id ?? null };
      });
      eq(r.moved, 2, 'ten expeditions should pay for both two-run chapters at once');
      eq(r.chapter, 'more_hands', 'the guild should be on the recruiting chapter');
      return 'ten runs paid for both chapters, no double charge';
    });

    await test('the tab glows only while a chapter wants a press', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, chapterNeedsAction, currentChapter } = await import('./src/story.js');
        const { renderQuestMark } = await import('./src/ui/quests.js');
        const lit = () => {
          renderQuestMark();
          return !!document.querySelector('.tab[data-tab="quests"]')?.classList.contains('quest-call');
        };
        G.state.story = { chapter: 0, done: false, skipped: false, claimed: { actionPrompt: true } };
        G.state.stats.runs = 0;
        checkStory();
        // Chapter one is satisfied by playing, so nothing should be shouting.
        const onRuns = { chapter: currentChapter()?.id, lit: lit(), needs: chapterNeedsAction() };
        G.state.stats.runs = 10; checkStory();
        // Chapter three wants the player to go and press something.
        const onRecruit = { chapter: currentChapter()?.id, lit: lit(), needs: chapterNeedsAction() };
        // Recruiting satisfies it, and the next chapter wants the Guild Hall —
        // so the glow correctly stays on, following the chapter rather than
        // switching off. What must silence it is having nothing to ask for.
        G.state.stats.recruited += 1; checkStory();
        const next = { chapter: currentChapter()?.id, lit: lit() };
        const { skipStory } = await import('./src/story.js');
        skipStory();
        return { onRuns, onRecruit, next, shelved: lit() };
      });
      ok(!r.onRuns.lit, `the tab glowed on "${r.onRuns.chapter}", which is satisfied by playing`);
      ok(r.onRecruit.lit && r.onRecruit.needs,
        `the tab did not glow on "${r.onRecruit.chapter}", which waits on a button`);
      ok(r.next.lit, `the glow did not follow on to "${r.next.chapter}", which also wants a press`);
      ok(!r.shelved, 'the tab kept glowing after the questline was set aside');
      return `quiet on ${r.onRuns.chapter}, lit on ${r.onRecruit.chapter} and ${r.next.chapter}, quiet once shelved`;
    });

    await test('the glow is explained once and then never again', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, needsActionPrompt, markActionPromptSeen } = await import('./src/story.js');
        // Self-contained: put the guild on a chapter that wants a press, with
        // the explanation not yet given.
        G.state.story = { chapter: 0, done: false, skipped: false, claimed: {} };
        G.state.stats.runs = 0;
        checkStory();
        G.state.stats.runs = 10;
        checkStory();
        const first = needsActionPrompt();
        const marked = markActionPromptSeen();
        return { first, marked, second: needsActionPrompt(), again: markActionPromptSeen() };
      });
      ok(r.first, 'the first chapter needing a press did not offer an explanation');
      ok(r.marked && !r.second && !r.again, 'the explanation would be shown more than once');
      return 'explained on the first chapter that wants a press, and not after';
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  // ---- The half of the rule that matters ---------------------------------

  {
    const { page, errors } = await guided(browser, 'StoryNatural');

    await test('a system opens on its own trigger with the story untouched', async () => {
      // The load-bearing half. Without it a player who stops following the
      // questline is locked out of crafting for the life of the guild, and one
      // bad chapter pointer bricks a save.
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { systemUnlocked, currentChapter } = await import('./src/story.js');
        const before = systemUnlocked('crafting');
        // Depth, not held materials: a new guild is handed eight copper ore at
        // the door, so "holds a material" was true on the first frame and the
        // gate never existed at all.
        G.state.progress.highestTier = 3;
        const afterCraft = systemUnlocked('crafting');
        G.state.progress.highestTier = 9;
        return {
          before,
          afterCraft,
          raids: systemUnlocked('raids'),
          contracts: systemUnlocked('contracts'),
          // And none of it advanced the story, which is the point: the trigger
          // brings a system forward, it does not play the questline for you.
          chapter: currentChapter()?.id ?? null,
        };
      });
      ok(!r.before, 'crafting was already open');
      ok(r.afterCraft, 'depth did not open the workbench');
      ok(r.raids && r.contracts, 'depth did not open raids and contracts');
      eq(r.chapter, 'honest_work', 'a natural unlock should not advance the questline');
      return 'workbench, raids and contracts opened without the story moving';
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  // ---- Skipping ----------------------------------------------------------

  {
    const { page, errors } = await guided(browser, 'StorySkip');

    await test('setting it aside opens everything and forfeits nothing', async () => {
      const r = await page.evaluate(async () => {
        const { skipStory, resumeStory, unlockedSystems, currentChapter, storySkipped } = await import('./src/story.js');
        skipStory();
        const shut = Object.entries(unlockedSystems()).filter(([, open]) => !open).map(([id]) => id);
        const hidden = ['hall', 'raids', 'contracts', 'workshop']
          .filter((t) => document.querySelector(`.tab[data-tab="${t}"]`)?.hidden);
        const skipped = storySkipped();
        // And it can be taken up again, which is what makes skipping safe to
        // offer at all: nothing is decided permanently in the first minute.
        resumeStory();
        return { shut, hidden, skipped, resumed: !storySkipped(), chapter: currentChapter()?.id ?? null };
      });
      eq(r.shut.join(','), '', 'a system stayed shut after skipping');
      eq(r.hidden.join(','), '', 'a tab stayed hidden after skipping');
      ok(r.skipped, 'the skip was not recorded');
      ok(r.resumed, 'the questline could not be taken up again');
      eq(r.chapter, 'honest_work', 'resuming lost the guild its place');
      return 'everything opened, and the line was still there afterwards';
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  // ---- Existing saves ----------------------------------------------------

  {
    const { page, errors } = await guided(browser, 'StoryMigrate');

    await test('an established guild never loses a tab it could already see', async () => {
      // The single worst thing this feature could do: a guild forty hours in
      // opening the game to find the workshop behind chapter five.
      const r = await page.evaluate(async () => {
        const { createState } = await import('./src/state.js');
        const { deserialize } = await import('./src/save.js');
        const { unlockedSystems, storySkipped } = await import('./src/story.js');
        const { SYSTEMS } = await import('./src/data/story.js');

        const old = createState('Long Running');
        old.stats.runs = 400;
        old.progress.highestTier = 22;
        delete old.story;                              // predates the questline
        const loaded = deserialize({ version: 20, state: JSON.parse(JSON.stringify(old)) });

        return {
          skipped: storySkipped(loaded),
          shut: SYSTEMS.filter((x) => !unlockedSystems(loaded)[x.id]).map((x) => x.id),
          note: (loaded.__notes ?? []).find((n) => /questline/i.test(n)) ?? '',
        };
      });
      eq(r.shut.join(','), '', 'an established guild had a system taken away from it');
      ok(r.skipped, 'the questline should be set aside for a guild that predates it');
      ok(r.note, 'nothing told the player a questline had appeared');
      return `all ${'systems'} kept, and the player is told: "${r.note.slice(0, 60)}…"`;
    });

    await test('a guild that has done nothing at all starts at the beginning', async () => {
      const r = await page.evaluate(async () => {
        const { createState } = await import('./src/state.js');
        const { deserialize } = await import('./src/save.js');
        const { storySkipped, currentChapter } = await import('./src/story.js');
        const fresh = createState('Untouched');
        delete fresh.story;
        const loaded = deserialize({ version: 20, state: JSON.parse(JSON.stringify(fresh)) });
        return { skipped: storySkipped(loaded), chapter: currentChapter(loaded)?.id ?? null };
      });
      ok(!r.skipped, 'a guild that has never played was treated as an old save');
      eq(r.chapter, 'honest_work', 'a genuinely new guild should start on chapter one');
      return 'starts on chapter one';
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }

  // ---- The reward --------------------------------------------------------

  {
    const { page, errors } = await guided(browser, 'StoryLegend');

    await test('every chapter is reachable, and the last one hands over a legend', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { checkStory, storyComplete, legendsWaiting, claimLegend, claimedLegend } = await import('./src/story.js');
        const { CHAPTERS, LEGENDS } = await import('./src/data/story.js');
        const { currentChapter, objectiveProgress } = await import('./src/story.js');
        // Walked one chapter at a time rather than satisfied in bulk, because
        // counting objectives are measured from where the chapter opened — so a
        // single Object.assign proves nothing about chapters two through eight.
        // Stepping is also the stronger claim: every chapter is individually
        // completable, and none of them is a wall.
        const stalled = [];
        for (let guard = 0; guard < CHAPTERS.length * 4; guard++) {
          const ch = currentChapter();
          if (!ch) break;
          const p = objectiveProgress();
          const need = p.goal - p.have;
          // Nudge whichever counter this chapter is watching, by exactly what
          // it still wants. If that does not move it, the chapter is a wall.
          const before = ch.id;
          for (const key of ['runs', 'recruited', 'crafted', 'flasksBrewed',
            'raidKills', 'contractsRun']) {
            G.state.stats[key] += need;
          }
          G.state.upgrades.partySlots = (G.state.upgrades.partySlots ?? 0) + need;
          G.state.progress.highestTier = Math.max(G.state.progress.highestTier, ch.objective.goal);
          checkStory();
          if (currentChapter()?.id === before) { stalled.push(before); break; }
        }
        if (stalled.length) return { stalled };

        const before = G.state.heroes.length;
        const waiting = legendsWaiting();
        const res = claimLegend('legend_tank');
        const again = claimLegend('legend_healer');
        const hero = G.state.heroes.find((h) => h.unique);
        return {
          complete: storyComplete(),
          waiting,
          chapters: CHAPTERS.length,
          legends: LEGENDS.length,
          took: res.ok,
          secondRefused: !again.ok,
          gained: G.state.heroes.length - before,
          claimed: claimedLegend(),
          rarity: hero?.rarity ?? null,
          unique: !!hero?.unique,
          level: hero?.level ?? 0,
        };
      });
      eq((r.stalled ?? []).join(','), '', 'a chapter could not be completed at all');
      ok(r.complete, 'the questline could not be finished');
      ok(r.waiting, 'the three were never offered');
      eq(r.legends, 3, 'one legend per role');
      ok(r.took, 'the legend could not be claimed');
      ok(r.secondRefused, 'a second legend was handed over — there is no second visit');
      eq(r.gained, 1, 'exactly one hero should join');
      eq(r.claimed, 'legend_tank', 'the wrong legend was recorded');
      // Lateral, not vertical: Legendary's numbers and nothing above them.
      eq(r.rarity, 'legendary', `a legend rolled as ${r.rarity} rather than legendary`);
      ok(r.unique, 'the legend carries no Unique tag');
      ok(r.level > 1, 'the legend arrived at level 1, which is nobody’s idea of a legend');
      return `${r.chapters} chapters, one of three taken at level ${r.level}, legendary and tagged`;
    });

    await test('a Unique hero runs two skills, and nobody else may', async () => {
      const r = await page.evaluate(async () => {
        const { G } = await import('./src/state.js');
        const { rollHero, equipSkill, equippedSkills, skillSlots } = await import('./src/heroes.js');
        const { reactionsFor } = await import('./src/expedition/abilities.js');
        const { heroStats } = await import('./src/stats.js');
        const { SKILL_BY_ID } = await import('./src/data/skills.js');

        const make = (unique) => {
          const h = rollHero({ classId: 'guardian', rarity: 'legendary', level: 40 });
          h.unique = unique;
          h.skill = null; h.skill2 = null;
          G.state.heroes.push(h);
          return h;
        };
        const legend = make(true);
        const plain = make(false);

        // Two of the three, on each.
        const [a, b] = legend.skills;
        equipSkill(legend, a); equipSkill(legend, b);
        equipSkill(plain, plain.skills[0]); equipSkill(plain, plain.skills[1]);

        const withReactions = (h) => {
          const sheet = heroStats(h, G.state.upgrades);
          const ids = new Set(reactionsFor(h, sheet).map((x) => x.key));
          return (h.skills ?? []).filter((id) => (SKILL_BY_ID[id]?.reactions ?? [])
            .some((x) => ids.has(x.key))).length;
        };
        return {
          legendSlots: skillSlots(legend), plainSlots: skillSlots(plain),
          legendRunning: equippedSkills(legend).length,
          plainRunning: equippedSkills(plain).length,
          legendReacting: withReactions(legend),
          // Turning one off frees the slot again rather than sticking.
          togglesOff: (equipSkill(legend, a), equippedSkills(legend).length),
        };
      });
      eq(r.legendSlots, 2, 'a Unique hero should have two skill slots');
      eq(r.plainSlots, 1, 'an ordinary hero should have one');
      eq(r.legendRunning, 2, 'the legend is not running two skills');
      eq(r.plainRunning, 1, 'an ordinary hero was allowed a second skill');
      ok(r.legendReacting >= 1, 'no equipped skill reached the combat engine');
      eq(r.togglesOff, 1, 'turning a skill off did not free its slot');
      return `two slots against everyone else’s one, ${r.legendReacting} reaching combat`;
    });

    await test('no page errors', () => clean(errors));
    await page.close();
  }
}
