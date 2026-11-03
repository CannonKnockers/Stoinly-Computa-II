/* Wreck Riders - level registry. Level files in src/levels/ call WR.defineLevel(def). See docs/ENGINE.md for the format. */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  WR.LEVELS = [];
  /**
   * Round the corners of a polyline: each interior vertex is replaced by a quadratic curve that starts `r` metres before
   * the corner and ends `r` metres after it (r shrinks to fit short segments), sampled with `n` points.
   * Sharp concave corners flip vehicles at speed; rounded ones ride smoothly. Vertical steps (equal x) are kept sharp.
   *   ground: [ WR.smooth([[-10, 0], [30, 0], [60, -8], [90, -8]], 5) ]
   */
  WR.smooth = function (pts, r, n) {
    r = r == null ? 3 : r; n = n || 6;
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const vertical = Math.abs(b[0] - a[0]) < 1e-6 || Math.abs(c[0] - b[0]) < 1e-6;
      const d = Math.min(r, l1 * 0.5, l2 * 0.5);
      if (vertical || d < 0.05) { out.push(b); continue; }
      const p0 = [b[0] + (a[0] - b[0]) * d / l1, b[1] + (a[1] - b[1]) * d / l1];
      const p2 = [b[0] + (c[0] - b[0]) * d / l2, b[1] + (c[1] - b[1]) * d / l2];
      for (let k = 0; k <= n; k++) {
        const t = k / n, u = 1 - t;
        out.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p2[1]]);
      }
    }
    out.push(pts[pts.length - 1]);
    // drop points closer than 1 cm to their predecessor (planck chains reject near-duplicate vertices)
    return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 0.01);
  };

  WR.defineLevel = function (def) {
    if (!def || !def.name || !def.start || !def.ground || !def.ground.length) throw new Error('defineLevel: name, start and ground are required');
    if (!def.objects) def.objects = [];
    if (!def.objects.some((o) => o.t === 'finish')) throw new Error('defineLevel: level "' + def.name + '" has no finish object');
    def.index = WR.LEVELS.length;
    WR.LEVELS.push(def);
    return def;
  };
})();
