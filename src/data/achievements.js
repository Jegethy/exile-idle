// data/achievements.js — what the guild can be credited with.
//
// Achievements pay nothing. They are a score, in the way a Gamerscore is a
// score: the number goes up and that is the entire reward. Rewards could be
// added later — the engine has nowhere to put them and that is deliberate,
// because an achievement worth gold stops being an achievement and starts
// being a quest.
//
// The engine in ../achievements.js knows about none of these individually. It
// walks the list, asks each one for its current progress, and unlocks whatever
// has arrived. Adding one is a change to this file and nothing else.
//
// An achievement is:
//
//   id        stable, never reused. It is the key stored in the save.
//   name      what the player sees. RPG-flavoured, not a description.
//   desc      what it took, in one short line.
//   category  see CATEGORIES.
//   icon      a symbol id from ui/icons.js.
//   points    what it adds to the score.
//   goal      the number `progress` counts towards. 1 for a yes/no.
//   progress  (state) => number, against live state. Cheap, pure, never throws.
//
// Progress is *derived*, never accumulated: every one is a function of the
// current save rather than a counter ticked from an event, so a save from
// before an achievement existed is credited correctly the first time it is
// checked, and no counter can drift from the thing it counts.

import { PRIVILEGES, privilegesUpTo } from './charter.js';

export const CATEGORIES = [
  { id: 'general', name: 'General', icon: 'banner' },
  { id: 'expeditions', name: 'Expeditions', icon: 'sword' },
  { id: 'raids', name: 'Raids', icon: 'skull' },
  { id: 'tiers', name: 'Tiers', icon: 'tower' },
  { id: 'crafting', name: 'Crafting', icon: 'anvil' },
  { id: 'hall', name: 'Guild Hall', icon: 'chest' },
  { id: 'feats', name: 'Feats of Strength', icon: 'crown' },
];

/**
 * Points for the nth rung of a chain.
 *
 * Front-loaded gently and steep at the end: the first rung should arrive
 * within a minute of starting, and the last should be something almost nobody
 * sees. A flat value per rung would make a million kills worth the same as the
 * first one.
 */
const RUNG_POINTS = [5, 10, 10, 15, 15, 20, 25, 30, 40, 50, 75, 100];

/**
 * Builds a ladder of achievements counting the same thing.
 *
 * `rungs` is [threshold, name, desc] per step, in order. The id is derived
 * from the base and the threshold so inserting a rung later cannot renumber
 * the ones already in somebody's save.
 */
function chain({ base, category, icon, progress, rungs }) {
  return rungs.map(([goal, name, desc], i) => ({
    id: `${base}_${goal}`,
    name,
    desc,
    category,
    icon,
    points: RUNG_POINTS[Math.min(i, RUNG_POINTS.length - 1)],
    goal,
    progress,
  }));
}

const stat = (key) => (s) => s.stats?.[key] ?? 0;
const feat = (key) => (s) => (s.feats?.[key] ? 1 : 0);

/** The twelve-rung ladder the big counters use. */
const BIG = [1, 10, 50, 100, 250, 500, 1000, 10000, 50000, 100000, 500000, 1000000];

// ---------------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------------

const bossKills = chain({
  base: 'boss_slain', category: 'expeditions', icon: 'skull', progress: stat('bossKills'),
  rungs: [
    [BIG[0], 'First Blood', 'Slay an expedition guardian.'],
    [BIG[1], 'Gravedigger', 'Slay 10 expedition guardians.'],
    [BIG[2], 'Culler', 'Slay 50 expedition guardians.'],
    [BIG[3], 'Bane of the Deep', 'Slay 100 expedition guardians.'],
    [BIG[4], 'Hunter of Horrors', 'Slay 250 expedition guardians.'],
    [BIG[5], 'Scourge of the Underhalls', 'Slay 500 expedition guardians.'],
    [BIG[6], 'Thousand-Fold Slayer', 'Slay 1,000 expedition guardians.'],
    [BIG[7], 'The Long Extermination', 'Slay 10,000 expedition guardians.'],
    [BIG[8], 'Emptier of Tombs', 'Slay 50,000 expedition guardians.'],
    [BIG[9], 'The Unending Hunt', 'Slay 100,000 expedition guardians.'],
    [BIG[10], 'Nothing Left Standing', 'Slay 500,000 expedition guardians.'],
    [BIG[11], 'The Great Silence', 'Slay 1,000,000 expedition guardians.'],
  ],
});

