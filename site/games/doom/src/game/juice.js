(function (ns) {
  'use strict';
  // juice.js: the mobile-game feedback layer, drawn over the 320x200 framebuffer and never
  // touching game logic: screen shake, hit-stop on kills, pop-up damage and money numbers,
  // kill-combo and kill-streak announcer text, sparkles and confetti bursts, and the lime
  // brag ticker. The game reports what happened through g.fx events; this module turns them
  // into effects and sound stings. It has its own random numbers so the game's seeded RNG
  // (and therefore replays and saves) is untouched. The STOINLY NEXUS settings arrive through
  // configure() as plain values: shake and particle multipliers, performance (half the
  // particles), flashes (off: no blinking text), reduced motion (no wobble, no hit-stop) and
  // the text scale of the pop-up numbers and the announcer.

  const W = 320;
  const H = 200;
  const VIEW_H = 168;
  const PROJ = 160;
  const ROWSCALE = 160 / 1.2;
  const HORIZON = 84;
  const COMBO_TICS = 105;
  const RAINBOW = [5, 6, 7, 8, 10, 11, 14];
  const CONFETTI = [5 * 16 + 14, 6 * 16 + 15, 7 * 16 + 15, 8 * 16 + 15, 10 * 16 + 15, 11 * 16 + 13, 14 * 16 + 15, 15 * 16 + 14];

  function T() {
    return ns.defs.text;
  }

  // create(true) is the old reduced-motion shorthand; create(settings) takes the game's
  // settings object (see game.js DEFAULT_SETTINGS); create() is everything at full.
  function create(arg) {
    const j = {
      reduced: false,
      still: false,
      shakeScale: 1,
      particleScale: 1,
      performance: false,
      textScale: 1,
      seed: 0x9e3779b9,
      shake: 0,
      stop: 0,
      pops: [],
      parts: [],
      announce: null,
      combo: { count: 0, last: -1000, best: 0 },
      spree: 0,
      ticker: [],
      tickerOn: null,
      flash: 0
    };
    if (arg === true) {
      configure(j, { reduced: true, shake: 0, particles: 0.25, flashes: false });
    } else if (arg && typeof arg === 'object') {
      configure(j, arg);
    }
    return j;
  }

  function configure(j, s) {
    j.reduced = Boolean(s.reduced);
    j.still = s.flashes === false || j.reduced;
    j.shakeScale = j.reduced ? 0 : (s.shake === undefined ? 1 : Number(s.shake));
    j.particleScale = s.particles === undefined ? 1 : Number(s.particles);
    if (j.reduced) {
      j.particleScale = Math.min(j.particleScale, 0.25);
    }
    j.performance = Boolean(s.performance);
    j.textScale = s.textScale === undefined ? 1 : Number(s.textScale);
    if (j.shakeScale === 0) {
      j.shake = 0;
    }
    if (j.reduced) {
      j.stop = 0;
    }
  }

  function rand(j) {
    // xorshift32
    let x = j.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    j.seed = x >>> 0;
    return j.seed / 4294967296;
  }

  // Particle count after the particle scale and performance mode (which halves it).
  function count(j, n) {
    const k = n * j.particleScale * (j.performance ? 0.5 : 1);
    return k <= 0 ? 0 : Math.ceil(k);
  }

  // ------------------------------------------------------------------ effects

  function shake(j, amount) {
    const a = amount * j.shakeScale;
    if (a > 0) {
      j.shake = Math.min(8, Math.max(j.shake, a));
    }
  }

  // Hit-stop: the play tic is skipped for n tics; never under reduced motion.
  function hitStop(j, n) {
    if (!j.reduced) {
      j.stop = Math.max(j.stop, n);
    }
  }

  function pop(j, x, y, z, text, ramp, opts) {
    const o = opts || {};
    // merge with a recent pop on the same target, so a shotgun blast is one number
    if (o.id !== undefined) {
      for (const p of j.pops) {
        if (p.id === o.id && p.age < 6 && p.value !== undefined) {
          p.value += o.value;
          p.text = String(p.value);
          p.big = p.big || o.big || p.value >= 60;
          return;
        }
      }
    }
    j.pops.push({ x: x, y: y, z: z, text: text, ramp: ramp, age: 0, id: o.id, value: o.value, big: Boolean(o.big), drift: (rand(j) - 0.5) * 0.6 });
    if (j.pops.length > 24) {
      j.pops.shift();
    }
  }

  // world-space burst of foil confetti from a point
  function burst(j, x, y, z, n, colors, speed) {
    const k = count(j, n);
    for (let i = 0; i < k; i++) {
      const a = rand(j) * Math.PI * 2;
      const s = (0.02 + rand(j) * 0.05) * (speed || 1);
      j.parts.push({
        world: true, x: x, y: y, z: z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0.03 + rand(j) * 0.06,
        c: colors[Math.floor(rand(j) * colors.length)], life: 30 + Math.floor(rand(j) * 25), age: 0, g: 0.004
      });
    }
  }

  // screen-space confetti from two cannons at the bottom corners, as canvas-confetti does
  function confetti(j, n, ox, oy) {
    const k = count(j, n);
    for (let i = 0; i < k; i++) {
      let x;
      let y;
      let a;
      if (ox === undefined) {
        const left = i % 2 === 0;
        x = left ? 8 : W - 8;
        y = VIEW_H - 4;
        a = (left ? -Math.PI / 3 : -Math.PI * 2 / 3) + (rand(j) - 0.5) * 0.9;
      } else {
        x = ox;
        y = oy;
        a = rand(j) * Math.PI * 2;
      }
      const s = ox === undefined ? 4.5 + rand(j) * 5 : 2 + rand(j) * 4.5;
      j.parts.push({
        world: false, x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        c: CONFETTI[Math.floor(rand(j) * CONFETTI.length)], life: 50 + Math.floor(rand(j) * 40), age: 0,
        g: 0.12, spin: Math.floor(rand(j) * 4)
      });
    }
  }

  function announce(j, text, opts) {
    const o = opts || {};
    j.announce = { text: text, age: 0, rainbow: o.rainbow !== false, ramp: o.ramp === undefined ? 7 : o.ramp, life: o.life || 60, y: o.y || 34 };
  }

  function brag(j, text) {
    if (j.ticker.indexOf(text) < 0 && j.ticker.length < 6) {
      j.ticker.push(text);
    }
  }

  // ------------------------------------------------------------------ game events

  function comboName(n) {
    const names = T().flashy.COMBO;
    return n < names.length ? names[n] : T().flashy.COMBO_MANY + n + '!';
  }

  // Turns one g.fx event into effects; sounds go to `sounds` (an array of names).
  function event(j, ev, tic, sounds) {
    const F = T().flashy;
    switch (ev.kind) {
      case 'hit':
        if (ev.byPlayer) {
          const crit = ev.amount >= 60;
          pop(j, ev.x, ev.y, ev.z, String(ev.amount), 5, { id: ev.id, value: ev.amount, big: crit });
          hitStop(j, crit ? 1 : 0);
        }
        burst(j, ev.x, ev.y, ev.z, 4, [15 * 16 + 14, 0 * 16 + 15, 7 * 16 + 15], 0.6);
        return;
      case 'kill': {
        burst(j, ev.x, ev.y, ev.z, ev.big ? 70 : 36, CONFETTI, ev.big ? 1.6 : 1);
        if (!ev.byPlayer) {
          return;
        }
        hitStop(j, 2);
        shake(j, ev.big ? 4 : 2);
        const c = j.combo;
        c.count = tic - c.last <= COMBO_TICS ? c.count + 1 : 1;
        c.last = tic;
        sounds.push('TINK_' + Math.min(8, c.count));
        if (c.count >= 2) {
          announce(j, comboName(c.count), { rainbow: c.count >= 4, ramp: 7, life: 50 });
          if (c.count > c.best) {
            c.best = c.count;
          }
        }
        j.spree++;
        const spree = F.SPREE[j.spree];
        if (spree) {
          announce(j, spree, { rainbow: true, life: 70, y: 52 });
          brag(j, spree + ' ' + j.spree + ' ' + F.SPREE_TAIL);
          sounds.push('STING_UNLOCK');
        }
        return;
      }
      case 'hurt':
        shake(j, Math.min(7, 1 + ev.amount / 6));
        if (j.spree >= 5) {
          brag(j, F.SPREE_END + j.spree);
        }
        j.spree = 0;
        return;
      case 'pickup':
        burst(j, ev.x, ev.y, ev.z + 0.2, 14, [7 * 16 + 15, 15 * 16 + 14, 0 * 16 + 15, 6 * 16 + 15], 0.5);
        if (ev.money) {
          pop(j, ev.x, ev.y, ev.z + 0.4, '+$' + ev.money, 6, {});
        } else if (ev.armor) {
          pop(j, ev.x, ev.y, ev.z + 0.4, '+' + ev.armor, 8, {});
        }
        return;
      case 'secret':
        announce(j, F.SECRET, { rainbow: true, life: 60, y: 52 });
        brag(j, F.SECRET_BRAG);
        return;
      case 'pull':
        brag(j, F.PULL_BRAG + ev.name);
        return;
      default:
    }
  }

  // Once per app tic. Returns nothing; sounds for a combo break go to `sounds`.
  function tick(j, tic, sounds) {
    if (j.shake > 0) {
      j.shake = Math.max(0, j.shake * 0.82 - 0.1);
    }
    const c = j.combo;
    if (c.count >= 3 && tic - c.last > COMBO_TICS) {
      sounds.push('STING_CRACK');
      shake(j, 3);
      announce(j, T().flashy.COMBO_OVER + c.count, { rainbow: false, ramp: 5, life: 35, y: 34 });
      c.count = 0;
    } else if (tic - c.last > COMBO_TICS) {
      c.count = 0;
    }
    for (const p of j.pops) {
      p.age++;
    }
    j.pops = j.pops.filter(function (p) { return p.age < 40; });
    for (const p of j.parts) {
      p.age++;
      if (p.world) {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.vz -= p.g;
        p.vx *= 0.94;
        p.vy *= 0.94;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g;
        p.vx *= 0.985;
        p.vy *= 0.985;
      }
    }
    j.parts = j.parts.filter(function (p) { return p.age < p.life && (p.world || p.y < H + 4); });
    if (j.announce) {
      j.announce.age++;
      if (j.announce.age > j.announce.life) {
        j.announce = null;
      }
    }
    if (j.tickerOn) {
      j.tickerOn.x -= 2;
      if (j.tickerOn.x < -j.tickerOn.w) {
        j.tickerOn = null;
      }
    } else if (j.ticker.length) {
      const text = '*** ' + j.ticker.shift() + ' ***';
      j.tickerOn = { text: text, x: W, w: ns.text.width('SMALL', text) };
    }
  }

  // ------------------------------------------------------------------ drawing

  const scratch = new Uint8Array(W * H).fill(255);

  // Draws `str` centered at (cx, cy) scaled by s, with a black outline. color(x, y, shade)
  // returns a palette index for a glyph texel, or a ramp number may be given instead.
  function bigText(fb, font, cx, cy, str, s, color, tic, clipBottom) {
    const tw = Math.min(W, ns.text.width(font, str));
    const th = ns.text.lineHeight(font);
    ns.text.drawRaw(scratch, font, 0, 0, str, { ramp: 0, shadow: false });
    const dw = Math.round(tw * s);
    const dh = Math.round(th * s);
    const x0 = Math.round(cx - dw / 2);
    const y0 = Math.round(cy - dh / 2);
    const yMax = clipBottom || H;
    const inv = 1 / s;
    for (let pass = 0; pass < 2; pass++) {
      for (let dy = -1; dy <= dh; dy++) {
        for (let dx = -1; dx <= dw; dx++) {
          const X = x0 + dx;
          const Y = y0 + dy;
          if (X < 0 || X >= W || Y < 0 || Y >= yMax) {
            continue;
          }
          if (pass === 0) {
            // outline: any glyph texel within one destination pixel
            let hit = false;
            for (let oy = -1; oy <= 1 && !hit; oy++) {
              for (let ox = -1; ox <= 1 && !hit; ox++) {
                const sx = Math.floor((dx + ox) * inv);
                const sy = Math.floor((dy + oy) * inv);
                if (sx >= 0 && sy >= 0 && sx < tw && sy < th && scratch[sy * W + sx] !== 255) {
                  hit = true;
                }
              }
            }
            if (hit) {
              fb[Y * W + X] = 0;
            }
          } else {
            const sx = Math.floor(dx * inv);
            const sy = Math.floor(dy * inv);
            if (sx < 0 || sy < 0 || sx >= tw || sy >= th) {
              continue;
            }
            const t = scratch[sy * W + sx];
            if (t === 255) {
              continue;
            }
            const shade = t & 15;
            let ramp;
            if (typeof color === 'function') {
              ramp = color(X, Y, tic);
            } else {
              ramp = color;
            }
            fb[Y * W + X] = ramp * 16 + (ramp === 15 && shade > 14 ? 14 : shade);
          }
        }
      }
    }
    for (let y = 0; y < th; y++) {
      scratch.fill(255, y * W, y * W + tw);
    }
  }

  function rainbowRamp(x, y, tic) {
    return RAINBOW[(((x + y) >> 3) + (tic >> 2)) % RAINBOW.length];
  }

  // Elastic overshoot from `from` to 1 over n tics, like cubic-bezier(.34,1.56,.64,1).
  function popScale(age, from, n) {
    const t = Math.min(1, age / n);
    const back = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
    return from + (1 - from) * back;
  }

  function project(cam, x, y, z) {
    const ca = Math.cos(cam.angle);
    const sa = Math.sin(cam.angle);
    const rx = x - cam.x;
    const ry = y - cam.y;
    const d = rx * ca + ry * sa;
    if (d < 0.25) {
      return null;
    }
    const l = -rx * sa + ry * ca;
    return { x: W / 2 + l * PROJ / d, y: HORIZON - (z - cam.z) * ROWSCALE / d, d: d };
  }

  // Particles and numbers anchored in the world, drawn over the 3D view.
  function drawWorld(fb, j, cam, tic) {
    for (const p of j.parts) {
      if (!p.world) {
        continue;
      }
      const s = project(cam, p.x, p.y, p.z);
      if (!s) {
        continue;
      }
      const X = Math.round(s.x);
      const Y = Math.round(s.y);
      if (X < 0 || X >= W - 1 || Y < 0 || Y >= VIEW_H - 1) {
        continue;
      }
      fb[Y * W + X] = p.c;
      if (s.d < 3) {
        fb[Y * W + X + 1] = p.c;
        fb[(Y + 1) * W + X] = p.c;
      }
    }
    for (const p of j.pops) {
      const s = project(cam, p.x, p.y, p.z + p.age * 0.012);
      if (!s) {
        continue;
      }
      if (p.age > 30 && (p.age & 1) && !j.still) {
        continue;
      }
      const base = (p.big ? 2.0 : 1.3) * j.textScale;
      const scale = base * popScale(p.age, 1.6, 7);
      bigText(fb, 'SMALL', s.x + p.drift * p.age, s.y - p.age * 0.6, p.text, scale, p.big ? rainbowRamp : p.ramp, tic, VIEW_H);
    }
  }

  // Screen effects: confetti, the announcer and the ticker.
  function drawScreen(fb, j, tic, clipBottom) {
    const yMax = clipBottom || H;
    for (const p of j.parts) {
      if (p.world) {
        continue;
      }
      const X = Math.round(p.x);
      const Y = Math.round(p.y);
      if (X < 0 || X >= W - 2 || Y < 0 || Y >= yMax - 2) {
        continue;
      }
      // a tumbling paper rectangle: wide, then thin, then tall
      const phase = ((p.age >> 2) + p.spin) % 4;
      fb[Y * W + X] = p.c;
      if (phase === 0 || phase === 2) {
        fb[Y * W + X + 1] = p.c;
        if (phase === 0) {
          fb[Y * W + X + 2] = p.c;
        }
      } else if (phase === 3) {
        fb[(Y + 1) * W + X] = p.c;
        fb[(Y + 2) * W + X] = p.c;
      }
    }
    const a = j.announce;
    if (a) {
      const wob = j.reduced ? 0 : Math.sin(a.age * 0.5) * (a.age < 20 ? 1.5 : 0.5);
      // the text scale enlarges the callout, but never past the screen's width
      const fit = Math.max(1, (W - 8) / (ns.text.width('BIG', a.text) * 1.15));
      const s = popScale(a.age, 2.4, 9) * 1.15 * Math.min(j.textScale, fit);
      if (!(a.age > a.life - 10 && (a.age & 2) && !j.still)) {
        bigText(fb, 'BIG', 160 + wob, a.y, a.text, s, a.rainbow ? rainbowRamp : a.ramp, tic, yMax);
      }
    }
  }

  // The brag ticker: a black bar with lime rules across the top of the view.
  function drawTicker(fb, j, tic) {
    const t = j.tickerOn;
    if (!t) {
      return false;
    }
    const y = 0;
    fb.fill(0, y * W, (y + 12) * W);
    fb.fill(8 * 16 + 12, (y + 12) * W, (y + 13) * W);
    ns.text.drawRaw(fb, 'SMALL', Math.round(t.x), y + 2, t.text, { ramp: 8, shadow: false });
    return true;
  }

  // Shifts the 3D view by the current shake, repeating edge pixels.
  function applyShake(fb, j, tic) {
    if (j.shake < 0.5 || j.shakeScale <= 0) {
      return;
    }
    const dx = Math.round(Math.sin(tic * 2.7) * j.shake);
    const dy = Math.round(Math.cos(tic * 3.3) * j.shake * 0.6);
    if (!dx && !dy) {
      return;
    }
    const copy = shakeBuf;
    copy.set(fb.subarray(0, W * VIEW_H));
    for (let y = 0; y < VIEW_H; y++) {
      const sy = Math.min(VIEW_H - 1, Math.max(0, y - dy));
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, x - dx));
        fb[y * W + x] = copy[sy * W + sx];
      }
    }
  }
  const shakeBuf = new Uint8Array(W * VIEW_H);

  // The rainbow rule: an 8 px striped bar (here h rows) sliding sideways.
  function rainbowRule(fb, y, h, tic, reduced) {
    const ramps = [5, 6, 7, 8, 10, 14];
    const off = reduced ? 0 : Math.floor(tic * 1.5);
    for (let yy = y; yy < y + h; yy++) {
      for (let x = 0; x < W; x++) {
        fb[yy * W + x] = ramps[Math.floor((x + off) / 6) % ramps.length] * 16 + 13;
      }
    }
  }

  // A five-pointed star, filled, centered at (cx, cy) with outer radius r.
  function star(fb, cx, cy, r, fillIdx, edgeIdx) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]);
    }
    const inside = function (x, y) {
      let c = false;
      for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
        const a = pts[i];
        const b = pts[k];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) {
          c = !c;
        }
      }
      return c;
    };
    const x0 = Math.floor(cx - r - 1);
    const x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1);
    const y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) {
          continue;
        }
        if (inside(x + 0.5, y + 0.5)) {
          const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
          fb[y * W + x] = edge ? edgeIdx : (typeof fillIdx === 'function' ? fillIdx(x, y) : fillIdx);
        }
      }
    }
  }

  ns.juice = {
    create: create,
    configure: configure,
    count: count,
    event: event,
    tick: tick,
    shake: shake,
    pop: pop,
    burst: burst,
    confetti: confetti,
    announce: announce,
    brag: brag,
    drawWorld: drawWorld,
    drawScreen: drawScreen,
    drawTicker: drawTicker,
    applyShake: applyShake,
    bigText: bigText,
    rainbowRamp: rainbowRamp,
    rainbowRule: rainbowRule,
    popScale: popScale,
    star: star,
    CONFETTI: CONFETTI
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
