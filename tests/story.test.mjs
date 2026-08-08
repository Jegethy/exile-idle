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
      eq(r.chapter, 'first_light', 'a new guild should open on the first chapter');
      // The game must be playable on its first second.
      for (const always of ['expeditions', 'vault', 'quests', 'roster']) {
        ok(r.tabs[always], `${always} was hidden, and it is the game`);
      }
      for (const shut of ['hall', 'raids', 'contracts', 'workshop']) {
        ok(!r.tabs[shut], `${shut} was open before the questline reached it`);
      }
      return `chapter 1 of ${r.total}, four tabs open and four shut`;
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
      eq(r.during, 'first_light', 'the guild left chapter one mid-tour');
      ok(r.after > 0, 'the questline did not catch up once the tour ended');
      return `held at chapter one, then caught up ${r.after} chapters at the end`;
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
      eq(r.chapter, 'first_light', 'a natural unlock should not advance the questline');
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
      eq(r.chapter, 'first_light', 'resuming lost the guild its place');
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
      eq(r.chapter, 'first_light', 'a genuinely new guild should start on chapter one');
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
        // Satisfy every objective at once: they are derived from the save, so a
        // guild that has done all of it is credited for all of it.
        Object.assign(G.state.stats, {
          runs: 500, recruited: 5, crafted: 10, flasksBrewed: 4, raidKills: 3, contractsRun: 6,
        });
        G.state.upgrades.partySlots = 1;
        G.state.progress.highestTier = 30;
        checkStory();

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
      ok(r.complete, 'the questline could not be finished');
      ok(r.waiting, 'the cages never opened');
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