const runsDone = chain({
  base: 'runs', category: 'expeditions', icon: 'boot', progress: stat('runs'),
  rungs: [
    [BIG[0], 'Out the Gate', 'Complete an expedition.'],
    [BIG[1], 'Reliable Company', 'Complete 10 expeditions.'],
    [BIG[2], 'Seasoned Outfit', 'Complete 50 expeditions.'],
    [BIG[3], 'The Hundred Marches', 'Complete 100 expeditions.'],
    [BIG[4], 'Well-Worn Boots', 'Complete 250 expeditions.'],
    [BIG[5], 'Old Hands', 'Complete 500 expeditions.'],
    [BIG[6], 'Guild of Repute', 'Complete 1,000 expeditions.'],
    [BIG[7], 'The Standing Order', 'Complete 10,000 expeditions.'],
    [BIG[8], 'Institution', 'Complete 50,000 expeditions.'],
    [BIG[9], 'Written Into the Maps', 'Complete 100,000 expeditions.'],
    [BIG[10], 'Older Than the Kingdom', 'Complete 500,000 expeditions.'],
    [BIG[11], 'The Eternal Charter', 'Complete 1,000,000 expeditions.'],
  ],
});

const goldEarned = chain({
  base: 'gold', category: 'expeditions', icon: 'coin', progress: stat('goldEarned'),
  rungs: [
    [1000, 'Pocket Money', 'Earn 1,000 gold.'],
    [25000, 'Solvent', 'Earn 25,000 gold.'],
    [250000, 'Comfortable', 'Earn 250,000 gold.'],
    [1000000, 'Guild Coffers', 'Earn 1,000,000 gold.'],
    [10000000, 'Merchant Prince', 'Earn 10,000,000 gold.'],
    [100000000, 'The Vault Beneath', 'Earn 100,000,000 gold.'],
    [1000000000, 'Dragon-Hoard', 'Earn 1,000,000,000 gold.'],
  ],
});

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

const raidKills = chain({
  base: 'raid_kill', category: 'raids', icon: 'sword', progress: stat('raidKills'),
  rungs: [
    [1, 'Giant Slain', 'Kill a raid boss.'],
    [5, 'Bosskiller', 'Kill 5 raid bosses.'],
    [10, 'Champion of the Guild', 'Kill 10 raid bosses.'],
    [25, 'Titanbane', 'Kill 25 raid bosses.'],
    [50, 'The Reckoning', 'Kill 50 raid bosses.'],
    [100, 'Legend-Ender', 'Kill 100 raid bosses.'],
    [250, 'Godsbane', 'Kill 250 raid bosses.'],
    [500, 'Nothing Is Sacred', 'Kill 500 raid bosses.'],
    [1000, 'The Thousand Thrones', 'Kill 1,000 raid bosses.'],
  ],
});

const raidRoster = [
  {
    id: 'raid_all_shallow', name: 'The Old Ones', category: 'raids', icon: 'skull', points: 30,
    desc: 'Kill all five of the original raid bosses at least once.', goal: 5,
    progress: (s) => ['hollow_king', 'brood_matron', 'ember_tyrant', 'drowned_choir', 'worldeater']
      .filter((id) => (s.progress?.raidKills?.[id] ?? 0) > 0).length,
  },
  {
    id: 'raid_all_deep', name: 'Past the Map', category: 'raids', icon: 'crown', points: 75,
    desc: 'Kill all three of the deep raid bosses at least once.', goal: 3,
    progress: (s) => ['sunless_court', 'sundered_titan', 'the_hollow_star']
      .filter((id) => (s.progress?.raidKills?.[id] ?? 0) > 0).length,
  },
];

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

