// data/resources.js — what a hero spends to do the interesting things.
//
// Before this, a healer cast on every turn forever. Measured, a Cleric restored
// nearly three times the party's entire life pool over a single tier-18 run,
// which is why out-sustaining content twenty levels above the party was
// possible: nothing ever ran out.
//
// Three kinds, because three groups of classes work differently:
//
//   mana    a pool that drains and trickles back. Casting and healing spend
//           it. This is the one that caps sustained healing.
//   rage    starts empty and is *built* by fighting — taken and dealt damage
//           both feed it. A tank is never idle waiting for it, and it arrives
//           exactly when a fight is going badly enough to need it.
//   energy  a small pool that refills quickly. Spent on abilities, so a class
//           opens a wave able to use one and has to wait for the next.
//
// Ordinary attacks are always free. A hero who cannot afford anything still
// swings — a party standing still watching a healer regenerate is not a fight,
// it is a screensaver. What runs out is the *good* option, not every option.

/**
 * @typedef {object} ResourceKind
 * @property {string} id
 * @property {string} name
 * @property {string} short   - label for the bar
 * @property {number} max
 * @property {number} regen   - points per second, always
 * @property {number} start   - fraction of max a fight opens with
 * @property {object} gain    - points earned from combat events
 * @property {object} costs   - what actions cost
 */
export const RESOURCES = {
  mana: {
    id: 'mana',
    name: 'Mana',
    short: 'MP',
    max: 100,
    // Sized from measurement rather than taste. A heal costs 4.5, so a full
    // pool is roughly twenty-two casts and regeneration sustains a further
    // 0.45 a second. A tier-14 run needs about thirteen casts and is therefore
    // untouched; a tier-18 run needs forty-seven and will run dry around
    // halfway. Mana bites exactly where healing was doing the heavy lifting.
    regen: 2.0,
    start: 1,
    gain: {},
    costs: { heal: 4.5, ability: 14 },
  },

  rage: {
    id: 'rage',
    name: 'Rage',
    short: 'RA',
    max: 100,
    regen: 0,
    // Earned, not given. A tank opens a fight with nothing and is dangerous by
    // the middle of it, which is the right shape for a class whose job is to
    // still be standing later.
    start: 0,
    gain: { onHit: 5, onTakeHit: 8, onBlock: 6 },
    costs: { ability: 30 },
  },

  energy: {
    id: 'energy',
    name: 'Energy',
    short: 'EN',
    max: 100,
    // Energy buys an *empowered* swing. It never prevents an ordinary one —
    // gating the attack itself was tried and made the Rogue the slowest class
    // in the game, because a hero who cannot afford to swing simply does not.
    //
    // Buying a bonus instead gives the same shape without the cliff: a wave
    // opens on a full bar and every swing lands hard, then settles to whatever
    // regeneration sustains. Priced per class, which is how the Rogue bursts
    // and the Archer, on a cheaper and smaller bonus, keeps its up almost
    // permanently.
    regen: 13,
    start: 1,
    gain: { onKill: 20 },
    costs: { empower: 22, ability: 40 },
  },
};

/** Which resource each class runs on. Anything unlisted spends nothing. */
export const CLASS_RESOURCE = {
  warrior: 'rage',
  guardian: 'rage',
  paladin: 'mana',

  cleric: 'mana',
  druid: 'mana',
  templar: 'mana',

  rogue: 'energy',
  archer: 'energy',
  wizard: 'mana',
  warlock: 'mana',
  inquisitor: 'mana',
};

/** The resource definition for a class, or null. */
export function resourceFor(classId) {
  const kind = CLASS_RESOURCE[classId];
  return kind ? RESOURCES[kind] : null;
}
