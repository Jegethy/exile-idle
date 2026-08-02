// passives.js — the passive skill tree: layout, allocation rules, stat folding.
//
// Layout mirrors Path of Exile's wheel. Six class start nodes sit on the rim at
// their class angle; each owns an "arm" that travels *inward* through five
// segments toward the centre, where the Scion begins. Every segment carries an
// attribute node on the spine, side minors, and a notable that gates the next
// segment. Attribute clusters fill the gaps between arms, and keystones hang
// off short branches.
//
// Allocation requires adjacency to something already allocated, seeded from
// your own class's start node — so your class determines where you enter.

import { describeStats } from './data/statlabels.js';
import { CLASSES, CLASS_BY_ID, startNodeFor, ASCENDANCIES, ascendancyPointsFor } from './data/classes.js';

const DEG = Math.PI / 180;

/** Segment radii, outermost first. Class starts sit at START_RADIUS. */
const START_RADIUS = 640;
const SEGMENT_RADII = [545, 450, 355, 260, 165];
const CLUSTER_RADII = [500, 310];

/**
 * Angular offset that keeps arc distance roughly constant regardless of radius,
 * so the outer segments don't fan into their neighbours.
 *
 * `maxDeg` matters near the centre: arms are 60 degrees apart, so an offset
 * derived purely from arc length would swing a small-radius node right into
 * the neighbouring arm (two keystones once landed 8 units apart).
 */
function arcDeg(arcUnits, radius, maxDeg = 90) {
  return Math.min((arcUnits / radius) * (180 / Math.PI), maxDeg);
}

function pos(angleDeg, radius) {
  return { x: Math.cos(angleDeg * DEG) * radius, y: Math.sin(angleDeg * DEG) * radius };
}

// ---------------------------------------------------------------------------
// Arm content. Each class arm has five segments: an attribute grant for the
// spine, two side minors, and a notable.
// ---------------------------------------------------------------------------

