// expedition/combat — The tick: waves spawn, heroes act, enemies act, the run resolves.

import { rng } from '../rng.js';
import { G, emit, log } from '../state.js';
import { armourReduction, hitChance } from '../stats.js';
import { clamp, fmt, uid } from '../util.js';
import { DAMAGE_TYPES, WAVE_GAP, flaskFx, levelGap } from './balance.js';
import { makeEnemy, makeGuardian } from './enemies.js';
import { finishRun, onEnemyKilled } from './rewards.js';
import { fireTrigger, modFrom, tickEffects } from './effects.js';
import { addWard, damageHero, healHero } from './vitals.js';
import { canAfford, gain, spend, tickResource } from './resource.js';

/** Advances every running expedition by `dt` seconds. */
export function tickAll(dt) {
  const s = G.state;
  for (let i = s.expeditions.length - 1; i >= 0; i--) {
    const run = s.expeditions[i];
    if (run.status !== 'running') { s.expeditions.splice(i, 1); continue; }
    tickRun(run, dt);
  }
}

function tickRun(run, dt) {
  run.elapsed += dt;

  if (!run.enemies.length) {
    run.waveTimer -= dt;
    if (run.waveTimer <= 0) spawnWave(run);
    return;
  }

  // --- Effects tick first, so a bleed can finish something off before the
  // swing that would otherwise have been wasted on it ---
  tickPartyEffects(run, dt);
  tickEnemyEffects(run, dt);
  if (!run.enemies.length) {
    if (run.raidId || (run.wave >= run.totalWaves + 1)) { finishRun(run, true); return; }
    run.waveTimer = WAVE_GAP;
    emit('expeditions');
    return;
  }

  const alive = run.combatants.filter((c) => !c.down);
  if (!alive.length) { finishRun(run, false); return; }

  // --- Heroes act ---
  for (const c of alive) {
    const sheet = G.sheets[c.uid];
    if (!sheet) continue;
    c.timer -= dt;
    const aps = sheet.aps
      * (1 + ((flaskFx(run).incAtkSpeed ?? 0) + modFrom(c, 'incAtkSpeed')) / 100);
    let guard = 0;
    while (c.timer <= 0 && guard++ < 12 && run.enemies.length) {
      heroAct(run, c, sheet);
      c.timer += 1 / Math.max(0.15, aps);
    }
    if (!run.enemies.length) break;
  }

  if (!run.enemies.length) {
    // Wave cleared.
    if (run.raidId || (run.wave >= run.totalWaves + 1)) { finishRun(run, true); return; }
    run.waveTimer = WAVE_GAP;
    emit('expeditions');
    return;
  }

  // --- Enemies act ---
  for (const e of run.enemies) {
    e.timer -= dt;
    let guard = 0;
    while (e.timer <= 0 && guard++ < 12) {
      enemyAct(run, e);
      e.timer += 1 / Math.max(0.15, e.aps);
      if (run.combatants.every((c) => c.down)) { finishRun(run, false); return; }
    }
  }

  // --- Regeneration ---
  for (const c of alive) {
    tickResource(c, dt, modFrom(c, 'resourceRegen'));
    const sheet = G.sheets[c.uid];
    const pctRegen = (flaskFx(run).lifeRegenPct ?? 0) + modFrom(c, 'lifeRegenPct');
    const regen = (sheet?.regen ?? 0) + c.maxLife * pctRegen / 100;
    if (regen > 0 && c.life < c.maxLife) {
      c.life = Math.min(c.maxLife, c.life + regen * dt);
    }
  }
}

/**
 * Advances every effect on the party. Damage over time is attributed to the
 * effect rather than to a swing, so a hero can be finished by a bleed.
 */
function tickPartyEffects(run, dt) {
  for (const c of run.combatants) {
    if (c.down) continue;
    tickEffects(c, dt, {
      onDamage: (amount, fx) => damageHero(run, c, amount, sourceOf(run, fx)),
      onHeal: (amount, fx) => {
        const from = sourceOf(run, fx);
        const healed = healHero(c, amount, from);
        // An effect may declare that its overflow is not wasted.
        if (fx.wardOverflow) addWard(c, (amount - healed) * fx.wardOverflow, 0.20, from);
      },
    });
  }
}

/** The combatant an effect should be credited to, if they are still standing. */
function sourceOf(run, fx) {
  return fx?.source ? run.combatants.find((c) => c.uid === fx.source) ?? null : null;
}

function tickEnemyEffects(run, dt) {
  for (let i = run.enemies.length - 1; i >= 0; i--) {
    const e = run.enemies[i];
    tickEffects(e, dt, {
      onDamage: (amount, fx) => {
        e.life -= amount;
        const owner = sourceOf(run, fx);
        if (owner) owner.damageDealt = (owner.damageDealt ?? 0) + amount;
        if (e.life <= 0) {
          const killer = owner;
          log(`${e.name} succumbs to ${fx.name}.`, 'kill');
          if (killer) fireTrigger('kill', { run, self: killer, target: e });
          onEnemyKilled(run, e);
        }
      },
    });
  }
}

