/* Wreck Riders - small shared helpers (DOM-free) */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const U = WR.util = {};
  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.sign = (v) => (v < 0 ? -1 : 1);
  U.len = (x, y) => Math.hypot(x, y);
  U.wrapAngle = (a) => { a = (a + Math.PI) % U.TAU; if (a < 0) a += U.TAU; return a - Math.PI; };
  U.rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
  // Convert a direction (from a limb's top anchor to its bottom anchor) into a body angle.
  // Body angle 0 means the limb hangs straight down (+y); negative swings it forward (+x).
  U.dirToAngle = (ux, uy) => Math.atan2(-ux, uy);
  U.seeded = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.Emitter = class {
    constructor() { this.map = new Map(); }
    on(name, fn) { if (!this.map.has(name)) this.map.set(name, []); this.map.get(name).push(fn); return this; }
    emit(name, a, b, c) { const l = this.map.get(name); if (l) for (let i = 0; i < l.length; i++) l[i](a, b, c); }
  };
})();