const ARM_CONTENT = {
  marauder: {
    attr: { str: 10 },
    segments: [
      { sides: [{ flatLife: 25 }, { incPhys: 12 }], notable: { name: 'Iron Grip', stats: { incPhys: 25, str: 15 } } },
      { sides: [{ incArmour: 20 }, { flatLife: 30 }], notable: { name: 'Bloodless', stats: { flatLife: 60, lifeRegenFlat: 5 } } },
      { sides: [{ incPhys: 15 }, { flatArmour: 60 }], notable: { name: 'Butchery', stats: { incPhys: 35, incAtkSpeed: 6 } } },
      { sides: [{ incLife: 4 }, { incArmour: 24 }], notable: { name: 'Titan’s Hide', stats: { incArmour: 45, incLife: 6 } } },
      { sides: [{ flatLife: 35 }, { maxRes: 1 }], notable: { name: 'Unyielding Flesh', stats: { incLife: 8, maxRes: 1 } } },
    ],
  },
  duelist: {
    attr: { str: 5, dex: 5 },
    segments: [
      { sides: [{ incAtkSpeed: 4 }, { flatLife: 25 }], notable: { name: 'Fencer', stats: { incAtkSpeed: 8, incAccuracy: 20 } } },
      { sides: [{ incPhys: 14 }, { incCrit: 20 }], notable: { name: 'Blood Drinker', stats: { lifeLeech: 0.4, flatLife: 40 } } },
      { sides: [{ flatEvasion: 50 }, { incArmour: 20 }], notable: { name: 'Bravery', stats: { flatLife: 70, incArmour: 25 } } },
      { sides: [{ critMulti: 12 }, { incAtkSpeed: 5 }], notable: { name: 'Cleaving', stats: { incPhys: 35, critMulti: 15 } } },
      { sides: [{ incLife: 4 }, { lifeLeech: 0.2 }], notable: { name: 'Momentum', stats: { incAtkSpeed: 10, moveSpeed: 8 } } },
    ],
  },
  ranger: {
    attr: { dex: 10 },
    segments: [
      { sides: [{ flatEvasion: 45 }, { incAtkSpeed: 4 }], notable: { name: 'Fleetfoot', stats: { incEvasion: 25, moveSpeed: 6 } } },
      { sides: [{ incCrit: 22 }, { accuracy: 90 }], notable: { name: 'Eagle Eye', stats: { incAccuracy: 30, incCrit: 25 } } },
      { sides: [{ incEvasion: 20 }, { flatLife: 25 }], notable: { name: 'Blade Dancer', stats: { incAtkSpeed: 9, incEvasion: 22 } } },
      { sides: [{ critMulti: 14 }, { incEvasion: 22 }], notable: { name: 'Coup de Grâce', stats: { critMulti: 24, incCrit: 25 } } },
      { sides: [{ moveSpeed: 4 }, { incAtkSpeed: 6 }], notable: { name: 'Windrider', stats: { moveSpeed: 10, incEvasion: 35 } } },
    ],
  },
  shadow: {
    attr: { dex: 5, int: 5 },
    segments: [
      { sides: [{ incCrit: 20 }, { flatES: 20 }], notable: { name: 'Nightstalker', stats: { incCrit: 30, incEvasion: 20 } } },
      { sides: [{ critMulti: 10 }, { incChaos: 16 }], notable: { name: 'Deadly Aim', stats: { incCrit: 30, critMulti: 12 } } },
      { sides: [{ incES: 12 }, { incAtkSpeed: 5 }], notable: { name: 'Assassination', stats: { critMulti: 20, incCrit: 35 } } },
      { sides: [{ incChaos: 20 }, { resChaos: 10 }], notable: { name: 'Void Barrier', stats: { incES: 35, resChaos: 15 } } },
      { sides: [{ critMulti: 14 }, { incDamage: 12 }], notable: { name: 'Perfect Agony', stats: { critMulti: 30, incDamage: 18 } } },
    ],
  },
  witch: {
    attr: { int: 10 },
    segments: [
      { sides: [{ flatES: 20 }, { incEle: 10 }], notable: { name: 'Foresight', stats: { incES: 25, esRecharge: 20 } } },
      { sides: [{ incDamage: 12 }, { flatMana: 30 }], notable: { name: 'Arcane Focus', stats: { incES: 22, incDamage: 18 } } },
      { sides: [{ incFire: 18 }, { incCold: 18 }], notable: { name: 'Elemental Focus', stats: { incEle: 25, incDamage: 10 } } },
      { sides: [{ incES: 12 }, { incLight: 18 }], notable: { name: 'Soul Siphon', stats: { incES: 30, lifeRegenPct: 0.4 } } },
      { sides: [{ incEle: 14 }, { flatES: 30 }], notable: { name: 'Cruel Preparation', stats: { incES: 35, incLife: 6 } } },
    ],
  },
  templar: {
    attr: { str: 5, int: 5 },
    segments: [
      { sides: [{ flatArmour: 50 }, { resFire: 12 }], notable: { name: 'Devotion', stats: { incArmour: 25, incES: 20 } } },
      { sides: [{ incEle: 12 }, { flatES: 20 }], notable: { name: 'Sanctity', stats: { incES: 25, resFire: 12, resCold: 12, resLight: 12 } } },
      { sides: [{ block: 3 }, { incArmour: 20 }], notable: { name: 'Bulwark', stats: { block: 6, damageTaken: -5 } } },
      { sides: [{ resChaos: 10 }, { incEle: 16 }], notable: { name: 'Elemental Adaptation', stats: { resFire: 15, resCold: 15, resLight: 15 } } },
      { sides: [{ maxRes: 1 }, { flatLife: 30 }], notable: { name: 'Purity of Flesh', stats: { incLife: 6, maxRes: 1 } } },
    ],
  },
};

/**
 * Keystones, hung off a short branch from a given arm/segment. `side` picks
 * which way the branch swings so they don't collide with attribute clusters.
 */
