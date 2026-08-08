// data/story.js — the questline, as data.
//
// The guild has never had a reason to exist. The Charter is a capability
// ladder with no narrative, achievements are a score that pays nothing, and
// nothing in the game ever says *why*. This is the why.
//
// The story was not invented alongside the game — it was read out of it. The
// raid and dungeon blurbs already described one thing from seven directions: a
// crowned corpse that never accepted the verdict of its own death, a throne
// room whose court still sits, a titan broken into four and buried in graves
// three of which are now empty, a crater that keeps getting deeper. Something
// down there refuses to stay buried and something patient has been digging it
// up. All of that was already written. Nobody had said it out loud.
//
// It does a second job, and that one is the reason it earns its place rather
// than merely decorating. The tutorial teaches the workbench, alchemy, the
// Guild Hall and the Charter inside the first five minutes, to a player with
// no materials and no reason to care about any of it. A chapter that opens the
// workshop at the moment the player needs a better weapon teaches the same
// thing at the moment it means something.
//
// ---------------------------------------------------------------------------
//
// A chapter is:
//
//   id         stable, never reused. It is what the save stores.
//   act        grouping for the Quests panel. Narrative only.
//   title      what the player sees.
//   narrative  the beat. Short, concrete, dry: the world is unsettling because
//              of what it states plainly, not because of how it is described.
//   objective  { text, progress(state), goal } — what to go and do.
//   unlocks    system ids revealed on completion. See story.js.
//   teaches    optional tutorial-style pointer, for the chapters that open a
//              system the player has never seen.
//
// Progress is *derived*, never accumulated — the same rule data/achievements.js
// follows, and for the same reasons. A chapter is a pure function of the save,
// so a questline that gains a chapter later credits what has already been done
// rather than stranding an existing guild, and no counter can drift from the
// thing it counts.
//
// ---------------------------------------------------------------------------
//
// Objectives are written RELATIVE, never ABSOLUTE.
//
//   good   "clear any dungeon at your highest tier"
//   bad    "clear the Sunken Crypt at Tier 8"
//
// The levelling and experience curves have moved twice in a month. An absolute
// tier written into quest data does not fail loudly when the curves move — it
// silently becomes impossible, or silently becomes free, and either way nobody
// finds out until a player is stuck. Every objective below reads a ratio or a
// count, or reads the guild's own progress back to it.

import { MATERIAL_BY_ID } from './materials.js';

// ---------------------------------------------------------------------------
// Objective helpers
// ---------------------------------------------------------------------------

/**
 * A counter straight off the save.
 *
 * Everything a chapter needs is already recorded — `recruited`, `crafted`,
 * `flasksBrewed`, `raidKills`, `contractsRun` — because achievements needed the
 * same numbers and they are derived from the save rather than accumulated from
 * events. That is why almost no new state was required for a whole questline.
 */
const stat = (key) => (s) => s.stats?.[key] ?? 0;

/** Total expeditions completed. */
const runs = stat('runs');

/** Guild Hall ranks bought, across every upgrade. */
function ranksBought(state) {
  let n = 0;
  for (const rank of Object.values(state.upgrades ?? {})) n += rank;
  return n;
}

/** How many materials of a given family the guild holds, all grades counted. */
function heldOf(state, family) {
  let n = 0;
  for (const [id, count] of Object.entries(state.materials ?? {})) {
    if (MATERIAL_BY_ID[id]?.family === family) n += count;
  }
  return n;
}

/** Any material at all, which is what the workshop needs to be worth opening. */
function heldAny(state) {
  let n = 0;
  for (const count of Object.values(state.materials ?? {})) n += count;
  return n;
}

/** Deepest tier the guild has ever cleared. */
const depth = (s) => s.progress?.highestTier ?? 0;

// ---------------------------------------------------------------------------
// The chapters
// ---------------------------------------------------------------------------