/**
 * Who this enemy can attack. Melee enemies are confined to the front row while
 * anyone is still standing in it; spellcasters and mixed attackers reach the
 * whole party. This is what makes a party of archers the answer to a melee
 * boss, and what makes losing your front line a cascade rather than a setback.
 */
export function reachableTo(enemy, alive) {
  if (enemy.attack !== 'melee') return alive;
  const front = alive.filter((c) => c.row === 'front');
  return front.length ? front : alive;
}

/**
 * Who this hero can attack. A melee hero standing at the back cannot reach the
 * enemy line at all, which is why row follows from class rather than choice.
 */
export function canReachEnemies(c) {
  return c.reach !== 'melee' || c.row === 'front';
}

function spawnWave(run) {
  run.wave++;
  const profile = run.profile ?? {};
  const isGuardian = run.wave > run.totalWaves;
  if (isGuardian) {
    run.enemies = [makeGuardian(run.tier, profile, run.name)];
    log(`${run.name}: ${run.enemies[0].name} bars the way.`, 'boss');
  } else {
    const count = rng.int(2, 4);
    run.enemies = [];
    for (let i = 0; i < count; i++) run.enemies.push(makeEnemy(run.tier, profile));
  }
  // Openers land on every wave, not only the first: a decaying burst that only
  // ever applied once would be irrelevant by wave three.
  for (const c of run.combatants) {
    if (!c.down) fireTrigger('combatStart', { run, self: c });
  }
  emit('expeditions');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function heroAct(run, c, sheet) {
  // Healers mend instead of attacking when someone is meaningfully hurt — and
  // only while they can pay for it. A healer with nothing left picks up their
  // mace and joins in, which is worse for the party and better than watching
  // somebody stand still.
  if (sheet.healPower > 0 && canAfford(c, 'heal')) {
    const wounded = run.combatants
      .filter((x) => !x.down && x.life < x.maxLife * 0.92)
      .sort((a, b) => (a.life / a.maxLife) - (b.life / b.maxLife))[0];
    if (wounded && spend(c, 'heal')) {
      const power = sheet.healPower * (1 + modFrom(c, 'incHeal') / 100);
      const healed = healHero(wounded, power, c);
      fireTrigger('heal', { run, self: c, target: wounded, amount: healed });
      if (rng.chance(0.10)) log(`${c.name} heals ${wounded.name} for ${fmt(healed)}.`, 'kill');
      return;
    }
  }

  const target = run.enemies[0];
  if (!target) return;
  if (!canReachEnemies(c)) return;

  // A flat miss chance is not the same thing as low accuracy: accuracy is
  // fought off by evasion, this is not fought off by anything.
  const fumble = modFrom(c, 'missChance');
  if (fumble > 0 && rng.chance(fumble / 100)) {
    if (rng.chance(0.05)) log(`${c.name} swings wide.`, 'hit');
    return;
  }
  const acc = sheet.accuracy * (1 + modFrom(c, 'incAccuracy') / 100);
  if (!rng.chance(hitChance(acc, target.evasion))) {
    if (rng.chance(0.05)) log(`${c.name} misses ${target.name}.`, 'hit');
    return;
  }

  swing(run, c, sheet, target, 0);
}

/**
 * One attack, resolved. Split out from heroAct so an effect can ask for
 * another one — `depth` is the guard that keeps "attacks may repeat" from
 * chaining into itself forever.
 */
export function swing(run, c, sheet, target, depth) {
  if (!target || target.life <= 0) return;

  const crit = rng.chance((sheet.critChance * (1 + modFrom(c, 'incCrit') / 100)) / 100);
  const critMult = crit
    ? Math.max(1, (sheet.critMulti * (1 + modFrom(c, 'critMulti') / 100)) / 100)
    : 1;
  // Energy classes spend to hit harder. Affording it is a bonus, not a
  // requirement: the swing happens either way.
  const empowered = spend(c, 'empower');
  const bonus = empowered ? (c.empowerBonus ?? 0) : 0;

  const dmgMult = (1
    + ((flaskFx(run).incDamage ?? 0) + modFrom(c, 'incDamage') + bonus) / 100)
    // Fighting above your level takes the edge off everything you swing.
    * levelGap(c.level ?? run.level, run.level).outgoing;

  let total = 0; let physDealt = 0;
  for (const type of DAMAGE_TYPES) {
    const [lo, hi] = sheet.dmg[type];
    if (hi <= 0) continue;
    let d = rng.range(lo, hi) * critMult * dmgMult;
    if (type === 'phys') {
      d *= (1 - armourReduction(target.armour, d));
      physDealt += d;
    } else {
      const pen = type === 'chaos' ? 0 : (sheet.pen[type] ?? 0);
      d *= (1 - clamp(target.res - pen, -60, 90) / 100);
    }
    total += d;
  }

  target.life -= total;
  c.damageDealt = (c.damageDealt ?? 0) + total;
  if (sheet.leech > 0 && physDealt > 0) healHero(c, physDealt * sheet.leech / 100, c);

  gain(c, 'onHit');
  const ctx = { run, self: c, sheet, target, amount: total, depth, repeat: false };
  fireTrigger('hit', ctx);
  if (crit) fireTrigger('crit', ctx);

  if (crit && rng.chance(0.25)) log(`${c.name} crits ${target.name} for ${fmt(total)}.`, 'crit');
  else if (rng.chance(0.05)) log(`${c.name} hits ${target.name} for ${fmt(total)}.`, 'hit');

  if (target.life <= 0) {
    gain(c, 'onKill');
    fireTrigger('kill', { run, self: c, target });
    onEnemyKilled(run, target);
    return;
  }

  // A reaction may ask for the attack to land again. The limit lives here
  // rather than in the item, so two sources of it cannot chain forever.
  if (ctx.repeat && depth < MAX_REPEAT_DEPTH) {
    swing(run, c, sheet, target, depth + 1);
  }
}

/** How many times a single attack may be repeated by an effect. */
export const MAX_REPEAT_DEPTH = 2;

function enemyAct(run, e) {
  const alive = run.combatants.filter((c) => !c.down);
  if (!alive.length) return;

  // Reach decides who can be touched; threat decides who among them is picked.
  // A melee attacker is held at the front line until the front line is gone,
  // at which point there is nothing between it and the back row.
  const reachable = reachableTo(e, alive);
  // Contract modifiers can make threat irrelevant, which is what stops a
  // tank from being the answer to everything: flatten every weight and the
  // blow lands wherever it pleases.
  const target = rng.weighted(reachable, (c) => (modFrom(c, 'ignoreThreat') > 0
    ? 1
    : (G.sheets[c.uid]?.threat ?? 1)));
  const sheet = G.sheets[target.uid];
  if (!sheet) return;

  if (!rng.chance(hitChance(e.accuracy, sheet.evasion))) return;

  // A shield only helps against what it is shaped to stop. A 'mixed' attacker
  // — the Worldeater — switches between the two, so no single shield answers it.
  const incoming = e.attack === 'mixed' ? (rng.chance(0.5) ? 'spell' : 'melee') : e.attack;
  const chance = (incoming === 'spell' ? sheet.blockSpell : sheet.blockMelee)
    + modFrom(target, incoming === 'spell' ? 'blockSpell' : 'blockMelee');
  if (chance > 0 && rng.chance(chance / 100)) {
    gain(target, 'onBlock');
    fireTrigger('block', { run, self: target, target: e, kind: incoming });
    if (rng.chance(0.06)) {
      log(`${target.name} blocks ${e.name}'s ${incoming === 'spell' ? 'spell' : 'blow'}.`, 'hit');
    }
    return;
  }

  const crit = rng.chance(e.crit / 100);
  const base = e.dmg * rng.range(0.85, 1.15) * (crit ? 1.5 : 1);

  let taken = 0;
  for (const [type, frac] of Object.entries(e.split)) {
    const raw = base * frac;
    const armour = sheet.armour
      * (1 + ((flaskFx(run).incArmour ?? 0) + modFrom(target, 'incArmour')) / 100);
    if (type === 'phys') taken += raw * (1 - armourReduction(armour, raw));
    else {
      const shaved = (sheet.res[type]?.value ?? 0) * (1 + modFrom(target, 'resAll') / 100);
      taken += raw * (1 - shaved / 100);
    }
  }
  taken *= (1 + (sheet.damageTaken + modFrom(target, 'damageTaken')) / 100);
  // A class's standing against this kind of attack. Warriors take less from a
  // blade and more from a spell; Paladins the other way about.
  // The hero's own standing against this school, plus anything warding them.
  const ward = modFrom(target, incoming === 'spell' ? 'spellResist' : 'meleeResist');
  taken *= (1 - ((sheet.schoolResist?.[incoming] ?? 0) + ward) / 100);
  // ...and everything that hits you lands harder.
  taken *= levelGap(target.level ?? run.level, run.level).incoming;

  gain(target, 'onTakeHit');
  fireTrigger('takeHit', { run, self: target, target: e, amount: taken, kind: incoming });
  damageHero(run, target, taken);

  if (sheet.reflect > 0) {
    e.life -= taken * sheet.reflect / 100;
    if (e.life <= 0) { onEnemyKilled(run, e); return; }
  }
}
