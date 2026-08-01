// passives.js — the passive skill tree: layout, allocation rules, stat folding.
//
// The tree is generated from six themed "arms" radiating from a central start
// node. Each arm is a chain: travel node -> travel node -> notable, repeated
// per ring, ending in a keystone. Side nodes hang off the travel nodes.
// Allocation requires adjacency to an already-allocated node, exactly like PoE.

import { describeStats } from './data/statlabels.js';

const DEG = Math.PI / 180;

/**
 * Arm definitions. Each ring contributes: 2 travel nodes (`travel`), up to 2
 * side nodes (`side`), and 1 notable. `keystone` caps the arm.
 */
const ARMS = [
  {
    id: 'str', angle: 200, name: 'Might',
    rings: [
      {
        travel: { str: 10 }, side: [{ flatLife: 20 }, { incPhys: 12 }],
        notable: { name: 'Blood Drinker', stats: { flatLife: 35, lifeLeech: 0.3 } },
      },
      {
        travel: { flatLife: 25 }, side: [{ incArmour: 20 }, { incPhys: 16 }],
        notable: { name: 'Butchery', stats: { incPhys: 30, incAtkSpeed: 6 } },
      },
      {
        travel: { str: 15 }, side: [{ incLife: 4 }, { flatArmour: 60 }],
        notable: { name: 'Titan’s Hide', stats: { incArmour: 40, incLife: 6, maxRes: 1 } },
      },
    ],
    keystone: {
      name: 'Unwavering Stance', flags: { cannotEvade: true },
      stats: { moreArmour: 40 },
      desc: ['Cannot Evade enemy Attacks', '40% more Armour'],
    },
  },
  {
    id: 'dex', angle: 320, name: 'Finesse',
    rings: [
      {
        travel: { dex: 10 }, side: [{ flatEvasion: 40 }, { incAtkSpeed: 4 }],
        notable: { name: 'Fleetfoot', stats: { incEvasion: 25, moveSpeed: 6 } },
      },
      {
        travel: { incAccuracy: 12 }, side: [{ incCrit: 20 }, { flatLife: 20 }],
        notable: { name: 'Blade Dancer', stats: { incAtkSpeed: 9, incEvasion: 20 } },
      },
      {
        travel: { dex: 15 }, side: [{ incEvasion: 22 }, { critMulti: 12 }],
        notable: { name: 'Coup de Grâce', stats: { critMulti: 22, incCrit: 25 } },
      },
    ],
    keystone: {
      name: 'Acrobatics', flags: { acrobatics: true },
      stats: { moreEvasion: 40, moreArmourLess: 50 },
      desc: ['40% more Evasion Rating', '50% less Armour'],
    },
  },
  {
    id: 'int', angle: 80, name: 'Arcana',
    rings: [
      {
        travel: { int: 10 }, side: [{ flatES: 18 }, { incEle: 10 }],
        notable: { name: 'Foresight', stats: { incES: 25, esRecharge: 20 } },
      },
      {
        travel: { flatES: 25 }, side: [{ incDamage: 12 }, { flatMana: 30 }],
        notable: { name: 'Arcane Focus', stats: { incES: 22, incDamage: 18 } },
      },
      {
        travel: { int: 15 }, side: [{ incES: 12 }, { incEle: 14 }],
        notable: { name: 'Void Barrier', stats: { incES: 35, resChaos: 15 } },
      },
    ],
    keystone: {
      name: 'Chaos Inoculation', flags: { ci: true },
      stats: {},
      desc: ['Maximum Life becomes 1', '80% more Energy Shield', 'Immune to Chaos Damage'],
    },
  },
  {
    id: 'ele', angle: 20, name: 'Elements',
    rings: [
      {
        travel: { incEle: 10 }, side: [{ resFire: 12 }, { resCold: 12 }],
        notable: { name: 'Elemental Adaptation', stats: { resFire: 15, resCold: 15, resLight: 15 } },
      },
      {
        travel: { incEle: 14 }, side: [{ incFire: 18 }, { incLight: 18 }],
        notable: { name: 'Heart of Flame', stats: { incFire: 30, penFire: 5 } },
      },
      {
        travel: { incEle: 16 }, side: [{ incCold: 20 }, { resLight: 15 }],
        notable: { name: 'Storm Weaver', stats: { incLight: 30, penLight: 5, incCold: 20 } },
      },
    ],
    keystone: {
      name: 'Elemental Overload', flags: { eleOverload: true },
      stats: { moreEle: 60 },
      desc: ['60% more Elemental Damage', 'Critical Strikes deal no extra damage'],
    },
  },
  {
    id: 'crit', angle: 140, name: 'Precision',
    rings: [
      {
        travel: { incCrit: 18 }, side: [{ accuracy: 80 }, { critMulti: 8 }],
        notable: { name: 'Deadly Aim', stats: { incCrit: 30, critMulti: 12 } },
      },
      {
        travel: { critMulti: 10 }, side: [{ incCrit: 24 }, { incAtkSpeed: 5 }],
        notable: { name: 'Assassination', stats: { critMulti: 20, incCrit: 35 } },
      },
      {
        travel: { incCrit: 25 }, side: [{ critMulti: 14 }, { incDamage: 14 }],
        notable: { name: 'Perfect Agony', stats: { critMulti: 30, incDamage: 20 } },
      },
    ],
    keystone: {
      name: 'Resolute Technique', flags: { resoluteTechnique: true },
      stats: { moreDamage: 30 },
      desc: ['Your hits can no longer be Evaded', 'Never deal Critical Strikes', '30% more Damage'],
    },
  },
  {
    id: 'def', angle: 260, name: 'Endurance',
    rings: [
      {
        travel: { flatLife: 22 }, side: [{ lifeRegenFlat: 4 }, { resChaos: 10 }],
        notable: { name: 'Constitution', stats: { incLife: 8, lifeRegenFlat: 8 } },
      },
      {
        travel: { incLife: 4 }, side: [{ block: 3 }, { flatArmour: 50 }],
        notable: { name: 'Bulwark', stats: { block: 6, damageTaken: -5 } },
      },
      {
        travel: { flatLife: 30 }, side: [{ maxRes: 1 }, { lifeRegenPct: 0.5 }],
        notable: { name: 'Unbreakable', stats: { incLife: 10, maxRes: 2, incArmour: 25 } },
      },
    ],
    keystone: {
      name: 'Vaal Pact', flags: { vaalPact: true },
      stats: {},
      desc: ['Life Leech is doubled', 'Life Regeneration has no effect'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

function pos(angleDeg, radius) {
  return { x: Math.cos(angleDeg * DEG) * radius, y: Math.sin(angleDeg * DEG) * radius };
}

function buildTree() {
  const nodes = {};
  const add = (node) => { nodes[node.id] = node; return node; };
  const link = (a, b) => {
    if (!nodes[a] || !nodes[b]) return;
    if (!nodes[a].links.includes(b)) nodes[a].links.push(b);
    if (!nodes[b].links.includes(a)) nodes[b].links.push(a);
  };

  add({ id: 'start', name: 'The Exile', kind: 'start', x: 0, y: 0, stats: {}, links: [] });

  for (const arm of ARMS) {
    let prev = 'start';
    arm.rings.forEach((ring, r) => {
      const base = 105 + r * 150;

      // Two travel nodes stepping outward along the arm.
      for (let t = 0; t < 2; t++) {
        const id = `${arm.id}_r${r}_t${t}`;
        const p = pos(arm.angle, base + t * 52);
        add({ id, name: 'Travel', kind: 'minor', x: p.x, y: p.y, stats: { ...ring.travel }, links: [] });
        link(prev, id);
        prev = id;
      }

      // Side nodes hang off the second travel node at +/- 16 degrees.
      ring.side.forEach((stats, s) => {
        const id = `${arm.id}_r${r}_s${s}`;
        const p = pos(arm.angle + (s === 0 ? -17 : 17), base + 40);
        add({ id, name: 'Minor', kind: 'minor', x: p.x, y: p.y, stats: { ...stats }, links: [] });
        link(`${arm.id}_r${r}_t1`, id);
      });

      // Notable caps the ring.
      const nid = `${arm.id}_r${r}_n`;
      const np = pos(arm.angle, base + 110);
      add({
        id: nid, name: ring.notable.name, kind: 'notable',
        x: np.x, y: np.y, stats: { ...ring.notable.stats }, links: [],
      });
      link(prev, nid);
      prev = nid;
    });

    // Keystone at the outer edge of the arm.
    const kid = `${arm.id}_key`;
    const kp = pos(arm.angle, 105 + arm.rings.length * 150 + 40);
    add({
      id: kid, name: arm.keystone.name, kind: 'keystone',
      x: kp.x, y: kp.y, stats: { ...arm.keystone.stats },
      flags: { ...arm.keystone.flags }, desc: arm.keystone.desc, links: [],
    });
    link(prev, kid);
  }

  // Ring roads: connect adjacent arms at ring 1 so builds can cross over.
  const order = ARMS.map((a) => a.id);
  const byAngle = ARMS.slice().sort((a, b) => a.angle - b.angle).map((a) => a.id);
  for (let i = 0; i < byAngle.length; i++) {
    const a = byAngle[i];
    const b = byAngle[(i + 1) % byAngle.length];
    if (order.includes(a) && order.includes(b)) link(`${a}_r1_t0`, `${b}_r1_t0`);
  }

  return nodes;
}

export const TREE = buildTree();
export const TREE_IDS = Object.keys(TREE);

/** Bounding radius, used to size the SVG viewport. */
export const TREE_RADIUS = Math.max(
  ...Object.values(TREE).map((n) => Math.hypot(n.x, n.y)),
) + 60;

/** Display lines for a node's tooltip. */
export function nodeText(node) {
  if (node.desc) return node.desc;
  return describeStats(node.stats);
}

// ---------------------------------------------------------------------------
// Allocation rules
// ---------------------------------------------------------------------------

/** A node may be taken if it touches something already allocated. */
export function canAllocate(allocated, id) {
  const node = TREE[id];
  if (!node || allocated[id]) return false;
  if (node.kind === 'start') return false;
  return node.links.some((l) => allocated[l] || l === 'start');
}

/**
 * Refunding must not orphan the tree, so a node is only refundable when every
 * allocated neighbour still connects back to start without it.
 */
export function canRefund(allocated, id) {
  if (!allocated[id]) return false;
  const remaining = { ...allocated };
  delete remaining[id];
  return isConnected(remaining);
}

/** BFS from `start` over allocated nodes. */
function isConnected(allocated) {
  const ids = Object.keys(allocated).filter((k) => allocated[k]);
  if (!ids.length) return true;
  const seen = new Set();
  const queue = ['start'];
  while (queue.length) {
    const cur = queue.pop();
    for (const l of TREE[cur].links) {
      if (allocated[l] && !seen.has(l)) { seen.add(l); queue.push(l); }
    }
  }
  return ids.every((id) => seen.has(id));
}

/** Total passive points a character has earned by `level`. */
export function pointsForLevel(level) { return Math.max(0, level - 1); }

/** Folds all allocated node stats (plus mastery scaling) into the stat bag. */
export function applyPassives(state, bag) {
  const flags = {};
  for (const id of Object.keys(state.passives.allocated)) {
    const node = TREE[id];
    if (!node) continue;
    for (const [k, v] of Object.entries(node.stats)) bag[k] = (bag[k] ?? 0) + v;
    if (node.flags) Object.assign(flags, node.flags);
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

/** How many points are spent / available right now. */
export function pointSummary(state) {
  const spent = Object.keys(state.passives.allocated).length + (state.passives.mastery ?? 0);
  const total = pointsForLevel(state.player.level) + (state.passives.bonusPoints ?? 0);
  return { spent, total, available: total - spent };
}

/** True once every node in the tree is allocated (unlocks mastery spending). */
export function treeIsFull(state) {
  return TREE_IDS.every((id) => id === 'start' || state.passives.allocated[id]);
}
