(function (ns) {
  'use strict';
  // render.js: the software renderer of architecture section 8. One ray per screen column
  // walks the cell grid (DDA); each cell crossed contributes its ceiling (or sky) and floor
  // spans, each boundary its wall, upper or lower face, and narrows the column's open window.
  // Masked mid-walls and sprites are drawn afterwards, back to front, clipped by the window
  // that was open at their depth. All output is palette indices in a 320x200 framebuffer.

  const W = 320;
  const H = 200;
  const VIEW_H = 168;
  const HORIZON = 84;
  const PROJ = 160;
  const ASPECT = 1.2;
  const ROWSCALE = PROJ / ASPECT;
  const NEAR = 0.04;
  const MAX_STEPS = 160;
  const MAX_EVENTS = 48;
  const TEX = 64;

  // Light: level = (15 - light) * LIGHT_SCALE + depth * DEPTH_SCALE - extralight, clamped to
  // 0..31. These three numbers set the mood of every room; tune them by eye.
  const LIGHT_SCALE = 1.25;
  const DEPTH_SCALE = 1.35;
  const EXTRA_SCALE = 2;
  const CMAP_INVERSE = 32;
  const CMAP_IDENTITY = 33;

  const TAU = Math.PI * 2;

  // Per-column constants: the angle offset of each column's ray and its cosine (the factor
  // that turns distance along the ray into perpendicular depth, removing the fisheye).
  const colOffset = new Float64Array(W);
  const colCos = new Float64Array(W);
  for (let c = 0; c < W; c++) {
    colOffset[c] = Math.atan((c + 0.5 - W / 2) / PROJ);
    colCos[c] = Math.cos(colOffset[c]);
  }

  // Clip events: per column, triples [depth, top, bottom] in increasing depth.
  const events = new Float32Array(W * MAX_EVENTS * 3);
  const eventCount = new Int32Array(W);

  // Masked items (mid-wall columns and sprites) collected during a frame.
  const masked = [];
  let maskedCount = 0;
  function maskedItem() {
    if (maskedCount === masked.length) {
      masked.push({ kind: 0, d: 0, c: 0, view: null, u: 0, top: 0, bot: 0, clipTop: 0, clipBot: 0, level: 0, left: 0, scale: 0, fuzz: false, flash: false });
    }
    return masked[maskedCount++];
  }

  // State shared by the column walker during one frame.
  let fb = null;
  let cmap = null;
  let cells = null;
  let lw = 0;
  let lh = 0;
  let views = null;
  let skyView = null;
  let camX = 0;
  let camY = 0;
  let camZ = 0;
  let camAngle = 0;
  let extra = 0;
  let fixedLevel = -1;

  function shadeLevel(light, d, contrast) {
    if (fixedLevel >= 0) {
      return fixedLevel;
    }
    let lvl = Math.round((15 - light) * LIGHT_SCALE + d * DEPTH_SCALE) + contrast - extra * EXTRA_SCALE;
    if (lvl < 0) {
      lvl = 0;
    } else if (lvl > 31) {
      lvl = 31;
    }
    return lvl;
  }

  function rowOf(h, d) {
    return HORIZON - (h - camZ) * ROWSCALE / d;
  }

  // Pixel rows covered by a span whose edges are the fractional rows a (top) and b (bottom):
  // a pixel belongs to the span when its center lies inside, so neighbors tile exactly.
  function pixRow(r) {
    const p = Math.ceil(r - 0.5);
    return p < -1 ? -1 : (p > VIEW_H + 1 ? VIEW_H + 1 : p);
  }

  // Draws a vertical run of a wall-like texture: rows y0..y1-1 of column c, at depth d,
  // with texel column u. Texel row = (anchor - h) * 64 for top-anchored faces, where h is
  // the world height at the pixel center; bottom-anchored faces (doors) count up from the
  // bottom instead so the bottom edge of the texture rides the bottom of the face.
  function wallRun(c, y0, y1, d, view, u, anchorH, bottom, lvl) {
    if (y0 >= y1) {
      return;
    }
    const th = view.h;
    const base = lvl << 8;
    const dv = TEX * d / ROWSCALE;
    let h = camZ + (HORIZON - (y0 + 0.5)) * d / ROWSCALE;
    let v = bottom ? th - (h - anchorH) * TEX : (anchorH - h) * TEX;
    const sheet = view.sheet;
    const sw = view.sw;
    const colBase = view.y * sw + view.x + (u < 0 ? 0 : (u >= view.w ? view.w - 1 : u));
    v = ((v % th) + th) % th;
    for (let y = y0; y < y1; y++) {
      const vi = v | 0;
      fb[y * W + c] = cmap[base + sheet[colBase + vi * sw]];
      v += dv;
      if (v >= th) {
        v -= th;
      }
    }
  }

  // A decal over rows y0..y1-1 of a face just drawn: the masked texture's top edge sits at
  // world height topH and it is drawn once, never tiled.
  function decalRun(c, y0, y1, d, view, u, topH, lvl) {
    const ya = Math.max(y0, pixRow(rowOf(topH, d)));
    const yb = Math.min(y1, pixRow(rowOf(topH - view.h / TEX, d)));
    if (ya >= yb) {
      return;
    }
    const base = lvl << 8;
    const dv = TEX * d / ROWSCALE;
    let v = (topH - (camZ + (HORIZON - (ya + 0.5)) * d / ROWSCALE)) * TEX;
    const sheet = view.sheet;
    const sw = view.sw;
    const colBase = view.y * sw + view.x + (u < 0 ? 0 : (u >= view.w ? view.w - 1 : u));
    for (let y = ya; y < yb; y++) {
      const vi = v | 0;
      if (vi >= 0 && vi < view.h) {
        const t = sheet[colBase + vi * sw];
        if (t !== 255) {
          fb[y * W + c] = cmap[base + t];
        }
      }
      v += dv;
    }
  }

  function faceDecal(cell, side, stepX, stepY) {
    if (side === 0) {
      return stepX > 0 ? cell.dw : cell.de;
    }
    return stepY > 0 ? cell.dn : cell.ds;
  }

  function faceDecalTop(cell, side, stepX, stepY) {
    if (side === 0) {
      return stepX > 0 ? cell.zw : cell.ze;
    }
    return stepY > 0 ? cell.zn : cell.zs;
  }

  // Floor or ceiling rows of a cell: plane height ph, rows y0..y1-1. Each row has its own
  // depth, so each row gets its own light level and world position.
  function flatRun(c, y0, y1, ph, view, light, dirX, dirY, cosf) {
    if (y0 >= y1) {
      return;
    }
    const sheet = view.sheet;
    const sw = view.sw;
    const vx = view.x;
    const vy = view.y;
    const k = (camZ - ph) * ROWSCALE;
    for (let y = y0; y < y1; y++) {
      const denom = y + 0.5 - HORIZON;
      if (denom === 0) {
        continue;
      }
      const d = k / denom;
      if (d <= 0) {
        continue;
      }
      const t = d / cosf;
      const wx = camX + dirX * t;
      const wy = camY + dirY * t;
      const u = ((wx * TEX) | 0) & 63;
      const v = ((wy * TEX) | 0) & 63;
      const lvl = shadeLevel(light, d, 0);
      fb[y * W + c] = cmap[(lvl << 8) + sheet[(vy + v) * sw + vx + u]];
    }
  }

  function skyRun(c, y0, y1, skyU) {
    if (y0 >= y1) {
      return;
    }
    const view = skyView;
    const base = fixedLevel >= 0 ? fixedLevel << 8 : 0;
    const sheet = view.sheet;
    const sw = view.sw;
    const col = view.y * sw + view.x + skyU;
    for (let y = y0; y < y1; y++) {
      const vy = y < view.h ? y : view.h - 1;
      fb[y * W + c] = cmap[base + sheet[col + vy * sw]];
    }
  }

  function blackRun(c, y0, y1) {
    for (let y = y0; y < y1; y++) {
      fb[y * W + c] = 0;
    }
  }

  function pushEvent(c, d, top, bot) {
    const n = eventCount[c];
    if (n >= MAX_EVENTS) {
      // Keep the last slot current: the narrowest window seen so far is the safe answer.
      const i = (c * MAX_EVENTS + MAX_EVENTS - 1) * 3;
      events[i] = d;
      events[i + 1] = top;
      events[i + 2] = bot;
      return;
    }
    const i = (c * MAX_EVENTS + n) * 3;
    events[i] = d;
    events[i + 1] = top;
    events[i + 2] = bot;
    eventCount[c] = n + 1;
  }

  // The open window [top, bottom) of column c for something at depth d.
  const clipOut = { top: 0, bot: VIEW_H };
  function clipAt(c, d) {
    let top = 0;
    let bot = VIEW_H;
    const n = eventCount[c];
    const base = c * MAX_EVENTS * 3;
    for (let i = 0; i < n; i++) {
      const j = base + i * 3;
      if (events[j] >= d) {
        break;
      }
      top = events[j + 1];
      bot = events[j + 2];
    }
    clipOut.top = top;
    clipOut.bot = bot;
    return clipOut;
  }

  // Texel column of a face hit, oriented so textures read left to right from every side.
  function faceU(side, stepX, stepY, t, dirX, dirY) {
    let f;
    if (side === 0) {
      f = camY + dirY * t;
      f -= Math.floor(f);
      if (stepX < 0) {
        f = 1 - f;
      }
    } else {
      f = camX + dirX * t;
      f -= Math.floor(f);
      if (stepY > 0) {
        f = 1 - f;
      }
    }
    let u = (f * TEX) | 0;
    if (u > 63) {
      u = 63;
    }
    return u;
  }

  function faceTexId(cell, side, stepX, stepY) {
    if (side === 0) {
      return stepX > 0 ? cell.tw : cell.te;
    }
    return stepY > 0 ? cell.tn : cell.ts;
  }

  function column(c) {
    const a = camAngle + colOffset[c];
    const cosf = colCos[c];
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    let mx = Math.floor(camX);
    let my = Math.floor(camY);
    const ddx = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
    const ddy = dirY === 0 ? 1e30 : Math.abs(1 / dirY);
    let stepX;
    let stepY;
    let sdx;
    let sdy;
    if (dirX < 0) {
      stepX = -1;
      sdx = (camX - mx) * ddx;
    } else {
      stepX = 1;
      sdx = (mx + 1 - camX) * ddx;
    }
    if (dirY < 0) {
      stepY = -1;
      sdy = (camY - my) * ddy;
    } else {
      stepY = 1;
      sdy = (my + 1 - camY) * ddy;
    }
    let an = a % TAU;
    if (an < 0) {
      an += TAU;
    }
    const skyU = skyView ? ((an / TAU) * skyView.w) & (skyView.w - 1) : 0;
    let clipTop = 0;
    let clipBot = VIEW_H;
    eventCount[c] = 0;
    let A = cells[my * lw + mx];
    let tIn = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      let side;
      let tOut;
      if (sdx < sdy) {
        tOut = sdx;
        sdx += ddx;
        mx += stepX;
        side = 0;
      } else {
        tOut = sdy;
        sdy += ddy;
        my += stepY;
        side = 1;
      }
      let dIn = tIn * cosf;
      if (dIn < NEAR) {
        dIn = NEAR;
      }
      let dOut = tOut * cosf;
      if (dOut < NEAR) {
        dOut = NEAR;
      }

      // Ceiling (or sky) and floor of the cell the ray is crossing.
      if (A.cz > camZ) {
        const y0 = Math.max(clipTop, pixRow(rowOf(A.cz, dIn)));
        const y1 = Math.min(clipBot, pixRow(rowOf(A.cz, dOut)));
        if (A.sky) {
          skyRun(c, y0, y1, skyU);
        } else {
          flatRun(c, y0, y1, A.cz, views[A.tc], A.light, dirX, dirY, cosf);
        }
      }
      if (A.fz < camZ) {
        const y0 = Math.max(clipTop, pixRow(rowOf(A.fz, dOut)));
        const y1 = Math.min(clipBot, pixRow(rowOf(A.fz, dIn)));
        flatRun(c, y0, y1, A.fz, views[A.tf], A.light, dirX, dirY, cosf);
      }

      // A masked mid-wall stands on the plane through the cell center along its axis.
      if (A.mid !== null) {
        let tm;
        if (A.axis === 'y') {
          tm = dirX === 0 ? -1 : (A.cx + 0.5 - camX) / dirX;
        } else {
          tm = dirY === 0 ? -1 : (A.cy + 0.5 - camY) / dirY;
        }
        if (tm >= tIn && tm <= tOut && tm * cosf > NEAR) {
          const view = views[A.tm];
          const dm = tm * cosf;
          let f = A.axis === 'y' ? camY + dirY * tm : camX + dirX * tm;
          f -= Math.floor(f);
          if ((A.axis === 'y' && dirX < 0) || (A.axis === 'x' && dirY > 0)) {
            f = 1 - f;
          }
          const item = maskedItem();
          item.kind = 1;
          item.d = dm;
          item.c = c;
          item.view = view;
          item.u = Math.min(view.w - 1, (f * view.w) | 0);
          item.bot = A.fz;
          item.top = Math.min(A.cz, A.fz + view.h / TEX);
          item.clipTop = clipTop;
          item.clipBot = clipBot;
          item.level = shadeLevel(A.light, dm, 0);
          item.fuzz = false;
        }
      }

      if (mx < 0 || my < 0 || mx >= lw || my >= lh) {
        blackRun(c, clipTop, clipBot);
        pushEvent(c, dOut, clipBot, clipBot);
        return;
      }
      const B = cells[my * lw + mx];
      const contrast = side === 0 ? -1 : 1;

      if (B.solid) {
        const top = rowOf(A.cz, dOut);
        const bottom = rowOf(A.fz, dOut);
        const y0 = Math.max(clipTop, pixRow(top));
        const y1 = Math.min(clipBot, pixRow(bottom));
        if (y0 < y1) {
          const u = faceU(side, stepX, stepY, tOut, dirX, dirY);
          const lvl = shadeLevel(A.light, dOut, contrast);
          wallRun(c, y0, y1, dOut, views[faceTexId(B, side, stepX, stepY)], u, 2 - B.vofs, false, lvl);
          if (B.decals !== null) {
            const dId = faceDecal(B, side, stepX, stepY);
            if (dId >= 0) {
              decalRun(c, y0, y1, dOut, views[dId], u, faceDecalTop(B, side, stepX, stepY), lvl);
            }
          }
        }
        pushEvent(c, dOut, clipBot, clipBot);
        return;
      }

      // An open boundary: the upper face where B's ceiling is lower, the lower face where its
      // floor is higher, then the window narrows to the opening.
      const bothSky = A.sky && B.sky;
      let u = -1;
      if (B.door !== null) {
        // A doorway: the lintel above the door's full height, then the slab, whose bottom
        // edge rides up as the door opens (a door is a moving ceiling).
        const top = Math.min(A.cz, B.cz0);
        const yTop = Math.max(clipTop, pixRow(rowOf(A.cz, dOut)));
        const yLintel = Math.min(clipBot, pixRow(rowOf(top, dOut)));
        const yOpen = Math.min(clipBot, pixRow(rowOf(Math.min(A.cz, B.cz), dOut)));
        u = faceU(side, stepX, stepY, tOut, dirX, dirY);
        const lvl = shadeLevel(A.light, dOut, contrast);
        if (yTop < yLintel && B.tu >= 0) {
          wallRun(c, yTop, yLintel, dOut, views[B.tu], u, 2 - B.vofs, false, lvl);
        }
        const ySlab = Math.max(yTop, yLintel);
        if (ySlab < yOpen) {
          wallRun(c, ySlab, yOpen, dOut, views[B.td], u, B.cz, true, lvl);
        }
        if (B.decals !== null) {
          const dId = faceDecal(B, side, stepX, stepY);
          if (dId >= 0 && yTop < yOpen) {
            decalRun(c, yTop, yOpen, dOut, views[dId], u, faceDecalTop(B, side, stepX, stepY), lvl);
          }
        }
        if (yOpen > clipTop) {
          clipTop = yOpen;
        }
      } else if (B.cz < A.cz) {
        const y0 = Math.max(clipTop, pixRow(rowOf(A.cz, dOut)));
        const y1 = Math.min(clipBot, pixRow(rowOf(B.cz, dOut)));
        if (bothSky) {
          skyRun(c, y0, y1, skyU);
        } else if (y0 < y1 && B.tu >= 0) {
          u = faceU(side, stepX, stepY, tOut, dirX, dirY);
          const lvl = shadeLevel(A.light, dOut, contrast);
          if (B.door !== null) {
            wallRun(c, y0, y1, dOut, views[B.tu], u, B.cz, true, lvl);
          } else {
            wallRun(c, y0, y1, dOut, views[B.tu], u, 2 - B.vofs, false, lvl);
          }
        }
        if (y1 > clipTop) {
          clipTop = y1;
        }
      } else if (!bothSky) {
        const y = pixRow(rowOf(A.cz, dOut));
        if (y > clipTop) {
          clipTop = y;
        }
      }
      if (B.fz > A.fz) {
        const y0 = Math.max(clipTop, pixRow(rowOf(B.fz, dOut)));
        const y1 = Math.min(clipBot, pixRow(rowOf(A.fz, dOut)));
        if (y0 < y1 && B.tl >= 0) {
          if (u < 0) {
            u = faceU(side, stepX, stepY, tOut, dirX, dirY);
          }
          wallRun(c, y0, y1, dOut, views[B.tl], u, B.fz, false, shadeLevel(A.light, dOut, contrast));
        }
        if (y0 < clipBot) {
          clipBot = y0 < clipTop ? clipTop : y0;
        }
      } else {
        const y = pixRow(rowOf(A.fz, dOut));
        if (y < clipBot) {
          clipBot = y;
        }
      }
      pushEvent(c, dOut, clipTop, clipBot);
      if (clipTop >= clipBot) {
        return;
      }
      A = B;
      tIn = tOut;
    }
    blackRun(c, clipTop, clipBot);
  }

  // Assigns integer texture ids to every cell so the column walker indexes an array of
  // views instead of looking names up. Safe to call again after the level changes a texture.
  function prepare(level) {
    const names = [];
    const index = Object.create(null);
    function id(name) {
      if (name === null || name === undefined) {
        return -1;
      }
      let i = index[name];
      if (i === undefined) {
        i = names.length;
        names.push(name);
        index[name] = i;
      }
      return i;
    }
    // A face the renderer must draw but the level gave no texture would leave stale pixels;
    // fall back to the level's default, then to its first wall texture.
    const defaults = (level.def && level.def.defaults) || {};
    let firstWall = null;
    for (let i = 0; i < level.cells.length && firstWall === null; i++) {
      if (level.cells[i].solid) {
        firstWall = level.cells[i].tex;
      }
    }
    const fallbackUpper = defaults.upper || firstWall;
    const fallbackLower = defaults.lower || firstWall;
    for (let i = 0; i < level.cells.length; i++) {
      const cell = level.cells[i];
      if (cell.solid) {
        const f = cell.faces || {};
        cell.tn = id(f.n || cell.tex);
        cell.ts = id(f.s || cell.tex);
        cell.te = id(f.e || cell.tex);
        cell.tw = id(f.w || cell.tex);
      } else {
        cell.tf = id(cell.floor);
        cell.tc = cell.sky ? -1 : id(cell.ceil);
        cell.tu = id(cell.upper || fallbackUpper);
        cell.tl = id(cell.lower || fallbackLower);
        cell.tm = id(cell.mid);
        cell.td = cell.door ? id(cell.door.tex) : -1;
      }
      if (cell.decals) {
        const d = cell.decals;
        cell.dn = d.n ? id(d.n.tex) : -1;
        cell.ds = d.s ? id(d.s.tex) : -1;
        cell.de = d.e ? id(d.e.tex) : -1;
        cell.dw = d.w ? id(d.w.tex) : -1;
        cell.zn = d.n ? d.n.top : 0;
        cell.zs = d.s ? d.s.top : 0;
        cell.ze = d.e ? d.e.top : 0;
        cell.zw = d.w ? d.w.top : 0;
      }
    }
    level.texNames = names;
    level.texIndex = index;
    level.texId = id;
    level.texViews = new Array(names.length);
    return level;
  }

  function resolveViews(level, tic) {
    const names = level.texNames;
    const out = level.texViews;
    for (let i = 0; i < names.length; i++) {
      out[i] = ns.assets.current(names[i], tic);
    }
    return out;
  }

  // things: [{ x, y, z, angle, sprite, frame, bright, fuzz }]. cam: { x, y, z, angle, extra,
  // fixed }. opts: { tic, weapon: { view, x, y, bright }, lowDetail }.
  function view(frame, level, cam, things, opts) {
    const tic = opts && opts.tic ? opts.tic : 0;
    if (!level.texViews) {
      prepare(level);
    }
    fb = frame;
    cmap = ns.palette.colormap;
    cells = level.cells;
    lw = level.w;
    lh = level.h;
    views = resolveViews(level, tic);
    skyView = ns.assets.current(level.sky || 'SKY1', tic);
    camX = cam.x;
    camY = cam.y;
    camZ = cam.z;
    camAngle = cam.angle;
    extra = cam.extra || 0;
    fixedLevel = cam.fixed === undefined || cam.fixed === null ? -1 : cam.fixed;
    maskedCount = 0;
    const startCell = cells[Math.floor(camY) * lw + Math.floor(camX)];
    if (!startCell || startCell.solid) {
      frame.fill(0, 0, W * VIEW_H);
      return;
    }
    if (opts && opts.lowDetail) {
      // Doom's low detail (the nexus performance mode): one ray per two columns. The odd
      // column copies the even one's pixels, clip events and masked mid-wall pieces, so
      // sprites, drawn afterwards, still clip correctly at full horizontal resolution.
      for (let c = 0; c < W; c += 2) {
        const before = maskedCount;
        column(c);
        copyColumn(c, c + 1, before);
      }
    } else {
      for (let c = 0; c < W; c++) {
        column(c);
      }
    }
    collectSprites(things || []);
    drawMasked();
    if (opts && opts.weapon) {
      drawWeapon(opts.weapon, startCell);
    }
  }

  function copyColumn(from, to, maskedFrom) {
    for (let y = 0; y < VIEW_H; y++) {
      fb[y * W + to] = fb[y * W + from];
    }
    const n = eventCount[from];
    events.copyWithin(to * MAX_EVENTS * 3, from * MAX_EVENTS * 3, (from * MAX_EVENTS + n) * 3);
    eventCount[to] = n;
    const end = maskedCount;
    for (let i = maskedFrom; i < end; i++) {
      const src = masked[i];
      const item = maskedItem();
      item.kind = src.kind;
      item.d = src.d;
      item.c = to;
      item.view = src.view;
      item.u = src.u;
      item.bot = src.bot;
      item.top = src.top;
      item.clipTop = src.clipTop;
      item.clipBot = src.clipBot;
      item.level = src.level;
      item.fuzz = src.fuzz;
    }
  }

  const SIN_CACHE = { a: NaN, s: 0, c: 1 };

  function collectSprites(things) {
    if (SIN_CACHE.a !== camAngle) {
      SIN_CACHE.a = camAngle;
      SIN_CACHE.s = Math.sin(camAngle);
      SIN_CACHE.c = Math.cos(camAngle);
    }
    const sa = SIN_CACHE.s;
    const ca = SIN_CACHE.c;
    for (let i = 0; i < things.length; i++) {
      const t = things[i];
      if (!t.sprite) {
        continue;
      }
      const rx = t.x - camX;
      const ry = t.y - camY;
      const d = rx * ca + ry * sa;
      if (d < 0.1) {
        continue;
      }
      const l = -rx * sa + ry * ca;
      const sx = W / 2 + l * PROJ / d;
      const toViewer = Math.atan2(-ry, -rx);
      const rot = ns.math.rotation(toViewer, t.angle || 0);
      const v = ns.assets.spriteFrame(t.sprite, t.frame || 'A', rot);
      const scale = PROJ / (TEX * d * v.density);
      const left = sx - v.ox * scale;
      const right = left + v.w * scale;
      if (right < 0 || left >= W) {
        continue;
      }
      const cell = cells[Math.floor(t.y) * lw + Math.floor(t.x)];
      const item = maskedItem();
      item.kind = 2;
      item.d = d;
      item.c = 0;
      item.view = v;
      item.u = 0;
      item.top = rowOf(t.z || 0, d) - v.oy * scale;
      item.left = left;
      item.scale = scale;
      item.level = (t.bright || v.fullbright) ? (fixedLevel >= 0 ? fixedLevel : CMAP_IDENTITY) : shadeLevel(cell ? cell.light : 12, d, 0);
      item.fuzz = Boolean(t.fuzz);
      item.flash = Boolean(t.flash);
    }
  }

  function byDepthDescending(a, b) {
    return b.d - a.d;
  }

  const sortBuffer = [];
  function drawMasked() {
    sortBuffer.length = 0;
    for (let i = 0; i < maskedCount; i++) {
      sortBuffer.push(masked[i]);
    }
    sortBuffer.sort(byDepthDescending);
    for (let i = 0; i < sortBuffer.length; i++) {
      const m = sortBuffer[i];
      if (m.kind === 1) {
        drawMidColumn(m);
      } else {
        drawSprite(m);
      }
    }
  }

  function drawMidColumn(m) {
    const y0 = Math.max(m.clipTop, pixRow(rowOf(m.top, m.d)));
    const y1 = Math.min(m.clipBot, pixRow(rowOf(m.bot, m.d)));
    if (y0 >= y1) {
      return;
    }
    const view = m.view;
    const th = view.h;
    const base = m.level << 8;
    const dv = TEX * m.d / ROWSCALE;
    // Anchored at the floor: the texture's bottom row sits on the cell floor.
    const h0 = camZ + (HORIZON - (y0 + 0.5)) * m.d / ROWSCALE;
    let v = th - (h0 - m.bot) * TEX;
    const sheet = view.sheet;
    const sw = view.sw;
    const colBase = view.y * sw + view.x + m.u;
    for (let y = y0; y < y1; y++) {
      const vi = Math.floor(v);
      if (vi >= 0 && vi < th) {
        const t = sheet[colBase + vi * sw];
        if (t !== 255) {
          fb[y * W + m.c] = cmap[base + t];
        }
      }
      v += dv;
    }
  }

  function drawSprite(m) {
    const v = m.view;
    const scale = m.scale;
    const left = m.left;
    const top = m.top;
    const d = m.d;
    const base = m.level << 8;
    const x0 = Math.max(0, Math.ceil(left - 0.5));
    const x1 = Math.min(W, Math.ceil(left + v.w * scale - 0.5));
    const yTop = Math.ceil(top - 0.5);
    const yBot = Math.ceil(top + v.h * scale - 0.5);
    const sheet = v.sheet;
    const sw = v.sw;
    const inv = 1 / scale;
    for (let c = x0; c < x1; c++) {
      let u = ((c + 0.5 - left) * inv) | 0;
      if (u < 0) {
        u = 0;
      } else if (u >= v.w) {
        u = v.w - 1;
      }
      const win = clipAt(c, d);
      const y0 = Math.max(win.top, yTop, 0);
      const y1 = Math.min(win.bot, yBot, VIEW_H);
      if (y0 >= y1) {
        continue;
      }
      const colBase = v.y * sw + v.x + u;
      for (let y = y0; y < y1; y++) {
        if (m.fuzz && ((y + c) & 1)) {
          continue;
        }
        let vi = ((y + 0.5 - top) * inv) | 0;
        if (vi < 0) {
          vi = 0;
        } else if (vi >= v.h) {
          vi = v.h - 1;
        }
        const t = sheet[colBase + vi * sw];
        if (t !== 255) {
          // the hit flash: a struck sprite is drawn solid white for a tic or two
          fb[y * W + c] = m.flash ? FLASH_WHITE : cmap[base + t];
        }
      }
    }
  }
  const FLASH_WHITE = 15;

  // The player's weapon: 1:1 pixels, its anchor (ox, oy) at (x, y), lit by the player's cell.
  function drawWeapon(w, cell) {
    const v = w.view;
    if (!v) {
      return;
    }
    let lvl;
    if (fixedLevel >= 0) {
      lvl = fixedLevel;
    } else if (w.bright || v.fullbright) {
      lvl = CMAP_IDENTITY;
    } else {
      lvl = shadeLevel(cell.light, 0, 0);
    }
    blit(fb, v, Math.round(w.x - v.ox), Math.round(w.y - v.oy), lvl, 0, 0, W, VIEW_H, w.fuzz, w.remap);
  }

  // Copies a frame at 1:1 through a colormap level, clipped to a rectangle. Index 255 is
  // transparent. Used for the weapon, the HUD and menus.
  // remap (optional Uint8Array(256)) recolors texels before the colormap (weapon skins).
  function blit(frame, v, x, y, lvl, cx0, cy0, cx1, cy1, fuzz, remap) {
    const cm = ns.palette.colormap;
    const base = (lvl === undefined || lvl === null ? CMAP_IDENTITY : lvl) << 8;
    const sheet = v.sheet;
    const sw = v.sw;
    const xa = Math.max(x, cx0 === undefined ? 0 : cx0);
    const xb = Math.min(x + v.w, cx1 === undefined ? W : cx1);
    const ya = Math.max(y, cy0 === undefined ? 0 : cy0);
    const yb = Math.min(y + v.h, cy1 === undefined ? H : cy1);
    for (let yy = ya; yy < yb; yy++) {
      const src = (v.y + yy - y) * sw + v.x - x;
      const dst = yy * W;
      for (let xx = xa; xx < xb; xx++) {
        if (fuzz && ((xx + yy) & 1)) {
          continue;
        }
        const t = sheet[src + xx];
        if (t !== 255) {
          frame[dst + xx] = cm[base + (remap ? remap[t] : t)];
        }
      }
    }
  }

  function patch(frame, x, y, name, lvl) {
    const v = typeof name === 'string' ? ns.assets.getFrame(name) : name;
    blit(frame, v, x - (v.ox || 0), y - (v.oy || 0), lvl);
  }

  // Tiles a flat or texture over a rectangle (menu and status bar backgrounds).
  function flat(frame, x0, y0, w, h, name, lvl) {
    const v = typeof name === 'string' ? ns.assets.current(name, 0) : name;
    const cm = ns.palette.colormap;
    const base = (lvl === undefined ? CMAP_IDENTITY : lvl) << 8;
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
      const ty = v.y + ((y - y0) % v.h);
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
        frame[y * W + x] = cm[base + v.sheet[ty * v.sw + v.x + ((x - x0) % v.w)]];
      }
    }
  }

  function fill(frame, x0, y0, w, h, index) {
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
      frame.fill(index, y * W + Math.max(0, x0), y * W + Math.min(W, x0 + w));
    }
  }

  // Darkens a rectangle by a number of colormap levels (pause screen, menu backdrops).
  function darken(frame, x0, y0, w, h, levels) {
    const cm = ns.palette.colormap;
    const base = Math.max(0, Math.min(31, levels)) << 8;
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
        const i = y * W + x;
        frame[i] = cm[base + frame[i]];
      }
    }
  }

  ns.render = {
    W: W,
    H: H,
    VIEW_H: VIEW_H,
    HORIZON: HORIZON,
    PROJ: PROJ,
    ROWSCALE: ROWSCALE,
    LIGHT_SCALE: LIGHT_SCALE,
    DEPTH_SCALE: DEPTH_SCALE,
    CMAP_INVERSE: CMAP_INVERSE,
    CMAP_IDENTITY: CMAP_IDENTITY,
    prepare: prepare,
    view: view,
    clipAt: clipAt,
    blit: blit,
    patch: patch,
    flat: flat,
    fill: fill,
    darken: darken,
    events: events,
    eventCount: eventCount,
    MAX_EVENTS: MAX_EVENTS
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
