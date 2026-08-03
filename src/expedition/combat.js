// expedition/combat — The tick: waves spawn, heroes act, enemies act, the run resolves.

import { rng } from '../rng.js';
import { G, emit, log } from '../state.js';
import { armourReduction, hitChance } from '../stats.js';
import { clamp, fmt, uid } from '../util.js';
import { DAMAGE_TYPES, WAVE_GAP, flaskFx } from './balance.js';
import { makeEnemy, makeGuardian } from './enemies.js';
import { finishRun, onEnemyKilled } from './rewards.js';

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

  const alive = run.combatants.filter((c) => !c.down);
  if (!alive.length) { finishRun(run, false); return; }

  // --- Heroes act ---
  for (const c of alive) {
    const sheet = G.sheets[c.uid];
    if (!sheet) continue;
    c.timer -= dt;
    const aps = sheet.aps * (1 + (flaskFx(run).incAtkSpeed ?? 0) / 100);
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
    const sheet = G.sheets[c.uid];
    const flaskRegen = c.maxLife * (flaskFx(run).lifeRegenPct ?? 0) / 100;
    const regen = (sheet?.regen ?? 0) + flaskRegen;
    if (regen > 0 && c.life < c.maxLife) {
      c.life = Math.min(c.maxLife, c.life + regen * dt);
    }
  }
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
  emit('expeditions');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function heroAct(run, c, sheet) {
  // Healers mend instead of attacking when someone is meaningfully hurt.
  if (sheet.healPower > 0) {
    const wounded = run.combatants
      .filter((x) => !x.down && x.life < x.maxLife * 0.92)
      .sort((a, b) => (a.life / a.maxLife) - (b.life / b.maxLife))[0];
    if (wounded) {
      const healed = Math.min(sheet.healPower, wounded.maxLife - wounded.life);
      wounded.life += healed;
      if (rng.chance(0.10)) log(`${c.name} heals ${wounded.name} for ${fmt(healed)}.`, 'kill');
      return;
    }
  }

  const target = run.enemies[0];
  if (!target) return;

  if (!rng.chance(hitChance(sheet.accuracy, target.evasion))) {
    if (rng.chance(0.05)) log(`${c.name} misses ${target.name}.`, 'hit');
    return;
  }

  const crit = rng.chance(sheet.critChance / 100);
  const critMult = crit ? sheet.critMulti / 100 : 1;
  const dmgMult = 1 + (flaskFx(run).incDamage ?? 0) / 100;

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
  if (sheet.leech > 0 && physDealt > 0) {
    c.life = Math.min(c.maxLife, c.life + physDealt * sheet.leech / 100);
  }

  if (crit && rng.chance(0.25)) log(`${c.name} crits ${target.name} for ${fmt(total)}.`, 'crit');
  else if (rng.chance(0.05)) log(`${c.name} hits ${target.name} for ${fmt(total)}.`, 'hit');

  if (target.life <= 0) onEnemyKilled(run, target);
}

function enemyAct(run, e) {
  const alive = run.combatants.filter((c) => !c.down);
  if (!alive.length) return;

  // Threat weighting is what makes a Tank a Tank.
  const target = rng.weighted(alive, (c) => (G.sheets[c.uid]?.threat ?? 1));
  const sheet = G.sheets[target.uid];
  if (!sheet) return;

  if (!rng.chance(hitChance(e.accuracy, sheet.evasion))) return;

  // A shield only helps against what it is shaped to stop. A 'mixed' attacker
  // — the Worldeater — switches between the two, so no single shield answers it.
  const incoming = e.attack === 'mixed' ? (rng.chance(0.5) ? 'spell' : 'melee') : e.attack;
  const chance = incoming === 'spell' ? sheet.blockSpell : sheet.blockMelee;
  if (chance > 0 && rng.chance(chance / 100)) {
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
    const armour = sheet.armour * (1 + (flaskFx(run).incArmour ?? 0) / 100);
    if (type === 'phys') taken += raw * (1 - armourReduction(armour, raw));
    else taken += raw * (1 - (sheet.res[type]?.value ?? 0) / 100);
  }
  taken *= (1 + sheet.damageTaken / 100);

  if (target.es > 0) {
    const absorbed = Math.min(target.es, taken);
    target.es -= absorbed;
    taken -= absorbed;
  }
  target.life -= taken;

  if (sheet.reflect > 0) {
    e.life -= taken * sheet.reflect / 100;
    if (e.life <= 0) { onEnemyKilled(run, e); return; }
  }

  if (target.life <= 0) {
    target.life = 0;
    target.down = true;
    G.state.stats.heroDeaths++;
    log(`${target.name} has fallen in ${run.name}.`, 'danger');
    emit('expeditions');
  }
}
