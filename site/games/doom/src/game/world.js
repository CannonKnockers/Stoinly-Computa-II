(function (ns) {
  'use strict';
  // world.js: the things of a level and the rules they live by: spawning, the Doom-style
  // state machine, movement with collision against cells and other things, gravity, sight,
  // hitscans and projectiles, radius damage, damage and death, and every monster behavior in
  // the bestiary (docs/design.md section 3). DOM-free; one call to tick() is one 35 Hz tic.

  const STEP = 0.375;
  const GRAVITY = 0.03;
  const FRICTION = 0.90625;
  const TAU = Math.PI * 2;
  const DIRS = [];
  for (let i = 0; i < 8; i++) {
    DIRS.push([Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
  }

  function defs() {
    return ns.defs.things;
  }

  // ------------------------------------------------------------------ spawning

  function spawn(g, type, x, y, z, angle) {
    const def = defs()[type];
    if (!def) {
      throw new Error('world.spawn: unknown thing "' + type + '"');
    }
    const cell = ns.map.cellAt(g.level, x, y);
    const mo = {
      id: g.nextId++,
      type: type,
      def: def,
      x: x,
      y: y,
      z: 0,
      px: x,
      py: y,
      pz: 0,
      momx: 0,
      momy: 0,
      momz: 0,
      angle: angle || 0,
      radius: def.radius || 0.2,
      height: def.height || 0.5,
      hp: def.hp || 1,
      si: -1,
      tics: 0,
      frame: 'A',
      sprite: def.sprite,
      bright: Boolean(def.bright),
      solid: def.kind === 'monster' ? !def.flagSet.ghost : (def.kind === 'deco' ? Boolean(def.solid) : def.kind === 'barrel'),
      shootable: def.kind === 'monster' ? !def.flagSet.ghost : def.kind === 'barrel',
      float: Boolean(def.flagSet && def.flagSet.float),
      target: null,
      owner: null,
      threshold: 0,
      reaction: 8,
      movedir: -1,
      movecount: 0,
      provoked: false,
      ambush: false,
      dead: false,
      removed: false,
      moving: false,
      floorz: 0,
      ceilz: 2,
      timer: 0,
      special: null
    };
    const floor = cell ? cell.fz : 0;
    mo.floorz = floor;
    mo.ceilz = cell ? cell.cz : 2;
    if (z === undefined || z === null) {
      mo.z = mo.float ? floor + (def.float || 1.0) : floor;
    } else {
      mo.z = z;
    }
    mo.pz = mo.z;
    mo.spawnX = x;
    mo.spawnY = y;
    mo.spawnAngle = angle || 0;
    g.things.push(mo);
    if (def.stateList) {
      setState(g, mo, def.labels.spawn);
    }
    return mo;
  }

  function remove(g, mo) {
    mo.removed = true;
  }

  // ------------------------------------------------------------------ state machine

  function setState(g, mo, si) {
    let guard = 0;
    while (true) {
      if (si === -2) {
        remove(g, mo);
        return false;
      }
      if (si === -1 || si === undefined) {
        return true;
      }
      const st = mo.def.stateList[si];
      mo.si = si;
      mo.frame = st.frame;
      mo.tics = st.tics;
      if (st.action) {
        const fn = ACTIONS[st.action];
        if (!fn) {
          throw new Error('world: no action "' + st.action + '" (' + mo.type + ')');
        }
        fn(g, mo, st.arg);
        if (mo.removed) {
          return false;
        }
        if (mo.si !== si) {
          return true;
        }
      }
      if (mo.tics !== 0) {
        return true;
      }
      si = st.next;
      if (++guard > 50) {
        throw new Error('world: zero-tic state loop in ' + mo.type);
      }
    }
  }

  function setLabel(g, mo, label) {
    const si = mo.def.labels[label];
    if (si === undefined) {
      return false;
    }
    return setState(g, mo, si);
  }

  function inLabel(mo, label) {
    const labels = mo.def.labels;
    if (!labels || labels[label] === undefined) {
      return false;
    }
    // states of a label run from its index to the next label's index
    const start = labels[label];
    let end = mo.def.stateList.length;
    for (const k in labels) {
      if (labels[k] > start && labels[k] < end) {
        end = labels[k];
      }
    }
    return mo.si >= start && mo.si < end;
  }

  // ------------------------------------------------------------------ geometry

  function cellAt(g, x, y) {
    return ns.map.cellAt(g.level, x, y);
  }

  // Cells overlapped by a circle.
  function forCells(g, x, y, r, fn) {
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r);
    const y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const nx = Math.max(cx, Math.min(x, cx + 1));
        const ny = Math.max(cy, Math.min(y, cy + 1));
        if ((nx - x) * (nx - x) + (ny - y) * (ny - y) < r * r - 1e-9) {
          const cell = cx < 0 || cy < 0 || cx >= g.level.w || cy >= g.level.h ? null : g.level.cells[cy * g.level.w + cx];
          if (fn(cell, cx, cy) === false) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // Whether a thing can stand at (x, y): every overlapped cell must admit it. Returns the
  // floor and ceiling it would have there, or null.
  const posOut = { floor: 0, ceil: 0, blocker: null, door: null };
  function checkPosition(g, mo, x, y) {
    let floor = -Infinity;
    let ceil = Infinity;
    let ok = true;
    posOut.door = null;
    posOut.blocker = null;
    forCells(g, x, y, mo.radius, function (cell) {
      if (!cell || cell.solid) {
        ok = false;
        return false;
      }
      if (cell.mid && cell.block) {
        ok = false;
        return false;
      }
      if (cell.door && cell.cz - cell.fz < mo.height) {
        posOut.door = cell;
        ok = false;
        return false;
      }
      floor = Math.max(floor, cell.fz);
      ceil = Math.min(ceil, cell.cz);
      return true;
    });
    if (!ok) {
      return null;
    }
    if (!mo.float && !mo.missile) {
      if (floor > mo.z + STEP) {
        return null;
      }
      if (ceil - Math.max(floor, mo.z) < mo.height) {
        return null;
      }
    } else if (mo.z < floor - 0.001 || mo.z + mo.height > ceil + 0.001) {
      if (!mo.float || ceil - floor < mo.height) {
        return null;
      }
    }
    posOut.floor = floor;
    posOut.ceil = ceil;
    return posOut;
  }

  function thingBlocking(g, mo, x, y) {
    for (let i = 0; i < g.things.length; i++) {
      const o = g.things[i];
      if (o === mo || !o.solid || o.removed || o === mo.owner) {
        continue;
      }
      const r = o.radius + mo.radius;
      if (Math.abs(o.x - x) >= r || Math.abs(o.y - y) >= r) {
        continue;
      }
      if ((o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) >= r * r) {
        continue;
      }
      if (mo.z >= o.z + o.height || o.z >= mo.z + mo.height) {
        continue;
      }
      // already overlapping and moving apart: allow, so things never stick together
      const dNow = (o.x - mo.x) * (o.x - mo.x) + (o.y - mo.y) * (o.y - mo.y);
      const dNew = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
      if (dNow < r * r && dNew > dNow) {
        continue;
      }
      return o;
    }
    return null;
  }

  function tryMove(g, mo, x, y, dropoff) {
    const p = checkPosition(g, mo, x, y);
    if (!p) {
      return false;
    }
    if (!mo.float && !mo.player && !dropoff && p.floor < mo.floorz - STEP) {
      return false;
    }
    const floor = p.floor;
    const ceil = p.ceil;
    const blocker = thingBlocking(g, mo, x, y);
    if (blocker) {
      posOut.blocker = blocker;
      return false;
    }
    mo.x = x;
    mo.y = y;
    mo.floorz = floor;
    mo.ceilz = ceil;
    if (!mo.float && !mo.missile && mo.z < floor) {
      mo.z = floor;
    }
    return true;
  }

  // ------------------------------------------------------------------ sight

  // Whether b can be seen from a: a 2D walk through the grid with the sight line's height
  // checked against every cell it enters; doors and walls block, fences do not.
  function checkSight(g, a, b) {
    const x0 = a.x;
    const y0 = a.y;
    const z0 = a.z + a.height * 0.8;
    const x1 = b.x;
    const y1 = b.y;
    const z1 = b.z + b.height * 0.6;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      return true;
    }
    let mx = Math.floor(x0);
    let my = Math.floor(y0);
    const ex = Math.floor(x1);
    const ey = Math.floor(y1);
    const ddx = dx === 0 ? 1e30 : Math.abs(dist / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(dist / dy);
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    let tx = dx < 0 ? (x0 - mx) * ddx : (mx + 1 - x0) * ddx;
    let ty = dy < 0 ? (y0 - my) * ddy : (my + 1 - y0) * ddy;
    for (let i = 0; i < 200; i++) {
      if (mx === ex && my === ey) {
        return true;
      }
      let t;
      if (tx < ty) {
        t = tx;
        tx += ddx;
        mx += sx;
      } else {
        t = ty;
        ty += ddy;
        my += sy;
      }
      if (t > dist) {
        return true;
      }
      const cell = g.level.cells[my * g.level.w + mx];
      if (!cell || cell.solid) {
        return false;
      }
      const z = z0 + (z1 - z0) * (t / dist);
      if (z <= cell.fz || z >= cell.cz) {
        return false;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ hitscans

  // Traces a shot from (x, y, z) along angle with a vertical slope (dz per unit). Returns
  // { thing, x, y, z, dist } for the first shootable thing or wall it meets within range.
  function trace(g, shooter, x, y, z, angle, slope, range) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // walls
    let mx = Math.floor(x);
    let my = Math.floor(y);
    const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    let tx = dx < 0 ? (x - mx) * ddx : (mx + 1 - x) * ddx;
    let ty = dy < 0 ? (y - my) * ddy : (my + 1 - y) * ddy;
    let wallT = range;
    let start = cellAt(g, x, y);
    // inside the shooter's own cell the shot can still hit its floor or ceiling
    let cur = start;
    for (let i = 0; i < 400; i++) {
      let t;
      if (tx < ty) {
        t = tx;
        tx += ddx;
        mx += sx;
      } else {
        t = ty;
        ty += ddy;
        my += sy;
      }
      // floor or ceiling of the current cell before this boundary
      if (cur && slope !== 0) {
        const zt = z + slope * t;
        if (zt < cur.fz) {
          wallT = Math.min(wallT, (cur.fz - z) / slope);
          break;
        }
        if (zt > cur.cz && !cur.sky) {
          wallT = Math.min(wallT, (cur.cz - z) / slope);
          break;
        }
      }
      if (t >= range) {
        break;
      }
      const cell = mx < 0 || my < 0 || mx >= g.level.w || my >= g.level.h ? null : g.level.cells[my * g.level.w + mx];
      const zt = z + slope * t;
      if (!cell || cell.solid || zt <= cell.fz || (zt >= cell.cz && !(cell.sky && cur && cur.sky))) {
        wallT = t - 0.02;
        break;
      }
      if (cell.mid && cell.block) {
        // the fence plane is at the cell center; close enough to stop at its boundary
        wallT = t + 0.45;
        break;
      }
      cur = cell;
    }
    // things
    let best = null;
    let bestT = wallT;
    for (let i = 0; i < g.things.length; i++) {
      const o = g.things[i];
      if (o === shooter || !o.shootable || o.removed || o.dead) {
        continue;
      }
      const ox = o.x - x;
      const oy = o.y - y;
      const along = ox * dx + oy * dy;
      if (along <= 0 || along >= bestT) {
        continue;
      }
      const perp = Math.abs(-ox * dy + oy * dx);
      if (perp > o.radius) {
        continue;
      }
      const tHit = along - Math.sqrt(Math.max(0, o.radius * o.radius - perp * perp));
      const zt = z + slope * tHit;
      if (zt < o.z || zt > o.z + o.height) {
        continue;
      }
      best = o;
      bestT = tHit;
    }
    return { thing: best, x: x + dx * bestT, y: y + dy * bestT, z: z + slope * bestT, dist: bestT };
  }

  // The vertical slope toward the nearest shootable thing near the aim line, Doom's
  // autoaim: a shot at an imp on a ledge still hits it.
  function aimSlope(g, shooter, angle, range, eyeZ) {
    let best = null;
    let bestD = range;
    for (let i = 0; i < g.things.length; i++) {
      const o = g.things[i];
      if (o === shooter || !o.shootable || o.dead || o.removed || o.def.kind !== 'monster') {
        continue;
      }
      const ox = o.x - shooter.x;
      const oy = o.y - shooter.y;
      const d = Math.hypot(ox, oy);
      if (d > bestD) {
        continue;
      }
      let da = Math.atan2(oy, ox) - angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > Math.atan2(o.radius + 0.12, d) + 0.04) {
        continue;
      }
      if (!checkSight(g, shooter, o)) {
        continue;
      }
      best = o;
      bestD = d;
    }
    if (!best) {
      return 0;
    }
    return (best.z + best.height * 0.5 - eyeZ) / bestD;
  }

  function hitscan(g, shooter, angle, slope, range, dmg, puff) {
    const z = shooter.z + (shooter.player ? 0.6 : shooter.height * 0.65);
    const r = trace(g, shooter, shooter.x, shooter.y, z, angle, slope, range);
    if (r.thing) {
      damage(g, r.thing, shooter, shooter, dmg);
      spawnPuff(g, r.thing, r.x, r.y, r.z);
    } else if (r.dist < range) {
      const p = spawn(g, puff || 'PUFF', r.x - Math.cos(angle) * 0.05, r.y - Math.sin(angle) * 0.05, r.z - 0.1);
      p.float = true;
    }
    return r;
  }

  // What a hit raises: sparks off cars, chalk dust off the strong women, foil off a card.
  function spawnPuff(g, target, x, y, z) {
    const lane = target.def.lane;
    const type = lane === 'vehicle' ? 'SPRK' : (lane === 'guest' ? 'FOIL' : (lane === 'boss' ? 'SPRK' : 'DUST'));
    const p = spawn(g, type, x, y, z - 0.1);
    p.float = true;
  }

  // ------------------------------------------------------------------ projectiles

  function missile(g, source, type, target, angleOffset, zOffset) {
    const def = defs()[type];
    const z = source.z + (source.player ? 0.45 : source.height * 0.6) + (zOffset || 0);
    let angle;
    let slope;
    if (target) {
      angle = Math.atan2(target.y - source.y, target.x - source.x);
      const d = Math.max(0.1, Math.hypot(target.x - source.x, target.y - source.y));
      slope = (target.z + target.height * 0.5 - z) / d;
    } else {
      angle = source.angle;
      slope = source.player ? aimSlope(g, source, angle, 32, z) : 0;
    }
    angle += angleOffset || 0;
    const mo = spawn(g, type, source.x + Math.cos(angle) * (source.radius + 0.1), source.y + Math.sin(angle) * (source.radius + 0.1), z - def.height / 2);
    mo.missile = true;
    mo.float = true;
    mo.owner = source;
    mo.angle = angle;
    mo.momx = Math.cos(angle) * def.speed;
    mo.momy = Math.sin(angle) * def.speed;
    mo.momz = slope * def.speed;
    mo.solid = false;
    mo.shootable = false;
    if (def.sound) {
      sound(g, def.sound, mo);
    }
    // a missile spawned inside a wall explodes at once
    if (!checkPosition(g, mo, mo.x, mo.y)) {
      explodeMissile(g, mo, null);
    }
    return mo;
  }

  function explodeMissile(g, mo, hit) {
    const def = mo.def;
    mo.momx = mo.momy = mo.momz = 0;
    mo.missile = false;
    if (hit) {
      damage(g, hit, mo, mo.owner, rand(g, def.dmg));
    }
    if (def.splash) {
      radiusAttack(g, mo, mo.owner, def.splash.damage, def.splash.radius, def.hurtsOwner);
    }
    if (def.bfg && mo.owner) {
      bfgSpray(g, mo);
    }
    if (def.puff) {
      const p = spawn(g, def.puff, mo.x, mo.y, mo.z);
      p.float = true;
      if (def.puff === 'EXPL') {
        sound(g, 'ROCKET_EXPLODE', mo);
      }
    }
    setLabel(g, mo, 'death');
  }

  function moveMissile(g, mo) {
    const steps = Math.max(1, Math.ceil(Math.hypot(mo.momx, mo.momy) / 0.1));
    for (let s = 0; s < steps; s++) {
      const nx = mo.x + mo.momx / steps;
      const ny = mo.y + mo.momy / steps;
      const nz = mo.z + mo.momz / steps;
      // things
      for (let i = 0; i < g.things.length; i++) {
        const o = g.things[i];
        if (o === mo || o === mo.owner || !o.shootable || o.removed || o.dead || (o.invulnerable && o.def.team && o.def.lane === 'boss')) {
          continue;
        }
        const r = o.radius + mo.radius;
        if ((o.x - nx) * (o.x - nx) + (o.y - ny) * (o.y - ny) < r * r && nz + mo.height > o.z && nz < o.z + o.height) {
          explodeMissile(g, mo, o);
          return;
        }
      }
      let blocked = false;
      forCells(g, nx, ny, mo.radius, function (cell) {
        if (!cell || cell.solid || (cell.mid && cell.block) || nz < cell.fz || (nz + mo.height > cell.cz && !cell.sky)) {
          blocked = true;
          return false;
        }
        return true;
      });
      if (blocked) {
        explodeMissile(g, mo, null);
        return;
      }
      mo.x = nx;
      mo.y = ny;
      mo.z = nz;
    }
  }

  function radiusAttack(g, spot, source, dmg, radius, hurtsOwner) {
    for (let i = 0; i < g.things.length; i++) {
      const o = g.things[i];
      if (!o.shootable || o.dead || o.removed || (o === source && !hurtsOwner) || (o.invulnerable && o.def.team && o.def.lane === 'boss')) {
        continue;
      }
      const d = Math.max(0, Math.hypot(o.x - spot.x, o.y - spot.y) - o.radius);
      if (d >= radius) {
        continue;
      }
      if (!checkSight(g, spot, o) && d > 0.3) {
        continue;
      }
      damage(g, o, spot, source, Math.round(dmg * (1 - d / radius)));
    }
  }

  // THE GUM: forty tracers in a cone from the player toward where the ball hit.
  function bfgSpray(g, ball) {
    const pl = ball.owner;
    const base = ball.angle;
    for (let i = 0; i < 40; i++) {
      const a = base - Math.PI / 4 + (Math.PI / 2) * i / 39;
      const r = trace(g, pl, pl.x, pl.y, pl.z + 0.6, a, 0, 16);
      if (r.thing) {
        let d = 0;
        for (let k = 0; k < 15; k++) {
          d += 1 + (rng(g) & 7);
        }
        damage(g, r.thing, pl, pl, d);
        const p = spawn(g, 'FOIL', r.thing.x, r.thing.y, r.thing.z + r.thing.height * 0.5);
        p.float = true;
      }
    }
  }

  // ------------------------------------------------------------------ damage and death

  function rng(g) {
    return g.rng.byte();
  }

  function rand(g, range) {
    return range[0] + Math.floor(g.rng.next() * (range[1] - range[0] + 1));
  }

  function provoke(g, mo, by) {
    if (mo.def.lane !== 'woman' || mo.provoked) {
      return;
    }
    mo.provoked = true;
    if (by && by.player) {
      message(g, ns.defs.text.PROVOKED);
    }
    if (mo.def.decree) {
      // PURPLE POWER PRINCESS decrees: everything near her wakes
      for (const o of g.things) {
        if (o !== mo && o.def.kind === 'monster' && !o.dead && Math.hypot(o.x - mo.x, o.y - mo.y) < mo.def.decree) {
          o.provoked = true;
          if (!o.target && g.player) {
            o.target = g.player;
            if (o.def.labels.see !== undefined && inLabel(o, 'spawn')) {
              setLabel(g, o, 'see');
            }
          }
        }
      }
    }
  }

  function damage(g, target, inflictor, source, amount) {
    if (!target.shootable || target.dead || target.removed || amount <= 0) {
      return;
    }
    if (target.player) {
      ns.player.damage(g, target, inflictor, source, amount);
      return;
    }
    const def = target.def;
    if (target.invulnerable) {
      if (target.type === 'DIVM' || target.type === 'DIVD') {
        if (!target.toldWeekend) {
          target.toldWeekend = true;
          message(g, ns.defs.text.NOT_YOUR_WEEKEND);
        }
      }
      return;
    }
    if (target.resting) {
      amount = Math.ceil(amount / 2);
    }
    if (g.mods && g.mods.glass && source && source.player) {
      amount *= 2;
    }
    provoke(g, target, source);
    // presentation only: the hit flash and the juice layer's pop-up number
    target.flashUntil = g.tic + 2;
    if (g.fx) {
      g.fx.push({ kind: 'hit', id: target.id, x: target.x, y: target.y, z: target.z + (target.height || 0.8) * 0.9, amount: Math.min(amount, Math.max(1, target.hp)), byPlayer: Boolean(source && source.player) });
    }
    // knockback by mass, as Doom does
    if (inflictor && def.mass && !def.flagSet.boss) {
      const a = Math.atan2(target.y - inflictor.y, target.x - inflictor.x);
      const thrust = amount / def.mass * 0.25;
      target.momx += Math.cos(a) * thrust;
      target.momy += Math.sin(a) * thrust;
    }
    target.hp -= amount;
    if (def.heal && !target.healed && target.hp <= def.hp / 2 && target.hp > 0) {
      target.healed = true;
      target.hp += def.heal;
      message(g, ns.defs.text.ONE_MORE_THING);
    }
    if (target.hp <= 0) {
      if (def.bailout && !target.bailedOut) {
        target.bailedOut = true;
        target.hp = def.bailout;
        ns.level.pull(g, def.card);
        setLabel(g, target, 'bailout');
        return;
      }
      kill(g, target, source);
      return;
    }
    if (def.team && def.lane === 'woman' && !target.resting && target.partner && !target.partner.dead && target.hp < def.hp / 2) {
      tag(g, target);
      return;
    }
    if (g.rng.byte() < def.pain && !target.charging && !target.resting) {
      setLabel(g, target, 'pain');
    }
    target.reaction = 0;
    // infighting: hit by another monster, turn on it; women never fight each other
    if (source && source !== target && !source.player && source.def.kind === 'monster' && target.threshold <= 0) {
      const bothWomen = source.def.lane === 'woman' && def.lane === 'woman';
      if (!bothWomen && source.type !== target.type) {
        target.target = source;
        target.threshold = 100;
        if (inLabel(target, 'spawn')) {
          setLabel(g, target, 'see');
        }
      }
    } else if (source && source.player && !target.target) {
      target.target = source;
      if (inLabel(target, 'spawn')) {
        setLabel(g, target, 'see');
      }
    }
  }

  function kill(g, mo, source) {
    const def = mo.def;
    mo.dead = true;
    mo.shootable = false;
    mo.charging = false;
    mo.momx *= 0.3;
    mo.momy *= 0.3;
    if (def.flagSet.countkill) {
      g.stats.kills++;
    }
    if (g.fx && def.kind === 'monster') {
      g.fx.push({ kind: 'kill', id: mo.id, x: mo.x, y: mo.y, z: mo.z + (mo.height || 0.8) * 0.5, big: (def.mass || 0) >= 300, byPlayer: Boolean(source && source.player) });
    }
    if (g.mods && g.mods.money && def.kind === 'monster') {
      spawn(g, 'DOLR', mo.x + 0.15, mo.y - 0.15, null).dropped = true;
    }
    if (def.card) {
      ns.level.pull(g, def.card);
    }
    if (def.kind === 'barrel' || def.lane === 'boss') {
      mo.solid = false;
    }
    if (g.skill >= 4 && def.lane === 'vehicle' && mo.spawnX !== undefined) {
      // RUDIGER: vehicles come back thirty seconds later where they were placed
      g.respawns = g.respawns || [];
      g.respawns.push({ type: mo.type, x: mo.spawnX, y: mo.spawnY, angle: mo.spawnAngle, tic: g.tic + 30 * 35 });
    }
    if (def.lane !== 'guest') {
      dropFor(g, mo);
    }
    if (def.lane === 'boss' && (mo.type === 'DIVM' || mo.type === 'DIVD') && mo.partner && !mo.partner.dead) {
      const p = mo.partner;
      p.invulnerable = false;
      p.custody = true;
      p.weekendTimer = Infinity;
      message(g, ns.defs.text.CUSTODY);
      if (inLabel(p, 'weekend')) {
        setLabel(g, p, 'see');
      }
    }
    if (def.lane === 'woman' && def.team && mo.partner && !mo.partner.dead) {
      const p = mo.partner;
      p.resting = false;
      p.speedScale = 1.5;
      if (inLabel(p, 'apron')) {
        setLabel(g, p, 'see');
      }
    }
    setLabel(g, mo, 'death');
  }

  function dropFor(g, mo) {
    let drop = mo.def.drop;
    if (!drop) {
      return;
    }
    if (drop === 'CARADROP') {
      if (!g.caravanDropped && !g.player.weapons[2]) {
        g.caravanDropped = true;
        drop = 'WPAK';
      } else {
        drop = 'PACK';
        spawn(g, 'PACK', mo.x + 0.2, mo.y + 0.2, null).dropped = true;
      }
    }
    const it = spawn(g, drop, mo.x, mo.y, null);
    it.z = mo.floorz;
    it.dropped = true;
  }

  // ------------------------------------------------------------------ monster AI

  function sound(g, name, mo) {
    g.events.push({ sound: name, x: mo ? mo.x : null, y: mo ? mo.y : null });
  }

  function message(g, text) {
    g.messages.push({ text: text, tic: g.tic });
  }

  function voice(mo, kind) {
    return (mo.def.voice || 'GROWL') + '_' + kind;
  }

  function hostileTo(g, mo, player) {
    if (!player || player.dead) {
      return false;
    }
    if (mo.def.lane === 'woman' && !mo.provoked && g.skill < 4) {
      return false;
    }
    return true;
  }

  function look(g, mo) {
    const pl = g.player;
    if (mo.target && !mo.target.dead && !mo.target.removed) {
      setLabel(g, mo, 'see');
      return;
    }
    if (!hostileTo(g, mo, pl)) {
      return;
    }
    let found = false;
    const cell = cellAt(g, mo.x, mo.y);
    if (cell && cell.soundTic > 0 && g.tic - cell.soundTic < 12 && !mo.ambush) {
      found = true;
    }
    if (!found) {
      const d = Math.hypot(pl.x - mo.x, pl.y - mo.y);
      let da = Math.atan2(pl.y - mo.y, pl.x - mo.x) - mo.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if ((Math.abs(da) < Math.PI / 2 || d < 2) && checkSight(g, mo, pl)) {
        found = true;
      }
    }
    if (found) {
      mo.target = pl;
      if (mo.def.lane === 'guest' && !mo.announced) {
        mo.announced = true;
        message(g, ns.defs.text.guestArrive[mo.type]);
      }
      sound(g, voice(mo, 'SIGHT'), mo);
      setLabel(g, mo, 'see');
    }
  }

  function faceTarget(mo) {
    if (mo.target) {
      mo.angle = Math.atan2(mo.target.y - mo.y, mo.target.x - mo.x);
    }
  }

  function dist2d(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function meleeRange(mo) {
    const t = mo.target;
    return t && dist2d(mo, t) < mo.radius + t.radius + 0.4 && Math.abs((t.z + t.height / 2) - (mo.z + mo.height / 2)) < 1;
  }

  function chase(g, mo) {
    const def = mo.def;
    mo.moving = true;
    if (mo.threshold > 0) {
      mo.threshold--;
    }
    const t = mo.target;
    if (!t || t.dead || t.removed) {
      mo.target = null;
      mo.moving = false;
      if (g.player && !g.player.dead && hostileTo(g, mo, g.player)) {
        mo.target = g.player;
      } else {
        setLabel(g, mo, 'spawn');
        return;
      }
    }
    if (mo.reaction > 0) {
      mo.reaction--;
    }
    // melee
    if (def.labels.melee !== undefined && meleeRange(mo)) {
      sound(g, voice(mo, 'ATTACK'), mo);
      setLabel(g, mo, 'melee');
      return;
    }
    // ranged: more likely the closer the target, as in Doom
    if (def.labels.missile !== undefined && mo.reaction <= 0 && checkSight(g, mo, mo.target)) {
      const d = dist2d(mo, mo.target);
      let fire;
      if (mo.type === 'SBUS') {
        fire = !(mo.passengerTimer > 0);
      } else {
        let chance = Math.min(200, Math.max(0, d * 64 - 64)) / 1.4;
        if (def.lane === 'guest' || def.lane === 'boss') {
          chance = chance * 0.6 + 40;
        }
        fire = g.rng.byte() >= chance;
      }
      if (fire) {
        mo.reaction = def.lane === 'guest' ? 30 : 12;
        setLabel(g, mo, 'missile');
        return;
      }
    }
    // THE 2008 FINANCIAL CRISIS forecloses on anything within six cells
    if (mo.type === 'CRIS' && mo.reaction <= 0 && dist2d(mo, mo.target) < 6 && g.rng.byte() < 60 && checkSight(g, mo, mo.target)) {
      mo.reaction = 20;
      setLabel(g, mo, 'melee');
      return;
    }
    if (--mo.movecount < 0 || mo.movedir < 0) {
      newChaseDir(g, mo);
    }
  }

  function newChaseDir(g, mo) {
    const t = mo.target;
    if (!t) {
      return;
    }
    const want = Math.atan2(t.y - mo.y, t.x - mo.x);
    const order = [];
    for (let i = 0; i < 8; i++) {
      let da = i * Math.PI / 4 - want;
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      order.push({ i: i, score: da + (mo.def.straight ? 0 : g.rng.next() * 0.6) });
    }
    order.sort(function (a, b) { return a.score - b.score; });
    for (const o of order) {
      if (o.i === ((mo.movedir + 4) & 7) && order[0].i !== o.i && g.rng.next() < 0.8) {
        continue;
      }
      const tx = mo.x + DIRS[o.i][0] * 0.5;
      const ty = mo.y + DIRS[o.i][1] * 0.5;
      const save = { x: mo.x, y: mo.y, z: mo.z, f: mo.floorz, c: mo.ceilz };
      if (tryMove(g, mo, tx, ty, false)) {
        mo.x = save.x;
        mo.y = save.y;
        mo.z = save.z;
        mo.floorz = save.f;
        mo.ceilz = save.c;
        mo.movedir = o.i;
        mo.movecount = 4 + (g.rng.byte() & 7);
        return;
      }
      if (posOut.door) {
        monsterOpenDoor(g, mo, posOut.door);
      }
    }
    mo.movedir = -1;
  }

  function monsterOpenDoor(g, mo, cell) {
    const d = cell.door;
    if (!d) {
      return;
    }
    if ((d.key || d.locked) && !mo.def.opensLocked) {
      return;
    }
    ns.level.openDoor(g, cell, mo);
  }

  function moveMonster(g, mo) {
    if (mo.movedir < 0 || !mo.moving) {
      return;
    }
    let sp = mo.def.speed * (mo.speedScale || 1) * (g.skill >= 4 ? 1.5 : 1);
    if (mo.custody) {
      sp *= 1.5;
    }
    const nx = mo.x + DIRS[mo.movedir][0] * sp;
    const ny = mo.y + DIRS[mo.movedir][1] * sp;
    if (!tryMove(g, mo, nx, ny, false)) {
      if (posOut.door) {
        monsterOpenDoor(g, mo, posOut.door);
      }
      mo.movecount = 0;
      mo.movedir = -1;
      return;
    }
    // face the way it walks unless attacking
    const want = Math.atan2(DIRS[mo.movedir][1], DIRS[mo.movedir][0]);
    let da = want - mo.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    mo.angle += Math.max(-0.2, Math.min(0.2, da));
  }

  // ------------------------------------------------------------------ actions

  function charge(g, mo, speed, tics) {
    faceTarget(mo);
    mo.charging = tics;
    mo.momx = Math.cos(mo.angle) * speed;
    mo.momy = Math.sin(mo.angle) * speed;
  }

  function meleeHit(g, mo, range) {
    if (!mo.target || !meleeRange(mo)) {
      return false;
    }
    damage(g, mo.target, mo, mo, rand(g, range || mo.def.melee));
    return true;
  }

  function guestAttack(g, mo) {
    const def = mo.def;
    const t = mo.target;
    if (!t) {
      return;
    }
    faceTarget(mo);
    sound(g, voice(mo, 'ATTACK'), mo);
    switch (def.attack) {
      case 'ticker': {
        const r = hitscan(g, mo, mo.angle + (g.rng.next() - 0.5) * 0.06, slopeTo(mo, t), 32, rand(g, def.dmg), 'TICK');
        for (let k = 1; k < 6; k++) {
          const p = spawn(g, 'TICK', mo.x + (r.x - mo.x) * k / 6, mo.y + (r.y - mo.y) * k / 6, mo.z + mo.height * 0.6 + (r.z - mo.z - mo.height * 0.6) * k / 6);
          p.float = true;
        }
        break;
      }
      case 'chopper':
        mo.burst = { type: 'CHOP', count: 8, every: 3, timer: 0 };
        break;
      case 'fireman':
        missile(g, mo, 'FIRE', t, -0.26);
        missile(g, mo, 'FIRE', t, 0);
        missile(g, mo, 'FIRE', t, 0.26);
        break;
      case 'rant':
        mo.rant = 70;
        mo.rantAngle = mo.angle + (g.rng.next() < 0.5 ? -0.8 : 0.8);
        break;
      case 'parody':
        parody(g, mo, t);
        break;
      case 'howl':
        sound(g, 'GROWL_SIGHT', mo);
        spawn(g, 'SHOK', mo.x, mo.y, mo.z).float = true;
        for (const o of g.things) {
          if (o === mo || o.dead || o.removed) {
            continue;
          }
          const d = dist2d(o, mo);
          if (o.shootable && d < 3) {
            damage(g, o, mo, mo, rand(g, def.dmg));
            const a = Math.atan2(o.y - mo.y, o.x - mo.x);
            o.momx += Math.cos(a) * 0.15;
            o.momy += Math.sin(a) * 0.15;
          }
          if (o.def.kind === 'monster' && o.def.lane !== 'woman' && !o.target && g.player) {
            o.target = g.player;
            if (inLabel(o, 'spawn')) {
              setLabel(g, o, 'see');
            }
          }
        }
        break;
      default:
        break;
    }
  }

  function slopeTo(mo, t) {
    const d = Math.max(0.1, dist2d(mo, t));
    return (t.z + t.height * 0.5 - (mo.z + mo.height * 0.65)) / d;
  }

  // WEIRD AL plays your weapon back to you.
  function parody(g, mo, t) {
    const w = g.player.readyWeapon;
    const s = slopeTo(mo, t);
    switch (w) {
      case 0:
      case 7:
        if (meleeRange(mo)) {
          damage(g, t, mo, mo, rand(g, [2, 20]));
        } else {
          mo.burst = { type: 'hit', count: 1, every: 1, timer: 0 };
        }
        break;
      case 1:
        hitscan(g, mo, mo.angle, s, 32, rand(g, [5, 15]));
        break;
      case 2:
        for (let i = 0; i < 5; i++) {
          hitscan(g, mo, mo.angle + (g.rng.next() - 0.5) * 0.17, s, 32, rand(g, [5, 15]));
        }
        break;
      case 3:
        mo.burst = { type: 'hit', count: 4, every: 2, timer: 0 };
        break;
      case 4:
        missile(g, mo, 'CLOD', t);
        break;
      case 5:
        mo.burst = { type: 'MBLT', count: 6, every: 3, timer: 0 };
        break;
      default:
        // he cannot parody the gum
        break;
    }
  }

  function tickBurst(g, mo) {
    const b = mo.burst;
    if (!b || mo.dead) {
      mo.burst = null;
      return;
    }
    if (b.timer-- > 0) {
      return;
    }
    b.timer = b.every;
    if (mo.target) {
      faceTarget(mo);
      if (b.type === 'hit') {
        hitscan(g, mo, mo.angle + (g.rng.next() - 0.5) * 0.08, slopeTo(mo, mo.target), 32, rand(g, [5, 15]));
      } else {
        missile(g, mo, b.type, mo.target, (g.rng.next() - 0.5) * 0.12);
      }
    }
    if (--b.count <= 0) {
      mo.burst = null;
    }
  }

  // THE AMAZING ATHEIST's rant: a beam that turns toward you and wears you down.
  function tickRant(g, mo) {
    if (!mo.rant || mo.dead || !mo.target) {
      mo.rant = 0;
      return;
    }
    mo.rant--;
    const want = Math.atan2(mo.target.y - mo.y, mo.target.x - mo.x);
    let da = want - mo.rantAngle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    mo.rantAngle += Math.max(-0.03, Math.min(0.03, da));
    if (g.tic % 4 === 0) {
      const r = trace(g, mo, mo.x, mo.y, mo.z + mo.height * 0.6, mo.rantAngle, slopeTo(mo, mo.target), 24);
      if (r.thing) {
        damage(g, r.thing, mo, mo, 2);
      }
      const k = 0.3 + g.rng.next() * 0.6;
      const p = spawn(g, 'RANT', mo.x + (r.x - mo.x) * k, mo.y + (r.y - mo.y) * k, mo.z + mo.height * 0.6 + (r.z - mo.z - mo.height * 0.6) * k);
      p.float = true;
    }
  }

  function tag(g, mo) {
    // the Glamazon who is hurt goes to the apron; her partner comes in
    const p = mo.partner;
    message(g, ns.defs.text.TAG);
    mo.resting = true;
    setLabel(g, mo, 'apron');
    p.resting = false;
    p.target = mo.target || g.player;
    setLabel(g, p, 'see');
  }

  // The nearest point to (x, y) where a player-sized thing can stand: dropped keys must
  // never land inside a couch.
  function freeSpot(g, x, y) {
    const probe = { radius: 0.3, height: 0.875, z: 0, floorz: 0, float: false, missile: false, solid: true };
    for (let r = 0; r <= 2; r += 0.25) {
      for (let k = 0; k < (r === 0 ? 1 : 12); k++) {
        const a = k * Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const cell = ns.map.cellAt(g.level, px, py);
        if (!cell || cell.solid) {
          continue;
        }
        probe.z = cell.fz;
        probe.floorz = cell.fz;
        if (checkPosition(g, probe, px, py) && !thingBlocking(g, probe, px, py)) {
          return { x: px, y: py };
        }
      }
    }
    return { x: x, y: y };
  }

  const ACTIONS = {
    look: function (g, mo) {
      look(g, mo);
    },
    patrol: function (g, mo) {
      // QUEEN OF THE CIRCUIT walks her route until provoked
      if (mo.provoked || g.skill >= 4) {
        look(g, mo);
        return;
      }
      const route = mo.route;
      if (!route || !route.length) {
        return;
      }
      const wp = route[mo.routeIndex || 0];
      const tx = wp.cx + 0.5;
      const ty = wp.cy + 0.5;
      if (Math.hypot(tx - mo.x, ty - mo.y) < 0.3) {
        mo.routeIndex = ((mo.routeIndex || 0) + 1) % route.length;
        return;
      }
      const want = Math.atan2(ty - mo.y, tx - mo.x);
      const sp = mo.def.speed * 4;
      let moved = false;
      for (const off of [0, 0.785, -0.785, 1.57, -1.57]) {
        if (tryMove(g, mo, mo.x + Math.cos(want + off) * sp, mo.y + Math.sin(want + off) * sp, false)) {
          mo.angle = want + off;
          moved = true;
          break;
        }
      }
      mo.patrolStuck = moved ? 0 : (mo.patrolStuck || 0) + 1;
      if (mo.patrolStuck > 8) {
        mo.patrolStuck = 0;
        mo.routeIndex = ((mo.routeIndex || 0) + 1) % route.length;
      }
    },
    chase: chase,
    face: function (g, mo) {
      faceTarget(mo);
    },
    melee: function (g, mo) {
      faceTarget(mo);
      meleeHit(g, mo);
    },
    missile: function (g, mo) {
      faceTarget(mo);
      if (mo.target) {
        sound(g, voice(mo, 'ATTACK'), mo);
        missile(g, mo, mo.def.missile, mo.target);
      }
    },
    hitscan: function (g, mo) {
      const h = mo.def.hitscan;
      faceTarget(mo);
      if (!mo.target) {
        return;
      }
      sound(g, 'SHOTGUN', mo);
      const s = slopeTo(mo, mo.target);
      for (let i = 0; i < h.pellets; i++) {
        hitscan(g, mo, mo.angle + (g.rng.next() - 0.5) * h.spread * Math.PI / 180, s, 32, rand(g, h.dmg));
      }
    },
    arc: function (g, mo) {
      faceTarget(mo);
      if (!mo.target) {
        return;
      }
      sound(g, 'PLASMA', mo);
      const r = hitscan(g, mo, mo.angle, slopeTo(mo, mo.target), 32, rand(g, mo.def.arc), 'SPRK');
      // the arc jumps to everything standing near whoever it struck
      const center = r.thing || r;
      for (const o of g.things) {
        if (o !== mo && o !== r.thing && o.shootable && !o.dead && !o.player && Math.hypot(o.x - center.x, o.y - center.y) < 2) {
          damage(g, o, mo, mo, rand(g, mo.def.arc));
        }
      }
    },
    dart: function (g, mo) {
      if (mo.target) {
        charge(g, mo, mo.def.dart, 12);
        sound(g, 'RASP_ATTACK', mo);
      }
    },
    hop: function (g, mo) {
      if (mo.target) {
        charge(g, mo, mo.def.hop, 10);
        mo.momz = 0.05;
      }
    },
    flex: function (g, mo) {
      faceTarget(mo);
      sound(g, 'GROWL_ATTACK', mo);
    },
    uppercut: function (g, mo) {
      faceTarget(mo);
      if (meleeHit(g, mo)) {
        const t = mo.target;
        const a = Math.atan2(t.y - mo.y, t.x - mo.x);
        t.momx += Math.cos(a) * 0.35;
        t.momy += Math.sin(a) * 0.35;
        sound(g, 'PUNCH_HIT', mo);
      }
    },
    passengers: function (g, mo) {
      // THE SCHOOL BUS opens its doors: a Razor and a Huffy get off
      mo.passengerTimer = 280;
      const alive = g.things.filter(function (o) { return o.bus === mo && !o.dead && !o.removed; }).length;
      if (alive >= 6) {
        return;
      }
      sound(g, 'DOOR_OPEN', mo);
      const side = mo.angle + Math.PI / 2;
      ['RAZR', 'HUFF'].forEach(function (type, k) {
        const d = mo.radius + 0.45 + k * 0.5;
        const x = mo.x + Math.cos(side) * d;
        const y = mo.y + Math.sin(side) * d;
        const o = spawn(g, type, x, y, null);
        if (!checkPosition(g, o, x, y) || thingBlocking(g, o, x, y)) {
          o.removed = true;
          return;
        }
        o.bus = mo;
        o.target = mo.target;
        g.stats.killsTotal++;
        setLabel(g, o, 'see');
      });
    },
    honk: function (g, mo) {
      sound(g, 'HONK_SIGHT', mo);
      for (const o of g.things) {
        if (o.def.kind === 'monster' && !o.dead && o.def.lane !== 'woman' && Math.hypot(o.x - mo.x, o.y - mo.y) < 12 && !o.target && g.player) {
          o.target = g.player;
          if (inLabel(o, 'spawn')) {
            setLabel(g, o, 'see');
          }
        }
      }
    },
    explode: function (g, mo) {
      const e = mo.def.explode;
      sound(g, 'ROCKET_EXPLODE', mo);
      spawn(g, 'EXPL', mo.x, mo.y, mo.z + 0.2).float = true;
      radiusAttack(g, mo, mo, e.damage, e.radius, false);
    },
    scream: function (g, mo) {
      sound(g, voice(mo, 'DEATH'), mo);
    },
    pain: function (g, mo) {
      sound(g, voice(mo, 'PAIN'), mo);
      if (mo.def.blink && !mo.dead) {
        // LIL WAYNE blinks three cells away when hurt
        for (let k = 0; k < 8; k++) {
          const a = g.rng.next() * TAU;
          const x = mo.x + Math.cos(a) * 3;
          const y = mo.y + Math.sin(a) * 3;
          if (checkPosition(g, mo, x, y) && !thingBlocking(g, mo, x, y) && checkSight(g, { x: x, y: y, z: mo.z, height: mo.height }, g.player)) {
            spawn(g, 'TFOG', mo.x, mo.y, mo.z).float = true;
            mo.x = x;
            mo.y = y;
            spawn(g, 'TFOG', x, y, mo.z).float = true;
            break;
          }
        }
      }
    },
    fall: function (g, mo) {
      mo.solid = false;
    },
    guestattack: guestAttack,
    depart: function (g, mo) {
      // a guest at zero does not die: the card flips face down and rises out of the map
      mo.shootable = false;
      mo.solid = false;
      mo.momz = 0.04;
      sound(g, 'CHIME_DEATH', mo);
      message(g, ns.defs.text.guestLeave[mo.type]);
      if (mo.def.drop) {
        const spot = freeSpot(g, mo.x, mo.y);
        const it = spawn(g, mo.def.drop, spot.x, spot.y, null);
        it.dropped = true;
      }
    },
    foreclose: function (g, mo) {
      faceTarget(mo);
      if (!mo.target) {
        return;
      }
      sound(g, 'PLASMA', mo);
      const r = hitscan(g, mo, mo.angle, slopeTo(mo, mo.target), 32, rand(g, mo.def.dmg), 'SPRK');
      if (r.thing && r.thing.player) {
        const am = r.thing.ammo;
        for (const k in am) {
          am[k] = Math.floor(am[k] * 0.9);
        }
      }
    },
    bailout: function (g, mo) {
      message(g, ns.defs.text.BAILOUT);
      mo.invulnerable = true;
      mo.unbail = 70;
    },
    weekend: function (g, mo) {
      mo.invulnerable = true;
    },
    rest: function (g, mo) {
      mo.resting = true;
      if (mo.hp < mo.def.hp && g.tic % 35 < 10) {
        mo.hp = Math.min(mo.def.hp, mo.hp + 2);
      }
    },
    cleared: function (g, mo) {
      if (mo.type === 'CRIS') {
        g.crisisCleared = true;
        message(g, ns.defs.text.CRISIS_DEAD);
        for (let k = 0; k < 3; k++) {
          const a = k * TAU / 3;
          spawn(g, 'BANK', mo.x + Math.cos(a) * 1.2, mo.y + Math.sin(a) * 1.2, null).dropped = true;
        }
        ns.level.fireTag(g, 'crisis');
      } else if (!mo.partner || mo.partner.dead) {
        ns.level.fireTag(g, 'divorce');
      }
    },
    stoinly: function (g, mo) {
      // THE STOINLY drifts toward you; when it reaches you the night is over
      const pl = g.player;
      if (!pl || pl.dead || !g.crisisCleared) {
        return;
      }
      const a = Math.atan2(pl.y - mo.y, pl.x - mo.x);
      const nx = mo.x + Math.cos(a) * mo.def.speed * 12;
      const ny = mo.y + Math.sin(a) * mo.def.speed * 12;
      const cell = ns.map.cellAt(g.level, nx, ny);
      if (cell && !cell.solid) {
        mo.x = nx;
        mo.y = ny;
      }
      g.events.push({ hum: Math.max(0, 1 - dist2d(mo, pl) / 12) });
      if (dist2d(mo, pl) < mo.radius + pl.radius) {
        g.finale = true;
      }
    }
  };

  // ------------------------------------------------------------------ per-tic thinking

  function tickThing(g, mo) {
    mo.px = mo.x;
    mo.py = mo.y;
    mo.pz = mo.z;
    if (mo.missile) {
      moveMissile(g, mo);
    } else if (mo.momx || mo.momy) {
      // momentum: knockback, charges and hops
      const nx = mo.x + mo.momx;
      const ny = mo.y + mo.momy;
      if (!tryMove(g, mo, nx, ny, true)) {
        if (mo.charging && posOut.blocker === mo.target && mo.target) {
          damage(g, mo.target, mo, mo, rand(g, mo.def.melee || [3, 9]));
          sound(g, 'PUNCH_HIT', mo);
        }
        if (!tryMove(g, mo, nx, mo.y, true)) {
          mo.momx = 0;
        }
        if (!tryMove(g, mo, mo.x, ny, true)) {
          mo.momy = 0;
        }
        if (mo.charging) {
          mo.charging = 0;
          mo.momx = mo.momy = 0;
        }
      }
      if (mo.charging) {
        if (--mo.charging <= 0) {
          mo.charging = 0;
          mo.momx *= 0.2;
          mo.momy *= 0.2;
        }
      } else {
        mo.momx *= FRICTION;
        mo.momy *= FRICTION;
        if (Math.abs(mo.momx) < 0.001) {
          mo.momx = 0;
        }
        if (Math.abs(mo.momy) < 0.001) {
          mo.momy = 0;
        }
      }
    }
    // gravity
    if (!mo.missile && !mo.float) {
      if (mo.z > mo.floorz) {
        mo.momz -= GRAVITY;
        mo.z += mo.momz;
        if (mo.z <= mo.floorz) {
          mo.z = mo.floorz;
          mo.momz = 0;
        }
      } else {
        mo.z = mo.floorz;
        mo.momz = 0;
      }
    } else if (mo.float && !mo.missile && mo.def.kind === 'monster') {
      // floating guests keep their hover height over whatever floor is below
      const want = mo.floorz + (mo.def.float || 1.0) + (mo.dead ? 0 : Math.sin((g.tic + mo.id * 9) * 0.08) * 0.04);
      if (mo.dead) {
        mo.z += mo.momz;
      } else {
        mo.z += (want - mo.z) * 0.1;
      }
    } else if (mo.float && !mo.missile && mo.momz) {
      mo.z += mo.momz;
    }
    // stand on the floor of whatever cells it overlaps (lifts, stairs, steps)
    if (!mo.missile && !mo.float) {
      let floor = -Infinity;
      forCells(g, mo.x, mo.y, mo.radius, function (cell) {
        if (cell && !cell.solid) {
          floor = Math.max(floor, cell.fz);
        }
      });
      if (floor > -Infinity) {
        if (floor > mo.z && floor - mo.z <= STEP + 0.01) {
          mo.z = floor;
        }
        mo.floorz = floor;
      }
    }
    if (mo.def.kind === 'monster' && !mo.dead && !mo.player) {
      if (mo.moving && inLabel(mo, 'see')) {
        moveMonster(g, mo);
      }
      if (mo.burst) {
        tickBurst(g, mo);
      }
      if (mo.rant) {
        tickRant(g, mo);
      }
      if (mo.passengerTimer > 0) {
        mo.passengerTimer--;
      }
      if (mo.unbail > 0 && --mo.unbail === 0) {
        mo.invulnerable = false;
      }
      if (mo.weekendTimer !== undefined && mo.weekendTimer !== Infinity && mo.target && !inLabel(mo, 'spawn')) {
        if (--mo.weekendTimer <= 0 && mo.active) {
          ns.level.swapWeekend(g, mo);
        }
      }
    }
    // the state clock
    if (mo.tics > 0) {
      mo.tics--;
      if (mo.tics === 0) {
        const st = mo.def.stateList[mo.si];
        setState(g, mo, st.next);
      }
    }
  }

  function tick(g) {
    if (g.fx && g.fx.length > 256) {
      g.fx.splice(0, g.fx.length - 256);
    }
    const list = g.things;
    for (let i = 0; i < list.length; i++) {
      const mo = list[i];
      if (mo.removed || mo.player) {
        continue;
      }
      tickThing(g, mo);
    }
    if (g.tic % 35 === 0) {
      g.things = g.things.filter(function (mo) { return !mo.removed; });
    }
  }

  ns.world = {
    STEP: STEP,
    GRAVITY: GRAVITY,
    FRICTION: FRICTION,
    spawn: spawn,
    remove: remove,
    setState: setState,
    setLabel: setLabel,
    inLabel: inLabel,
    tryMove: tryMove,
    checkPosition: checkPosition,
    thingBlocking: thingBlocking,
    checkSight: checkSight,
    trace: trace,
    aimSlope: aimSlope,
    hitscan: hitscan,
    missile: missile,
    radiusAttack: radiusAttack,
    damage: damage,
    kill: kill,
    tick: tick,
    tickThing: tickThing,
    sound: sound,
    message: message,
    rand: rand,
    forCells: forCells,
    posOut: posOut,
    provoke: provoke
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
