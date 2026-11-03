/* Wreck Riders - one level run: world, level objects, the ride, damage, win/death. DOM-free. */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const P = WR.physics, U = WR.util;
  const V = P.v;

  class Sim {
    constructor(o) {
      this.level = o.level;
      this.charDef = o.character;
      this.events = new U.Emitter();
      this.world = P.createWorld();
      this.gore = new WR.Gore(this);
      this.hazards = []; this.terrain = []; this.decor = []; this.projectiles = []; this.timed = []; this.timers = [];
      this.time = 0; this.afterTime = 0; this.frame = 0;
      this.status = 'playing'; this.deathTime = null; this.winTime = null; this.cause = null; this.shake = 0;
      this.groupCounter = 0;
      // Every random choice that feeds back into physics goes through this seeded generator, so a run is reproducible
      // from (level, character, seed, inputs). Purely visual randomness (blood drops, smoke) keeps using Math.random.
      this.seed = o.seed != null ? (o.seed >>> 0) : ((Math.random() * 4294967296) >>> 0);
      this.random = U.seeded(this.seed);
      this.queue = []; this.touch = new Map(); this.prevVel = new Map(); this.thuds = [];
      this.finish = null;
      this.groundBody = P.body(this.world, { type: 'static', x: 0, y: 0, ud: { kind: 'ground' } });
      this.buildLevel();
      this.spawn();
      this.world.on('begin-contact', (c) => this.onBeginContact(c));
      this.world.on('post-solve', (c, imp) => this.onPostSolve(c, imp));
      this.world.on('pre-solve', (c) => this.onPreSolve(c));
      this.events.on('death', (d) => {
        if (d.ragdoll.isMain && this.status === 'playing') { this.status = 'dead'; this.deathTime = this.time; this.cause = d.cause; }
      });
    }
    nextGroup() { return -(++this.groupCounter); }
    emit(name, data) { this.events.emit(name, data || {}); }

    buildLevel() {
      const L = this.level;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pts of L.ground) {
        P.chain(this.groundBody, pts, { friction: 0.9 });
        this.terrain.push({ pts, style: 'dirt', fill: true });
        for (const p of pts) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      }
      this.bounds = { minX, maxX, minY, maxY };
      this.deathY = L.deathY != null ? L.deathY : maxY + 30;
      for (const d of L.objects || []) {
        const builder = WR.hazards.build[d.t];
        if (!builder) { if (g.console) console.warn('unknown level object', d.t); continue; }
        const h = builder(this, d);
        if (h) { if (!h.def) h.def = d; this.hazards.push(h); }
      }
    }
    spawn() {
      const [sx, sy] = this.level.start;
      this.vehicle = WR.vehicles.create(this, this.charDef, sx, sy);
      this.rider = this.vehicle.rider;
      this.ragdolls = this.vehicle.riders;
      this.startX = sx;
    }
    focusBody() { return this.rider.parts.torso.body; }
    focusX() { return this.focusBody().getPosition().x; }
    /** Seconds since the run began, still running after a death or finish (sim.time stops there). Hazard
     *  cooldowns use this. deathTime is taken while afterTime is 0, so it is on this clock too. */
    get clock() { return this.time + this.afterTime; }
    get progress() {
      const fx = this.finish ? this.finish.x : this.bounds.maxX;
      return U.clamp((this.focusX() - this.startX) / Math.max(1, fx - this.startX), 0, 1);
    }

    update(dt, input) {
      if (this.status === 'playing') this.time += dt; else this.afterTime += dt;
      const sub = dt / P.SUBSTEPS;
      this.touch.clear(); this.queue.length = 0; this.thuds.length = 0;
      this.vehicle.update(this.status === 'playing' ? input : null, dt);
      this.prevVel.clear();
      // Velocities before the step: impact damage (dv) reads the ragdoll entries, trampolines read all of them.
      const keep = (b) => { const v = b.getLinearVelocity(); this.prevVel.set(b, [v.x, v.y, b.getAngularVelocity()]); };
      for (const rd of this.ragdolls) for (const b of rd.allBodies()) keep(b);
      for (const b of this.vehicle.bodies) keep(b);
      for (let s = 0; s < P.SUBSTEPS; s++) this.world.step(sub, P.VEL_ITERS, P.POS_ITERS);
      this.processImpacts();
      this.processQueue();
      for (const rd of this.ragdolls) rd.update(dt, 1 / sub);
      for (const h of this.hazards) if (h.update) h.update(dt);
      this.updateProjectiles(dt);
      for (let i = this.timed.length - 1; i >= 0; i--) {
        const t = this.timed[i]; t.t -= dt;
        if (t.t <= 0) { this.world.destroyBody(t.body); this.timed.splice(i, 1); }
      }
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i]; t.t -= dt;
        if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
      }
      this.gore.update(dt);
      if (this.rider.alive && this.focusBody().getPosition().y > this.deathY) this.rider.kill('fell out of the world');
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);
      this.frame++;
    }

    onBeginContact(c) {
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      const ua = P.fud(fa), ub = P.fud(fb);
      const ha = ua && ua.hazard, hb = ub && ub.hazard;
      if (!ha && !hb) return;
      let x = null, y = null;
      const wm = c.getWorldManifold(null);
      if (wm && wm.pointCount > 0) { x = wm.points[0].x; y = wm.points[0].y; }
      const push = (hf, of) => {
        const hud = P.fud(hf);
        const ob = of.getBody(), hb2 = hf.getBody();
        const ov = ob.getLinearVelocity(), hv = hb2.getLinearVelocity();
        let px = x, py = y;
        if (px == null) { const p = ob.getPosition(); px = p.x; py = p.y; }
        this.queue.push({ type: hud.hazard, ref: hud.ref, fixture: hf, other: of, otherBody: ob, x: px, y: py, speed: Math.hypot(ov.x - hv.x, ov.y - hv.y), otherVel: [ov.x, ov.y] });
      };
      if (ha) push(fa, fb);
      if (hb) push(fb, fa);
    }
    /** Glass that is about to break does not push back: the contact is disabled for this step and the
     *  begin-contact queue entry shatters the pane after the step. Trampolines: see below. */
    onPreSolve(c) {
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      const ua = P.fud(fa), ub = P.fud(fb);
      // Trampolines: vehicles and riders land inelastically and the tramp handler then launches the whole
      // assembly uniformly. Restitution on the single touching body would spin the vehicle instead.
      const tf = ua && ua.hazard === 'tramp' ? fa : ub && ub.hazard === 'tramp' ? fb : null;
      if (tf) {
        // only bodies the tramp handler launches land inelastically (a severed limb is launched on its own)
        const od = P.fud(tf === fa ? fb : fa);
        if (od && (od.vehicle || od.part)) c.setRestitution(0);
        return;
      }
      const gf = ua && ua.hazard === 'glass' ? fa : ub && ub.hazard === 'glass' ? fb : null;
      if (!gf || gf.getUserData().ref.broken) return;
      const ob = (gf === fa ? fb : fa).getBody(), ov = ob.getLinearVelocity();
      if (WR.hazards.glassBreaks(ob, Math.hypot(ov.x, ov.y))) {
        c.setEnabled(false);
        // A body already resting on the pane gets no new begin-contact when it speeds up, so queue the break here
        // too (shatter ignores a pane that is already broken).
        const wm = c.getWorldManifold(null), p0 = wm && wm.pointCount > 0 ? wm.points[0] : ob.getPosition();
        const gud = gf.getUserData();
        this.queue.push({ type: 'glass', ref: gud.ref, fixture: gf, other: gf === fa ? fb : fa, otherBody: ob, x: p0.x, y: p0.y, speed: Math.hypot(ov.x, ov.y), otherVel: [ov.x, ov.y] });
      }
    }
    onPostSolve(c, imp) {
      let m = 0;
      const ni = imp.normalImpulses;
      for (let i = 0; i < ni.length; i++) if (ni[i] > m) m = ni[i];
      if (m < 0.5) return;
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      let x = null, y = null;
      const point = () => {
        if (x == null) {
          const wm = c.getWorldManifold(null);
          if (wm && wm.pointCount > 0) { x = wm.points[0].x; y = wm.points[0].y; }
          else { const p = fa.getBody().getPosition(); x = p.x; y = p.y; }
        }
      };
      const rec = (f, other) => {
        const ud = P.fud(f);
        if (!ud || !ud.part) return;
        const cur = this.touch.get(ud.part);
        if (cur && m <= cur.I) return;
        point();
        this.touch.set(ud.part, { I: m, x, y, other });
      };
      rec(fa, fb); rec(fb, fa);
      if (m > 20 && this.thuds.length < 4) {
        point();
        const ka = P.ud(fa.getBody()), kb = P.ud(fb.getBody());
        this.thuds.push({ I: m, x, y, a: ka && ka.kind, b: kb && kb.kind });
      }
    }
    processImpacts() {
      for (const [part, info] of this.touch) {
        const b = part.body;
        const pv = this.prevVel.get(b);
        if (!pv) continue;
        const v = b.getLinearVelocity();
        const dv = Math.hypot(v.x - pv[0], v.y - pv[1]);
        part.ragdoll.impact(part, dv, info.x, info.y);
      }
      for (const t of this.thuds) this.emit('thud', t);
    }
    processQueue() {
      for (const ev of this.queue) {
        const h = WR.hazards.handle[ev.type];
        if (h) h(this, ev);
      }
    }
    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.t += dt;
        const gone = (!p.stuck && p.t > 8) || p.t > 30 || p.body.getPosition().y > this.deathY;
        if (gone) { this.world.destroyBody(p.body); this.projectiles.splice(i, 1); }
      }
    }

    explode(x, y, radius, power) {
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (!b.isDynamic()) continue;
        const c = b.getWorldCenter();
        let dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy);
        if (d > radius) continue;
        if (d < 0.05) { dx = 0; dy = -1; d = 1; }
        const f = 1 - d / radius, m = b.getMass();
        const dv = power * (0.35 + 0.65 * f);
        b.applyLinearImpulse(V((dx / d) * dv * m, ((dy / d) * dv - power * 0.35) * m), c, true);
        b.applyAngularImpulse((this.random() * 2 - 1) * m * 0.3, true);
        const ud = P.ud(b);
        if (ud && ud.kind === 'part') {
          const part = ud.part, rd = part.ragdoll;
          rd.wound(part, c.x - (dx / d) * 0.1, c.y - (dy / d) * 0.1, 25 + 55 * f, 'explosion');
          if (f > 0.5 && part.parentJoint && !part.parentJoint.broken && this.random() < f * 0.9) rd.sever(part.parentJoint, 'explosion');
          if (f > 0.75 && part.kind !== 'limb') rd.kill('blown up');
        }
      }
      for (const h of this.hazards) {
        if (h.type === 'glass' && !h.broken) {
          const p = h.body.getPosition();
          if (Math.hypot(p.x - x, p.y - y) < radius) WR.hazards.shatter(this, h, null);
        } else if (h.type === 'mine' && h.armed && Math.hypot(h.x - x, h.y - y) < radius * 0.9) {
          this.timers.push({ t: 0.12 + this.random() * 0.12, fn: () => { if (h.armed) { h.armed = false; this.explode(h.x, h.y - 0.1, h.radius, h.power); this.world.destroyBody(h.body); } } });
        }
      }
      this.gore.explosion(x, y, 1);
      this.shake = Math.max(this.shake, 1);
      this.emit('sfx', { name: 'explosion', x, y });
      this.emit('explosion', { x, y });
    }

    /** Seeded uniform number in [a, b). */
    rand(a, b) { return a + this.random() * (b - a); }

    win() {
      if (this.status !== 'playing') return;
      this.status = 'won';
      this.winTime = this.time;
      this.emit('win', { time: this.time });
    }
  }
  WR.Sim = Sim;
})();
