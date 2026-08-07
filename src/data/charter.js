// data/charter.js — what Guild Level is for.
//
// Guild Level was, until this file existed, the largest number on the screen
// and the only one that did nothing. It had a bar in the top bar, it appeared
// in save filenames, and no other line of code ever read it.
//
// The Charter is what it buys. Every privilege here is *operational*: it
// changes what the guild can do, never how hard it hits. That division is
// deliberate and load-bearing —
//
//   Guild Hall  costs gold, and sells numbers. Rarity, damage, stamina.
//   The Charter costs nothing, and sells time back. It is earned by playing
//               rather than bought, and what it grants is work you no longer
//               have to do by hand.
//
// An idle game automates its combat on day one and then leaves you hand-
// managing the logistics for forty hours. This is the ladder that gives the
// logistics back: at Tier 25 with four parties there are twenty heroes and a
// hundred and eighty equipment slots, and nobody should be filling those one
// click at a time.
//
// Privileges are *granted*, never chosen. The Guild Hall already asks what to
// spend on; a second tree of choices would only mean two ways to build the
// same guild wrong. A level here is a promise: reach it, and this is yours.
//
// Nothing that already exists was moved behind a gate. Every privilege is new
// capability, so a save from before the Charter loses nothing and gains
// whatever its level has already earned.

/**
 * @typedef {object} Privilege
 * @property {string} id
 * @property {number} level    guild level that grants it
 * @property {string} name
 * @property {string} desc     what it does, in the player's words
 * @property {string} icon     symbol id from ui/icons.js
 * @property {string} kind     'ability' | 'capacity' | 'automation'
 * @property {boolean} [switchable] has an on/off switch. Anything that spends
 *                              resources or changes a party's orders does, and
 *                              defaults to off — automation you did not ask
 *                              for is indistinguishable from a bug.
 *
 * A switchable privilege stores its switch in `settings` under *its own id*.
 * That is not laziness: a separate settings key is a second name for the same
 * thing, and the first version of this file had one. Three call sites then
 * asked automationOn() for the settings key instead of the privilege id, which
 * returns false rather than throwing, so three automations silently never ran.
 */

/** @type {Privilege[]} */
export const PRIVILEGES = [
  {
    id: 'equipBest', level: 2, kind: 'ability', icon: 'shield',
    name: "Quartermaster's Eye",
    desc: 'A <b>Best Gear</b> button on every hero. One press fills every empty slot '
      + 'and replaces anything the vault can beat.',
  },
  {
    id: 'gearParty', level: 3, kind: 'ability', icon: 'banner',
    name: 'Requisition Orders',
    desc: 'A <b>Gear Up</b> button on every party. The same thing, for all five at once.',
  },
  {
    id: 'salvageSpare', level: 5, kind: 'capacity', icon: 'anvil',
    switchable: true,
    name: 'Discerning Eye',
    desc: 'A new auto-salvage rule: <b>anything that improves nobody</b>. It checks every '
      + 'hero on the roster before binning a drop, so it never destroys an upgrade.',
  },
  {
    id: 'boardFour', level: 7, kind: 'capacity', icon: 'scroll',
    name: 'Word of Mouth',
    desc: 'The Hiring Hall shows a fourth candidate. More to choose between for the same '
      + 'reroll price.',
  },
  {
    id: 'watch18', level: 9, kind: 'capacity', icon: 'tower',
    name: 'The Longer Watch',
    desc: 'Offline progress counts up to <b>18 hours</b> instead of 12.',
  },
  {
    id: 'autoEquip', level: 11, kind: 'automation', icon: 'chest', switchable: true,
    name: 'Standing Kit',
    desc: 'Gear that comes home better than what a hero is wearing goes straight onto them. '
      + 'Never touches a locked item, and never disturbs a hero in the field.',
  },
  {
    id: 'standingStock', level: 12, kind: 'automation', icon: 'flask', switchable: true,
    name: 'Standing Stock',
    desc: 'The alchemy stand keeps every flask a party has been assigned brewed and ready, '
      + 'up to three expeditions ahead. Only ever brews what somebody has actually asked for.',
  },
  {
    id: 'repeatCraft', level: 13, kind: 'ability', icon: 'hammer',
    name: "Master's Bench",
    desc: 'A <b>×10</b> button on every bench recipe. Runs it until it lands ten times, you '
      + 'run out of materials, or the item can take no more.',
  },
  {
    id: 'standingAccounts', level: 15, kind: 'automation', icon: 'coin', switchable: true,
    name: 'Standing Accounts',
    desc: 'The Guild Hall buys its own cheapest available rank whenever the guild can afford '
      + 'it twice over. Gold stops piling up while you are away.',
  },
  {
    id: 'archive24', level: 17, kind: 'capacity', icon: 'scroll',
    name: 'Sealed Archive',
    desc: 'The contract board holds <b>24</b> sealed contracts instead of 16.',
  },
  {
    id: 'boardFive', level: 19, kind: 'capacity', icon: 'crown',
    name: 'Open Doors',
    desc: 'A fifth candidate in the Hiring Hall.',
  },
  {
    id: 'reserves', level: 21, kind: 'automation', icon: 'boot', switchable: true,
    name: 'Reserve Roster',
    desc: 'A party held back by one exhausted hero swaps them for a rested one of the same '
      + 'class from the bench, rather than standing about.',
  },
  {
    id: 'watch24', level: 24, kind: 'capacity', icon: 'tower',
    name: 'The Long Watch',
    desc: 'Offline progress counts up to a <b>full day</b>.',
  },
  {
    id: 'autoContract', level: 27, kind: 'automation', icon: 'flask', switchable: true,
    name: 'Standing Seals',
    desc: 'A party sent out on its own orders spends a sealed contract when one matches where '
      + 'it was going. Only ever spends contracts nobody in the party is barred from.',
  },
  {
    id: 'pushOrders', level: 30, kind: 'automation', icon: 'sword', switchable: true,
    name: 'Push Orders',
    desc: 'A party running on its own orders climbs a tier after three clean clears, and drops '
      + 'back a tier when it wipes. It finds the deepest tier it can hold and stays there.',
  },
];

export const PRIVILEGE_BY_ID = Object.fromEntries(PRIVILEGES.map((p) => [p.id, p]));

/** The highest level any privilege is granted at — where the ladder ends. */
export const LAST_PRIVILEGE_LEVEL = PRIVILEGES.reduce((n, p) => Math.max(n, p.level), 0);

/** Everything granted at or below `level`. */
export function privilegesUpTo(level) {
  return PRIVILEGES.filter((p) => p.level <= level);
}

/** The next privilege after `level`, or null once the ladder is finished. */
export function nextPrivilege(level) {
  return PRIVILEGES.find((p) => p.level > level) ?? null;
}
