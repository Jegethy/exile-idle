// story.js — the engine behind data/story.js.
//
// It knows about no chapter individually. It asks the current one how far along
// its objective is, advances when that arrives, and applies whatever the
// chapter unlocks. Adding a chapter is a change to the data file and nothing
// else.
//
// Three decisions, all borrowed from systems that already work here:
//
// Progress is DERIVED, never accumulated — the rule achievements.js follows.
// Every objective is a function of the current save rather than a counter
// ticked from an event, so a guild that predates a chapter is credited for what
// it has already done, and no counter can drift from the thing it counts.
//
// Checking is POLLED, not hooked. Hanging listeners off a dozen events would
// mean every new chapter needs a new hook, and one missed emit is a bug nobody
// notices for a month. A sweep over one cheap function costs nothing.
//
// Unlocking is GRANTED, never chosen — the Charter's rule. A chapter does not
// ask; reaching it is the promise being kept.

import { G, emit, log } from './state.js';
import { CHAPTERS, LEGEND_BY_ID, SYSTEM_BY_ID, SYSTEMS } from './data/story.js';
import { rollHero } from './heroes.js';
import { refreshSheets } from './sheets.js';
import { tierToLevel } from './data/dungeons.js';

/** How often the sweep runs, in seconds of game time. Matches achievements. */
export const CHECK_INTERVAL = 2;

let sinceCheck = 0;

function store(state = G.state) {
  const s = state;
  if (!s) return null;
  if (!s.story) s.story = { chapter: 0, done: false, skipped: false, claimed: {} };
  if (!s.story.claimed) s.story.claimed = {};
  return s.story;
}

// ---------------------------------------------------------------------------
// Reading where the guild is
// ---------------------------------------------------------------------------

/** The chapter the guild is on, or null once the line is finished. */
export function currentChapter(state = G.state) {
  const st = store(state);
  if (!st || st.done) return null;
  return CHAPTERS[st.chapter] ?? null;
}

/**
 * Where the current chapter's counter stood when the chapter opened.
 *
 * This is what makes a chapter ask for its *own* work rather than for a running
 * total. "Complete two expeditions" followed by "complete four expeditions" made
 * the second chapter a single extra run, and read as a progress bar that was
 * already most of the way full before the beat had been introduced. Each
 * chapter now asks for what it asks for, counted from the moment it began.
 *
 * Only counting objectives need it. A threshold — "clear a Tier 12 expedition"
 * — is absolute by nature: you cannot un-clear a tier, and asking for twelve
 * *more* tiers would be nonsense.
 */
function markOf(state, ch) {
  const st = store(state);
  if (!st || ch?.objective?.kind === 'reach') return 0;
  // Lazily taken, so a save written before marks existed, or one whose chapter
  // was reached by some route that forgot to set it, starts counting from here
  // rather than crediting everything that came before.
  if (typeof st.mark !== 'number') st.mark = ch?.objective?.progress(state) ?? 0;
  return st.mark;
}

/**
 * How far through the current chapter's objective the guild is.
 * @returns {{have: number, goal: number, done: boolean} | null}
 */
export function objectiveProgress(state = G.state) {
  const ch = currentChapter(state);
  if (!ch) return null;
  const goal = ch.objective.goal;
  const raw = ch.objective.progress(state) ?? 0;
  const have = Math.max(0, raw - markOf(state, ch));
  return { have: Math.min(have, goal), goal, done: have >= goal };
}

/** Chapters the guild has finished, in order. */
export function completedChapters(state = G.state) {
  const st = store(state);
  if (!st) return [];
  return st.done ? CHAPTERS.slice() : CHAPTERS.slice(0, st.chapter);
}

/** Whether the questline has been finished properly, reward and all. */
export function storyComplete(state = G.state) {
  return !!store(state)?.done;
}

/** Whether the guild waved the questline away. It may still go back to it. */
export function storySkipped(state = G.state) {
  return !!store(state)?.skipped;
}

/**
 * Is the guild being asked to go and *press* something?
 *
 * The difference matters to the interface and to nothing else. Most objectives
 * are satisfied by playing — run four expeditions, reach Tier 15 — and need no
 * prompting, because the player is already doing them. A handful ask for a
 * visit to a screen they have never seen and will not think to open, and those
 * are exactly the chapters carrying a `teaches` pointer. Left unmarked they are
 * where a questline stalls: the guild is waiting on a button the player does
 * not know exists.
 */
export function chapterNeedsAction(state = G.state) {
  const ch = currentChapter(state);
  if (!ch || !ch.teaches || storySkipped(state)) return false;
  return !objectiveProgress(state)?.done;
}

/**
 * Whether the player still has to be told what the glow on the tab means.
 *
 * Once, on the first chapter that asks for something. A marker that is never
 * explained is a marker that gets ignored.
 */
