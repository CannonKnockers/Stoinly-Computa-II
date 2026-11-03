(function (ns) {
  'use strict';
  // screens.js: the screens that are not the 3D view: the title (the LIVE 3-D COMPUTER
  // FEED), menus, the intermission with its card pulls, the death overlay, the finale crawl,
  // the credits and YOUR COLLECTION, and the flashy layer's screens: the tally stars, the
  // pause card, THE LOCKER, the DAILY CHEST, the DAILY CHALLENGE and the credits crawl with
  // the photo credits. All of it is drawn in the palette framebuffer in the site's style
  // (rainbow wordmark, starfield, lime ticker, rainbow rules, outset navy buttons).
  // Drawing only; game.js owns the state.

  const W = 320;
  const H = 200;
  const VIEW_H = 168;
  const R = { grey: 0, tan: 3, red: 5, orange: 6, yellow: 7, green: 8, teal: 9, cyan: 10, blue: 11, navy: 12, purple: 13, magenta: 14, foil: 15 };

  function tx() {
    return ns.text;
  }

  function T() {
    return ns.defs.text;
  }

  function fill(fb, x, y, w, h, c) {
    ns.render.fill(fb, x, y, w, h, c);
  }

  function idx(ramp, shade) {
    return ramp * 16 + shade;
  }

  // A navy starfield, the site's background. still: no twinkling (flashes off).
  function starfield(fb, tic, still) {
    for (let y = 0; y < H; y++) {
      const c = idx(R.navy, y < 100 ? 1 : 2);
      fb.fill(c, y * W, y * W + W);
    }
    for (let i = 0; i < 140; i++) {
      const h = Math.sin(i * 91.17) * 43758.5;
      const x = Math.floor((h - Math.floor(h)) * W);
      const h2 = Math.sin(i * 17.31) * 23421.6;
      const y = Math.floor((h2 - Math.floor(h2)) * H);
      const tw = !still && (i * 7 + Math.floor(tic / 9)) % 23 === 0;
      fb[y * W + x] = tw ? idx(R.grey, 15) : idx(R.foil, (i % 5) + 4);
    }
  }

  // The menu cursor: a little holo card, its foil turning.
  function cursor(fb, x, y, tic) {
    const colors = [R.red, R.orange, R.yellow, R.green, R.cyan, R.blue, R.magenta];
    const squeeze = Math.abs(Math.sin(tic * 0.08));
    const w = Math.max(1, Math.round(7 * squeeze));
    const x0 = x + Math.round((7 - w) / 2);
    for (let yy = 0; yy < 10; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const edge = yy === 0 || yy === 9 || xx === 0 || xx === w - 1;
        fb[(y + yy) * W + x0 + xx] = edge ? idx(R.purple, 1) : idx(colors[(xx + yy + Math.floor(tic / 4)) % colors.length], 13);
      }
    }
  }

  const RAINBOW = [5, 6, 7, 8, 10, 11, 14];

  function J() {
    return ns.juice;
  }

  // A small flame for the day streak.
  function flame(fb, x, y, tic) {
    const rows = ['...#...', '..##...', '..###..', '.####..', '.#####.', '###o###', '##ooo##', '##oyo##', '.#yyy#.', '..###..'];
    const flick = (tic >> 3) & 1;
    rows.forEach(function (r, yy) {
      for (let xx = 0; xx < r.length; xx++) {
        const ch = r[(flick && yy < 3) ? r.length - 1 - xx : xx];
        if (ch === '.') {
          continue;
        }
        fb[(y + yy) * W + x + xx] = ch === '#' ? idx(R.red, 13) : (ch === 'o' ? idx(R.orange, 14) : idx(R.yellow, 15));
      }
    });
  }

  // The hooks strip: streak flame, stars, FOIL.
  function hookStrip(fb, x, y, info, tic) {
    const F = T().flashy;
    let cx = x;
    flame(fb, cx, y - 1, tic);
    cx += 9;
    const streak = info.streak > 0 ? info.streak + ' ' + F.STREAK : F.STREAK_START;
    tx().drawRaw(fb, 'SMALL', cx, y, streak, { ramp: R.orange, shadow: true });
    cx += tx().width('SMALL', streak) + 8;
    J().star(fb, cx + 4, y + 4, 5, idx(R.yellow, 15), idx(R.orange, 8));
    cx += 11;
    tx().drawRaw(fb, 'SMALL', cx, y, info.stars + '/' + info.starsMax, { ramp: R.yellow, shadow: true });
    cx += tx().width('SMALL', info.stars + '/' + info.starsMax) + 8;
    tx().drawRaw(fb, 'SMALL', cx, y, T().flashy.FOIL + ' ' + info.foil, { ramp: R.foil, shadow: true });
  }

  function title(fb, tic, info) {
    ns.render.patch(fb, 0, 0, 'TITLEPIC', 33);
    const reduced = info && info.reduced;
    const still = info && (info.still || info.reduced);
    // the wordmark's rainbow slides sideways, as the site's does (slide-rainbow 4s)
    const off = reduced ? 0 : tic * 2;
    for (let y = 46; y < 102; y++) {
      for (let x = 50; x < 270; x++) {
        const i = y * W + x;
        const v = fb[i];
        const ramp = v >> 4;
        if ((ramp === R.red || ramp === R.orange || ramp === R.yellow || ramp === R.green || ramp === R.cyan || ramp === R.blue) && (v & 15) >= 7) {
          fb[i] = RAINBOW[Math.floor((x + off) / 26) % RAINBOW.length] * 16 + (v & 15);
        }
      }
    }
    tx().draw(fb, 'BIG', 160, 106, 'COMPUTER', { ramp: R.cyan, align: 'center' });
    subtitle(fb, 160, 127, 'STOINLIER THAN THE COMPUTER');
    // the LIVE badge, blinking
    if (still || Math.floor(tic / 18) % 2 === 0) {
      fill(fb, 10, 10, 26, 11, idx(R.red, 12));
      tx().drawRaw(fb, 'SMALL', 13, 12, T().LIVE, { ramp: R.grey, shadow: false });
    }
    if (info) {
      hookStrip(fb, 44, 3, info, tic);
    }
    tx().draw(fb, 'SMALL', 160, 141, 'PRESS ANY KEY', { ramp: R.grey, align: 'center', count: still || Math.floor(tic / 18) % 2 === 0 ? 99 : 0 });
    if (info && info.chestReady) {
      const F = T().flashy;
      const label = F.NEW + ' ' + F.CHEST_READY;
      const w = tx().width('SMALL', label) + 10;
      foilBox(fb, 160 - w / 2, 152, w, 12, tic, reduced);
      tx().drawRaw(fb, 'SMALL', 160, 154, label, { ramp: R.navy, align: 'center', shadow: false, level: 33 });
    }
    J().rainbowRule(fb, 167, 3, tic, reduced);
    let brag = '';
    if (info) {
      const F = T().flashy;
      const d = info.daily;
      brag = '*** ' + F.STREAK + ' ' + info.streak + ' *** ' + F.DAILY + ': ' + info.levelName(d.level) + ' + ' + d.mod.name +
        (info.dailyBest ? ' *** ' + F.DAILY_BEST + ' ' + info.dailyBest : '') +
        (info.bestCombo > 1 ? ' *** ' + F.BEST_COMBO + info.bestCombo : '') + ' ';
    }
    ticker(fb, tic, 176, brag + T().TICKER);
    tx().draw(fb, 'SMALL', 160, 189, T().COPYRIGHT, { ramp: R.teal, align: 'center' });
  }

  // Courier-style subtitle: cyan, wide letter spacing, a cyan glow and a dark offset shadow.
  function subtitle(fb, cx, y, str) {
    const spacing = 2;
    let w = 0;
    for (const ch of str) {
      w += tx().width('SMALL', ch) + spacing;
    }
    let x = Math.round(cx - w / 2);
    for (const ch of str) {
      tx().drawRaw(fb, 'SMALL', x + 1, y + 1, ch, { ramp: R.blue, shadow: false, level: 26 });
      tx().drawRaw(fb, 'SMALL', x, y, ch, { ramp: R.cyan, shadow: false });
      x += tx().width('SMALL', ch) + spacing;
    }
  }

  // The foil sheen of the site's packs: a silver box with a moving lavender band.
  function foilBox(fb, x, y, w, h, tic, reduced) {
    x = Math.round(x);
    const off = reduced ? 0 : tic * 1.5;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const t = ((xx + yy * 1.5 + off) % 48) / 48;
        const shade = 9 + Math.round(5 * Math.abs(Math.sin(t * Math.PI * 2)));
        const edge = yy === 0 || yy === h - 1 || xx === 0 || xx === w - 1;
        fb[(y + yy) * W + x + xx] = edge ? idx(R.purple, 3) : idx(R.foil, Math.min(14, shade));
      }
    }
  }

  // The scrolling lime ticker on black, the site's marquee.
  const strip = new Uint8Array(W * H);
  function ticker(fb, tic, y, text) {
    fill(fb, 2, y - 2, W - 4, 12, idx(R.grey, 0));
    fill(fb, 2, y - 3, W - 4, 1, idx(R.green, 12));
    fill(fb, 2, y + 10, W - 4, 1, idx(R.green, 12));
    const s = (text || T().TICKER) + '   ';
    const w = tx().width('SMALL', s);
    const off = Math.floor(tic * 1.2) % w;
    // draw twice so it wraps; clip by drawing into a scratch strip
    strip.fill(255, y * W, (y + 10) * W);
    tx().drawRaw(strip, 'SMALL', 4 - off, y, s, { ramp: R.green, shadow: false });
    tx().drawRaw(strip, 'SMALL', 4 - off + w, y, s, { ramp: R.green, shadow: false });
    for (let yy = y; yy < y + 9; yy++) {
      for (let x = 3; x < W - 3; x++) {
        const v = strip[yy * W + x];
        if (v !== 255) {
          fb[yy * W + x] = v;
        }
      }
    }
    strip.fill(255, y * W, (y + 10) * W);
  }

  // A menu: items in BIG red, the holo card cursor at the selected one, which sits on the
  // site's outset navy button with gold text and pushes in when chosen. NEW! badges blink.
  function menu(fb, items, sel, tic, opts) {
    const o = opts || {};
    const y0 = o.y || 46;
    const step = o.step || 19;
    if (o.title) {
      tx().draw(fb, 'BIG', 160, y0 - 30, o.title, { ramp: o.titleRamp === undefined ? R.yellow : o.titleRamp, align: 'center' });
    }
    const font = o.font || 'BIG';
    items.forEach(function (it, i) {
      const label = typeof it === 'string' ? it : it.label;
      let y = y0 + i * step;
      let x = o.x || 80;
      // the back-to-nexus item: a left-pointing triangle before the label (the fonts have no ◄)
      const icon = it.icon === 'back' ? (font === 'BIG' ? 12 : 8) : 0;
      if (i === sel) {
        const pressed = o.pressTic !== undefined && tic - o.pressTic < 5;
        const bw = tx().width(font, label) + 10 + icon;
        const bh = font === 'BIG' ? 17 : 12;
        const by = y - (font === 'BIG' ? 1 : 2);
        button(fb, x - 5, by + (pressed ? 1 : 0), bw, bh, pressed);
        if (pressed) {
          y += 1;
        } else if (!o.reduced) {
          x += Math.round(Math.sin(tic * 0.25));
        }
        backArrow(fb, x, y, icon, idx(R.yellow, 15));
        tx().draw(fb, font, x + icon, y, label, { ramp: it.dim ? R.grey : R.yellow, level: it.dim ? 18 : 33 });
        cursor(fb, x - 20, y + (font === 'BIG' ? 3 : 0), tic);
      } else {
        backArrow(fb, x, y, icon, idx(R.red, 13));
        tx().draw(fb, font, x + icon, y, label, { ramp: it.dim ? R.grey : R.red, level: it.dim ? 18 : 33 });
      }
      if (it.value !== undefined) {
        tx().draw(fb, 'SMALL', 300, y + 4, it.value, { ramp: R.green, align: 'right' });
      }
      if (it.badge && (o.still || o.reduced || (tic >> 4) % 4 !== 3)) {
        const bx = x + tx().width(font, label) + 8;
        fill(fb, bx, y + 3, tx().width('SMALL', it.badge) + 5, 11, idx(R.red, 13));
        tx().drawRaw(fb, 'SMALL', bx + 3, y + 4, it.badge, { ramp: R.grey, shadow: false });
      }
    });
  }

  // A solid left-pointing triangle `size` wide at (x, y), for the ◄ NEXUS item.
  function backArrow(fb, x, y, size, color) {
    if (!size) {
      return;
    }
    const h = size + 2;
    const w = size - 3;
    for (let yy = 0; yy < h; yy++) {
      const reach = Math.round(w * (1 - Math.abs(yy - (h - 1) / 2) / ((h - 1) / 2)));
      for (let xx = w - reach; xx < w; xx++) {
        const X = x + xx;
        const Y = y + 2 + yy;
        if (X >= 0 && X < W && Y >= 0 && Y < H) {
          fb[Y * W + X] = color;
        }
      }
    }
  }

  // The site's goblin button: navy, a two-pixel outset border in #6666ff; inset when pressed.
  function button(fb, x, y, w, h, inset) {
    const light = idx(R.navy, 15);
    const dark = idx(R.navy, 6);
    fill(fb, x, y, w, h, idx(R.navy, 4));
    fill(fb, x, y, w, 2, inset ? dark : light);
    fill(fb, x, y, 2, h, inset ? dark : light);
    fill(fb, x, y + h - 2, w, 2, inset ? light : dark);
    fill(fb, x + w - 2, y, 2, h, inset ? light : dark);
  }

  // The site's panel: navy, a two-pixel cyan ridge, used behind menus and notices.
  function panel(fb, x, y, w, h) {
    fill(fb, x, y, w, h, idx(R.navy, 2));
    fill(fb, x, y, w, 1, idx(R.cyan, 14));
    fill(fb, x, y + 1, w, 1, idx(R.cyan, 9));
    fill(fb, x, y + h - 2, w, 1, idx(R.cyan, 6));
    fill(fb, x, y + h - 1, w, 1, idx(R.cyan, 3));
    fill(fb, x, y, 1, h, idx(R.cyan, 14));
    fill(fb, x + 1, y, 1, h, idx(R.cyan, 9));
    fill(fb, x + w - 2, y, 1, h, idx(R.cyan, 6));
    fill(fb, x + w - 1, y, 1, h, idx(R.cyan, 3));
  }

  function slider(n, max) {
    let s = '';
    for (let i = 0; i < max; i++) {
      s += i < n ? '#' : '-';
    }
    return s;
  }

  function prompt(fb, text) {
    const lines = tx().wrap('SMALL', text, 260);
    const h = lines.length * 10 + 14;
    const y = 90 - h / 2;
    panel(fb, 24, y, 272, h);
    tx().draw(fb, 'SMALL', 160, y + 7, lines.join('\n'), { ramp: R.grey, align: 'center' });
  }

  // ------------------------------------------------------------------ intermission

  function pct(n, total) {
    return total > 0 ? Math.floor(n * 100 / total) : 100;
  }

  function time(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  const STAR_POS = [[190, 54], [226, 54], [262, 54]];

  function intermission(fb, st, tic, reduced, still) {
    still = still || reduced;
    starfield(fb, tic, still);
    const t = T().inter;
    const F = T().flashy;
    J().bigText(fb, 'BIG', 160, 13, st.levelName, 1, J().rainbowRamp, reduced ? 0 : tic);
    subtitle(fb, 160, 26, st.daily ? F.DAILY + ' ' + t.FINISHED : t.FINISHED);
    J().rainbowRule(fb, 37, 3, tic, reduced);
    // left: the counts
    panel(fb, 6, 43, 150, 84);
    const rows = [
      [t.KILLS, st.shown.kills + '%'],
      [t.ITEMS, st.shown.items + '%'],
      [t.SECRETS, st.shown.secrets + '%']
    ];
    rows.forEach(function (r, i) {
      if (st.phase >= i) {
        tx().draw(fb, 'BIG', 14, 48 + i * 18, r[0], { ramp: R.red });
        tx().draw(fb, 'BIG', 148, 48 + i * 18, r[1], { ramp: R.yellow, align: 'right' });
      }
    });
    if (st.phase >= 3) {
      tx().draw(fb, 'SMALL', 14, 104, t.TIME + ' ' + time(st.shown.time), { ramp: R.cyan });
      tx().draw(fb, 'SMALL', 148, 104, t.PAR + ' ' + time(st.par), { ramp: R.cyan, align: 'right' });
      if (st.rec && st.rec.bestTime && st.phase >= 4) {
        tx().drawRaw(fb, 'SMALL', 81, 115, F.NEW_BEST, { ramp: R.green, align: 'center', shadow: true });
      }
    }
    // right: the stars and their rules
    panel(fb, 162, 43, 152, 84);
    for (let i = 0; i < 3; i++) {
      const p = STAR_POS[i];
      if (st.phase < 4 || i >= st.starShown) {
        J().star(fb, p[0], p[1], 9, idx(R.navy, 3), idx(R.navy, 7));
        continue;
      }
      const age = i === st.starShown - 1 && st.starTic !== undefined ? tic - st.starTic : 99;
      const r = 10 * J().popScale(age, 2.0, 8);
      if (st.stars[i]) {
        J().star(fb, p[0], p[1], r, function (x, y) { return idx(R.yellow, 11 + ((x + y + (reduced ? 0 : tic)) >> 2) % 5); }, idx(R.orange, 6));
      } else {
        J().star(fb, p[0], p[1], 9, idx(R.grey, 4), idx(R.grey, 8));
      }
    }
    (st.rules || []).forEach(function (rule, i) {
      const got = st.stars && st.phase >= 4 && i < st.starShown && st.stars[i];
      const y = 70 + i * 11;
      J().star(fb, 171, y + 3, 3, got ? idx(R.yellow, 15) : idx(R.navy, 6), got ? idx(R.orange, 8) : idx(R.navy, 9));
      tx().drawRaw(fb, 'SMALL', 178, y, rule, { ramp: got ? R.grey : R.navy, shadow: false, level: got ? 33 : 33 });
    });
    if (st.phase >= 4 && st.starShown >= 3 && st.rec) {
      tx().draw(fb, 'SMALL', 238, 108, '+' + st.foilShown + ' ' + F.FOIL + (st.rec.fresh ? '  ' + st.rec.fresh + ' NEW' : ''), { ramp: R.foil, align: 'center' });
    }
    if (st.phase > 4) {
      tx().draw(fb, 'SMALL', 160, 131, t.PULLED + ' ' + st.pulled.length, { ramp: R.orange, align: 'center' });
      const n = Math.min(st.pulled.length, st.flipped);
      const start = Math.max(0, n - 5);
      for (let i = start; i < n; i++) {
        miniCard(fb, 160 - Math.min(5, st.pulled.length) * 15 + (i - start) * 30, 141, st.pulled[i], tic);
      }
    }
    if (st.phase > 5) {
      let line = st.next ? t.ENTERING + ' ' + st.next : t.FUNNY;
      if (st.daily) {
        line = F.DAILY_SCORE + ' ' + st.dailyScore + (st.dailyBest ? '  ' + F.DAILY_NEW_BEST : '');
      }
      if (st.unlocked && st.unlocked.length && (still || (tic >> 4) % 3 !== 2)) {
        const names = st.unlocked.map(function (id) { return ns.meta.cosmetic(id).name; }).join(', ');
        tx().draw(fb, 'SMALL', 160, 178, F.NEW + ' ' + F.UNLOCKED + names, { ramp: R.magenta, align: 'center' });
      }
      tx().draw(fb, 'SMALL', 160, 189, line, { ramp: R.green, align: 'center' });
    }
  }

  // A card face 26x34: the cream frame, lane nameplate, the card number.
  function miniCard(fb, x, y, num, tic) {
    const card = ns.defs.cards[num - 1];
    const lane = ns.defs.laneColors[card.lane];
    fill(fb, x, y, 26, 34, idx(R.purple, 1));
    fill(fb, x + 1, y + 1, 24, 32, idx(R.tan, 15));
    fill(fb, x + 2, y + 3, 22, 16, idx(R.purple, 1));
    // the art window holds the card's photo, baked into the sheets by tools/photos.py
    const art = 'CARDART' + (num < 10 ? '0' : '') + num;
    if (ns.assets.hasFrame(art)) {
      ns.render.patch(fb, x + 3, y + 4, art, 33);
    } else {
      fill(fb, x + 3, y + 4, 20, 14, idx(R.grey, 1));
    }
    fill(fb, x + 2, y + 20, 22, 6, lane.plate);
    fill(fb, x + 3, y + 28, 8, 2, card.rarity === 'ultra' ? idx(R.magenta, 13) : (card.rarity === 'holo' ? idx(R.cyan, 13) : idx(R.red, 12)));
    if (card.rarity === 'holo' || card.rarity === 'ultra') {
      const k = Math.floor(tic / 3) % 26;
      fill(fb, x + k, y + 1, 1, 32, idx(R.foil, 14));
    }
  }

  // ------------------------------------------------------------------ collection

  function collection(fb, have, sel, tic, still) {
    starfield(fb, tic, still);
    const total = Object.keys(have).length;
    tx().draw(fb, 'BIG', 160, 4, T().COLLECTION_HEADER, { ramp: R.yellow, align: 'center' });
    tx().draw(fb, 'SMALL', 160, 22, total + '/33', { ramp: R.green, align: 'center' });
    const cols = 11;
    for (let i = 0; i < 33; i++) {
      const cx = 8 + (i % cols) * 28;
      const cy = 34 + Math.floor(i / cols) * 38;
      const num = i + 1;
      if (have[num]) {
        miniCard(fb, cx, cy, num, tic);
      } else {
        fill(fb, cx, cy, 26, 34, idx(R.navy, 1));
        for (let k = 0; k < 26; k += 2) {
          fb[cy * W + cx + k] = idx(R.navy, 6);
          fb[(cy + 33) * W + cx + k] = idx(R.navy, 6);
        }
        for (let k = 0; k < 34; k += 2) {
          fb[(cy + k) * W + cx] = idx(R.navy, 6);
          fb[(cy + k) * W + cx + 25] = idx(R.navy, 6);
        }
        tx().drawRaw(fb, 'BIG', cx + 13, cy + 9, '?', { ramp: R.navy, align: 'center', shadow: false });
      }
      if (i === sel) {
        fill(fb, cx - 1, cy - 1, 28, 1, idx(R.yellow, 14));
        fill(fb, cx - 1, cy + 34, 28, 1, idx(R.yellow, 14));
        fill(fb, cx - 1, cy - 1, 1, 36, idx(R.yellow, 14));
        fill(fb, cx + 26, cy - 1, 1, 36, idx(R.yellow, 14));
      }
    }
    const card = ns.defs.cards[sel];
    const num = sel + 1;
    const n = (num < 10 ? '0' : '') + num;
    if (have[num]) {
      tx().draw(fb, 'SMALL', 160, 152, '#' + n + '/33  ' + card.name, { ramp: R.grey, align: 'center' });
      tx().draw(fb, 'SMALL', 160, 162, card.role + '  ·  ' + card.rarity.toUpperCase(), { ramp: R.cyan, align: 'center' });
      tx().draw(fb, 'SMALL', 160, 174, T().THREAD(n, card.name), { ramp: R.green, align: 'center', wrap: 300 });
    } else {
      tx().draw(fb, 'SMALL', 160, 160, '#' + n + '/33  ' + T().NOT_PULLED, { ramp: R.grey, align: 'center' });
    }
  }

  // ------------------------------------------------------------------ death, finale, credits

  function deathOverlay(fb, tics) {
    if (tics < 35) {
      return;
    }
    panel(fb, 14, 40, 292, 62);
    tx().draw(fb, 'SMALL', 160, 50, T().DEATH_THREAD, { ramp: R.green, align: 'center', wrap: 276 });
    tx().draw(fb, 'SMALL', 160, 80, T().DEATH_RUDIGER, { ramp: R.orange, align: 'center', wrap: 276 });
  }

  function finale(fb, tic, chars, still) {
    starfield(fb, tic, still);
    tx().draw(fb, 'SMALL', 22, 14, T().FINALE, { ramp: R.orange, wrap: 276, count: chars });
  }

  // The credits crawl: the game's credits, then every card photo with its credit line as
  // the site prints it, scrolling up over the starfield.
  let creditLines = null;
  function creditsList() {
    if (creditLines) {
      return creditLines;
    }
    const F = T().flashy;
    const out = [];
    T().CREDITS.forEach(function (l, i) {
      out.push({ text: l, font: i === 0 ? 'BIG' : 'SMALL', ramp: i === 0 ? R.yellow : R.grey, h: i === 0 ? 22 : 11 });
    });
    out.push({ text: '', h: 16 });
    out.push({ text: F.CREDITS_PHOTOS, font: 'BIG', ramp: R.magenta, h: 22 });
    tx().wrap('SMALL', F.CREDITS_PHOTOS_SUB, 280).forEach(function (l) {
      out.push({ text: l, font: 'SMALL', ramp: R.cyan, h: 11 });
    });
    out.push({ text: '', h: 8 });
    ns.defs.cards.forEach(function (c) {
      out.push({ text: '#' + (c.num < 10 ? '0' : '') + c.num + '  ' + c.name, font: 'SMALL', ramp: R.yellow, h: 11, art: c.num });
      tx().wrap('SMALL', c.credit, 260).forEach(function (l) {
        out.push({ text: l, font: 'SMALL', ramp: R.grey, h: 11 });
      });
      out.push({ text: '', h: 6 });
    });
    out.push({ text: '', h: 20 });
    out.push({ text: T().STOINLY_REAL, font: 'BIG', ramp: R.orange, h: 22 });
    creditLines = out;
    return out;
  }

  function creditsLength() {
    return creditsList().reduce(function (a, l) { return a + l.h; }, 0) + 200;
  }

  function credits(fb, tic, scroll, still) {
    starfield(fb, tic, still);
    let y = 200 - Math.floor(scroll || 0);
    for (const l of creditsList()) {
      if (y > -24 && y < 200 && l.text) {
        if (l.art && ns.assets.hasFrame('CARDART' + (l.art < 10 ? '0' : '') + l.art)) {
          fill(fb, 21, y - 3, 22, 16, idx(R.purple, 1));
          ns.render.patch(fb, 22, y - 2, 'CARDART' + (l.art < 10 ? '0' : '') + l.art, 33);
        }
        tx().draw(fb, l.font, 172, y, l.text, { ramp: l.ramp, align: 'center' });
      }
      y += l.h;
    }
    fill(fb, 0, 0, W, 12, idx(R.navy, 1));
    J().rainbowRule(fb, 12, 2, tic, false);
    tx().drawRaw(fb, 'SMALL', 160, 2, T().flashy.CREDITS_HINT, { ramp: R.cyan, align: 'center', shadow: false });
  }

  // ------------------------------------------------------------------ pause

  function pause(fb, tic, info) {
    const F = T().flashy;
    ns.render.darken(fb, 0, 0, W, VIEW_H, 8);
    panel(fb, 30, 22, 260, 124);
    J().bigText(fb, 'BIG', 160, 38, T().PAUSE, 1.6, J().rainbowRamp, info.reduced ? 0 : tic);
    subtitle(fb, 160, 54, F.PAUSE_SUB);
    for (let yy = 66; yy < 69; yy++) {
      for (let x = 34; x < 286; x++) {
        fb[yy * W + x] = [5, 6, 7, 8, 10, 14][Math.floor((x + (info.reduced ? 0 : tic * 1.5)) / 6) % 6] * 16 + 13;
      }
    }
    tx().drawRaw(fb, 'SMALL', 160, 74, F.PAUSE_STARS, { ramp: R.yellow, align: 'center', shadow: true });
    info.rules.forEach(function (rule, i) {
      const had = info.stars[i];
      const y = 88 + i * 13;
      J().star(fb, 46, y + 4, 5, had ? idx(R.yellow, 15) : idx(R.navy, 4), had ? idx(R.orange, 8) : idx(R.navy, 9));
      tx().drawRaw(fb, 'SMALL', 56, y, rule, { ramp: had ? R.grey : R.cyan, shadow: true });
    });
    const s = info.stats;
    const line = T().inter.KILLS + ' ' + s.kills + '/' + s.killsTotal + '   ' + T().inter.ITEMS + ' ' + s.items + '/' + s.itemsTotal + '   ' + T().inter.SECRETS + ' ' + s.secrets + '/' + s.secretsTotal + '   ' + time(Math.floor(s.time / 35));
    tx().drawRaw(fb, 'SMALL', 160, 130, line, { ramp: R.green, align: 'center', shadow: true });
  }

  // ------------------------------------------------------------------ the locker

  function lockerTile(fb, c, x, y, meta, sel, tic, reduced, still) {
    const unlocked = meta.unlocked[c.id];
    const on = meta.equipped[c.kind] === c.id;
    const bob = sel && !reduced ? Math.round(Math.sin(tic * 0.2) * 1.5) - 1 : 0;
    y += bob;
    fill(fb, x, y, 38, 40, sel ? idx(R.yellow, 14) : (on ? idx(R.green, 12) : idx(R.purple, 2)));
    fill(fb, x + 1, y + 1, 36, 38, unlocked ? idx(R.navy, 3) : idx(R.navy, 1));
    if (unlocked) {
      // a swatch of the look: a held card for skins, a slice of status bar for themes
      for (let yy = 0; yy < 24; yy++) {
        for (let xx = 0; xx < 30; xx++) {
          let ramp = c.ramp;
          if (c.bands) {
            ramp = c.bands[Math.floor((xx + yy + (reduced ? 0 : tic)) / 5) % c.bands.length];
          }
          if (ramp === undefined || ramp < 0) {
            ramp = c.kind === 'weapon' ? R.grey : R.cyan;
          }
          let shade;
          if (c.kind === 'weapon') {
            const inCard = xx > 8 && xx < 22 && yy > 1 && yy < 22;
            if (!inCard) {
              continue;
            }
            shade = (xx === 9 || xx === 21 || yy === 2 || yy === 21) ? 6 : 10 + ((xx + yy) % 4);
          } else {
            const edge = yy === 4 || yy === 19 || xx === 0 || xx === 29;
            if (yy < 4 || yy > 19) {
              continue;
            }
            shade = edge ? 14 : 3;
            if (!edge && yy > 8 && yy < 15 && xx > 4 && xx < 25 && (xx % 5) < 3) {
              ramp = R.green;
              shade = 14;
            }
          }
          fb[(y + 4 + yy) * W + x + 4 + xx] = ramp * 16 + (ramp === 15 ? Math.min(14, shade) : shade);
        }
      }
    } else {
      // the locked silhouette
      fill(fb, x + 12, y + 6, 14, 20, idx(R.navy, 5));
      tx().drawRaw(fb, 'BIG', x + 19, y + 7, '?', { ramp: R.navy, align: 'center', shadow: false });
    }
    if (on) {
      tx().drawRaw(fb, 'TINY', x + 19, y + 32, 'ON', { ramp: R.green, align: 'center', shadow: false });
    } else if (!unlocked && c.unlock.foil) {
      tx().drawRaw(fb, 'TINY', x + 19, y + 32, String(c.unlock.foil), { ramp: R.foil, align: 'center', shadow: false });
    } else if (!unlocked && c.unlock.stars) {
      J().star(fb, x + 14, y + 34, 3, idx(R.yellow, 14), idx(R.orange, 7));
      tx().drawRaw(fb, 'TINY', x + 19, y + 32, String(c.unlock.stars), { ramp: R.yellow, shadow: false });
    } else if (!unlocked && c.unlock.streak) {
      flame(fb, x + 11, y + 29, tic);
      tx().drawRaw(fb, 'TINY', x + 20, y + 32, String(c.unlock.streak), { ramp: R.orange, shadow: false });
    }
    if (meta.fresh[c.id] && (still || reduced || (tic >> 3) % 3 !== 2)) {
      fill(fb, x + 18, y - 3, 22, 9, idx(R.red, 13));
      tx().drawRaw(fb, 'TINY', x + 29, y - 1, 'NEW', { ramp: R.grey, align: 'center', shadow: false });
    }
  }

  function locker(fb, meta, m, tic, reduced, still) {
    const F = T().flashy;
    still = still || reduced;
    starfield(fb, tic, still);
    J().bigText(fb, 'BIG', 160, 12, F.LOCKER, 1.2, J().rainbowRamp, reduced ? 0 : tic);
    J().rainbowRule(fb, 25, 2, tic, reduced);
    const stars = ns.meta.totalStars(meta);
    J().star(fb, 14, 34, 5, idx(R.yellow, 15), idx(R.orange, 8));
    tx().drawRaw(fb, 'SMALL', 22, 30, stars + ' ' + F.STARS, { ramp: R.yellow, shadow: true });
    tx().drawRaw(fb, 'SMALL', 310, 30, F.FOIL + ' ' + meta.foil, { ramp: R.foil, shadow: true, align: 'right' });
    const list = ns.meta.COSMETICS;
    tx().drawRaw(fb, 'SMALL', 12, 42, F.LOCKER_SKINS, { ramp: R.cyan, shadow: true });
    tx().drawRaw(fb, 'SMALL', 12, 96, F.LOCKER_HUDS, { ramp: R.cyan, shadow: true });
    list.forEach(function (c, i) {
      const row = c.kind === 'weapon' ? 0 : 1;
      const col = row === 0 ? i : i - 7;
      lockerTile(fb, c, 12 + col * 43, 53 + row * 54, meta, i === m.sel, tic, reduced, still);
    });
    const c = list[m.sel];
    const unlocked = meta.unlocked[c.id];
    panel(fb, 8, 156, 304, 40);
    tx().draw(fb, 'SMALL', 160, 161, c.name + (c.kind === 'weapon' ? ' - WEAPON SKIN' : ' - HUD THEME'), { ramp: R.yellow, align: 'center' });
    let line;
    let ramp = R.green;
    if (m.note) {
      line = m.note;
      ramp = R.red;
    } else if (meta.equipped[c.kind] === c.id) {
      line = F.LOCKER_EQUIPPED;
    } else if (unlocked) {
      line = F.LOCKER_EQUIP;
    } else if (c.unlock.foil) {
      line = F.LOCKER_BUY + c.unlock.foil + ' ' + F.FOIL;
      ramp = meta.foil >= c.unlock.foil ? R.green : R.orange;
    } else {
      line = F.LOCKER_LOCKED + ns.meta.unlockText(c);
      ramp = R.orange;
    }
    tx().draw(fb, 'SMALL', 160, 174, line, { ramp: ramp, align: 'center' });
  }

  // ------------------------------------------------------------------ the daily chest

  function drawChest(fb, cx, cy, tic, opts) {
    const o = opts || {};
    const w = 84;
    const h = 52;
    const x0 = Math.round(cx - w / 2);
    const y0 = Math.round(cy - h / 2);
    const off = o.reduced ? 0 : tic * 1.5;
    const lidH = 18;
    const lidLift = o.open ? 16 : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isLid = y < lidH;
        const yy = isLid ? y0 + y - lidLift : y0 + y;
        if (yy < 0 || yy >= H) {
          continue;
        }
        const edge = x < 2 || x >= w - 2 || y < 2 || y >= h - 2 || y === lidH || y === lidH - 1;
        const band = x >= w / 2 - 5 && x < w / 2 + 5;
        let v;
        if (edge) {
          v = idx(R.purple, 2);
        } else if (band) {
          v = idx(R.yellow, 10 + ((x + y) % 3));
        } else {
          const t = ((x + y * 1.5 + off) % 56) / 56;
          v = idx(R.foil, Math.min(14, 7 + Math.round(7 * Math.abs(Math.sin(t * Math.PI * 2)))));
        }
        fb[yy * W + x0 + x] = v;
      }
    }
    // the lock plate
    fill(fb, cx - 5, y0 + lidH - 4 - lidLift, 10, 9, idx(R.yellow, 14));
    fill(fb, cx - 1, y0 + lidH - 1 - lidLift, 2, 4, idx(R.purple, 1));
    if (o.open) {
      // light pouring out of the gap, in rays
      for (let y = y0 + lidH - lidLift; y < y0 + lidH; y++) {
        for (let x = x0 + 4; x < x0 + w - 4; x++) {
          const ray = ((x - x0 + (o.reduced ? 0 : tic >> 1)) % 9) < 4;
          fb[y * W + x] = ray ? idx(R.yellow, 15) : idx(R.orange, 12);
        }
      }
    }
  }

  function chest(fb, c, ready, tic, reduced, still) {
    const F = T().flashy;
    still = still || reduced;
    starfield(fb, tic, still);
    J().bigText(fb, 'BIG', 160, 14, F.CHEST, 1.3, J().rainbowRamp, reduced ? 0 : tic);
    J().rainbowRule(fb, 28, 2, tic, reduced);
    const opened = c.openTic >= 0;
    const since = tic - c.shakeTic;
    let dx = 0;
    let dy = reduced ? 0 : Math.round(Math.sin(tic * 2 * Math.PI / 49) * 3) - 3;
    if (!reduced && since < 12) {
      dx = Math.round(Math.sin(since * 2.2) * (6 - since / 2));
      dy -= Math.round((12 - since) / 4);
    }
    if (!ready && !opened) {
      drawChest(fb, 160, 92, tic, { open: true, reduced: reduced });
      tx().draw(fb, 'SMALL', 160, 140, F.CHEST_DONE, { ramp: R.cyan, align: 'center', wrap: 280 });
      tx().draw(fb, 'SMALL', 160, 176, F.CHEST_OPEN, { ramp: R.teal, align: 'center', wrap: 280 });
      return;
    }
    if (!opened) {
      drawChest(fb, 160 + dx, 92 + dy, tic, { reduced: reduced });
      for (let i = 0; i < 3; i++) {
        J().star(fb, 146 + i * 14, 132, 4, i < c.pokes ? idx(R.yellow, 15) : idx(R.navy, 5), idx(R.orange, 7));
      }
      tx().draw(fb, 'SMALL', 160, 146, F.CHEST_POKE, { ramp: R.yellow, align: 'center', count: still || (tic >> 4) % 2 === 0 ? 99 : 0 });
      tx().draw(fb, 'SMALL', 160, 176, F.CHEST_OPEN, { ramp: R.teal, align: 'center', wrap: 280 });
      return;
    }
    // open: the prize card flips in over the chest
    drawChest(fb, 160, 142, tic, { open: true, reduced: reduced });
    const age = tic - c.openTic;
    const flip = Math.min(1, age / 14);
    const cw = Math.max(2, Math.round(140 * Math.abs(Math.cos((1 - flip) * Math.PI / 2))));
    const s = J().popScale(age, 0.4, 14);
    const ch = Math.round(56 * Math.min(1.1, s));
    const x0 = 160 - (cw >> 1);
    const y0 = 62 - (ch >> 1);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const edge = x < 3 || y < 3 || x >= cw - 3 || y >= ch - 3;
        fb[(y0 + y) * W + x0 + x] = edge ? RAINBOW[Math.floor((x + y + (reduced ? 0 : tic)) / 4) % RAINBOW.length] * 16 + 13 : idx(R.navy, 2);
      }
    }
    if (flip >= 1 && c.prize) {
      J().bigText(fb, 'BIG', 160, 54, '+' + c.prize.foil + ' ' + F.FOIL, 1, J().rainbowRamp, reduced ? 0 : tic);
      if (c.prize.item) {
        tx().drawRaw(fb, 'SMALL', 160, 70, F.UNLOCKED + ns.meta.cosmetic(c.prize.item).name, { ramp: R.magenta, align: 'center', shadow: true });
      } else {
        tx().drawRaw(fb, 'SMALL', 160, 70, F.CHEST_OPEN.split('.')[0] + '.', { ramp: R.cyan, align: 'center', shadow: true });
      }
    }
    tx().draw(fb, 'SMALL', 160, 182, F.CHEST_DONE, { ramp: R.teal, align: 'center', wrap: 280 });
  }

  // ------------------------------------------------------------------ the daily challenge

  function daily(fb, info, today, tic, reduced, still) {
    still = still || reduced;
    const F = T().flashy;
    const d = info.daily;
    starfield(fb, tic, still);
    J().bigText(fb, 'BIG', 160, 14, F.DAILY, 1.2, J().rainbowRamp, reduced ? 0 : tic);
    subtitle(fb, 160, 28, today);
    J().rainbowRule(fb, 40, 2, tic, reduced);
    panel(fb, 16, 48, 288, 104);
    tx().draw(fb, 'SMALL', 160, 54, F.DAILY_SUB, { ramp: R.cyan, align: 'center' });
    const art = ns.levels && ns.game.levels()[d.level];
    tx().draw(fb, 'BIG', 160, 68, art ? art.name : '', { ramp: R.yellow, align: 'center' });
    const cardNum = art && art.card;
    if (cardNum) {
      miniCard(fb, 26, 64, cardNum, tic);
    }
    tx().draw(fb, 'BIG', 160, 90, d.mod.name, { ramp: R.magenta, align: 'center' });
    tx().draw(fb, 'SMALL', 160, 110, d.mod.text, { ramp: R.grey, align: 'center', wrap: 260 });
    tx().draw(fb, 'SMALL', 160, 134, F.DAILY_BEST + ' ' + info.dailyBest + '    ' + F.DAILY_PLAYS + ' ' + info.dailyPlays, { ramp: R.green, align: 'center' });
    hookStrip(fb, 70, 160, info, tic);
    tx().draw(fb, 'SMALL', 160, 180, F.PRESS_FIRE, { ramp: R.yellow, align: 'center', count: still || (tic >> 4) % 2 === 0 ? 99 : 0 });
  }

  function whiteout(fb, k) {
    // k 0..1: the screen burns to white
    const cm = ns.palette.colormap;
    if (k <= 0) {
      return;
    }
    const n = Math.floor(k * 16);
    for (let i = 0; i < W * H; i++) {
      const v = fb[i];
      const shade = Math.min(15, (v & 15) + n);
      fb[i] = k > 0.95 ? idx(R.grey, 15) : ((v >> 4) * 16 + shade);
    }
    void cm;
  }

  ns.screens = {
    starfield: starfield,
    cursor: cursor,
    title: title,
    ticker: ticker,
    menu: menu,
    slider: slider,
    prompt: prompt,
    panel: panel,
    intermission: intermission,
    miniCard: miniCard,
    collection: collection,
    deathOverlay: deathOverlay,
    finale: finale,
    credits: credits,
    creditsLength: creditsLength,
    whiteout: whiteout,
    pct: pct,
    pause: pause,
    locker: locker,
    chest: chest,
    daily: daily,
    subtitle: subtitle,
    button: button,
    foilBox: foilBox,
    STAR_POS: STAR_POS
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
