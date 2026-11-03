(function (ns) {
  'use strict';
  // rng.js: the deterministic 32-bit xorshift generator that game logic uses (section 3).
  // ns.rng is the shared generator seeded once per game; create() makes independent ones
  // for the synth, the tools and tests so that they never disturb the game's sequence and
  // a recorded input list replays identically.

  const FALLBACK_STATE = 0x9e3779b9;

  function create(seedValue) {
    let state = FALLBACK_STATE;

    // Text seeds are hashed (FNV-1a) and every seed is scrambled with the murmur3
    // finalizer so that neighboring seeds start far apart; xorshift must never be 0.
    function seed(v) {
      let s = 0;
      if (typeof v === 'string') {
        s = 0x811c9dc5;
        for (let i = 0; i < v.length; i++) {
          s ^= v.charCodeAt(i);
          s = Math.imul(s, 0x01000193);
        }
      } else {
        s = Number.isFinite(v) ? Math.floor(v) : 0;
      }
      s >>>= 0;
      s ^= s >>> 16;
      s = Math.imul(s, 0x85ebca6b);
      s ^= s >>> 13;
      s = Math.imul(s, 0xc2b2ae35);
      s ^= s >>> 16;
      s >>>= 0;
      state = s === 0 ? FALLBACK_STATE : s;
      return generator;
    }

    function nextUint() {
      let x = state;
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      state = x;
      return x;
    }

    // Uniform in [0, 1).
    function next() {
      return nextUint() / 4294967296;
    }

    // Integer in [0, n).
    function int(n) {
      return n > 0 ? Math.floor(next() * n) : 0;
    }

    function range(lo, hi) {
      return lo + (hi - lo) * next();
    }

    function chance(p) {
      return next() < p;
    }

    function pick(array) {
      return array.length > 0 ? array[int(array.length)] : undefined;
    }

    // Doom's P_Random shape: a byte 0..255, from the best-mixed bits of the state.
    function byte() {
      return nextUint() >>> 24;
    }

    function getState() {
      return state;
    }

    function setState(s) {
      s >>>= 0;
      state = s === 0 ? FALLBACK_STATE : s;
    }

    const generator = {
      seed: seed,
      next: next,
      nextUint: nextUint,
      int: int,
      range: range,
      chance: chance,
      pick: pick,
      byte: byte,
      getState: getState,
      setState: setState,
      create: create
    };
    seed(seedValue === undefined ? 1 : seedValue);
    return generator;
  }

  ns.rng = create(1);
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
