/* Wreck Riders - stoinly.computer-style screens (browser only; adds methods to WR.Render.prototype, load after fx.js).
 * HUD, pause / crash / finish overlays, title, rider select, course select, collection and daily challenge.
 * Values copied from the stoinly.computer source (style.css, cards.css; see docs/design/flashy-style-spec.md):
 * starfield #000033 with six dots per 160 px tile, rainbow wordmark, Courier tickers with lime borders, the 8 px rainbow rule,
 * ridge-bordered panels, outset "goblin" buttons, steps(1) 1.1 s blink, foil sheen and Impact / Comic Sans / Courier fonts.
 *   render.drawTitle|drawSelect|drawLevels|drawCollection|drawDaily(game, dt)
 *   render.pressAt(x, y) / render.releaseAt(x, y) -> hit (buttons squash on press and overshoot on release)
 * Hit types: goto{to}, char{index,confirm}, level{index}, start, restart, next, menu, resume, dailyPlay, chest, tab{kind}, item{id},
 * nexus (the "◄ NEXUS" button, drawn on the title and pause screens when game.fromNexus). */
(function () {
  const WR = window.WR;
  const R = WR.Render.prototype;
  const { roundRectPath, shade, mix, rgba, TAU, prefs } = WR.Render.helpers;
  const perf = () => prefs().performance;   // nexus performance mode: no glow or shadow blur
  /** On-screen name of the first key bound to an action (nexus rebinding; defaults give the original labels). */
  const KEY_DEFAULT = { confirm: 'ENTER', back: 'ESC', restart: 'R', pause: 'P', mute: 'M', daily: 'D', collection: 'C', chest: 'O', tabNext: 'TAB', tabPrev: 'Q', menuUp: 'UP', menuDown: 'DOWN', menuLeft: 'LEFT', menuRight: 'RIGHT' };
  const K = (id) => (WR.Prefs && WR.prefs && WR.prefs.keys ? WR.Prefs.keyFor(id) : KEY_DEFAULT[id]);
  /** True when every listed action still has its default keys (then the original hint text is shown unchanged). */
  const keysDefault = (ids) => !WR.Prefs || !WR.prefs || !WR.prefs.keys || ids.every((id) => String(WR.prefs.keys[id]) === String(WR.Prefs.BY_ID[id].defaults));
  /** Extra line listing the ride keys when the player has rebound them (rider control text in vehicles.js names the defaults). */
  const rideKeysLine = () => (WR.Prefs && WR.prefs && WR.prefs.keys && !WR.Prefs.rideKeysDefault() ? 'YOUR KEYS: ' + WR.Prefs.rideKeysText() : null);
  const F = {
    display: 'Impact, "Haettenschweiler", "Arial Black", sans-serif',
    body: '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive, sans-serif',
    mono: '"Courier New", monospace',
  };
  const C = { hot: '#ff00ff', cyan: '#00ffff', lime: '#00ff00', gold: '#ffd700', red: '#ff0033', navy: '#000033' };
  const RAINBOW = ['#ff0000', '#ff8800', '#ffee00', '#00ff00', '#00ffff', '#0088ff', '#ff00ff', '#ff0000'];
  const STRIPES = ['#ff0000', '#ff8800', '#ffee00', '#00ff00', '#00ffff', '#ff00ff'];
  const BTN = {   // .goblin-btn and its variants
    blue: { bg: '#000066', border: '#6666ff' },
    hot: { bg: '#660033', border: C.hot },
    go: { bg: '#003300', border: C.lime },
    gold: { bg: '#332200', border: C.gold },
  };
  const RARITY = { common: C.cyan, rare: '#6666ff', holo: C.gold, ultra: C.hot };
  const STARS_DOTS = [[18, 22, 1.5, '#ffffff'], [72, 48, 1, '#a0d0ff'], [110, 92, 1.5, '#ffffff'], [44, 118, 1, '#ffe0a0'], [136, 12, 1, '#ffffff'], [96, 140, 1.5, '#ffffff']];
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const easeOutBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const elastic = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI) / 3) + 1);
  R.F = F; R.C = C;

  /* ================= kit ================= */
  R.blinkOn = function (delay) {
    if (WR.reducedMotion || !prefs().flashes) return true;   // no blinking under reduced motion or with flashes off
    const p = (((this.t + (delay || 0)) % 1.1) + 1.1) % 1.1 / 1.1;
    return p < 0.67;
  };
  /** The site's display stack is Impact, Haettenschweiler, Arial Black. When none of the three is installed (this happens on
   * many Linux machines) the browser would fall back to a thin sans-serif, so a bold narrow face stands in instead. */
  R.ensureFonts = function () {
    if (F.checked) return;
    F.checked = true;
    const ctx = this.ctx, probe = 'WRECK RIDERS 0123 wmil';
    ctx.font = '64px monospace'; const base = ctx.measureText(probe).width;
    const has = (fam) => { ctx.font = `64px "${fam}", monospace`; return Math.abs(ctx.measureText(probe).width - base) > 0.5; };
    if (!has('Impact') && !has('Haettenschweiler') && !has('Arial Black')) {
      F.display = '"Nimbus Sans Narrow", "Arial Narrow", "Liberation Sans Narrow", "Ubuntu Condensed", sans-serif';
      F.displayWeight = 'bold';
    }
  };
  R.font = function (size, kind, weight) {
    if (!F.checked) this.ensureFonts();
    // nexus text scale: every canvas UI font goes through here (big titles grow less, see WR.Prefs.textSize)
    const px = WR.Prefs ? WR.Prefs.textSize(size) : size;
    this.ctx.font = `${weight || (kind === 'display' ? (F.displayWeight || 'normal') : 'bold')} ${Math.round(px)}px ${F[kind || 'body']}`;
  };
  /** Text with optional letter spacing, glow, hard shadow and outline. align: 'left'|'center'|'right'. */
  R.txt = function (str, x, y, size, color, align, kind, o) {
    const ctx = this.ctx; o = o || {};
    str = String(str);
    this.font(size, kind, o.weight);
    ctx.textAlign = 'left'; ctx.textBaseline = o.baseline || 'alphabetic';
    const sp = o.spacing || 0;
    const chars = sp ? str.split('') : null;
    const widths = sp ? chars.map((ch) => ctx.measureText(ch).width) : null;
    const total = sp ? widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1) : ctx.measureText(str).width;
    const x0 = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
    const draw = (fn, dx, dy) => {
      if (!sp) { fn(str, x0 + dx, y + dy); return; }
      let cx = x0 + dx;
      for (let i = 0; i < chars.length; i++) { fn(chars[i], cx, y + dy); cx += widths[i] + sp; }
    };
    ctx.save();
    // layer order matches the CSS filter chain: the glow sits behind the hard shadow, the outline and the fill
    if (o.glow && !perf()) {
      ctx.save(); ctx.shadowColor = o.glow; ctx.shadowBlur = o.blur || 10; ctx.fillStyle = color || '#fff';
      if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.stroke[0]; ctx.strokeStyle = o.glow; draw((s, a, b) => ctx.strokeText(s, a, b), 0, 0); }
      draw((s, a, b) => ctx.fillText(s, a, b), 0, 0);
      ctx.restore();
    }
    if (o.shadow) {
      ctx.fillStyle = o.shadow[2]; draw((s, a, b) => ctx.fillText(s, a, b), o.shadow[0], o.shadow[1]);
      if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.stroke[0]; ctx.strokeStyle = o.shadow[2]; draw((s, a, b) => ctx.strokeText(s, a, b), o.shadow[0], o.shadow[1]); }
    }
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.stroke[0]; ctx.strokeStyle = o.stroke[1]; draw((s, a, b) => ctx.strokeText(s, a, b), 0, 0); }
    ctx.fillStyle = color || '#fff';
    draw((s, a, b) => ctx.fillText(s, a, b), 0, 0);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    return total;
  };
  R.measure = function (str, size, kind, spacing, weight) {
    this.font(size, kind, weight);
    const s = String(str);
    return this.ctx.measureText(s).width + (spacing || 0) * Math.max(0, s.length - 1);
  };
  R.wrapLines = function (text, maxW, size, kind) {
    this.font(size, kind);
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (this.ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t; }
    if (line) lines.push(line);
    return lines;
  };

  /** html/body background: #000033 plus the six-dot starfield tiled every 160 px. */
  R.starfield = function () {
    const ctx = this.ctx, w = this.w, h = this.h;
    this.screenTransform();
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, w, h);
    if (!this.starPat && typeof document !== 'undefined' && document.createElement) {
      try {
        const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160;
        const c2 = cv.getContext('2d');
        for (const [x, y, r, col] of STARS_DOTS) { const g = c2.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c2.fillStyle = g; c2.fillRect(x - r, y - r, r * 2, r * 2); }
        this.starPat = ctx.createPattern(cv, 'repeat');
      } catch (e) { this.starPat = null; }
    }
    if (this.starPat) { ctx.fillStyle = this.starPat; ctx.fillRect(0, 0, w, h); return; }
    for (let ty = 0; ty < h; ty += 160) for (let tx = 0; tx < w; tx += 160) for (const [x, y, r, col] of STARS_DOTS) { ctx.fillStyle = col; ctx.fillRect(tx + x - r / 2, ty + y - r / 2, r, r); }
  };

  /** .stoinly: Impact, 10 px letter spacing, sliding rainbow, 2 px black stroke, hard shadow and magenta glow. */
  R.rainbowWord = function (text, cx, cy, size, spacing) {
    const ctx = this.ctx, sp = spacing != null ? spacing : 10 * size / 150;
    const total = this.measure(text, size, 'display', sp);
    const x0 = cx - total / 2;
    const ph = WR.reducedMotion ? 0 : (this.t / 4) % 1;
    const gx = x0 - ph * total;   // 200% wide gradient sliding over 4 s (two copies so it never runs out)
    const g = ctx.createLinearGradient(gx - total, 0, gx + 3 * total, 0);
    for (let i = 0; i < 16; i++) g.addColorStop(i / 15, RAINBOW[i % 8]);
    const sh = Math.max(2, size / 36);
    this.txt(text, cx, cy, size, g, 'center', 'display', { spacing: sp, baseline: 'middle', glow: 'rgba(255,0,255,0.85)', blur: 22, stroke: [Math.max(3, size / 34), '#000'], shadow: [sh, sh, '#000'] });
    return total;
  };
  /** .computer: Courier bold cyan with wide spacing, cyan glow and a hard #004466 shadow. */
  R.subtitle = function (text, cx, cy, size, color) {
    this.txt(text, cx, cy, size, color || C.cyan, 'center', 'mono', { spacing: size * 0.3, glow: color || C.cyan, blur: 10, shadow: [3, 3, '#004466'] });
  };
  /** .pz-title: Impact gold (or a colour) with letter spacing, hard shadow and glow. */
  R.heading = function (text, cx, cy, size, color) {
    const col = color || C.gold;
    this.txt(text, cx, cy, size, col, 'center', 'display', { spacing: size * 0.11, shadow: [2, 2, '#000'], glow: rgba(col, 0.8), blur: 14 });
  };

  /** .ticker: black bar, 2 px lime borders, Courier bold 14 px lime with a glow, scrolling one copy per 34 s. */
  R.ticker = function (y, text, key) {
    const ctx = this.ctx, w = this.w, ui = this.uiScale();
    const fs = Math.round(14 * ui), bh = Math.round(fs + 14 * ui);
    ctx.fillStyle = '#000'; ctx.fillRect(0, y, w, bh);
    ctx.fillStyle = C.lime; ctx.fillRect(0, y, w, 2); ctx.fillRect(0, y + bh - 2, w, 2);
    const item = text + '     ';
    const tw = this.measure(item, fs, 'mono');
    this.tickerX = this.tickerX || {};
    const k = key || 'main';
    if (!WR.reducedMotion) this.tickerX[k] = ((this.tickerX[k] || 0) + (this.frameDt || 0) * tw / 34) % Math.max(1, tw);
    const off = this.tickerX[k] || 0;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y + 2, w, bh - 4); ctx.clip();
    for (let x = -off; x < w; x += tw) this.txt(item, x, y + bh / 2 + 1, fs, C.lime, 'left', 'mono', { glow: C.lime, blur: 6, baseline: 'middle' });
    ctx.restore();
    return bh;
  };
  /** .rainbow-rule: 8 px bar of 24 px stripes sliding 144 px every 2 s. */
  R.rainbowRule = function (x, y, w, hgt) {
    const ctx = this.ctx, hh = hgt || 8;
    const off = WR.reducedMotion ? 0 : (this.t / 2 % 1) * 144;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
    for (let sx = x - 144 + off; sx < x + w; sx += 24) { ctx.fillStyle = STRIPES[(((Math.round((sx - x - off) / 24)) % 6) + 6) % 6]; ctx.fillRect(sx, y, 24.5, hh); }
    ctx.restore();
  };
  /** Two-tone bevel band (CSS ridge / outset / inset). */
  R.bevel = function (x, y, w, h, t, tl, br) {
    const ctx = this.ctx;
    ctx.fillStyle = tl;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - t, y + t); ctx.lineTo(x + t, y + t); ctx.lineTo(x + t, y + h - t); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = br;
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x + t, y + h - t); ctx.lineTo(x + w - t, y + h - t); ctx.lineTo(x + w - t, y + t); ctx.closePath(); ctx.fill();
  };
  /** Site panel: background, `bw` px ridge border in `col`, optional outer glow (box-shadow). */
  R.frame = function (x, y, w, h, col, bg, bw, glow, dashed) {
    const ctx = this.ctx; bw = bw || 4;
    if (glow && !perf()) { ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 30; ctx.fillStyle = bg || '#001133'; ctx.fillRect(x, y, w, h); ctx.restore(); }
    ctx.fillStyle = bg || '#001133'; ctx.fillRect(x, y, w, h);
    // inner darkening (inset 0 0 24px rgba(0,0,0,.9))
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (dashed) {
      ctx.save(); ctx.setLineDash([bw * 3, bw * 2]); ctx.lineWidth = bw; ctx.strokeStyle = col; ctx.strokeRect(x + bw / 2, y + bw / 2, w - bw, h - bw); ctx.restore();
      return;
    }
    const dark = shade(col, -0.55);
    this.bevel(x, y, w, h, bw / 2, col, dark);
    this.bevel(x + bw / 2, y + bw / 2, w - bw, h - bw, bw / 2, dark, col);
  };
  /** .stage-badge: scam-red tag, white border, Courier bold. Blinks when `blink` is a delay in seconds. */
  R.badge = function (text, x, y, size, blink, bg) {
    if (blink != null && !this.blinkOn(blink)) return;
    const ctx = this.ctx, fs = size || 12;
    const tw = this.measure(text, fs, 'mono', 2) + fs;
    const bh = fs + 6;
    ctx.fillStyle = bg || C.red; ctx.fillRect(x - tw / 2, y - bh / 2, tw, bh);
    ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.strokeRect(x - tw / 2 + 0.5, y - bh / 2 + 0.5, tw - 1, bh - 1);
    this.txt(text, x, y + 1, fs, '#fff', 'center', 'mono', { spacing: 2, baseline: 'middle' });
  };
  /** cards.css foil: a 240% silver gradient at 115deg sliding over 4.5 s under a 160deg magenta/cyan/yellow tint. */
  R.foil = function (x, y, w, h, alpha) {
    const ctx = this.ctx;
    const ph = WR.reducedMotion ? 0.3 : (this.t / 4.5) % 1;
    const L = Math.hypot(w, h) * 2.4;
    const ang = (115 - 90) * Math.PI / 180, dx = Math.cos(ang), dy = Math.sin(ang);
    const sx = x + w / 2 - dx * L * (0.25 + ph * 0.5), sy = y + h / 2 - dy * L * (0.25 + ph * 0.5);
    const g = ctx.createLinearGradient(sx - dx * L / 2, sy - dy * L / 2, sx + dx * L / 2, sy + dy * L / 2);
    const st = [[0, '#565d8c'], [0.14, '#c9d0f4'], [0.30, '#6a72a6'], [0.46, '#e8ecff'], [0.60, '#565d8c'], [0.76, '#b9c1ec'], [0.90, '#6a72a6'], [1, '#cdd4f8']];
    for (const [o, c] of st) g.addColorStop(o, c);
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    const a2 = (160 - 90) * Math.PI / 180;
    const t2 = ctx.createLinearGradient(x, y, x + Math.cos(a2) * h, y + Math.sin(a2) * h + h * 0.2);
    t2.addColorStop(0, 'rgba(255,0,255,0.16)'); t2.addColorStop(0.4, 'rgba(0,255,255,0.13)'); t2.addColorStop(0.75, 'rgba(255,238,0,0.09)'); t2.addColorStop(1, 'rgba(255,0,255,0.15)');
    ctx.fillStyle = t2; ctx.fillRect(x, y, w, h);
    ctx.restore();
  };
  R.starIcon = function (x, y, r, filled, glow) {
    const ctx = this.ctx;
    ctx.save();
    if (filled && glow && !perf()) { ctx.shadowColor = C.gold; ctx.shadowBlur = r; }
    this.starPath(ctx, x, y, r, 5, 0.45);
    ctx.fillStyle = filled ? C.gold : 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = filled ? '#000' : 'rgba(255,215,0,0.55)'; ctx.stroke();
    if (filled) { this.starPath(ctx, x - r * 0.12, y - r * 0.15, r * 0.35, 5, 0.45); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill(); }
    ctx.restore();
  };
  R.flameIcon = function (x, y, s, lit) {
    const ctx = this.ctx, fl = WR.reducedMotion ? 0 : Math.sin(this.t * 9) * 0.06;
    const shape = (k, col) => {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.5 * k);
      ctx.bezierCurveTo(x - s * 0.55 * k, y + s * 0.45 * k, x - s * 0.5 * k, y - s * 0.1 * k, x - s * (0.05 + fl) * k, y - s * 0.62 * k);
      ctx.bezierCurveTo(x + s * 0.05 * k, y - s * 0.25 * k, x + s * 0.2 * k, y - s * 0.2 * k, x + s * 0.22 * k, y - s * 0.38 * k);
      ctx.bezierCurveTo(x + s * 0.55 * k, y - s * 0.05 * k, x + s * 0.5 * k, y + s * 0.45 * k, x, y + s * 0.5 * k);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    ctx.save();
    if (lit && !perf()) { ctx.shadowColor = '#ff8800'; ctx.shadowBlur = s * 0.6; }
    shape(1, lit ? '#ff3300' : '#444466');
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.translate(0, s * 0.12); shape(0.62, lit ? '#ff9900' : '#555577');
    ctx.translate(0, s * 0.1); shape(0.32, lit ? '#ffee66' : '#666688');
    ctx.restore();
  };
  R.lockIcon = function (x, y, s) {
    const ctx = this.ctx;
    ctx.lineWidth = s * 0.16; ctx.strokeStyle = '#aaaacc';
    ctx.beginPath(); ctx.arc(x, y - s * 0.15, s * 0.32, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#aaaacc'; ctx.fillRect(x - s * 0.5, y - s * 0.15, s, s * 0.7);
    ctx.fillStyle = '#000033'; ctx.fillRect(x - s * 0.07, y + s * 0.02, s * 0.14, s * 0.3);
  };
  R.checkMark = function (x, y, s, ok) {
    const ctx = this.ctx;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.22;
    ctx.strokeStyle = ok ? C.lime : C.red;
    if (!perf()) { ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8; }
    ctx.beginPath();
    if (ok) { ctx.moveTo(x - s * 0.4, y); ctx.lineTo(x - s * 0.1, y + s * 0.32); ctx.lineTo(x + s * 0.45, y - s * 0.38); }
    else { ctx.moveTo(x - s * 0.35, y - s * 0.35); ctx.lineTo(x + s * 0.35, y + s * 0.35); ctx.moveTo(x + s * 0.35, y - s * 0.35); ctx.lineTo(x - s * 0.35, y + s * 0.35); }
    ctx.stroke(); ctx.restore();
  };
  /** Stat chip: black box with a coloured 2 px border, an icon and Courier bold text. Returns its width. */
  R.chip = function (x, y, icon, text, col, align) {
    const ctx = this.ctx, ui = this.uiScale(), fs = Math.round(16 * ui), hh = Math.round(30 * ui);
    const tw = this.measure(text, fs, 'mono') + hh + 14 * ui;
    const x0 = align === 'center' ? x - tw / 2 : (align === 'right' ? x - tw : x);
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x0, y, tw, hh);
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.strokeRect(x0 + 1, y + 1, tw - 2, hh - 2);
    const ix = x0 + hh * 0.55, iy = y + hh / 2;
    if (icon === 'star') this.starIcon(ix, iy, hh * 0.33, true, false);
    else if (icon === 'coin') this.coinShape(ctx, ix, iy, hh * 0.3, 1, 1.5);
    else if (icon === 'flame') this.flameIcon(ix, iy + 1, hh * 0.62, text[0] !== '0');
    this.txt(text, x0 + hh + 4 * ui, iy + 1, fs, col, 'left', 'mono', { baseline: 'middle', glow: col, blur: 6 });
    return tw;
  };

  /* ---------- bouncy buttons ---------- */
  function hitKey(hit) { return hit ? JSON.stringify(hit) : ''; }
  R.spring = function (key, target) {
    this.springs = this.springs || {};
    const sp = this.springs[key] || (this.springs[key] = { s: 1, v: 0 });
    const dt = Math.min(this.frameDt || 1 / 60, 1 / 30);
    if (WR.reducedMotion) { sp.s = target; sp.v = 0; return sp.s; }
    // stiff, lightly damped: overshoots like cubic-bezier(.34,1.56,.64,1)
    const k = 520, d = 18;
    for (let i = 0; i < 2; i++) { sp.v += ((target - sp.s) * k - sp.v * d) * dt / 2; sp.s += sp.v * dt / 2; }
    return sp.s;
  };
  R.pressAt = function (x, y) { const h = this.hitTest(null, x, y); this.pressed = h ? hitKey(h) : null; return h; };
  R.releaseAt = function (x, y) {
    const h = this.hitTest(null, x, y), k = this.pressed;
    this.pressed = null;
    if (h && hitKey(h) === k) { const sp = this.springs && this.springs[k]; if (sp) sp.v += 6; return h; }
    return null;
  };
  /** .goblin-btn on canvas: outset border, Comic Sans bold, hover = gold text on #330066, press squashes to 0.92. */
  R.btn = function (label, x, y, w, h, hit, variant, o) {
    const ctx = this.ctx, m = this.mouse, v = BTN[variant || 'blue'] || BTN.blue;
    o = o || {};
    const key = hitKey(hit);
    const hover = !!(m && m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h);
    const down = this.pressed === key && hover;
    const sc = this.spring(key, down ? 0.92 : (hover || o.focus ? 1.05 : 1));
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.translate(-w / 2, -h / 2);
    if ((hover || o.focus) && !perf()) { ctx.save(); ctx.shadowColor = v.border; ctx.shadowBlur = 18; ctx.fillStyle = v.bg; ctx.fillRect(0, 0, w, h); ctx.restore(); }
    ctx.fillStyle = hover ? '#330066' : v.bg; ctx.fillRect(0, 0, w, h);
    const bw = 3, dark = shade(v.border, -0.55);
    if (down) this.bevel(0, 0, w, h, bw, dark, v.border); else this.bevel(0, 0, w, h, bw, v.border, dark);
    let fs = o.size || Math.round(h * 0.42);
    const lwid = this.measure(label, fs, o.kind || 'body', o.spacing != null ? o.spacing : 1);
    if (lwid > w - 18) fs = Math.max(9, Math.floor(fs * (w - 18) / lwid));   // long labels shrink to fit
    this.txt(label, w / 2 + (down ? 1 : 0), h / 2 + (down ? 2 : 1), fs, hover ? C.gold : '#fff', 'center', o.kind || 'body', { baseline: 'middle', shadow: [1, 1, '#000'], spacing: o.spacing != null ? o.spacing : 1 });
    if (o.focus && !hover) { ctx.lineWidth = 2; ctx.strokeStyle = C.gold; ctx.setLineDash([6, 4]); ctx.strokeRect(-5, -5, w + 10, h + 10); ctx.setLineDash([]); }
    ctx.restore();
    if (o.badge) this.badge(o.badge, x + w - 8, y + 2, Math.round(11 * this.uiScale()), o.badgeBlink);
    this.hits.push({ x, y, w, h, hit });
  };

  /* ---------- toasts ---------- */
  R.drawToasts = function (game) {
    const list = game && game.toasts;
    if (!list || !list.length) return;
    const ui = this.uiScale(), dt = this.frameDt || 0;
    let y = (this.toastY != null ? this.toastY : 44) * 1;
    for (const ts of list) {
      ts.t = (ts.t || 0) + dt;
      const life = ts.life || 3.2;
      const pin = clamp(ts.t / 0.5, 0, 1), pout = clamp((ts.t - life + 0.35) / 0.35, 0, 1);
      const yy = y + (WR.reducedMotion ? 0 : (1 - elastic(pin)) * -80 * ui) - pout * 80 * ui;
      const fs = Math.round(18 * ui);
      const tw = Math.max(this.measure(ts.text, fs, 'display', 2), ts.sub ? this.measure(ts.sub, 12 * ui, 'mono') : 0) + 40 * ui;
      const hh = (ts.sub ? 52 : 36) * ui;
      this.ctx.globalAlpha = 1 - pout;
      this.frame(this.w / 2 - tw / 2, yy, tw, hh, ts.color || C.gold, '#1a0033', 4, ts.color || C.gold);
      if (ts.foil) this.foil(this.w / 2 - tw / 2 + 4, yy + 4, tw - 8, hh - 8, 0.25);
      this.txt(ts.text, this.w / 2, yy + 24 * ui, fs, ts.color || C.gold, 'center', 'display', { spacing: 2, shadow: [2, 2, '#000'] });
      if (ts.sub) this.txt(ts.sub, this.w / 2, yy + 42 * ui, Math.round(12 * ui), '#cceeff', 'center', 'mono');
      this.ctx.globalAlpha = 1;
      y += hh + 8 * ui;
    }
    game.toasts = list.filter((ts) => ts.t < (ts.life || 3.2));
  };

  /* ================= menus ================= */
  R.menuBegin = function (game, dt) {
    const d = dt != null ? Math.min(dt, 0.1) : 1 / 60;
    this.t += d; this.frameDt = d;   // real time, so menus animate at the same speed at any refresh rate
    this.inMenu = true;
    this.hits = [];
    this.mouse = game.mouse;
    this.juice = null;
    this.cos = this.cosFor(game, null);
    this.starfield();
    this.ensurePreviews(game);
  };
  R.menuEnd = function (game) {
    this.screenTransform();
    this.drawConfettiFx(this.frameDt || 0);
    this.toastY = 44 * this.uiScale();
    this.drawToasts(game);
    this.drawError();
  };
  R.metaInfo = function (game) {
    const M = WR.meta, m = game.meta;
    if (!M || !m) return { stars: 0, max: 15, coins: 0, streak: 0, chest: false, news: 0 };
    const dk = game.today || M.dateKey();
    return { stars: M.totalStars(m), max: M.maxStars(game.levels), coins: m.coins, streak: M.liveStreak(m, dk), chest: M.chestReady(m, dk), news: M.newCount(m), dk };
  };
  /** Header used by the inner menus: rainbow rule, heading, subtitle, stat chips. Returns the y below it. */
  R.menuHeader = function (game, title, sub, color) {
    const ui = this.uiScale(), w = this.w;
    this.rainbowRule(0, 0, w, 8);
    this.heading(title, w / 2, 58 * ui, Math.round(40 * ui), color);
    if (sub) this.txt(sub, w / 2, 84 * ui, Math.round(14 * ui), C.cyan, 'center', 'mono', { spacing: 1.5, shadow: [1, 1, '#000'] });
    const mi = this.metaInfo(game);
    let x = w - 16;
    x -= this.chip(x, 16, 'coin', String(mi.coins), C.gold, 'right') + 8;
    this.chip(x, 16, 'star', `${mi.stars}/${mi.max}`, C.gold, 'right');
    return 100 * ui;
  };
  R.hintLine = function (text) {
    const ui = this.uiScale();
    this.txt(text, this.w / 2, this.h - 12 * ui, Math.round(12 * ui), 'rgba(204,238,255,0.85)', 'center', 'mono', { spacing: 1 });
  };
  R.titleTickerText = function (game) {
    const mi = this.metaInfo(game);
    const items = ['WRECK RIDERS', 'NOW WITH 100% MORE LIMBS', `DAY STREAK ${mi.streak}`, `STARS ${mi.stars}/${mi.max}`, `COINS ${mi.coins}`];
    if (game.dailyInfo) items.push(`TODAY: ${game.levels[game.dailyInfo.levelIndex].name.toUpperCase()} WITH ${game.chars[game.dailyInfo.charIndex].name.toUpperCase()} - ${game.dailyInfo.modifier.name}`);
    if (mi.chest) items.push('DAILY CHEST IS READY');
    const m = game.meta;
    if (m && m.best) for (const L of game.levels) { const b = m.best[L.id]; if (b) { const t = Math.min(...Object.values(b)); items.push(`BEST ${L.name.toUpperCase()} ${this.fmtTime(t)}`); } }
    items.push('NO REFUNDS', 'PHYSICS BY PLANCK.JS (MIT)', 'ALL RIDERS ARE ORIGINAL CHARACTERS');
    return items.join('  ★  ');
  };
  /** Rider preview with the equipped cosmetics, an idle bob, optional cosmetics override and locked silhouette. */
  R.previewRider = function (game, ci, x, y, w, h, maxScale, alignBottom, cosOverride, locked, bobPhase) {
    const sim = this.previews && this.previews[ci];
    if (!sim) return;
    const saved = this.cos;
    this.cos = Object.assign({}, this.cos || {}, cosOverride || {});
    if (locked) this.cos.silhouette = true;
    const bob = bobPhase == null || WR.reducedMotion ? 0 : -8 * this.uiScale() * (0.5 + 0.5 * Math.sin(this.t * TAU / 2.8 + bobPhase));
    if (locked) this.ctx.filter = 'brightness(0.12) saturate(0)';
    this.drawPreview(sim, x, y + bob, w, h, maxScale, alignBottom);
    if (locked) this.ctx.filter = 'none';
    this.cos = saved;
  };

  /* ---------- title ---------- */
  R.drawTitle = function (game, dt) {
    this.menuBegin(game, dt);
    const ctx = this.ctx, w = this.w, h = this.h, ui = this.uiScale();
    const tb = this.ticker(0, this.titleTickerText(game), 'title');
    this.rainbowRule(0, tb, w, 8);
    const mi = this.metaInfo(game);
    this.txt('STOINLY.COMPUTER PRESENTS', w / 2, tb + 44 * ui, Math.round(15 * ui), C.gold, 'center', 'mono', { spacing: 4, shadow: [2, 2, '#000'] });
    const size = Math.min(w * 0.105, h * 0.15);
    const wy = tb + 44 * ui + size * 0.72;
    this.rainbowWord('WRECK RIDERS', w / 2, wy, size);
    this.subtitle('RAGDOLL.EXE', w / 2, wy + size * 0.62, Math.round(size * 0.24));
    this.txt('Four riders. Five courses. No refunds.', w / 2, wy + size * 0.62 + 34 * ui, Math.round(17 * ui), C.gold, 'center', 'body', { shadow: [2, 2, '#000'], spacing: 1 });
    // stats
    const sy = wy + size * 0.62 + 52 * ui;
    const parts = [['flame', `DAY STREAK ${mi.streak}`, mi.streak ? '#ff8800' : '#8888aa'], ['star', `${mi.stars}/${mi.max} STARS`, C.gold], ['coin', `${mi.coins} COINS`, C.gold]];
    const widths = parts.map(([, t]) => this.measure(t, Math.round(16 * ui), 'mono') + 44 * ui);
    let cx = w / 2 - (widths.reduce((a, b) => a + b, 0) + 12 * ui * (parts.length - 1)) / 2;
    parts.forEach(([ic, t, col], i) => { this.chip(cx, sy, ic, t, col, 'left'); cx += widths[i] + 12 * ui; });
    // buttons
    const bw = 320 * ui, bh = 52 * ui, bx = w / 2 - bw / 2;
    let by = sy + 48 * ui;
    const focus = game.titleFocus || 0;
    this.btn('▶  PLAY', bx, by, bw, bh + 6 * ui, { type: 'goto', to: 'select' }, 'go', { focus: focus === 0, kind: 'display', size: Math.round(26 * ui), spacing: 3 });
    by += bh + 18 * ui;
    this.btn('DAILY CHALLENGE', bx, by, bw, bh, { type: 'goto', to: 'daily' }, 'hot', { focus: focus === 1, badge: mi.chest ? 'CHEST!' : 'LIVE', badgeBlink: 0.3 });
    by += bh + 12 * ui;
    this.btn('COLLECTION', bx, by, bw, bh, { type: 'goto', to: 'collection' }, 'blue', { focus: focus === 2, badge: mi.news ? `NEW! ${mi.news}` : null, badgeBlink: 0.55 });
    by += bh + 26 * ui;
    if (this.blinkOn(0)) this.txt(`PRESS ${K('confirm')} TO RIDE`, w / 2, by, Math.round(16 * ui), '#fff', 'center', 'mono', { spacing: 3, glow: C.hot, blur: 10 });
    // the riders on a rainbow floor
    const bt = Math.round(14 * ui + 14 * ui);
    const floorY = h - bt - 24 * ui;
    const n = this.previews.length, slot = Math.min(w / (n + 0.8), Math.max(110, (floorY - by - 10) * 1.05), h * 0.3);
    for (let i = 0; i < n; i++) {
      const x = w / 2 + (i - (n - 1) / 2) * slot * 1.08;
      this.previewRider(game, i, x - slot * 0.45, floorY - slot * 0.82, slot * 0.9, slot * 0.8, h / 720 * 46, true, null, false, i * 0.9);
    }
    this.rainbowRule(0, floorY, w, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, floorY + 8, w, h - floorY - 8);
    const arrows = keysDefault(['menuUp', 'menuDown']) ? 'ARROWS' : `${K('menuUp')} / ${K('menuDown')}`;
    this.ticker(h - bt, `${arrows} / ${K('confirm')}: MENU  ★  ${K('daily')}: DAILY  ★  ${K('collection')}: COLLECTION  ★  ${K('mute')}: MUTE  ★  RIDE SAFE (DO NOT RIDE SAFE)`, 'title2');
    if (game.fromNexus) this.btn('◄ NEXUS', 16, tb + 16, 130 * ui, 36 * ui, { type: 'nexus' }, 'hot');   // back to the STOINLY NEXUS launcher
    this.menuEnd(game);
  };

  /* ---------- rider select ---------- */
  R.drawSelect = function (game, dt) {
    this.menuBegin(game, dt);
    const ctx = this.ctx, w = this.w, h = this.h, ui = this.uiScale();
    const lr = keysDefault(['menuLeft', 'menuRight']) ? '← →' : `${K('menuLeft')} ${K('menuRight')}`;
    const top = this.menuHeader(game, 'CHOOSE YOUR RIDER', `${lr} CHOOSE  ·  ${K('confirm')}: PICK A COURSE  ·  ${K('back')}: BACK`);
    const n = game.chars.length, gap = 22 * ui;
    const cw = Math.min(280 * ui, (w - 60 - gap * (n - 1)) / n), chh = Math.min(400 * ui, h * 0.52);
    const x0 = (w - (cw * n + gap * (n - 1))) / 2, y0 = top + 18 * ui;
    const m = game.meta;
    for (let i = 0; i < n; i++) {
      const def = game.chars[i], sel = i === game.charIndex;
      const bob = sel && !WR.reducedMotion ? -8 * ui * (0.5 + 0.5 * Math.sin(this.t * TAU / 2.8)) : 0;
      const x = x0 + i * (cw + gap), y = y0 + bob;
      const mm = this.mouse, hover = mm && mm.x >= x && mm.x <= x + cw && mm.y >= y && mm.y <= y + chh;
      if (sel) this.frame(x, y, cw, chh, C.hot, '#1a0033', 6, 'rgba(255,0,255,0.6)');
      else this.frame(x, y, cw, chh, hover ? C.gold : C.cyan, '#001133', 4);
      this.previewRider(game, i, x + 12 * ui, y + 18 * ui, cw - 24 * ui, chh * 0.44, 95 * ui, false, null, false, null);
      let ty = y + chh * 0.5 + 26 * ui;
      this.txt(def.name.toUpperCase(), x + cw / 2, ty, Math.round(22 * ui), sel ? C.gold : '#fff', 'center', 'display', { spacing: 1.5, shadow: [2, 2, '#000'] });
      ty += 22 * ui;
      this.txt(def.vehicle.toUpperCase(), x + cw / 2, ty, Math.round(12 * ui), C.cyan, 'center', 'mono', { spacing: 1 });
      ty += 22 * ui;
      for (const line of this.wrapLines(def.blurb, cw - 28 * ui, Math.round(13 * ui), 'body')) { this.txt(line, x + cw / 2, ty, Math.round(13 * ui), '#cceeff', 'center', 'body', { weight: 'normal' }); ty += 18 * ui; }
      const cleared = m && m.best ? game.levels.filter((L) => m.best[L.id] && m.best[L.id][def.id] != null).length : 0;
      this.txt(`COURSES CLEARED ${cleared}/${game.levels.length}`, x + cw / 2, y + chh - 14 * ui, Math.round(12 * ui), cleared ? C.lime : '#8888aa', 'center', 'mono', { glow: cleared ? C.lime : null, blur: 6 });
      this.hits.push({ x, y, w: cw, h: chh, hit: { type: 'char', index: i, confirm: sel } });
    }
    // controls of the selected rider (.sw-frame: lime)
    const def = game.chars[game.charIndex];
    const py = y0 + chh + 20 * ui, pw = Math.min(w - 40, 760 * ui), px = (w - pw) / 2;
    const custom = rideKeysLine();
    const customLines = custom ? this.wrapLines(custom, pw - 36 * ui, Math.round(13 * ui), 'mono') : [];
    const rows = Math.ceil(def.controls.length / 2), ph = (rows * 22 + 46 + customLines.length * 20) * ui;
    this.frame(px, py, pw, ph, C.lime, '#001a00', 4, 'rgba(0,255,0,0.35)');
    this.txt(`${this.shortName(def).toUpperCase()}'S CONTROLS`, px + 18 * ui, py + 28 * ui, Math.round(18 * ui), C.lime, 'left', 'display', { spacing: 2, shadow: [2, 2, '#000'] });
    def.controls.forEach((c, i) => this.txt(c, px + 18 * ui + (i % 2) * pw / 2, py + (52 + Math.floor(i / 2) * 22) * ui, Math.round(14 * ui), '#fff', 'left', 'body', { weight: 'normal' }));
    customLines.forEach((l, i) => this.txt(l, px + 18 * ui, py + (52 + rows * 22 + i * 20) * ui, Math.round(13 * ui), C.gold, 'left', 'mono'));
    const by = Math.min(h - 70 * ui, py + ph + 16 * ui);
    this.btn('PICK A COURSE  ▶', w / 2 - 140 * ui, by, 280 * ui, 46 * ui, { type: 'start' }, 'go');
    this.btn('◀ BACK', 16, 16, 110 * ui, 36 * ui, { type: 'goto', to: 'title' }, 'blue');
    this.menuEnd(game);
  };

  /* ---------- course select ---------- */
  R.drawLevels = function (game, dt) {
    this.menuBegin(game, dt);
    const ctx = this.ctx, w = this.w, h = this.h, ui = this.uiScale();
    const def = game.chars[game.charIndex];
    const top = this.menuHeader(game, 'PICK A COURSE', `RIDING: ${def.name.toUpperCase()} - ${def.vehicle.toUpperCase()}`);
    const M = WR.meta, m = game.meta;
    const lw = Math.min(980 * ui, w - 40), gap = 10 * ui;
    const rh = Math.min(96 * ui, (h - top - 60 * ui - gap * game.levels.length) / Math.max(1, game.levels.length));
    const x0 = (w - lw) / 2, y0 = top + 12 * ui;
    game.levels.forEach((L, i) => {
      const y = y0 + i * (rh + gap), sel = i === game.levelIndex;
      const mm = this.mouse, hover = mm && mm.x >= x0 && mm.x <= x0 + lw && mm.y >= y && mm.y <= y + rh;
      if (sel) this.frame(x0, y, lw, rh, C.hot, '#1a0033', 6, 'rgba(255,0,255,0.5)');
      else this.frame(x0, y, lw, rh, hover ? C.gold : C.cyan, '#001133', 4);
      const accent = (L.theme && L.theme.accent) || C.gold;
      // number badge
      const bx = x0 + 44 * ui, byy = y + rh / 2;
      ctx.beginPath(); ctx.arc(bx, byy, 26 * ui, 0, TAU); ctx.fillStyle = accent; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
      this.txt(String(i + 1), bx, byy + 2, Math.round(30 * ui), '#fff', 'center', 'display', { baseline: 'middle', stroke: [4, '#000'] });
      this.txt(L.name.toUpperCase(), x0 + 86 * ui, y + rh * 0.42, Math.round(26 * ui), sel ? C.gold : '#fff', 'left', 'display', { spacing: 1.5, shadow: [2, 2, '#000'] });
      this.txt(L.subtitle || '', x0 + 86 * ui, y + rh * 0.42 + 24 * ui, Math.round(13 * ui), '#cceeff', 'left', 'body', { weight: 'normal' });
      const lid = L.id || String(i);
      // stars and their rules
      const st = m && m.stars[lid];
      const rules = M ? M.starRules(L) : [];
      const sx = x0 + lw * 0.47;
      ['finish', 'par', 'style'].forEach((k, j) => this.starIcon(sx + j * 34 * ui, y + rh * 0.38, 14 * ui, !!(st && st[k]), true));
      const rl = rules.map((r) => (r.id === 'finish' ? 'FINISH' : r.id === 'par' ? `PAR ${this.fmtPar(r.target)}` : `STYLE ${r.target}`)).join(' · ');
      this.txt(rl, sx - 14 * ui, y + rh * 0.38 + 32 * ui, Math.round(11 * ui), C.gold, 'left', 'mono');
      // best times per rider
      const bests = (m && m.best[lid]) || {};
      const cx0 = x0 + lw - 16 * ui - game.chars.length * 66 * ui;
      game.chars.forEach((c, k) => {
        const cx = cx0 + k * 66 * ui, t = bests[c.id];
        ctx.beginPath(); ctx.arc(cx + 8 * ui, y + rh * 0.34, 7 * ui, 0, TAU); ctx.fillStyle = c.style.shirt; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
        this.txt(this.firstName(c), cx + 19 * ui, y + rh * 0.34 + 4 * ui, Math.round(10 * ui), k === game.charIndex ? C.gold : '#aabbdd', 'left', 'mono');
        this.txt(t != null ? this.fmtTime(t) : '--:--', cx, y + rh * 0.34 + 26 * ui, Math.round(14 * ui), t != null ? C.lime : '#556', 'left', 'mono', { glow: t != null ? C.lime : null, blur: 5 });
      });
      if (m && m.style[lid]) this.txt(`BEST STYLE ${m.style[lid]}`, x0 + lw - 16 * ui, y + rh - 10 * ui, Math.round(10 * ui), C.hot, 'right', 'mono');
      this.hits.push({ x: x0, y, w: lw, h: rh, hit: { type: 'level', index: i } });
    });
    if (!game.levels.length) this.txt('No courses are defined.', w / 2, y0 + 40, 18, '#fff', 'center');
    this.btn('◀ BACK', 16, 16, 110 * ui, 36 * ui, { type: 'goto', to: 'select' }, 'blue');
    this.hintLine(`${K('menuUp')} / ${K('menuDown')}: CHOOSE  ·  ${K('confirm')}: RIDE  ·  ${K('back')}: BACK  ·  STARS: FINISH, BEAT PAR, STYLE SCORE`);
    this.menuEnd(game);
  };

  /* ---------- collection ---------- */
  R.firstName = function (def) { return this.shortName(def).replace(/^Uncle /, '').split(' ')[0].toUpperCase(); };
  R.fmtPar = function (t) { const m = Math.floor(t / 60), sec = Math.round(t - m * 60); return `${m}:${sec < 10 ? '0' : ''}${sec}`; };
  R.collectionItems = function (kind) { return WR.meta ? WR.meta.COSMETICS.filter((c) => c.kind === kind) : []; };
  R.drawCollection = function (game, dt) {
    this.menuBegin(game, dt);
    const ctx = this.ctx, w = this.w, h = this.h, ui = this.uiScale();
    const M = WR.meta, m = game.meta;
    const top = this.menuHeader(game, 'COLLECTION', 'SKINS, HATS AND TRAILS ARE LOOKS ONLY: THE PHYSICS NEVER CHANGES');
    const kinds = [['skin', 'SKINS'], ['hat', 'HATS'], ['trail', 'TRAILS']];
    const tab = game.colTab || 'skin';
    const tbw = 170 * ui, tbh = 40 * ui;
    kinds.forEach(([k, label], i) => {
      const nn = M && m ? M.newCount(m, k) : 0;
      this.btn(label, w / 2 + (i - 1) * (tbw + 14 * ui) - tbw / 2, top + 6 * ui, tbw, tbh, { type: 'tab', kind: k }, k === tab ? 'hot' : 'blue', { badge: nn ? `NEW! ${nn}` : null, badgeBlink: 0.2 * i });
    });
    const items = this.collectionItems(tab);
    const cols = 4, gap = 16 * ui;
    const gy = top + tbh + 26 * ui;
    const rows = Math.ceil(items.length / cols);
    const cw = Math.min(250 * ui, (w - 60 - gap * (cols - 1)) / cols);
    const ch = Math.min(270 * ui, (h - gy - 40 * ui - gap * (rows - 1)) / rows);
    const gx = (w - (cw * cols + gap * (cols - 1))) / 2;
    items.forEach((c, i) => {
      const x = gx + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * (ch + gap);
      const owned = !!(m && m.owned[c.id]), equipped = !!(m && m.equip[c.kind] === c.id), isNew = !!(M && m && M.isNew(m, c.id));
      const cursor = (game.colCursor || 0) === i;
      const rc = RARITY[c.rarity] || C.cyan;
      const shakeX = game.nope && game.nope.id === c.id && !WR.reducedMotion ? Math.sin((game.nope.t || 0) * 60) * 6 * Math.max(0, 1 - (game.nope.t || 0) / 0.35) : 0;
      ctx.save(); ctx.translate(shakeX, 0);
      this.frame(x, y, cw, ch, cursor ? C.hot : rc, owned ? '#1a0033' : '#0a0a22', cursor ? 6 : 4, cursor || (owned && (c.rarity === 'holo' || c.rarity === 'ultra')) ? rgba(cursor ? C.hot : rc, 0.55) : null);
      if (owned && (c.rarity === 'holo' || c.rarity === 'ultra')) this.foil(x + 6, y + 6, cw - 12, ch * 0.62, c.rarity === 'ultra' ? 0.5 : 0.34);
      else if (owned && c.rarity === 'rare') this.foil(x + 6, y + 6, cw - 12, ch * 0.62, 0.14);
      // preview
      const px = x + 10 * ui, py = y + 10 * ui, pw = cw - 20 * ui, ph = ch * 0.58;
      if (c.kind === 'trail') this.trailSample(c.id, px, py, pw, ph, !owned, game);
      else this.previewRider(game, game.charIndex, px, py, pw, ph, 80 * ui, false, c.kind === 'skin' ? { skin: c.id } : { hat: c.id }, !owned, null);
      if (!owned) this.lockIcon(x + cw / 2, y + ch * 0.32, 26 * ui);
      // labels
      this.txt(c.name.toUpperCase(), x + cw / 2, y + ch * 0.72, Math.round(19 * ui), owned ? '#fff' : '#8888aa', 'center', 'display', { spacing: 1, shadow: [2, 2, '#000'] });
      this.txt(c.rarity.toUpperCase(), x + cw / 2, y + ch * 0.72 + 17 * ui, Math.round(10 * ui), rc, 'center', 'mono', { spacing: 3 });
      const ly = y + ch - 22 * ui;
      if (equipped) this.badge('EQUIPPED', x + cw / 2, ly, Math.round(12 * ui), null, '#006600');
      else if (owned) this.txt('CLICK TO EQUIP', x + cw / 2, ly + 4 * ui, Math.round(12 * ui), C.cyan, 'center', 'mono');
      else if (c.unlock.coins) {
        const can = m && m.coins >= c.unlock.coins;
        this.coinShape(ctx, x + cw / 2 - 52 * ui, ly, 8 * ui, 1, 1.2);
        this.txt(`BUY ${c.unlock.coins}`, x + cw / 2 - 40 * ui, ly + 5 * ui, Math.round(14 * ui), can ? C.gold : '#886', 'left', 'mono', { glow: can ? C.gold : null, blur: 6 });
      } else this.txt(`UNLOCK: ${M.unlockText(c)}`, x + cw / 2, ly + 4 * ui, Math.round(11 * ui), '#aaaacc', 'center', 'mono');
      if (isNew) this.badge('NEW!', x + cw - 26 * ui, y + 16 * ui, Math.round(12 * ui), 0.15 * i);
      ctx.restore();
      this.hits.push({ x, y, w: cw, h: ch, hit: { type: 'item', id: c.id, index: i } });
    });
    this.btn('◀ BACK', 16, 16, 110 * ui, 36 * ui, { type: 'goto', to: 'title' }, 'blue');
    const tabs = keysDefault(['tabNext', 'tabPrev']) ? 'TAB / Q / E' : `${K('tabPrev')} / ${K('tabNext')}`;
    const moves = keysDefault(['menuUp', 'menuDown', 'menuLeft', 'menuRight']) ? 'ARROWS' : `${K('menuUp')} ${K('menuLeft')} ${K('menuDown')} ${K('menuRight')}`;
    this.hintLine(`${tabs}: SWITCH  ·  ${moves}: MOVE  ·  ${K('confirm')}: EQUIP OR BUY  ·  ${K('back')}: BACK  ·  PREVIEW: ` + game.chars[game.charIndex].name.toUpperCase());
    if (game.nope) { game.nope.t = (game.nope.t || 0) + (this.frameDt || 0); if (game.nope.t > 0.4) game.nope = null; }
    this.menuEnd(game);
  };
  /** A trail swatch: the trail drawn along a little hop arc with the rider's ride at its head. */
  R.trailSample = function (id, x, y, w, h, locked, game) {
    const ctx = this.ctx, sc = h / 4;
    const pts = [];
    for (let i = 0; i < 36; i++) { const u = i / 35; pts.push({ x: -3 + u * 4.2, y: -Math.sin(u * Math.PI * 0.9) * 1.2 + 0.4 }); }
    const saved = this.cos;
    this.cos = Object.assign({}, saved || {}, { trail: id });
    const d = this.dpr;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (locked) ctx.filter = 'brightness(0.12) saturate(0)';
    ctx.setTransform(d * sc, 0, 0, d * sc, d * (x + w * 0.55), d * (y + h * 0.55));
    const zoomSave = this.cam.zoom; this.cam.zoom = sc;
    if (id !== 'trail:none') this.drawTrail({ trail: pts }, null);
    this.cam.zoom = zoomSave;
    ctx.restore();
    if (locked) ctx.filter = 'none';
    this.screenTransform();
    this.cos = saved;
    this.previewRider(game, game.charIndex, x + w * 0.52, y + h * 0.1, w * 0.42, h * 0.62, 50 * this.uiScale(), false, { trail: id }, locked, null);
    if (id === 'trail:none') this.txt('NO TRAIL', x + w * 0.3, y + h * 0.55, Math.round(13 * this.uiScale()), '#8888aa', 'center', 'mono');
  };

  /* ---------- daily challenge ---------- */
  R.drawDaily = function (game, dt) {
    this.menuBegin(game, dt);
    const ctx = this.ctx, w = this.w, h = this.h, ui = this.uiScale();
    const M = WR.meta, m = game.meta, D = game.dailyInfo;
    const mi = this.metaInfo(game);
    const top = this.menuHeader(game, 'DAILY CHALLENGE', `${mi.dk || ''}  ·  SAME COURSE, RIDER AND MODIFIER FOR EVERYONE TODAY`, C.hot);
    this.badge('LIVE', w / 2 + this.measure('DAILY CHALLENGE', Math.round(40 * ui), 'display', 4.4 * ui) / 2 + 40 * ui, 50 * ui, Math.round(13 * ui), 0.3);
    const gap = 24 * ui, pw = Math.min(600 * ui, (w - 60 - gap) / 2), ph = Math.min(h - top - 70 * ui, 560 * ui);
    const lx = w / 2 - gap / 2 - pw, rx = w / 2 + gap / 2, py = top + 16 * ui;
    // left: today's run
    this.frame(lx, py, pw, ph, C.hot, '#1a0033', 6, 'rgba(255,0,255,0.5)');
    if (D) {
      const L = game.levels[D.levelIndex], ch = game.chars[D.charIndex];
      this.txt("TODAY'S RUN", lx + pw / 2, py + 34 * ui, Math.round(15 * ui), C.cyan, 'center', 'mono', { spacing: 4 });
      this.txt(L.name.toUpperCase(), lx + pw / 2, py + 72 * ui, Math.round(34 * ui), C.gold, 'center', 'display', { spacing: 2, shadow: [2, 2, '#000'], glow: 'rgba(255,215,0,0.6)', blur: 12 });
      this.txt(`RIDER: ${ch.name.toUpperCase()} (${ch.vehicle.toUpperCase()})`, lx + pw / 2, py + 96 * ui, Math.round(13 * ui), '#cceeff', 'center', 'mono');
      game.previewMod = D.modifier;
      this.cos = this.cosFor(game, null);
      this.previewRider(game, D.charIndex, lx + pw * 0.2, py + 108 * ui, pw * 0.6, ph * 0.3, 90 * ui, true, null, false, 0);
      game.previewMod = null;
      // modifier card with foil
      const my = py + 118 * ui + ph * 0.3, mw = pw - 60 * ui, mh = 86 * ui, mx = lx + 30 * ui;
      this.frame(mx, my, mw, mh, C.gold, '#221a00', 4, 'rgba(255,215,0,0.3)');
      this.foil(mx + 4, my + 4, mw - 8, mh - 8, 0.22);
      this.txt(`MODIFIER: ${D.modifier.name}`, lx + pw / 2, my + 34 * ui, Math.round(22 * ui), C.red, 'center', 'display', { spacing: 2, shadow: [1, 1, '#000'], stroke: [3, '#000'] });
      this.txt(D.modifier.desc, lx + pw / 2, my + 60 * ui, Math.round(14 * ui), '#fff', 'center', 'body', { shadow: [1, 1, '#000'] });
      const best = m && m.daily.date === mi.dk ? m.daily.best : null;
      const plays = m && m.daily.date === mi.dk ? m.daily.plays : 0;
      this.txt(`YOUR BEST TODAY: ${best != null ? best : '---'}   ·   PLAYS: ${plays}`, lx + pw / 2, my + mh + 30 * ui, Math.round(16 * ui), C.lime, 'center', 'mono', { glow: C.lime, blur: 6 });
      this.txt(`SCORE = STYLE + 1000 FOR FINISHING + 25 PER SECOND UNDER PAR (${this.fmtPar(L.par || 60)})`, lx + pw / 2, my + mh + 52 * ui, Math.round(10 * ui), '#aabbdd', 'center', 'mono');
      this.btn('▶  PLAY DAILY', lx + pw / 2 - 140 * ui, py + ph - 66 * ui, 280 * ui, 48 * ui, { type: 'dailyPlay' }, 'go', { focus: true, kind: 'display', size: Math.round(22 * ui), spacing: 2 });
    }
    // right: streak and chest (.bank-notice: dashed gold)
    this.frame(rx, py, pw, ph, C.gold, '#221a00', 4, 'rgba(255,215,0,0.3)', true);
    this.flameIcon(rx + 70 * ui, py + 66 * ui, 70 * ui, mi.streak > 0);
    this.txt(`${mi.streak}-DAY STREAK`, rx + 120 * ui, py + 62 * ui, Math.round(32 * ui), mi.streak ? '#ff8800' : '#8888aa', 'left', 'display', { spacing: 2, shadow: [2, 2, '#000'] });
    this.txt(`BEST STREAK ${m ? m.streak.best : 0}  ·  PLAY ANY RUN ONCE A DAY TO KEEP IT`, rx + 120 * ui, py + 86 * ui, Math.round(11 * ui), C.gold, 'left', 'mono');
    const sr = M ? M.COSMETICS.filter((c) => c.unlock.streak) : [];
    sr.forEach((c, i) => {
      const yy = py + 116 * ui + i * 22 * ui, got = m && m.owned[c.id];
      this.checkMark(rx + 34 * ui, yy - 4 * ui, 12 * ui, !!got);
      this.txt(`${c.unlock.streak} DAYS: ${c.name.toUpperCase()} (${c.kind.toUpperCase()})`, rx + 50 * ui, yy, Math.round(13 * ui), got ? C.lime : '#ffccbb', 'left', 'mono');
    });
    this.drawChest(game, rx, py + 150 * ui, pw, ph - 150 * ui);
    this.btn('◀ BACK', 16, 16, 110 * ui, 36 * ui, { type: 'goto', to: 'title' }, 'blue');
    this.hintLine(`${K('confirm')}: PLAY DAILY  ·  ${K('chest')}: OPEN CHEST  ·  ${K('back')}: BACK`);
    this.menuEnd(game);
  };

  /** The daily chest: bobs while ready; a click shakes it three times, then it bursts into foil and confetti and the prize
   * card flips in. game.chestAnim = {t, prize} is set by main.js when the chest is opened (the prize is already saved). */
  R.drawChest = function (game, x, y, w, h) {
    const ctx = this.ctx, ui = this.uiScale();
    const M = WR.meta, m = game.meta, dk = game.today;
    const ready = M && m ? M.chestReady(m, dk) : false;
    const A = game.chestAnim;
    this.txt('DAILY CHEST', x + w / 2, y + 30 * ui, Math.round(24 * ui), C.red, 'center', 'display', { spacing: 3, shadow: [1, 1, '#000'] });
    const cx = x + w / 2, cy = y + h * 0.6, cs = Math.min(w * 0.34, h * 0.36);
    let phase = A ? (A.t < 0.8 ? 'shake' : 'open') : (ready ? 'idle' : 'done');
    if (A) {
      const prev = A.t;
      A.t += this.frameDt || 0;
      for (const [at, n] of [[0, 1], [0.27, 2], [0.54, 3]]) if (prev <= at && A.t > at && game.audio) game.audio.sting('chestShake', n);
      if (prev < 0.8 && A.t >= 0.8) {
        if (game.audio) game.audio.sting('chestOpen', 1);
        this.confettiBurst(cx, cy, A.prize && A.prize.type === 'item' ? 180 : 80, A.prize && A.prize.type === 'item' ? 120 : 75);
      }
      if (prev < 1.4 && A.t >= 1.4 && game.audio) game.audio.sting('reward', 1);
    }
    let ox = 0, oy = 0, rot = 0;
    if (phase === 'idle' && !WR.reducedMotion) oy = -8 * ui * (0.5 + 0.5 * Math.sin(this.t * TAU / 2.8));
    if (phase === 'shake' && !WR.reducedMotion) { const k = (A.t % 0.27) / 0.27; rot = Math.sin(k * TAU * 2) * 0.12 * (1 - k); ox = Math.sin(k * TAU * 3) * 6 * ui; }
    const open = phase === 'open' || phase === 'done';
    ctx.save(); ctx.translate(cx + ox, cy + oy); ctx.rotate(rot);
    // body
    const bw = cs * 1.3, bh = cs * 0.72;
    if (phase === 'open' && A.t < 1.6 && prefs().flashes) { const k = clamp((A.t - 0.8) / 0.8, 0, 1); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, -bh * 0.2, 0, 0, -bh * 0.2, cs * 1.6); g.addColorStop(0, `rgba(255,255,220,${0.9 * (1 - k)})`); g.addColorStop(1, 'rgba(255,0,255,0)'); ctx.fillStyle = g; ctx.fillRect(-cs * 1.6, -cs * 1.8, cs * 3.2, cs * 3.2); ctx.restore(); }
    ctx.save(); roundRectPath(ctx, -bw / 2, -bh * 0.1, bw, bh, 8); ctx.clip(); this.foil(-bw / 2, -bh * 0.1, bw, bh, 1); ctx.restore();
    roundRectPath(ctx, -bw / 2, -bh * 0.1, bw, bh, 8); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.fillStyle = C.gold; ctx.fillRect(-bw * 0.08, -bh * 0.1, bw * 0.16, bh); ctx.strokeRect(-bw * 0.08, -bh * 0.1, bw * 0.16, bh);
    // lid
    ctx.save();
    if (open) { ctx.translate(-bw / 2 - 4, -bh * 0.1); ctx.rotate(-0.42); ctx.translate(bw / 2 + 4, bh * 0.1); }   // hinged at the back
    ctx.save(); roundRectPath(ctx, -bw / 2 - 4, -bh * 0.5, bw + 8, bh * 0.42, 10); ctx.clip(); this.foil(-bw / 2 - 4, -bh * 0.5, bw + 8, bh * 0.42, 1); ctx.restore();
    roundRectPath(ctx, -bw / 2 - 4, -bh * 0.5, bw + 8, bh * 0.42, 10); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.fillStyle = C.gold; ctx.fillRect(-bw * 0.08, -bh * 0.5, bw * 0.16, bh * 0.42);
    if (!open) { ctx.beginPath(); ctx.arc(0, -bh * 0.1, cs * 0.08, 0, TAU); ctx.fillStyle = C.red; ctx.fill(); ctx.stroke(); }
    ctx.restore();
    ctx.restore();
    const ly = y + h - 26 * ui;
    if (phase === 'idle') {
      this.btn('OPEN!', cx - 90 * ui, ly - 30 * ui, 180 * ui, 44 * ui, { type: 'chest' }, 'hot', { kind: 'display', size: Math.round(24 * ui), spacing: 3, badge: 'FREE', badgeBlink: 0.5 });
      this.hits.push({ x: cx - bw / 2, y: cy - bh * 0.6, w: bw, h: bh * 1.2, hit: { type: 'chest' } });
    } else if (phase === 'done') {
      this.txt('OPENED TODAY. THE NEXT CHEST COMES TOMORROW.', cx, ly, Math.round(12 * ui), '#ccaa44', 'center', 'mono', { spacing: 1 });
    }
    // the prize card flips in
    if (A && A.t > 0.9) {
      const p = clamp((A.t - 0.9) / 0.6, 0, 1), flip = elastic(p);
      const pw = Math.min(w * 0.7, 340 * ui), phh = 92 * ui, px = cx - pw / 2, pyy = cy - bh * 0.4 - phh - 10 * ui;
      ctx.save(); ctx.translate(cx, pyy + phh / 2); ctx.scale(Math.max(0.02, flip), 1); ctx.translate(-cx, -(pyy + phh / 2));
      const pr = A.prize || { type: 'coins', coins: 0 };
      const col = pr.type === 'item' ? (RARITY[pr.rarity] || C.gold) : C.gold;
      this.frame(px, pyy, pw, phh, col, '#1a0033', 6, rgba(col, 0.7));
      this.foil(px + 6, pyy + 6, pw - 12, phh - 12, 0.35);
      if (pr.type === 'item') {
        this.txt(`${pr.name.toUpperCase()}!`, cx, pyy + 40 * ui, Math.round(28 * ui), col, 'center', 'display', { spacing: 2, stroke: [4, '#000'] });
        this.txt(`NEW ${pr.kind.toUpperCase()}  +  ${pr.coins} COINS`, cx, pyy + 68 * ui, Math.round(14 * ui), '#fff', 'center', 'mono', { shadow: [1, 1, '#000'] });
      } else {
        this.txt(`+${pr.coins} COINS!`, cx, pyy + 50 * ui, Math.round(34 * ui), C.gold, 'center', 'display', { spacing: 2, stroke: [4, '#000'] });
        this.txt('SPEND THEM IN THE COLLECTION', cx, pyy + 74 * ui, Math.round(12 * ui), '#fff', 'center', 'mono', { shadow: [1, 1, '#000'] });
      }
      ctx.restore();
    }
  };

  /* ================= HUD ================= */
  R.drawHUD = function (sim, game) {
    const ctx = this.ctx, w = this.w, h = this.h;
    this.screenTransform();
    this.frameDt = this.frameDt || 1 / 60;
    const def = sim.charDef, rd = sim.rider, ui = this.uiScale(), juice = this.juice;
    const M = WR.meta;
    // rider panel
    const pw = 260 * ui, ph = (def.id === 'bike' ? 88 : 72) * ui;
    this.frame(12, 12, pw, ph, C.cyan, 'rgba(0,17,51,0.88)', 3);
    this.txt(def.name, 24 * ui, 36 * ui, Math.round(17 * ui), '#fff', 'left', 'body', { shadow: [1, 1, '#000'] });
    this.txt(def.vehicle.toUpperCase(), 24 * ui, 53 * ui, Math.round(11 * ui), C.cyan, 'left', 'mono', { spacing: 1 });
    const hp = clamp(rd.health, 0, 100) / 100;
    const hbx = 24 * ui, hby = 61 * ui, hbw = 222 * ui, hbh = 9 * ui;
    ctx.fillStyle = '#050505'; ctx.fillRect(hbx, hby, hbw, hbh);
    if (rd.alive) {
      const segs = 20, sw = hbw / segs;
      ctx.fillStyle = mix('#ff0033', '#00ff00', hp);
      for (let i = 0; i < Math.ceil(segs * hp); i++) ctx.fillRect(hbx + i * sw + 1, hby + 1, sw - 2, hbh - 2);
    } else this.txt('DEAD', hbx + hbw / 2, hby + hbh - 1, Math.round(9 * ui), C.red, 'center', 'mono');
    if (def.id === 'bike' && sim.vehicle.child) {
      const k = sim.vehicle.child;
      const st = !k.alive ? 'DEAD' : (k.isAttached() ? 'ON BOARD' : 'AIRBORNE');
      this.txt(`${(def.name2 || 'Passenger').toUpperCase()}: ${st}`, 24 * ui, 86 * ui, Math.round(11 * ui), k.alive ? '#cceeff' : C.red, 'left', 'mono');
    }
    if (game.runDaily) this.badge(`DAILY · ${game.runDaily.modifier.name}`, 12 + pw / 2, 12 + ph + 16 * ui, Math.round(11 * ui), null, '#660033');
    // timer: LED board
    const cx = w / 2, ty = cx - 130 * ui < 12 + pw + 8 ? 12 + ph + 36 * ui : 0;
    const tw = 250 * ui, th = 64 * ui, tx = cx - tw / 2, tyy = 10 + ty;
    ctx.fillStyle = '#050505'; ctx.fillRect(tx, tyy, tw, th);
    this.bevel(tx, tyy, tw, th, 4, '#222', '#666');
    const time = sim.status === 'won' ? sim.winTime : sim.time;
    const over = sim.level.par && time > sim.level.par;
    this.txt(this.fmtTime(time), cx, tyy + 36 * ui, Math.round(30 * ui), over ? '#ff2222' : '#22ff44', 'center', 'mono', { glow: over ? 'rgba(255,40,40,0.9)' : 'rgba(40,255,80,0.9)', blur: 8, spacing: 3 });
    const bw = 210 * ui, bx = cx - bw / 2, by = tyy + 46 * ui;
    ctx.fillStyle = '#222'; ctx.fillRect(bx, by, bw, 8 * ui);
    this.rainbowRule(bx, by, Math.max(8 * ui, bw * sim.progress), 8 * ui);
    ctx.beginPath(); ctx.arc(bx + bw * sim.progress, by + 4 * ui, 7 * ui, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
    // combo counter: grows and wobbles with each step
    if (juice && juice.chain >= 2) {
      if (this.comboSeen !== juice.chain) { this.comboSeen = juice.chain; this.comboPop = 1; }
      this.comboPop = Math.max(0, (this.comboPop || 0) - this.frameDt * 3);
      const sz = Math.round((26 + Math.min(juice.chain, 10) * 2.2) * ui);
      const wob = WR.reducedMotion ? 0 : Math.sin(this.t * 14) * 0.06;
      const sc = 1 + (WR.reducedMotion ? 0 : this.comboPop * 0.5);   // pops bigger on each step, then settles
      ctx.save(); ctx.translate(cx, tyy + th + 34 * ui); ctx.rotate(wob); ctx.scale(sc, sc);
      this.popText(`COMBO x${juice.mult % 1 ? juice.mult.toFixed(1) : juice.mult}`, 0, 0, sz, C.gold, 0.5, 9, juice.mult >= 3);
      ctx.restore();
      const k = clamp(juice.chainT / 2.5, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 70 * ui, tyy + th + 54 * ui, 140 * ui, 5 * ui);
      ctx.fillStyle = C.hot; ctx.fillRect(cx - 70 * ui, tyy + th + 54 * ui, 140 * ui * k, 5 * ui);
    } else this.comboSeen = 0;
    // right panel: coins, style, star goals, best
    const rw = 230 * ui, rx = w - 12 - rw;
    const rules = M ? M.starRules(sim.level) : [];
    const rh2 = (122 + 16) * ui;
    this.frame(rx, 12, rw, rh2, C.hot, 'rgba(26,0,51,0.88)', 3);
    const bump = (this.coinBump || 0);
    this.coinHud = { x: rx + 30 * ui, y: 12 + 28 * ui };
    ctx.save(); ctx.translate(rx + 30 * ui, 12 + 28 * ui); ctx.scale(1 + bump * 0.35, 1 + bump * 0.35);
    this.coinShape(ctx, 0, 0, 13 * ui, 1, 1.5); ctx.restore();
    const coins = juice ? juice.coins : 0, total = juice ? juice.tokens.length : 0;
    this.txt(`${coins}/${total}`, rx + 50 * ui, 12 + 36 * ui, Math.round(24 * ui * (1 + bump * 0.15)), C.gold, 'left', 'display', { stroke: [3, '#000'], spacing: 1 });
    // style counter ticks up instead of jumping
    const target = juice ? juice.style : 0;
    if (this.styleSim !== sim) { this.styleSim = sim; this.styleShown = target; }
    this.styleShown += (target - this.styleShown) * (1 - Math.exp(-this.frameDt * 10));
    if (Math.abs(target - this.styleShown) < 1) this.styleShown = target;
    this.txt(`STYLE ${Math.round(this.styleShown)}`, rx + rw - 14 * ui, 12 + 36 * ui, Math.round(18 * ui), C.hot, 'right', 'display', { stroke: [3, '#000'], spacing: 1 });
    // live star goals
    const st = this.liveStars(sim, juice, rules);
    rules.forEach((r, i) => {
      const yy = 12 + (62 + i * 22) * ui;
      this.starIcon(rx + 24 * ui, yy - 4 * ui, 8 * ui, st[i] === true, false);
      const lbl = r.id === 'finish' ? 'FINISH' : (r.id === 'par' ? `UNDER ${this.fmtPar(r.target)}` : `STYLE ${r.target}+`);
      this.txt(lbl, rx + 40 * ui, yy, Math.round(12 * ui), st[i] === false ? '#775577' : (st[i] ? C.gold : '#fff'), 'left', 'mono');
      if (st[i] === false) { ctx.strokeStyle = '#ff0033'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx + 38 * ui, yy - 4 * ui); ctx.lineTo(rx + 40 * ui + this.measure(lbl, Math.round(12 * ui), 'mono'), yy - 4 * ui); ctx.stroke(); }
    });
    const lid = sim.level.id || String(sim.level.index);
    const best = game.best && game.best[lid] ? game.best[lid][def.id] : null;
    this.txt(`${sim.level.name.toUpperCase()}${best != null ? '  BEST ' + this.fmtTime(best) : ''}`, rx + rw / 2, 12 + rh2 - 10 * ui, Math.round(10 * ui), C.cyan, 'center', 'mono');
    // brag ticker along the bottom
    const tkH = Math.round(14 * ui + 14 * ui);
    this.ticker(h - tkH, this.playTickerText(sim, game, juice), 'play');
    // control hints, fading out after a few seconds
    const fade = clamp((9 - sim.time) / 2, 0, 1);
    if (fade > 0 && sim.status === 'playing') {
      ctx.globalAlpha = fade;
      const custom = rideKeysLine();
      const extra = custom ? this.wrapLines(custom, 396 * ui, Math.round(13 * ui), 'body') : [];
      const cl = def.controls.concat(extra, [`${K('restart')}: restart   ${K('pause')}: pause   ${K('back')}: courses   ${K('mute')}: mute`]);
      const lh = 19 * ui, chh = (cl.length * lh + 16 * ui);
      // at least the original 420 px, wider when the nexus text scale makes a line longer
      const cw = Math.min(w - 24, Math.max(420 * ui, ...cl.map((l, i) => this.measure(l, Math.round(13 * ui), i === cl.length - 1 ? 'mono' : 'body') + 24 * ui)));
      this.frame(12, h - tkH - 10 - chh, cw, chh, C.lime, 'rgba(0,26,0,0.85)', 3);
      cl.forEach((l, i) => this.txt(l, 24 * ui, h - tkH - 10 - chh + (24 + i * 19) * ui, Math.round(13 * ui), i === cl.length - 1 ? '#cceeff' : '#fff', 'left', i === cl.length - 1 ? 'mono' : 'body'));
      ctx.globalAlpha = 1;
    }
    if (this.stillFor > 4 && sim.status === 'playing') {
      const bw2 = 300 * ui, bh2 = 38 * ui;
      this.frame(w / 2 - bw2 / 2, h - tkH - 20 * ui - bh2, bw2, bh2, C.gold, '#221a00', 3);
      this.txt(`STUCK? PRESS ${K('restart')} TO RESTART`, w / 2, h - tkH - 20 * ui - bh2 / 2 + 5 * ui, Math.round(15 * ui), C.gold, 'center', 'mono', { spacing: 1 });
    }
    if (game.muted) this.badge(`MUTED (${K('mute')})`, w - 70 * ui, h - tkH - 18 * ui, Math.round(12 * ui), null, '#333366');
    this.toastY = tyy + th + 70 * ui;
    this.drawToasts(game);
  };
  /** [finish, par, style]: true = earned, false = no longer possible this run, null = still open. */
  R.liveStars = function (sim, juice, rules) {
    const won = sim.status === 'won', dead = sim.status === 'dead';
    const t = won ? sim.winTime : sim.time, style = juice ? juice.style : 0;
    return rules.map((r) => {
      if (r.id === 'finish') return won ? true : (dead ? false : null);
      if (r.id === 'par') return t > r.target || dead ? false : (won ? true : null);
      if (r.id === 'style') return style >= r.target ? (dead ? false : (won ? true : null)) : (dead || won ? false : null);
      return null;
    });
  };
  R.playTickerText = function (sim, game, juice) {
    const items = [sim.level.name.toUpperCase()];
    const lid = sim.level.id;
    const best = game.best && game.best[lid] && game.best[lid][sim.charDef.id];
    if (best != null) items.push(`BEST ${this.fmtTime(best)}`);
    const mi = this.metaInfo(game);
    items.push(`DAY STREAK ${mi.streak}`);
    if (game.runDaily) items.push(`DAILY: ${game.runDaily.modifier.name}`);
    if (game.lastReport && game.lastReport.sim === sim) {
      const r = game.lastReport.rep;
      if (r.bestTime) items.push('NEW HIGH SCORE');
      if (r.newStars.length) items.push(`+${r.newStars.length} STAR${r.newStars.length > 1 ? 'S' : ''}`);
    }
    if (juice) for (const f of juice.feed.slice(-3)) items.push(f);
    return items.join('  ★  ');
  };

  /* ================= overlays ================= */
  R.drawOverlay = function (sim, game, dt) {
    const ctx = this.ctx, w = this.w, h = this.h;
    this.screenTransform();
    const ui = this.uiScale();
    if (this.lastStatusSim !== sim) { this.lastStatusSim = sim; this.lastStatus = sim.status; this.confetti = []; this.resultFx = {}; }
    const rep = game.lastReport && game.lastReport.sim === sim ? game.lastReport.rep : null;
    if (sim.status === 'won' && this.lastStatus !== 'won') {
      const three = rep ? rep.stars.finish && rep.stars.par && rep.stars.style : false;
      this.confettiBurst(w / 2, h * 0.35, three ? 180 : 80, three ? 120 : 75);
    }
    this.lastStatus = sim.status;
    const fire = (key, name, n) => { if (!this.resultFx[key]) { this.resultFx[key] = 1; if (game.audio) game.audio.sting(name, n); } };
    if (game.userPaused && sim.status === 'playing') {
      ctx.fillStyle = 'rgba(0,0,51,0.6)'; ctx.fillRect(0, 0, w, h);
      const pw = 400 * ui, ph = 170 * ui, px = w / 2 - pw / 2, py = h * 0.32;
      this.frame(px, py, pw, ph, C.hot, '#1a0033', 6, 'rgba(255,0,255,0.6)');
      this.heading('PAUSED', w / 2, py + 58 * ui, Math.round(40 * ui));
      const bw = 160 * ui, bh = 44 * ui;
      this.btn(`RESUME (${K('pause')})`, w / 2 - bw - 8 * ui, py + ph - bh - 22 * ui, bw, bh, { type: 'resume' }, 'go');
      this.btn(`COURSES (${K('back')})`, w / 2 + 8 * ui, py + ph - bh - 22 * ui, bw, bh, { type: 'menu' }, 'blue');
      if (game.fromNexus) this.btn('◄ NEXUS', w / 2 - 70 * ui, py + ph + 14 * ui, 140 * ui, 36 * ui, { type: 'nexus' }, 'hot');   // back to the launcher
    } else if (sim.status === 'dead' && sim.afterTime > 0.6) {
      const a = clamp((sim.afterTime - 0.6) / 0.5, 0, 1);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, `rgba(40,0,0,${0.75 * a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = a;
      const pw = 540 * ui, ph = (rep && rep.daily ? 330 : 300) * ui, px = w / 2 - pw / 2, py = h * 0.22;
      const slide = WR.reducedMotion ? 0 : (1 - elastic(clamp((sim.afterTime - 0.6) / 0.7, 0, 1))) * -60 * ui;
      ctx.save(); ctx.translate(0, slide);
      this.frame(px, py, pw, ph, C.red, '#150000', 6, 'rgba(255,0,51,0.45)');
      const sk = WR.reducedMotion ? 0 : Math.max(0, 1 - (sim.afterTime - 0.6) / 0.5) * 8 * prefs().shake;   // text jitter follows the shake scale
      this.txt('WRECKED!', w / 2 + (Math.random() - 0.5) * sk, py + 66 * ui, Math.round(58 * ui), C.red, 'center', 'display', { spacing: 6, shadow: [3, 3, '#000'], glow: 'rgba(255,0,51,0.9)', blur: 16 });
      this.txt(`${this.shortName(sim.charDef).toUpperCase()} IS DEAD`, w / 2, py + 100 * ui, Math.round(20 * ui), '#fff', 'center', 'body', { shadow: [2, 2, '#000'] });
      this.txt(this.causeText(sim.cause).toUpperCase(), w / 2, py + 126 * ui, Math.round(14 * ui), C.gold, 'center', 'mono', { spacing: 1 });
      const pb = 300 * ui;
      ctx.fillStyle = '#222'; ctx.fillRect(w / 2 - pb / 2, py + 142 * ui, pb, 8 * ui);
      this.rainbowRule(w / 2 - pb / 2, py + 142 * ui, pb * sim.progress, 8 * ui);
      this.txt(`MADE IT ${Math.round(sim.progress * 100)}% OF THE WAY`, w / 2, py + 170 * ui, Math.round(13 * ui), C.cyan, 'center', 'mono');
      const j = this.juice;
      if (j) this.txt(`STYLE ${j.style}   ·   +${j.coins} COINS BANKED`, w / 2, py + 194 * ui, Math.round(15 * ui), C.gold, 'center', 'mono', { glow: C.gold, blur: 5 });
      if (rep && rep.daily) this.txt(`DAILY SCORE ${rep.daily.score}${rep.daily.best ? '  NEW BEST!' : `   BEST ${rep.daily.prev}`}`, w / 2, py + 220 * ui, Math.round(15 * ui), C.hot, 'center', 'mono');
      const bw = 190 * ui, bh = 46 * ui;
      this.btn(`RETRY (${K('restart')})`, w / 2 - bw - 10 * ui, py + ph - bh - 22 * ui, bw, bh, { type: 'restart' }, 'go', { focus: true });
      this.btn(`COURSES (${K('back')})`, w / 2 + 10 * ui, py + ph - bh - 22 * ui, bw, bh, { type: 'menu' }, 'blue');
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (sim.status === 'won') {
      const at = sim.afterTime;
      const a = clamp(at / 0.35, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgba(0,0,51,${0.45 * a})`; ctx.fillRect(0, 0, w, h);
      const pw = Math.min(w - 30, 640 * ui), ph = Math.min(h - 40, (rep && rep.daily ? 520 : 494) * ui), px = w / 2 - pw / 2, py = Math.max(16, h * 0.5 - ph / 2 - 10 * ui);
      const slide = WR.reducedMotion ? 0 : (1 - elastic(clamp(at / 0.8, 0, 1))) * -80 * ui;
      ctx.save(); ctx.translate(0, slide);
      this.frame(px, py, pw, ph, C.hot, '#1a0033', 6, 'rgba(255,0,255,0.6)');
      this.rainbowWord('FINISH!', w / 2, py + 54 * ui, Math.round(60 * ui));
      this.txt(this.fmtTime(sim.winTime), w / 2, py + 112 * ui, Math.round(34 * ui), '#22ff44', 'center', 'mono', { glow: 'rgba(40,255,80,0.9)', blur: 8, spacing: 3 });
      if (rep && rep.bestTime) this.badge(rep.prevTime != null ? `NEW BEST! (WAS ${this.fmtTime(rep.prevTime)})` : 'NEW BEST!', w / 2, py + 136 * ui, Math.round(12 * ui), 0);
      // stars land one by one
      const stars = rep ? [rep.stars.finish, rep.stars.par, rep.stars.style] : [true, false, false];
      for (let i = 0; i < 3; i++) {
        const t0 = 0.6 + i * 0.45, sx = w / 2 + (i - 1) * 84 * ui, sy = py + 186 * ui;
        this.starIcon(sx, sy, 32 * ui, false, false);
        if (stars[i] && at > t0) {
          fire('star' + i, 'star', i + 1);
          const p = clamp((at - t0) / 0.4, 0, 1);
          const sc = WR.reducedMotion ? 1 : 2.2 - 1.2 * easeOutBack(p);
          ctx.save(); ctx.translate(sx, sy); ctx.scale(sc, sc); ctx.rotate((1 - p) * 0.8);
          this.starIcon(0, 0, 32 * ui, true, true);
          ctx.restore();
        }
      }
      // the rules, with what this run did
      const j = this.juice, styleV = j ? j.style : 0;
      const rules = WR.meta ? WR.meta.starRules(sim.level) : [];
      const tStyle = clamp((at - 0.4) / 1.0, 0, 1);
      rules.forEach((r, i) => {
        const yy = py + (246 + i * 30) * ui;
        const ok = stars[i];
        this.checkMark(px + 46 * ui, yy - 5 * ui, 16 * ui, !!ok);
        let you = '';
        if (r.id === 'par') you = `you: ${this.fmtTime(sim.winTime)}`;
        if (r.id === 'style') you = `you: ${Math.round(styleV * tStyle)}`;
        this.txt(r.label, px + 66 * ui, yy, Math.round(16 * ui), ok ? '#fff' : '#aa99bb', 'left', 'body', { weight: ok ? 'bold' : 'normal' });
        this.txt(you, px + pw - 30 * ui, yy, Math.round(14 * ui), ok ? C.lime : '#aa99bb', 'right', 'mono');
        if (rep && rep.newStars.includes(r.id)) this.badge('NEW!', px + pw - 30 * ui - this.measure(you, Math.round(14 * ui), 'mono') - 34 * ui, yy - 5 * ui, Math.round(11 * ui), 0.2 * i);
      });
      let yy = py + 352 * ui;
      if (j) {
        this.coinShape(ctx, w / 2 - 120 * ui, yy - 6 * ui, 11 * ui, 1, 1.5);
        this.txt(`+${j.coins} COINS   ·   ${j.flips} FLIPS   ·   ${j.severs} LIMBS LOST`, w / 2 - 100 * ui, yy, Math.round(14 * ui), C.gold, 'left', 'mono');
      }
      const k = sim.vehicle.child;
      if (k) { yy += 22 * ui; this.txt(k.alive ? `${k.name} survived the ride.` : `${k.name} did not make it.`, w / 2, yy, Math.round(13 * ui), k.alive ? '#cceeff' : '#ff8a80', 'center', 'body', { weight: 'normal' }); }
      if (rep && rep.daily) { yy += 24 * ui; this.txt(`DAILY SCORE ${rep.daily.score}${rep.daily.best ? '  NEW BEST!' : `   BEST ${rep.daily.prev}`}`, w / 2, yy, Math.round(16 * ui), C.hot, 'center', 'mono', { glow: C.hot, blur: 6 }); }
      if (rep && rep.unlocked.length && at > 2.0) {
        fire('unlock', 'unlock', 1);
        yy += 30 * ui;
        const names = rep.unlocked.map((id) => (WR.meta.BY_ID[id] || { name: id }).name.toUpperCase()).join(' · ');
        const uw = Math.min(pw - 40 * ui, this.measure(`UNLOCKED: ${names}`, Math.round(15 * ui), 'display', 1) + 60 * ui);
        this.frame(w / 2 - uw / 2, yy - 20 * ui, uw, 30 * ui, C.gold, '#221a00', 3);
        this.foil(w / 2 - uw / 2 + 3, yy - 17 * ui, uw - 6, 24 * ui, 0.3);
        this.txt(`UNLOCKED: ${names}`, w / 2, yy, Math.round(15 * ui), C.gold, 'center', 'display', { spacing: 1, stroke: [3, '#000'] });
        this.badge('NEW!', w / 2 + uw / 2 - 4, yy - 20 * ui, Math.round(11 * ui), 0);
      }
      const last = game.levelIndex + 1 >= game.levels.length || game.runDaily;
      const bw = Math.min(186 * ui, (pw - 60 * ui) / 3), bh = 46 * ui, gap = 18 * ui, by = py + ph - bh - 20 * ui;
      this.btn(last ? 'COURSES' : `NEXT (${K('confirm')})`, w / 2 - bw * 1.5 - gap, by, bw, bh, last ? { type: 'menu' } : { type: 'next' }, 'go', { focus: true });
      this.btn(`AGAIN (${K('restart')})`, w / 2 - bw / 2, by, bw, bh, { type: 'restart' }, 'hot');
      this.btn(`COURSES (${K('back')})`, w / 2 + bw / 2 + gap, by, bw, bh, { type: 'menu' }, 'blue');
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    this.drawConfettiFx(dt);
  };
})();
