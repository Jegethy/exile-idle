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
  chapterNeedsAction, needsActionPrompt, markActionPromptSeen,
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
    ? `<button class="btn tiny primary" data-quest-goto="${esc(ch.teaches.tab)}"
        data-quest-target="${esc(ch.teaches.target ?? '')}">Show Me</button>`
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

/**
 * Takes the player to the thing the chapter wants, and points at it.
 *
 * Switching tab was not enough, and in one case was nothing at all: "More
 * Hands" points at the roster, the roster is the tab a new guild is already
 * looking at, so the button changed nothing on screen and read as broken. The
 * tab is only half the instruction — the other half is *which control*, and
 * that is what the flash is for.
 */
function showMe(tab, target) {
  if (tab) gotoTab(tab);
  if (!target) return;
  // After the tab switch has painted, or the element is measured while its
  // panel is still hidden and the scroll goes nowhere.
  requestAnimationFrame(() => {
    const el = qs(target);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.remove('quest-flash');
    // Reading offsetWidth restarts the animation; without it a second press
    // does nothing at all, which is the bug this function exists to fix.
    void el.offsetWidth;
    el.classList.add('quest-flash');
    setTimeout(() => el.classList.remove('quest-flash'), 2400);
  });
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
    btn.onclick = () => showMe(btn.dataset.questGoto, btn.dataset.questTarget);
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

/**
 * The state of the Quests tab itself.
 *
 * Two different things, and they are worth telling apart. A chapter merely in
 * progress gets a quiet dot — the player is already doing the work. A chapter
 * waiting on a *press* gets the tab glowing, because that is where a questline
 * stalls: the guild is waiting on a button the player has never seen and has no
 * reason to go looking for.
 */
export function renderQuestMark() {
  const s = G.state;
  const mark = qs('#questTabMark');
  const tab = qs('.tab[data-tab="quests"]');
  if (!s) return;
  const running = !storyComplete(s) && !storySkipped(s);
  const waiting = chapterNeedsAction(s);
  if (mark) mark.textContent = running ? (waiting ? '!' : '·') : '';
  if (tab) tab.classList.toggle('quest-call', waiting);
  if (waiting) promptOnce();
}

/**
 * Explains the glow, once, the first time anything wears it.
 *
 * Deferred a beat so it never lands on top of whatever the player just pressed
 * to get here — a modal that appears in the same frame as a click reads as a
 * consequence of the click.
 */
function promptOnce() {
  const s = G.state;
  if (!needsActionPrompt(s) || promptPending) return;
  promptPending = true;
  setTimeout(() => {
    promptPending = false;
    if (!needsActionPrompt(G.state)) return;
    const ch = currentChapter(G.state);
    markActionPromptSeen(G.state);
    confirmAction(
      'The guild is waiting on you',
      `"${ch?.title ?? 'A chapter'}" needs something done rather than something fought. `
      + 'While a chapter is waiting on you the Quests tab is lit — open it, read the beat, '
      + 'and press Show Me to be taken to the screen it wants. Nothing expires, so there is '
      + 'no hurry.',
      () => gotoTab('quests'),
    );
  }, 900);
}

let promptPending = false;
