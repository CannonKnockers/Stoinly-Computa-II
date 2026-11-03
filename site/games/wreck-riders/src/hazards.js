/* Wreck Riders - level objects: builders, per-frame updates and contact handlers. DOM-free. */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const P = WR.physics, U = WR.util;
  const V = P.v;
  const H = WR.hazards = { build: {}, handle: {} };
  const B = H.build;
  const CHAIN_GROUP = -77;

  /** Bodies of a hazard with `triggerX` start static and drop when the rider passes that x. */
  function triggerUpdate(sim, h) {
    if (h.def.triggerX == null || h.triggered) return;
    if (sim.focusX() >= h.def.triggerX) {
      h.triggered = true;
      for (const b of h.bodies) { b.setType('dynamic'); b.setAwake(true); }
      if (h.def.kick) P.addVelocity(h.bodies, h.def.kick[0], h.def.kick[1]);
      sim.emit('sfx', { name: 'release', x: h.bodies[0].getPosition().x, y: h.bodies[0].getPosition().y });
    }
  }
  function initialType(d) { return d.triggerX != null ? 'static' : 'dynamic'; }

  /* ---------- scenery ---------- */
  B.terrain = (sim, d) => {
    P.chain(sim.groundBody, d.pts, { friction: d.friction != null ? d.friction : 0.9 });
    // fill: true/'below' (solid ground under the line), 'above' (a ceiling), 'slab' (a 1.6 m thick ledge), false (line only)
    sim.terrain.push({ pts: d.pts, style: d.style || 'dirt', fill: d.fill === undefined ? 'slab' : d.fill });
    return null;
  };
  B.platform = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'platform', style: d.style || 'steel' } });
    P.box(b, d.w / 2, d.h / 2, { friction: d.friction != null ? d.friction : 0.8 });
    return { type: 'platform', def: d, body: b, w: d.w, h: d.h };
  };
  B.ramp = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'ramp', style: d.style || 'wood' } });
    P.poly(b, d.pts, { friction: 0.8 });
    return { type: 'ramp', def: d, body: b, pts: d.pts };
  };
  B.crate = (sim, d) => {
    const b = P.body(sim.world, { type: initialType(d), x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'crate', style: d.style || 'wood' } });
    P.box(b, d.w / 2, d.h / 2, { density: d.density || 8, friction: 0.6, cat: P.CAT.DEBRIS });
    return { type: 'crate', def: d, body: b, bodies: [b], w: d.w, h: d.h, update(dt) { triggerUpdate(sim, this); } };
  };
  B.ball = (sim, d) => {
    const b = P.body(sim.world, { type: initialType(d), x: d.x, y: d.y, ud: { kind: 'ball', style: d.style || 'log' } });
    P.circle(b, d.r, { density: d.density || 60, friction: 0.9, cat: P.CAT.DEBRIS });
    return { type: 'ball', def: d, body: b, bodies: [b], r: d.r, update(dt) { triggerUpdate(sim, this); } };
  };
  B.sign = (sim, d) => { sim.decor.push({ type: 'sign', x: d.x, y: d.y, text: d.text }); return null; };
  B.finish = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, ud: { kind: 'finish' } });
    P.box(b, 0.5, 3, { sensor: true, center: [0, -3], ud: { hazard: 'finish' } });
    sim.finish = { x: d.x, y: d.y };
    return { type: 'finish', def: d, body: b, x: d.x, y: d.y };
  };

  /* ---------- hazards ---------- */
  B.spikes = (sim, d) => {
    const n = d.n || 6;
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'spikes' } });
    const h = { type: 'spikes', def: d, body: b, n };
    P.box(b, n * 0.15, 0.06, { center: [0, 0.06], friction: 0.6 });
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * 0.3;
      P.poly(b, [[cx - 0.14, 0], [cx + 0.14, 0], [cx, -0.48]], { friction: 0.9, ud: { hazard: 'spike', ref: h } });
    }
    return h;
  };
  B.wrecking = (sim, d) => {
    const len = d.len || 5, r = d.r || 0.8, a = d.a || 0;
    const anchor = P.body(sim.world, { type: 'static', x: d.x, y: d.y, ud: { kind: 'anchor' } });
    const dx = Math.sin(a), dy = Math.cos(a);
    const linkLen = 0.4, nLinks = Math.max(2, Math.round(len / linkLen));
    const links = [];
    let prev = anchor, prevPt = V(d.x, d.y);
    const ang = U.dirToAngle(dx, dy);
    for (let i = 0; i < nLinks; i++) {
      const cx = d.x + dx * (linkLen * (i + 0.5)), cy = d.y + dy * (linkLen * (i + 0.5));
      const l = P.body(sim.world, { x: cx, y: cy, angle: ang, ud: { kind: 'link' } });
      P.box(l, 0.05, linkLen / 2, { density: 200, friction: 0.4, group: CHAIN_GROUP, cat: P.CAT.HAZARD });
      P.revolute(sim.world, prev, l, prevPt, {});
      links.push(l);
      prev = l; prevPt = V(d.x + dx * linkLen * (i + 1), d.y + dy * linkLen * (i + 1));
    }
    const bx = d.x + dx * (len + r), by = d.y + dy * (len + r);
    const ball = P.body(sim.world, { x: bx, y: by, ud: { kind: 'wreckball' }, bullet: true });
    P.circle(ball, r, { density: d.density || 150, friction: 0.5, restitution: 0.1, group: CHAIN_GROUP, cat: P.CAT.HAZARD });
    P.revolute(sim.world, prev, ball, prevPt, {});
    P.rope(sim.world, anchor, ball, V(d.x, d.y), V(bx, by), len + r + 0.05);
    return { type: 'wrecking', def: d, anchor: [d.x, d.y], links, ball, r, bodies: links.concat([ball]) };
  };
  B.harpoon = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, ud: { kind: 'turret' } });
    // The turret and its own harpoons share a negative group, so a harpoon never hits the turret it leaves.
    const group = sim.nextGroup();
    P.box(b, 0.4, 0.3, { friction: 0.6, center: [0, 0.1], group });
    const h = {
      type: 'harpoon', def: d, body: b, x: d.x, y: d.y, aim: d.dir === 'left' ? Math.PI : 0, cool: d.delay != null ? d.delay : 1.2,
      range: d.range || 26, cooldown: d.cooldown || 2.6, shots: 0, muzzleLen: 0.9,
      update(dt) {
        this.cool -= dt;
        const rd = sim.rider;
        const alive = rd.alive || (sim.deathTime != null && sim.clock - sim.deathTime < 3);
        const tb = rd.isConnected(rd.parts.torso) ? rd.parts.torso.body : rd.parts.head.body;
        const tp = tb.getPosition();
        const ddx = tp.x - this.x, ddy = tp.y - (this.y - 0.2);
        const dist = Math.hypot(ddx, ddy);
        if (dist > this.range) return;
        if (d.dir === 'left' && ddx > 0) return;
        if (d.dir === 'right' && ddx < 0) return;
        // line of sight
        let clear = false, hitFrac = 1;
        const from = V(this.x, this.y - 0.2);
        sim.world.rayCast(from, tp, (fixture, point, normal, fraction) => {
          if (fixture.isSensor() || fixture.getBody() === this.body) return -1;
          const ud = P.ud(fixture.getBody());
          clear = !!(ud && (ud.kind === 'part' || ud.kind === 'vehicle'));
          hitFrac = fraction;
          return fraction;
        });
        if (!clear) return;
        const tv = tb.getLinearVelocity();
        const lead = dist / 38;
        const ax = ddx + tv.x * lead, ay = ddy + tv.y * lead + 0.5 * P.GRAVITY * 0.3 * lead * lead * -1;
        this.aim = Math.atan2(ay, ax);
        if (!alive || this.cool > 0) return;
        this.cool = this.cooldown;
        this.fire(sim);
      },
      fire(sim) {
        const ca = Math.cos(this.aim), sa = Math.sin(this.aim);
        const mx = this.x + ca * this.muzzleLen, my = this.y - 0.2 + sa * this.muzzleLen;
        const proj = { t: 0, stuck: false, turret: this, len: 1.2 };
        const pb = P.body(sim.world, { x: mx, y: my, angle: this.aim, bullet: true, gravityScale: 0.3, ud: { kind: 'projectile', ref: proj } });
        P.box(pb, 0.6, 0.035, { density: 50, friction: 0.4, cat: P.CAT.PROJECTILE, mask: P.ALL & ~P.CAT.PROJECTILE, group, ud: { hazard: 'harpoon', ref: proj } });
        pb.setLinearVelocity(V(ca * 38, sa * 38));
        proj.body = pb;
        sim.projectiles.push(proj);
        this.shots++;
        sim.emit('sfx', { name: 'harpoon', x: mx, y: my });
        sim.gore.smoke(mx, my, 3, 0.25);
      },
    };
    return h;
  };
  B.mine = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, ud: { kind: 'mine' } });
    const h = { type: 'mine', def: d, body: b, x: d.x, y: d.y, armed: true, radius: d.radius || 5.5, power: d.power || 15 };
    P.box(b, 0.26, 0.1, { sensor: true, center: [0, -0.1], ud: { hazard: 'mine', ref: h } });
    return h;
  };
  B.boost = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'boost' } });
    const h = { type: 'boost', def: d, body: b, x: d.x, y: d.y, a: d.a || 0, speed: d.speed || 24, cool: 0, update(dt) { if (this.cool > 0) this.cool -= dt; } };
    P.box(b, 0.8, 0.18, { sensor: true, center: [0, -0.18], ud: { hazard: 'boost', ref: h } });
    return h;
  };
  B.glass = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'glass' } });
    const h = { type: 'glass', def: d, body: b, w: d.w, h: d.h, broken: false };
    P.box(b, d.w / 2, d.h / 2, { friction: 0.2, ud: { hazard: 'glass', ref: h } });
    return h;
  };
  B.tramp = (sim, d) => {
    const b = P.body(sim.world, { type: 'static', x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'tramp' } });
    const h = { type: 'tramp', def: d, body: b, w: d.w || 3 };
    P.box(b, (d.w || 3) / 2, 0.1, { center: [0, -0.1], restitution: d.bounce || 1.4, friction: 0.3, ud: { hazard: 'tramp', ref: h } });
    return h;
  };
  B.blade = (sim, d) => {
    const b = P.body(sim.world, { type: 'kinematic', x: d.x, y: d.y, ud: { kind: 'blade' } });
    const h = { type: 'blade', def: d, body: b, r: d.r || 1.1, t: 0, update(dt) { this.t += dt; moverStep(this, dt); } };
    P.circle(b, h.r, { friction: 0.9, ud: { hazard: 'blade', ref: h } });
    b.setAngularVelocity(d.speed || 9);
    return h;
  };
  function moverStep(h, dt) {
    const d = h.def;
    if (!d.period || (!d.dx && !d.dy)) return;
    const w = U.TAU / d.period;
    const s = 0.5 - 0.5 * Math.cos(w * h.t);
    const tx = d.x + (d.dx || 0) * s, ty = d.y + (d.dy || 0) * s;
    const vx = (d.dx || 0) * 0.5 * Math.sin(w * h.t) * w, vy = (d.dy || 0) * 0.5 * Math.sin(w * h.t) * w;
    const p = h.body.getPosition();
    h.body.setLinearVelocity(V(vx + (tx - p.x) * 4, vy + (ty - p.y) * 4));
  }
  B.mover = (sim, d) => {
    const b = P.body(sim.world, { type: 'kinematic', x: d.x, y: d.y, ud: { kind: 'mover', style: d.style || 'steel' } });
    const h = { type: 'mover', def: d, body: b, w: d.w, h: d.h, t: d.phase || 0, update(dt) { this.t += dt; moverStep(this, dt); } };
    P.box(b, d.w / 2, d.h / 2, { friction: 0.9 });
    return h;
  };
  B.rotator = (sim, d) => {
    const b = P.body(sim.world, { type: 'kinematic', x: d.x, y: d.y, angle: d.a || 0, ud: { kind: 'rotator', style: 'steel' } });
    P.box(b, d.len / 2, 0.12, { friction: 0.6 });
    b.setAngularVelocity(d.speed || 2);
    return { type: 'rotator', def: d, body: b, len: d.len };
  };
  B.seesaw = (sim, d) => {
    const pivot = P.body(sim.world, { type: 'static', x: d.x, y: d.y, ud: { kind: 'pivot' } });
    P.poly(pivot, [[-0.35, 0], [0.35, 0], [0, -0.55]], { friction: 0.6 });
    const len = d.len || 5;
    const plank = P.body(sim.world, { x: d.x, y: d.y - 0.62, angle: d.a || 0, ud: { kind: 'plank', style: 'wood' } });
    P.box(plank, len / 2, 0.07, { density: 25, friction: 0.8, cat: P.CAT.DEBRIS });
    P.revolute(sim.world, pivot, plank, V(d.x, d.y - 0.62), { enableLimit: true, lowerAngle: -0.6, upperAngle: 0.6 });
    return { type: 'seesaw', def: d, plank, pivot: [d.x, d.y], len };
  };
  B.van = (sim, d) => {
    const type = initialType(d);
    const body = P.body(sim.world, { type, x: d.x, y: d.y - 1.3, ud: { kind: 'van', style: d.color || '#d8d2c0' } });
    P.box(body, 1.75, 0.8, { density: 40, friction: 0.5, cat: P.CAT.DEBRIS });
    const wheels = [];
    for (const wx of [-1.1, 1.1]) {
      const w = P.body(sim.world, { type, x: d.x + wx, y: d.y - 0.42, ud: { kind: 'vanwheel' } });
      P.circle(w, 0.42, { density: 20, friction: 0.9, cat: P.CAT.DEBRIS });
      P.revolute(sim.world, body, w, w.getPosition(), {});
      wheels.push(w);
    }
    return { type: 'van', def: d, body, wheels, bodies: [body].concat(wheels), update(dt) { triggerUpdate(sim, this); } };
  };

  /* ---------- glass shattering ---------- */
  H.shatter = function (sim, h, ev) {
    if (h.broken) return;
    h.broken = true;
    const body = h.body, p = body.getPosition(), ang = body.getAngle();
    const ov = ev ? ev.otherVel : [0, 0];
    sim.world.destroyBody(body);
    const cols = U.clamp(Math.round(h.w / 0.35), 1, 6), rows = U.clamp(Math.round(h.h / 0.35), 1, 6);
    const cw = h.w / cols, ch = h.h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const lx = -h.w / 2 + cw * (i + 0.5), ly = -h.h / 2 + ch * (j + 0.5);
      const wp = U.rot(lx, ly, ang);
      const s = P.body(sim.world, { x: p.x + wp[0], y: p.y + wp[1], angle: ang, ud: { kind: 'shard' } });
      P.box(s, cw * 0.4, ch * 0.4, { density: 12, friction: 0.3, cat: P.CAT.DEBRIS });
      s.setLinearVelocity(V(ov[0] * 0.5 + sim.rand(-3, 3), ov[1] * 0.5 + sim.rand(-4, 1)));
      s.setAngularVelocity(sim.rand(-12, 12));
      sim.timed.push({ body: s, t: sim.rand(4, 7) });
    }
    sim.gore.glassBits(p.x, p.y, 28, ov[0], ov[1]);
    sim.emit('sfx', { name: 'glass', x: p.x, y: p.y });
  };

  /* ---------- contact handlers (run after the step, outside callbacks) ---------- */
  const Hd = H.handle;
  Hd.spike = (sim, ev) => {
    const bud = P.ud(ev.otherBody);
    if (!bud) return;
    if (bud.kind === 'part') {
      const part = bud.part, rd = part.ragdoll, sp = ev.speed;
      if (sp < 2.5) return;
      rd.wound(part, ev.x, ev.y, 12 + sp * 3.5, 'spike');
      sim.emit('sfx', { name: 'spikes', x: ev.x, y: ev.y, intensity: sp });
      if (part.kind === 'head' && sp > 4) rd.kill('impaled through the head');
      if (sp > 5.5 && !rd.attach.some((a) => !a.broken && a.tag === 'impale' && a.part === part)) {
        const spikeBody = ev.fixture.getBody();
        const j = P.revolute(sim.world, spikeBody, part.body, V(ev.x, ev.y), { collideConnected: true });
        rd.attach.push({ name: 'impale', joint: j, part, body: spikeBody, breakForce: 2600 * rd.scale * rd.scale, broken: false, tag: 'impale' });
        rd.regrouped = rd.regrouped; // impaled riders keep their current group
      }
    } else if (bud.kind === 'vehicle' && ev.speed > 3) {
      sim.emit('sfx', { name: 'clank', x: ev.x, y: ev.y, intensity: ev.speed });
    }
  };
  Hd.blade = (sim, ev) => {
    const bud = P.ud(ev.otherBody);
    if (!bud) return;
    if (bud.kind === 'part') {
      const part = bud.part, rd = part.ragdoll;
      if (part.lastBlade != null && sim.clock - part.lastBlade < 0.3) return;
      part.lastBlade = sim.clock;
      rd.wound(part, ev.x, ev.y, 35, 'blade');
      if (part.name === 'pelvis') {
        for (const n of ['hipL', 'hipR']) if (!rd.joints[n].broken) rd.sever(rd.joints[n], 'blade');
        rd.kill('sawn in half');
      } else if (part.parentJoint && !part.parentJoint.broken) {
        rd.sever(part.parentJoint, 'blade');
      }
      if (part.kind === 'head') rd.kill('decapitated');
      sim.emit('sfx', { name: 'blade', x: ev.x, y: ev.y });
    } else if (bud.kind === 'vehicle' || bud.kind === 'shard' || bud.kind === 'crate') {
      sim.gore.sparks(ev.x, ev.y, 6, 0, -2);
      sim.emit('sfx', { name: 'grind', x: ev.x, y: ev.y });
    }
  };
  Hd.mine = (sim, ev) => {
    const h = ev.ref;
    if (!h.armed || !ev.otherBody.isDynamic()) return;
    h.armed = false;
    sim.explode(h.x, h.y - 0.1, h.radius, h.power);
    sim.world.destroyBody(h.body);
  };
  Hd.boost = (sim, ev) => {
    const h = ev.ref;
    if (h.cool > 0) return;
    const bodies = H.launchBodies(ev.otherBody);
    if (!bodies) return;
    const dx = Math.cos(h.a), dy = Math.sin(h.a);
    for (const b of bodies) {
      const v = b.getLinearVelocity();
      const along = v.x * dx + v.y * dy;
      if (along < h.speed) b.setLinearVelocity(V(v.x + (h.speed - along) * dx, v.y + (h.speed - along) * dy));
    }
    h.cool = 0.5;
    sim.emit('sfx', { name: 'boost', x: h.x, y: h.y });
  };
  /** Which bodies a pad or trampoline moves when `body` touches it: the whole vehicle with attached riders
   *  when the vehicle (or a rider part still joined to its attached rider) touches; a loose rider's connected
   *  bodies; or just the one body for a severed limb or a vehicle-less object. Null for anything else. */
  H.launchBodies = (body) => {
    const bud = P.ud(body);
    if (!bud) return null;
    if (bud.vehicle) return bud.vehicle.assemblyBodies();
    if (bud.part) {
      const rd = bud.part.ragdoll;
      if (!rd.isConnected(bud.part)) return [body];
      if (rd.vehicle && rd.isAttached()) return rd.vehicle.assemblyBodies();
      return rd.connectedBodies();
    }
    return null;
  };
  /** Cooldown key for launchBodies: one per vehicle assembly, ragdoll or loose limb. */
  H.launchKey = (body) => {
    const bud = P.ud(body);
    if (bud.vehicle) return bud.vehicle;
    const rd = bud.part.ragdoll;
    if (!rd.isConnected(bud.part)) return body;
    return rd.vehicle && rd.isAttached() ? rd.vehicle : rd;
  };
  /** True when a body moving at `speed` (m/s, relative to the pane) breaks glass. Shared by the contact
   *  handler and Sim's pre-solve hook, which lets a breaking body pass through instead of being stopped
   *  by the pane in the same step it shatters. */
  H.glassBreaks = (otherBody, speed) => {
    const bud = P.ud(otherBody);
    const heavy = bud && (bud.kind === 'wreckball' || bud.kind === 'van' || bud.kind === 'ball');
    return speed >= 4 || !!heavy;
  };
  Hd.glass = (sim, ev) => {
    const h = ev.ref;
    if (h.broken) return;
    if (!H.glassBreaks(ev.otherBody, ev.speed)) return;
    H.shatter(sim, h, ev);
  };
  /** Restitution alone only bounces the one light body that touches the mat (a wheel, a hand), and the
   *  rest of the assembly soaks it up, or spins around it. So vehicle and rider contacts with the mat are
   *  inelastic (Sim.onPreSolve), and here the whole vehicle (with attached riders), or a loose ragdoll, gets
   *  back its motion from before the step, with the speed along the mat normal set to `bounce` times the
   *  incoming normal speed of their centre of mass. */
  Hd.tramp = (sim, ev) => {
    const h = ev.ref;
    if (ev.speed > 3) sim.emit('sfx', { name: 'tramp', x: ev.x, y: ev.y, intensity: ev.speed });
    const bodies = H.launchBodies(ev.otherBody);
    if (!bodies) return;
    const key = H.launchKey(ev.otherBody);
    const n = U.rot(0, -1, h.body.getAngle());
    // Incoming speed of the launched bodies' centre of mass (before the step), not of the one body that touched:
    // a pogo foot snapping down on its spring can move far faster than the rider and would fling them into the sky.
    let M = 0, cvx = 0, cvy = 0;
    for (const b of bodies) { const m = b.getMass(), pv = sim.prevVel.get(b), v = pv ? { x: pv[0], y: pv[1] } : b.getLinearVelocity(); M += m; cvx += v.x * m; cvy += v.y * m; }
    const vin = M > 0 ? -(cvx * n[0] + cvy * n[1]) / M : -(ev.otherVel[0] * n[0] + ev.otherVel[1] * n[1]);
    if (vin < 2) return;
    h.cool = h.cool || new Map();
    if (h.cool.get(key) > sim.clock) return;
    h.cool.set(key, sim.clock + 0.25);
    const out = Math.min(vin * (h.def.bounce || 1.4), 30);
    for (const b of bodies) {
      const pv = sim.prevVel.get(b);
      const vx = pv ? pv[0] : b.getLinearVelocity().x, vy = pv ? pv[1] : b.getLinearVelocity().y;
      const along = vx * n[0] + vy * n[1];
      b.setLinearVelocity(V(vx + (out - along) * n[0], vy + (out - along) * n[1]));
      if (pv) b.setAngularVelocity(pv[2]);
    }
  };
  Hd.finish = (sim, ev) => {
    const bud = P.ud(ev.otherBody);
    if (!bud) return;
    const rd = bud.kind === 'part' ? bud.part.ragdoll : null;
    if (rd && rd.isMain && rd.alive && rd.isConnected(bud.part)) sim.win();
  };
  Hd.harpoon = (sim, ev) => {
    const proj = ev.ref;
    if (proj.stuck) return;
    const ob = ev.otherBody, bud = P.ud(ob);
    if (bud && bud.kind === 'projectile') return;
    if (bud && bud.kind === 'part') {
      const part = bud.part, rd = part.ragdoll;
      proj.stuck = true; proj.stuckTo = ob;
      proj.body.setBullet(false);
      rd.wound(part, ev.x, ev.y, 45, 'harpoon');
      if (part.kind === 'head') rd.kill('harpooned through the head');
      P.weld(sim.world, ob, proj.body, V(ev.x, ev.y));
      sim.emit('sfx', { name: 'stab', x: ev.x, y: ev.y });
      return;
    }
    // Sensors (finish line, pads, mines) are not hit, and glass shatters and lets the harpoon fly on.
    if (ev.other.isSensor()) return;
    const ofd = P.fud(ev.other);
    if (ofd && ofd.hazard === 'glass') return;
    proj.stuck = true;
    if (ob.isStatic()) { proj.body.setType('static'); }
    else { proj.body.setBullet(false); P.weld(sim.world, ob, proj.body, V(ev.x, ev.y)); }
    sim.emit('sfx', { name: 'thunk', x: ev.x, y: ev.y });
  };
})();
