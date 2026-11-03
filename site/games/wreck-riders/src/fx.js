/* Wreck Riders - render-side juice (browser only; adds methods to WR.Render.prototype, load after render.js).
 * Coin tokens, cosmetic trails, sparkles, pop-up text, coins flying to the HUD counter, the confetti burst and the disco
 * modifier's lights. Everything here is drawing: nothing touches the sim or its bodies.
 * Confetti copies canvas-confetti's model as the site uses it (80 particles, or 180 for the best result; start velocity 34
 * px per tick, decay 0.9, gravity 3 px per tick, 200 ticks) with its default colours. */
(function () {
  const WR = window.WR;
  const R = WR.Render.prototype;
  const { TAU, prefs } = WR.Render.helpers;
  const CONFETTI_COLORS = ['#26ccff', '#a25afc', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'];
  const RAINBOW = ['#ff0000', '#ff8800', '#ffee00', '#00ff00', '#00ffff', '#0088ff', '#ff00ff'];
  const DISPLAY = 'Impact, "Haettenschweiler", "Arial Black", sans-serif';   // only used if screens.js is absent
  const easeOutBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  R.easeOutBack = easeOutBack;

  /** Cosmetics and modifier flags for this frame (read by drawPart / drawHead / drawTrail). */
  R.cosFor = function (game, juice) {
    const eq = (game && game.meta && game.meta.equip) || {};
    const mod = (juice && juice.mod) || (game && game.previewMod) || null;
    return { skin: eq.skin, trail: eq.trail, hat: eq.hat, bighead: !!(mod && mod.id === 'bighead'), disco: !!(mod && mod.id === 'disco'), flash: !!(juice && juice.flash > 0) && prefs().flashes, silhouette: false };   // no white hit flash when flashes are off
  };

  /** World to screen pixels with the current camera. */
  R.toScreen = function (x, y) {
    const c = this.cam;
    return [this.w / 2 + (x - c.x - c.sx) * c.zoom, this.h / 2 + (y - c.y - c.sy) * c.zoom];
  };

  R.starPath = function (ctx, x, y, r, points, inner, rot) {
    const n = points || 5, ri = r * (inner || 0.45);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (rot || -Math.PI / 2) + i * Math.PI / n, rr = i % 2 ? ri : r;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  };

  /** A gold coin token (world units). spin 1..-1 squashes it horizontally. */
  R.coinShape = function (ctx, x, y, r, spin, lw) {
    const sx = Math.max(0.12, Math.abs(spin));
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#c99700'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#1b1a22'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.fillStyle = '#ffd700'; ctx.fill();
    this.starPath(ctx, 0, r * 0.04, r * 0.5, 5, 0.45); ctx.fillStyle = '#fff3a0'; ctx.fill();
    ctx.restore();
  };

  R.drawTokens = function (juice, v) {
    const ctx = this.ctx, lw = this.px(1.6);
    for (const tk of juice.tokens) {
      if (tk.x < v.x0 - 1 || tk.x > v.x1 + 1 || tk.y < v.y0 - 1 || tk.y > v.y1 + 1) continue;
      if (tk.taken) {
        if (tk.t > 0.35) continue;
        const k = tk.t / 0.35;
        ctx.globalAlpha = 1 - k;
        this.coinShape(ctx, tk.x, tk.y - k * 0.8, 0.32 * (1 + k * 0.8), 1, lw);
        ctx.globalAlpha = 1;
        continue;
      }
      const bob = WR.reducedMotion ? 0 : Math.sin(this.t * 3 + tk.phase) * 0.08;
      const spin = WR.reducedMotion ? 1 : Math.cos(this.t * 3.2 + tk.phase);
      if (!prefs().performance) {   // performance mode: no glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(tk.x, tk.y + bob, 0, tk.x, tk.y + bob, 0.7);
        g.addColorStop(0, 'rgba(255,215,0,0.45)'); g.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tk.x, tk.y + bob, 0.7, 0, TAU); ctx.fill();
        ctx.restore();
      }
      this.coinShape(ctx, tk.x, tk.y + bob, 0.32, spin, lw);
    }
  };

  /** The equipped trail behind the ride (world units), from the vehicle frame's recent positions. */
  R.drawTrail = function (juice, sim) {
    const cos = this.cos, id = cos && cos.trail;
    const pts = juice.trail;
    if (!id || id === 'trail:none' || pts.length < 3) return;
    const ctx = this.ctx, n = pts.length;
    const off = 0.35;   // a little below the seat/deck
    const moving = Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y) > 0.6;
    if (!moving) return;
    ctx.save();
    if (id === 'trail:rainbow') {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let b = 0; b < RAINBOW.length; b++) {
        ctx.strokeStyle = RAINBOW[b]; ctx.lineWidth = 0.075;
        for (let i = 1; i < n; i++) {
          ctx.globalAlpha = (i / n) * 0.85;
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y + off - 0.22 + b * 0.07);
          ctx.lineTo(pts[i].x, pts[i].y + off - 0.22 + b * 0.07);
          ctx.stroke();
        }
      }
    } else if (id === 'trail:sparkle') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i += 2) {
        const k = i / n, tw = prefs().flashes ? 0.5 + 0.5 * Math.sin(this.t * 14 + i * 1.7) : 0.75;   // no twinkle when flashes are off
        ctx.globalAlpha = k * (0.4 + tw * 0.6);
        this.starPath(ctx, pts[i].x + Math.sin(i * 2.3) * 0.25, pts[i].y + off + Math.cos(i * 1.9) * 0.25, 0.08 + 0.12 * tw * k, 4, 0.3, this.t * 2);
        ctx.fillStyle = ['#ffffff', '#ffd700', '#00ffff', '#ff00ff'][i % 4]; ctx.fill();
      }
    } else if (id === 'trail:flame') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const k = i / n, age = 1 - k;
        const c = age < 0.25 ? [255, 244, 190] : (age < 0.55 ? [255, 168, 40] : [226, 74, 24]);
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.55 * k})`;
        ctx.beginPath(); ctx.arc(pts[i].x + Math.sin(this.t * 20 + i) * 0.04, pts[i].y + off - age * 0.25, 0.1 + age * 0.28, 0, TAU); ctx.fill();
      }
    } else if (id === 'trail:ghost') {
      if (!prefs().performance) { ctx.shadowColor = '#00ff00'; ctx.shadowBlur = 10; }
      for (let i = 0; i < n; i += 3) {
        const k = i / n;
        ctx.globalAlpha = k * 0.7;
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = this.px(2);
        const s = 0.18 + k * 0.12;
        ctx.strokeRect(pts[i].x - s, pts[i].y + off - s, s * 2, s * 2);
      }
    } else if (id === 'trail:stars') {
      for (let i = 0; i < n; i += 3) {
        const k = i / n;
        ctx.globalAlpha = k;
        this.starPath(ctx, pts[i].x, pts[i].y + off - 0.1, 0.1 + k * 0.16, 5, 0.45, this.t * 3 + i);
        ctx.fillStyle = i % 2 ? '#ffd700' : '#ffffff'; ctx.fill();
        ctx.lineWidth = this.px(1.2); ctx.strokeStyle = '#000033'; ctx.stroke();
      }
    }
    ctx.restore();
  };

  /** Juice sparkles and cartoon blood drops (world units). */
  R.drawJuiceParts = function (juice, v) {
    const ctx = this.ctx;
    ctx.save();
    for (const p of juice.parts) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, a);
      if (p.kind === 'drop') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fillStyle = '#e0001b'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x - p.s * 0.3, p.y - p.s * 0.3, p.s * 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
      } else {
        this.starPath(ctx, p.x, p.y, p.s * (0.6 + 0.4 * a), 4, 0.28, p.rot);
        ctx.fillStyle = p.c; ctx.fill();
      }
    }
    ctx.restore();
  };

  /** Outlined Impact text that pops in (1.6 -> 1 with overshoot) and fades. Screen pixels. */
  R.popText = function (text, x, y, size, color, t, life, rainbow) {
    const ctx = this.ctx;
    const p = Math.min(1, t / 0.22);
    const sc = WR.reducedMotion ? 1 : 1.6 - 0.6 * easeOutBack(p);
    const a = t > life * 0.7 ? Math.max(0, 1 - (t - life * 0.7) / (life * 0.3)) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y); ctx.scale(sc, sc);
    if (this.font) this.font(size, 'display'); else ctx.font = `${size}px ${DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = '#000';
    ctx.strokeText(text, 0, 0);
    if (rainbow) {
      const wdt = ctx.measureText(text).width, ph = (this.t * 0.5) % 1;
      const g = ctx.createLinearGradient(-wdt / 2 - ph * 2 * wdt, 0, -wdt / 2 - ph * 2 * wdt + 4 * wdt, 0);
      for (let i = 0; i < 16; i++) g.addColorStop(i / 15, RAINBOW[i % RAINBOW.length]);
      ctx.fillStyle = g;
    } else ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  };

  /** Screen-space effects over the world: pop-ups, coins flying to the counter, disco lights, confetti. */
  R.drawScreenFx = function (sim, game, dt) {
    const ctx = this.ctx, juice = this.juice;
    this.screenTransform();
    if (this.cos && this.cos.disco) this.drawDisco();
    if (juice) {
      const ui = this.uiScale();
      for (const p of juice.popups) {
        const [sx, sy] = this.toScreen(p.x, p.y);
        this.popText(p.text, sx, sy, Math.round(p.size * ui), p.color, p.t, p.life, p.rainbow);
      }
      if (this.flyerSim !== sim) { this.flyerSim = sim; this.flyers = []; this.coinBump = 0; }
      while (juice.pickups.length) {
        const pk = juice.pickups.shift();
        const [sx, sy] = this.toScreen(pk.x, pk.y);
        this.flyers.push({ x0: sx, y0: sy, t: 0 });
      }
      const tgt = this.coinHud || { x: this.w - 60, y: 30 };
      for (const f of this.flyers) {
        f.t += dt;
        const k = Math.max(0, Math.min(1, f.t / 0.55)), e = k * k * (3 - 2 * k);
        const cx = (f.x0 + tgt.x) / 2, cy = Math.min(f.y0, tgt.y) - 80;
        const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * cx + e * e * tgt.x;
        const y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * cy + e * e * tgt.y;
        this.coinShape(ctx, x, y, 11 * ui * (1 - 0.3 * e), Math.cos(f.t * 12), 1.5);
        if (k >= 1 && !f.done) { f.done = true; this.coinBump = 1; }
      }
      this.flyers = this.flyers.filter((f) => !f.done);
      this.coinBump = Math.max(0, (this.coinBump || 0) - dt * 4);
    }
  };

  R.drawDisco = function () {
    const ctx = this.ctx, w = this.w, h = this.h, t = WR.reducedMotion ? 0 : this.t;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cols = ['255,0,255', '0,255,255', '0,255,0', '255,215,0', '255,0,51'];
    for (let i = 0; i < 5; i++) {
      const x = w * (0.5 + 0.42 * Math.sin(t * (0.7 + i * 0.13) + i * 1.3)), y = h * (0.45 + 0.4 * Math.cos(t * (0.9 + i * 0.11) + i * 2.1));
      const r = Math.min(w, h) * 0.35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${cols[i]},0.22)`); g.addColorStop(1, `rgba(${cols[i]},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  };

  /* ---------- confetti (screen pixels) ---------- */
  R.confettiBurst = function (x, y, count, spread) {
    this.confetti = this.confetti || [];
    const n = Math.round(count * Math.max(0, prefs().particles));   // nexus particle scale (reduced motion caps it at 0.25)
    const sp = (spread || 75) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * sp;
      this.confetti.push({
        x, y, a: ang, v: 34 * (0.5 + Math.random() * 0.5) * (this.h / 900 + 0.3), tick: 0, life: 200,
        c: CONFETTI_COLORS[i % CONFETTI_COLORS.length], wob: Math.random() * 10, ws: 0.05 + Math.random() * 0.06, tilt: Math.random() * Math.PI,
        sq: Math.random() < 0.5, s: 7 + Math.random() * 4,
      });
    }
  };
  R.drawConfettiFx = function (dt) {
    if (!this.confetti || !this.confetti.length) return;
    const ctx = this.ctx;
    this.confettiAcc = (this.confettiAcc || 0) + Math.min(dt, 0.1);
    let steps = 0;
    while (this.confettiAcc >= 1 / 60 && steps < 6) { this.confettiAcc -= 1 / 60; steps++; }
    for (const p of this.confetti) {
      for (let s = 0; s < steps; s++) {
        p.x += Math.cos(p.a) * p.v; p.y += Math.sin(p.a) * p.v + 3; p.v *= 0.9;
        p.wob += p.ws; p.tilt += 0.1; p.tick++;
      }
      const a = 1 - p.tick / p.life;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      const wx = p.x + 10 * Math.cos(p.wob), wy = p.y + 10 * Math.sin(p.wob);
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(p.tilt);
      if (p.sq) { ctx.scale(1, Math.abs(Math.sin(p.tilt * 0.7)) + 0.2); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); }
      else { ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.6, p.s * 0.6 * (Math.abs(Math.cos(p.tilt)) + 0.2), 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.confetti = this.confetti.filter((p) => p.tick < p.life && p.y < this.h + 40);
  };

  R.uiScale = function () { return Math.max(0.7, Math.min(1.6, Math.min(this.w / 1280, this.h / 720))); };
})();
