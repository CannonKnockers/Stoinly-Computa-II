/* ACCOUNT FULL — board renderer
   Draws the simulation state onto the canvas. Owns nothing but the visual
   effects list, which it builds from the events the sim hands over.

   Colour discipline: the six lane colours belong to the cards. Money is one
   paper colour, told apart by size and by its printed value; modifiers are
   marks on the paper, not new colours. */
(function (AF) {
  'use strict';

  const D = AF.DATA, P = AF.PATH, LANES = D.LANES;
  const W = D.BOARD.w, H = D.BOARD.h;
  const TOWER_R = AF.TOWER_R;

  const PAPER = { fill: '#d3dfc8', fillBig: '#bfd0b0', edge: 'rgba(14,36,22,0.55)', ink: '#14301f', light: '#e6efdf' };
  const CHECK = { fill: '#eef1f8', ink: '#2a3a6a', mark: '#8fa0d8' };
  // bill size by face value, in board units; the printed value does the rest
  function billSize(v) {
    if (v < 5) return [30, 18];
    if (v < 10) return [32, 19];
    if (v < 20) return [34, 20];
    if (v < 50) return [37, 21];
    if (v < 100) return [40, 22];
    return [44, 23];
  }

  const images = {};
  function loadImages() {
    const jobs = [];
    for (const c of D.CARDS) {
      const im = new Image();
      jobs.push(new Promise(res => { im.onload = res; im.onerror = res; }));
      im.src = c.img;
      images[c.id] = im;
    }
    return Promise.all(jobs);
  }

  // draw an image "cover"-fitted into a w×h box at (x, y) top-left, honouring the card's focal point
  function drawCover(ctx, card, x, y, w, h) {
    const im = images[card.id];
    if (!im || !im.naturalWidth) { ctx.fillStyle = '#222a4a'; ctx.fillRect(x, y, w, h); return; }
    const [px, py] = (card.pos || '50% 50%').split(' ').map(s => parseFloat(s) / 100);
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const s = Math.max(w / iw, h / ih);
    const sw = w / s, sh = h / s;
    const sx = Math.max(0, Math.min(iw - sw, (iw - sw) * px));
    const sy = Math.max(0, Math.min(ih - sh, (ih - sh) * py));
    ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // ---------------------------------------------------------------- static layers
  // site fonts; Oswald is bundled, so it stands in where Impact is not installed
  const DISPLAY = 'Impact, Haettenschweiler, "Arial Black", Oswald, sans-serif';
  const MONO = '"Courier New", "Liberation Mono", "IBM Plex Mono", monospace';
  const RAINBOW = ['#ff0000', '#ff8800', '#ffee00', '#00ff00', '#00ffff', '#0088ff', '#ff00ff'];

  // board themes are cosmetic unlocks; each one paints the ground, the track, and the two labels
  const THEMES = {
    'board-stars': { bg: '#000033', edge: '#ff00ff', bed: '#1a0033', dash: 'rgba(0,255,255,0.35)', label: '#00ff00', glow: 'rgba(255,0,255,0.55)' },
    'board-grid': { bg: '#12002a', edge: '#00ffff', bed: '#22004a', dash: 'rgba(255,0,255,0.45)', label: '#00ffff', glow: 'rgba(0,255,255,0.5)' },
    'board-felt': { bg: '#0b4a2c', edge: '#ffd700', bed: '#5a0b14', dash: 'rgba(255,215,0,0.4)', label: '#ffd700', glow: 'rgba(255,215,0,0.35)' },
    'board-vault': { bg: '#2a2e38', edge: '#c9d0f4', bed: '#14161c', dash: 'rgba(255,255,255,0.25)', label: '#e8ecff', glow: 'rgba(200,210,255,0.3)' },
    'board-construction': { bg: '#141000', edge: '#ffcc00', bed: '#000000', dash: 'rgba(255,204,0,0.5)', label: '#ffcc00', glow: 'rgba(255,204,0,0.4)' },
  };
  let themeId = null;
  function theme() { return THEMES[themeId] || THEMES['board-stars']; }

  let bgCanvas = null;
  function starTile(c, ox, oy) {
    // the site's six-dot 160px starfield tile
    const dots = [[18, 22, 1.5, '#ffffff'], [72, 48, 1, '#a0d0ff'], [110, 92, 1.5, '#ffffff'], [44, 118, 1, '#ffe0a0'], [136, 12, 1, '#ffffff'], [96, 140, 1.5, '#ffffff']];
    for (const [x, y, r, col] of dots) { c.fillStyle = col; c.beginPath(); c.arc(ox + x, oy + y, r, 0, Math.PI * 2); c.fill(); }
  }
  let bgKey = '';
  // what the cached board depends on besides the theme: glow (performance mode) and label size (text scale)
  function bgLook() { const j = J(); return (j.perf ? 'perf' : 'full') + '|' + (j.textScale || 1); }
  function buildBackground() {
    themeId = (AF.meta && AF.meta.equipped('board')) || 'board-stars';
    bgKey = bgLook();
    bgCanvas = paintBoard(themeId);
  }
  function paintBoard(id) {
    const T = THEMES[id] || THEMES['board-stars'];
    const themeId = id;
    const perf = J().perf, ts = J().textScale || 1;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const c = out.getContext('2d');
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    if (themeId === 'board-stars') {
      for (let y = 0; y < H; y += 160) for (let x = 0; x < W; x += 160) starTile(c, x, y);
    } else if (themeId === 'board-grid') {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b0a4d'); g.addColorStop(1, '#05000f'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,0,255,0.22)'; c.lineWidth = 1;
      for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      for (let y = 0; y < H; y += 160) for (let x = 0; x < W; x += 160) starTile(c, x, y);
    } else if (themeId === 'board-felt') {
      c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
      for (let i = -H; i < W; i += 28) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke(); c.beginPath(); c.moveTo(i + H, 0); c.lineTo(i, H); c.stroke(); }
      const v = c.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    } else if (themeId === 'board-vault') {
      for (let x = 0; x < W; x += 4) { c.fillStyle = 'rgba(255,255,255,' + (0.015 + 0.02 * Math.abs(Math.sin(x * 0.37))) + ')'; c.fillRect(x, 0, 2, H); }
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let y = 30; y < H; y += 120) for (let x = 30; x < W; x += 120) { c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(x - 1, y - 1, 2, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(0,0,0,0.35)'; }
    } else if (themeId === 'board-construction') {
      c.save(); c.globalAlpha = 0.9;
      for (const [y0, h] of [[0, 14], [H - 14, 14]]) { c.save(); c.beginPath(); c.rect(0, y0, W, h); c.clip(); for (let x = -40; x < W + 40; x += 36) { c.fillStyle = '#ffcc00'; c.beginPath(); c.moveTo(x, y0 + h); c.lineTo(x + 18, y0 + h); c.lineTo(x + 18 + h, y0); c.lineTo(x + h, y0); c.closePath(); c.fill(); } c.restore(); }
      c.restore();
      for (let y = 0; y < H; y += 160) for (let x = 0; x < W; x += 160) starTile(c, x, y);
    }
    // track band: a glowing edge, a dark bed, a dashed centre line
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); P.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.save(); c.shadowColor = T.glow; c.shadowBlur = perf ? 0 : 18; c.strokeStyle = T.edge; c.globalAlpha = 0.8; c.lineWidth = P.HALF_W * 2 + 6; c.stroke(); c.restore();
    c.strokeStyle = '#000'; c.lineWidth = P.HALF_W * 2 + 1; c.stroke();
    c.strokeStyle = T.bed; c.lineWidth = P.HALF_W * 2 - 2; c.stroke();
    c.setLineDash([8, 14]); c.strokeStyle = T.dash; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
    // labels sit on the track itself, where nothing can be placed over them
    c.font = 'bold ' + (13 * ts) + 'px ' + MONO; c.letterSpacing = '2.5px';
    c.save(); c.shadowColor = T.label; c.shadowBlur = perf ? 0 : 6; c.fillStyle = T.label;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('THE MAIL', 46, 140);
    c.textAlign = 'right';
    c.fillText('THE ACCOUNT · FULL', W - 44, 300);
    c.restore();
    // chevrons
    c.strokeStyle = T.label; c.globalAlpha = 0.6; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 2; i++) { const x = 12 + i * 11; c.beginPath(); c.moveTo(x, 133); c.lineTo(x + 6, 140); c.lineTo(x, 147); c.stroke(); }
    for (let i = 0; i < 2; i++) { const x = W - 32 + i * 11; c.beginPath(); c.moveTo(x, 293); c.lineTo(x + 6, 300); c.lineTo(x, 307); c.stroke(); }
    c.globalAlpha = 1;
    return out;
  }
  // thumbnails for the collection screen
  function preview(item, cv) {
    const c = cv.getContext('2d');
    if (item.kind === 'board') { c.drawImage(paintBoard(item.id), 0, 0, W, H, 0, 0, cv.width, cv.height); return; }
    c.fillStyle = '#000033'; c.fillRect(0, 0, cv.width, cv.height);
    const cols = BURST_COLORS[item.id] || BURST_COLORS['burst-confetti'];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cx = cv.width / 2, cy = cv.height / 2;
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, d = 10 + rnd() * 42;
      c.save(); c.translate(cx + Math.cos(a) * d * 1.5, cy + Math.sin(a) * d); c.rotate(rnd() * 6); c.fillStyle = cols[i % cols.length];
      drawParticle(c, item.id, 3 + rnd() * 3, 0.2);
      c.restore();
    }
    c.font = '15px ' + DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = '#000'; c.lineJoin = 'round';
    c.strokeText('$20', cx, cy); c.fillStyle = '#ffd700'; c.fillText('$20', cx, cy);
  }
  function drawParticle(ctx, style, r, q) {
    if (style === 'burst-gum') { ctx.beginPath(); ctx.arc(0, 0, r * (0.8 + q * 0.6), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, Math.PI * 2); ctx.fill(); }
    else if (style === 'burst-sparkle') { ctx.beginPath(); for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4, rr = j % 2 ? r * 0.35 : r * 1.4; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
    else if (style === 'burst-hearts') { ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.bezierCurveTo(-r * 1.6, -r * 0.2, -r * 0.6, -r * 1.4, 0, -r * 0.4); ctx.bezierCurveTo(r * 0.6, -r * 1.4, r * 1.6, -r * 0.2, 0, r * 0.9); ctx.fill(); }
    else if (style === 'burst-cash') { ctx.fillRect(-r * 1.3, -r * 0.7, r * 2.6, r * 1.4); ctx.strokeStyle = 'rgba(20,48,31,0.6)'; ctx.lineWidth = 0.8; ctx.strokeRect(-r * 1.3, -r * 0.7, r * 2.6, r * 1.4); }
    else ctx.fillRect(-r / 2, -r * 0.8, r, r * 1.6);
  }
  function setTheme() { bgCanvas = null; }

  // ---------------------------------------------------------------- effects
  const fx = [];
  const parts = [];                     // particles: kill bursts and sparkles, capped
  const shake = { t: 0, amp: 0 };
  const banners = [];
  const flashes = new WeakMap();        // bill -> time its white hit flash ends
  const juiceQ = [];                    // things the DOM layer should do: coins to the counter
  let hitStopUntil = 0;
  let lastGum = null;
  // where a leak is shown: the last stretch of track that is still on the board
  const LEAK_AT = P.posAt(P.length - 110);
  // AF.juice holds the motion and display switches (reduced, flashes, shake, particles, perf, textScale)
  const J = () => AF.juice || { reduced: false, flashes: true, shake: 1, particles: 1, perf: false, textScale: 1, comboHit() { return 1; }, comboBreak() {}, comboTick() {} };

  function reset() { fx.length = 0; parts.length = 0; banners.length = 0; juiceQ.length = 0; shake.t = 0; shake.amp = 0; lastGum = null; hitStopUntil = 0; }

  function addShake(now, amp) { amp *= J().shake; if (!(amp > 0)) return; if (now - shake.t > 0.4 || amp > shake.amp) { shake.t = now; shake.amp = amp; } }
  // pop-up number: Impact with a black outline, scales from 1.6 to 1 with overshoot, drifts up and fades
  function pop(now, x, y, text, color, size, opts) {
    fx.push(Object.assign({ k: 'pop', x, y, text, c: color, size, t: now, life: 0.85 }, opts || {}));
  }
  const BURST_COLORS = {
    'burst-confetti': ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'],
    'burst-gum': ['#ff7ad9', '#ff9be6', '#f6b9d8', '#ff4fc3'],
    'burst-sparkle': ['#ffd700', '#fff4a0', '#ffffff'],
    'burst-cash': ['#9fd88a', '#c8e6b0', '#7cc46a'],
    'burst-hearts': ['#ff2a55', '#ff5e7e', '#ff00ff'],
  };
  function burstParticles(now, x, y, n, power) {
    n = Math.ceil(n * J().particles);
    if (!n || parts.length > 700) return;
    const style = (AF.meta && AF.meta.equipped('burst')) || 'burst-confetti';
    const cols = BURST_COLORS[style] || BURST_COLORS['burst-confetti'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (60 + Math.random() * 160) * (power || 1);
      parts.push({ style, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 * (power || 1), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: cols[i % cols.length], t: now, life: 0.55 + Math.random() * 0.45, s: 3 + Math.random() * 3 * Math.min(2, power || 1) });
    }
  }
  function nearestBill(sim, x, y) {
    let best = null, bd = 900;
    for (const b of sim.bills) { const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  function absorb(sim, events, now, audio) {
    const gameTime = sim.time;
    let lastFinish = null, roundBonus = false;
    for (const e of events) {
      switch (e.type) {
        case 'tracer': fx.push({ k: 'tracer', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, c: LANES[e.cat].color, t: now, life: 0.14 }); audio('hit'); break;
        case 'arc': fx.push({ k: 'arc', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t: now, life: 0.18 }); break;
        case 'hit': {
          const b = nearestBill(sim, e.x, e.y); if (b && J().flashes) flashes.set(b, now + 0.05);
          if (e.amt >= 1) {
            const crit = e.amt >= 100;
            const text = '-$' + (e.amt >= 10 ? AF.fmt(e.amt) : e.amt.toFixed(e.amt % 1 ? 1 : 0));
            pop(now, e.x + (Math.random() * 14 - 7), e.y - 14, text, e.dtype === 'transaction' ? '#ffb347' : e.dtype === 'void' ? '#00ff99' : '#ffffff', crit ? 20 : 12, { crit, life: crit ? 1.0 : 0.6 });
            if (crit) addShake(now, Math.min(6, 2 + e.amt / 200));
          }
          break;
        }
        case 'finish': {
          const n = J().comboHit(gameTime);
          fx.push({ k: 'ring', x: e.x, y: e.y, r0: 6, r1: 30, c: '#ffd700', t: now, life: 0.35, w: 2 });
          pop(now, e.x, e.y - 18, '$' + AF.fmt(e.value), '#ffd700', e.value >= 100 ? 19 : 15, { life: 0.9 });
          burstParticles(now, e.x, e.y, e.value >= 100 ? 14 : 8, e.value >= 100 ? 1.3 : 1);
          lastFinish = { x: e.x, y: e.y };
          audio('finish', e.value, n);
          break;
        }
        case 'burst': {
          J().comboHit(gameTime);
          const big = e.kind === 'bailout' ? 3 : e.kind === 'truck' ? 2 : 1;
          fx.push({ k: 'ring', x: e.x, y: e.y, r0: 10, r1: 70 + big * 30, c: '#ffd700', t: now, life: 0.5, w: 4 });
          if (J().flashes) fx.push({ k: 'flash', c: 'rgba(255,255,255,' + (0.12 * big) + ')', t: now, life: 0.12 });
          burstParticles(now, e.x, e.y, 24 * big, 1.4 + big * 0.3);
          pop(now, e.x, e.y - 30, big === 3 ? 'BAILED OUT!' : big === 2 ? 'TRUCK EMPTIED!' : 'CASE CLOSED!', 'rainbow', 22 + big * 4, { life: 1.3 });
          addShake(now, big === 3 ? 12 : big === 2 ? 7 : 4);
          // hit-stop is a motion effect: off under reduced motion
          if (!J().reduced) hitStopUntil = performance.now() + (big === 3 ? 80 : big === 2 ? 60 : 40);
          lastFinish = { x: e.x, y: e.y };
          audio('burst');
          break;
        }
        case 'leak':
          fx.push({ k: 'leak', x: LEAK_AT.x, y: LEAK_AT.y, t: now, life: 0.7 });
          if (J().flashes) fx.push({ k: 'flash', c: 'rgba(255,0,51,' + Math.min(0.3, 0.08 + e.value / 400) + ')', t: now, life: 0.3 });
          pop(now, LEAK_AT.x - 40, LEAK_AT.y - 44, '-$' + AF.fmt(e.value) + ' ROOM', '#ff0033', 20, { life: 1.3 });
          addShake(now, Math.min(10, 2 + Math.sqrt(e.value) * 0.6));
          J().comboBreak();
          audio('leak'); break;
        case 'pulse': fx.push({ k: 'ring', x: e.x, y: e.y, r0: 20, r1: e.r || 320, c: LANES[e.cat].color, t: now, life: e.r ? 0.4 : 0.9, w: 2 }); break;
        case 'busstop': fx.push({ k: 'ring', x: e.x, y: e.y, r0: e.r, r1: e.r + 6, c: LANES.vehicle.color, t: now, life: 1.4, w: 1.5 }); break;
        case 'rain': for (let i = 0, n = Math.ceil(8 * J().particles); i < n; i++) fx.push({ k: 'drop', x: e.x, y: e.y, vx: Math.random() * 120 - 60, vy: -Math.random() * 120 - 40, t: now, life: 0.7 }); break;
        case 'clean': fx.push({ k: 'ring', x: e.x, y: e.y, r0: 4, r1: 22, c: '#00ffff', t: now, life: 0.4 }); break;
        case 'accrue': pop(now, e.x, e.y - 14, '+%', '#ffee00', 10, { life: 0.5 }); break;
        case 'bounce': pop(now, e.x, e.y - 14, 'CHECK', '#b9c3ff', 10, { life: 0.4 }); break;
        case 'place': fx.push({ k: 'ring', x: e.x, y: e.y, r0: 10, r1: 44, c: '#00ffff', t: now, life: 0.35, w: 2 }); burstParticles(now, e.x, e.y, 10, 0.8); audio('place'); break;
        case 'upgrade': fx.push({ k: 'ring', x: e.x, y: e.y, r0: 14, r1: 60, c: '#ffd700', t: now, life: 0.5, w: 3 }); burstParticles(now, e.x, e.y, 18, 1); pop(now, e.x, e.y - 34, 'UPGRADE!', 'rainbow', 18, { life: 1.0 }); audio('upgrade'); break;
        case 'rise': fx.push({ k: 'ring', x: e.x, y: e.y, r0: 20, r1: 220, c: '#ffd700', t: now, life: 1.2, w: 3 }); burstParticles(now, e.x, e.y, 40, 1.6); audio('holo'); break;
        case 'banner': banners.push({ text: e.text, t: now, life: 1.8 }); break;
        case 'round': banners.push({ text: 'ROUND ' + e.round, t: now, life: 1.3, big: true }); audio('round'); break;
        case 'roundEnd':
          banners.push({ text: 'ROUND ' + e.round + ' CLEARED · +' + e.bonus + ' GUM', t: now, life: 2.0 });
          pop(now, W / 2, H * 0.46 + 46, '+' + e.bonus + ' GUM', '#ff7ad9', 26, { life: 1.4 });
          juiceQ.push({ type: 'coins', x: W / 2, y: H * 0.46 + 46, n: Math.min(8, e.bonus) });
          roundBonus = true;
          audio('roundEnd'); break;
        case 'crash': addShake(now, 16); if (J().flashes) fx.push({ k: 'flash', c: 'rgba(255,40,40,0.35)', t: now, life: 0.8 }); audio('crash'); break;
        case 'lost': audio('lost'); break;
        case 'won': audio('won'); break;
      }
    }
    // gum earned from finished money pops where the last bill went, and a coin flies to the counter
    const g = Math.floor(sim.gum);
    if (lastGum != null && g > lastGum && !roundBonus && lastFinish && sim.phase === 'running') {
      pop(now, lastFinish.x + 10, lastFinish.y + 34, '+' + (g - lastGum) + ' GUM', '#ff7ad9', 16, { life: 1.0 });
      juiceQ.push({ type: 'coins', x: lastFinish.x, y: lastFinish.y, n: g - lastGum });
    }
    lastGum = g;
    J().comboTick(gameTime);
  }

  // ---------------------------------------------------------------- draw
  // k: how much bigger than nominal to draw money and labels, so they stay legible on a small board
  function drawMoney(ctx, b, now, k) {
    const v = Math.ceil(b.value);
    ctx.save();
    ctx.translate(b.x, b.y);
    const stunned = now < b.stunUntil || now < b.holdUntil;
    if (b.kind === 'case' || b.kind === 'truck' || b.kind === 'bailout') {
      const [w, h] = b.kind === 'bailout' ? [96, 54] : b.kind === 'truck' ? [72, 40] : [46, 32];
      ctx.save();
      ctx.rotate(b.a);
      if (b.kind === 'case') {
        ctx.fillStyle = '#5b3a1e'; roundRect(ctx, -w / 2, -h / 2, w, h, 5); ctx.fill();
        ctx.strokeStyle = '#2d1a0a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = '#c9a469'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -h / 2); ctx.lineTo(-8, -h / 2 - 6); ctx.lineTo(8, -h / 2 - 6); ctx.lineTo(8, -h / 2); ctx.stroke();
      } else if (b.kind === 'truck') {
        ctx.fillStyle = '#8d93a6'; roundRect(ctx, -w / 2, -h / 2, w, h, 6); ctx.fill();
        ctx.strokeStyle = '#3c4152'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#3c4152'; [-w / 2 + 12, w / 2 - 12].forEach(x => { ctx.beginPath(); ctx.arc(x, h / 2, 6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x, -h / 2, 6, 0, Math.PI * 2); ctx.fill(); });
      } else {
        ctx.fillStyle = '#1f2a3d'; roundRect(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill();
        ctx.strokeStyle = '#e8ecff'; ctx.lineWidth = 3; ctx.stroke();
      }
      // modifier marks belong to the body, so they turn with it
      if (b.mods.strapped) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-4, -h / 2, 8, h); }
      if (b.mods.check) { ctx.strokeStyle = '#b9c3ff'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); roundRect(ctx, -w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 7); ctx.stroke(); ctx.setLineDash([]); }
      if (b.mods.crypto) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); roundRect(ctx, -w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 7); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
      // the value is always upright, on its own dark tab so it reads whichever way the body is turned
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const value = '$' + AF.fmt(v);
      ctx.font = '600 ' + ((b.kind === 'bailout' ? 13 : 11) * k) + 'px "IBM Plex Mono", monospace';
      const vw = ctx.measureText(value).width;
      if (b.kind === 'bailout') {
        ctx.font = (11 * k) + 'px ' + DISPLAY; ctx.letterSpacing = '2px';
        const tw = Math.max(vw, ctx.measureText('THE BAILOUT').width) + 12 * k, th = 34 * k;
        ctx.fillStyle = 'rgba(8,10,24,0.82)'; roundRect(ctx, -tw / 2, -th / 2, tw, th, 3 * k); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText('THE BAILOUT', 0, -8 * k); ctx.letterSpacing = '0px';
        ctx.font = '600 ' + (13 * k) + 'px "IBM Plex Mono", monospace'; ctx.fillText(value, 0, 8 * k);
      } else {
        const tw = vw + 10 * k, th = 16 * k;
        ctx.fillStyle = 'rgba(8,10,24,0.78)'; roundRect(ctx, -tw / 2, -th / 2, tw, th, 3 * k); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(value, 0, 0.5);
      }
      ctx.restore();
      return;
    }
    let [w, h] = billSize(v);
    if (b.mods.wire) { w += 4; h = 14; }
    w *= k; h *= k;
    let fill = v >= 50 ? PAPER.fillBig : PAPER.fill, ink = PAPER.ink, edge = PAPER.edge;
    if (b.mods.check) { fill = CHECK.fill; ink = CHECK.ink; edge = 'rgba(42,58,106,0.5)'; }
    if (b.mods.wire) { ctx.strokeStyle = fill; ctx.globalAlpha = 0.35; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-Math.cos(b.a) * (w + 4), -Math.sin(b.a) * (w + 4)); ctx.lineTo(0, 0); ctx.stroke(); ctx.globalAlpha = 1; }
    if (b.mods.crypto) ctx.globalAlpha = 0.5;
    ctx.fillStyle = fill; roundRect(ctx, -w / 2, -h / 2, w, h, 3 * k); ctx.fill();
    ctx.globalAlpha = 1;
    if (b.mods.crypto) { ctx.setLineDash([3, 2]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke(); }
    // a thin inner border, as printed on a banknote
    if (!b.mods.crypto && !b.mods.check) { ctx.strokeStyle = 'rgba(20,48,31,0.25)'; ctx.lineWidth = 1; roundRect(ctx, -w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5, 2); ctx.stroke(); }
    if (b.mods.check) { ctx.strokeStyle = CHECK.mark; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w / 2 + 4, h / 2 - 4); ctx.lineTo(w / 2 - 4, h / 2 - 4); ctx.stroke(); }
    if (b.mods.strapped) { ctx.fillStyle = '#f7f3e6'; ctx.fillRect(-3 * k, -h / 2, 6 * k, h); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.75; ctx.strokeRect(-3 * k, -h / 2, 6 * k, h); }
    ctx.fillStyle = b.mods.crypto ? '#ffffff' : ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 ' + ((b.mods.wire ? 10 : 11.5) * k) + 'px "IBM Plex Mono", monospace';
    ctx.fillText('$' + (v >= 1000 ? AF.fmt(v) : v), 0, 0.5);
    if (b.mods.accruing) { const r = 5 * k; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(w / 2 - 1, -h / 2 + 1, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = PAPER.ink; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = PAPER.ink; ctx.font = '700 ' + (7 * k) + 'px "IBM Plex Mono", monospace'; ctx.fillText('%', w / 2 - 1, -h / 2 + 1.5); }
    if (b.soggyUntil > now) { ctx.strokeStyle = 'rgba(90,160,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-w / 2 - 3, h / 2 + 3); ctx.lineTo(w / 2 + 3, h / 2 + 3); ctx.stroke(); }
    if (stunned) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(0, 0, Math.max(w, h) / 2 + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }

  function drawToken(ctx, card, x, y, r, tier, opts) {
    const lane = LANES[card.cat];
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.save(); ctx.clip(); drawCover(ctx, card, x - r, y - r, r * 2, r * 2); ctx.restore();
    ctx.lineWidth = opts && opts.thin ? 2 : 3; ctx.strokeStyle = lane.color; ctx.stroke();
    if (opts && opts.selected) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
    if (tier > 0) {
      for (let i = 0; i < tier; i++) { ctx.fillStyle = '#ffd700'; ctx.fillRect(x - 7 + i * 8, y + r + 4, 6, 3); }
    }
    ctx.restore();
  }

  function drawSegment(ctx, s0, s1, color, alpha, label, card, tier, opts) {
    const n = Math.max(2, Math.ceil((s1 - s0) / 6));
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const q = P.posAt(s0 + (s1 - s0) * i / n); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
    ctx.globalAlpha = alpha * 0.7; ctx.strokeStyle = color; ctx.lineWidth = P.HALF_W * 2 - 4; ctx.stroke();
    ctx.globalAlpha = Math.min(1, alpha * 3.5); ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1;
    const m = P.posAt((s0 + s1) / 2);
    const nx = -Math.sin(m.a), ny = Math.cos(m.a);        // perpendicular
    const side = (opts && opts.side) || 1;
    const ox = m.x + nx * (P.HALF_W + 24) * side, oy = m.y + ny * (P.HALF_W + 24) * side;
    if (card) {
      ctx.save(); roundRect(ctx, ox - 15, oy - 15, 30, 30, 5); ctx.clip(); drawCover(ctx, card, ox - 15, oy - 15, 30, 30); ctx.restore();
      roundRect(ctx, ox - 15, oy - 15, 30, 30, 5); ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
      if (opts && opts.selected) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; roundRect(ctx, ox - 19, oy - 19, 38, 38, 7); ctx.stroke(); }
      if (tier > 0) for (let i = 0; i < tier; i++) { ctx.fillStyle = '#ffd700'; ctx.fillRect(ox - 7 + i * 8, oy + 19, 6, 3); }
    }
    if (label) {
      ctx.font = (11 * ((opts && opts.k) || 1) * (J().textScale || 1)) + 'px ' + DISPLAY; ctx.letterSpacing = '1.5px'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, ox, oy + (card ? 32 : 0));
      ctx.letterSpacing = '0px';
    }
    ctx.restore();
    return { x: ox, y: oy };
  }

  // vehicles are cards, so they are drawn like cards: a round photo with the lane's ring
  const VEHICLE_R = 15;
  function drawVehicle(ctx, v, card, selected, now) {
    const st = AF.statsFor(card, v.tier);
    const lane = LANES.vehicle;
    if (v.stationary) {
      const s0 = v.s - v.len / 2, s1 = v.s + v.len / 2;
      const n = 6;
      ctx.save(); ctx.lineCap = 'butt';
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const q = P.posAt(s0 + (s1 - s0) * i / n); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.setLineDash([5, 5]); ctx.strokeStyle = lane.color; ctx.lineWidth = 6; ctx.globalAlpha = 0.9; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.restore();
      const m = P.posAt(v.s); v.x = m.x; v.y = m.y;
      const nx = -Math.sin(m.a), ny = Math.cos(m.a);
      const ox = m.x + nx * (P.HALF_W + 22), oy = m.y + ny * (P.HALF_W + 22);
      drawToken(ctx, card, ox, oy, 13, v.tier, { thin: true, selected });
      v.hx = ox; v.hy = oy;
      return;
    }
    // the stretch it patrols
    ctx.save(); ctx.globalAlpha = 0.2; ctx.lineCap = 'butt';
    ctx.beginPath(); const n = Math.ceil((v.s1 - v.s0) / 8); for (let i = 0; i <= n; i++) { const q = P.posAt(v.s0 + (v.s1 - v.s0) * i / n); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
    ctx.strokeStyle = lane.color; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; ctx.restore();
    const p = P.posAt(v.s); v.x = p.x; v.y = p.y;
    const stopped = st.stopEvery && v.stoppedUntil > now;
    // heading notch, so it reads as moving
    const a = p.a + (v.dir < 0 ? Math.PI : 0);
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(a);
    ctx.fillStyle = lane.color;
    ctx.beginPath(); ctx.moveTo(VEHICLE_R + 7, 0); ctx.lineTo(VEHICLE_R + 1, -5); ctx.lineTo(VEHICLE_R + 1, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    drawToken(ctx, card, p.x, p.y, VEHICLE_R, v.tier, { selected });
    if (stopped) { ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, VEHICLE_R + 6, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    v.hx = p.x; v.hy = p.y;
  }

  function drawRange(ctx, x, y, r, color, strong) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.globalAlpha = strong ? 0.08 : 0.04; ctx.fill();
    ctx.globalAlpha = strong ? 0.6 : 0.25; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function render(ctx, sim, view, now, audio) {
    absorb(sim, sim.takeEffects(), now, audio);
    if (!bgCanvas || themeId !== ((AF.meta && AF.meta.equipped('board')) || 'board-stars') || bgKey !== bgLook()) buildBackground();
    const perf = J().perf, ts = J().textScale || 1;
    // view.scale: on-screen pixels per board unit, set by the canvas sizing in main.js
    const k = Math.max(1, Math.min(1.5, 0.82 / (view.scale || 1)));
    ctx.save();
    let sx = 0, sy = 0;
    if (now - shake.t < 0.4 && !J().reduced) { const q = (1 - (now - shake.t) / 0.4) * shake.amp; sx = (Math.random() - 0.5) * q; sy = (Math.random() - 0.5) * q; }
    ctx.translate(sx, sy);
    ctx.drawImage(bgCanvas, 0, 0);

    // zones and clouds (on the track)
    for (const z of sim.zones) {
      const card = D.CARD_BY_ID[z.cardId];
      const sel = view.selected && view.selected.uid === z.uid;
      const h = drawSegment(ctx, z.s - z.len / 2, z.s + z.len / 2, LANES.place.color, 0.22, null, card, z.tier, { selected: sel, side: z.side || 1 });
      z.hx = h.x; z.hy = h.y;
    }
    for (const c of sim.clouds) {
      const color = c.reverse ? '#b4ffd2' : '#d7dcf5';
      drawSegment(ctx, c.s - c.len / 2, c.s + c.len / 2, color, 0.3 * Math.min(1, (c.until - sim.time) / 1.0 + 0.2), c.reverse ? 'SMOKE' : 'VAPE', null, 0, { side: -1, k });
    }

    // ranges
    for (const t of sim.towers) {
      const card = D.CARD_BY_ID[t.cardId];
      const st = AF.statsFor(card, t.tier);
      const sel = view.selected && view.selected.uid === t.uid;
      const hov = view.hover && view.hover.uid === t.uid;
      if ((sel || hov) && !st.global) drawRange(ctx, t.x, t.y, st.range, LANES[card.cat].color, sel);
    }
    if (view.ghost && view.ghost.kind === 'tower' && view.ghost.range) drawRange(ctx, view.ghost.x, view.ghost.y, view.ghost.range, view.ghost.ok ? '#8fd7b0' : '#ff5c5c', true);

    // money
    for (const b of sim.bills) { drawMoney(ctx, b, sim.time, k); if ((flashes.get(b) || 0) > now) drawFlash(ctx, b, k); }

    // vehicles drive over the money
    for (const v of sim.vehicles) drawVehicle(ctx, v, D.CARD_BY_ID[v.cardId], view.selected && view.selected.uid === v.uid, sim.time);

    // towers
    for (const t of sim.towers) {
      const card = D.CARD_BY_ID[t.cardId];
      const sel = view.selected && view.selected.uid === t.uid;
      if (card.id === 'stoinly') {
        ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(now * 2); ctx.beginPath(); ctx.arc(t.x, t.y, TOWER_R + 10, 0, Math.PI * 2); ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
      drawToken(ctx, card, t.x, t.y, TOWER_R, t.tier, { selected: sel });
    }

    // ghost
    if (view.ghost) {
      const g = view.ghost;
      const card = D.CARD_BY_ID[g.cardId];
      ctx.save(); ctx.globalAlpha = 0.85;
      const col = g.ok ? '#8fd7b0' : '#ff5c5c';
      if (g.kind === 'tower') { drawToken(ctx, card, g.x, g.y, TOWER_R, 0, {}); ctx.beginPath(); ctx.arc(g.x, g.y, TOWER_R + 5, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); }
      else if (g.kind === 'upgrade-unique') { ctx.beginPath(); ctx.arc(g.x, g.y, TOWER_R + 8, 0, Math.PI * 2); ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3; ctx.stroke(); }
      else if ((g.kind === 'zone' || g.kind === 'cloud' || g.kind === 'vehicle') && g.len) drawSegment(ctx, g.s - g.len / 2, g.s + g.len / 2, col, 0.35, null, g.kind === 'cloud' ? null : card, 0, {});
      else if (g.kind === 'global' && g.ok) { ctx.font = (13 * k * ts) + 'px ' + DISPLAY; ctx.letterSpacing = '2px'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('DROP ANYWHERE TO PLAY', g.x, g.y - 30); ctx.letterSpacing = '0px'; }
      if (g.reason) { ctx.globalAlpha = 1; ctx.font = (12 * k * ts) + 'px ' + DISPLAY; ctx.letterSpacing = '1.5px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(g.reason, g.x, g.y + TOWER_R + 24); ctx.letterSpacing = '0px'; }
      ctx.restore();
    }

    // particles: positions are worked out from their age, so a paused board holds still
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; const dt = now - p.t; const q = dt / p.life;
      if (q >= 1 || q < 0) { parts.splice(i, 1); continue; }
      const f = (1 - Math.exp(-3 * dt)) / 3;
      const x = p.x + p.vx * f, y = p.y + p.vy * f + 260 * dt * dt;
      ctx.save(); ctx.globalAlpha = 1 - q * q; ctx.translate(x, y); ctx.rotate(p.rot + p.vr * dt); ctx.fillStyle = p.c;
      drawParticle(ctx, p.style, p.s, q);
      ctx.restore();
    }

    // effects
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]; const q = (now - e.t) / e.life;
      if (q >= 1 || q < 0) { fx.splice(i, 1); continue; }
      ctx.save();
      if (e.k === 'tracer') {
        // a short streak arriving at the target, never longer than 48 units, not a line across the board
        const dx = e.x2 - e.x1, dy = e.y2 - e.y1, d = Math.hypot(dx, dy) || 1;
        const len = Math.min(48, d * 0.4);
        const ax = e.x2 - dx / d * len, ay = e.y2 - dy / d * len;
        ctx.globalAlpha = 1 - q; ctx.strokeStyle = e.c; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.shadowColor = e.c; ctx.shadowBlur = perf ? 0 : 6;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(e.x2, e.y2); ctx.stroke();
      }
      else if (e.k === 'arc') { ctx.globalAlpha = 1 - q; ctx.strokeStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = perf ? 0 : 8; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x1, e.y1); const mx = (e.x1 + e.x2) / 2 + (Math.random() - 0.5) * 16, my = (e.y1 + e.y2) / 2 + (Math.random() - 0.5) * 16; ctx.lineTo(mx, my); ctx.lineTo(e.x2, e.y2); ctx.stroke(); }
      else if (e.k === 'pop') drawPop(ctx, e, q, k * ts, now);
      else if (e.k === 'ring') { ctx.globalAlpha = 1 - q; ctx.strokeStyle = e.c; ctx.lineWidth = e.w || 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * (1 - Math.pow(1 - q, 2)), 0, Math.PI * 2); ctx.stroke(); }
      else if (e.k === 'leak') { ctx.globalAlpha = (1 - q) * 0.6; ctx.fillStyle = '#ff0033'; ctx.beginPath(); ctx.arc(e.x, e.y, 22 + q * 34, 0, Math.PI * 2); ctx.fill(); }
      else if (e.k === 'drop') { const dt = now - e.t; ctx.globalAlpha = 1 - q; ctx.fillStyle = PAPER.fill; ctx.fillRect(e.x + e.vx * dt - 3, e.y + e.vy * dt + 200 * dt * dt - 2, 6, 4); }
      else if (e.k === 'flash') { ctx.globalAlpha = 1 - q; ctx.fillStyle = e.c; ctx.fillRect(-20, -20, W + 40, H + 40); }
      ctx.restore();
    }

    // banners: newest in the middle, older ones stacked above it, each box clear of the next
    for (let i = banners.length - 1; i >= 0; i--) { const q = (now - banners[i].t) / banners[i].life; if (q >= 1 || q < 0) banners.splice(i, 1); }
    let below = null, y = H * 0.46;
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i]; const q = (now - b.t) / b.life;
      const bh = (b.big ? 72 : 38) * ts;
      if (below) y -= below / 2 + 8 + bh / 2;
      below = bh;
      const a = q < 0.1 ? q / 0.1 : q > 0.8 ? (1 - q) / 0.2 : 1;
      // elastic entrance: overshoots, then settles
      const u = Math.min(1, q / 0.18), sc = J().reduced ? 1 : 0.6 + 0.4 * backOut(u, 2.2);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(sc, sc);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (b.big) {
        ctx.font = (56 * ts) + 'px ' + DISPLAY; ctx.letterSpacing = '10px';
        const tw = ctx.measureText(b.text).width;
        ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = '#000';
        ctx.shadowColor = 'rgba(255,0,255,0.85)'; ctx.shadowBlur = perf ? 0 : 22;
        ctx.strokeText(b.text, 4, 5);
        ctx.shadowBlur = 0;
        ctx.strokeText(b.text, 0, 1);
        ctx.fillStyle = rainbowFill(ctx, -tw / 2, tw / 2, now); ctx.fillText(b.text, 0, 1);
      } else {
        ctx.font = 'bold ' + (20 * ts) + 'px ' + MONO; ctx.letterSpacing = '3px';
        const tw = ctx.measureText(b.text).width + 44;
        ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(-tw / 2, -bh / 2, tw, bh);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(-tw / 2, -bh / 2, tw, 2); ctx.fillRect(-tw / 2, bh / 2 - 2, tw, 2);
        ctx.shadowColor = '#00ff00'; ctx.shadowBlur = perf ? 0 : 8; ctx.fillText(b.text, 0, 1);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function backOut(u, s) { s = s == null ? 1.70158 : s; const v = u - 1; return v * v * ((s + 1) * v + s) + 1; }
  function rainbowFill(ctx, x0, x1, now) {
    const w = Math.max(1, x1 - x0), off = ((now * 0.5) % 1) * w;
    const g = ctx.createLinearGradient(x0 - off, 0, x0 - off + w * 2, 0);
    for (let i = 0; i <= 14; i++) g.addColorStop(i / 14, RAINBOW[i % RAINBOW.length]);
    return g;
  }
  function drawPop(ctx, e, q, k, now) {
    const u = Math.min(1, q / 0.3);
    const sc = J().reduced ? 1 : 1.6 - 0.6 * backOut(u, 2.4);
    ctx.globalAlpha = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
    ctx.translate(e.x, e.y - q * 24); ctx.scale(sc, sc);
    const size = e.size * k * (e.crit ? 1.15 : 1);
    ctx.font = size + 'px ' + DISPLAY; ctx.letterSpacing = '1px';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2.5, size * 0.2); ctx.strokeStyle = '#000';
    ctx.strokeText(e.text, 0, 0);
    if (e.c === 'rainbow' || e.crit) { const tw = ctx.measureText(e.text).width; ctx.fillStyle = rainbowFill(ctx, -tw / 2, tw / 2, now); }
    else ctx.fillStyle = e.c;
    ctx.fillText(e.text, 0, 0);
  }
  // a hit turns the bill white for a frame or two
  function drawFlash(ctx, b, k) {
    let w, h;
    if (b.kind === 'case' || b.kind === 'truck' || b.kind === 'bailout') { [w, h] = b.kind === 'bailout' ? [96, 54] : b.kind === 'truck' ? [72, 40] : [46, 32]; }
    else { [w, h] = billSize(Math.ceil(b.value)); w *= k; h *= k; }
    ctx.save(); ctx.translate(b.x, b.y); if (b.kind !== 'bill') ctx.rotate(b.a);
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff'; roundRect(ctx, -w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 4); ctx.fill();
    ctx.restore();
  }

  function hitTest(sim, x, y) {
    for (const t of sim.towers) if (Math.hypot(t.x - x, t.y - y) <= TOWER_R + 4) return t;
    for (const v of sim.vehicles) if (v.hx != null && Math.hypot(v.hx - x, v.hy - y) <= VEHICLE_R + 6) return v;
    for (const z of sim.zones) if (z.hx != null && Math.hypot(z.hx - x, z.hy - y) <= 22) return z;
    if (sim.zones.length) {
      const n = P.nearest(x, y);
      if (n.d <= P.HALF_W) for (const z of sim.zones) if (Math.abs(n.s - z.s) <= z.len / 2) return z;
    }
    return null;
  }

  AF.render = { render, reset, loadImages, images, hitTest, drawCover, roundRect, setTheme, preview, PAPER, CHECK, billSize, THEMES,
    takeJuice() { return juiceQ.splice(0, juiceQ.length); },
    get hitStopUntil() { return hitStopUntil; },
    get particleCount() { return parts.length; },
    get flashCount() { return fx.filter(e => e.k === 'flash').length; },
    get shakeAmp() { return shake.amp; } };
})(window.AF = window.AF || {});
