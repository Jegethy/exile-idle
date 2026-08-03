// util.js — tiny helpers shared across the codebase. No dependencies.

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Compact number formatting: 1234 -> "1.23K", 45_000_000 -> "45.0M". */
export function fmt(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) {
    const s = n < 10 && n % 1 !== 0 ? n.toFixed(decimals) : (n % 1 === 0 ? String(n) : n.toFixed(1));
    return (neg ? '-' : '') + s;
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIX.length) {
    // Beyond named tiers fall back to scientific-ish notation for infinite scaling.
    return (neg ? '-' : '') + n.toExponential(2).replace('e+', 'e');
  }
  const scaled = n / Math.pow(1000, tier);
  return (neg ? '-' : '') + scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + SUFFIX[tier];
}

/** Integer with thousands separators. */
export function fmtInt(n) {
  return Math.floor(n).toLocaleString('en-US');
}

/** Signed percentage-style number, e.g. +35, -12. */
export function signed(n, decimals = 0) {
  const v = decimals ? n.toFixed(decimals) : Math.round(n);
  return (n >= 0 ? '+' : '') + v;
}

/** Seconds -> "1h 04m", "3m 12s", "8.4s". */
export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return '--';
  if (sec < 60) return sec.toFixed(1) + 's';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Relative time for save timestamps: "4 minutes ago", "yesterday". */
export function fmtAgo(ts) {
  if (!ts) return 'never';
  const secs = Math.max(0, (Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString();
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function lerp(a, b, t) { return a + (b - a) * t; }

let _uid = 0;
/** Monotonic-ish unique id; persisted counter is restored on load. */
export function uid(prefix = 'i') { return `${prefix}${(_uid++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; }
export function setUidFloor(n) { if (n > _uid) _uid = n; }
export function uidCounter() { return _uid; }

export function deepClone(o) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(o));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- DOM sugar -------------------------------------------------------------

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

/** Roman numerals for affix tiers / map tiers. */
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out || 'O';
}

/** Sum of a numeric field over an array. */
export function sumBy(arr, fn) { return arr.reduce((a, x) => a + fn(x), 0); }

/** Stable-ish shallow object merge used when migrating save data. */
export function defaults(target, src) {
  for (const k of Object.keys(src)) {
    if (target[k] === undefined) target[k] = deepClone(src[k]);
    else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof target[k] === 'object') {
      defaults(target[k], src[k]);
    }
  }
  return target;
}
