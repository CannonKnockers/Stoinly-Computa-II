/* ACCOUNT FULL — the track
   One map. Money enters from the mail on the left and walks to the account
   on the right. The path is a polyline with rounded corners, parametrised
   by arc length so everything on it is a single number: distance travelled. */
(function (AF) {
  'use strict';

  const WAYPOINTS = [
    [-60, 140], [260, 140], [260, 420], [560, 420], [560, 160], [880, 160],
    [880, 500], [640, 500], [640, 600], [1040, 600], [1040, 300], [1340, 300],
  ];
  const HALF_W = 26;      // half the width of the track band
  const CORNER = 54;      // corner radius

  function norm(ax, ay) { const l = Math.hypot(ax, ay) || 1; return [ax / l, ay / l]; }

  function build(wps, r) {
    const pts = [wps[0].slice()];
    for (let i = 1; i < wps.length - 1; i++) {
      const [px, py] = wps[i];
      const [ax, ay] = wps[i - 1];
      const [bx, by] = wps[i + 1];
      const d1 = norm(px - ax, py - ay);
      const d2 = norm(bx - px, by - py);
      const sx = px - d1[0] * r, sy = py - d1[1] * r;   // arc start
      const ex = px + d2[0] * r, ey = py + d2[1] * r;   // arc end
      const K = 10;
      for (let k = 0; k <= K; k++) {                    // quadratic bezier through the corner
        const t = k / K, u = 1 - t;
        pts.push([u * u * sx + 2 * u * t * px + t * t * ex, u * u * sy + 2 * u * t * py + t * t * ey]);
      }
    }
    pts.push(wps[wps.length - 1].slice());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, length: cum[cum.length - 1] };
  }

  const built = build(WAYPOINTS, CORNER);
  const pts = built.pts, cum = built.cum, LENGTH = built.length;

  // Position and heading at distance s along the track.
  function posAt(s) {
    if (s <= 0) { const [x, y] = pts[0]; const [nx, ny] = pts[1]; return { x, y, a: Math.atan2(ny - y, nx - x) }; }
    if (s >= LENGTH) { const n = pts.length; const [x, y] = pts[n - 1]; const [px, py] = pts[n - 2]; return { x, y, a: Math.atan2(y - py, x - px) }; }
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (s - cum[lo]) / seg;
    const [x0, y0] = pts[lo], [x1, y1] = pts[hi];
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) };
  }

  // Nearest point on the track to (x, y): its distance s, and how far away it is.
  function nearest(x, y) {
    let best = { s: 0, d: Infinity, x: 0, y: 0 };
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0;
      const l2 = dx * dx + dy * dy || 1;
      let t = ((x - x0) * dx + (y - y0) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const qx = x0 + dx * t, qy = y0 + dy * t;
      const d = Math.hypot(x - qx, y - qy);
      if (d < best.d) best = { s: cum[i - 1] + Math.sqrt(l2) * t, d, x: qx, y: qy };
    }
    return best;
  }

  AF.PATH = { pts, cum, length: LENGTH, HALF_W, posAt, nearest, WAYPOINTS };
})(typeof window !== 'undefined' ? (window.AF = window.AF || {}) : (global.AF = global.AF || {}));
