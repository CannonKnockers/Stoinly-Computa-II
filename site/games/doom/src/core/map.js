(function (ns) {
  'use strict';
  // map.js: compiles a level definition (architecture section 7) into a Level: one Cell per
  // grid square with its authored and runtime heights, textures, light and specials, plus
  // things, tags, movers, triggers and the player start. Every validation failure throws an
  // error naming the level and the row and column, so a broken map fails at load, not in play.
  // Angles in level files are degrees, 0 east, 90 south (y grows down), 180 west, 270 north.

  const DEG = Math.PI / 180;
  const SKILL_FLAGS = ['easy', 'medium', 'hard'];
  const THING_FLAGS = SKILL_FLAGS.concat(['ambush', 'dormant']);

  function fail(level, msg, row, col) {
    let where = level && level.slug ? level.slug : 'level';
    if (row !== undefined) {
      where += ' row ' + row + (col !== undefined ? ' col ' + col : '');
    }
    throw new Error('map.compile: ' + where + ': ' + msg);
  }

  function num(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  // A fresh Cell from a legend entry and the level defaults.
  function makeCell(def, defaults, cx, cy) {
    const cell = {
      cx: cx,
      cy: cy,
      solid: false,
      tex: null,
      faces: null,
      floor: null,
      ceil: null,
      sky: false,
      fz: 0,
      cz: 2,
      fz0: 0,
      cz0: 2,
      light: 12,
      light0: 12,
      upper: null,
      lower: null,
      door: null,
      mid: null,
      axis: null,
      block: false,
      special: null,
      amount: 0,
      dest: null,
      sw: null,
      lightfx: null,
      secret: false,
      key: null,
      locked: false,
      vofs: 0,
      decals: null,
      // runtime fields, used by the game
      soundTic: -1,
      soundTarget: null,
      things: null,
      // renderer texture ids, filled by render.prepare()
      tn: -1, te: -1, ts: -1, tw: -1, tu: -1, tl: -1, tf: -1, tc: -1, tm: -1, td: -1,
      dn: -1, ds: -1, de: -1, dw: -1, zn: 0, zs: 0, ze: 0, zw: 0
    };
    // Decals: a masked texture drawn once on a face, its top edge at a world height.
    // decals: { n: ['SIGNHEN1', 2.75], s: ['EXIT1', 2.2] }
    if (def.decals) {
      cell.decals = {};
      for (const f in def.decals) {
        const d = def.decals[f];
        cell.decals[f] = { tex: d[0], top: num(d[1], 2) };
      }
    }
    if (def.wall !== undefined) {
      cell.solid = true;
      cell.tex = def.wall;
      cell.faces = def.faces ? Object.assign({}, def.faces) : null;
      cell.light = cell.light0 = num(def.light, num(defaults.light, 12));
      if (def.switch) {
        cell.sw = {
          tag: def.switch.tag || null,
          once: def.switch.once !== false,
          exit: Boolean(def.switch.exit),
          secretExit: Boolean(def.switch.secretExit),
          used: false,
          timer: 0
        };
      }
      return cell;
    }
    cell.floor = def.floor !== undefined ? def.floor : defaults.floor;
    cell.ceil = def.ceil !== undefined ? def.ceil : defaults.ceil;
    cell.sky = cell.ceil === 'SKY';
    cell.fz = cell.fz0 = num(def.fz, num(defaults.fz, 0));
    cell.cz = cell.cz0 = num(def.cz, num(defaults.cz, 2));
    cell.light = cell.light0 = num(def.light, num(defaults.light, 12));
    cell.upper = def.upper !== undefined ? def.upper : (defaults.upper || null);
    cell.lower = def.lower !== undefined ? def.lower : (defaults.lower || null);
    cell.vofs = num(def.vofs, 0);
    if (def.door !== undefined) {
      cell.door = {
        tex: def.door,
        key: def.key || null,
        speed: num(def.speed, 0.06),
        stay: num(def.stay, 150),
        locked: Boolean(def.locked),
        secret: Boolean(def.secret),
        state: 'closed',
        timer: 0,
        openedOnce: false
      };
      cell.key = cell.door.key;
      cell.locked = cell.door.locked;
      cell.secret = cell.door.secret;
      // A door is a ceiling that starts on the floor and rises to its authored height; the
      // cell's upper texture is the lintel drawn above the doorway when a room is taller.
      cell.cz = cell.fz;
    }
    if (def.mid !== undefined) {
      cell.mid = def.mid;
      cell.axis = def.axis === 'x' ? 'x' : 'y';
      cell.block = def.block !== false;
    }
    if (def.special !== undefined) {
      cell.special = def.special;
      cell.amount = num(def.amount, 0);
      cell.dest = def.dest || null;
      if (def.special === 'secret') {
        cell.secret = true;
      }
    }
    if (def.lightfx !== undefined) {
      cell.lightfx = def.lightfx;
    }
    return cell;
  }

  function checkTexture(level, kind, name, row, col) {
    if (name === null || name === undefined || !ns.assets || !ns.assets.loaded()) {
      return;
    }
    const ok = kind === 'flat' ? ns.assets.hasFlat(name) : ns.assets.hasTexture(name);
    if (!ok) {
      fail(level, 'unknown ' + kind + ' "' + name + '"', row, col);
    }
  }

  function parseThingFlags(level, spec, row, col) {
    const flags = { easy: true, medium: true, hard: true, ambush: false, dormant: false };
    if (spec.flags === undefined || spec.flags === null || spec.flags === '') {
      return flags;
    }
    const list = String(spec.flags).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const anySkill = list.some(function (f) { return SKILL_FLAGS.indexOf(f) >= 0; });
    if (anySkill) {
      flags.easy = flags.medium = flags.hard = false;
    }
    for (let i = 0; i < list.length; i++) {
      if (THING_FLAGS.indexOf(list[i]) < 0) {
        fail(level, 'unknown thing flag "' + list[i] + '"', row, col);
      }
      flags[list[i]] = true;
    }
    return flags;
  }

  function makeThing(level, spec, x, y, row, col) {
    if (!spec || typeof spec.type !== 'string') {
      fail(level, 'thing without a type', row, col);
    }
    const thing = {
      type: spec.type,
      x: x,
      y: y,
      angle: num(spec.angle, 0) * DEG,
      flags: parseThingFlags(level, spec, row, col)
    };
    // Optional per-thing data the game understands: patrol route tags, team ids, closets.
    for (const k in spec) {
      if (k !== 'type' && k !== 'angle' && k !== 'flags' && k !== 'x' && k !== 'y') {
        thing[k] = spec[k];
      }
    }
    return thing;
  }

  function compile(def) {
    if (!def || typeof def !== 'object') {
      throw new Error('map.compile: no level definition');
    }
    const level = { slug: def.slug || '?' };
    if (!Array.isArray(def.grid) || def.grid.length < 3) {
      fail(level, 'grid must be an array of at least three rows');
    }
    const h = def.grid.length;
    const w = def.grid[0].length;
    for (let r = 0; r < h; r++) {
      if (typeof def.grid[r] !== 'string' || def.grid[r].length !== w) {
        fail(level, 'grid row has length ' + (def.grid[r] && def.grid[r].length) + ', expected ' + w, r);
      }
    }
    const legend = def.legend || {};
    const defaults = def.defaults || {};
    const cells = new Array(w * h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = def.grid[r].charAt(c);
        const entry = legend[ch];
        if (entry === undefined) {
          fail(level, 'grid character "' + ch + '" is not in the legend', r, c);
        }
        const cell = makeCell(entry, defaults, c, r);
        if ((r === 0 || c === 0 || r === h - 1 || c === w - 1) && !cell.solid) {
          fail(level, 'the outer ring must be solid; "' + ch + '" is open', r, c);
        }
        if (!cell.solid) {
          if (cell.floor === null || cell.floor === undefined) {
            fail(level, 'open cell "' + ch + '" has no floor', r, c);
          }
          if (cell.ceil === null || cell.ceil === undefined) {
            fail(level, 'open cell "' + ch + '" has no ceiling', r, c);
          }
          if (cell.cz0 - cell.fz0 < 0.01 && !cell.door) {
            fail(level, 'open cell "' + ch + '" has no height', r, c);
          }
          checkTexture(level, 'flat', cell.floor, r, c);
          if (!cell.sky) {
            checkTexture(level, 'flat', cell.ceil, r, c);
          }
          checkTexture(level, 'texture', cell.upper, r, c);
          checkTexture(level, 'texture', cell.lower, r, c);
          checkTexture(level, 'texture', cell.mid, r, c);
          if (cell.door) {
            checkTexture(level, 'texture', cell.door.tex, r, c);
          }
          if (cell.mid && cell.door) {
            fail(level, 'a cell cannot be both a door and a mid-wall', r, c);
          }
        } else {
          checkTexture(level, 'texture', cell.tex, r, c);
          if (cell.sw && !cell.decals && !/_OFF$/.test(cell.tex) && !(cell.faces && Object.keys(cell.faces).some(function (f) { return /_OFF$/.test(cell.faces[f]); }))) {
            fail(level, 'a switch needs an _OFF texture or decal to flip', r, c);
          }
          if (cell.faces) {
            for (const f in cell.faces) {
              if ('nsew'.indexOf(f) < 0 || f.length !== 1) {
                fail(level, 'face "' + f + '" is not one of n, s, e, w', r, c);
              }
              checkTexture(level, 'texture', cell.faces[f], r, c);
            }
          }
        }
        if (cell.decals) {
          for (const f in cell.decals) {
            if ('nsew'.indexOf(f) < 0 || f.length !== 1) {
              fail(level, 'decal face "' + f + '" is not one of n, s, e, w', r, c);
            }
            checkTexture(level, 'texture', cell.decals[f].tex, r, c);
          }
        }
        cells[r * w + c] = cell;
      }
    }

    const tags = {};
    const srcTags = def.tags || {};
    for (const name in srcTags) {
      const list = srcTags[name];
      if (!Array.isArray(list) || list.length === 0) {
        fail(level, 'tag "' + name + '" has no cells');
      }
      tags[name] = list.map(function (p) {
        if (!Array.isArray(p) || p.length < 2 || p[0] < 0 || p[1] < 0 || p[0] >= w || p[1] >= h) {
          fail(level, 'tag "' + name + '" lists a cell outside the map: ' + JSON.stringify(p));
        }
        return { cx: p[0], cy: p[1], angle: p.length > 2 ? p[2] * DEG : null };
      });
    }

    function needTag(name, what) {
      if (!tags[name]) {
        fail(level, what + ' refers to an unknown tag "' + name + '"');
      }
    }

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.special === 'teleport') {
        if (!cell.dest) {
          fail(level, 'teleport without dest', cell.cy, cell.cx);
        }
        needTag(cell.dest, 'teleport at ' + cell.cx + ',' + cell.cy);
      }
      if (cell.sw && cell.sw.tag) {
        // a switch may fire a mover tag, a trigger tag, or a closet tag; all live in tags or movers
        const known = tags[cell.sw.tag] || (def.movers || []).some(function (m) { return m.tag === cell.sw.tag; });
        if (!known) {
          fail(level, 'switch fires an unknown tag "' + cell.sw.tag + '"', cell.cy, cell.cx);
        }
      }
    }

    const movers = (def.movers || []).map(function (m, i) {
      if (m.field !== 'fz' && m.field !== 'cz') {
        fail(level, 'mover ' + i + ' field must be fz or cz');
      }
      needTag(m.cells, 'mover ' + i);
      const mode = m.mode || 'once';
      if (['once', 'return', 'perpetual'].indexOf(mode) < 0) {
        fail(level, 'mover ' + i + ' has an unknown mode "' + mode + '"');
      }
      return {
        tag: m.tag,
        field: m.field,
        cells: tags[m.cells].map(function (p) { return cells[p.cy * w + p.cx]; }),
        to: num(m.to, 0),
        speed: num(m.speed, 0.05),
        mode: mode,
        wait: num(m.wait, 105),
        damage: num(m.damage, 0),
        state: 'idle',
        timer: 0,
        from: null,
        sound: m.sound || null
      };
    });
    movers.forEach(function (m) {
      m.from = m.cells.map(function (cell) { return cell[m.field]; });
    });

    const triggers = (def.triggers || []).map(function (t, i) {
      needTag(t.cells, 'trigger ' + i);
      const thingTags = (def.thingLegend ? Object.keys(def.thingLegend).map(function (k) { return def.thingLegend[k].tag; }) : []).concat((def.extra || []).map(function (e) { return e.tag; }));
      if (t.fire !== undefined && !tags[t.fire] && thingTags.indexOf(t.fire) < 0 && !movers.some(function (m) { return m.tag === t.fire; })) {
        fail(level, 'trigger ' + i + ' fires an unknown tag "' + t.fire + '"');
      }
      return {
        cells: tags[t.cells].map(function (p) { return cells[p.cy * w + p.cx]; }),
        fire: t.fire || null,
        once: t.once !== false,
        when: t.when || 'enter',
        item: t.item || null,
        message: t.message || null,
        fired: false
      };
    });

    const things = [];
    let start = null;
    if (def.things) {
      if (def.things.length !== h) {
        fail(level, 'things has ' + def.things.length + ' rows, grid has ' + h);
      }
      const tl = def.thingLegend || {};
      for (let r = 0; r < h; r++) {
        if (def.things[r].length !== w) {
          fail(level, 'things row has length ' + def.things[r].length + ', expected ' + w, r);
        }
        for (let c = 0; c < w; c++) {
          const ch = def.things[r].charAt(c);
          if (ch === '.' || ch === ' ') {
            continue;
          }
          const spec = tl[ch];
          if (spec === undefined) {
            fail(level, 'things character "' + ch + '" is not in thingLegend', r, c);
          }
          if (cells[r * w + c].solid) {
            fail(level, 'thing "' + ch + '" stands in a solid cell', r, c);
          }
          const thing = makeThing(level, spec, c + 0.5, r + 0.5, r, c);
          if (thing.type === 'PLAYER') {
            if (start) {
              fail(level, 'second player start', r, c);
            }
            start = { x: thing.x, y: thing.y, angle: thing.angle };
          } else {
            things.push(thing);
          }
        }
      }
    }
    (def.extra || []).forEach(function (spec, i) {
      const x = num(spec.x, NaN);
      const y = num(spec.y, NaN);
      if (!(x > 0 && y > 0 && x < w && y < h)) {
        fail(level, 'extra thing ' + i + ' lies outside the map');
      }
      const cell = cells[Math.floor(y) * w + Math.floor(x)];
      if (cell.solid) {
        fail(level, 'extra thing ' + i + ' (' + spec.type + ') stands in a solid cell', Math.floor(y), Math.floor(x));
      }
      const thing = makeThing(level, spec, x, y, Math.floor(y), Math.floor(x));
      if (thing.type === 'PLAYER') {
        if (start) {
          fail(level, 'second player start (extra ' + i + ')');
        }
        start = { x: x, y: y, angle: thing.angle };
      } else {
        things.push(thing);
      }
    });
    if (def.start) {
      if (start) {
        fail(level, 'player start given twice (start and a P thing)');
      }
      start = { x: def.start.x, y: def.start.y, angle: num(def.start.angle, 0) * DEG };
    }
    if (!start) {
      fail(level, 'no player start');
    }
    const sc = cells[Math.floor(start.y) * w + Math.floor(start.x)];
    if (!sc || sc.solid) {
      fail(level, 'player start is in a solid cell');
    }

    let secrets = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].secret) {
        secrets++;
      }
    }

    return {
      slug: def.slug || '?',
      name: def.name || '',
      hour: def.hour || '',
      music: def.music || null,
      sky: def.sky || 'SKY1',
      par: num(def.par, 0),
      w: w,
      h: h,
      cells: cells,
      things: things,
      start: start,
      tags: tags,
      movers: movers,
      triggers: triggers,
      secrets: secrets,
      def: def
    };
  }

  function cellAt(level, x, y) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= level.w || cy >= level.h) {
      return null;
    }
    return level.cells[cy * level.w + cx];
  }

  // True when a creature of the given height and feet z may stand in the cell.
  function passable(cell, z, height, step) {
    if (cell.solid) {
      return false;
    }
    if (cell.mid && cell.block) {
      return false;
    }
    if (cell.fz > z + step) {
      return false;
    }
    const floor = Math.max(cell.fz, z);
    return cell.cz - floor >= height;
  }

  ns.map = {
    compile: compile,
    cellAt: cellAt,
    passable: passable,
    DEG: DEG
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
