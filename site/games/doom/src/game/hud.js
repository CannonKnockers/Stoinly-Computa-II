(function (ns) {
  'use strict';
  // hud.js: everything drawn over the 3D view during play. The status bar (ammo, ACCOUNT,
  // arms, Rudiger's face, KICKS, keycards, the ammo table), the messages at the top left,
  // the screen tint of damage and pickups, and the automap with THE TIME IN CUPERTINO.

  const W = 320;
  const VIEW_H = 168;
  const R = { grey: 0, red: 5, orange: 6, yellow: 7, green: 8, teal: 9, cyan: 10, navy: 12, foil: 15 };
  const MESSAGE_TICS = 4 * 35;

  function text() {
    return ns.text;
  }

  function T() {
    return ns.defs.text;
  }

  function patch(fb, name, x, y) {
    ns.render.patch(fb, x, y, name, 33);
  }

  function led(fb, x, y, n, ramp, align) {
    text().draw(fb, 'LED', x, y, String(n), { align: align || 'right', ramp: ramp, shadow: false });
  }

  function faceName(g, pl) {
    if (pl.dead) {
      return 'FACE_DEAD';
    }
    if (pl.powers.ceiling > 0) {
      return 'FACE_GOD';
    }
    const tier = pl.hp >= 80 ? 0 : (pl.hp >= 60 ? 1 : (pl.hp >= 40 ? 2 : (pl.hp >= 20 ? 3 : 4)));
    const f = pl.face;
    if (f.state === 'ouch') {
      return 'FACE_' + tier + '_OUCH';
    }
    if (f.state === 'grin') {
      return 'FACE_' + tier + '_GRIN';
    }
    if (f.state === 'rampage' || f.state === 'hurt') {
      return 'FACE_' + tier + '_RAGE';
    }
    return 'FACE_' + tier + '_' + (f.look + 1);
  }

  function statusBar(fb, g) {
    const pl = g.player;
    patch(fb, 'STBAR', 0, VIEW_H);
    const y = VIEW_H;
    const small = { ramp: R.cyan, align: 'center', shadow: false, level: 33 };
    // AMMO
    const wdef = ns.player.WEAPONS[pl.readyWeapon];
    if (wdef.ammo) {
      const n = pl.ammo[wdef.ammo];
      led(fb, 40, y + 5, n, n < 10 ? R.red : R.green);
      text().drawRaw(fb, 'SMALL', 22, y + 20, T().HUD[wdef.ammo.toUpperCase()], small);
    }
    // ACCOUNT
    const hpRamp = pl.hp < 25 ? R.red : R.green;
    text().drawRaw(fb, 'SMALL', 50, y + 7, '$', { ramp: hpRamp, shadow: false });
    led(fb, 100, y + 5, Math.max(0, pl.hp), hpRamp);
    text().drawRaw(fb, 'SMALL', 74, y + 20, T().HUD.ACCOUNT, small);
    // ARMS: slots 2..7 as chips
    for (let s = 2; s <= 7; s++) {
      const w = [null, null, 1, 2, 3, 4, 5, 6][s];
      const cx = 108 + ((s - 2) % 3) * 12;
      const cy = y + 5 + Math.floor((s - 2) / 3) * 11;
      const owned = pl.weapons[w];
      ns.render.fill(fb, cx, cy, 10, 9, owned ? R.green * 16 + 9 : R.navy * 16 + 2);
      text().drawRaw(fb, 'SMALL', cx + 3, cy + 1, String(s), { ramp: owned ? R.green : R.teal, shadow: false, level: owned ? 33 : 20 });
      if (pl.readyWeapon === w) {
        ns.render.fill(fb, cx, cy + 8, 10, 1, R.cyan * 16 + 14);
      }
    }
    // the face
    patch(fb, faceName(g, pl), 148, y + 2);
    // KICKS
    led(fb, 212, y + 5, pl.armor, pl.armor > 0 ? R.green : R.teal);
    text().drawRaw(fb, 'SMALL', 197, y + 20, T().HUD.KICKS, small);
    // keycards
    const keys = [['blue', 'KEY_BLUE'], ['red', 'KEY_RED'], ['gold', 'KEY_GOLD']];
    keys.forEach(function (k, i) {
      if (pl.keys[k[0]]) {
        patch(fb, k[1], 223, y + 3 + i * 9);
      } else {
        ns.render.fill(fb, 223, y + 3 + i * 9, 7, 8, R.navy * 16 + 1);
      }
    });
    // the ammo table
    ['cards', 'packs', 'pods', 'cans'].forEach(function (k, i) {
      const ty = y + 4 + i * 7;
      const label = T().HUD[k.toUpperCase()];
      const cur = pl.ammo[k];
      const max = ns.player.maxAmmo(pl, k);
      text().drawRaw(fb, 'TINY', 240, ty, label, { ramp: R.cyan, shadow: false });
      text().drawRaw(fb, 'TINY', 293, ty, String(cur), { ramp: cur > 0 ? R.green : R.teal, shadow: false, align: 'right' });
      text().drawRaw(fb, 'TINY', 296, ty, '/', { ramp: R.teal, shadow: false });
      text().drawRaw(fb, 'TINY', 315, ty, String(max), { ramp: R.teal, shadow: false, align: 'right' });
    });
  }

  function messages(fb, g, enabled, top) {
    if (!enabled) {
      return;
    }
    const y0 = top || 3;
    const list = g.messages.filter(function (m) { return g.tic - m.tic < MESSAGE_TICS; });
    const show = list.slice(-2);
    show.forEach(function (m, i) {
      let ramp = R.grey;
      const s = m.text;
      if (s.indexOf('THE COMPUTER') === 0) {
        ramp = R.green;
      } else if (s.indexOf('PULLED CARD') === 0 || s.indexOf('A SECRET') === 0 || s.indexOf('HAS LEFT') > 0 || s.indexOf('LOGGED OFF') > 0) {
        ramp = R.orange;
      } else if (s.indexOf('YOU NEED') === 0 || s === T().BAILOUT || s === T().WEEKEND || s === T().CUSTODY || s === T().NOT_YOUR_WEEKEND || s === T().DELETED || s === T().CRISIS_DEAD || s === T().STOINLY_REAL) {
        ramp = R.red;
      } else if (s.indexOf('SPECIAL GUEST') === 0) {
        ramp = R.green;
      }
      text().draw(fb, 'SMALL', 3, y0 + i * 10, s, { ramp: ramp, wrap: 314 });
    });
  }

  // ------------------------------------------------------------------ cosmetics

  // A weapon skin as a texel remap: every ramp but the skin ramp (Rudiger's hands) takes the
  // skin's ramp shade for shade; a banded skin picks the ramp by shade and time, so the
  // stripes run across the weapon like foil.
  const skinCache = {};
  function skinRemap(c, tic) {
    if (!c || (c.ramp === undefined || c.ramp < 0) && !c.bands) {
      return null;
    }
    const phase = c.bands ? Math.floor(tic / 3) % c.bands.length : 0;
    const key = c.id + ':' + phase;
    if (skinCache[key]) {
      return skinCache[key];
    }
    const t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const ramp = i >> 4;
      let shade = i & 15;
      // hands keep their skin, and the dark sleeve stays a sleeve
      if (i === 255 || ramp === 4 || ((ramp === 0 || ramp === 1) && shade < 7)) {
        t[i] = i;
        continue;
      }
      const to = c.bands ? c.bands[(shade + phase) % c.bands.length] : c.ramp;
      if (to === 15 && shade > 14) {
        shade = 14;
      }
      t[i] = to * 16 + shade;
    }
    skinCache[key] = t;
    return t;
  }

  // A HUD theme recolors the status bar's cyan (ramp 10); a banded theme slides a rainbow.
  // A two-row rainbow rule runs along the top of the bar in every theme.
  function theme(fb, c, tic, reduced) {
    const off = reduced ? 0 : Math.floor(tic * 1.5);
    const ramps = [5, 6, 7, 8, 10, 14];
    for (let y = VIEW_H; y < VIEW_H + 2; y++) {
      for (let x = 0; x < W; x++) {
        fb[y * W + x] = ramps[Math.floor((x + off) / 6) % ramps.length] * 16 + 13;
      }
    }
    if (!c || (c.ramp === 10 && !c.bands)) {
      return;
    }
    for (let y = VIEW_H + 2; y < 200; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const v = fb[i];
        if (v >> 4 !== 10) {
          continue;
        }
        const to = c.bands ? c.bands[Math.floor((x + off) / 10) % c.bands.length] : c.ramp;
        fb[i] = to * 16 + (to === 15 ? Math.min(14, v & 15) : (v & 15));
      }
    }
  }

  // The weapon, bobbing with the walk.
  function weaponView(g, pl, frac, skin) {
    if (pl.dead) {
      return null;
    }
    const name = ns.player.weaponFrame(pl);
    if (!ns.assets.hasFrame(name)) {
      return null;
    }
    const v = ns.assets.getFrame(name);
    const phase = (g.tic + frac) * Math.PI * 2 / 40;
    const bob = pl.psp.step >= 0 ? 0 : pl.bob * 160;
    return {
      view: v,
      x: 160 + Math.cos(phase) * bob,
      y: VIEW_H + Math.abs(Math.sin(phase)) * bob * 0.5 + pl.psp.y,
      bright: pl.psp.flash > 0,
      fuzz: pl.powers.jawn > 0 && pl.powers.jawn % 8 < 6,
      remap: skinRemap(skin, g.tic)
    };
  }

  // Which screen tint is strongest: damage red, pickup gold, waders green. still (flashes
  // off): no gold pickup flash, and the waders' green holds steady instead of blinking out.
  function tint(g, still) {
    const pl = g.player;
    if (pl.damageCount > 0 || pl.dead) {
      return { name: 'damage', strength: pl.dead ? 0.6 : Math.min(1, pl.damageCount / 40) };
    }
    if (pl.bonusCount > 0 && !still) {
      return { name: 'pickup', strength: pl.bonusCount / 20 };
    }
    if (pl.powers.waders > 0 && (still || pl.powers.waders > 128 || pl.powers.waders & 8)) {
      return { name: 'suit', strength: 1 };
    }
    return null;
  }

  // ------------------------------------------------------------------ automap

  function automap(fb, g, zoom) {
    const lv = g.level;
    const pl = g.player;
    ns.render.fill(fb, 0, 0, W, VIEW_H, R.navy * 16 + 1);
    const sc = zoom || 8;
    const cx = W / 2;
    const cy = VIEW_H / 2;
    const toX = function (x) {
      return Math.round(cx + (x - pl.x) * sc);
    };
    const toY = function (y) {
      return Math.round(cy + (y - pl.y) * sc);
    };
    const line = function (x0, y0, x1, y1, color) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + (x1 - x0) * i / n);
        const y = Math.round(y0 + (y1 - y0) * i / n);
        if (x >= 0 && x < W && y >= 0 && y < VIEW_H) {
          fb[y * W + x] = color;
        }
      }
    };
    const seen = g.mapSeen;
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const c = lv.cells[y * lv.w + x];
        if (c.solid) {
          continue;
        }
        if (!pl.powers.computer && !seen[y * lv.w + x]) {
          continue;
        }
        // edges toward walls, doors and height changes
        const nb = [[0, -1, x, y, x + 1, y], [0, 1, x, y + 1, x + 1, y + 1], [-1, 0, x, y, x, y + 1], [1, 0, x + 1, y, x + 1, y + 1]];
        for (const e of nb) {
          const n = lv.cells[(y + e[1]) * lv.w + x + e[0]];
          let color = -1;
          if (!n || n.solid) {
            color = R.red * 16 + 11;
          } else if (n.door || c.door) {
            color = R.cyan * 16 + 13;
          } else if (Math.abs(n.fz - c.fz) > 0.01) {
            color = R.orange * 16 + 9;
          } else if (Math.abs(n.cz - c.cz) > 0.01 && !(n.sky && c.sky)) {
            color = R.yellow * 16 + 8;
          }
          if (color >= 0 && !(c.door && n && n.door)) {
            line(toX(e[2]), toY(e[3]), toX(e[4]), toY(e[5]), color);
          }
        }
      }
    }
    if (pl.powers.computer) {
      for (const o of g.things) {
        if (o.removed || o.player || !o.def || (o.def.kind !== 'monster' && o.def.kind !== 'item')) {
          continue;
        }
        const x = toX(o.x);
        const y = toY(o.y);
        if (x >= 1 && x < W - 1 && y >= 1 && y < VIEW_H - 1) {
          fb[y * W + x] = o.def.kind === 'monster' ? (o.dead ? R.grey * 16 + 6 : R.red * 16 + 14) : R.yellow * 16 + 13;
        }
      }
    }
    // the player arrow
    const a = pl.angle;
    const px = cx;
    const py = cy;
    const tip = [px + Math.cos(a) * 6, py + Math.sin(a) * 6];
    const l = [px + Math.cos(a + 2.5) * 4, py + Math.sin(a + 2.5) * 4];
    const r = [px + Math.cos(a - 2.5) * 4, py + Math.sin(a - 2.5) * 4];
    const lime = R.green * 16 + 15;
    line(Math.round(l[0]), Math.round(l[1]), Math.round(tip[0]), Math.round(tip[1]), lime);
    line(Math.round(r[0]), Math.round(r[1]), Math.round(tip[0]), Math.round(tip[1]), lime);
    line(Math.round(l[0]), Math.round(l[1]), Math.round(r[0]), Math.round(r[1]), lime);
    // header: the time in Cupertino, this map's hour plus the time spent
    const minutes = Math.floor(g.stats.time / 35 / 60);
    const hour = lv.def.hourNum || 9;
    const h24 = (hour + Math.floor(minutes / 60)) % 24;
    const mm = minutes % 60;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = ((h24 + 11) % 12) + 1;
    const clock = h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm;
    text().draw(fb, 'SMALL', 160, VIEW_H - 24, T().HUD.CUPERTINO + clock, { ramp: R.green, align: 'center' });
    text().draw(fb, 'SMALL', 160, VIEW_H - 12, lv.name + ' · 1995', { ramp: R.cyan, align: 'center' });
  }

  // Marks the cells the player has seen, for the automap without THE COMPUTER.
  function markSeen(g) {
    const lv = g.level;
    const pl = g.player;
    if (!g.mapSeen) {
      g.mapSeen = new Uint8Array(lv.w * lv.h);
    }
    const R0 = 10;
    for (let k = 0; k < 24; k++) {
      const a = pl.angle - 0.8 + 1.6 * k / 23;
      let x = pl.x;
      let y = pl.y;
      for (let s = 0; s < R0 * 3; s++) {
        x += Math.cos(a) * 0.33;
        y += Math.sin(a) * 0.33;
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        if (cx < 0 || cy < 0 || cx >= lv.w || cy >= lv.h) {
          break;
        }
        const c = lv.cells[cy * lv.w + cx];
        g.mapSeen[cy * lv.w + cx] = 1;
        if (c.solid || (c.door && c.cz - c.fz < 0.3)) {
          break;
        }
      }
    }
  }

  ns.hud = { statusBar: statusBar, messages: messages, weaponView: weaponView, skinRemap: skinRemap, theme: theme, tint: tint, automap: automap, markSeen: markSeen, faceName: faceName };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
