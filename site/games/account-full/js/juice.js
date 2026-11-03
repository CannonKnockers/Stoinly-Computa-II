/* ACCOUNT FULL — juice
   The DOM side of the effects: a hand-written canvas confetti (the site uses
   canvas-confetti; this copies its counts, colours and physics without a
   bundler), coins that fly to the gum counter, counters that tick instead of
   jumping, the combo counter, and the brag ticker.

   The switches below are the only place the game asks how much juice to
   show. They read the STOINLY NEXUS shared settings (js/stoinly-settings.js,
   a byte-identical copy of the nexus file) and fall back to the OS setting
   when that file is missing.
   - reduced:   less motion (the OS setting or the nexus one). No shake, no
                blink, no hit-stop, few particles.
   - flashes:   false means no white flashes, strobes or blinking.
   - shake:     multiplier for screen shake (0 under reduced motion).
   - particles: multiplier for board particle counts (capped at 0.25 under
                reduced motion); performance mode halves it.
   - perf:      performance mode: no glow or shadow blur, fewer particles.
   - textScale: multiplier for canvas-drawn text.
   - still:     the headless test page froze animations so screenshots show end
                states; script-driven animations are skipped too. */
(function (AF) {
  'use strict';

  const $ = id => document.getElementById(id);
  const S = window.StoinlySettings || null;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const J = {
    get reduced() { return S ? S.reducedMotion() : !!(mq && mq.matches); },
    get flashes() { return S ? S.flashesAllowed() : !this.reduced; },
    get shake() { return S ? S.shakeScale() : (this.reduced ? 0 : 1); },
    get perf() { return !!(S && S.get().display.performance); },
    get particles() { return (S ? S.particleScale() : (this.reduced ? 0.25 : 1)) * (this.perf ? 0.5 : 1); },
    // the particle slider and performance mode only, without the reduced-motion cap (confetti has its own cap)
    get particleSetting() { return (S ? S.get().motion.particles : 1) * (this.perf ? 0.5 : 1); },
    get textScale() { return S ? S.get().display.textScale : 1; },
    get still() { return document.documentElement.classList.contains('notransitions'); },
    get calm() { return this.reduced || this.still; },
  };

  // ---------------------------------------------------------------- confetti
  // canvas-confetti's defaults: these colours, 0.9 decay, gravity 1 (3 px a tick), 200 ticks
  const COLORS = ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'];
  let cv = null, cx = null, parts = [], running = false;
  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'confetti-canvas';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    cx = cv.getContext('2d');
  }
  function sizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // opts: { x, y } in client pixels, count, spread (degrees), angle (degrees, 90 = up), startVelocity, colors
  function confetti(opts) {
    opts = opts || {};
    let count = opts.count == null ? 80 : opts.count;
    if (J.reduced) count = Math.min(count, 18);
    count = Math.round(count * J.particleSetting);
    if (!count) return;
    ensureCanvas(); sizeCanvas();
    const x = opts.x == null ? innerWidth / 2 : opts.x, y = opts.y == null ? innerHeight / 2 : opts.y;
    const spread = (opts.spread || 70) * Math.PI / 180, angle = (opts.angle == null ? 90 : opts.angle) * Math.PI / 180;
    const sv = opts.startVelocity || 34, colors = opts.colors || COLORS;
    for (let i = 0; i < count; i++) {
      parts.push({
        x, y,
        wobble: Math.random() * 10, wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
        velocity: sv * 0.5 + Math.random() * sv,
        angle2D: -angle + (0.5 * spread - Math.random() * spread),
        tiltAngle: (Math.random() * 0.5 + 0.25) * Math.PI,
        color: colors[i % colors.length], shape: Math.random() < 0.5 ? 0 : 1,
        tick: 0, total: opts.ticks || 200, decay: 0.9, gravity: 3, drift: 0, scalar: opts.scalar || 1,
      });
    }
    if (!running) { running = true; requestAnimationFrame(stepConfetti); }
  }
  function stepConfetti() {
    sizeCanvas();
    cx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += Math.cos(p.angle2D) * p.velocity + p.drift;
      p.y += Math.sin(p.angle2D) * p.velocity + p.gravity;
      p.velocity *= p.decay;
      p.wobble += p.wobbleSpeed; p.tiltAngle += 0.1;
      const ws = 10 * p.scalar;
      const wx = p.x + ws * Math.cos(p.wobble), wy = p.y + ws * Math.sin(p.wobble);
      const tsin = Math.sin(p.tiltAngle), tcos = Math.cos(p.tiltAngle);
      const q = p.tick++ / p.total;
      if (q >= 1 || p.y > innerHeight + 40) { parts.splice(i, 1); continue; }
      cx.globalAlpha = 1 - q;
      cx.fillStyle = p.color;
      cx.beginPath();
      if (p.shape) {
        cx.ellipse(p.x, p.y, Math.abs(wx - p.x) * 0.6 + 1, Math.abs(wy - p.y) * 0.6 + 1, Math.PI / 10 * p.wobble, 0, 2 * Math.PI);
      } else {
        const x1 = p.x + Math.random() * tcos, y1 = p.y + Math.random() * tsin;
        cx.moveTo(Math.floor(p.x), Math.floor(p.y));
        cx.lineTo(Math.floor(wx), Math.floor(y1));
        cx.lineTo(Math.floor(x1 + wx - p.x), Math.floor(y1 + wy - p.y));
        cx.lineTo(Math.floor(x1), Math.floor(wy));
      }
      cx.fill();
    }
    cx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(stepConfetti);
    else { running = false; cx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  // from the middle third of an element, the way the card shop does it
  function confettiFrom(el, count, spread) {
    const r = el.getBoundingClientRect();
    confetti({ x: r.left + r.width / 2, y: r.top + r.height / 3, count, spread: spread || (count >= 180 ? 120 : 75) });
  }

  // ---------------------------------------------------------------- coins to the counter
  let coinLayer = null;
  function coins(fromX, fromY, n, onEach) {
    const target = $('hudGum');
    if (!target || !target.offsetParent) { if (onEach) for (let i = 0; i < n; i++) onEach(i); return; }
    if (J.calm) { if (onEach) for (let i = 0; i < n; i++) onEach(i); return; }
    if (!coinLayer) { coinLayer = document.createElement('div'); coinLayer.className = 'coin-layer'; coinLayer.setAttribute('aria-hidden', 'true'); document.body.appendChild(coinLayer); }
    const tr = target.getBoundingClientRect();
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    n = Math.min(n, 10);
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'coin';
      coinLayer.appendChild(c);
      const sx = fromX + (Math.random() - 0.5) * 30, sy = fromY + (Math.random() - 0.5) * 20;
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 160, my = Math.min(sy, ty) - 60 - Math.random() * 80;
      const dur = 620 + Math.random() * 220, delay = i * 70;
      const a = c.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy - 18}px) scale(1.25)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.55)`, opacity: 0.9 },
      ], { duration: dur, delay, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
      a.onfinish = () => { c.remove(); if (onEach) onEach(i); };
    }
  }

  // ---------------------------------------------------------------- counters that tick
  // el shows `format(value)`; set() moves toward the new value over a short time
  function counter(el, format, opts) {
    opts = opts || {};
    let shown = null, target = null, from = 0, t0 = 0, dur = opts.dur || 450;
    const c = {
      set(v, instant) {
        if (shown == null || instant || J.calm) { shown = target = v; el.textContent = format(v); return; }
        if (v === target) return;
        from = shown; target = v; t0 = performance.now();
        dur = Math.min(900, (opts.dur || 450) + Math.log10(1 + Math.abs(v - from)) * 60);
      },
      tick(now) {
        if (shown === target) return;
        // a frame's timestamp can be a little earlier than the moment set() ran
        const q = Math.max(0, Math.min(1, (now - t0) / dur));
        const e = 1 - Math.pow(1 - q, 3);
        shown = q >= 1 ? target : from + (target - from) * e;
        const txt = format(opts.round === false ? shown : Math.round(shown));
        if (el.textContent !== txt) el.textContent = txt;
      },
      get value() { return target; },
    };
    return c;
  }
  // a one-off count from 0 for result screens; returns a promise that settles at the end
  function countUp(el, to, format, ms) {
    format = format || (v => String(v));
    if (J.calm || !to) { el.textContent = format(to); return Promise.resolve(); }
    return new Promise(res => {
      const t0 = performance.now(); ms = ms || 900;
      const f = now => { const q = Math.max(0, Math.min(1, (now - t0) / ms)); el.textContent = format(Math.round(to * (1 - Math.pow(1 - q, 3)))); if (q < 1) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
  }
  // restart a CSS animation class
  function pulse(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ---------------------------------------------------------------- combo
  // finishes inside a 1.2 s window (game time) chain; a leak breaks a chain of 3 or more
  const COMBO_WINDOW = 1.2;
  const combo = { n: 0, at: -99, best: 0 };
  function comboEl() { return $('combo'); }
  function comboHit(gameTime) {
    combo.n = gameTime - combo.at <= COMBO_WINDOW ? combo.n + 1 : 1;
    combo.at = gameTime;
    combo.best = Math.max(combo.best, combo.n);
    const el = comboEl();
    if (el && combo.n >= 3) {
      el.hidden = false; el.classList.remove('broken', 'fading');
      el.querySelector('b').textContent = '×' + combo.n;
      el.style.setProperty('--grow', String(Math.min(1.7, 1 + combo.n * 0.025)));
      pulse(el, 'wobble');
      el.classList.toggle('hot', combo.n >= 10);
      el.classList.toggle('blazing', combo.n >= 25);
    }
    if ([10, 25, 50, 100].includes(combo.n)) { AF.audio.play('comboUp', combo.n); brag('COMBO ×' + combo.n + '!'); }
    return combo.n;
  }
  function comboBreak() {
    const had = combo.n;
    combo.n = 0; combo.at = -99;
    const el = comboEl();
    if (had >= 3 && el && !el.hidden) {
      el.classList.remove('wobble'); el.classList.add('broken');
      AF.audio.play('crack');
      setTimeout(() => { if (combo.n < 3) el.hidden = true; el.classList.remove('broken'); }, 650);
    }
    return had;
  }
  // called every frame: a chain that ran out of time fades quietly
  function comboTick(gameTime) {
    const el = comboEl();
    if (!el || el.hidden || el.classList.contains('broken')) return;
    if (combo.n >= 3 && gameTime - combo.at > COMBO_WINDOW) { el.classList.add('fading'); combo.n = 0; setTimeout(() => { if (combo.n < 3) el.hidden = true; el.classList.remove('fading'); }, 400); }
  }
  function comboReset() { combo.n = 0; combo.at = -99; combo.best = 0; const el = comboEl(); if (el) el.hidden = true; }

  // ---------------------------------------------------------------- ticker (brag feed)
  // a fixed welcome line plus the latest brags, newest first; the track is doubled so it loops seamlessly
  const BASE = ['*** ACCOUNT FULL ***', 'THE BANK SAID THE ACCOUNT IS FULL', 'DO NOT LET THE MONEY IN', 'GIVE IT AWAY FOR FREE', 'THE GUM WAS NEVER REAL'];
  const brags = [];
  function renderTicker(id, items) {
    const box = $(id); if (!box) return;
    const line = items.join(' *** ') + ' *** ';
    const track = box.querySelector('.ticker-track');
    const spans = track.querySelectorAll('span');
    if (spans[0].textContent !== line) { spans[0].textContent = line; spans[1].textContent = line; }
  }
  function brag(text) {
    brags.unshift(text);
    if (brags.length > 6) brags.pop();
    renderTicker('hudTicker', brags.concat(BASE));
    const t = $('hudTicker'); if (t) pulse(t, 'flash');
  }
  function resetBrags(seed) { brags.length = 0; (seed || []).forEach(s => brags.push(s)); renderTicker('hudTicker', brags.concat(BASE)); }

  AF.juice = Object.assign(J, { confetti, confettiFrom, coins, counter, countUp, pulse, comboHit, comboBreak, comboTick, comboReset, combo, brag, resetBrags, renderTicker, COLORS });
})(window.AF = window.AF || {});
