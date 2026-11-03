/* Wreck Riders - renderer. Canvas 2D only: flat cartoon fills with dark outlines, parallax backdrops and the world.
 * The site-style HUD, overlays and menus live in src/screens.js and the juice effects in src/fx.js; both add methods to
 * Render.prototype and are loaded after this file.
 * Interface (see docs/ENGINE.md):
 *   const render = new WR.Render(canvas);
 *   render.resize();                      // every frame; handles devicePixelRatio and window size
 *   render.onLevelStart(sim);             // snap the camera, build the level's backdrop
 *   render.drawGame(sim, game, dt);       // world + HUD + dead/won overlays
 *   render.drawTitle|drawSelect|drawLevels|drawCollection|drawDaily(game, dt);   // src/screens.js; dt in seconds drives menu animation
 *   render.hitTest(game, x, y) -> hit | null   (hit types are listed at the top of src/screens.js)
 * World units are metres with y pointing down; positive angles turn clockwise on screen, so ctx.rotate(body.getAngle())
 * needs no sign change. */
(function () {
  const WR = window.WR = window.WR || {};
  const U = WR.util;
  const TAU = Math.PI * 2;
  const OUTLINE = '#1b1a22';

  /* ---------------- colour helpers ---------------- */
  const colorCache = new Map();
  function parseColor(c) {
    let v = colorCache.get(c);
    if (v) return v;
    let r = 128, g = 128, b = 128;
    if (c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    } else {
      const m = c.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    }
    v = [r, g, b];
    colorCache.set(c, v);
    return v;
  }
  /** Lighten (amt > 0) or darken (amt < 0) a colour; amt in -1..1. */
  function shade(c, amt) {
    const [r, g, b] = parseColor(c);
    const f = (x) => Math.round(amt >= 0 ? x + (255 - x) * amt : x * (1 + amt));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function rgba(c, a) { const [r, g, b] = parseColor(c); return `rgba(${r},${g},${b},${a})`; }
  function mix(c1, c2, t) {
    const a = parseColor(c1), b = parseColor(c2);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // Drawing-only rider palettes: a white hit flash, and the dark silhouette of a locked cosmetic in the collection.
  const FLASH = { skin: '#ffffff', shirt: '#ffffff', sleeve: '#ffffff', pants: '#ffffff', shoes: '#ffffff', hair: '#ffffff', hairStyle: 'bald' };
  const SILHOUETTE = { skin: '#0b0b2e', shirt: '#0b0b2e', sleeve: '#0b0b2e', pants: '#0b0b2e', shoes: '#0b0b2e', hair: '#0b0b2e', hairStyle: 'short' };
  const DEFAULT_THEME = { skyTop: '#5ab3f0', skyBottom: '#dff3ff', ground: '#8b5a2b', grass: '#58b04a', accent: '#ff8c1a', mood: 'day' };
  // STOINLY NEXUS display/motion settings (src/prefs.js sets WR.prefs; these defaults apply if it is not loaded)
  const NO_PREFS = { shake: 1, particles: 1, flashes: true, performance: false, textScale: 1, reduced: false };
  const prefs = () => WR.prefs || NO_PREFS;
  const keepParticle = (seed, scale) => (WR.Prefs ? WR.Prefs.keep(seed, scale) : true);

  /* ---------------- path helpers (all in current transform units) ---------------- */
  function capsulePath(ctx, x0, y0, x1, y1, r) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.arc(x0, y0, r, a + Math.PI / 2, a + Math.PI * 1.5);
    ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function polyPath(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close !== false) ctx.closePath();
  }
  function fillStroke(ctx, fill, lw, stroke) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke || OUTLINE; ctx.stroke(); }
  }
  /** Draw a fixture's shape in its body's local frame. */
  function shapePath(ctx, shape) {
    const t = shape.m_type;
    ctx.beginPath();
    if (t === 'circle') { const c = shape.m_p; ctx.arc(c.x, c.y, shape.m_radius, 0, TAU); }
    else if (t === 'polygon') {
      const v = shape.m_vertices, n = shape.m_count;
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
    } else if (t === 'edge') { ctx.moveTo(shape.m_vertex1.x, shape.m_vertex1.y); ctx.lineTo(shape.m_vertex2.x, shape.m_vertex2.y); }
    else if (t === 'chain') {
      const v = shape.m_vertices;
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
    }
  }
  /** Axis-aligned extent of a polygon fixture in local coords. */
  function polyBox(shape) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const v = shape.m_vertices;
    for (let i = 0; i < shape.m_count; i++) { x0 = Math.min(x0, v[i].x); y0 = Math.min(y0, v[i].y); x1 = Math.max(x1, v[i].x); y1 = Math.max(y1, v[i].y); }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  /* ---------------- backdrop generation (per level, seeded) ---------------- */
  function buildBackdrop(level) {
    const theme = Object.assign({}, DEFAULT_THEME, level.theme || {});
    const rnd = U.seeded(hash(level.id || level.name || 'level'));
    const mood = theme.mood || 'day';
    const TILE = 2400;   // px at parallax scale 1; layers repeat horizontally
    const ridge = (base, amp, step, rough) => {
      const pts = [];
      let y = base;
      for (let x = 0; x <= TILE; x += step) {
        const k = x / TILE * TAU;
        y = base + Math.sin(k * 2 + rnd() * 0.2) * amp * 0.5 + Math.sin(k * 5) * amp * 0.25 + (rnd() - 0.5) * amp * rough;
        pts.push([x, y]);
      }
      pts[pts.length - 1][1] = pts[0][1];
      return pts;
    };
    const layers = [];
    const far = mix(theme.skyBottom, theme.ground, 0.25), mid = mix(theme.skyBottom, theme.ground, 0.5);
    if (mood === 'night') {
      layers.push({ f: 0.08, kind: 'stars', pts: Array.from({ length: 140 }, () => [rnd() * TILE, rnd() * 0.75, 0.5 + rnd() * 1.4, rnd() * TAU]) });
      layers.push({ f: 0.12, kind: 'ridge', color: mix(theme.skyTop, '#000000', 0.25), pts: ridge(0.55, 0.22, 40, 0.5) });
      layers.push({ f: 0.25, kind: 'stalactites', color: mix(theme.skyTop, '#000000', 0.45), pts: Array.from({ length: 34 }, () => [rnd() * TILE, 30 + rnd() * 140, 18 + rnd() * 34]) });
      layers.push({ f: 0.32, kind: 'ridge', color: mix(theme.ground, '#000000', 0.45), pts: ridge(0.72, 0.14, 30, 0.9) });
    } else if (mood === 'industrial') {
      layers.push({ f: 0.1, kind: 'ridge', color: far, pts: ridge(0.6, 0.12, 60, 0.2) });
      const stacks = [];
      for (let x = 60; x < TILE; x += 140 + rnd() * 260) stacks.push({ x, w: 24 + rnd() * 30, h: 0.25 + rnd() * 0.3, smoke: rnd() < 0.7 });
      layers.push({ f: 0.18, kind: 'stacks', color: mix(theme.skyBottom, '#1a1a1a', 0.55), items: stacks });
      const blocks = [];
      for (let x = 0; x < TILE;) { const w = 60 + rnd() * 160; blocks.push({ x, w, h: 0.12 + rnd() * 0.22, roof: rnd() < 0.5 }); x += w + rnd() * 40; }
      layers.push({ f: 0.3, kind: 'blocks', color: mix(theme.skyBottom, '#141414', 0.7), items: blocks });
    } else if (mood === 'dusk') {
      layers.push({ f: 0.06, kind: 'clouds', color: rgba(mix(theme.skyTop, '#ffffff', 0.35), 0.55), items: Array.from({ length: 9 }, () => ({ x: rnd() * TILE, y: 0.08 + rnd() * 0.3, s: 0.6 + rnd() * 1.2 })) });
      layers.push({ f: 0.14, kind: 'ridge', color: mix(theme.skyTop, '#200a2a', 0.35), pts: ridge(0.58, 0.2, 40, 0.3) });
      const blocks = [];
      for (let x = 0; x < TILE;) { const w = 40 + rnd() * 120; blocks.push({ x, w, h: 0.1 + rnd() * 0.25, roof: rnd() < 0.3 }); x += w + 20 + rnd() * 120; }
      layers.push({ f: 0.26, kind: 'blocks', color: mix(theme.skyTop, '#120614', 0.65), items: blocks });
    } else {
      layers.push({ f: 0.05, kind: 'clouds', color: 'rgba(255,255,255,0.85)', items: Array.from({ length: 10 }, () => ({ x: rnd() * TILE, y: 0.06 + rnd() * 0.3, s: 0.6 + rnd() * 1.3 })) });
      layers.push({ f: 0.12, kind: 'ridge', color: mix(theme.skyBottom, '#5b7fa6', 0.45), pts: ridge(0.55, 0.22, 40, 0.3) });
      layers.push({ f: 0.24, kind: 'ridge', color: mix(theme.grass, theme.skyBottom, 0.45), pts: ridge(0.66, 0.16, 30, 0.4) });
      const trees = [];
      for (let x = 20; x < TILE; x += 40 + rnd() * 120) trees.push({ x, s: 0.7 + rnd() * 0.7, kind: rnd() < 0.5 ? 'round' : 'pine' });
      layers.push({ f: 0.36, kind: 'trees', color: mix(theme.grass, '#1d3b1d', 0.45), items: trees, base: ridge(0.78, 0.06, 30, 0.3) });
    }
    return { theme, mood, layers, TILE, sun: mood === 'day' || mood === 'dusk', moon: mood === 'night' };
  }

  class Render {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 0; this.h = 0; this.dpr = 1;
      this.cam = { x: 0, y: 0, zoom: 34, sx: 0, sy: 0 };
      this.backdrop = null;
      this.levelKey = null;
      this.hits = [];
      this.t = 0;              // wall-clock seconds, for animation
      this.previews = null;    // character-select preview sims
      this.menuBackdrop = null;
    }

    resize() {
      const dpr = prefs().performance ? 1 : Math.min(window.devicePixelRatio || 1, 2);   // performance mode: 1 canvas px per CSS px
      const w = window.innerWidth, h = window.innerHeight;
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w; this.h = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
        this.skyCache = null;
      }
    }

    /** Pixels per metre at rest: 50 px/m on a 720 px tall window, scaled with the window height. */
    baseZoom() { return 50 * U.clamp(this.h / 720, 0.6, 2.2); }

    onLevelStart(sim) {
      const key = sim.level.id || sim.level.name;
      if (key !== this.levelKey || !this.backdrop) { this.backdrop = buildBackdrop(sim.level); this.levelKey = key; this.skyCache = null; }
      const p = sim.focusBody().getPosition();
      this.cam.zoom = this.baseZoom();
      this.cam.x = p.x + 3; this.cam.y = p.y - this.h * 0.1 / this.cam.zoom;
      this.cam.sx = this.cam.sy = 0;
      this.levelStartT = this.t;
    }

    updateCamera(sim, dt) {
      const cam = this.cam;
      const fb = sim.focusBody();
      const p = fb.getPosition(), v = fb.getLinearVelocity();
      const speed = Math.hypot(v.x, v.y);
      const targetZoom = this.baseZoom() * U.lerp(1, 0.62, U.clamp((speed - 6) / 22, 0, 1));
      cam.zoom += (targetZoom - cam.zoom) * (1 - Math.exp(-dt * 1.6));
      const look = U.clamp(v.x * 0.32, -6, 7), lookY = U.clamp(v.y * 0.15, -3, 4);
      const tx = p.x + look, ty = p.y + lookY - this.h * 0.1 / cam.zoom;   // rider sits ~60% down the screen
      const k = 1 - Math.exp(-dt * 5);
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
      // keep the rider on screen even when the smoothing lags behind a launch
      const hw = this.w / 2 / cam.zoom * 0.8, hh = this.h / 2 / cam.zoom * 0.8;
      cam.x = U.clamp(cam.x, p.x - hw, p.x + hw); cam.y = U.clamp(cam.y, p.y - hh, p.y + hh);
      const shk = prefs().shake;   // nexus shake scale (0 under reduced motion)
      const sh = this.frozen || WR.reducedMotion ? 0 : (sim.shake || 0) * shk;   // the shake only decays in sim.update, so none while paused
      cam.sx = sh > 0 ? (Math.random() - 0.5) * sh * 0.6 : 0;
      cam.sy = sh > 0 ? (Math.random() - 0.5) * sh * 0.6 : 0;
      // crash juice: trauma squared, up to 18 screen pixels (juice.shake is already 0 with reduced motion)
      const jk = this.frozen || !this.juice ? 0 : this.juice.shake * this.juice.shake;
      if (jk > 0 && shk > 0) { cam.sx += (Math.random() - 0.5) * 36 * jk * shk / cam.zoom; cam.sy += (Math.random() - 0.5) * 36 * jk * shk / cam.zoom; }
    }

    /** Set the world transform for the current camera. */
    worldTransform() {
      const c = this.cam, d = this.dpr;
      this.ctx.setTransform(d * c.zoom, 0, 0, d * c.zoom, d * (this.w / 2 - (c.x + c.sx) * c.zoom), d * (this.h / 2 - (c.y + c.sy) * c.zoom));
    }
    screenTransform() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
    /** Visible world rectangle (with a margin in metres). */
    view(margin) {
      const c = this.cam, m = margin || 0;
      const hw = this.w / 2 / c.zoom, hh = this.h / 2 / c.zoom;
      return { x0: c.x - hw - m, x1: c.x + hw + m, y0: c.y - hh - m, y1: c.y + hh + m };
    }
    px(n) { return n / this.cam.zoom; }   // n screen pixels in world units

    /* ---------------- backdrop ---------------- */
    drawSky(bd, camX, camY, zoom) {
      const ctx = this.ctx, w = this.w, h = this.h, th = bd.theme;
      this.screenTransform();
      if (!this.skyCache || this.skyCache.h !== h || this.skyCache.bd !== bd) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, th.skyTop); g.addColorStop(1, th.skyBottom);
        this.skyCache = { h, bd, g };
      }
      ctx.fillStyle = this.skyCache.g;
      ctx.fillRect(0, 0, w, h);
      // sun or moon, fixed in the sky with a hint of parallax
      if (bd.sun || bd.moon) {
        const sx = w * 0.78 - (camX * zoom * 0.01) % (w * 0.5), sy = h * (bd.mood === 'dusk' ? 0.42 : 0.2) - camY * zoom * 0.01;
        const r = Math.min(w, h) * (bd.mood === 'dusk' ? 0.11 : 0.06);
        if (!prefs().performance) {   // performance mode: no glow halo
          const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 3.2);
          const col = bd.moon ? '#e8f0ff' : (bd.mood === 'dusk' ? '#ffb347' : '#fff6c8');
          glow.addColorStop(0, rgba(col, bd.moon ? 0.35 : 0.55)); glow.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, r * 3.2, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = bd.moon ? '#eef3ff' : (bd.mood === 'dusk' ? '#ffcf73' : '#fffbe6');
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
        if (bd.moon) { ctx.fillStyle = 'rgba(160,170,200,0.35)'; for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [0.05, 0.4, 0.12]]) { ctx.beginPath(); ctx.arc(sx + dx * r, sy + dy * r, rr * r, 0, TAU); ctx.fill(); } }
      }
      const scale = h / 720;
      const perf = prefs().performance;
      for (const L of bd.layers) {
        if (perf && (L.kind === 'clouds' || L.kind === 'stars')) continue;   // performance mode: a cheaper backdrop
        const off = -(camX * zoom * L.f) / scale;           // layer units are 720-px-tall "virtual pixels"
        const yoff = U.clamp(-(camY * zoom * L.f * 0.5), -h * 0.3, h * 0.3);
        ctx.save();
        ctx.translate(0, yoff);
        ctx.scale(scale, scale);
        const vw = w / scale;
        const start = Math.floor(-off / bd.TILE) - 1;
        for (let k = start; k * bd.TILE + off < vw + bd.TILE; k++) {
          const ox = k * bd.TILE + off;
          if (ox > vw || ox + bd.TILE < 0) continue;
          this.drawLayer(L, ox, bd);
        }
        ctx.restore();
      }
    }

    drawLayer(L, ox, bd) {
      const ctx = this.ctx, H = 720;
      ctx.fillStyle = L.color || '#000';
      switch (L.kind) {
        case 'ridge': {
          ctx.beginPath(); ctx.moveTo(ox, H * 2);
          for (const p of L.pts) ctx.lineTo(ox + p[0], p[1] * H);
          ctx.lineTo(ox + bd.TILE, H * 2); ctx.closePath(); ctx.fill();
          break;
        }
        case 'clouds': {
          for (const c of L.items) {
            const x = ox + ((c.x + this.t * 6 * c.s) % bd.TILE), y = c.y * H, s = c.s * 40;
            ctx.beginPath();
            ctx.arc(x, y, s, 0, TAU); ctx.arc(x + s * 0.9, y + s * 0.15, s * 0.75, 0, TAU); ctx.arc(x - s * 0.9, y + s * 0.2, s * 0.65, 0, TAU); ctx.arc(x + s * 0.2, y - s * 0.45, s * 0.6, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'stars': {
          for (const s of L.pts) {
            const tw = 0.55 + 0.45 * Math.sin(this.t * 2 + s[3]);
            ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * tw})`;
            ctx.fillRect(ox + s[0], s[1] * H, s[2], s[2]);
          }
          break;
        }
        case 'stalactites': {
          ctx.beginPath(); ctx.moveTo(ox, -H);
          ctx.lineTo(ox, 10);
          const items = L.pts.slice().sort((a, b) => a[0] - b[0]);
          for (const s of items) { ctx.lineTo(ox + s[0] - s[2], 12); ctx.lineTo(ox + s[0], s[1]); ctx.lineTo(ox + s[0] + s[2], 12); }
          ctx.lineTo(ox + bd.TILE, 10); ctx.lineTo(ox + bd.TILE, -H); ctx.closePath(); ctx.fill();
          break;
        }
        case 'stacks': {
          for (const s of L.items) {
            const top = H * (1 - s.h) - 60;
            ctx.fillStyle = L.color;
            ctx.fillRect(ox + s.x, top, s.w, H * 2);
            ctx.fillRect(ox + s.x - 4, top, s.w + 8, 10);
            if (s.smoke && !prefs().performance) {
              for (let i = 0; i < 5; i++) {
                const ph = ((this.t * 0.25 + i / 5 + s.x * 0.001) % 1);
                ctx.fillStyle = `rgba(70,60,60,${0.32 * (1 - ph)})`;
                ctx.beginPath(); ctx.arc(ox + s.x + s.w / 2 + ph * 70, top - ph * 160, 12 + ph * 40, 0, TAU); ctx.fill();
              }
            }
          }
          break;
        }
        case 'blocks': {
          for (const b of L.items) {
            const top = H * (1 - b.h);
            ctx.fillRect(ox + b.x, top, b.w, H * 2);
            if (b.roof) { ctx.beginPath(); ctx.moveTo(ox + b.x, top); ctx.lineTo(ox + b.x + b.w * 0.5, top - 26); ctx.lineTo(ox + b.x + b.w, top); ctx.fill(); }
          }
          // a few lit windows (not in performance mode)
          if (prefs().performance) break;
          ctx.fillStyle = bd.mood === 'industrial' ? 'rgba(255,190,90,0.55)' : 'rgba(255,220,140,0.45)';
          for (const b of L.items) {
            const top = H * (1 - b.h);
            for (let wx = b.x + 8; wx < b.x + b.w - 10; wx += 18) for (let wy = top + 14; wy < H; wy += 24) if (((wx * 13 + wy * 7) | 0) % 5 === 0) ctx.fillRect(ox + wx, wy, 7, 9);
          }
          break;
        }
        case 'trees': {
          ctx.beginPath(); ctx.moveTo(ox, H * 2);
          for (const p of L.base) ctx.lineTo(ox + p[0], p[1] * H);
          ctx.lineTo(ox + bd.TILE, H * 2); ctx.closePath(); ctx.fill();
          for (const t of L.items) {
            const by = this.ridgeY(L.base, t.x) * H, s = t.s * 34;
            const x = ox + t.x;
            if (t.kind === 'pine') { ctx.beginPath(); ctx.moveTo(x - s * 0.5, by); ctx.lineTo(x, by - s * 2.2); ctx.lineTo(x + s * 0.5, by); ctx.fill(); }
            else { ctx.fillRect(x - s * 0.08, by - s * 0.8, s * 0.16, s * 0.8); ctx.beginPath(); ctx.arc(x, by - s * 1.1, s * 0.6, 0, TAU); ctx.fill(); }
          }
          break;
        }
        default: break;
      }
    }
    ridgeY(pts, x) {
      for (let i = 0; i + 1 < pts.length; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) return U.lerp(pts[i][1], pts[i + 1][1], (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1));
      return pts[0][1];
    }

    /* ---------------- terrain ---------------- */
    drawTerrain(sim, v) {
      const ctx = this.ctx, th = this.backdrop.theme;
      const lw = this.px(2);
      if (!this.groundGrad || this.groundGrad.sim !== sim) {
        const b = sim.bounds;
        const g = ctx.createLinearGradient(0, b.minY, 0, b.maxY + 40);
        g.addColorStop(0, th.ground); g.addColorStop(0.5, shade(th.ground, -0.25)); g.addColorStop(1, shade(th.ground, -0.55));
        this.groundGrad = { sim, g };
      }
      for (const t of sim.terrain) {
        const pts = t.pts;
        if (pts[pts.length - 1][0] < v.x0 || pts[0][0] > v.x1) continue;
        // visible index range (+1 on each side)
        let i0 = 0, i1 = pts.length - 1;
        while (i0 < pts.length - 2 && pts[i0 + 1][0] < v.x0) i0++;
        while (i1 > 1 && pts[i1 - 1][0] > v.x1) i1--;
        const mode = t.fill === true || t.fill === undefined ? 'below' : t.fill;
        if (mode) {
          ctx.beginPath();
          ctx.moveTo(pts[i0][0], pts[i0][1]);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          if (mode === 'above') { ctx.lineTo(pts[i1][0], v.y0 - 5); ctx.lineTo(pts[i0][0], v.y0 - 5); }
          else if (mode === 'slab') { for (let i = i1; i >= i0; i--) ctx.lineTo(pts[i][0], pts[i][1] + 1.6); }
          else { ctx.lineTo(pts[i1][0], Math.max(v.y1, pts[i1][1]) + 5); ctx.lineTo(pts[i0][0], Math.max(v.y1, pts[i0][1]) + 5); }
          ctx.closePath();
          ctx.fillStyle = this.groundGrad.g; ctx.fill();
          // strata: gently wavy horizontal rock bands, clipped to the ground
          ctx.save(); ctx.clip();
          const bx0 = Math.max(v.x0, pts[i0][0]), bx1 = Math.min(v.x1, pts[i1][0]);
          for (let by = Math.floor(v.y0 / 2.2) * 2.2; by < v.y1 + 2.2; by += 2.2) {
            const band = Math.round(by / 2.2);
            ctx.beginPath();
            for (let x = bx0; x <= bx1 + 1; x += 1) {
              const yy = by + Math.sin(x * 0.21 + band * 1.7) * 0.25 + Math.sin(x * 0.067 + band) * 0.45;
              if (x === bx0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
            }
            ctx.strokeStyle = band % 2 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = band % 3 === 0 ? 0.55 : 0.3;
            ctx.stroke();
          }
          const dir = mode === 'above' ? -1 : 1;
          // pebbles at fixed pseudo-random spots
          ctx.fillStyle = 'rgba(0,0,0,0.13)';
          for (let i = i0; i < i1; i++) {
            const a = pts[i], b = pts[i + 1];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            for (let s = 0.7; s < len; s += 1.9) {
              const hsh = Math.sin((a[0] + s) * 12.9898 + a[1] * 78.233) * 43758.5453;
              const fr = hsh - Math.floor(hsh);
              const px = a[0] + (b[0] - a[0]) * s / len, py = a[1] + (b[1] - a[1]) * s / len + dir * (0.6 + fr * 3.5);
              ctx.beginPath(); ctx.ellipse(px, py, 0.08 + fr * 0.12, 0.05 + fr * 0.07, fr * 3, 0, TAU); ctx.fill();
            }
          }
          ctx.restore();
        }
        // outline the whole surface, then grass only where it is walkable (not on near-vertical walls)
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[i0][0], pts[i0][1]);
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 2.5; ctx.stroke();
        const grassPath = (dy) => {
          ctx.beginPath();
          let pen = false;
          for (let i = i0; i < i1; i++) {
            const a = pts[i], b = pts[i + 1];
            const steep = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]) * 1.6;
            if (steep) { pen = false; continue; }
            if (!pen) { ctx.moveTo(a[0], a[1] + dy); pen = true; }
            ctx.lineTo(b[0], b[1] + dy);
          }
        };
        grassPath(0);
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.34 + lw * 2; ctx.stroke();
        ctx.strokeStyle = th.grass; ctx.lineWidth = 0.3; ctx.stroke();
        grassPath(-0.08);
        ctx.strokeStyle = shade(th.grass, 0.25); ctx.lineWidth = 0.08; ctx.stroke();
      }
    }

    /* ---------------- level objects ---------------- */
    indexHazards(sim) {
      if (this.hzSim === sim) return;
      this.hzSim = sim;
      this.hzByBody = new Map();
      for (const h of sim.hazards) {
        if (h.body) this.hzByBody.set(h.body, h);
        if (h.ball) this.hzByBody.set(h.ball, h);
      }
      this.groundGrad = null;
    }

    drawObjects(sim, v) {
      const ctx = this.ctx;
      this.lw = this.px(1.6);
      // finish arch and signs sit behind everything else
      if (sim.finish) this.drawFinish(sim.finish.x, sim.finish.y);
      for (const d of sim.decor) if (d.type === 'sign' && d.x > v.x0 - 4 && d.x < v.x1 + 4) this.drawSignPost(d);
      for (let b = sim.world.getBodyList(); b; b = b.getNext()) {
        const ud = b.getUserData();
        const kind = ud && ud.kind;
        if (!kind || kind === 'ground' || kind === 'part' || kind === 'vehicle' || kind === 'finish') continue;
        const p = b.getPosition();
        if (p.x < v.x0 - 9 || p.x > v.x1 + 9 || p.y < v.y0 - 14 || p.y > v.y1 + 14) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(b.getAngle());
        const fn = this['obj_' + kind];
        if (fn) fn.call(this, b, ud, sim); else this.obj_generic(b, ud);
        ctx.restore();
      }
    }

    eachPoly(b, fn) { for (let f = b.getFixtureList(); f; f = f.getNext()) { const s = f.getShape(); if (s.m_type === 'polygon') fn(s, f); } }

    obj_generic(b, ud) {
      const ctx = this.ctx;
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        if (f.isSensor()) continue;
        shapePath(ctx, f.getShape());
        fillStroke(ctx, '#8a8f99', this.lw);
      }
    }

    material(style, box, ctx, extra) {
      const lw = this.lw;
      const { x0, y0, w, h } = box;
      if (style === 'wood') {
        ctx.fillStyle = '#b5803f'; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(70,40,10,0.45)'; ctx.lineWidth = lw;
        const along = w >= h;
        const n = Math.max(1, Math.floor((along ? h : w) / 0.22));
        for (let i = 1; i <= n; i++) {
          ctx.beginPath();
          if (along) { const y = y0 + (h / (n + 1)) * i; ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); }
          else { const x = x0 + (w / (n + 1)) * i; ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); }
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,230,180,0.25)'; ctx.fillRect(x0, y0, w, Math.min(0.06, h * 0.3));
        ctx.restore();
        ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
      } else if (style === 'rock' || style === 'concrete') {
        ctx.fillStyle = style === 'rock' ? '#6f6a73' : '#a3a29c'; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, y0, w, Math.min(0.08, h * 0.3));
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = lw;
        for (let x = x0 + 0.9; x < x0 + w; x += 1.7) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x - 0.15, y0 + h * 0.5); ctx.lineTo(x + 0.1, y0 + h); ctx.stroke(); }
        ctx.restore();
        ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
      } else {
        // steel
        ctx.fillStyle = '#7f8996'; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = '#a7b1bd'; ctx.fillRect(x0, y0, w, Math.min(0.07, h * 0.35));
        ctx.fillStyle = '#5d6672'; ctx.fillRect(x0, y0 + h - Math.min(0.06, h * 0.3), w, Math.min(0.06, h * 0.3));
        if (extra === 'stripes') {
          const sw = Math.min(0.9, w * 0.2);
          for (const ex of [x0, x0 + w - sw]) {
            ctx.save(); ctx.beginPath(); ctx.rect(ex, y0, sw, h); ctx.clip();
            ctx.fillStyle = '#f2c200'; ctx.fillRect(ex, y0, sw, h);
            ctx.fillStyle = '#222';
            for (let k = -h; k < sw + h; k += 0.3) { ctx.beginPath(); ctx.moveTo(ex + k, y0); ctx.lineTo(ex + k + 0.15, y0); ctx.lineTo(ex + k + 0.15 - h, y0 + h); ctx.lineTo(ex + k - h, y0 + h); ctx.fill(); }
            ctx.restore();
          }
        }
        ctx.fillStyle = 'rgba(30,30,40,0.55)';
        if (h > 0.18) for (let x = x0 + 0.25; x < x0 + w - 0.1; x += 0.7) { ctx.beginPath(); ctx.arc(x, y0 + 0.1, 0.035, 0, TAU); ctx.arc(x, y0 + h - 0.1, 0.035, 0, TAU); ctx.fill(); }
        ctx.restore();
        ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
      }
    }
    obj_box(b, style, extra) {
      this.eachPoly(b, (s, f) => { if (f.isSensor()) return; const box = polyBox(s); shapePath(this.ctx, s); this.material(style, box, this.ctx, extra); });
    }
    obj_platform(b, ud) { this.obj_box(b, ud.style || 'steel'); }
    obj_mover(b, ud) { this.obj_box(b, ud.style || 'steel', 'stripes'); }
    obj_rotator(b) {
      this.obj_box(b, 'steel', 'stripes');
      const ctx = this.ctx;
      ctx.beginPath(); ctx.arc(0, 0, 0.16, 0, TAU); fillStroke(ctx, '#3d434c', this.lw);
      ctx.beginPath(); ctx.arc(0, 0, 0.06, 0, TAU); ctx.fillStyle = '#c9ced6'; ctx.fill();
    }
    obj_plank(b) { this.obj_box(b, 'wood'); }
    obj_ramp(b, ud) { this.obj_box(b, ud.style || 'wood'); }
    obj_pivot(b) {
      const ctx = this.ctx;
      this.eachPoly(b, (s) => { shapePath(ctx, s); fillStroke(ctx, '#596270', this.lw); });
      ctx.beginPath(); ctx.arc(0, -0.55, 0.09, 0, TAU); fillStroke(ctx, '#c9ced6', this.lw);
    }
    obj_crate(b) {
      const ctx = this.ctx, lw = this.lw;
      this.eachPoly(b, (s) => {
        const { x0, y0, w, h } = polyBox(s);
        const m = Math.min(w, h) * 0.13;
        roundRectPath(ctx, x0, y0, w, h, 0.03); fillStroke(ctx, '#c58f4c', lw);
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(80,45,10,0.5)'; ctx.lineWidth = lw;
        for (let y = y0 + m + (h - 2 * m) / 3; y < y0 + h - m - 0.01; y += (h - 2 * m) / 3) { ctx.beginPath(); ctx.moveTo(x0 + m, y); ctx.lineTo(x0 + w - m, y); ctx.stroke(); }
        ctx.fillStyle = '#9c6b30';
        ctx.fillRect(x0, y0, w, m); ctx.fillRect(x0, y0 + h - m, w, m); ctx.fillRect(x0, y0, m, h); ctx.fillRect(x0 + w - m, y0, m, h);
        ctx.beginPath(); ctx.moveTo(x0 + m, y0 + h - m); ctx.lineTo(x0 + m * 2.2, y0 + h - m); ctx.lineTo(x0 + w - m, y0 + m * 2.2); ctx.lineTo(x0 + w - m, y0 + m); ctx.lineTo(x0 + w - m * 2.2, y0 + m); ctx.lineTo(x0 + m, y0 + h - m * 2.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(40,20,0,0.55)';
        for (const [cx, cy] of [[x0 + m / 2, y0 + m / 2], [x0 + w - m / 2, y0 + m / 2], [x0 + m / 2, y0 + h - m / 2], [x0 + w - m / 2, y0 + h - m / 2]]) { ctx.beginPath(); ctx.arc(cx, cy, m * 0.2, 0, TAU); ctx.fill(); }
        ctx.restore();
        roundRectPath(ctx, x0, y0, w, h, 0.03); ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
      });
    }
    obj_ball(b, ud) {
      const ctx = this.ctx, lw = this.lw;
      const f = b.getFixtureList(), r = f.getShape().m_radius;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
      if (ud.style === 'boulder') {
        fillStroke(ctx, '#8b8790', lw);
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.45, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.8); ctx.lineTo(r * 0.25, -r * 0.2); ctx.lineTo(-r * 0.1, r * 0.3); ctx.lineTo(r * 0.2, r * 0.75); ctx.stroke();
      } else {
        fillStroke(ctx, '#6b4423', lw);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, TAU); ctx.fillStyle = '#d9a86c'; ctx.fill();
        ctx.strokeStyle = 'rgba(120,70,20,0.6)'; ctx.lineWidth = lw;
        for (let k = 0.2; k < 0.8; k += 0.17) { ctx.beginPath(); ctx.arc(r * 0.04, r * 0.03, r * k, 0, TAU); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.6, -r * 0.3); ctx.stroke();
      }
    }
    obj_spikes(b) {
      const ctx = this.ctx, lw = this.lw;
      let first = true;
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        const s = f.getShape(), fud = f.getUserData();
        if (s.m_type !== 'polygon') continue;
        if (!fud || fud.hazard !== 'spike') {
          shapePath(ctx, s); fillStroke(ctx, '#4b525c', lw);
          continue;
        }
        const v = s.m_vertices;
        // find the tip (the vertex farthest from the base line) and the two base corners
        let tip = 0;
        for (let i = 1; i < s.m_count; i++) if (v[i].y < v[tip].y) tip = i;
        const a = v[(tip + 1) % 3], c = v[(tip + 2) % 3], t = v[tip];
        const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(t.x, t.y); ctx.closePath();
        ctx.fillStyle = '#d3d8df'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(a.x > c.x ? a.x : c.x, a.y > c.y ? a.y : c.y); ctx.lineTo(t.x, t.y); ctx.closePath();
        ctx.fillStyle = '#9ba3ae'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(t.x, t.y); ctx.closePath();
        ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
        first = false;
      }
    }
    obj_anchor(b) {
      const ctx = this.ctx;
      ctx.beginPath(); ctx.arc(0, 0, 0.18, 0, TAU); fillStroke(ctx, '#3d434c', this.lw);
      ctx.beginPath(); ctx.arc(0, 0, 0.07, 0, TAU); ctx.fillStyle = '#c9ced6'; ctx.fill();
    }
    obj_link(b) {
      const ctx = this.ctx, lw = this.lw;
      roundRectPath(ctx, -0.07, -0.23, 0.14, 0.46, 0.07);
      ctx.lineWidth = 0.07 + lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.lineWidth = 0.05; ctx.strokeStyle = '#8d949e'; ctx.stroke();
    }
    obj_wreckball(b, ud, sim) {
      const ctx = this.ctx, lw = this.lw;
      const r = b.getFixtureList().getShape().m_radius;
      const h = this.hzByBody.get(b);
      // lug pointing at the last chain link (in the ball's local frame)
      if (h && h.links && h.links.length) {
        const lp = b.getLocalPoint(h.links[h.links.length - 1].getPosition());
        const a = Math.atan2(lp.y, lp.x);
        ctx.save(); ctx.rotate(a);
        roundRectPath(ctx, r * 0.75, -0.12, 0.32, 0.24, 0.08); fillStroke(ctx, '#3a3e45', lw);
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); fillStroke(ctx, '#2c2f35', lw);
      // the highlight stays at the top-left of the screen whatever the spin
      ctx.save(); ctx.rotate(-b.getAngle());
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.32, r * 0.42, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(-r * 0.4, -r * 0.42, r * 0.14, 0, TAU); ctx.fill();
      ctx.restore();
    }
    obj_turret(b, ud, sim) {
      const ctx = this.ctx, lw = this.lw;
      const h = this.hzByBody.get(b);
      // pedestal
      polyPath(ctx, [[-0.45, 0.4], [0.45, 0.4], [0.32, -0.1], [-0.32, -0.1]]); fillStroke(ctx, '#4a515b', lw);
      ctx.save(); polyPath(ctx, [[-0.45, 0.4], [0.45, 0.4], [0.32, -0.1], [-0.32, -0.1]]); ctx.clip();
      ctx.fillStyle = '#f2c200'; ctx.fillRect(-0.5, 0.1, 1, 0.12);
      ctx.fillStyle = '#222'; for (let k = -0.5; k < 0.5; k += 0.16) { ctx.beginPath(); ctx.moveTo(k, 0.1); ctx.lineTo(k + 0.08, 0.1); ctx.lineTo(k + 0.2, 0.22); ctx.lineTo(k + 0.12, 0.22); ctx.fill(); }
      ctx.restore();
      if (!h) return;
      const aim = h.aim;
      ctx.save();
      ctx.translate(0, -0.2);
      // warning laser while the rider is in range and the harpoon is nearly reloaded
      const rd = sim.rider, tp = rd.parts.torso.body.getPosition();
      const inRange = Math.hypot(tp.x - h.x, tp.y - h.y) < h.range && sim.status === 'playing';
      if (inRange && h.cool < 1.2) {
        const a = 0.25 + 0.5 * (1 - Math.max(0, h.cool) / 1.2);
        ctx.save(); ctx.rotate(aim);
        ctx.strokeStyle = `rgba(255,30,30,${a})`; ctx.lineWidth = this.px(2);
        ctx.setLineDash([this.px(10), this.px(6)]);
        ctx.beginPath(); ctx.moveTo(0.9, 0); ctx.lineTo(9, 0); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      ctx.rotate(aim);
      capsulePath(ctx, -0.25, 0, 0.9, 0, 0.1); fillStroke(ctx, '#2f343b', lw);
      ctx.fillStyle = '#6b737e'; ctx.fillRect(-0.2, -0.1, 0.9, 0.04);
      if (h.cool < h.cooldown - 0.5) { polyPath(ctx, [[0.9, -0.07], [1.12, 0], [0.9, 0.07]]); fillStroke(ctx, '#d3d8df', lw); }
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, -0.2, 0.2, 0, TAU); fillStroke(ctx, '#596270', lw);
      ctx.beginPath(); ctx.arc(0, -0.2, 0.07, 0, TAU); ctx.fillStyle = inRange ? '#ff3b30' : '#8a1c16'; ctx.fill();
    }
    obj_mine(b, ud, sim) {
      const ctx = this.ctx, lw = this.lw;
      const h = this.hzByBody.get(b);
      if (h && !h.armed) return;
      ctx.beginPath(); ctx.ellipse(0, 0, 0.34, 0.2, 0, Math.PI, TAU); ctx.closePath(); fillStroke(ctx, '#55603c', lw);
      ctx.fillStyle = '#3d4529'; ctx.fillRect(-0.34, -0.06, 0.68, 0.06);
      const tp = sim.rider.parts.torso.body.getPosition(), p = b.getPosition();
      const d = Math.hypot(tp.x - p.x, tp.y - p.y);
      const rate = d < 6 ? 9 : (d < 15 ? 4 : 1.6);
      const on = Math.sin(this.t * rate * TAU) > 0;
      ctx.beginPath(); ctx.arc(0, -0.2, 0.055, 0, TAU); ctx.fillStyle = on ? '#ff2a2a' : '#5a1010'; ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,40,40,0.25)'; ctx.beginPath(); ctx.arc(0, -0.2, 0.16, 0, TAU); ctx.fill(); }
    }
    obj_boost(b) {
      const ctx = this.ctx, lw = this.lw;
      roundRectPath(ctx, -0.85, -0.1, 1.7, 0.12, 0.04); fillStroke(ctx, '#2b2b33', lw);
      ctx.save();
      ctx.beginPath(); ctx.rect(-0.8, -0.32, 1.6, 0.3); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const ph = ((this.t * 1.6 + i / 4) % 1);
        const x = -0.8 + ph * 1.9;
        ctx.fillStyle = `rgba(255,${180 + 60 * (1 - ph) | 0},40,${0.9 * Math.sin(ph * Math.PI)})`;
        polyPath(ctx, [[x - 0.22, -0.3], [x, -0.3], [x + 0.18, -0.16], [x, -0.02], [x - 0.22, -0.02], [x - 0.04, -0.16]]);
        ctx.fill();
      }
      ctx.restore();
    }
    obj_glass(b) {
      const ctx = this.ctx;
      this.eachPoly(b, (s) => {
        const { x0, y0, w, h } = polyBox(s);
        ctx.fillStyle = 'rgba(175,220,255,0.32)'; ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = 'rgba(235,250,255,0.95)'; ctx.lineWidth = this.px(2); ctx.strokeRect(x0, y0, w, h);
        ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.min(w, h) * 0.18 + this.px(1);
        const L = Math.max(w, h);
        for (const k of [0.25, 0.45]) { ctx.beginPath(); ctx.moveTo(x0 - L, y0 + h * k + L); ctx.lineTo(x0 + L, y0 + h * k - L); ctx.stroke(); }
        ctx.restore();
      });
    }
    obj_shard(b) {
      const ctx = this.ctx;
      this.eachPoly(b, (s) => { shapePath(ctx, s); ctx.fillStyle = 'rgba(190,230,255,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = this.px(1); ctx.stroke(); });
    }
    obj_tramp(b) {
      const ctx = this.ctx, lw = this.lw;
      this.eachPoly(b, (s) => {
        const { x0, x1 } = polyBox(s);
        const w = x1 - x0;
        for (const sx of [x0 + 0.25, x1 - 0.25]) { ctx.beginPath(); ctx.moveTo(sx, -0.14); ctx.lineTo(sx + (sx < 0 ? -0.18 : 0.18), 0); ctx.lineWidth = 0.07 + lw; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 0.06; ctx.strokeStyle = '#8d949e'; ctx.stroke(); }
        roundRectPath(ctx, x0, -0.22, w, 0.08, 0.04); fillStroke(ctx, '#8d949e', lw);
        roundRectPath(ctx, x0 + 0.12, -0.21, w - 0.24, 0.05, 0.02); fillStroke(ctx, '#2a3c8f', lw);
        ctx.strokeStyle = '#d0d4da'; ctx.lineWidth = this.px(1.3);
        for (let x = x0 + 0.2; x < x1 - 0.15; x += 0.28) { ctx.beginPath(); ctx.moveTo(x, -0.14); ctx.lineTo(x + 0.05, -0.1); ctx.lineTo(x + 0.1, -0.14); ctx.stroke(); }
      });
    }
    obj_blade(b) {
      const ctx = this.ctx, lw = this.lw;
      const r = b.getFixtureList().getShape().m_radius;
      const n = Math.max(12, Math.round(r * 20));
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = (i + 0.55) / n * TAU;
        ctx.lineTo(Math.cos(a0) * r * 0.86, Math.sin(a0) * r * 0.86);
        ctx.lineTo(Math.cos(a1) * r * 1.0, Math.sin(a1) * r * 1.0);
      }
      ctx.closePath();
      fillStroke(ctx, '#c4cad2', lw);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fillStyle = '#9aa2ad'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, -2.4, -1.2); ctx.lineTo(0, 0); ctx.fill();
      ctx.fillStyle = '#5f6772';
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, r * 0.08, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, TAU); fillStroke(ctx, '#3d434c', lw);
    }
    obj_van(b, ud) {
      const ctx = this.ctx, lw = this.lw;
      const col = ud.style || '#d8d2c0';
      // body: box hw 1.75 hh 0.8 centred on the body; the cab (+x) has a sloped windscreen
      polyPath(ctx, [[-1.75, -0.8], [0.9, -0.8], [1.45, -0.15], [1.75, -0.05], [1.75, 0.65], [-1.75, 0.65]]);
      fillStroke(ctx, col, lw);
      ctx.fillStyle = shade(col, -0.18); ctx.fillRect(-1.75, 0.35, 3.5, 0.3);
      polyPath(ctx, [[0.95, -0.7], [1.38, -0.18], [0.95, -0.18]]); fillStroke(ctx, '#6fa8d6', lw);
      roundRectPath(ctx, 0.15, -0.7, 0.62, 0.42, 0.05); fillStroke(ctx, '#6fa8d6', lw);
      roundRectPath(ctx, -1.5, -0.62, 1.3, 0.34, 0.05); fillStroke(ctx, '#6fa8d6', lw);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0.05, -0.75); ctx.lineTo(0.05, 0.6); ctx.stroke();
      ctx.fillStyle = OUTLINE; ctx.fillRect(0.12, 0.0, 0.18, 0.05);
      ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(1.7, 0.08, 0.08, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d0242c'; ctx.fillRect(-1.78, -0.05, 0.08, 0.22);
      roundRectPath(ctx, -1.85, 0.55, 3.7, 0.12, 0.05); fillStroke(ctx, '#5a5f66', lw);
    }
    obj_vanwheel(b) { this.wheel(b.getFixtureList().getShape().m_radius, '#26262b', '#a9b0b9', 5); }

    /** A wheel in the current (body-local) frame: tyre, rim and spokes that turn with the body. */
    wheel(r, tyre, rim, spokes, hub) {
      const ctx = this.ctx, lw = this.lw;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); fillStroke(ctx, tyre, lw);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.fillStyle = rim; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, TAU); ctx.fillStyle = shade(rim, -0.35); ctx.fill();
      ctx.strokeStyle = rim; ctx.lineWidth = Math.max(r * 0.07, this.px(1.2));
      ctx.beginPath();
      for (let i = 0; i < spokes; i++) { const a = i / spokes * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * (hub || 0.16), 0, TAU); fillStroke(ctx, '#3d434c', lw);
      // a tread mark so rolling is visible even on plain tyres
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-r * 0.06, -r, r * 0.12, r * 0.18);
    }

    obj_projectile(b) {
      const ctx = this.ctx, lw = this.lw;
      capsulePath(ctx, -0.6, 0, 0.42, 0, 0.035); fillStroke(ctx, '#9aa2ad', lw);
      polyPath(ctx, [[0.38, -0.09], [0.66, 0], [0.38, 0.09], [0.44, 0]]); fillStroke(ctx, '#d3d8df', lw);
      polyPath(ctx, [[0.3, -0.03], [0.22, -0.12], [0.36, -0.03]]); fillStroke(ctx, '#d3d8df', lw);
      polyPath(ctx, [[0.3, 0.03], [0.22, 0.12], [0.36, 0.03]]); fillStroke(ctx, '#d3d8df', lw);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-0.62, -0.05, 0.14, 0.1);
    }

    drawFinish(x, y) {
      const ctx = this.ctx, lw = this.px(1.6);
      ctx.save(); ctx.translate(x, y);
      for (const sx of [-1.9, 1.9]) {
        roundRectPath(ctx, sx - 0.09, -4.8, 0.18, 4.8, 0.05); fillStroke(ctx, '#f4f4f4', lw);
        ctx.save(); roundRectPath(ctx, sx - 0.09, -4.8, 0.18, 4.8, 0.05); ctx.clip();
        ctx.fillStyle = '#d0242c'; for (let k = 0; k < 4.8; k += 0.6) ctx.fillRect(sx - 0.1, -k - 0.3, 0.2, 0.3);
        ctx.restore();
      }
      const sag = 0.18 + 0.05 * Math.sin(this.t * 2);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-1.9, -4.75); ctx.quadraticCurveTo(0, -4.75 + sag * 2, 1.9, -4.75); ctx.lineTo(1.9, -4.05); ctx.quadraticCurveTo(0, -4.05 + sag * 2, -1.9, -4.05); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.clip();
      ctx.fillStyle = '#111';
      for (let i = -10; i < 10; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) ctx.fillRect(i * 0.2, -4.75 + j * 0.2 + sag * (1 - (i * 0.2 / 1.9) ** 2), 0.2, 0.2);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-1.9, -4.75); ctx.quadraticCurveTo(0, -4.75 + sag * 2, 1.9, -4.75); ctx.lineTo(1.9, -4.05); ctx.quadraticCurveTo(0, -4.05 + sag * 2, -1.9, -4.05); ctx.closePath();
      ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
      const wave = Math.sin(this.t * 6) * 0.08;
      ctx.beginPath(); ctx.moveTo(1.9, -4.8); ctx.lineTo(1.9, -5.6); ctx.lineWidth = lw * 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1.9, -5.6); ctx.quadraticCurveTo(2.3, -5.6 + wave, 2.7, -5.45); ctx.lineTo(1.9, -5.2); ctx.closePath(); fillStroke(ctx, this.backdrop ? this.backdrop.theme.accent : '#ff8c1a', lw);
      ctx.restore();
    }

    drawSignPost(d) {
      const ctx = this.ctx, lw = this.px(1.6);
      const text = String(d.text || '');
      // long messages go on two lines, split at the space nearest the middle
      let lines = [text];
      if (text.length > 15 && text.indexOf(' ') > 0) {
        let best = -1;
        for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i;
        lines = [text.slice(0, best), text.slice(best + 1)];
      }
      const longest = Math.max(...lines.map((l) => l.length));
      const bw = Math.max(1.3, longest * 0.18 + 0.45), bh = 0.3 + lines.length * 0.34, top = -1.7 - bh;
      ctx.save(); ctx.translate(d.x, d.y);
      roundRectPath(ctx, -0.07, -1.75, 0.14, 1.75, 0.03); fillStroke(ctx, '#7a4d22', lw);
      roundRectPath(ctx, -bw / 2, top, bw, bh, 0.08); fillStroke(ctx, '#d9a65f', lw);
      ctx.fillStyle = 'rgba(255,240,200,0.3)'; ctx.fillRect(-bw / 2 + 0.06, top + 0.05, bw - 0.12, 0.06);
      ctx.restore();
      lines.forEach((l, i) => this.worldText.push({ x: d.x, y: d.y + top + 0.15 + 0.34 * (i + 0.5) + 0.02, text: l, size: 0.28, color: '#3b2208', maxW: bw - 0.2 }));
    }

    flushWorldText() {
      const ctx = this.ctx, c = this.cam;
      this.screenTransform();
      for (const t of this.worldText) {
        const sx = (t.x - c.x - c.sx) * c.zoom + this.w / 2, sy = (t.y - c.y - c.sy) * c.zoom + this.h / 2;
        let size = t.size * c.zoom;
        ctx.font = `bold ${size.toFixed(1)}px sans-serif`;
        const mw = t.maxW * c.zoom;
        const tw = ctx.measureText(t.text).width;
        if (tw > mw) { size *= mw / tw; ctx.font = `bold ${size.toFixed(1)}px sans-serif`; }
        ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t.text, sx, sy + size * 0.05);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      this.worldText.length = 0;
    }

    /* ---------------- vehicles ---------------- */
    withBody(b, fn) {
      const ctx = this.ctx, p = b.getPosition();
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(b.getAngle()); fn.call(this, b); ctx.restore();
    }
    tube(x0, y0, x1, y1, r, col) {
      const ctx = this.ctx;
      capsulePath(ctx, x0, y0, x1, y1, r);
      fillStroke(ctx, col, this.lw);
    }

    drawRide(sim) {
      const veh = sim.vehicle;
      const rds = sim.ragdolls.slice().sort((a, b) => (a.isMain ? 1 : 0) - (b.isMain ? 1 : 0));
      this.drawVehicle(veh, 'back');
      for (const rd of rds) this.drawRagdoll(rd, 'far');
      this.drawVehicle(veh, 'mid');
      for (const rd of rds) this.drawRagdoll(rd, 'body');
      for (const rd of rds) this.drawRagdoll(rd, 'near');
      this.drawVehicle(veh, 'front');
    }

    drawVehicle(veh, layer) {
      const fn = this['veh_' + veh.id];
      if (fn) fn.call(this, veh, layer);
      else if (layer === 'mid') for (const b of veh.bodies) this.withBody(b, () => this.obj_generic(b));
    }

    veh_wheelchair(veh, layer) {
      const ctx = this.ctx, lw = this.lw, f = veh.frame;
      const steel = '#a2abb6', cushion = '#2f5fb3';
      if (layer === 'back') {
        // far big wheel (a darker copy just behind the near one)
        { const wb = veh.wheelBody, wp = wb.getPosition(); ctx.save(); ctx.translate(wp.x - 0.06, wp.y - 0.035); ctx.rotate(wb.getAngle()); this.wheel(0.36, '#1d1d22', '#6d7580', 10, 0.12); ctx.restore(); }
        this.withBody(f, () => {
          // rocket canister strapped behind the backrest, nozzle pointing backwards
          if (veh.rocketOn) this.rocketFlame(-0.78, 0.14);
          polyPath(ctx, [[-0.66, 0.07], [-0.66, 0.21], [-0.8, 0.26], [-0.8, 0.02]]); fillStroke(ctx, '#3d434c', lw);
          roundRectPath(ctx, -0.67, -0.32, 0.26, 0.6, 0.1); fillStroke(ctx, '#ececec', lw);
          ctx.save(); roundRectPath(ctx, -0.67, -0.32, 0.26, 0.6, 0.1); ctx.clip();
          ctx.fillStyle = '#d0242c'; ctx.fillRect(-0.7, -0.12, 0.32, 0.07); ctx.fillRect(-0.7, 0.1, 0.32, 0.07);
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-0.48, -0.35, 0.08, 0.7);
          ctx.restore();
          polyPath(ctx, [[-0.67, -0.3], [-0.54, -0.5], [-0.41, -0.3]]); fillStroke(ctx, '#d0242c', lw);
          // backrest and push handle
          ctx.save(); ctx.translate(-0.3, -0.3); ctx.rotate(-0.1);
          roundRectPath(ctx, -0.06, -0.3, 0.12, 0.6, 0.05); fillStroke(ctx, cushion, lw);
          ctx.restore();
          this.tube(-0.36, -0.58, -0.52, -0.6, 0.03, '#2b2b30');
          // frame tubes
          this.tube(-0.26, 0.25, 0.46, 0.25, 0.025, steel);
          this.tube(-0.24, 0.03, -0.24, 0.25, 0.025, steel);
          this.tube(0.6, 0.25, 0.6, 0.8, 0.02, steel);   // caster fork
        });
        this.withBody(veh.caster, () => this.wheel(0.12, '#1d1d22', '#b8bfc8', 4, 0.25));
      } else if (layer === 'mid') {
        this.withBody(f, () => {
          roundRectPath(ctx, -0.27, -0.09, 0.62, 0.13, 0.05); fillStroke(ctx, cushion, lw);
          ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-0.22, -0.08, 0.52, 0.03);
          this.tube(0.3, 0.03, 0.52, 0.42, 0.022, steel);
          roundRectPath(ctx, 0.44, 0.41, 0.22, 0.06, 0.02); fillStroke(ctx, '#3d434c', lw);
        });
      } else {
        // near wheel: tyre, push rim and spokes, see-through so the rider stays visible
        this.withBody(veh.wheelBody, () => {
          const r = 0.36;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.arc(0, 0, r * 0.82, 0, TAU, true);
          fillStroke(ctx, '#222228', lw);
          ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU); ctx.lineWidth = 0.025; ctx.strokeStyle = '#c9ced6'; ctx.stroke();
          ctx.strokeStyle = 'rgba(200,206,214,0.85)'; ctx.lineWidth = this.px(1.4);
          ctx.beginPath();
          for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.moveTo(Math.cos(a) * 0.05, Math.sin(a) * 0.05); ctx.lineTo(Math.cos(a + 0.3) * r * 0.8, Math.sin(a + 0.3) * r * 0.8); }
          ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 0.055, 0, TAU); fillStroke(ctx, '#3d434c', lw);
        });
      }
    }

    rocketFlame(x, y) {
      const ctx = this.ctx;
      const L = 0.65 + Math.random() * 0.45, wob = (Math.random() - 0.5) * 0.06;
      ctx.save();
      const layers = [[1, 0.13, 'rgba(240,80,20,0.85)'], [0.72, 0.09, 'rgba(255,180,30,0.95)'], [0.42, 0.05, 'rgba(255,250,215,1)']];
      for (const [k, wdt, col] of layers) {
        ctx.beginPath();
        ctx.moveTo(x, y - wdt);
        ctx.quadraticCurveTo(x - L * k * 0.5, y - wdt * 1.3 + wob, x - L * k, y + wob * 2);
        ctx.quadraticCurveTo(x - L * k * 0.5, y + wdt * 1.3 + wob, x, y + wdt);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      }
      ctx.restore();
    }

    veh_scooter(veh, layer) {
      const ctx = this.ctx, lw = this.lw, d = veh.frame;
      if (layer === 'back') {
        this.withBody(veh.wheelBody, () => {
          this.wheel(0.27, '#1d1d22', '#3d434c', 5, 0.3);
          ctx.beginPath(); ctx.arc(0, 0, 0.2, 0, TAU); ctx.lineWidth = this.px(2); ctx.strokeStyle = 'rgba(56,225,255,0.8)'; ctx.stroke();
        });
        this.withBody(d, () => {
          roundRectPath(ctx, -0.32, -0.05, 0.64, 0.11, 0.04); fillStroke(ctx, '#2b2d33', lw);
          ctx.fillStyle = '#4a4d55'; ctx.fillRect(-0.28, -0.045, 0.56, 0.03);
          // mudguard over the wheel
          ctx.beginPath(); ctx.arc(0, 0.33, 0.33, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 0.045; ctx.strokeStyle = OUTLINE; ctx.stroke();
          ctx.lineWidth = 0.03; ctx.strokeStyle = '#5a5e66'; ctx.stroke();
        });
      } else if (layer === 'mid') {
        this.withBody(d, () => {
          this.tube(0.215, -0.02, 0.105, -1.1, 0.032, '#c7ccd3');
          const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
          ctx.strokeStyle = `rgba(56,225,255,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 0.018;
          ctx.beginPath(); ctx.moveTo(0.2, -0.15); ctx.lineTo(0.13, -0.85); ctx.stroke();
          this.tube(0.06, -1.1, 0.36, -1.1, 0.03, '#2b2d33');
          this.tube(0.27, -1.1, 0.37, -1.1, 0.035, '#d0242c');
        });
      }
    }

    veh_bike(veh, layer) {
      const ctx = this.ctx, lw = this.lw, f = veh.frame;
      const frameCol = '#1f8fd6', steel = '#b8bfc8';
      const crank = veh.rearWheel.getAngle() * 0.55;
      const BB = [-0.02, 0.17];
      if (layer === 'back') {
        for (const w of [veh.rearWheel, veh.frontWheel]) this.withBody(w, () => this.wheel(0.34, '#1d1d22', '#c9ced6', 14, 0.1));
        this.withBody(f, () => this.pedal(BB, crank + Math.PI, 0.65));
      } else if (layer === 'mid') {
        this.withBody(f, () => {
          const RA = [-0.62, 0.28], FA = [0.62, 0.28], ST = [-0.3, -0.18], HT = [0.5, -0.24], HB = [0.6, -0.04];
          // chain loop
          ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 0.02;
          ctx.beginPath(); ctx.moveTo(BB[0], BB[1] - 0.1); ctx.lineTo(RA[0], RA[1] - 0.05); ctx.moveTo(BB[0], BB[1] + 0.1); ctx.lineTo(RA[0], RA[1] + 0.05); ctx.stroke();
          // rack
          this.tube(-1.0, -0.3, -0.56, -0.3, 0.022, steel);
          this.tube(-0.95, -0.3, RA[0], RA[1], 0.016, steel);
          // frame tubes
          for (const [a, b] of [[RA, BB], [RA, ST], [BB, ST], [ST, HT], [BB, HB], [HT, HB]]) this.tube(a[0], a[1], b[0], b[1], 0.032, frameCol);
          this.tube(HB[0], HB[1], FA[0], FA[1], 0.026, steel);
          this.tube(-0.31, -0.18, -0.32, -0.42, 0.022, steel);
          // saddle
          ctx.beginPath(); ctx.moveTo(-0.5, -0.47); ctx.quadraticCurveTo(-0.32, -0.53, -0.14, -0.45); ctx.lineTo(-0.2, -0.42); ctx.quadraticCurveTo(-0.38, -0.41, -0.5, -0.43); ctx.closePath();
          fillStroke(ctx, '#222228', lw);
          // stem and handlebar
          this.tube(0.649, -0.133, 0.471, -0.707, 0.024, steel);
          ctx.beginPath(); ctx.moveTo(0.471, -0.707); ctx.quadraticCurveTo(0.6, -0.8, 0.68, -0.74); ctx.lineWidth = 0.05 + lw; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.lineWidth = 0.035; ctx.strokeStyle = '#2b2b30'; ctx.stroke();
          // chainring
          ctx.beginPath(); ctx.arc(BB[0], BB[1], 0.1, 0, TAU); fillStroke(ctx, '#9aa2ad', lw);
          ctx.beginPath(); ctx.arc(BB[0], BB[1], 0.05, 0, TAU); ctx.fillStyle = '#5f6772'; ctx.fill();
        });
      } else {
        this.withBody(f, () => this.pedal(BB, crank, 1));
      }
    }
    pedal(c, a, shadeK) {
      const ctx = this.ctx;
      const ex = c[0] + Math.cos(a) * 0.17, ey = c[1] + Math.sin(a) * 0.17;
      this.tube(c[0], c[1], ex, ey, 0.022, shadeK < 1 ? '#7d858f' : '#c9ced6');
      roundRectPath(ctx, ex - 0.07, ey - 0.025, 0.14, 0.05, 0.02); fillStroke(ctx, '#2b2b30', this.lw);
    }

    veh_pogo(veh, layer) {
      const ctx = this.ctx, lw = this.lw, up = veh.frame, low = veh.lower;
      if (layer === 'back') {
        this.withBody(low, () => {
          this.tube(0, -0.35, 0, 0.3, 0.026, '#6d7580');
          ctx.beginPath(); ctx.ellipse(0, 0.36, 0.085, 0.065, 0, 0, TAU); fillStroke(ctx, '#1d1d22', lw);
        });
      } else if (layer === 'mid') {
        // coil spring between the foot pegs and the plunger's collar
        const A = up.getWorldPoint(WR.physics.v(0, 0.55)), B = low.getWorldPoint(WR.physics.v(0, 0.02));
        const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
        if (L > 0.02) {
          const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, turns = 8;
          ctx.beginPath(); ctx.moveTo(A.x, A.y);
          for (let i = 1; i <= turns * 2; i++) {
            const t = i / (turns * 2), s = (i % 2 ? 1 : -1) * 0.075;
            ctx.lineTo(A.x + dx * t + nx * s, A.y + dy * t + ny * s);
          }
          ctx.lineTo(B.x, B.y);
          ctx.lineWidth = 0.035 + lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
          ctx.lineWidth = 0.025; ctx.strokeStyle = veh.charging ? '#e7c64a' : '#c9ced6'; ctx.stroke();
        }
        this.withBody(up, () => {
          this.tube(0, -0.6, 0, 0.47, 0.04, '#d0d4da');
          ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0.01, -0.58, 0.025, 1.0);
          this.tube(-0.2, -0.6, 0.2, -0.6, 0.03, '#3d434c');
          this.tube(-0.22, -0.6, -0.12, -0.6, 0.037, '#d0242c');
          this.tube(0.12, -0.6, 0.22, -0.6, 0.037, '#d0242c');
          this.tube(-0.18, 0.5, 0.18, 0.5, 0.028, '#2b2b30');
          ctx.beginPath(); ctx.arc(0, 0.47, 0.06, 0, TAU); fillStroke(ctx, '#6d7580', lw);
        });
      }
    }

    /* ---------------- riders ---------------- */
    drawRagdoll(rd, layer) {
      const P = rd.parts;
      if (layer === 'far') { for (const n of ['ulegL', 'llegL', 'uarmL', 'larmL']) this.drawPart(rd, P[n], true); }
      else if (layer === 'near') { for (const n of ['ulegR', 'llegR', 'uarmR', 'larmR']) this.drawPart(rd, P[n], false); }
      else { this.drawPart(rd, P.pelvis); this.drawPart(rd, P.torso); this.drawPart(rd, P.head); }
    }

    drawPart(rd, part, far) {
      const ctx = this.ctx, b = part.body, s = rd.scale, st = this.riderStyle(rd), lw = this.lw;
      const v = this.viewRect;
      const p = b.getPosition();
      if (v && (p.x < v.x0 - 2 || p.x > v.x1 + 2 || p.y < v.y0 - 2 || p.y > v.y1 + 2)) return;
      const tone = (c) => (far ? shade(c, -0.18) : c);
      const skin = tone(st.skin || '#f1c9a5');
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(b.getAngle());
      const G = WR.RAGDOLL_GEO;
      switch (part.base) {
        case 'uarm': { const hw = G.uarm.hw * s, hh = G.uarm.hh * s; capsulePath(ctx, 0, -hh + hw * 0.4, 0, hh - hw * 0.3, hw); fillStroke(ctx, tone(st.sleeve || st.shirt || '#c33'), lw); break; }
        case 'larm': {
          const hw = G.larm.hw * s, hh = G.larm.hh * s;
          capsulePath(ctx, 0, -hh + hw * 0.3, 0, hh - hw * 0.4, hw * 0.92); fillStroke(ctx, skin, lw);
          ctx.beginPath(); ctx.arc(0, hh, hw * 1.25, 0, TAU); fillStroke(ctx, skin, lw);
          break;
        }
        case 'uleg': { const hw = G.uleg.hw * s, hh = G.uleg.hh * s; capsulePath(ctx, 0, -hh + hw * 0.3, 0, hh - hw * 0.3, hw); fillStroke(ctx, tone(st.pants || '#336'), lw); break; }
        case 'lleg': {
          const hw = G.lleg.hw * s, hh = G.lleg.hh * s, F = G.foot;
          const fhw = F.hw * s, fhh = F.hh * s, fdx = F.dx * s, fy = hh + fhh * 0.6;
          capsulePath(ctx, 0, -hh + hw * 0.3, 0, hh - hw * 0.2, hw); fillStroke(ctx, tone(st.pants || '#336'), lw);
          ctx.beginPath();
          ctx.moveTo(fdx - fhw, fy + fhh); ctx.lineTo(fdx - fhw, fy - fhh * 0.6);
          ctx.quadraticCurveTo(fdx - fhw * 0.2, fy - fhh * 1.5, fdx + fhw * 0.45, fy - fhh * 0.6);
          ctx.quadraticCurveTo(fdx + fhw * 1.15, fy - fhh * 0.3, fdx + fhw * 1.05, fy + fhh);
          ctx.closePath();
          fillStroke(ctx, tone(st.shoes || '#333'), lw);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(fdx - fhw, fy + fhh * 0.55, fhw * 2.05, fhh * 0.45);
          break;
        }
        case 'pelvis': {
          const hw = G.pelvis.hw * s, hh = G.pelvis.hh * s;
          roundRectPath(ctx, -hw, -hh, hw * 2, hh * 2, hw * 0.55); fillStroke(ctx, st.pants || '#336', lw);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-hw * 0.95, -hh * 0.75, hw * 1.9, hh * 0.3);
          break;
        }
        case 'torso': {
          const hw = G.torso.hw * s, hh = G.torso.hh * s;
          // neck stub (covered by the head while it is attached)
          capsulePath(ctx, 0.01 * s, -hh, 0.02 * s, -hh - 0.07 * s, 0.05 * s); fillStroke(ctx, skin, lw);
          roundRectPath(ctx, -hw, -hh, hw * 2, hh * 2, hw * 0.65); fillStroke(ctx, st.shirt || '#c33', lw);
          ctx.save(); roundRectPath(ctx, -hw, -hh, hw * 2, hh * 2, hw * 0.65); ctx.clip();
          if (st.shirtPattern === 'dots') {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            for (let yy = -hh + 0.06 * s; yy < hh; yy += 0.11 * s) for (let xx = -hw + ((yy * 100 | 0) % 2 ? 0.03 : 0.08) * s; xx < hw; xx += 0.1 * s) { ctx.beginPath(); ctx.arc(xx, yy, 0.022 * s, 0, TAU); ctx.fill(); }
          }
          ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(-hw, -hh, hw * 0.55, hh * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(hw * 0.35, -hh, hw * 0.4, hh * 2);
          ctx.restore();
          break;
        }
        case 'head': {
          const big = this.cos && this.cos.bighead ? 2.4 : 1;
          if (big !== 1) ctx.scale(big, big);
          this.drawHead(rd, part, s, st, skin, big !== 1 ? lw / big : lw);
          break;
        }
        default: break;
      }
      // wounds and stumps, in the part's own frame
      for (const w of part.wounds) {
        if (w.stump) {
          ctx.beginPath(); ctx.arc(w.lx, w.ly, w.r, 0, TAU); fillStroke(ctx, '#b0101a', lw);
          ctx.beginPath(); ctx.arc(w.lx, w.ly, w.r * 0.62, 0, TAU); ctx.fillStyle = '#6e0008'; ctx.fill();
          ctx.beginPath(); ctx.arc(w.lx + w.r * 0.1, w.ly, w.r * 0.3, 0, TAU); ctx.fillStyle = '#f2ead8'; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(w.lx, w.ly, w.r, 0, TAU); ctx.fillStyle = 'rgba(140,0,12,0.85)'; ctx.fill();
          ctx.beginPath(); ctx.arc(w.lx + w.r * 0.2, w.ly - w.r * 0.2, w.r * 0.45, 0, TAU); ctx.fillStyle = 'rgba(90,0,6,0.9)'; ctx.fill();
        }
      }
      ctx.restore();
    }

    drawHead(rd, part, s, st, skin, lw) {
      const ctx = this.ctx, r = WR.RAGDOLL_GEO.head.r * s;
      const dead = !rd.alive, scared = !dead && (rd.flail > 0 || rd.flying);
      const hairCol = st.hair || '#3a2a1a';
      const hairCap = (a0, a1, outer, inner) => { ctx.beginPath(); ctx.arc(0, 0, r * outer, a0, a1); ctx.arc(0, 0, r * inner, a1, a0, true); ctx.closePath(); fillStroke(ctx, hairCol, lw); };
      // things behind the head
      if (st.hairStyle === 'curly') {
        ctx.fillStyle = hairCol;
        for (let a = 2.0; a < 5.6; a += 0.42) { ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.42, 0, TAU); fillStroke(ctx, hairCol, lw); }
      }
      if (st.hairStyle === 'pigtails') {
        for (const a of [2.6, 3.5]) { ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, r * 0.38, r * 0.24, a, 0, TAU); fillStroke(ctx, hairCol, lw); }
      }
      if (st.hairStyle === 'bun') { ctx.beginPath(); ctx.arc(Math.cos(3.75) * r * 1.0, Math.sin(3.75) * r * 1.0, r * 0.4, 0, TAU); fillStroke(ctx, hairCol, lw); }
      // head and ear
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); fillStroke(ctx, skin, lw);
      ctx.beginPath(); ctx.ellipse(-r * 0.12, r * 0.08, r * 0.17, r * 0.22, 0, 0, TAU); fillStroke(ctx, shade(skin, -0.08), lw);
      // hair on top
      switch (st.hairStyle) {
        case 'short': hairCap(2.5, 5.45, 1.06, 0.7); break;
        case 'bun': hairCap(2.4, 5.5, 1.05, 0.72); break;
        case 'pigtails': hairCap(2.3, 5.6, 1.06, 0.68); break;
        case 'curly': hairCap(2.6, 5.3, 1.02, 0.75); break;
        case 'bald': default: {
          ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 2.4, 3.1); ctx.lineWidth = r * 0.22; ctx.strokeStyle = hairCol; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.15, -r * 0.62, r * 0.25, r * 0.1, -0.3, 0, TAU); ctx.fill();
        }
      }
      const cosHat = rd.isMain && this.cos && this.cos.hat && this.cos.hat !== 'hat:none' ? this.cos.hat : null;
      if (st.helmet && !cosHat) {
        ctx.beginPath(); ctx.arc(0, 0, r * 1.13, 2.75, 6.05); ctx.closePath(); fillStroke(ctx, st.helmet, lw);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.0, 3.6, 4.6); ctx.arc(0, 0, r * 0.8, 4.6, 3.6, true); ctx.fill();
        ctx.fillStyle = '#222'; ctx.fillRect(r * 0.3, -r * 0.42, r * 0.85, r * 0.12);
      }
      if (st.hat && !cosHat) {
        ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.8); ctx.lineTo(-r * 0.05, -r * 2.1); ctx.lineTo(r * 0.45, -r * 0.88); ctx.closePath(); fillStroke(ctx, st.hat, lw);
        ctx.fillStyle = '#e8355d'; for (const [hx, hy] of [[-0.2, -1.2], [0.15, -1.05], [-0.05, -1.6]]) { ctx.beginPath(); ctx.arc(hx * r, hy * r, r * 0.09, 0, TAU); ctx.fill(); }
        ctx.beginPath(); ctx.arc(-r * 0.05, -r * 2.15, r * 0.17, 0, TAU); fillStroke(ctx, '#ffffff', lw);
      }
      // face (looks along +x of the head)
      const ex = r * 0.45, ey = -r * 0.18;
      if (dead) {
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
        const k = r * 0.16;
        ctx.beginPath(); ctx.moveTo(ex - k, ey - k); ctx.lineTo(ex + k, ey + k); ctx.moveTo(ex + k, ey - k); ctx.lineTo(ex - k, ey + k); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.22, r * (scared ? 0.3 : 0.25), 0, 0, TAU); fillStroke(ctx, '#ffffff', lw);
        // pupils follow the head's velocity
        const vel = part.body.getLinearVelocity(), a = part.body.getAngle();
        const lx = vel.x * Math.cos(a) + vel.y * Math.sin(a), ly = -vel.x * Math.sin(a) + vel.y * Math.cos(a);
        const m = Math.hypot(lx, ly) || 1, k = Math.min(1, m / 4);
        const pr = scared ? r * 0.07 : r * 0.1;
        ctx.beginPath(); ctx.arc(ex + r * 0.08 + (lx / m) * r * 0.08 * k, ey + (ly / m) * r * 0.1 * k, pr, 0, TAU); ctx.fillStyle = OUTLINE; ctx.fill();
        ctx.strokeStyle = shade(st.hair || '#3a2a1a', -0.2); ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex - r * 0.18, ey - r * (scared ? 0.42 : 0.34)); ctx.lineTo(ex + r * 0.2, ey - r * (scared ? 0.46 : 0.36)); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // nose
      if (st.clownNose) { ctx.beginPath(); ctx.arc(r * 1.0, r * 0.05, r * 0.24, 0, TAU); fillStroke(ctx, '#e62020', lw); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.03, r * 0.07, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(r * 0.98, r * 0.05, r * 0.16, r * 0.13, 0, 0, TAU); fillStroke(ctx, shade(skin, -0.06), lw); }
      // mouth
      const mx = r * 0.62, my = r * 0.48;
      if (dead) { ctx.beginPath(); ctx.moveTo(mx - r * 0.2, my + r * 0.02); ctx.lineTo(mx + r * 0.18, my - r * 0.02); ctx.lineWidth = r * 0.08; ctx.strokeStyle = OUTLINE; ctx.stroke(); }
      else if (scared) { ctx.beginPath(); ctx.ellipse(mx, my, r * 0.14, r * 0.2, 0, 0, TAU); fillStroke(ctx, '#5a1010', lw); }
      else { ctx.beginPath(); ctx.arc(mx - r * 0.02, my - r * 0.14, r * 0.22, 0.35, 2.3); ctx.lineWidth = r * 0.08; ctx.strokeStyle = OUTLINE; ctx.stroke(); }
      if (st.mustache) { ctx.beginPath(); ctx.ellipse(r * 0.68, r * 0.3, r * 0.3, r * 0.1, -0.15, 0, TAU); fillStroke(ctx, shade(st.hair || '#3a2a1a', 0.1), lw); }
      // eyewear
      if (st.glasses) { ctx.beginPath(); ctx.arc(ex, ey, r * 0.3, 0, TAU); ctx.lineWidth = r * 0.07; ctx.strokeStyle = '#3b2a1a'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(ex - r * 0.3, ey); ctx.lineTo(-r * 0.15, ey - r * 0.05); ctx.stroke(); }
      if (st.sunglasses) { roundRectPath(ctx, ex - r * 0.28, ey - r * 0.2, r * 0.62, r * 0.36, r * 0.12); fillStroke(ctx, '#15151a', lw); ctx.beginPath(); ctx.moveTo(ex - r * 0.28, ey - r * 0.05); ctx.lineTo(-r * 0.15, ey - r * 0.05); ctx.lineWidth = r * 0.07; ctx.strokeStyle = '#15151a'; ctx.stroke(); }
      if (st.goggles) {
        ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 3.3, 5.55); ctx.lineWidth = r * 0.16; ctx.strokeStyle = '#4a3a2a'; ctx.stroke();
        for (const [gx, gy] of [[0.42, -0.72], [0.72, -0.5]]) { ctx.beginPath(); ctx.arc(gx * r, gy * r, r * 0.19, 0, TAU); fillStroke(ctx, '#f0b43c', lw); }
      }
      if (cosHat) this.drawHat(cosHat, r, lw, this.cos.silhouette);
    }

    /** Cosmetic hat in the head's local frame (face along +x, top of the head at -y). Drawing only. */
    drawHat(id, r, lw, sil) {
      const ctx = this.ctx;
      const c = (col) => (sil ? '#0b0b2e' : col);
      switch (id) {
        case 'hat:party': {
          ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.78); ctx.lineTo(-r * 0.1, -r * 2.2); ctx.lineTo(r * 0.5, -r * 0.86); ctx.closePath(); fillStroke(ctx, c('#ff00ff'), lw);
          if (!sil) { ctx.save(); ctx.clip(); ctx.fillStyle = '#00ffff'; for (let k = -2; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-r, -r * (1.2 + k * 0.42)); ctx.lineTo(r, -r * (0.95 + k * 0.42)); ctx.lineTo(r, -r * (1.12 + k * 0.42)); ctx.lineTo(-r, -r * (1.37 + k * 0.42)); ctx.fill(); } ctx.restore(); }
          ctx.beginPath(); ctx.arc(-r * 0.1, -r * 2.25, r * 0.2, 0, TAU); fillStroke(ctx, c('#ffd700'), lw);
          break;
        }
        case 'hat:cone': {
          ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 0.7); ctx.lineTo(-r * 0.08, -r * 2.3); ctx.lineTo(r * 0.06, -r * 2.3); ctx.lineTo(r * 0.62, -r * 0.8); ctx.closePath(); fillStroke(ctx, c('#ff7a00'), lw);
          if (!sil) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-r * 0.42, -r * 1.25); ctx.lineTo(r * 0.43, -r * 1.3); ctx.lineTo(r * 0.33, -r * 1.6); ctx.lineTo(-r * 0.32, -r * 1.56); ctx.closePath(); ctx.fill(); }
          roundRectPath(ctx, -r * 0.85, -r * 0.82, r * 1.7, r * 0.22, r * 0.06); fillStroke(ctx, c('#ff7a00'), lw);
          break;
        }
        case 'hat:propeller': {
          ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.78, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); fillStroke(ctx, c('#2f6fd6'), lw);
          if (!sil) { ctx.fillStyle = '#ff0033'; ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.78, Math.PI * 1.35, Math.PI * 1.65); ctx.lineTo(0, -r * 0.55); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = c('#333'); ctx.fillRect(-r * 0.04, -r * 1.55, r * 0.08, r * 0.3);
          const spin = Math.cos(this.t * 30);
          ctx.beginPath(); ctx.ellipse(0, -r * 1.58, r * 0.8 * Math.abs(spin) + r * 0.08, r * 0.1, 0, 0, TAU); fillStroke(ctx, c('#ffd700'), lw);
          break;
        }
        case 'hat:tophat': {
          roundRectPath(ctx, -r * 0.5, -r * 2.0, r * 1.0, r * 1.2, r * 0.06); fillStroke(ctx, c('#15151a'), lw);
          if (!sil) { ctx.fillStyle = '#ff00ff'; ctx.fillRect(-r * 0.5, -r * 1.05, r * 1.0, r * 0.18); }
          roundRectPath(ctx, -r * 0.85, -r * 0.92, r * 1.7, r * 0.16, r * 0.08); fillStroke(ctx, c('#15151a'), lw);
          break;
        }
        case 'hat:horns': {
          for (const sgn of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(sgn * r * 0.55, -r * 0.75); ctx.quadraticCurveTo(sgn * r * 1.45, -r * 0.9, sgn * r * 1.3, -r * 1.85); ctx.quadraticCurveTo(sgn * r * 1.05, -r * 1.15, sgn * r * 0.35, -r * 1.02); ctx.closePath(); fillStroke(ctx, c('#f4ead0'), lw);
          }
          ctx.beginPath(); ctx.arc(0, -r * 0.45, r * 0.85, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); fillStroke(ctx, c('#9aa4b0'), lw);
          break;
        }
        case 'hat:crown': {
          ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 0.8); ctx.lineTo(-r * 0.7, -r * 1.75); ctx.lineTo(-r * 0.32, -r * 1.3); ctx.lineTo(0, -r * 1.95); ctx.lineTo(r * 0.32, -r * 1.3); ctx.lineTo(r * 0.7, -r * 1.75); ctx.lineTo(r * 0.62, -r * 0.8); ctx.closePath(); fillStroke(ctx, c('#ffd700'), lw);
          if (!sil) for (const [jx, jc] of [[-0.35, '#ff0033'], [0, '#00ffff'], [0.35, '#00ff00']]) { ctx.beginPath(); ctx.arc(jx * r, -r * 1.05, r * 0.12, 0, TAU); ctx.fillStyle = jc; ctx.fill(); }
          break;
        }
        case 'hat:halo': {
          const bob = Math.sin(this.t * 3) * r * 0.1;
          ctx.save();
          if (!sil && !prefs().performance) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12; }
          ctx.beginPath(); ctx.ellipse(0, -r * 1.75 + bob, r * 0.8, r * 0.24, 0, 0, TAU); ctx.lineWidth = r * 0.16; ctx.strokeStyle = c('#ffe866'); ctx.stroke();
          ctx.restore();
          break;
        }
        default: break;
      }
    }

    /**
     * The style a ragdoll is drawn with: its own colours, with the equipped skin on the main rider, all white during a
     * hit flash, or a dark silhouette for locked items in the collection. Drawing only; rd.style is never changed.
     */
    riderStyle(rd) {
      const base = rd.style || {}, cos = this.cos;
      if (!cos || !rd.isMain) return base;
      if (cos.silhouette) return SILHOUETTE;
      if (cos.flash) return FLASH;
      const skin = cos.skin && WR.meta && WR.meta.BY_ID[cos.skin];
      if (!skin || (!skin.colors && !skin.holo)) return base;
      if (this.styleCacheKey !== skin.id + '|' + rd.name + (skin.holo ? '|' + Math.floor(this.t * 20) : '')) {
        this.styleCacheKey = skin.id + '|' + rd.name + (skin.holo ? '|' + Math.floor(this.t * 20) : '');
        let cols = skin.colors;
        if (skin.holo) {
          const h = (this.t * 90) % 360;
          cols = { shirt: `hsl(${h},100%,60%)`, sleeve: `hsl(${(h + 40) % 360},100%,65%)`, pants: `hsl(${(h + 180) % 360},90%,55%)`, shoes: `hsl(${(h + 90) % 360},100%,70%)`, helmet: `hsl(${(h + 270) % 360},100%,60%)` };
        }
        this.styleCache = Object.assign({}, base, cols);
        if (!base.helmet) delete this.styleCache.helmet;
      }
      return this.styleCache;
    }

    /* ---------------- blood and effects ---------------- */
    drawStains(sim, v) {
      const ctx = this.ctx, st = sim.gore.stains;
      ctx.beginPath();
      let n = 0;
      for (let i = 0; i < st.length; i++) {
        const s = st[i];
        if (s.x < v.x0 || s.x > v.x1 || s.y < v.y0 || s.y > v.y1) continue;
        ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, TAU); n++;
      }
      if (n) { ctx.fillStyle = 'rgba(125,0,12,0.82)'; ctx.fill(); }
    }

    drawParticles(sim, v) {
      const ctx = this.ctx, ps = sim.gore.particles;
      // nexus particle scale: draw a stable subset (chosen by each particle's random life); the sim's lists are not touched
      const ps0 = prefs().particles, thin = ps0 < 1;
      ctx.beginPath();
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
        if (thin && !keepParticle(p.life, ps0)) continue;
        ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, TAU);
      }
      ctx.fillStyle = '#b0061c'; ctx.fill();
      const fx = sim.gore.fx;
      // smoke and glass first (normal blending), then fire, flame and sparks (additive)
      for (let i = 0; i < fx.length; i++) {
        const p = fx[i];
        if (p.x < v.x0 || p.x > v.x1) continue;
        if (thin && !keepParticle(p.life, ps0)) continue;
        const a = p.t / p.life;
        if (p.kind === 'smoke') { ctx.fillStyle = `rgba(70,68,72,${0.38 * (1 - a)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
        else if (p.kind === 'glass') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(200,235,255,${0.85 * (1 - a)})`; ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
          ctx.restore();
        }
      }
      for (let i = 0; i < fx.length; i++) {
        const p = fx[i];
        if (p.x < v.x0 || p.x > v.x1) continue;
        if (thin && !keepParticle(p.life, ps0)) continue;
        const a = p.t / p.life;
        if (p.kind === 'fire') {
          const c = a < 0.2 ? [255, 244, 190] : (a < 0.5 ? [255, 168, 40] : (a < 0.75 ? [226, 74, 24] : [90, 60, 55]));
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.9 * (1 - a * a)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        } else if (p.kind === 'flame') {
          ctx.fillStyle = `rgba(255,${(214 - 140 * a) | 0},${(70 - 50 * a) | 0},${0.85 * (1 - a)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - a * 0.4), 0, TAU); ctx.fill();
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < fx.length; i++) {
        const p = fx[i];
        if (p.x < v.x0 || p.x > v.x1) continue;
        if (thin && !keepParticle(p.life, ps0)) continue;
        const a = p.t / p.life;
        if (p.kind === 'spark') {
          ctx.strokeStyle = `rgba(255,230,150,${1 - a})`; ctx.lineWidth = this.px(2);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* ---------------- the game frame ---------------- */
    drawGame(sim, game, dt) {
      this.t += dt || 0;
      this.frameDt = Math.min(dt || 0.016, 0.1);
      this.inMenu = false;
      this.frozen = !!game.userPaused;
      // how long the rider has been nearly still during a live run (drives the "Press R" hint in the HUD)
      if (this.stillSim !== sim) { this.stillSim = sim; this.stillFor = 0; }
      if (sim.status === 'playing' && !this.frozen) {
        const tv = sim.focusBody().getLinearVelocity();
        this.stillFor = Math.hypot(tv.x, tv.y) < 0.4 ? this.stillFor + (dt || 0) : 0;
      } else if (sim.status !== 'playing') this.stillFor = 0;
      this.mouse = game.mouse;
      this.hits = [];
      this.worldText = this.worldText || [];
      this.juice = game.juice && game.juice.sim === sim ? game.juice : null;
      this.cos = this.cosFor ? this.cosFor(game, this.juice) : null;
      const key = sim.level.id || sim.level.name;
      if (!this.backdrop || this.levelKey !== key || this.camSim !== sim) { this.camSim = sim; this.onLevelStart(sim); }
      this.indexHazards(sim);
      this.updateCamera(sim, Math.min(dt || 0.016, 0.05));
      this.drawSky(this.backdrop, this.cam.x, this.cam.y, this.cam.zoom);
      this.worldTransform();
      this.zoomNow = this.cam.zoom;
      this.lw = this.px(1.6);
      const v = this.view(2);
      this.viewRect = v;
      this.drawTerrain(sim, v);
      this.drawObjects(sim, v);
      this.drawStains(sim, v);
      if (this.juice && this.drawTokens) this.drawTokens(this.juice, v);
      if (this.juice && this.drawTrail) this.drawTrail(this.juice, sim);
      this.lw = this.px(1.6);
      this.drawRide(sim);
      this.drawParticles(sim, v);
      if (this.juice && this.drawJuiceParts) this.drawJuiceParts(this.juice, v);
      this.viewRect = null;
      this.flushWorldText();
      if (this.drawScreenFx) this.drawScreenFx(sim, game, dt || 0.016);
      this.drawHUD(sim, game);
      this.drawOverlay(sim, game, dt || 0.016);
      this.drawError();
    }

    /* ---------------- HUD ---------------- */
    text(str, x, y, size, color, align, weight, font) {
      const ctx = this.ctx;
      ctx.font = `${weight || 'bold'} ${size}px ${font || 'sans-serif'}`;
      ctx.textAlign = align || 'left';
      ctx.fillStyle = color || '#fff';
      ctx.fillText(str, x, y);
    }
    panel(x, y, w, h, r, fill, stroke) {
      const ctx = this.ctx;
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = fill || 'rgba(16,18,28,0.62)'; ctx.fill();
      if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    fmtTime(t) {
      if (t == null || !isFinite(t)) return '--:--.-';
      const m = Math.floor(t / 60), s = t - m * 60;
      return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
    }
    shortName(def) { return String(def.name).split(' & ')[0]; }

    drawError() {
      if (!WR.lastError && !WR.debugText) return;
      this.screenTransform();
      const ctx = this.ctx;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      if (WR.debugText) {
        const tw = Math.min(this.w - 20, ctx.measureText(WR.debugText).width + 16);
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(10, this.h / 2 + 14, tw, 30);
        ctx.fillStyle = '#ffffff'; ctx.fillText(WR.debugText, 18, this.h / 2 + 34);
      }
      if (!WR.lastError) return;
      const msg = 'ERROR: ' + WR.lastError;
      const tw = Math.min(this.w - 20, ctx.measureText(msg).width + 16);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(10, this.h / 2 - 22, tw, 30);
      ctx.fillStyle = '#ff3b30'; ctx.fillText(msg, 18, this.h / 2 - 2);
    }

    causeText(c) {
      const map = {
        head: 'fatal head injury', trauma: 'too many injuries at once', crushed: 'crushed', decapitated: 'decapitated',
        'torn in half': 'torn in half', 'blood loss': 'blood loss', 'blown up': 'blown up', 'fell out of the world': 'fell into the abyss',
        'sawn in half': 'sawn in half', 'impaled through the head': 'impaled through the head', 'harpooned through the head': 'harpooned through the head',
      };
      return 'Cause of death: ' + (map[c] || c || 'unknown');
    }
    hitTest(game, x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const r = this.hits[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.hit;
      }
      return null;
    }

    /* ---------------- menus ---------------- */
    ensurePreviews(game) {
      if (this.previews) return;
      const level = { id: 'preview', name: 'preview', start: [2, 0], ground: [[[-6, 0], [12, 0]]], objects: [] };
      this.previews = game.chars.map((def) => {
        try {
          const sim = new WR.Sim({ level, character: def, seed: 7 });
          for (let i = 0; i < 40; i++) sim.update(1 / 60, WR.vehicles.NO_INPUT);
          return sim;
        } catch (e) { WR.lastError = 'preview: ' + e.message; return null; }
      });
    }

    /** Draw a ride (vehicle and riders) fitted into a screen rectangle. */
    drawPreview(sim, rx, ry, rw, rh, maxScale, alignBottom) {
      if (!sim) return;
      const ctx = this.ctx;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const bodies = sim.vehicle.bodies.concat(...sim.ragdolls.map((r) => r.allBodies()));
      for (const b of bodies) { const p = b.getPosition(); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      x0 -= 0.5; x1 += 0.5; y0 -= 0.45; y1 += 0.45;
      const sc = Math.min(rw / (x1 - x0), rh / (y1 - y0), maxScale || 90);
      const cx = rx + rw / 2, cy = alignBottom ? ry + rh - (y1 - y0) / 2 * Math.min(rw / (x1 - x0), rh / (y1 - y0), maxScale || 90) : ry + rh / 2;
      const d = this.dpr;
      // ground shadow
      this.screenTransform();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(cx, cy + (y1 - (x0 + x1) * 0 - (y0 + y1) / 2) * sc - 6, (x1 - x0) * sc * 0.42, 7, 0, 0, TAU); ctx.fill();
      ctx.setTransform(d * sc, 0, 0, d * sc, d * (cx - (x0 + x1) / 2 * sc), d * (cy - (y0 + y1) / 2 * sc));
      const saveZoom = this.zoomNow;
      this.zoomNow = sc; this.lw = this.px(1.6); this.viewRect = null;
      this.drawRide(sim);
      this.zoomNow = saveZoom;
      this.screenTransform();
    }

    wrap(text, maxW, size, weight) {
      const ctx = this.ctx;
      ctx.font = `${weight || 'normal'} ${size}px sans-serif`;
      const words = String(text).split(/\s+/), lines = [];
      let line = '';
      for (const wd of words) {
        const t = line ? line + ' ' + wd : wd;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t;
      }
      if (line) lines.push(line);
      return lines;
    }

  }

  // shared with src/fx.js and src/screens.js, which add the effects, HUD, overlays and menus to Render.prototype
  Render.helpers = { roundRectPath, capsulePath, polyPath, fillStroke, shade, mix, rgba, parseColor, hash, OUTLINE, TAU, DEFAULT_THEME, prefs, keepParticle };
  WR.Render = Render;
})();
