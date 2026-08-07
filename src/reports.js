// reports.js — the after-action summary shown when an expedition ends.
//
// Combat resolves on its own, which means the interesting part is over before
// you look. Without a summary the only trace of a run is a line in the log and
// a number that went up, and there is no way to answer the question every
// player actually has: *who is carrying, and who is dead weight?* A hero can
// sit in a party for hours contributing nothing and there is nothing on screen
// that would tell you.
//
// So a report holds the same three numbers a damage meter would: damage dealt,
// damage taken, and healing done, per hero, alongside what the run paid and how
// long it took.
//
// Reports are deliberately *not* saved. They describe a moment that has passed,
// and a stale one greeting you on load would be noise.

import { G, emit } from './state.js';
import { uid } from './util.js';

/** How long an auto-redeploying party lingers on its summary before going again. */
export const AUTO_DISMISS_SECONDS = 5;

/** Live reports, newest last. Not part of G.state, so never serialised. */
export const reports = [];

/**
 * Builds the summary for a finished run.
 *
 * Called before the run is spliced out of the expedition list, because the
 * combatants carry the only record of who did what.
 *
 * @param {object} run
 * @param {boolean} success
 * @param {boolean} auto  whether this party will redeploy on its own
 */
export function addReport(run, success, auto) {
  // Summaries can be switched off entirely. A party that redeploys on its own
  // still files a *silent* report, because the five-second gap between runs is
  // what the report's timer provides — turning the summary off should stop the
  // reading, not turn auto-redeploy into a machine gun. A party waiting to be
  // sent by hand has nothing to gate, so it files nothing at all.
  const silent = !!G.state?.settings?.hideReports;
  if (silent && !auto) return;

  const heroes = run.combatants.map((c) => ({
    uid: c.uid,
    name: c.name,
    classId: c.classId,
    role: c.role,
    down: !!c.down,
    damageDealt: Math.max(0, Math.round(c.damageDealt ?? 0)),
    damageTaken: Math.max(0, Math.round(c.damageTaken ?? 0)),
    healingDone: Math.max(0, Math.round(c.healingDone ?? 0)),
  }));

  reports.push({
    id: uid('r'),
    partyId: run.partyId,
    partyName: null,             // filled by the caller, which knows the party
    name: run.name,
    tier: run.tier,
    raid: !!run.raidId,
    contract: !!run.contractId,
    cleared: success,
    seconds: run.elapsed,
    // A wipe forfeits the haul, so the figures a failed run reports are what
    // was *lost*. Saying so is the point: it is the strongest argument the
    // game can make for recalling early.
    rewards: { ...run.rewards },
    heroes,
    auto,
    silent,
    remaining: auto ? AUTO_DISMISS_SECONDS : null,
  });
  emit('reports');
}

/** The pending report for a party, if any. */
export function reportForParty(partyId) {
  return reports.find((r) => r.partyId === partyId) ?? null;
}

export function dismissReport(id) {
  const i = reports.findIndex((r) => r.id === id);
  if (i < 0) return false;
  reports.splice(i, 1);
  emit('reports');
  return true;
}

/**
 * Drops whatever a party was still showing.
 *
 * Sending a party somewhere new answers the summary: the run it describes is
 * two runs ago and the panel below is already showing the new one. Without
 * this they pile up down the screen, since only a click or the auto timer ever
 * removed one.
 */
export function dismissReportsFor(partyId) {
  let changed = false;
  for (let i = reports.length - 1; i >= 0; i--) {
    if (reports[i].partyId !== partyId) continue;
    reports.splice(i, 1);
    changed = true;
  }
  if (changed) emit('reports');
  return changed;
}

export function clearReports() {
  if (!reports.length) return;
  reports.length = 0;
  emit('reports');
}

/**
 * Counts down auto-dismissing reports.
 *
 * Returns true if any report expired, so the caller knows the display needs
 * rebuilding rather than merely re-timing.
 */
export function tickReports(dt) {
  let changed = false;
  for (let i = reports.length - 1; i >= 0; i--) {
    const r = reports[i];
    if (r.remaining == null) continue;
    r.remaining -= dt;
    if (r.remaining <= 0) { reports.splice(i, 1); changed = true; }
  }
  if (changed) emit('reports');
  return changed;
}

/**
 * Whether a party is still reading its summary.
 *
 * Auto-redeploy consults this, which is what gives the five seconds their
 * meaning: without it the next expedition would launch instantly and the
 * summary would be replaced by a progress bar before it could be read.
 */
export function partyIsReading(partyId) {
  return reports.some((r) => r.partyId === partyId);
}

/** Largest value of a column, for drawing bars proportionally. */
export function peakOf(report, key) {
  return Math.max(1, ...report.heroes.map((h) => h[key] ?? 0));
}
