// data/story.js — the questline, as data.
//
// The guild has never had a reason to exist. The Charter is a capability
// ladder with no narrative, achievements are a score that pays nothing, and
// nothing in the game ever says *why*. This is the why: a ransom note, a
// syndicate, and a cage full of people worth getting back.
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
//   narrative  the beat. Prose is deliberately skeletal for now.
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
 * The arc is: find the note, build up, breach the stronghold, choose. The four
 * beats that carry it are the note, the gates, the showdown and the choice —
 * everything between them exists to open a system at the moment it matters,
 * and no two chapters open the same one twice.
 *
 * Ordering follows what the game actually gates rather than what reads well on
 * paper. Raids open at Tier 4 and contracts at Tier 8, so the raid beat comes
 * first; recruiting happens long before either, so it comes earlier still.
 *
 * PROSE IS PLACEHOLDER. The structure, objectives, ordering and unlocks are
 * the deliverable here; the writing is a separate pass.
 */
export const CHAPTERS = [
  // --- Act I: a guild with a deed and three people ------------------------
  {
    id: 'first_light', act: 'Humble Beginnings',
    title: 'A Deed and Three Names',
    narrative: 'The hall is yours, such as it is. Three people answered the notice. '
      + 'Somewhere below the hills there is work that pays.',
    objective: { text: 'Complete two expeditions', progress: runs, goal: 2 },
    unlocks: [],
  },
  {
    id: 'ransom_note', act: 'Humble Beginnings',
    title: 'The Intercepted Missive',
    narrative: 'Among the takings is a folded paper that is not a receipt. A ransom '
      + 'demand, unsigned, naming people whose names everyone knows.',
    objective: { text: 'Complete four expeditions', progress: runs, goal: 4 },
    unlocks: [],
  },
  {
    id: 'more_hands', act: 'Humble Beginnings',
    title: 'More Hands',
    narrative: 'Three is not enough for what the note describes. Word has gone out, '
      + 'and there are people at the door.',
    // Recruiting belongs here and not in the late game: a player has the gold
    // for their second hire long before they ever see a contract.
    objective: { text: 'Recruit a hero', progress: stat('recruited'), goal: 1 },
    unlocks: ['recruit'],
    teaches: { tab: 'roster', target: '#rosterHeader' },
  },

  // --- Act II: equipping a guild that intends to fight back ---------------
  {
    id: 'foundations', act: 'Laying the Foundations',
    title: 'Foundations',
    narrative: 'A guild is a building before it is a reputation, and this one leaks.',
    objective: { text: 'Buy a Guild Hall upgrade', progress: ranksBought, goal: 1 },
    unlocks: ['hall'],
    teaches: { tab: 'hall', target: '#upgradeList' },
  },
  {
    id: 'hammers', act: 'Laying the Foundations',
    title: 'Hammers and Anvils',
    narrative: 'They come home with chipped blades and bruised ribs. Everything they '
      + 'are carrying out of the ground can be made into something better.',
    objective: { text: 'Improve an item at the workbench', progress: stat('crafted'), goal: 1 },
    unlocks: ['crafting'],
    teaches: { tab: 'workshop', target: '#craftPanel' },
  },
  {
    id: 'brewing', act: 'Laying the Foundations',
    title: 'Brewing Trouble',
    narrative: 'The passes are trapped and the blades are treated. Armour will not '
      + 'answer poison.',
    objective: { text: 'Brew a flask', progress: stat('flasksBrewed'), goal: 1 },
    unlocks: ['alchemy'],
    teaches: { tab: 'workshop', target: '#alchemyPanel' },
  },

  // --- Act III: the syndicate notices ------------------------------------
  {
    id: 'the_watchtower', act: 'The Syndicate',
    title: 'Something Larger',
    narrative: 'The camps are not camps. Something is directing them, and it has been '
      + 'directing them for a long time.',
    // Raids open at Tier 4, so this objective carries its own pacing: the guild
    // cannot reach it early however keen it is. That is why no chapter here
    // needs an artificial delay bolted on to it.
    objective: { text: 'Bring down a raid boss', progress: stat('raidKills'), goal: 1 },
    unlocks: ['raids'],
    teaches: { tab: 'raids', target: '#raidList' },
  },
  {
    id: 'sealed_orders', act: 'The Syndicate',
    title: 'Sealed Orders',
    narrative: 'Their couriers carry sealed writs. Whatever is written inside changes '
      + 'the ground a fight is fought on.',
    // Contracts start dropping at Tier 8, which paces this one the same way.
    objective: { text: 'Run a sealed contract', progress: stat('contractsRun'), goal: 1 },
    unlocks: ['contracts'],
    teaches: { tab: 'contracts', target: '#contractPanel' },
  },
  {
    id: 'proving', act: 'The Syndicate',
    title: 'Blooded',
    narrative: 'The guild is no longer a curiosity. People who did not know the name '
      + 'a month ago are avoiding it.',
    objective: { text: 'Clear a Tier 12 expedition', progress: depth, goal: 12 },
    unlocks: [],
  },

  // --- Act IV: the stronghold --------------------------------------------
  {
    id: 'fortress_gates', act: 'The Rescue',
    title: 'The Fortress Gates',
    narrative: 'A wall, a gate, and something behind the gate too large to have been '
      + 'brought there in one piece.',
    objective: { text: 'Clear a Tier 16 expedition', progress: depth, goal: 16 },
    unlocks: [],
  },
  {
    id: 'inner_sanctum', act: 'The Rescue',
    title: 'The Inner Sanctum',
    narrative: 'Past the gate the corridors narrow and the guards stop being hired.',
    objective: { text: 'Clear a Tier 20 expedition', progress: depth, goal: 20 },
    unlocks: [],
  },
  {
    id: 'the_choice', act: 'The Rescue',
    title: 'A Choice of Legends',
    narrative: 'The cages open. Three people step out who have been in this trade far '
      + 'longer than you have, and only one of them is going to follow you home.',
    objective: { text: 'Clear a Tier 24 expedition', progress: depth, goal: 24 },
    unlocks: [],
    // The reward the whole line exists for. See story.js — the questline's own
    // objectives are the time gate, so no artificial delay is needed on top.
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
 * The three in the cages. One of them follows you home.
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
    id: 'legend_tank', classId: 'guardian', name: 'Hessa Ninefingers',
    blurb: 'Held a bridge for two days against people who had every reason to be '
      + 'somewhere else. Counts the fingers as a fair price.',
  },
  {
    id: 'legend_healer', classId: 'druid', name: 'Oreth of the Vale',
    blurb: 'Walked out of a burning valley with eleven people who could not walk, '
      + 'and has never once said how.',
  },
  {
    id: 'legend_dps', classId: 'archer', name: 'Sable Coldwater',
    blurb: 'Took the shot everyone agreed was impossible, then took it again to '
      + 'settle the argument.',
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
