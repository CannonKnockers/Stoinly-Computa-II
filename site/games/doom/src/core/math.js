(function (ns) {
  'use strict';
  // math.js: angle, interpolation and vector helpers shared by the renderer and the game
  // logic, plus a 4096-entry sine/cosine table addressed by angle (section 5: radians,
  // 0 east, positive toward south). Everything here is pure and allocation-free so it can
  // sit inside per-column and per-tic loops.

  const PI = Math.PI;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;
  const ANGLE_STEPS = 4096;
  const STEPS_PER_RADIAN = ANGLE_STEPS / TAU;
  const ANGLE_MASK = ANGLE_STEPS - 1;
  const SIN = new Float64Array(ANGLE_STEPS);
  const COS = new Float64Array(ANGLE_STEPS);
  for (let i = 0; i < ANGLE_STEPS; i++) {
    SIN[i] = Math.sin(i / STEPS_PER_RADIAN);
    COS[i] = Math.cos(i / STEPS_PER_RADIAN);
  }

  // Wraps any finite angle into [0, TAU). Rounding can leave exactly TAU for tiny
  // negative inputs, hence the second check.
  function normAngle(a) {
    a -= TAU * Math.floor(a / TAU);
    return a >= TAU ? a - TAU : a;
  }

  // Wraps into (-PI, PI], the form used for turning toward a target.
  function signedAngle(a) {
    a = normAngle(a);
    return a > PI ? a - TAU : a;
  }

  // Shortest signed turn that takes `from` to `to`.
  function angleDiff(from, to) {
    return signedAngle(to - from);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Interpolates along the shorter arc so a view angle crossing 0 does not spin.
  function lerpAngle(a, b, t) {
    return a + angleDiff(a, b) * t;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function sign(v) {
    return v > 0 ? 1 : (v < 0 ? -1 : 0);
  }

  // Nearest table slot for an angle; the mask wraps negatives and multiples of TAU.
  function angleIndex(a) {
    return Math.round(a * STEPS_PER_RADIAN) & ANGLE_MASK;
  }

  function sinA(a) {
    return SIN[angleIndex(a)];
  }

  function cosA(a) {
    return COS[angleIndex(a)];
  }

  // Angle of the direction from (x0, y0) to (x1, y1), in [0, TAU).
  function angleTo(x0, y0, x1, y1) {
    return normAngle(Math.atan2(y1 - y0, x1 - x0));
  }

  // Sprite rotation 1..8 of section 8.4: viewAngle is the direction from the thing to the
  // viewer; rotation 1 is the front, 3 the right side, 5 the back, 7 the left side.
  function rotation(viewAngle, thingAngle) {
    return Math.floor(normAngle(viewAngle - thingAngle + PI / 8) / (PI / 4)) + 1;
  }

  function dist2(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    return dx * dx + dy * dy;
  }

  function dist(x0, y0, x1, y1) {
    return Math.sqrt(dist2(x0, y0, x1, y1));
  }

  function len(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }

  // z component of the 2D cross product: positive when b is clockwise from a on the map.
  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  function rotateX(x, y, a) {
    return x * Math.cos(a) - y * Math.sin(a);
  }

  function rotateY(x, y, a) {
    return x * Math.sin(a) + y * Math.cos(a);
  }

  function frac(x) {
    return x - Math.floor(x);
  }

  // Modulo that is never negative, for texture wrapping and grid indices.
  function mod(a, n) {
    const r = a % n;
    return r < 0 ? r + n : r;
  }

  // Moves v toward target by at most step; the friction and bob helpers use it.
  function approach(v, target, step) {
    if (v < target) {
      return v + step > target ? target : v + step;
    }
    return v - step < target ? target : v - step;
  }

  function radians(deg) {
    return deg * (PI / 180);
  }

  function degrees(rad) {
    return rad * (180 / PI);
  }

  function nearlyEqual(a, b, eps) {
    return Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);
  }

  ns.math = {
    PI: PI,
    TAU: TAU,
    HALF_PI: HALF_PI,
    ANGLE_STEPS: ANGLE_STEPS,
    SIN: SIN,
    COS: COS,
    normAngle: normAngle,
    signedAngle: signedAngle,
    angleDiff: angleDiff,
    lerp: lerp,
    lerpAngle: lerpAngle,
    clamp: clamp,
    sign: sign,
    angleIndex: angleIndex,
    sinA: sinA,
    cosA: cosA,
    angleTo: angleTo,
    rotation: rotation,
    dist2: dist2,
    dist: dist,
    len: len,
    dot: dot,
    cross: cross,
    rotateX: rotateX,
    rotateY: rotateY,
    frac: frac,
    mod: mod,
    approach: approach,
    radians: radians,
    degrees: degrees,
    nearlyEqual: nearlyEqual
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
