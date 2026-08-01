// rng.js — seeded PRNG so drops are reproducible across save/load.
// mulberry32: fast, tiny, good enough distribution for loot rolls.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) { this.seed(seed ?? (Date.now() >>> 0)); }

  seed(s) { this._seed = s >>> 0; this._n = mulberry32(this._seed); this._calls = 0; }

  /** Restore an exact stream position (used by the save system). */
  restore(seed, calls) {
    this.seed(seed);
    for (let i = 0; i < calls; i++) this._n();
    this._calls = calls;
  }

  state() { return { seed: this._seed, calls: this._calls }; }

  float() { this._calls++; return this._n(); }

  /** Uniform float in [a, b). */
  range(a, b) { return a + this.float() * (b - a); }

  /** Uniform integer in [a, b] inclusive. */
  int(a, b) { return Math.floor(a + this.float() * (b - a + 1)); }

  /** True with probability p (0..1). */
  chance(p) { return this.float() < p; }

  pick(arr) { return arr[Math.floor(this.float() * arr.length)]; }

  /** Weighted pick. `weightFn` defaults to reading `.weight` (missing => 1). */
  weighted(arr, weightFn = (x) => (x.weight ?? 1)) {
    let total = 0;
    for (const x of arr) total += weightFn(x);
    if (total <= 0) return arr[0];
    let r = this.float() * total;
    for (const x of arr) {
      r -= weightFn(x);
      if (r <= 0) return x;
    }
    return arr[arr.length - 1];
  }

  /** Pick n distinct entries (Fisher-Yates partial shuffle on a copy). */
  sample(arr, n) {
    const copy = arr.slice();
    const out = [];
    n = Math.min(n, copy.length);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(this.float() * copy.length);
      out.push(copy.splice(j, 1)[0]);
    }
    return out;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const rng = new Rng();
export { Rng };