export function needsActionPrompt(state = G.state) {
  const st = store(state);
  return !!st && !st.claimed.actionPrompt && chapterNeedsAction(state);
}

/** Records that the explanation has been given. */
export function markActionPromptSeen(state = G.state) {
  const st = store(state);
  if (!st || st.claimed.actionPrompt) return false;
  st.claimed.actionPrompt = true;
  return true;
}

// ---------------------------------------------------------------------------
// The unlock rule
// ---------------------------------------------------------------------------

/**
 * Is this system available to the player?
 *
 * The rule, and the most important line in the file: a system opens on the
 * EARLIER of the story reaching the chapter that grants it, and the thing that
 * would have revealed it anyway happening.
 *
 * The second half is not a convenience. Without it a player who stops following
 * the questline is locked out of crafting for the life of that guild, one bad
 * chapter pointer bricks a save, and any bug in the objective predicates
 * becomes unrecoverable rather than merely wrong. With it the questline can
 * only ever bring a system forward, never hold it back — which is the Charter's
 * rule (nothing that already exists was moved behind a gate) honoured by a
 * system whose whole purpose is to put things behind gates.
 */
export function systemUnlocked(id, state = G.state) {
  const def = SYSTEM_BY_ID[id];
  if (!def) return true;                       // unknown system: never hidden
  const st = store(state);
  if (!st || st.done || st.skipped) return true;

  // Granted by a chapter the guild has reached — inclusive of the current one,
  // and that is not an off-by-one. A chapter opens a system and then asks the
  // guild to go and use it, which is the entire point of teaching a thing at
  // the moment it matters. Granting on completion instead deadlocks outright:
  // "recruit a fourth hero" cannot be the objective of the chapter that unlocks
  // recruiting.
  for (let i = 0; i <= st.chapter && i < CHAPTERS.length; i++) {
    if (CHAPTERS[i].unlocks?.includes(id)) return true;
  }
  // Or found the ordinary way.
  try {
    return !!def.natural(state);
  } catch {
    // A predicate that throws must not take a system away with it.
    return true;
  }
}

/** Every system, with whether it is currently open. For the UI and for tests. */
export function unlockedSystems(state = G.state) {
  return Object.fromEntries(SYSTEMS.map((x) => [x.id, systemUnlocked(x.id, state)]));
}

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------

/** Chapters newly finished that the interface has not yet shown. */
export const pending = [];

/**
 * Advances the questline if the current objective has been met.
 *
 * Loops, because a chapter may already be complete the moment it opens — a
 * guild that skipped and came back could satisfy four chapters at once, and
 * making it wait two seconds per chapter to be told so would be silly. The
 * guard is the chapter count, so a predicate that always returns true cannot
 * spin.
 *
 * @returns {number} chapters completed by this call
 */
export function checkStory(state = G.state) {
  const st = store(state);
  if (!st || st.done) return 0;
  // Nothing moves during the tutorial. Its own rule is that the screen does not
  // change between one press and the next, and the demonstration expedition is
  // scripted — a chapter completing under the overlay would both break that and
  // credit the guild for a run it did not really make. Read from the save
  // rather than a flag, which is what achievements.js learned to do: a tab
  // closed and reopened mid-tour would miss a flag entirely.
  const tut = state?.tutorial;
  if (tut && !tut.done) return 0;

  let advanced = 0;
  for (let guard = 0; guard < CHAPTERS.length; guard++) {
    const ch = CHAPTERS[st.chapter];
    if (!ch) break;
    const p = objectiveProgress(state);
    if (!p?.done) break;

    // Where the next chapter starts counting from.
    //
    // When it watches the *same* counter, the baseline is the exact point this
    // chapter was satisfied rather than wherever the counter happens to stand
    // now. Those differ after any jump — an offline catch-up finishing ten
    // expeditions at once would otherwise complete "run two" and then demand
    // two more on top of the eight already banked, quietly charging the player
    // for idling. Taking the baseline from the goal instead of the clock means
    // ten runs pays for both chapters, which is what the player did.
    //
    // Across different counters there is nothing to carry, so it is retaken
    // lazily against whatever the next chapter actually watches.
    const from = markOf(state, ch);
    const next = CHAPTERS[st.chapter + 1];
    st.chapter++;
    advanced++;
    pending.push(ch);
    if (next && next.objective.progress === ch.objective.progress
      && next.objective.kind !== 'reach') {
      st.mark = from + ch.objective.goal;
    } else {
      delete st.mark;
    }
    log(`<b>${ch.title}</b> — ${ch.narrative}`, 'unique');
    for (const id of ch.unlocks ?? []) {
      const sys = SYSTEM_BY_ID[id];
      if (sys) log(`${sys.name} is open to the guild.`, 'loot');
    }
    if (st.chapter >= CHAPTERS.length) {
      st.done = true;
      log('The Ninth is finished. Two stay at the door. One walks out.', 'unique');
      break;
    }
  }
  if (advanced) emit('story');
  return advanced;
}