const KEYSTONES = [
  {
    arm: 'marauder', seg: 1, side: -1, name: 'Resolute Technique',
    flags: { resoluteTechnique: true }, stats: { moreDamage: 30 },
    desc: ['Your hits can no longer be Evaded', 'Never deal Critical Strikes', '30% more Damage'],
  },
  {
    arm: 'marauder', seg: 3, side: 1, name: 'Unwavering Stance',
    flags: { cannotEvade: true }, stats: { moreArmour: 40 },
    desc: ['Cannot Evade enemy Attacks', '40% more Armour'],
  },
  {
    arm: 'marauder', seg: 4, side: -1, name: 'Blood Magic',
    flags: { bloodMagic: true }, stats: {},
    desc: ['25% more maximum Life', 'Your Energy Shield is set to 0'],
  },
  {
    arm: 'duelist', seg: 2, side: 1, name: 'Iron Reflexes',
    flags: { ironReflexes: true }, stats: {},
    desc: ['Converts all Evasion Rating to Armour'],
  },
  {
    arm: 'duelist', seg: 4, side: 1, name: 'Vaal Pact',
    flags: { vaalPact: true }, stats: {},
    desc: ['Life Leech is doubled', 'Life Regeneration has no effect'],
  },
  {
    arm: 'ranger', seg: 2, side: -1, name: 'Acrobatics',
    flags: { acrobatics: true }, stats: { moreEvasion: 40, moreArmourLess: 50 },
    desc: ['40% more Evasion Rating', '50% less Armour'],
  },
  {
    arm: 'ranger', seg: 4, side: 1, name: 'Glancing Blows',
    flags: { glancingBlows: true }, stats: { block: 25 },
    desc: ['+25% Chance to Block', 'Blocked hits still deal 40% of their Damage'],
  },
  {
    arm: 'shadow', seg: 2, side: -1, name: 'Pain Attunement',
    flags: { painAttunement: true }, stats: {},
    desc: ['30% more Damage while below 35% Life'],
  },
  {
    arm: 'shadow', seg: 4, side: -1, name: 'Chaos Inoculation',
    flags: { ci: true }, stats: {},
    desc: ['Maximum Life becomes 1', '80% more Energy Shield', 'Immune to Chaos Damage'],
  },
  {
    arm: 'witch', seg: 2, side: 1, name: 'Elemental Overload',
    flags: { eleOverload: true }, stats: { moreEle: 60 },
    desc: ['60% more Elemental Damage', 'Critical Strikes deal no extra damage'],
  },
  {
    arm: 'witch', seg: 4, side: -1, name: 'Zealot’s Oath',
    flags: { zealotsOath: true }, stats: {},
    desc: ['Life Regeneration applies to Energy Shield instead'],
  },
  {
    arm: 'templar', seg: 2, side: -1, name: 'Avatar of Fire',
    flags: { avatarOfFire: true }, stats: { moreFire: 50 },
    desc: ['50% more Fire Damage', 'Deal no Cold, Lightning or Chaos Damage'],
  },
  {
    arm: 'templar', seg: 4, side: 1, name: 'Wicked Ward',
    flags: { wickedWard: true }, stats: { esRecharge: 20 },
    desc: ['Energy Shield Recharge is never interrupted by Damage'],
  },
];

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

