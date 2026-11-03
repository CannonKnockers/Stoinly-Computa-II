/* Wreck Riders - the four rides and their riders. DOM-free. */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const P = WR.physics, U = WR.util;
  const V = P.v;
  const Veh = WR.vehicles = {};

  const NO_INPUT = { up: false, down: false, left: false, right: false, space: false, shift: false, z: false };

  class Vehicle {
    constructor(sim, def, x, y) {
      this.sim = sim;
      this.world = sim.world;
      this.def = def;
      this.id = def.id;
      this.bodies = [];
      this.riders = [];
      this.group = sim.nextGroup();
      this.t = 0;
      this.rocketOn = false;
      this.wheelSpeed = 0;
      this.ejectTimers = [];
      this.prevSpace = false;
      this.prevShift = false;
      this.prevZ = false;
      this.build(x, y);
    }
    get rider() { return this.riders[0]; }
    get frame() { return this.bodies[0]; }
    assemblyBodies() {
      const out = this.bodies.slice();
      for (const r of this.riders) if (r.isAttached()) out.push(...r.connectedBodies());
      return out;
    }
    assemblySet() { return new Set(this.assemblyBodies()); }
    fo(extra) {
      return Object.assign({ density: 30, friction: 0.5, restitution: 0.05, group: this.group, cat: P.CAT.VEHICLE, ud: { vehicle: this } }, extra || {});
    }
    newBody(x, y, o) {
      o = o || {};
      const b = P.body(this.world, Object.assign({ x, y, ud: { kind: 'vehicle', vehicle: this, piece: o.piece || 'frame' } }, o));
      this.bodies.push(b);
      return b;
    }
    addRider(o) {
      const r = new WR.Ragdoll(this.sim, Object.assign({ group: this.group }, o));
      r.vehicle = this;
      this.riders.push(r);
      return r;
    }
    /** Release a rider from the vehicle. Returns true if anything was released. */
    eject(r) {
      r = r || this.rider;
      if (!r || !r.isAttached()) return false;
      r.releaseAll();
      r.addVelocity(0, -4.5);
      this.ejectTimers.push({ r, t: 0.35 });
      r.regrouped = true;
      this.sim.emit('eject', { ragdoll: r });
      return true;
    }
    /** Called every frame before the physics step. */
    update(input, dt) {
      this.t += dt;
      input = input || NO_INPUT;
      for (let i = this.ejectTimers.length - 1; i >= 0; i--) {
        const e = this.ejectTimers[i];
        e.t -= dt;
        if (e.t <= 0) { for (const b of e.r.allBodies()) P.setGroup(b, 0); this.ejectTimers.splice(i, 1); }
      }
      // riders torn loose by force start colliding with the vehicle shortly after
      for (const r of this.riders) {
        if (!r.isAttached() && !r.regrouped) { r.regrouped = true; this.ejectTimers.push({ r, t: 0.35 }); }
      }
      const r = this.rider;
      const alive = !!(r && r.alive);
      const attached = alive && r.isAttached();
      if (alive && input.z && !this.prevZ) this.eject(r);
      this.prevZ = input.z;
      this.control(attached ? input : NO_INPUT, dt, attached);
      this.leanRider(alive ? input : NO_INPUT, attached);
      for (const rr of this.riders) rr.flying = !rr.isAttached();
    }
    leanRider(input, attached) {
      const r = this.rider;
      if (!r || !r.alive) return;
      const T = attached ? 90 : 170;
      const torso = r.parts.torso.body;
      if (input.left) torso.applyTorque(-T);
      if (input.right) torso.applyTorque(T);
      if (!attached) {
        // airborne: curl up / stretch out
        if (input.up) r.setPoseTargets({ hipL: -1.6, hipR: -1.6, kneeL: 1.8, kneeR: 1.8, shoulderL: -1.5, shoulderR: -1.5 });
        else if (input.down) r.setPoseTargets({ hipL: 0.2, hipR: 0.2, kneeL: 0.1, kneeR: 0.1, shoulderL: 0.5, shoulderR: 0.5 });
      }
    }
    control() {}
    /** Spin a wheel toward a target angular velocity; a fraction of the reaction goes into the frame for feel. */
    driveWheel(wheel, targetW, maxT, reaction) {
      const w = wheel.getAngularVelocity();
      let T = (targetW - w) * 60;
      // driving is one-sided: pushing never brakes a wheel that is already spinning faster (rocket, downhill)
      if (targetW > 0) T = U.clamp(T, 0, maxT);
      else if (targetW < 0) T = U.clamp(T, -maxT, 0);
      else T = U.clamp(T, -maxT, maxT);
      wheel.applyTorque(T, true);
      if (reaction) this.frame.applyTorque(-T * reaction, true);
      return T;
    }
    /** Smoothed wheel ground contact for sounds. */
    anyWheelGrounded() {
      const set = this.assemblySet();
      for (const b of this.bodies) if (P.ud(b).piece === 'wheel' && P.touchingGround(b, set)) return true;
      return false;
    }
  }

  /* ---------------- Rocket wheelchair ---------------- */
  class Wheelchair extends Vehicle {
    build(x, y) {
      const fy = y - 0.98;
      const f = this.newBody(x, fy, { angularDamping: 0.6 });
      P.box(f, 0.3, 0.04, this.fo({ center: [0.05, 0] }));                         // seat
      P.box(f, 0.04, 0.3, this.fo({ center: [-0.3, -0.3], angle: -0.1 }));          // backrest
      P.box(f, 0.1, 0.03, this.fo({ center: [0.55, 0.44] }));                       // footrest
      P.box(f, 0.36, 0.03, this.fo({ center: [0.1, 0.25] }));                       // under-frame
      P.box(f, 0.13, 0.3, this.fo({ center: [-0.54, -0.02], density: 12 }));        // rocket
      const w = this.newBody(x - 0.42, fy + 0.62, { piece: 'wheel' });
      P.circle(w, 0.36, this.fo({ density: 18, friction: 1.1 }));
      const c = this.newBody(x + 0.6, fy + 0.86, { piece: 'wheel' });
      P.circle(c, 0.12, this.fo({ density: 10, friction: 0.8 }));
      P.revolute(this.world, f, w, w.getPosition(), {});
      P.revolute(this.world, f, c, c.getPosition(), {});
      this.wheelBody = w;
      this.caster = c;
      this.rocketPos = V(-0.54, 0.14);
      this.nozzle = V(-0.68, 0.14);
      const pelvis = f.getWorldPoint(V(0.02, -0.2));
      const hands = f.getWorldPoint(V(0.2, -0.42));
      const feet = f.getWorldPoint(V(0.5, 0.38));
      const r = this.addRider({ x: pelvis.x, y: pelvis.y, pose: { spine: 0.1, hands: [hands.x, hands.y], feet: [feet.x, feet.y] }, style: this.def.style, name: this.def.name, isMain: true });
      r.holdCurrentPose();
      r.attachTo('pelvis', f, pelvis, 14000, { enableLimit: true, lowerAngle: -0.15, upperAngle: 0.15, tag: 'seat' });
      for (const s of ['L', 'R']) {
        r.attachTo('larm' + s, f, r.handPoint(s), 4500, { tag: 'hand' });
        r.attachTo('lleg' + s, f, r.footPoint(s), 9000, { tag: 'foot' });
      }
    }
    control(inp, dt, alive) {
      const f = this.frame;
      const w = this.wheelBody;
      const ang = U.wrapAngle(f.getAngle());
      // soft anti-flip: ease off the push while the chair is already pitching up
      const antiFlip = U.clamp(1 - (-ang - 0.3) / 0.5, 0, 1);
      if (inp.up) this.driveWheel(w, 26, 170 * antiFlip, 0.15);
      else if (inp.down) this.driveWheel(w, -14, 170, 0.15);
      else if (alive) this.driveWheel(w, 0, 5, 0);
      if (inp.left) f.applyTorque(-520);
      if (inp.right) f.applyTorque(520);
      this.rocketOn = !!inp.space;
      if (this.rocketOn) {
        const dir = f.getWorldVector(V(1, 0));
        // thrust acts just below the whole assembly's centre of mass: a clean push with a mild nose-up tendency
        const bodies = this.assemblyBodies();
        let M = 0, cx = 0, cy = 0;
        for (const b of bodies) { const m = b.getMass(), c = b.getWorldCenter(); M += m; cx += c.x * m; cy += c.y * m; }
        cx /= M; cy /= M;
        const v = f.getLinearVelocity();
        const along = v.x * dir.x + v.y * dir.y;
        const F = 1500 * U.clamp(1 - (along - 24) / 14, 0, 1);
        const down = f.getWorldVector(V(0, 1));
        f.applyForce(V(dir.x * F, dir.y * F), V(cx + down.x * 0.12, cy + down.y * 0.12), true);
        const n = f.getWorldPoint(this.nozzle);
        this.sim.gore.flame(n.x, n.y, -dir.x, -dir.y, 1);
      }
      this.wheelSpeed = this.wheelBody.getAngularVelocity();
    }
  }

  /* ---------------- Self-balancing scooter ---------------- */
  class Scooter extends Vehicle {
    build(x, y) {
      const dy = y - 0.6;
      const d = this.newBody(x, dy, { angularDamping: 1.0 });
      P.box(d, 0.3, 0.045, this.fo());                                                  // deck
      P.box(d, 0.03, 0.55, this.fo({ center: [0.16, -0.56], angle: -0.1, density: 6 })); // stem
      P.box(d, 0.14, 0.03, this.fo({ center: [0.22, -1.1], density: 6 }));              // handlebar
      const w = this.newBody(x, y - 0.27, { piece: 'wheel' });
      P.circle(w, 0.27, this.fo({ density: 22, friction: 1.2 }));
      this.axle = P.revolute(this.world, d, w, w.getPosition(), {});
      this.wheelBody = w;
      const pelvis = d.getWorldPoint(V(0.0, -1.0));
      const hands = d.getWorldPoint(V(0.22, -1.1));
      const feet = d.getWorldPoint(V(0.02, -0.06));
      const r = this.addRider({ x: pelvis.x, y: pelvis.y, pose: { spine: 0.05, hands: [hands.x, hands.y], feet: [feet.x, feet.y] }, style: this.def.style, name: this.def.name, isMain: true });
      r.holdCurrentPose();
      for (const s of ['L', 'R']) {
        r.attachTo('larm' + s, d, r.handPoint(s), 3500, { tag: 'hand' });
        r.attachTo('lleg' + s, d, r.footPoint(s), 11000, { tag: 'foot' });
      }
    }
    control(inp, dt, alive) {
      const d = this.frame, w = this.wheelBody;
      const tu = Scooter.TUNE;
      const ang = U.wrapAngle(d.getAngle()), av = d.getAngularVelocity();
      const vx = w.getLinearVelocity().x;
      // Balancing-robot controller: wheel torque from lean angle, lean rate and the error against a commanded speed.
      // Up/Down move the commanded speed (ramped); on a hill the scooter settles slower and leaning in, instead of
      // demanding a fixed lean whose required acceleration grows until the tyre slips.
      let vTarget = 0, rate = tu.coastDecel;
      if (inp.up) { vTarget = tu.vMax; rate = tu.accel; } else if (inp.down) { vTarget = -tu.vBack; rate = tu.brake; }
      if (this.vCmd == null) this.vCmd = 0;
      // never command far ahead of what the scooter is actually doing (no wind-up while blocked or airborne)
      this.vCmd += U.clamp(vTarget - this.vCmd, -rate * dt, rate * dt);
      this.vCmd = U.clamp(this.vCmd, vx - tu.lead, vx + tu.lead);
      const upright = Math.abs(ang) < 1.2;
      let T = (alive && upright) ? U.clamp(tu.kp * ang + tu.kd * av + tu.kv * U.clamp(vx - this.vCmd, -tu.verr, tu.verr), -tu.maxT, tu.maxT) : 0;
      // traction control: a wheel spinning much faster (or slower) than the ground passes under it has lost grip, and
      // more torque only spins it further; fade the drive out with the slip so the tyre bites again
      const rim = w.getAngularVelocity() * 0.27;               // positive angular velocity = clockwise = rolling toward +x
      const slip = rim - vx;
      if (slip * T > 0) T *= U.clamp(1 - (Math.abs(slip) - 1.5) / 3, 0.15, 1);
      w.applyTorque(T);
      d.applyTorque(-T);
      if (inp.left) d.applyTorque(-380);
      if (inp.right) d.applyTorque(380);
      if (inp.space && !this.prevSpace && P.touchingGround(w, this.assemblySet())) {
        P.addVelocity(this.assemblyBodies(), 0, -6.5);
        this.sim.emit('hop', {});
      }
      this.prevSpace = inp.space;
      this.wheelSpeed = w.getAngularVelocity();
    }
  }

  /* ---------------- Bicycle with passenger ---------------- */
  class Bike extends Vehicle {
    build(x, y) {
      const fy = y - 0.62;
      const f = this.newBody(x, fy, { angularDamping: 0.5 });
      P.poly(f, [[-0.62, 0.28], [0.62, 0.28], [0.5, -0.15], [-0.3, -0.15]], this.fo({ density: 14 }));
      P.box(f, 0.03, 0.14, this.fo({ center: [-0.32, -0.3], density: 6 }));            // seat post
      P.box(f, 0.14, 0.03, this.fo({ center: [-0.32, -0.46], density: 6 }));           // saddle
      P.box(f, 0.03, 0.3, this.fo({ center: [0.56, -0.42], angle: -0.3, density: 6 })); // head stem
      P.box(f, 0.03, 0.12, this.fo({ center: [0.66, -0.72], density: 4 }));            // handlebar
      P.box(f, 0.22, 0.025, this.fo({ center: [-0.78, -0.3], density: 4 }));           // rack
      const rw = this.newBody(x - 0.62, y - 0.34, { piece: 'wheel' });
      P.circle(rw, 0.34, this.fo({ density: 12, friction: 1.1 }));
      const fw = this.newBody(x + 0.62, y - 0.34, { piece: 'wheel' });
      P.circle(fw, 0.34, this.fo({ density: 12, friction: 1.1 }));
      P.revolute(this.world, f, rw, rw.getPosition(), {});
      P.revolute(this.world, f, fw, fw.getPosition(), {});
      this.rearWheel = rw; this.frontWheel = fw; this.wheelBody = rw;
      // adult
      const pelvis = f.getWorldPoint(V(-0.32, -0.6));
      const hands = f.getWorldPoint(V(0.64, -0.78));
      const feetL = f.getWorldPoint(V(0.14, 0.2)), feetR = f.getWorldPoint(V(-0.14, 0.0));
      const r = this.addRider({ x: pelvis.x, y: pelvis.y, pose: { spine: 0.4, neck: -0.2, hands: [hands.x, hands.y], feet: { L: [feetL.x, feetL.y], R: [feetR.x, feetR.y] } }, style: this.def.style, name: this.def.name, isMain: true });
      r.holdCurrentPose();
      r.attachTo('pelvis', f, pelvis, 12000, { enableLimit: true, lowerAngle: -0.25, upperAngle: 0.25, tag: 'seat' });
      for (const s of ['L', 'R']) {
        r.attachTo('larm' + s, f, r.handPoint(s), 5500, { tag: 'hand' });
        r.attachTo('lleg' + s, f, r.footPoint(s), 6000, { tag: 'foot' });
      }
      // passenger on the rack, holding on to the adult
      const cp = f.getWorldPoint(V(-0.8, -0.42));
      const chands = r.parts.torso.body.getWorldPoint(V(-0.1, 0.12));
      const cfeet = f.getWorldPoint(V(-0.62, 0.05));
      const k = this.addRider({ x: cp.x, y: cp.y, scale: 0.6, pose: { spine: 0.1, hands: [chands.x, chands.y], feet: [cfeet.x, cfeet.y] }, style: this.def.style2, name: this.def.name2 });
      k.holdCurrentPose();
      k.attachTo('pelvis', f, cp, 6000, { enableLimit: true, lowerAngle: -0.3, upperAngle: 0.3, tag: 'seat' });
      for (const s of ['L', 'R']) k.attachTo('larm' + s, r.parts.torso.body, k.handPoint(s), 1500, { tag: 'hand' });
      this.child = k;
    }
    control(inp, dt, alive) {
      const f = this.frame;
      const vx = f.getLinearVelocity().x;
      if (inp.up) this.driveWheel(this.rearWheel, 34, 250, 0.2);
      else if (inp.down) {
        if (vx > 1) { this.driveWheel(this.rearWheel, 0, 420, 0); this.driveWheel(this.frontWheel, 0, 260, 0); }
        else this.driveWheel(this.rearWheel, -10, 160, 0.2);
      } else if (alive) this.driveWheel(this.rearWheel, 0, 3, 0);
      if (inp.left) f.applyTorque(-650);
      if (inp.right) f.applyTorque(650);
      if (inp.space && !this.prevSpace) {
        const set = this.assemblySet();
        if (P.touchingGround(this.rearWheel, set) || P.touchingGround(this.frontWheel, set)) {
          P.addVelocity(this.assemblyBodies(), 0, -5.5);
          this.sim.emit('hop', {});
        }
      }
      this.prevSpace = inp.space;
      if (inp.shift && !this.prevShift && this.child && this.child.isAttached()) this.eject(this.child);
      this.prevShift = inp.shift;
      this.wheelSpeed = this.rearWheel.getAngularVelocity();
    }
  }

  /* ---------------- Pogo stick ---------------- */
  class Pogo extends Vehicle {
    build(x, y) {
      const uy = y - 1.25;
      const up = this.newBody(x, uy, { angularDamping: 0.8 });
      P.box(up, 0.035, 0.6, this.fo({ density: 30 }));                               // shaft
      P.box(up, 0.2, 0.03, this.fo({ center: [0, -0.6], density: 8 }));              // handlebar
      P.box(up, 0.18, 0.03, this.fo({ center: [0, 0.5], density: 8 }));              // foot pegs
      const low = this.newBody(x, y - 0.42, { piece: 'lower' });
      P.box(low, 0.03, 0.35, this.fo({ density: 60 }));
      P.circle(low, 0.07, this.fo({ center: [0, 0.35], density: 60, friction: 1.4 }));
      this.slider = P.prismatic(this.world, up, low, low.getPosition(), V(0, 1), { enableLimit: true, lowerTranslation: -0.5, upperTranslation: 0, enableMotor: false });
      this.lower = low;
      this.compression = 0;
      this.wasGrounded = false;
      const pelvis = up.getWorldPoint(V(0, -0.38));
      const hands = up.getWorldPoint(V(0.0, -0.6));
      const feet = up.getWorldPoint(V(0.04, 0.47));
      const r = this.addRider({ x: pelvis.x, y: pelvis.y, pose: { spine: 0.05, hands: [hands.x, hands.y], feet: [feet.x, feet.y] }, style: this.def.style, name: this.def.name, isMain: true });
      r.holdCurrentPose();
      for (const s of ['L', 'R']) {
        r.attachTo('larm' + s, up, r.handPoint(s), 3000, { tag: 'hand' });
        r.attachTo('lleg' + s, up, r.footPoint(s), 8000, { tag: 'foot' });
      }
    }
    control(inp, dt, alive) {
      const up = this.frame, low = this.lower;
      const t = this.slider.getJointTranslation();   // 0 = fully extended, -0.5 = fully compressed
      const vel = this.slider.getJointSpeed();
      const charging = !!(inp.space && alive);
      const target = charging ? -0.5 : 0;             // holding Space shortens the spring's rest length
      const k = 22000, c = 70;
      const F = -k * (t - target) - c * vel;          // > 0 pushes the foot away from the handle
      const axis = up.getWorldVector(V(0, 1));
      const sprung = this.assemblyBodies().filter((b) => b !== low);
      let M = 0;
      for (const b of sprung) M += b.getMass();
      for (const b of sprung) { const m = b.getMass() / M; b.applyForceToCenter(V(-axis.x * F * m, -axis.y * F * m), true); }
      low.applyForce(V(axis.x * F, axis.y * F), low.getPosition(), true);
      // gyro-ish balance: keeps the stick near a lean target while it is roughly upright
      const tu = Pogo.TUNE;
      const ang = U.wrapAngle(up.getAngle()), av = up.getAngularVelocity();
      // Up/Down ask for a travel speed; the lean target comes from the speed error (like the scooter), so holding Up
      // settles into a steady hop instead of tipping further forward with every bounce.
      let lean = 0;
      if (tu.mode === 'speed') {
        let vDes = 0;
        if (inp.up) vDes = tu.vUp; else if (inp.down) vDes = -tu.vDown;
        const vx = up.getLinearVelocity().x;
        lean = U.clamp(tu.kv * (vDes - vx), -tu.maxLean, tu.maxLean);
        // Standing still on the spring without charging it, the stick stays upright: a leaning stick with a planted foot
        // just tips over. The lean (the hop's aim) applies while Space squashes the spring, in the air, and while moving.
        const aiming = charging || !this.wasGrounded || Math.abs(vx) > tu.moveV;
        if (!aiming) lean = 0;
      } else if (inp.up) lean = tu.lean; else if (inp.down) lean = -tu.lean;
      if (alive && Math.abs(ang) < tu.maxAng) {
        let T = U.clamp(-tu.kp * (ang - lean) - tu.kd * av, -tu.maxT, tu.maxT);
        if (inp.left) T -= tu.tilt;
        if (inp.right) T += tu.tilt;
        up.applyTorque(T, true);
      } else {
        if (inp.left) up.applyTorque(-tu.tilt, true);
        if (inp.right) up.applyTorque(tu.tilt, true);
      }
      const grounded = P.touchingGround(low, this.assemblySet());
      if (grounded && !this.wasGrounded && vel < -2.5) this.sim.emit('land', { speed: -vel });
      if (!grounded && this.wasGrounded && vel > 1.5) this.sim.emit('boing', { speed: vel });
      this.wasGrounded = grounded;
      this.compression = -t;
      this.charging = charging;
      this.wheelSpeed = 0;
    }
  }

  Pogo.TUNE = { mode: 'speed', lean: 0.3, kp: 4000, kd: 350, maxT: 2000, tilt: 260, maxAng: 1.1, vUp: 4, vDown: 2.5, kv: 0.08, maxLean: 0.3, moveV: 0.6 };
  Scooter.TUNE = { kp: 1400, kd: 150, kv: 80, verr: 3, maxT: 520, vMax: 15, vBack: 6, accel: 3.2, brake: 6, coastDecel: 1.5, lead: 2.5 };
  Veh.classes = { Wheelchair, Scooter, Bike, Pogo };

  Veh.CHARACTERS = [
    {
      id: 'wheelchair', name: 'Dottie Blaze', vehicle: 'Rocket Wheelchair', cls: Wheelchair,
      blurb: 'Retired stunt pilot. Jet-powered wheelchair, zero regrets.',
      controls: ['Up / Down: push the wheels', 'Left / Right: lean', 'Space: rocket', 'Z: eject'],
      style: { skin: '#f1c9a5', shirt: '#7b3fa0', sleeve: '#8f52b5', pants: '#5a3c8c', shoes: '#f4f4f4', hair: '#d9d9d9', hairStyle: 'bun', glasses: true, goggles: true },
    },
    {
      id: 'scooter', name: 'Kip Kilowatt', vehicle: 'Balance Scooter', cls: Scooter,
      blurb: 'Startup founder. Believes the scooter is the future of transport.',
      controls: ['Up: speed up (it leans for you)', 'Down: brake, then reverse', 'Left / Right: tilt', 'Space: hop', 'Z: eject'],
      style: { skin: '#e0ac86', shirt: '#1fa3a3', sleeve: '#1fa3a3', pants: '#2c3e6b', shoes: '#ffffff', hair: '#2a1a0a', hairStyle: 'short', helmet: '#ff8c1a', sunglasses: true },
    },
    {
      id: 'bike', name: 'Uncle Rudy & Pip', vehicle: 'Bicycle with passenger', cls: Bike,
      blurb: 'Rudy promised Pip a ride to the ice-cream stand. The stand is on the other side of this.',
      controls: ['Up: pedal', 'Down: brake / reverse', 'Left / Right: lean', 'Space: bunny hop', 'Shift: eject Pip', 'Z: eject Rudy'],
      style: { skin: '#e8b48a', shirt: '#d7263d', shirtPattern: 'dots', sleeve: '#d7263d', pants: '#c9b27c', shoes: '#6b4a2b', hair: '#3a2a1a', hairStyle: 'bald', mustache: true },
      style2: { skin: '#f3d1b0', shirt: '#f5c400', sleeve: '#f5c400', pants: '#3a7bd5', shoes: '#ff5fa2', hair: '#8a4b1f', hairStyle: 'pigtails' },
      name2: 'Pip',
    },
    {
      id: 'pogo', name: 'Jojo the Clown', vehicle: 'Pogo Stick', cls: Pogo,
      blurb: 'Birthday entertainer. Has never once landed a trick.',
      controls: ['Space: hold to squash the spring, release to bounce', 'Up / Down: hop forward / backward', 'Left / Right: tilt', 'Z: eject'],
      style: { skin: '#fff6f0', shirt: '#2f6fd6', shirtPattern: 'dots', sleeve: '#2f6fd6', pants: '#2f6fd6', shoes: '#e62020', hair: '#2ecc40', hairStyle: 'curly', clownNose: true, hat: '#ffd700' },
    },
  ];
  Veh.create = (sim, def, x, y) => new def.cls(sim, def, x, y);
  Veh.NO_INPUT = NO_INPUT;
})();
