(function (ns) {
  'use strict';
  // level.js: a level in play. Builds the game state for a compiled map (things filtered by
  // skill, pack spots rolled, teams paired, patrol routes resolved, totals counted) and runs
  // everything the map itself does each tic: doors, movers, light effects, triggers,
  // switches, teleporters, damaging floors, secrets and the exit. Also the card collection:
  // pull() records a card the first time the player meets it.

  const W = function () {
    return ns.world;
  };

  function skillFlag(skill) {
    return skill <= 1 ? 'easy' : (skill === 2 ? 'medium' : 'hard');
  }

  function rollSpot(g) {
    const table = ns.defs.spotTable;
    let total = 0;
    table.forEach(function (r) { total += r.weight; });
    let x = g.rng.next() * total;
    for (const r of table) {
      x -= r.weight;
      if (x < 0) {
        return r.pick[Math.floor(g.rng.next() * r.pick.length)];
      }
    }
    return table[0].pick[0];
  }

  // g: { level, skill, rng, player state carried in } -> populates g.things and stats.
  function start(g) {
    const lv = g.level;
    ns.render.prepare(lv);
    g.things = [];
    g.nextId = 1;
    g.tic = 0;
    g.events = [];
    g.messages = [];
    g.pulled = [];
    g.stats = { kills: 0, killsTotal: 0, items: 0, itemsTotal: 0, secrets: 0, secretsTotal: lv.secrets, time: 0 };
    g.exit = null;
    g.finale = false;
    g.fx = [];
    const flag = skillFlag(g.skill);
    const teams = {};
    for (const t of lv.things) {
      if (!t.flags[flag]) {
        continue;
      }
      let type = t.type;
      if (type === 'SPOT') {
        type = rollSpot(g);
      }
      const def = ns.defs.things[type];
      if (!def) {
        throw new Error('level: ' + lv.slug + ' places unknown thing ' + type);
      }
      const mo = W().spawn(g, type, t.x, t.y, null, t.angle);
      mo.ambush = t.flags.ambush;
      if (def.flagSet.countkill) {
        g.stats.killsTotal++;
      }
      if (def.flagSet.countitem) {
        g.stats.itemsTotal++;
      }
      if (def.lane === 'woman' && g.skill >= 4) {
        mo.provoked = true;
      }
      if (t.patrol && lv.tags[t.patrol]) {
        mo.route = lv.tags[t.patrol];
        mo.routeTag = t.patrol;
        mo.routeIndex = 0;
      }
      if (def.team) {
        const key = t.team || type;
        (teams[key] = teams[key] || []).push(mo);
      }
      if (t.tag) {
        mo.tag = t.tag;
      }
    }
    // pairs: the Glamazons tag, the Divorce trades weekends
    for (const key in teams) {
      const list = teams[key];
      for (let i = 0; i + 1 < list.length; i += 2) {
        const a = list[i];
        const b = list[i + 1];
        a.partner = b;
        b.partner = a;
        if (a.def.lane === 'woman') {
          b.resting = true;
          W().setLabel(g, b, 'apron');
        } else {
          a.active = true;
          a.weekendTimer = 420;
          b.active = false;
          b.weekendTimer = Infinity;
          b.invulnerable = true;
          W().setLabel(g, b, 'weekend');
        }
      }
    }
    // the divorce: two separate things in the level, MOM'S and DAD'S, are one team
    const mom = g.things.find(function (o) { return o.type === 'DIVM'; });
    const dad = g.things.find(function (o) { return o.type === 'DIVD'; });
    if (mom && dad && !mom.partner) {
      mom.partner = dad;
      dad.partner = mom;
      mom.active = true;
      mom.weekendTimer = 420;
      dad.active = false;
      dad.weekendTimer = Infinity;
      dad.invulnerable = true;
      W().setLabel(g, dad, 'weekend');
    }
    for (const cell of lv.cells) {
      cell.soundTic = -100;
      if (cell.lightfx) {
        cell.lightPhase = cell.cx * 7 + cell.cy * 13;
      }
    }
    W().message(g, ns.defs.text.LEVEL_START);
  }

  // ------------------------------------------------------------------ cards

  function pull(g, num) {
    if (!g.collection || g.collection[num]) {
      return;
    }
    g.collection[num] = true;
    g.pulled.push(num);
    const card = ns.defs.cards[num - 1];
    if (g.fx) {
      g.fx.push({ kind: 'pull', num: num, name: card.name });
    }
    const n = num < 10 ? '0' + num : String(num);
    W().message(g, ns.defs.text.PULL + n + ': ' + card.name + '.');
    g.collectionDirty = true;
  }

  // ------------------------------------------------------------------ doors

  function thingsIn(g, cell) {
    return g.things.some(function (o) {
      if (o.removed || !o.solid && !o.player) {
        return false;
      }
      return o.x + o.radius > cell.cx && o.x - o.radius < cell.cx + 1 && o.y + o.radius > cell.cy && o.y - o.radius < cell.cy + 1 && !o.missile;
    });
  }

  function openDoor(g, cell, by) {
    const d = cell.door;
    if (d.state === 'opening' || d.state === 'open') {
      if (d.state === 'open') {
        d.timer = d.stay;
      }
      return;
    }
    if (d.state === 'closed') {
      W().sound(g, 'DOOR_OPEN', { x: cell.cx + 0.5, y: cell.cy + 0.5 });
    }
    d.state = 'opening';
    if (d.secret && !d.secretCounted && by && by.player) {
      d.secretCounted = true;
      foundSecret(g);
    }
    d.openedOnce = true;
  }

  function tickDoor(g, cell) {
    const d = cell.door;
    if (d.state === 'opening') {
      cell.cz = Math.min(cell.cz0, cell.cz + d.speed);
      if (cell.cz >= cell.cz0) {
        d.state = 'open';
        d.timer = d.stay;
      }
    } else if (d.state === 'open') {
      if (d.stay > 0 && --d.timer <= 0) {
        if (thingsIn(g, cell)) {
          d.timer = 20;
        } else {
          d.state = 'closing';
          W().sound(g, 'DOOR_CLOSE', { x: cell.cx + 0.5, y: cell.cy + 0.5 });
        }
      }
    } else if (d.state === 'closing') {
      if (thingsIn(g, cell) && cell.cz - cell.fz < 1.0) {
        d.state = 'opening';
        return;
      }
      cell.cz = Math.max(cell.fz, cell.cz - d.speed);
      if (cell.cz <= cell.fz) {
        d.state = 'closed';
      }
    }
  }

  // ------------------------------------------------------------------ tags, movers, triggers

  function fireTag(g, tag) {
    const lv = g.level;
    for (const m of lv.movers) {
      if (m.tag !== tag) {
        continue;
      }
      if (m.mode === 'perpetual' && m.state !== 'idle') {
        m.state = 'idle';
        continue;
      }
      if (m.state === 'idle' || m.state === 'done' && m.mode !== 'once') {
        m.state = 'going';
        W().sound(g, m.sound || 'DOOR_OPEN', { x: m.cells[0].cx + 0.5, y: m.cells[0].cy + 0.5 });
      }
    }
    const cells = lv.tags[tag] || [];
    for (const p of cells) {
      const cell = lv.cells[p.cy * lv.w + p.cx];
      if (cell.door) {
        cell.door.locked = false;
        cell.door.key = null;
        openDoor(g, cell, null);
        cell.door.stay = 0;
      }
    }
    // wake every monster standing in the tagged cells (monster closets)
    for (const o of g.things) {
      if (o.def.kind !== 'monster' || o.dead) {
        continue;
      }
      const inTag = o.tag === tag || cells.some(function (p) { return Math.floor(o.x) === p.cx && Math.floor(o.y) === p.cy; });
      if (inTag && g.player) {
        o.provoked = true;
        o.target = g.player;
        o.ambush = false;
        if (W().inLabel(o, 'spawn')) {
          W().setLabel(g, o, 'see');
        }
      }
    }
  }

  function tickMover(g, m) {
    if (m.state !== 'going' && m.state !== 'returning') {
      if (m.state === 'waiting' && --m.timer <= 0) {
        m.state = 'returning';
      }
      return;
    }
    let all = true;
    m.cells.forEach(function (cell, i) {
      const target = m.state === 'going' ? m.to : m.from[i];
      const cur = cell[m.field];
      const next = cur < target ? Math.min(target, cur + m.speed) : Math.max(target, cur - m.speed);
      // a ceiling coming down on a thing: crush it, or stop
      if (m.field === 'cz' && next < cur) {
        const crushed = g.things.filter(function (o) {
          return (o.solid || o.player) && !o.removed && Math.floor(o.x) === cell.cx && Math.floor(o.y) === cell.cy && o.z + o.height > next;
        });
        if (crushed.length) {
          if (m.damage && g.tic % 4 === 0) {
            crushed.forEach(function (o) { W().damage(g, o, null, null, m.damage); });
          }
          all = false;
          return;
        }
      }
      cell[m.field] = next;
      if (m.field === 'fz') {
        cell.cz = Math.max(cell.cz, next + 0.1);
        g.things.forEach(function (o) {
          if (!o.missile && !o.float && Math.floor(o.x) === cell.cx && Math.floor(o.y) === cell.cy && Math.abs(o.z - cur) < 0.05) {
            o.z = next;
            o.floorz = next;
          }
        });
      }
      if (next !== target) {
        all = false;
      }
    });
    if (all) {
      if (m.state === 'going') {
        if (m.mode === 'once') {
          m.state = 'done';
        } else {
          m.state = 'waiting';
          m.timer = m.wait;
        }
      } else {
        m.state = m.mode === 'perpetual' ? 'going' : 'idle';
      }
    }
  }

  function tickLight(g, cell) {
    const fx = cell.lightfx;
    const t = g.tic + cell.lightPhase;
    if (fx === 'flicker') {
      if (t % 5 === 0) {
        cell.light = g.rng.byte() < 70 ? Math.max(0, cell.light0 - 5) : cell.light0;
      }
    } else if (fx === 'strobe') {
      cell.light = Math.floor(t / 12) % 2 ? Math.max(0, cell.light0 - 8) : cell.light0;
    } else if (fx === 'glow') {
      cell.light = cell.light0 - 3 + Math.round(Math.sin(t * 0.07) * 3);
    }
    // flashes off (g.steadyLights): flickering and strobing lights hold still; the flicker
    // still draws its random number above, so the game's RNG stream is the same either way
    if (g.steadyLights && (fx === 'flicker' || fx === 'strobe')) {
      cell.light = cell.light0;
    }
  }

  function foundSecret(g) {
    g.stats.secrets++;
    if (g.fx) {
      g.fx.push({ kind: 'secret' });
    }
    W().message(g, ns.defs.text.SECRET);
    W().sound(g, 'POWERUP', null);
  }

  // ------------------------------------------------------------------ the player in the map

  // Called each tic with the player's cell; runs floor specials, secrets and triggers.
  function playerInCell(g, pl, cell, entered) {
    if (!cell) {
      return;
    }
    if (entered) {
      if (cell.secret && !cell.door && !cell.secretFound) {
        cell.secretFound = true;
        foundSecret(g);
      }
      for (const t of g.level.triggers) {
        if (t.when === 'enter' && (!t.fired || !t.once) && t.cells.indexOf(cell) >= 0) {
          t.fired = true;
          if (t.fire) {
            fireTag(g, t.fire);
          }
          if (t.message) {
            W().message(g, t.message);
          }
        }
      }
      if (cell.special === 'teleport') {
        teleport(g, pl, cell.dest);
      }
      if (cell.special === 'exit') {
        g.exit = 'normal';
      }
    }
    if (cell.special === 'damage' && pl.z <= cell.fz + 0.01 && !(pl.powers.waders > 0) && g.tic % 32 === 0) {
      W().damage(g, pl, null, null, cell.amount || 5);
    }
  }

  function teleport(g, mo, dest) {
    const spot = g.level.tags[dest][0];
    const x = spot.cx + 0.5;
    const y = spot.cy + 0.5;
    W().spawn(g, 'TFOG', mo.x, mo.y, mo.z).float = true;
    // telefrag whatever stands on the pad
    for (const o of g.things) {
      if (o !== mo && o.shootable && !o.dead && Math.hypot(o.x - x, o.y - y) < o.radius + mo.radius) {
        W().damage(g, o, mo, mo, 10000);
      }
    }
    mo.x = mo.px = x;
    mo.y = mo.py = y;
    const cell = ns.map.cellAt(g.level, x, y);
    mo.z = mo.pz = cell.fz;
    mo.floorz = cell.fz;
    mo.momx = mo.momy = 0;
    if (spot.angle !== null) {
      mo.angle = spot.angle;
    }
    if (mo.player) {
      mo.reaction = 18;
    }
    W().spawn(g, 'TFOG', x + Math.cos(mo.angle) * 0.6, y + Math.sin(mo.angle) * 0.6, mo.z).float = true;
    W().sound(g, 'TELEPORT', mo);
  }

  // The player pressed use facing the cell in front.
  function use(g, pl) {
    const ax = Math.cos(pl.angle);
    const ay = Math.sin(pl.angle);
    for (let d = 0.3; d <= 1.2; d += 0.15) {
      const cell = ns.map.cellAt(g.level, pl.x + ax * d, pl.y + ay * d);
      if (!cell) {
        return;
      }
      if (cell.door) {
        const door = cell.door;
        if (door.key && !pl.keys[door.key]) {
          W().message(g, ns.defs.text.door[door.key]);
          W().sound(g, 'MENU_BACK', pl);
          return;
        }
        if (door.locked) {
          W().sound(g, 'MENU_BACK', pl);
          return;
        }
        if (door.state === 'open' && door.stay > 0) {
          door.state = 'closing';
          W().sound(g, 'DOOR_CLOSE', { x: cell.cx + 0.5, y: cell.cy + 0.5 });
          return;
        }
        openDoor(g, cell, pl);
        return;
      }
      if (cell.solid) {
        if (cell.sw) {
          useSwitch(g, cell);
        } else {
          W().sound(g, 'PUNCH_WHIFF', pl);
        }
        return;
      }
    }
  }

  function flipName(name, on) {
    if (!name) {
      return name;
    }
    if (on && /_OFF$/.test(name)) {
      return name.replace(/_OFF$/, '_ON');
    }
    if (!on && /_ON$/.test(name)) {
      return name.replace(/_ON$/, '_OFF');
    }
    return name;
  }

  function setSwitchLook(g, cell, on) {
    const lv = g.level;
    cell.tex = flipName(cell.tex, on);
    if (cell.faces) {
      for (const f in cell.faces) {
        cell.faces[f] = flipName(cell.faces[f], on);
      }
    }
    if (cell.decals) {
      for (const f in cell.decals) {
        cell.decals[f].tex = flipName(cell.decals[f].tex, on);
      }
    }
    const fc = cell.faces || {};
    cell.tn = lv.texId(fc.n || cell.tex);
    cell.ts = lv.texId(fc.s || cell.tex);
    cell.te = lv.texId(fc.e || cell.tex);
    cell.tw = lv.texId(fc.w || cell.tex);
    if (cell.decals) {
      const d = cell.decals;
      cell.dn = d.n ? lv.texId(d.n.tex) : -1;
      cell.ds = d.s ? lv.texId(d.s.tex) : -1;
      cell.de = d.e ? lv.texId(d.e.tex) : -1;
      cell.dw = d.w ? lv.texId(d.w.tex) : -1;
    }
    if (lv.texViews.length < lv.texNames.length) {
      lv.texViews.length = lv.texNames.length;
    }
  }

  function useSwitch(g, cell) {
    const sw = cell.sw;
    if (sw.used && sw.once) {
      return;
    }
    sw.used = true;
    W().sound(g, 'SWITCH', { x: cell.cx + 0.5, y: cell.cy + 0.5 });
    setSwitchLook(g, cell, true);
    if (!sw.once) {
      sw.timer = 35;
    }
    if (sw.tag) {
      fireTag(g, sw.tag);
    }
    if (sw.exit) {
      g.exit = 'normal';
    }
  }

  function swapWeekend(g, mo) {
    // EVERY OTHER WEEKEND: the active half goes still, the other takes over
    const p = mo.partner;
    if (!p || p.dead) {
      return;
    }
    W().message(g, ns.defs.text.WEEKEND);
    pull(g, mo.def.card);
    mo.active = false;
    mo.invulnerable = true;
    mo.weekendTimer = Infinity;
    W().setLabel(g, mo, 'weekend');
    p.active = true;
    p.invulnerable = false;
    p.toldWeekend = false;
    p.weekendTimer = 420;
    p.target = g.player;
    W().setLabel(g, p, 'see');
    W().spawn(g, 'TFOG', mo.x, mo.y, mo.z).float = true;
    W().spawn(g, 'TFOG', p.x, p.y, p.z).float = true;
    // the shuttle: a Grand Caravan between the two houses
    const vans = g.things.filter(function (o) { return o.type === 'CARA' && !o.dead && !o.removed; }).length;
    if (vans < 2) {
      const x = (mo.x + p.x) / 2;
      const y = (mo.y + p.y) / 2;
      const van = W().spawn(g, 'CARA', x, y, null);
      if (!W().checkPosition(g, van, x, y) || W().thingBlocking(g, van, x, y)) {
        van.removed = true;
      } else {
        g.stats.killsTotal++;
        van.target = g.player;
        W().setLabel(g, van, 'see');
      }
    }
  }

  function tick(g) {
    const lv = g.level;
    for (const cell of lv.cells) {
      if (cell.door && cell.door.state !== 'closed') {
        tickDoor(g, cell);
      }
      if (cell.lightfx) {
        tickLight(g, cell);
      }
      if (cell.sw && cell.sw.timer > 0 && --cell.sw.timer === 0) {
        cell.sw.used = false;
        setSwitchLook(g, cell, false);
      }
    }
    for (const m of lv.movers) {
      tickMover(g, m);
    }
    if (g.respawns && g.respawns.length) {
      g.respawns = g.respawns.filter(function (r) {
        if (g.tic < r.tic) {
          return true;
        }
        const mo = W().spawn(g, r.type, r.x, r.y, null, r.angle);
        if (!W().checkPosition(g, mo, r.x, r.y) || W().thingBlocking(g, mo, r.x, r.y)) {
          mo.removed = true;
          r.tic = g.tic + 70;
          return true;
        }
        W().spawn(g, 'TFOG', r.x, r.y, mo.z).float = true;
        W().sound(g, 'TELEPORT', mo);
        return false;
      });
    }
  }

  // Noise: a shot wakes every monster that can hear it through open cells.
  function noise(g, mo) {
    const lv = g.level;
    const startCell = ns.map.cellAt(lv, mo.x, mo.y);
    if (!startCell) {
      return;
    }
    const seen = new Set([startCell]);
    let frontier = [startCell];
    for (let depth = 0; depth < 22 && frontier.length; depth++) {
      const next = [];
      for (const c of frontier) {
        c.soundTic = g.tic;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = ns.map.cellAt(lv, c.cx + dx + 0.5, c.cy + dy + 0.5);
          if (!n || n.solid || seen.has(n)) {
            continue;
          }
          if (n.door && n.cz - n.fz < 0.2) {
            continue;
          }
          seen.add(n);
          next.push(n);
        }
      }
      frontier = next;
    }
  }

  ns.level = {
    start: start,
    tick: tick,
    pull: pull,
    openDoor: openDoor,
    fireTag: fireTag,
    use: use,
    playerInCell: playerInCell,
    teleport: teleport,
    swapWeekend: swapWeekend,
    noise: noise
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