function buildTree() {
  const nodes = {};
  const add = (node) => { nodes[node.id] = node; return node; };
  const link = (a, b) => {
    if (!nodes[a] || !nodes[b] || a === b) return;
    if (!nodes[a].links.includes(b)) nodes[a].links.push(b);
    if (!nodes[b].links.includes(a)) nodes[b].links.push(a);
  };

  // --- Class start nodes ---------------------------------------------------
  for (const cls of CLASSES) {
    const p = cls.angle === null ? { x: 0, y: 0 } : pos(cls.angle, START_RADIUS);
    add({
      id: startNodeFor(cls.id), name: cls.name, kind: 'start', classId: cls.id,
      x: p.x, y: p.y, stats: {}, links: [],
    });
  }

  // --- Arms ---------------------------------------------------------------
  for (const cls of CLASSES) {
    if (cls.angle === null) continue;          // Scion has no arm of its own
    const content = ARM_CONTENT[cls.id];
    const angle = cls.angle;
    let prev = startNodeFor(cls.id);

    content.segments.forEach((seg, i) => {
      const R = SEGMENT_RADII[i];

      // Spine attribute node.
      const spineId = `${cls.id}_s${i}`;
      const sp = pos(angle, R);
      add({
        id: spineId, name: attrName(content.attr), kind: 'minor',
        x: sp.x, y: sp.y, stats: { ...content.attr }, links: [],
      });
      link(prev, spineId);

      // Side minors, offset by a constant arc distance.
      seg.sides.forEach((stats, k) => {
        const id = `${cls.id}_s${i}_m${k}`;
        const da = arcDeg(78, R, 20) * (k === 0 ? -1 : 1);
        const p = pos(angle + da, R - 16);
        add({ id, name: 'Minor', kind: 'minor', x: p.x, y: p.y, stats: { ...stats }, links: [] });
        link(spineId, id);
      });

      // A second attribute node on the opposite wing keeps attributes flowing.
      const attr2Id = `${cls.id}_s${i}_a`;
      const da2 = arcDeg(140, R, 24) * (i % 2 === 0 ? 1 : -1);
      const p2 = pos(angle + da2, R - 30);
      add({
        id: attr2Id, name: attrName(content.attr), kind: 'minor',
        x: p2.x, y: p2.y, stats: { ...content.attr }, links: [],
      });
      link(spineId, attr2Id);

      // Notable gates the next segment.
      const notableId = `${cls.id}_s${i}_n`;
      const np = pos(angle, R - 52);
      add({
        id: notableId, name: seg.notable.name, kind: 'notable',
        x: np.x, y: np.y, stats: { ...seg.notable.stats }, links: [],
      });
      link(spineId, notableId);
      prev = notableId;
    });

    // Innermost notable connects to the Scion's centre.
    link(prev, startNodeFor('scion'));
  }

  // --- Keystones ----------------------------------------------------------
  for (const ks of KEYSTONES) {
    const cls = CLASS_BY_ID[ks.arm];
    const R = SEGMENT_RADII[ks.seg];
    // Keystones sit just outside their segment so they never collide with the
    // attribute wing or the between-arm clusters.
    const da = arcDeg(150, R, 18) * ks.side;
    const p = pos(cls.angle + da, R + 62);
    const id = `key_${ks.arm}_${ks.seg}`;
    add({
      id, name: ks.name, kind: 'keystone',
      x: p.x, y: p.y, stats: { ...ks.stats }, flags: { ...ks.flags }, desc: ks.desc, links: [],
    });
    link(`${ks.arm}_s${ks.seg}`, id);
  }

  // --- Attribute clusters between arms ------------------------------------
  const byAngle = CLASSES.filter((c) => c.angle !== null).slice()
    .sort((a, b) => a.angle - b.angle);

  byAngle.forEach((cls, i) => {
    const next = byAngle[(i + 1) % byAngle.length];
    // Midpoint angle, wrapping the last gap across 360.
    let mid = (cls.angle + next.angle) / 2;
    if (next.angle < cls.angle) mid = ((cls.angle + next.angle + 360) / 2) % 360;

    const stats = gapAttributes(cls, next);

    CLUSTER_RADII.forEach((R, r) => {
      const ids = [];
      for (let k = 0; k < 3; k++) {
        const da = arcDeg(60, R, 12) * (k - 1);
        const p = pos(mid + da, R + (k === 1 ? 26 : 0));
        const id = `gap_${cls.id}_${next.id}_${r}_${k}`;
        add({ id, name: attrName(stats), kind: 'minor', x: p.x, y: p.y, stats: { ...stats }, links: [] });
        ids.push(id);
      }
      link(ids[0], ids[1]); link(ids[1], ids[2]);

      // Bridge into both neighbouring arms at the nearest segment.
      const segIndex = r === 0 ? 0 : 2;
      link(ids[0], `${cls.id}_s${segIndex}`);
      link(ids[2], `${next.id}_s${segIndex}`);
    });
  });

  relaxOverlaps(nodes);
  return nodes;
}

/** Render radius per node kind, mirroring the circle sizes in styles.css. */
const NODE_RADIUS = { minor: 14, notable: 24, keystone: 31, start: 34 };

/**
 * Pushes overlapping nodes apart.
 *
 * The declarative polar layout above is readable but can't know that, say, a
 * keystone on one segment lands on the attribute wing of the next one. Rather
 * than hand-tuning a dozen magic offsets until nothing collides, we let the
 * layout be approximate and separate the survivors here. Start nodes are
 * anchored so class positions stay exactly where they were placed.
 */
function relaxOverlaps(nodes, iterations = 60) {
  const list = Object.values(nodes);
  const pad = 12;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]; const b = list[j];
        const need = NODE_RADIUS[a.kind] + NODE_RADIUS[b.kind] + pad;
        let dx = b.x - a.x; let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= need) continue;

        // Perfectly coincident nodes need an arbitrary direction to separate.
        if (dist < 0.001) { dx = 1; dy = 0; dist = 1; }
        const push = (need - dist) / 2;
        const ux = (dx / dist) * push; const uy = (dy / dist) * push;

        const aFixed = a.kind === 'start';
        const bFixed = b.kind === 'start';
        if (!aFixed) { a.x -= bFixed ? ux * 2 : ux; a.y -= bFixed ? uy * 2 : uy; }
        if (!bFixed) { b.x += aFixed ? ux * 2 : ux; b.y += aFixed ? uy * 2 : uy; }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Label for an attribute-only node, e.g. "+10 Str" or "+5 Str / +5 Int". */
function attrName(stats) {
  const parts = [];
  if (stats.str) parts.push(`+${stats.str} Str`);
  if (stats.dex) parts.push(`+${stats.dex} Dex`);
  if (stats.int) parts.push(`+${stats.int} Int`);
  return parts.join(' / ') || 'Minor';
}