const tiers = chain({
  base: 'tier', category: 'tiers', icon: 'tower',
  progress: (s) => s.progress?.highestTier ?? 0,
  rungs: [
    [1, 'The First Descent', 'Clear a Tier 1 expedition.'],
    [5, 'Into the Dark', 'Clear a Tier 5 expedition.'],
    [10, 'Down the Shaft', 'Clear a Tier 10 expedition.'],
    [15, 'Deeper Still', 'Clear a Tier 15 expedition.'],
    [20, 'The Soft Cap', 'Clear a Tier 20 expedition, where the numbers change shape.'],
    [25, 'Beyond the Ledger', 'Clear a Tier 25 expedition.'],
    [30, 'Too Deep', 'Clear a Tier 30 expedition.'],
    [35, 'The Last Band', 'Clear a Tier 35 expedition, where gear stops improving.'],
    [40, 'No Maps Remain', 'Clear a Tier 40 expedition.'],
    [50, 'What Lies Beneath', 'Clear a Tier 50 expedition.'],
  ],
});

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------

const crafted = chain({
  base: 'crafted', category: 'crafting', icon: 'anvil', progress: stat('crafted'),
  rungs: [
    [BIG[0], 'The First Strike', 'Work an item at the Workbench.'],
    [BIG[1], 'Apprentice Smith', 'Work 10 items.'],
    [BIG[2], 'Journeyman Smith', 'Work 50 items.'],
    [BIG[3], 'Master of the Bench', 'Work 100 items.'],
    [BIG[4], 'Forgeworn', 'Work 250 items.'],
    [BIG[5], 'The Ringing Anvil', 'Work 500 items.'],
    [BIG[6], 'Artificer', 'Work 1,000 items.'],
    [BIG[7], 'Ten Thousand Hammers', 'Work 10,000 items.'],
    [BIG[8], 'The Endless Forge', 'Work 50,000 items.'],
    [BIG[9], 'Shaper of Things', 'Work 100,000 items.'],
    [BIG[10], 'Nothing Is Finished', 'Work 500,000 items.'],
    [BIG[11], 'The Last Smith', 'Work 1,000,000 items.'],
  ],
});

const brewed = chain({
  base: 'brewed', category: 'crafting', icon: 'flask', progress: stat('flasksBrewed'),
  rungs: [
    [1, 'First Draught', 'Brew a flask.'],
    [25, 'Herbalist', 'Brew 25 flasks.'],
    [100, 'Alchemist', 'Brew 100 flasks.'],
    [500, 'The Bubbling Stand', 'Brew 500 flasks.'],
    [2500, 'Master Alchemist', 'Brew 2,500 flasks.'],
    [10000, 'Distiller of Fates', 'Brew 10,000 flasks.'],
  ],
});

const salvaged = chain({
  base: 'salvaged', category: 'crafting', icon: 'hammer', progress: stat('salvaged'),
  rungs: [
    [10, 'Scrapper', 'Break down 10 items.'],
    [250, 'Rag and Bone', 'Break down 250 items.'],
    [2500, 'Nothing Wasted', 'Break down 2,500 items.'],
    [25000, 'The Great Rendering', 'Break down 25,000 items.'],
  ],
});

// ---------------------------------------------------------------------------
// Guild Hall
// ---------------------------------------------------------------------------

const upgrades = chain({
  base: 'upgrades', category: 'hall', icon: 'chest',
  progress: (s) => Object.values(s.upgrades ?? {}).reduce((a, b) => a + b, 0),
  rungs: [
    [1, 'Foundation Stone', 'Buy a Guild Hall upgrade.'],
    [5, 'Building Out', 'Buy 5 Guild Hall upgrades.'],
    [15, 'A Proper Hall', 'Buy 15 Guild Hall upgrades.'],
    [40, 'Wings and Cellars', 'Buy 40 Guild Hall upgrades.'],
    [80, 'The Great House', 'Buy 80 Guild Hall upgrades.'],
    [140, 'Everything Bought', 'Buy 140 Guild Hall upgrades.'],
  ],
});