/** Called from the game loop. Cheap, and rate-limited to CHECK_INTERVAL. */
export function tickStory(dt) {
  sinceCheck += dt;
  if (sinceCheck < CHECK_INTERVAL) return;
  sinceCheck = 0;
  checkStory();
}

/**
 * Waves the questline away.
 *
 * Deliberately NOT the same thing as finishing it. Every system opens at once
 * and the prompts stop, but the chapters stay exactly where they were and the
 * line can be resumed at any time — so this is a decision about whether to be
 * guided, not a decision about what the guild gets to have. A skip that
 * forfeited the reward would be an irreversible choice made in the first
 * minute, by a player who has not yet seen what they are giving up, and there
 * is no version of that which is a real choice rather than a trap.
 */
export function skipStory(state = G.state) {
  const st = store(state);
  if (!st || st.skipped || st.done) return false;
  st.skipped = true;
  log('The guild puts the paybook in a drawer. Every hall and workshop is opened.', 'sys');
  emit('story');
  emit('roster');
  return true;
}

/** Takes the guild back to the questline it set aside. */
export function resumeStory(state = G.state) {
  const st = store(state);
  if (!st || !st.skipped) return false;
  st.skipped = false;
  // Counting starts again from here. A guild that ran four hundred expeditions
  // while the paybook sat in a drawer is not owed the first four chapters —
  // and being handed them all at once on the way back in would be a worse
  // welcome than being asked for two more runs. Thresholds still credit
  // instantly through checkStory, since a cleared tier stays cleared.
  delete st.mark;
  checkStory(state);
  log('The guild takes the paybook back out of the drawer.', 'sys');
  emit('story');
  return true;
}

// ---------------------------------------------------------------------------
// The reward
// ---------------------------------------------------------------------------

/** Whether the three are waiting at the door and nobody has been named yet. */
export function legendsWaiting(state = G.state) {
  const st = store(state);
  return !!st && st.done && !st.claimed.legend;
}

/** Which legend was taken, if any. */
export function claimedLegend(state = G.state) {
  return store(state)?.claimed?.legend ?? null;
}

/**
 * Takes one of the three home. Permanent, and there is no second visit.
 *
 * The hero is minted at the guild's own level rather than at one, because the
 * questline's own objectives are the time gate — reaching the last chapter
 * means clearing Tier 24, and somebody who has done that does not need a
 * level-one legend. No artificial delay is bolted on top of that: the work of
 * getting here *is* the delay.
 *
 * @returns {{ok: boolean, msg: string, hero?: object}}
 */
export function claimLegend(legendId, state = G.state) {
  const st = store(state);
  const def = LEGEND_BY_ID[legendId];
  if (!st || !def) return { ok: false, msg: 'No such legend.' };
  if (!st.done) return { ok: false, msg: 'You have not reached the door yet.' };
  if (st.claimed.legend) return { ok: false, msg: 'Somebody already walked home with you.' };

  // Anchored to the content the guild has actually beaten as well as to its own
  // roster. Reading the roster alone would hand a level-one legend to anyone
  // who happened to be rebuilding, and the tier is the honest measure of how
  // far this guild has come — it cannot be lowered, and reaching the last
  // chapter means having cleared Tier 24.
  const level = Math.max(
    1,
    tierToLevel(state.progress?.highestTier ?? 0),
    ...state.heroes.map((h) => h.level ?? 1),
  );
  const hero = rollHero({ classId: def.classId, rarity: 'legendary', level });
  hero.name = def.name;
  // The tag, and the whole of what it buys: a second skill slot. Rarity is
  // untouched — see LEGENDS in data/story.js for why that matters.
  hero.unique = true;
  hero.legendId = def.id;
  hero.skill2 = null;
  state.heroes.push(hero);
  st.claimed.legend = def.id;

  refreshSheets();
  log(`${hero.name} joins the guild. Nobody else will ever fight the way they do.`, 'unique');
  emit('story');
  emit('roster');
  return { ok: true, msg: `${hero.name} joins the guild.`, hero };
}

/**
 * Brings an existing guild in line with a questline it never had.
 *
 * The rule this exists to keep: no save may ever lose a tab it can currently
 * see. A guild that has been playing for forty hours must not open the game to
 * find the workshop hidden behind chapter five.
 *
 * Anything that has run an expedition is marked as having set the line aside,
 * which opens everything at once and leaves the questline there to be taken up
 * deliberately. A guild that has done nothing at all is genuinely new and
 * starts at the beginning.
 */
export function migrateStory(state) {
  const st = store(state);
  if (!st) return false;
  if (st.done || st.skipped) return false;
  const played = (state.stats?.runs ?? 0) > 0
    || (state.progress?.highestTier ?? 0) > 0
    || !!state.tutorial?.done;
  if (!played) return false;
  st.skipped = true;
  return true;
}
