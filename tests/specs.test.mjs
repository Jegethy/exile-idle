// Specialisations — the one decision a hero ever presents, and the one thing
// in the game that cannot be taken back.
//
// Two kinds of test here, and the split matters.
//
// The structural ones guard the shape: nobody is offered something they cannot
// use, every branch has at least three places to go, no capstone is stranded
// where no class can reach it, and the second tier is drawn strictly from the
// first. Those are the rules that make a hundred-and-forty-entry design fit
// into fifty-six, and a new entry added carelessly breaks exactly one of them.
//
// The behavioural ones guard the promise. Permanence is enforced in the engine
// rather than merely hidden in the interface, because a permanent choice any
// caller can overwrite is not permanent — it is undocumented. And deferring
// has to cost nothing and expire never, because the alternative is twelve
// heroes crossing level 15 within an hour and twelve decisions made at random
// to stop the flashing.

import { openGame } from './harness.mjs';
import { suite, test, ok, eq, near, clean } from './assert.mjs';

/** A level-60 hero of the given class, with no specialisations. */
async function fresh(page, classId, level = 60) {
  return page.evaluate(async ([cid, lvl]) => {
    const { rollHero } = await import('./src/heroes.js');
    const { G } = await import('./src/state.js');
    const h = rollHero({ classId: cid, rarity: 'rare', level: lvl });
    G.state.heroes.push(h);
    return h.uid;
  }, [classId, level]);
}