/**
 * Twelve chapters in four acts.
 *
 * The antagonist is a guild, which is the choice everything else falls out of.
 * The Ninth was struck from the rolls two centuries ago over a commission it
 * should have refused, never surrendered its charter, and never stopped
 * working. That makes it the player's own systems turned around — a charter, a
 * roster, outstanding contracts — and it explains the sealed writs that start
 * dropping at Tier 8 without inventing a single mechanic.
 *
 * Three legends went down to end it and are still down there, holding a door.
 * Not captives: a post. Which is what makes the ending a choice rather than a
 * contrivance — the door takes two to hold, three are holding it, and exactly
 * one can walk out.
 *
 * Ordering follows what the game actually gates rather than what reads well on
 * paper. Raids open at Tier 4 and contracts at Tier 8, so the raid beat comes
 * first; recruiting happens long before either, so it comes earlier still.
 *
 * PACING. Six chapters inside the first three hours and six across the next
 * fifteen, measured against the real curves — Tier 5 at about an hour, Tier 10
 * at four, Tier 20 at eighteen. The front half is onboarding wearing a story
 * and moves fast; the back half is one beat per tier band the guild was going
 * to push anyway. It finishes at Tier 20 rather than deeper on purpose: the
 * whole game runs about seventy-four hours, so this covers the first quarter
 * and leaves everything past Tier 20 as clean endgame. Carrying the finale to
 * Tier 24 would have bought ten more hours of nothing happening.
 */
export const CHAPTERS = [
  // --- Act I: something is still being paid -------------------------------
  {
    id: 'honest_work', act: 'Honest Work',
    title: 'Honest Work',
    narrative: 'The deed is signed, the hall is standing, and three people answered the '
      + 'notice. There is work under the hills that pays in coin rather than in promises.',
    objective: { text: 'Complete two expeditions', progress: runs, goal: 2 },
    unlocks: [],
  },
  {
    // The hook, and deliberately not a ransom demand. A demand tells the player
    // what to think. A paybook that does not add up makes them ask.
    id: 'wage_ledger', act: 'Honest Work',
    title: 'The Wage Ledger',
    narrative: 'Among the takings is a paybook. A crew of nineteen, wages settled monthly, '
      + 'the last entry made four weeks ago — in coin that stopped being minted before the '
      + 'flood. Somebody is still paying to dig.',
    objective: { text: 'Complete four expeditions', progress: runs, goal: 4 },
    unlocks: [],
  },
  {
    id: 'more_hands', act: 'Honest Work',
    title: 'More Hands',
    narrative: 'Nineteen names in the paybook, and three of you. The notice goes back up, '
      + 'and this time it says what the work is.',
    // Recruiting belongs here and not in the late game: a player has the gold
    // for their second hire long before they ever see a contract.
    objective: { text: 'Recruit a hero', progress: stat('recruited'), goal: 1 },
    unlocks: ['recruit'],
    teaches: { tab: 'roster', target: '#rosterHeader' },
  },

  // --- Act II: struck from the rolls --------------------------------------
  {
    id: 'dry_archive', act: 'Struck From The Rolls',
    title: 'A Dry Archive',
    narrative: 'The paybook is coming apart in the damp, and it is not the only thing in '
      + 'the hall that is. Records keep badly in a building with a bad roof.',
    objective: { text: 'Buy a Guild Hall upgrade', progress: ranksBought, goal: 1 },
    unlocks: ['hall'],
    teaches: { tab: 'hall', target: '#upgradeList' },
  },
  {
    id: 'the_ninth', act: 'Struck From The Rolls',
    title: 'The Ninth',
    narrative: 'The seal on the paybook is a guild mark. It sits on the ninth line of a roll '
      + 'closed two hundred years ago — dissolved over a commission it should have refused, '
      + 'charter never surrendered. The same mark is stamped inside half the armour coming '
      + 'out of the ground.',
    objective: { text: 'Improve an item at the workbench', progress: stat('crafted'), goal: 1 },
    unlocks: ['crafting'],
    teaches: { tab: 'workshop', target: '#craftPanel' },
  },
  {
    id: 'hollow_keeps', act: 'Struck From The Rolls',
    title: 'What the Hollow Keeps',
    narrative: 'The cocoons in Silkmoth Hollow are not moths, and what is wrapped in them '
      + 'is not dead. It is fed, watered and turned. Nobody goes to that much trouble over '
      + 'a corpse.',
    objective: { text: 'Brew a flask', progress: stat('flasksBrewed'), goal: 1 },
    unlocks: ['alchemy'],
    teaches: { tab: 'workshop', target: '#alchemyPanel' },
  },

  // --- Act III: the writ --------------------------------------------------
  {
    id: 'crowned_corpse', act: 'The Writ',
    title: 'The Crowned Corpse',
    narrative: 'The thing in the barrow wears a circlet with the Ninth’s mark cut into it. '
      + 'Guildmasters are buried holding their seal. This one has not stopped wearing his, '
      + 'and has not stopped giving orders.',
    // Raids open at Tier 4, so this objective carries its own pacing: the guild
    // cannot reach it early however keen it is. That is why no chapter here
    // needs an artificial delay bolted on to it.
    objective: { text: 'Bring down a raid boss', progress: stat('raidKills'), goal: 1 },
    unlocks: ['raids'],
    teaches: { tab: 'raids', target: '#raidList' },
  },
  {
    id: 'outstanding', act: 'The Writ',
    title: 'Outstanding Commissions',
    narrative: 'The sealed writs are contracts. The Ninth’s contracts, still open, still '
      + 'being served by whatever is left of the people who signed them. One of them names '
      + 'your hall, and the ink on it is not old.',
    // Contracts start dropping at Tier 8, which paces this one the same way.
    objective: { text: 'Run a sealed contract', progress: stat('contractsRun'), goal: 1 },
    unlocks: ['contracts'],
    teaches: { tab: 'contracts', target: '#contractPanel' },
  },
  {
    id: 'three_empty', act: 'The Writ',
    title: 'Three Are Now Empty',
    narrative: 'The Titan was taken apart and put in the ground in four places, set far '
      + 'enough apart that no one thing could walk between them. Three of the four are '
      + 'bare. That is the commission the Ninth should have refused, and they are most of '
      + 'the way through it.',
    objective: { text: 'Clear a Tier 12 expedition', progress: depth, goal: 12 },
    unlocks: [],
  },

  // --- Act IV: the Ninth --------------------------------------------------
  {
    id: 'long_watch', act: 'The Ninth',
    title: 'The Long Watch',
    narrative: 'There is a woman at a door in the dark who has been standing there long '
      + 'enough for the frame to take her shape. She is not a prisoner and she does not '
      + 'want rescuing. She wants you to go back up and forget the way down.',
    objective: { text: 'Clear a Tier 15 expedition', progress: depth, goal: 15 },
    unlocks: [],
  },
  {
    id: 'court_sits', act: 'The Ninth',
    title: 'The Court Still Sits',
    narrative: 'A hall beneath the hall, lit by nothing, with the whole membership of the '
      + 'Ninth still at the table. They are not surprised to see you. A motion is put, '
      + 'seconded and carried, and it concerns your guild.',
    objective: { text: 'Clear a Tier 17 expedition', progress: depth, goal: 17 },
    unlocks: [],
  },
  {
    id: 'one_of_you', act: 'The Ninth',
    title: 'One of You',
    narrative: 'The door takes two to hold. Three have been holding it. They have already '
      + 'had the argument, several times, over a very long time, and they will not have it '
      + 'again — so the choosing falls to you, and whoever you name walks out.',
    objective: { text: 'Clear a Tier 20 expedition', progress: depth, goal: 20 },
    unlocks: [],
    // The reward the whole line exists for. The questline's own objectives are
    // the time gate — reaching here means clearing Tier 20, about eighteen
    // hours in — so nothing artificial is bolted on top of it.
    reward: 'uniqueHero',
  },
];