const hallOne = [
  {
    id: 'hall_charter', name: 'Two Fronts', category: 'hall', icon: 'banner', points: 15,
    desc: 'Buy an Expedition Charter so two parties can be out at once.', goal: 1,
    progress: (s) => (s.upgrades?.partySlots ?? 0),
  },
  {
    id: 'hall_orders', name: 'Standing Orders', category: 'hall', icon: 'scroll', points: 15,
    desc: 'Buy Standing Orders and let a party run without you.', goal: 1,
    progress: (s) => (s.upgrades?.autoDispatch ?? 0),
  },
];

// Charter privileges are earned by guild level rather than bought, which is
// why they sit beside the upgrades rather than in a category of their own: the
// Guild Hall is where a player goes to make the guild itself better, and both
// halves of that are on the one screen.
const charter = chain({
  base: 'charter', category: 'hall', icon: 'banner',
  progress: (s) => privilegesUpTo(s.guild?.level ?? 1).length,
  rungs: [
    [1, 'Articles Signed', 'Earn a charter privilege.'],
    [4, 'A Working Guild', 'Earn 4 charter privileges.'],
    [8, 'Well Chartered', 'Earn 8 charter privileges.'],
    [PRIVILEGES.length, 'The Charter Complete', 'Earn every charter privilege.'],
  ],
});

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

const general = [
  ...chain({
    base: 'recruited', category: 'general', icon: 'banner', progress: stat('recruited'),
    rungs: [
      [1, 'Hiring Hall', 'Recruit a hero.'],
      [10, 'Word Gets Around', 'Recruit 10 heroes.'],
      [50, 'An Employer of Note', 'Recruit 50 heroes.'],
      [250, 'The Guild Grows', 'Recruit 250 heroes.'],
      [1000, 'A Thousand Contracts', 'Recruit 1,000 heroes.'],
    ],
  }),
  ...chain({
    base: 'level', category: 'general', icon: 'star',
    progress: (s) => Math.max(0, ...(s.heroes ?? []).map((h) => h.level ?? 0)),
    rungs: [
      [10, 'Blooded', 'Take a hero to level 10.'],
      [25, 'Hardened', 'Take a hero to level 25.'],
      [50, 'Veteran', 'Take a hero to level 50.'],
      [69, 'Past the Cap', 'Take a hero to level 69.'],
      [90, 'Legend of the Guild', 'Take a hero to level 90.'],
    ],
  }),
  ...chain({
    base: 'uniques', category: 'general', icon: 'star',
    progress: (s) => Object.values(s.collection ?? {}).filter((n) => n > 0).length,
    rungs: [
      [1, 'One of a Kind', 'Record a unique item in the collection.'],
      [10, 'Curator', 'Record 10 different uniques.'],
      [20, 'Collector', 'Record 20 different uniques.'],
      [31, 'The Complete Set', 'Record every unique in the game.'],
    ],
  }),
  {
    id: 'legendary_hire', name: 'Worth the Fee', category: 'general', icon: 'crown', points: 25,
    desc: 'Have a Legendary hero on the roster.', goal: 1,
    progress: (s) => (s.heroes ?? []).filter((h) => h.rarity === 'legendary').length,
  },
  {
    id: 'roster_ten', name: 'A Real Company', category: 'general', icon: 'banner', points: 15,
    desc: 'Have ten heroes on the roster at once.', goal: 10,
    progress: (s) => s.heroes?.length ?? 0,
  },
  ...chain({
    base: 'playtime', category: 'general', icon: 'scroll',
    progress: (s) => Math.floor((s.playtime ?? 0) / 3600),
    rungs: [
      [1, 'An Hour Given', 'Play for an hour.'],
      [10, 'Settled In', 'Play for 10 hours.'],
      [50, 'Guildmaster', 'Play for 50 hours.'],
      [200, 'This Is the Job Now', 'Play for 200 hours.'],
    ],
  }),
];