export default async function run(browser) {
  suite('specialisations');
  const { page, errors } = await openGame(browser, { name: 'Specs' });
  await page.evaluate(async () => {
    const { G } = await import('./src/state.js');
    G.paused = true;
  });

  // -------------------------------------------------------------------------
  // Structure
  // -------------------------------------------------------------------------

  await test('every class sees at least three, and nothing it could never use', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const { specPoolFor, SPECS } = await import('./src/data/specs.js');
      const problems = [];
      const thin = [];
      for (const c of HERO_CLASSES) {
        const branches = specPoolFor(c, 1);
        if (branches.length < 3) thin.push(`${c.id} tier 1: ${branches.length}`);
        for (const b of branches) {
          if (b.role !== c.role) problems.push(`${c.id} offered ${b.id} (${b.role} only)`);
          const req = b.req ?? {};
          if (req.reach && req.reach !== c.reach) problems.push(`${c.id} offered ${b.id} (${req.reach})`);
          if (req.school && req.school !== c.school && c.school !== 'hybrid') {
            problems.push(`${c.id} offered ${b.id} (${req.school})`);
          }
          const tips = specPoolFor(c, 2, b.id);
          if (tips.length < 3) thin.push(`${c.id}/${b.id}: ${tips.length} tips`);
        }
      }
      return { problems, thin, total: SPECS.length };
    });
    eq(r.problems.length, 0, r.problems.slice(0, 5).join('; '));
    // Three is the floor because one is not a choice and two is a coin toss.
    eq(r.thin.length, 0, `nothing to choose between — ${r.thin.join(', ')}`);
    return `${r.total} specialisations, every class and branch offering three or more`;
  });

  await test('no specialisation is stranded where nobody can reach it', async () => {
    const r = await page.evaluate(async () => {
      const { HERO_CLASSES } = await import('./src/data/heroclasses.js');
      const { specPoolFor, SPECS } = await import('./src/data/specs.js');
      const reachable = new Set();
      for (const c of HERO_CLASSES) {
        for (const b of specPoolFor(c, 1)) {
          reachable.add(b.id);
          for (const t of specPoolFor(c, 2, b.id)) reachable.add(t.id);
        }
      }
      const dupes = [];
      const seen = new Set();
      for (const s of SPECS) { if (seen.has(s.id)) dupes.push(s.id); seen.add(s.id); }
      return {
        orphans: SPECS.filter((s) => !reachable.has(s.id)).map((s) => s.id),
        dupes,
        // Every tier-2 must name where it comes from, or it is reachable from
        // nowhere and everywhere at once.
        rootless: SPECS.filter((s) => s.tier === 2 && !s.from?.length).map((s) => s.id),
        unaxed: SPECS.filter((s) => !['edge', 'anchor', 'chorus'].includes(s.axis)).map((s) => s.id),
      };
    });
    eq(r.orphans.length, 0, `unreachable: ${r.orphans.join(', ')}`);
    eq(r.dupes.length, 0, `duplicate ids: ${r.dupes.join(', ')}`);
    eq(r.rootless.length, 0, `tier 2 with no branch: ${r.rootless.join(', ')}`);
    eq(r.unaxed.length, 0, `no axis: ${r.unaxed.join(', ')}`);
    return 'every entry reachable, rooted and shaped';
  });

  await test('the second tier is drawn strictly from the first', async () => {
    const uid = await fresh(page, 'warrior');
    const r = await page.evaluate(async (u) => {
      const { heroById } = await import('./src/heroes.js');
      const { chooseSpec, optionsFor } = await import('./src/specs.js');
      const hero = heroById(u);
      chooseSpec(hero, 'bulwark');
      const after = optionsFor(hero, 2).map((s) => s.id);
      return {
        after,
        // The rule the whole design rests on. A Bulwark can become a Defender.
        // It can never become a Daredevil, and it can never go back to being
        // an unspecialised Warrior.
        daredevil: chooseSpec(hero, 'daredevil'),
        revert: chooseSpec(hero, 'berserker'),
        firstStill: hero.specs[0],
      };
    }, uid);
    ok(r.after.includes('defender'), `a Bulwark cannot reach Defender: ${r.after.join(', ')}`);
    ok(!r.after.includes('daredevil'), 'a Bulwark is offered a Berserker capstone');
    eq(r.daredevil.ok, false, 'a Bulwark became a Daredevil');
    eq(r.revert.ok, false, 'a Bulwark reverted to an unspecialised Warrior');
    eq(r.firstStill, 'bulwark', 'the first choice was overwritten');
    return `Bulwark reaches ${r.after.length}, and neither of the other branches`;
  });

  // -------------------------------------------------------------------------
  // The promise
  // -------------------------------------------------------------------------

  await test('nothing unlocks before its level, and the second waits for the first', async () => {
    const uid = await fresh(page, 'rogue', 14);
    const r = await page.evaluate(async (u) => {
      const { heroById } = await import('./src/heroes.js');
      const { chooseSpec, optionsFor, pendingTier, SPEC_LEVELS } = await import('./src/specs.js');
      const hero = heroById(u);
      const at14 = { t1: optionsFor(hero, 1).length, pending: pendingTier(hero) };
      const early = chooseSpec(hero, 'assassin');

      hero.level = 15;
      const at15 = { t1: optionsFor(hero, 1).length, t2: optionsFor(hero, 2).length };

      hero.level = 50;
      // Level 50 with nothing taken at 15: the second tier is still shut,
      // because it is drawn from a first choice that does not exist.
      const at50unspent = optionsFor(hero, 2).length;
      chooseSpec(hero, 'assassin');
      const at50spent = optionsFor(hero, 2).length;
      return { at14, early: early.ok, at15, at50unspent, at50spent, levels: SPEC_LEVELS };
    }, uid);
    eq(r.levels[0], 15, `first specialisation at level ${r.levels[0]}`);
    eq(r.levels[1], 50, `second specialisation at level ${r.levels[1]}`);
    eq(r.at14.t1, 0, 'a level 14 hero was offered a specialisation');
    eq(r.at14.pending, 0, 'a level 14 hero was flagged as owing a choice');
    eq(r.early.ok ?? r.early, false, 'a level 14 hero took one anyway');
    ok(r.at15.t1 >= 3, `only ${r.at15.t1} options at level 15`);
    eq(r.at15.t2, 0, 'the second tier opened at level 15');
    eq(r.at50unspent, 0, 'the second tier opened without the first being taken');
    ok(r.at50spent >= 3, `only ${r.at50spent} capstones after specialising`);
    return 'shut at 14, three at 15, and the second tier needs the first';
  });

  await test('a choice cannot be undone, by any route', async () => {
    const uid = await fresh(page, 'wizard');
    const r = await page.evaluate(async (u) => {
      const { heroById } = await import('./src/heroes.js');
      const { chooseSpec, optionsFor } = await import('./src/specs.js');
      const hero = heroById(u);
      chooseSpec(hero, 'hexer');
      return {
        // Every way back a caller might try. All of them are refused by the
        // engine, not merely hidden by the interface.
        sameAgain: chooseSpec(hero, 'hexer').ok,
        sibling: chooseSpec(hero, 'elementalist').ok,
        nothing: chooseSpec(hero, null).ok,
        unknown: chooseSpec(hero, 'not_a_spec').ok,
        stillOffered: optionsFor(hero, 1).length,
        held: hero.specs[0],
        // ...and there is no exported way to give one back at all.
        exports: Object.keys(await import('./src/specs.js'))
          .filter((k) => /reset|clear|undo|respec|remove|forget/i.test(k)),
      };
    }, uid);
    eq(r.sibling, false, 'a specialisation was swapped for its sibling');
    eq(r.sameAgain, false, 'a specialisation was re-taken');
    eq(r.nothing, false, 'a specialisation was cleared with null');
    eq(r.unknown, false, 'an unknown id was accepted');
    eq(r.stillOffered, 0, 'a spent tier still offers options');
    eq(r.held, 'hexer', 'the choice did not stick');
    eq(r.exports.length, 0, `there is a way to undo one: ${r.exports.join(', ')}`);
    return 'refused four ways, and no undo exists to call';
  });

  await test('declining is free, permanent-optional, and never expires', async () => {
    const uid = await fresh(page, 'bard');
    const r = await page.evaluate(async (u) => {
      const { heroById } = await import('./src/heroes.js');
      const { deferSpec, nagging, optionsFor, pendingTier } = await import('./src/specs.js');
      const hero = heroById(u);
      const before = { nag: nagging(hero), pending: pendingTier(hero) };
      deferSpec(hero);
      const after = { nag: nagging(hero), pending: pendingTier(hero), open: optionsFor(hero, 1).length };
      // Still unspecialised many levels later, and still able to choose.
      hero.level = 90;
      const later = { open: optionsFor(hero, 1).length, specs: hero.specs.length };
      return { before, after, later };
    }, uid);
    ok(r.before.nag, 'a hero past level 15 is not flagged at all');
    eq(r.after.nag, false, 'deferring did not stop the prompt');
    ok(r.after.pending > 0, 'deferring spent the choice');
    ok(r.after.open >= 3, 'deferring closed the options');
    ok(r.later.open >= 3, 'the choice expired at a higher level');
    eq(r.later.specs, 0, 'declining quietly specialised the hero anyway');
    return 'prompt silenced, choice still open 75 levels later';
  });

  // -------------------------------------------------------------------------
  // The effects actually land
  // -------------------------------------------------------------------------

  await test('a flat specialisation moves the sheet, and the preview says by how much', async () => {
    const uid = await fresh(page, 'warrior');
    const r = await page.evaluate(async (u) => {
      const { heroById } = await import('./src/heroes.js');
      const { chooseSpec, previewSpec } = await import('./src/specs.js');
      const { heroStats } = await import('./src/stats.js');
      const { G } = await import('./src/state.js');
      const { SPEC_BY_ID } = await import('./src/data/specs.js');
      const hero = heroById(u);
      // Stripped, because a rolled Thick Hide or Juggernaut also contributes
      // to incArmour and the two are summed before the multiplier — so the
      // ratio would depend on which traits this hero happened to draw.
      hero.traits = [];
      const before = heroStats(hero, G.state.upgrades);
      const rows = previewSpec(hero, 'berserker');
      chooseSpec(hero, 'berserker');
      const after = heroStats(hero, G.state.upgrades);
      const armourRow = rows.find((x) => x.label === 'Armour');
      return {
        beforeArmour: before.armour,
        afterArmour: after.armour,
        // Read from the data rather than pinned, so retuning the branch does
        // not break the test — what is being checked is that the stat bag
        // applies the figure the branch actually declares.
        declared: SPEC_BY_ID.berserker.stats.incArmour,
        rows: rows.length,
        // The preview has to agree with what actually happens, or it is worse
        // than showing nothing on a decision that cannot be undone.
        previewBefore: armourRow?.before ?? null,
        previewAfter: armourRow?.after ?? null,
      };
    }, uid);
    ok(r.declared < 0, 'Berserker no longer costs armour — this test is measuring nothing');
    ok(r.afterArmour < r.beforeArmour, 'Berserker did not cost any armour');
    near(r.afterArmour / r.beforeArmour, 1 + r.declared / 100, 0.02,
      `armour went to ${Math.round((r.afterArmour / r.beforeArmour) * 100)}% `
      + `rather than the declared ${100 + r.declared}%`);
    ok(r.rows > 0, 'the preview showed nothing for a specialisation with stat lines');
    near(r.previewBefore, r.beforeArmour, 1, 'the preview disagreed about the current sheet');
    near(r.previewAfter, r.afterArmour, 1, 'the preview disagreed about the result');
    return `armour ${Math.round(r.beforeArmour)} → ${Math.round(r.afterArmour)}, and the preview said so`;
  });

  await test('a specialisation reaction reaches the run', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { reactionsFor } = await import('./src/expedition/abilities.js');
      const { rollHero } = await import('./src/heroes.js');
      const hero = rollHero({ classId: 'warlock', rarity: 'rare', level: 60 });
      const bare = reactionsFor(hero, {}).length;
      hero.specs = ['hexer', 'plaguebearer'];
      const keys = reactionsFor(hero, {}).map((x) => x.key);
      return { bare, keys, gained: keys.length - bare };
    });
    eq(r.gained, 2, `two specialisations added ${r.gained} reactions`);
    ok(r.keys.includes('spec-hexer') && r.keys.includes('spec-plaguebearer'),
      `specialisation reactions missing: ${r.keys.join(', ')}`);
    return 'both specialisations bring their reactions into the run';
  });

  await test('a curse makes an enemy easier to hurt', async () => {
    const r = await page.evaluate(async () => {
      const { applyEffect, modFrom } = await import('./src/expedition/effects.js');
      const enemy = { name: 'Test', life: 1000, maxLife: 1000, armour: 0, res: 0, effects: [] };
      applyEffect(enemy, { id: 'hex', name: 'Hexed', duration: 4, mods: { damageTaken: 14 } });
      return { vuln: modFrom(enemy, 'damageTaken') };
    });
    // Before this, `damageTaken` was only ever read on heroes: every curse in
    // the specialisation list would have been a no-op that read beautifully.
    eq(r.vuln, 14, `a cursed enemy takes ${r.vuln}% more rather than 14%`);
    return 'enemies carry vulnerability, which is what a Hexer is for';
  });

  await test('a Warden takes the blow meant for somebody else', async () => {
    const r = await page.evaluate(async () => {
      const { deliver } = await import('./src/expedition/combat.js');
      const { applyEffect } = await import('./src/expedition/effects.js');

      // Built by hand rather than measured out of a real expedition: the whole
      // question is arithmetic, and a live run answers it through several
      // thousand dice.
      const make = (name, row) => ({
        uid: name, name, row, life: 1e6, maxLife: 1e6, es: 0, ward: 0, effects: [],
      });
      const warden = make('warden', 'front');
      const front = make('front', 'front');
      const back = make('back', 'back');
      const run = { name: 'Test', combatants: [warden, front, back] };
      const cover = (mods) => applyEffect(warden, {
        id: 'w', name: 'Warden', duration: Infinity, mods,
      });
      const took = (c) => Math.round(c.damageTaken ?? 0);
      const reset = () => { for (const c of run.combatants) { c.damageTaken = 0; c.effects = []; } };

      reset();
      cover({ redirect: 18 });
      deliver(run, front, 1000);
      const guarded = { front: took(front), warden: took(warden) };
      deliver(run, back, 1000);
      const backRow = { back: took(back), warden: took(warden) - guarded.warden };

      reset();
      cover({ redirect: 18, redirectAll: 1 });
      deliver(run, back, 1000);
      const vanguard = { back: took(back), warden: took(warden) };

      reset();
      cover({ redirect: 18, redirectShave: 35 });
      deliver(run, front, 1000);
      const aegis = { front: took(front), warden: took(warden) };

      reset();
      deliver(run, front, 1000);
      const plain = { front: took(front), warden: took(warden) };

      return { plain, guarded, backRow, vanguard, aegis };
    });
    eq(r.plain.front, 1000, 'an unguarded blow did not land in full');
    eq(r.plain.warden, 0, 'a tank with no cover took somebody else\'s blow');
    eq(r.guarded.front, 820, 'the guarded hero did not shed 18%');
    eq(r.guarded.warden, 180, 'the Warden did not take the 18%');
    // A Warden covers the front line. Reaching the back row is what the
    // Vanguard is bought for, and must not come free.
    eq(r.backRow.back, 1000, 'a Warden covered the back row without a Vanguard');
    eq(r.backRow.warden, 0, 'a Warden took a blow aimed past the front line');
    eq(r.vanguard.back, 820, 'a Vanguard did not reach the back row');
    eq(r.aegis.front, 820, 'Aegis changed what the guarded hero sheds');
    eq(r.aegis.warden, 117, `Aegis let ${r.aegis.warden} through rather than 117`);
    return 'front line shielded 18%, back row only for a Vanguard, Aegis shaves 35% in transit';
  });

  await test('a Bastion blunts the crushing blow, and pays for it in block', async () => {
    const r = await page.evaluate(async () => {
      const { heroStats } = await import('./src/stats.js');
      const { rollHero } = await import('./src/heroes.js');
      const { createItem } = await import('./src/items.js');
      const { G } = await import('./src/state.js');
      const { applyEffect, modFrom } = await import('./src/expedition/effects.js');

      const hero = rollHero({ classId: 'warrior', rarity: 'legendary', level: 60 });
      // Stacked well past the Bastion's own ceiling, so the cap has to bite:
      // 15 from the class, 30 from the shield, 10 from the trait, 10 from the
      // branch. Otherwise the test passes whether the ceiling exists or not.
      hero.traits = ['bulwark'];
      hero.equipment.offhand = createItem({ baseId: 'shield_str', ilvl: 80, rarity: 'rare' });
      hero.specs = ['bulwark'];
      const openCap = heroStats(hero, G.state.upgrades).blockMelee;
      hero.specs = ['bulwark', 'bastion'];
      const capped = heroStats(hero, G.state.upgrades).blockMelee;

      const c = { effects: [] };
      applyEffect(c, {
        id: 'b', name: 'Bastion', duration: Infinity, mods: { noCrit: 1, crushResist: 50 },
      });
      return {
        openCap, capped, crush: modFrom(c, 'crushResist'), noCrit: modFrom(c, 'noCrit'),
      };
    });
    ok(r.openCap > 60, `only ${r.openCap}% block before the ceiling — the test proves nothing`);
    eq(r.capped, 60, `a Bastion blocked ${r.capped}% rather than its own 60% ceiling`);
    eq(r.crush, 50, 'a crushing blow is not blunted');
    ok(r.noCrit > 0, 'a Bastion can still be critically struck');
    return `block ${r.openCap}% → ${r.capped}%, crushing blows halved`;
  });

  await test('a wound-scaled bonus shrinks again when the wound is healed', async () => {
    const r = await page.evaluate(async () => {
      const { woundScaledBuff } = await import('./src/expedition/reactions.js');
      const { modFrom } = await import('./src/expedition/effects.js');
      const self = { uid: 'x', life: 1000, maxLife: 1000, effects: [] };
      const ctx = { self, run: { combatants: [self] } };
      const buff = woundScaledBuff('t', 'Test', 'incDamage', 70);

      self.life = 300; buff(ctx);
      const hurt = modFrom(self, 'incDamage');
      self.life = 900; buff(ctx);
      const mended = modFrom(self, 'incDamage');
      return { hurt, mended };
    });
    // Refreshing never downgrades, by design — which would have pinned a
    // Berserker at whatever it was worth the first time it was hit.
    eq(r.hurt, 49, `70% at 30% life gave ${r.hurt}% rather than 49%`);
    eq(r.mended, 7, `healing back to 90% left ${r.mended}% rather than 7%`);
    return 'rises to 49% at a third life, falls back to 7% when mended';
  });

  // -------------------------------------------------------------------------
  // The interface
  // -------------------------------------------------------------------------

  await test('the choice screen says it is permanent and offers a way out', async () => {
    const uid = await fresh(page, 'druid');
    const r = await page.evaluate(async (u) => {
      const { openSpecModal } = await import('./src/ui/specs.js');
      openSpecModal(u);
      const body = document.querySelector('#specModalBody');
      const text = body.textContent.replace(/\s+/g, ' ');
      const cards = [...body.querySelectorAll('[data-spec]')];
      // A card has to be opened before anything can be committed.
      const armedCold = !document.querySelector('#btnSpecConfirm').disabled;
      cards[0].click();
      const confirm = document.querySelector('#btnSpecConfirm');
      return {
        text,
        cards: cards.length,
        armedCold,
        armedAfter: !confirm.disabled,
        confirmText: confirm.textContent.replace(/\s+/g, ' ').trim(),
        defer: !!document.querySelector('#btnSpecDefer'),
        previews: body.querySelectorAll('.sp-preview, .sp-nostats').length,
      };
    }, uid);
    ok(/cannot be undone/i.test(r.text), 'the screen never says the choice is permanent');
    ok(/no retraining|any price/i.test(r.text), 'the screen does not rule out retraining');
    ok(r.cards >= 3, `only ${r.cards} options shown`);
    eq(r.armedCold, false, 'the commit button was live before anything was chosen');
    ok(r.armedAfter, 'opening an option did not arm the commit button');
    ok(/permanent/i.test(r.confirmText), `the commit button reads "${r.confirmText}"`);
    ok(r.defer, 'there is no way to decline');
    eq(r.previews, 1, 'the opened option showed no numbers');
    return `${r.cards} options, warned, and nothing committed in one click`;
  });

  await test('the roster flags a waiting choice and stops once it is deferred', async () => {
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/state.js');
      const { renderRoster } = await import('./src/ui/roster.js');
      const { closeModals } = await import('./src/ui/modals.js');
      const { deferSpec, heroesAwaitingChoice } = await import('./src/specs.js');
      const { gotoTab } = await import('./src/ui/shell.js');
      closeModals();
      gotoTab('roster');

      // Whoever the engine says is owed one — including a hero already part
      // way through, who owes a second choice rather than a first.
      for (const h of G.state.heroes) h.specDeferred = 0;
      const owed = heroesAwaitingChoice(G.state);
      renderRoster();
      const before = {
        chips: document.querySelectorAll('.spec-chip.waiting').length,
        call: !!document.querySelector('#btnSpecNext'),
      };
      for (const h of owed) deferSpec(h);
      renderRoster();
      const after = {
        chips: document.querySelectorAll('.spec-chip.waiting').length,
        call: !!document.querySelector('#btnSpecNext'),
      };
      return { before, after, owed: owed.length };
    });
    ok(r.owed > 0, 'no hero was owed a choice to test with');
    ok(r.before.chips > 0, 'the roster does not flag a waiting choice');
    ok(r.before.call, 'the roster header does not offer to open one');
    eq(r.after.chips, 0, 'deferring did not clear the roster flag');
    eq(r.after.call, false, 'deferring did not clear the header call');
    return `${r.owed} flagged, then quiet after deferring`;
  });

  await test('the hero sheet is a route to the choice, deferred or not', async () => {
    // Level 20, so the first choice is the only one in play. A level 60 hero
    // qualifies for the second the instant it takes the first, which is
    // correct and would make this test about something else.
    const uid = await fresh(page, 'archer', 20);
    const r = await page.evaluate(async (u) => {
      const { heroById } = await import('./src/heroes.js');
      const { openHeroModal } = await import('./src/ui/roster.js');
      const { deferSpec, chooseSpec } = await import('./src/specs.js');
      const hero = heroById(u);
      const read = () => {
        openHeroModal(u);
        const body = document.querySelector('#heroModalBody');
        return {
          btn: !!document.querySelector('#btnSpecChoose'),
          rows: body.querySelectorAll('.spec-row').length,
          text: body.textContent.replace(/\s+/g, ' '),
        };
      };
      const open = read();
      deferSpec(hero);
      // Deferring silences the roster badge, not the hero's own page. Hiding
      // an available decision where a player goes to look would turn "not yet"
      // into "never".
      const deferred = read();
      chooseSpec(hero, 'marksman');
      const chosen = read();
      // A hero already past the second threshold is offered it straight away
      // rather than being made to wait for another level-up.
      hero.level = 60;
      const secondOwed = read();
      return { open, deferred, chosen, secondOwed };
    }, uid);
    ok(r.open.btn, 'the hero sheet offers no way to specialise');
    ok(/permanent/i.test(r.open.text), 'the hero sheet does not say it is permanent');
    ok(r.deferred.btn, 'deferring hid the choice on the hero\'s own page');
    eq(r.chosen.btn, false, 'a level 20 hero was offered its second choice as well');
    eq(r.chosen.rows, 1, 'the hero sheet does not list what the hero became');
    ok(/level 50/i.test(r.chosen.text), 'the sheet does not say when they specialise again');
    ok(r.secondOwed.btn, 'a hero already past level 50 is not offered its second choice');
    eq(r.secondOwed.rows, 1, 'the first choice stopped being listed');
    return 'offered, still offered after deferring, listed once taken, offered again at 50';
  });

  await test('an older save arrives unspecialised rather than broken', async () => {
    const r = await page.evaluate(async () => {
      const { migrateSpecs, optionsFor, nagging } = await import('./src/specs.js');
      const { rollHero } = await import('./src/heroes.js');

      const old = rollHero({ classId: 'paladin', rarity: 'rare', level: 60 });
      delete old.specs;                       // a save from before the system
      migrateSpecs(old);

      const retired = rollHero({ classId: 'paladin', rarity: 'rare', level: 60 });
      retired.specs = ['a_spec_that_was_removed'];
      migrateSpecs(retired);

      return {
        old: { specs: old.specs, options: optionsFor(old, 1).length, nag: nagging(old) },
        // A dead id must be cleared, or it sits in the slot forever blocking a
        // choice it can no longer make.
        retired: { specs: retired.specs, options: optionsFor(retired, 1).length },
      };
    });
    eq(r.old.specs.length, 0, 'an older hero arrived with specialisations it never chose');
    ok(r.old.options >= 3, 'an older hero cannot specialise at all');
    ok(r.old.nag, 'an older hero past level 15 is not told a choice is waiting');
    eq(r.retired.specs[0], null, 'a retired specialisation was left in the slot');
    ok(r.retired.options >= 3, 'a retired specialisation still blocks the choice');
    return 'unspecialised and choosable, and dead ids cleared out';
  });

  await test('no page errors', async () => {
    eq(errors.length, 0, errors.join(' | '));
    return 'no page errors';
  });

  clean(page);
}
