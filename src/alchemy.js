// alchemy.js — keeping parties in flasks.
//
// The alchemy stand was a complete system nobody used, and none of the reasons
// were about the flasks themselves. Measured, a Tier 12 run in the Dark Forest
// brings home about fifteen herbs against a three-herb flask, so supply was
// never the problem. The problem was that the system was invisible at both
// ends:
//
//   The picker on a party card was hidden entirely until you already held a
//   flask, so a player who had never visited the alchemy stand had no way to
//   learn that a party could carry one.
//
//   A party assigned a flask it had run out of simply left without it. Nothing
//   was logged, nothing was shown, and with auto-redeploy a batch of three
//   burns off in three runs — so the usual experience of alchemy was a buff
//   that quietly stopped working and never came back.
//
// This module is the second half of the answer. The first half is interface:
// the picker is always shown, the stand says which parties are waiting on
// what, and going without is announced. This is the part that stops a standing
// order from being a trip to the workshop every three expeditions.

import { G, log, emit } from './state.js';
import { FLASKS, FLASK_BY_ID, flaskCost } from './data/recipes.js';
import { hasMaterials } from './inventory.js';
import { brew } from './crafting.js';
import { automationOn } from './charter.js';

/** How often the standing order looks, in seconds. */
const INTERVAL = 6;

/**
 * How many expeditions of stock a standing order keeps ahead.
 *
 * Small on purpose. This is meant to stop the trip to the workshop, not to
 * turn the guild's herbs into a wall of flasks nobody asked for — a party
 * drinks one per run, so three is a comfortable buffer and anything more is
 * hoarding on the player's behalf.
 */
export const RESERVE_RUNS = 3;

let timer = 0;

/** Every flask a party is currently assigned, without duplicates. */
export function assignedFlasks(state = G.state) {
  const out = new Set();
  for (const p of state?.parties ?? []) if (p.flask) out.add(p.flask);
  return [...out];
}

/** Which parties are counting on this flask. */
export function partiesUsing(flaskId, state = G.state) {
  return (state?.parties ?? []).filter((p) => p.flask === flaskId);
}

/**
 * How a flask is doing: what is held, who wants it, and whether that is enough.
 *
 * `runsLeft` is the number the *whole guild* can still pour, not per party —
 * three parties sharing four flasks run out on the second round, and saying
 * "four in stock" would be technically true and useless.
 */
export function flaskStatus(flaskId, state = G.state) {
  const held = state?.flasks?.[flaskId] ?? 0;
  const parties = partiesUsing(flaskId, state);
  const want = parties.length;
  return {
    def: FLASK_BY_ID[flaskId],
    held,
    parties,
    want,
    runsLeft: want ? Math.floor(held / want) : held,
    short: want > 0 && held < want,
    target: want * RESERVE_RUNS,
  };
}

/** Everything assigned somewhere, worst off first. */
export function standingOrders(state = G.state) {
  return assignedFlasks(state)
    .map((id) => flaskStatus(id, state))
    .sort((a, b) => a.runsLeft - b.runsLeft);
}

/**
 * Brews what the standing orders are short of, if the guild can pay for it.
 *
 * Only ever brews a flask some party has actually asked for, and only up to
 * the reserve. Spending the guild's herbs on something nobody assigned would
 * be the automation deciding what to play, which is the line every Charter
 * automation stays on the right side of.
 *
 * @returns {number} batches brewed
 */
export function tickAlchemy(dt) {
  const s = G.state;
  if (!s || !automationOn('standingStock')) return 0;
  timer += dt;
  if (timer < INTERVAL) return 0;
  timer = 0;

  let brewed = 0;
  // Neediest first, so a guild with herbs for one batch tops up the party that
  // is actually out rather than the one merely below its reserve.
  for (const st of standingOrders(s)) {
    if (!st.def || st.held >= st.target) continue;
    if (!hasMaterials(flaskCost(st.def))) continue;
    const res = brew(st.def.id);
    if (!res.ok) continue;
    brewed++;
    log(`Standing Stock: brewed ${st.def.batch}x ${st.def.name}.`, 'loot');
  }
  if (brewed) emit('materials');
  return brewed;
}

/** Resets the poll timer. Used when a guild is loaded. */
export function resetAlchemyTimer() {
  timer = 0;
}

export { FLASKS };