export const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

/** Index of a chapter id, or -1. */
export function chapterIndex(id) {
  return CHAPTERS.findIndex((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// The legends
// ---------------------------------------------------------------------------

/**
 * The three at the door. One of them follows you home.
 *
 * Not three prisoners but three *jobs*, which is exactly the shape the choice
 * needs: the one who holds the door, the one who keeps the other two standing,
 * and the one who kills what comes through. Each class blurb was already the
 * character — "copes when a single ally is being hammered" is the literal job
 * description for keeping two people alive at a doorway for two centuries.
 *
 * The door takes two to hold and three are holding it, so exactly one can
 * leave. That is what makes the choice permanent without a contrivance, and it
 * is why the other two are gone for good: a route back later would turn the
 * decision into a delay.
 *
 * They are `legendary` — the rarity that already exists — carrying a `unique`
 * tag. Not a new tier above Legendary, and that is the single most important
 * decision in the whole feature. The Hiring Hall's entire purpose is chasing a
 * Legendary at eight parts in a thousand; a hero strictly better than the best
 * it can ever offer would make every Legendary rolled afterwards a
 * disappointment, and the questline would have paid for itself by breaking a
 * system that runs for the rest of the game.
 *
 * So the reward is lateral. Legendary's numbers exactly, and one thing nobody
 * else in the guild can do: **two skills at once**. Bounded — skills come from
 * a fixed pool, so this cannot inflate — and interesting rather than larger.
 * A Legendary with the right traits still genuinely competes.
 *
 * One per role, so the choice is about what the guild is short of rather than
 * which is strongest.
 */
export const LEGENDS = [
  {
    id: 'legend_tank', classId: 'guardian', name: 'Maud the Unbroken',
    role: 'Holds the door',
    blurb: 'She has stood in one doorway since before your hall was built. The frame '
      + 'has worn to fit her.',
  },
  {
    id: 'legend_healer', classId: 'cleric', name: 'Oswin the Patient',
    role: 'Keeps the other two standing',
    blurb: 'Has kept two people alive on nothing whatever for two hundred years, and '
      + 'does not think it worth mentioning.',
  },
  {
    id: 'legend_dps', classId: 'archer', name: 'Verity Ashfell',
    role: 'Kills what comes through',
    blurb: 'Whatever gets past the door meets her. She has had a great deal of '
      + 'practice, and has not missed in a very long time.',
  },
];

export const LEGEND_BY_ID = Object.fromEntries(LEGENDS.map((l) => [l.id, l]));

/**
 * Every system the questline gates, and the thing that reveals it anyway.
 *
 * The second half is the load-bearing half. A gate with no natural trigger
 * behind it means a player who wanders off the questline is locked out of
 * crafting for the life of the guild, and a single bad chapter pointer bricks
 * a save. So a system opens on the EARLIER of the chapter that grants it and
 * the moment the player would have found it regardless — which is the Charter's
 * own rule, gates only in front of new things, applied to gates in front of old
 * ones.
 *
 * `tab` is the tab strip button to hide while locked; some systems have none
 * and are gated inside their own panel instead.
 */
/**
 * Every trigger below reads something that only ever goes *up* — expeditions
 * completed, guild level, deepest tier cleared. That is not a stylistic
 * preference. A trigger that can fall is a system that can close again, and a
 * player watching the workbench disappear because they spent their last ingot
 * would reasonably file a bug.
 *
 * It also rules out the obvious first attempt, which was "any material at all
 * opens the workbench". A new guild is handed eight copper ore at the door, so
 * that trigger was true on the first frame and the gate never existed. The
 * handout is not a discovery.
 *
 * Each is set just past where its chapter would have arrived, so the questline
 * is normally the thing that opens a system and the trigger is only ever the
 * floor under it.
 */
export const SYSTEMS = [
  {
    id: 'recruit', name: 'Recruiting',
    // No tab: the Hiring Hall is a button on the roster header.
    natural: (s) => (s.stats?.recruited ?? 0) > 0 || runs(s) >= 8,
  },
  {
    id: 'hall', name: 'The Guild Hall', tab: 'hall',
    natural: (s) => (s.guild?.level ?? 1) >= 3,
  },
  {
    id: 'crafting', name: 'The Workbench', tab: 'workshop',
    natural: (s) => depth(s) >= 3,
  },
  {
    id: 'alchemy', name: 'Alchemy',
    // Shares the Workshop tab with crafting, so it is gated inside the panel.
    // Herbs are the one family a guild is *not* handed at the door, so holding
    // any at all is a genuine signal here where materials generally are not.
    natural: (s) => heldOf(s, 'herb') > 0,
  },
  {
    id: 'raids', name: 'Raids', tab: 'raids',
    // The first raid stands at Tier 4; one tier past it is comfortably clear
    // of the chapter without hiding anything the guild could actually run.
    natural: (s) => depth(s) >= 5,
  },
  {
    id: 'contracts', name: 'Contracts', tab: 'contracts',
    natural: (s) => depth(s) >= 9 || (s.contracts?.length ?? 0) > 0,
  },
];

export const SYSTEM_BY_ID = Object.fromEntries(SYSTEMS.map((x) => [x.id, x]));

/**
 * Tabs the questline may hide. Anything not named here is never gated —
 * Roster, Parties, Expeditions and the Vault are the game, and a guild that
 * cannot reach them on its first second is not playable.
 */
export const GATED_TABS = SYSTEMS.filter((x) => x.tab).map((x) => x.tab);