// ---------------------------------------------------------------------------
// Feats of Strength
// ---------------------------------------------------------------------------
//
// One-time unlocks for doing a specific thing, rather than doing a thing many
// times. They are the only achievements that need the game to *tell* them
// something happened, via recordFeat() — everything else is read from the save.

const feats = [
  {
    id: 'feat_guide', name: 'Read the Manual', category: 'feats', icon: 'scroll', points: 10,
    desc: 'Open the Guild Handbook.', goal: 1, progress: feat('guide'),
  },
  {
    id: 'feat_settings', name: 'Fiddler', category: 'feats', icon: 'hammer', points: 10,
    desc: 'Open the settings.', goal: 1, progress: feat('settings'),
  },
  {
    id: 'feat_wipe', name: 'Lesson Learned', category: 'feats', icon: 'skull', points: 10,
    desc: 'Lose a party and everything it was carrying.', goal: 1, progress: feat('wipe'),
  },
  {
    id: 'feat_recall', name: 'Discretion', category: 'feats', icon: 'boot', points: 10,
    desc: 'Recall a party early rather than lose them.', goal: 1, progress: feat('recall'),
  },
  {
    id: 'feat_contract', name: 'Under Contract', category: 'feats', icon: 'scroll', points: 15,
    desc: 'Run a sealed contract.', goal: 1, progress: feat('contract'),
  },
  {
    id: 'feat_contract_legendary', name: 'Reckless', category: 'feats', icon: 'crown', points: 40,
    desc: 'Clear a Legendary contract.', goal: 1, progress: feat('legendaryContract'),
  },
  {
    id: 'feat_blank', name: 'Blank Slate', category: 'feats', icon: 'anvil', points: 40,
    desc: 'Recover an unworked base from a deep raid.', goal: 1,
    progress: (s) => s.stats?.blanksFound ?? 0,
  },
  {
    id: 'feat_deep_unique', name: 'Nothing Else Drops It', category: 'feats', icon: 'star', points: 40,
    desc: 'Find a unique that exists only in the deep raids.', goal: 1,
    progress: feat('deepUnique'),
  },
  {
    id: 'feat_no_tank', name: 'Who Needs a Wall', category: 'feats', icon: 'shield', points: 25,
    desc: 'Clear an expedition with no Tank in the party.', goal: 1, progress: feat('noTankClear'),
  },
  {
    id: 'feat_no_healer', name: 'Walk It Off', category: 'feats', icon: 'flask', points: 25,
    desc: 'Clear an expedition with no Healer in the party.', goal: 1, progress: feat('noHealerClear'),
  },
  {
    id: 'feat_reroll', name: 'Second Thoughts', category: 'feats', icon: 'star', points: 10,
    desc: 'Spend Echo Stones to redraw a hero\'s skills.', goal: 1, progress: feat('skillReroll'),
  },
  {
    id: 'feat_dismiss', name: 'Hard Choices', category: 'feats', icon: 'skull', points: 10,
    desc: 'Dismiss a hero from the guild.', goal: 1, progress: feat('dismiss'),
  },
];

export const ACHIEVEMENTS = [
  ...general,
  ...bossKills, ...runsDone, ...goldEarned,
  ...raidKills, ...raidRoster,
  ...tiers,
  ...crafted, ...brewed, ...salvaged,
  ...upgrades, ...hallOne, ...charter,
  ...feats,
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Total score available, for the "x of y" line. */
export const TOTAL_POINTS = ACHIEVEMENTS.reduce((n, a) => n + a.points, 0);

export function achievementsIn(categoryId) {
  return ACHIEVEMENTS.filter((a) => a.category === categoryId);
}
