// data/achievements.js — what the guild can be credited with.
//
// This file is meant to grow. The engine in ../achievements.js knows nothing
// about any particular achievement: it walks this list, asks each one for its
// current progress, and unlocks the ones that have arrived. Adding a new
// achievement is a matter of adding an entry here and nothing else.
//
// An achievement is:
//
//   id        stable, and never reused. It is the key stored in the save.
//   name      what the player sees.
//   desc      what they have to do, in plain English.
//   category  for grouping in the interface.
//   goal      the number `progress` is counting towards. 1 for a yes/no.
//   progress  (state) => number. Called against live guild state; must be
//             cheap, must not mutate anything, and must never throw.
//   hidden    optional. Not shown until unlocked — for things that would spoil
//             something, not for making players guess.
//   reward    optional { gold, seals, echoes }, granted once on unlock.
//
// Progress is *derived*, never accumulated. Asking the state what it currently
// says is the only way a save from an older version can be credited correctly
// for something it already did, and it means no counter can drift out of step
// with the thing it counts.

export const CATEGORIES = [
  { id: 'guild', name: 'The Guild' },
  { id: 'expeditions', name: 'Expeditions' },
  { id: 'raids', name: 'Raids' },
  { id: 'loot', name: 'Loot' },
  { id: 'heroes', name: 'Heroes' },
];

/** Highest tier the guild has cleared. */
const highestTier = (s) => s.progress?.highestTier ?? 0;

/** How many distinct uniques the Guild Hall collection has recorded. */
const uniquesFound = (s) => Object.values(s.collection ?? {}).filter((n) => n > 0).length;

export const ACHIEVEMENTS = [
  // ---- The guild ---------------------------------------------------------
  {
    id: 'first_steps', name: 'First Steps', category: 'guild', goal: 1,
    desc: 'Complete your first expedition.',
    progress: (s) => s.stats?.runs ?? 0,
  },
  {
    id: 'a_real_company', name: 'A Real Company', category: 'guild', goal: 8,
    desc: 'Have eight heroes on the roster at once.',
    progress: (s) => s.heroes?.length ?? 0,
  },
  {
    id: 'two_fronts', name: 'Two Fronts', category: 'guild', goal: 2,
    desc: 'Buy an Expedition Charter so two parties can be out at once.',
    progress: (s) => 1 + (s.upgrades?.partySlots ?? 0),
  },
  {
    id: 'well_appointed', name: 'Well Appointed', category: 'guild', goal: 10,
    desc: 'Buy ten Guild Hall upgrades of any kind.',
    progress: (s) => Object.values(s.upgrades ?? {}).reduce((a, b) => a + b, 0),
  },

  // ---- Expeditions -------------------------------------------------------
  {
    id: 'tier_ten', name: 'Down the Shaft', category: 'expeditions', goal: 10,
    desc: 'Clear a Tier 10 expedition.',
    progress: highestTier,
  },
  {
    id: 'tier_twenty', name: 'The Soft Cap', category: 'expeditions', goal: 20,
    desc: 'Clear a Tier 20 expedition, where the numbers change shape.',
    progress: highestTier,
  },
  {
    id: 'tier_thirty', name: 'Too Deep', category: 'expeditions', goal: 30,
    desc: 'Clear a Tier 30 expedition.',
    progress: highestTier,
    reward: { echoes: 5 },
  },
  {
    id: 'hundred_runs', name: 'Routine', category: 'expeditions', goal: 100,
    desc: 'Complete a hundred expeditions.',
    progress: (s) => s.stats?.runs ?? 0,
  },
  {
    id: 'contractor', name: 'Under Contract', category: 'expeditions', goal: 1,
    desc: 'Run a sealed contract.',
    progress: (s) => s.stats?.contractsRun ?? 0,
  },

  // ---- Raids -------------------------------------------------------------
  {
    id: 'first_boss', name: 'Giant Slain', category: 'raids', goal: 1,
    desc: 'Kill any raid boss.',
    progress: (s) => s.stats?.raidKills ?? 0,
  },
  {
    id: 'all_the_old_ones', name: 'The Old Ones', category: 'raids', goal: 5,
    desc: 'Kill five different raid bosses.',
    progress: (s) => Object.keys(s.progress?.raidKills ?? {}).length,
  },
  {
    id: 'the_deep_three', name: 'Past the Map', category: 'raids', goal: 3,
    desc: 'Kill all three of the deep raid bosses.',
    progress: (s) => ['sunless_court', 'sundered_titan', 'the_hollow_star']
      .filter((id) => (s.progress?.raidKills?.[id] ?? 0) > 0).length,
    reward: { echoes: 15 },
  },

  // ---- Loot --------------------------------------------------------------
  {
    id: 'first_unique', name: 'One of a Kind', category: 'loot', goal: 1,
    desc: 'Find a unique item.',
    progress: uniquesFound,
  },
  {
    id: 'collector', name: 'Collector', category: 'loot', goal: 15,
    desc: 'Record fifteen different uniques in the Guild Hall collection.',
    progress: uniquesFound,
  },
  {
    id: 'blank_slate', name: 'Blank Slate', category: 'loot', goal: 1,
    desc: 'Recover an unworked base from a deep raid.',
    progress: (s) => s.stats?.blanksFound ?? 0,
  },
  {
    id: 'rich', name: 'Guild Coffers', category: 'loot', goal: 1000000,
    desc: 'Hold a million gold at once.',
    progress: (s) => s.stats?.peakGold ?? 0,
  },

  // ---- Heroes ------------------------------------------------------------
  {
    id: 'legendary_hire', name: 'Worth the Fee', category: 'heroes', goal: 1,
    desc: 'Have a Legendary hero on the roster.',
    progress: (s) => (s.heroes ?? []).filter((h) => h.rarity === 'legendary').length,
  },
  {
    id: 'level_fifty', name: 'Veteran', category: 'heroes', goal: 50,
    desc: 'Take a hero to level 50.',
    progress: (s) => Math.max(0, ...(s.heroes ?? []).map((h) => h.level ?? 0)),
  },
  {
    id: 'full_bench', name: 'Deep Bench', category: 'heroes', goal: 5,
    desc: 'Have five heroes sitting unassigned while a party is in the field.',
    progress: (s) => ((s.expeditions ?? []).length
      ? (s.heroes ?? []).filter((h) => !h.partyId).length
      : 0),
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achievementsIn(categoryId) {
  return ACHIEVEMENTS.filter((a) => a.category === categoryId);
}