/** Attribute grant for a cluster sitting between two classes. */
function gapAttributes(a, b) {
  const pa = a.primary; const pb = b.primary;
  if (pa === pb) return { [pa]: 12 };
  return { [pa]: 8, [pb]: 8 };
}

export const TREE = buildTree();
export const TREE_IDS = Object.keys(TREE);

/** Ids of every class start node — these are never allocatable. */
export const START_IDS = new Set(CLASSES.map((c) => startNodeFor(c.id)));

/** Bounding radius, used to size the SVG viewport. */
export const TREE_RADIUS = Math.max(
  ...Object.values(TREE).map((n) => Math.hypot(n.x, n.y)),
) + 70;

/** Display lines for a node's tooltip. */
export function nodeText(node) {
  if (node.desc) return node.desc;
  return describeStats(node.stats);
}

// ---------------------------------------------------------------------------
// Allocation rules
// ---------------------------------------------------------------------------

/** The start node the given character's tree grows from. */
export function startFor(state) {
  return startNodeFor(state.player.class ?? 'scion');
}

/** A node may be taken if it touches your start or something already allocated. */
export function canAllocate(allocated, id, startId) {
  const node = TREE[id];
  if (!node || allocated[id]) return false;
  if (START_IDS.has(id)) return false;
  return node.links.some((l) => allocated[l] || l === startId);
}

/**
 * Refunding must not orphan the tree, so a node is only refundable when every
 * other allocated node still connects back to the start without it.
 */
export function canRefund(allocated, id, startId) {
  if (!allocated[id]) return false;
  const remaining = { ...allocated };
  delete remaining[id];
  return isConnected(remaining, startId);
}

function isConnected(allocated, startId) {
  const ids = Object.keys(allocated).filter((k) => allocated[k]);
  if (!ids.length) return true;
  const seen = new Set();
  const queue = [startId];
  while (queue.length) {
    const cur = queue.pop();
    for (const l of TREE[cur]?.links ?? []) {
      if (allocated[l] && !seen.has(l)) { seen.add(l); queue.push(l); }
    }
  }
  return ids.every((id) => seen.has(id));
}

/** Total passive points a character has earned by `level`. */
export function pointsForLevel(level) { return Math.max(0, level - 1); }

// ---------------------------------------------------------------------------
// Stat folding
// ---------------------------------------------------------------------------

/** Folds allocated passives, ascendancy nodes and mastery into the stat bag. */
export function applyPassives(state, bag) {
  const flags = {};

  for (const id of Object.keys(state.passives.allocated)) {
    const node = TREE[id];
    if (!node) continue;
    for (const [k, v] of Object.entries(node.stats)) bag[k] = (bag[k] ?? 0) + v;
    if (node.flags) Object.assign(flags, node.flags);
  }

  // Ascendancy nodes are a separate, much smaller tree.
  const asc = ASCENDANCIES[state.player.ascendancy];
  if (asc) {
    for (const idx of Object.keys(state.passives.ascendancy ?? {})) {
      const node = asc.nodes[Number(idx)];
      if (!node) continue;
      for (const [k, v] of Object.entries(node.stats ?? {})) bag[k] = (bag[k] ?? 0) + v;
      if (node.flags) Object.assign(flags, node.flags);
    }
  }

  // Mastery points are the infinite-scaling sink once the tree is full. They
  // are the main thing keeping uber tiers reachable, so they scale generously.
  const mp = state.passives.mastery ?? 0;
  if (mp > 0) {
    bag.incDamage = (bag.incDamage ?? 0) + mp * 5;
    bag.incLife = (bag.incLife ?? 0) + mp * 3;
    bag.incES = (bag.incES ?? 0) + mp * 3;
    bag.incArmour = (bag.incArmour ?? 0) + mp * 3;
    bag.incEvasion = (bag.incEvasion ?? 0) + mp * 3;
  }
  return flags;
}

/** How many passive points are spent / available right now. */
export function pointSummary(state) {
  const spent = Object.keys(state.passives.allocated).length + (state.passives.mastery ?? 0);
  const total = pointsForLevel(state.player.level) + (state.passives.bonusPoints ?? 0);
  return { spent, total, available: total - spent };
}

/** How many ascendancy points are spent / available right now. */
export function ascendancySummary(state) {
  const spent = Object.keys(state.passives.ascendancy ?? {}).length;
  const total = ascendancyPointsFor(state.player.level);
  return { spent, total, available: total - spent };
}

/** True once every allocatable node is taken (unlocks mastery spending). */
export function treeIsFull(state) {
  return TREE_IDS.every((id) => START_IDS.has(id) || state.passives.allocated[id]);
}
