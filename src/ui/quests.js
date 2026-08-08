// ui/quests — the questline, and what the guild is meant to be doing about it.
//
// Deliberately a panel rather than a twenty-five step overlay. The tutorial's
// cut-out is the right tool for teaching a screen the player has never seen,
// and the wrong one for a story that runs for hours: an overlay that reappears
// every chapter would stop being guidance and start being an interruption. So
// the narrative lives here and waits to be read, and the overlay is borrowed
// only by the chapters that open a system for the first time.
//
// Finished chapters stay on the page. A questline you can no longer read is a
// questline nobody remembers the point of, and the whole reason this exists is
// to answer "why am I doing this".

import { G } from '../state.js';
import { CHAPTERS, LEGENDS, LEGEND_BY_ID, SYSTEM_BY_ID } from '../data/story.js';
import { CLASS_BY_ID } from '../data/heroclasses.js';
import {
  currentChapter, objectiveProgress, completedChapters, storyComplete, storySkipped,
  skipStory, resumeStory, legendsWaiting, claimedLegend, claimLegend,
} from '../story.js';
import { escapeHtml, fmtInt, qs } from '../util.js';
import { confirmAction } from './modals.js';
import { gotoTab } from './shell.js';

const esc = escapeHtml;

/** One finished chapter, folded down to its title and its beat. */
function doneCard(ch) {
  return `<div class="quest done">
    <div class="quest-head"><span class="quest-act">${esc(ch.act)}</span>
      <b>${esc(ch.title)}</b><span class="quest-tick">done</span></div>
    <p class="quest-text">${esc(ch.narrative)}</p>
  </div>`;
}

/** The chapter in progress, with its objective and a bar. */
function activeCard(ch, p) {
  const pct = p.goal > 0 ? Math.min(100, (p.have / p.goal) * 100) : 0;
  const teach = ch.teaches
    ? `<button class="btn tiny" data-quest-goto="${esc(ch.teaches.tab)}">Show me</button>`
    : '';
  const opens = (ch.unlocks ?? []).map((id) => SYSTEM_BY_ID[id]?.name).filter(Boolean);
  return `<div class="quest active">
    <div class="quest-head"><span class="quest-act">${esc(ch.act)}</span>
      <b>${esc(ch.title)}</b></div>
    <p class="quest-text">${esc(ch.narrative)}</p>
    <div class="quest-obj">
      <div class="quest-obj-row">
        <span>${esc(ch.objective.text)}</span>
        <b>${fmtInt(p.have)} / ${fmtInt(p.goal)}</b>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>
    ${opens.length ? `<p class="quest-opens">This chapter opens <b>${opens.map(esc).join('</b>, <b>')}</b>.</p>` : ''}
    ${teach}
  </div>`;
}

/**
 * The three at the door.
 *
 * Presented as a choice between *jobs* rather than between power levels: all
 * three are Legendary and none is stronger than the others, so the only real
 * question is what the guild is short of. Said plainly on the screen, because a
 * permanent choice the player thought was about strength is a permanent choice
 * made for the wrong reason.
 */
function legendsCard() {
  return `<p class="quest-text">The door takes two to hold, and three have been holding it.
      Two of them stay. One walks out with you, and nobody is coming back for the others.</p>
    <div class="legend-grid">${LEGENDS.map((l) => {
    const cls = CLASS_BY_ID[l.classId];
    return `<div class="quest legend">
        <div class="quest-head"><b>${esc(l.name)}</b>
          <span class="unique-chip">Unique</span></div>
        <div class="quest-act">${esc(l.role ?? '')} · ${esc(cls?.name ?? '')}</div>
        <p class="quest-text">${esc(l.blurb)}</p>
        <button class="btn primary" data-legend="${esc(l.id)}">Take ${esc(l.name.split(' ')[0])}</button>
      </div>`;
  }).join('')}</div>
    <p class="quest-opens">All three are Legendary and none is stronger than the others.
      What sets them apart is that they fight with <b>two skills at once</b>, which nobody
      else in the guild can do. Choose the job you are short of.</p>`;
}

export function renderQuests() {
  const host = qs('#questPanel');
  if (!host) return;
  const s = G.state;
  if (!s) return;

  const done = completedChapters(s);
  const ch = currentChapter(s);
  const p = objectiveProgress(s);
  const skipped = storySkipped(s);
  const complete = storyComplete(s);

  const head = `<div class="section-head"><span>The Ninth</span>
    <div class="head-actions">
      <span class="hint">${done.length} of ${CHAPTERS.length}</span>
      ${complete ? '' : (skipped
    ? '<button class="btn tiny" id="btnStoryResume">Take It Up Again</button>'
    : '<button class="btn tiny" id="btnStorySkip">Set It Aside</button>')}
    </div></div>`;

  let body;
  if (complete && legendsWaiting(s)) {
    body = legendsCard();
  } else if (complete) {
    const took = LEGEND_BY_ID[claimedLegend(s)];
    body = `<p class="hint">The Ninth is finished, and the door is held.${took
      ? ` ${esc(took.name)} walked out with you; the other two stayed.` : ''}</p>`;
  } else if (skipped) {
    // The point of the wording: nothing was spent and nothing was lost. A guild
    // that shelved the paybook can pick it up whenever, and the chapters it has
    // already satisfied are credited the moment it does.
    body = '<p class="hint">The paybook is in a drawer. Every hall and workshop is open. '
      + 'The line is still here, and whatever you have already done counts towards it — '
      + 'take it back out whenever you like.</p>';
  } else if (ch && p) {
    body = activeCard(ch, p);
  } else {
    body = '<p class="hint">Nothing pressing.</p>';
  }

  host.innerHTML = head + body
    + (done.length ? `<div class="section-head"><span>Behind You</span></div>
       ${done.slice().reverse().map(doneCard).join('')}` : '');

  const skip = qs('#btnStorySkip');
  if (skip) {
    skip.onclick = () => confirmAction(
      'Put the paybook in a drawer?',
      'Every hall and workshop opens straight away, and the guild stops being prompted. '
      + 'Nothing is lost: the line stays here, whatever you have already done still counts '
      + 'towards it, and the three at the end of it are still yours to reach.',
      () => { skipStory(); renderQuests(); },
    );
  }
  const resume = qs('#btnStoryResume');
  if (resume) resume.onclick = () => { resumeStory(); renderQuests(); };

  for (const btn of host.querySelectorAll('[data-quest-goto]')) {
    btn.onclick = () => gotoTab(btn.dataset.questGoto);
  }
  for (const btn of host.querySelectorAll('[data-legend]')) {
    btn.onclick = () => {
      const def = LEGEND_BY_ID[btn.dataset.legend];
      if (!def) return;
      confirmAction(
        `${def.name} joins the guild?`,
        'The other two stay at the door, and nobody is coming back for them. All three '
        + 'are equally capable — this is a choice about which job your guild is short of.',
        () => { claimLegend(def.id); renderQuests(); },
      );
    };
  }
}

/** A dot on the tab when a chapter is waiting to be read. */
export function renderQuestMark() {
  const mark = qs('#questTabMark');
  if (!mark) return;
  const s = G.state;
  const showing = !!s && !storyComplete(s) && !storySkipped(s);
  mark.textContent = showing ? '!' : '';
}
