/* Wreck Riders - articulated ragdoll with held poses, wounds, bleeding and dismemberment. DOM-free. */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const P = WR.physics, U = WR.util;
  const V = P.v;

  // Half sizes at scale 1 (roughly a 1.75 m person).
  const GEO = {
    head: { r: 0.165 },
    torso: { hw: 0.15, hh: 0.27 },
    pelvis: { hw: 0.14, hh: 0.11 },
    uarm: { hw: 0.055, hh: 0.15 },
    larm: { hw: 0.05, hh: 0.15 },
    uleg: { hw: 0.075, hh: 0.21 },
    lleg: { hw: 0.06, hh: 0.21 },
    foot: { hw: 0.1, hh: 0.045, dx: 0.045 },
  };
  const DENSITY = 100;

  // Joint table: child part hangs from parent. Angles are child.angle - parent.angle (referenceAngle 0).
  // Negative = child swings forward (+x) when the parent is upright.
  const JOINTS = [
    { name: 'spine', parent: 'pelvis', child: 'torso', lower: -0.5, upper: 0.5, breakForce: 32000, strength: 500 },
    { name: 'neck', parent: 'torso', child: 'head', lower: -0.7, upper: 0.7, breakForce: 48000, strength: 70 },
    { name: 'shoulderL', parent: 'torso', child: 'uarmL', lower: -3.1, upper: 0.9, breakForce: 7600, strength: 110 },
    { name: 'elbowL', parent: 'uarmL', child: 'larmL', lower: -2.6, upper: 0.05, breakForce: 9500, strength: 70 },
    { name: 'shoulderR', parent: 'torso', child: 'uarmR', lower: -3.1, upper: 0.9, breakForce: 7600, strength: 110 },
    { name: 'elbowR', parent: 'uarmR', child: 'larmR', lower: -2.6, upper: 0.05, breakForce: 9500, strength: 70 },
    { name: 'hipL', parent: 'pelvis', child: 'ulegL', lower: -2.1, upper: 0.6, breakForce: 17000, strength: 280 },
    { name: 'kneeL', parent: 'ulegL', child: 'llegL', lower: -0.05, upper: 2.4, breakForce: 21000, strength: 180 },
    { name: 'hipR', parent: 'pelvis', child: 'ulegR', lower: -2.1, upper: 0.6, breakForce: 17000, strength: 280 },
    { name: 'kneeR', parent: 'ulegR', child: 'llegR', lower: -0.05, upper: 2.4, breakForce: 21000, strength: 180 },
  ];
  const KIND = { head: 'head', torso: 'torso', pelvis: 'torso', uarmL: 'limb', larmL: 'limb', uarmR: 'limb', larmR: 'limb', ulegL: 'limb', llegL: 'limb', ulegR: 'limb', llegR: 'limb' };
  // Velocity-change thresholds (m/s in one frame while touching something): wound above `w`, fatal/sever above `k`.
  const IMPACT = { head: { w: 6.5, k: 13.5 }, torso: { w: 8.5, k: 19 }, limb: { w: 9, k: 21 } };

  /** Two-link inverse kinematics. Returns [angleUpper, angleLowerRelative] in body-angle convention. */
  function ik2(rootX, rootY, tx, ty, L1, L2, bendSign, lo, hi) {
    let dx = tx - rootX, dy = ty - rootY;
    let d = Math.hypot(dx, dy);
    const maxD = (L1 + L2) * 0.995;
    if (d < 1e-6) { dx = 0; dy = 1; d = 1e-6; }
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    const minD = Math.abs(L1 - L2) + 1e-3;
    if (d < minD) { dx *= minD / d; dy *= minD / d; d = minD; }
    const phi = Math.atan2(dy, dx);
    const cosA = U.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const a = Math.acos(cosA);
    const cosB = U.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
    const inner = Math.acos(cosB);             // inner angle at the joint
    const bend = (Math.PI - inner) * bendSign; // relative angle of lower link
    // Upper link direction: phi - bendSign * a  (elbow on the side the bend sign asks for)
    const dirA = phi - bendSign * a;
    const upper = U.dirToAngle(Math.cos(dirA), Math.sin(dirA));
    const lower = U.clamp(bend, lo, hi);
    return [upper, lower];
  }

  class Ragdoll {
    /**
     * o: { x, y (pelvis centre), angle, scale, style, group, name, pose }
     * pose: { spine, neck, hands:[x,y] world target (optional), feet:[x,y] world target (optional),
     *         shoulder, elbow, hip, knee (fallbacks when no target) }
     */
    constructor(sim, o) {
      this.sim = sim;
      this.world = sim.world;
      this.scale = o.scale || 1;
      this.style = o.style || {};
      this.group = o.group || -1;
      this.name = o.name || 'rider';
      this.isMain = !!o.isMain;
      this.alive = true;
      this.health = 100;
      this.cause = null;
      this.parts = {};
      this.joints = {};
      this.jointList = [];
      this.attach = [];     // joints to vehicles / other bodies that can break
      this.wounds = [];
      this.flail = 0;
      this.strengthMul = 1;
      this.breakMul = o.breakMul || 1;
      this.severedCount = 0;
      this.build(o.x, o.y, o.angle || 0, o.pose || {});
    }

    geo(name) {
      const s = this.scale;
      const gg = GEO[name.replace(/[LR]$/, '')];
      const out = {};
      for (const k in gg) out[k] = gg[k] * s;
      return out;
    }

    makePart(name, x, y, angle) {
      const s = this.scale, P_ = P;
      const base = name.replace(/[LR]$/, '');
      const gg = this.geo(name);
      const part = { name, base, kind: KIND[name], ragdoll: this, severed: false, wounds: [], side: /L$/.test(name) ? 'L' : (/R$/.test(name) ? 'R' : ''), body: null, parentJoint: null, children: [] };
      const body = P_.body(this.world, { x, y, angle, ud: { kind: 'part', part }, linearDamping: 0.05, angularDamping: 0.1 });
      const fo = { density: DENSITY, friction: 0.5, restitution: 0.02, group: this.group, cat: P_.CAT.RIDER, ud: { part } };
      if (base === 'head') {
        P_.circle(body, gg.r, Object.assign({}, fo, { density: DENSITY * 0.85 }));
      } else if (base === 'lleg') {
        P_.box(body, gg.hw, gg.hh, fo);
        const f = this.geo('foot');
        P_.box(body, f.hw, f.hh, Object.assign({}, fo, { center: [f.dx, gg.hh + f.hh * 0.6], friction: 0.9 }));
      } else {
        P_.box(body, gg.hw, gg.hh, fo);
      }
      part.body = body;
      this.parts[name] = part;
      return part;
    }

    build(x, y, rootAngle, pose) {
      const s = this.scale;
      const rot = U.rot;
      const T = this.geo('torso'), Pv = this.geo('pelvis'), H = this.geo('head');
      const UA = this.geo('uarm'), LA = this.geo('larm'), UL = this.geo('uleg'), LL = this.geo('lleg'), F = this.geo('foot');
      const spine = pose.spine || 0, neck = pose.neck || 0;

      // Pelvis (root)
      const pelvis = this.makePart('pelvis', x, y, rootAngle);
      // Torso
      const spineA = [x + rot(0, -Pv.hh, rootAngle)[0], y + rot(0, -Pv.hh, rootAngle)[1]];
      const torsoAng = rootAngle + spine;
      const tc = rot(0, -T.hh, torsoAng);
      const torso = this.makePart('torso', spineA[0] + tc[0], spineA[1] + tc[1], torsoAng);
      // Head
      const neckA = [torso.body.getPosition().x + rot(0, -T.hh, torsoAng)[0], torso.body.getPosition().y + rot(0, -T.hh, torsoAng)[1]];
      const headAng = torsoAng + neck;
      const hc = rot(0, -H.r * 0.9, headAng);
      const head = this.makePart('head', neckA[0] + hc[0], neckA[1] + hc[1], headAng);
      // Shoulders anchor (slightly below the torso top)
      const shO = rot(0, -T.hh + 0.06 * s, torsoAng);
      const shoulder = [torso.body.getPosition().x + shO[0], torso.body.getPosition().y + shO[1]];
      // Hips anchor
      const hpO = rot(0, Pv.hh - 0.03 * s, rootAngle);
      const hip = [x + hpO[0], y + hpO[1]];

      const armLen1 = UA.hh * 2, armLen2 = LA.hh * 2;
      const legLen1 = UL.hh * 2, legLen2 = LL.hh * 2 + F.hh * 1.2;

      const makeLimb = (side, upName, lowName, root, len1, len2, up, low) => {
        // up/low are absolute body angles for upper and lower link
        const uc = rot(0, len1 / 2, up);
        const upper = this.makePart(upName + side, root[0] + uc[0], root[1] + uc[1], up);
        const jointA = [root[0] + uc[0] * 2, root[1] + uc[1] * 2];
        const lc = rot(0, len2 / 2, low);
        const lower = this.makePart(lowName + side, jointA[0] + lc[0], jointA[1] + lc[1], low);
        return { upper, lower, jointA };
      };

      // Arms: IK to hand target if provided, else fallback pose angles
      for (const side of ['L', 'R']) {
        let up, low;
        const target = pose.hands && (pose.hands.L ? pose.hands[side] : pose.hands);
        if (target) {
          const r = ik2(shoulder[0], shoulder[1], target[0], target[1], armLen1, armLen2, -1, -2.6, 0.05);
          up = r[0]; low = r[0] + r[1];
        } else {
          up = torsoAng + (pose.shoulder != null ? pose.shoulder : -0.3);
          low = up + (pose.elbow != null ? pose.elbow : -0.4);
        }
        makeLimb(side, 'uarm', 'larm', shoulder, armLen1, armLen2, up, low);
      }
      // Legs
      for (const side of ['L', 'R']) {
        let up, low;
        const target = pose.feet && (pose.feet.L ? pose.feet[side] : pose.feet);
        if (target) {
          let tx = target[0], ty = target[1];
          for (let pass = 0; pass < 3; pass++) {
            const r = ik2(hip[0], hip[1], tx, ty, legLen1, legLen2, 1, -0.05, 2.4);
            up = r[0]; low = r[0] + r[1];
            // the foot point sits F.dx forward of the shin axis; pull the target back by that offset
            const off = rot(F.dx, 0, low);
            tx = target[0] - off[0]; ty = target[1] - off[1];
          }
        } else {
          up = rootAngle + (pose.hip != null ? pose.hip : -0.1);
          low = up + (pose.knee != null ? pose.knee : 0.2);
        }
        makeLimb(side, 'uleg', 'lleg', hip, legLen1, legLen2, up, low);
      }

      // Joints
      const s2 = s * s, s3 = s2 * s;
      for (const jd of JOINTS) {
        const parent = this.parts[jd.parent], child = this.parts[jd.child];
        let anchor;
        switch (jd.name) {
          case 'spine': anchor = spineA; break;
          case 'neck': anchor = neckA; break;
          case 'shoulderL': case 'shoulderR': anchor = shoulder; break;
          case 'hipL': case 'hipR': anchor = hip; break;
          case 'elbowL': case 'elbowR': { const u = this.parts['uarm' + jd.name.slice(-1)]; const p = u.body.getWorldPoint(V(0, UA.hh)); anchor = [p.x, p.y]; break; }
          case 'kneeL': case 'kneeR': { const u = this.parts['uleg' + jd.name.slice(-1)]; const p = u.body.getWorldPoint(V(0, UL.hh)); anchor = [p.x, p.y]; break; }
        }
        const joint = P.revolute(this.world, parent.body, child.body, V(anchor[0], anchor[1]), {
          enableLimit: true, lowerAngle: jd.lower, upperAngle: jd.upper,
          enableMotor: true, motorSpeed: 0, maxMotorTorque: jd.strength * s3,
          collideConnected: false,
        });
        const rec = { name: jd.name, joint, parent, child, lower: jd.lower, upper: jd.upper, breakForce: jd.breakForce * s2, strength: jd.strength * s3, target: joint.getJointAngle(), flailTarget: 0, broken: false };
        this.joints[jd.name] = rec;
        this.jointList.push(rec);
        child.parentJoint = rec;
        parent.children.push(child);
      }
    }

    /* ---------- queries ---------- */
    part(name) { return this.parts[name]; }
    get root() { return this.parts.pelvis; }
    get focusBody() {
      const t = this.parts.torso;
      return t.body;
    }
    /** Bodies still connected (through unbroken joints) to the pelvis. */
    connectedBodies() {
      const out = [];
      const walk = (p) => { out.push(p.body); for (const c of p.children) if (!c.parentJoint.broken) walk(c); };
      walk(this.parts.pelvis);
      return out;
    }
    connectedParts() {
      const out = [];
      const walk = (p) => { out.push(p); for (const c of p.children) if (!c.parentJoint.broken) walk(c); };
      walk(this.parts.pelvis);
      return out;
    }
    allBodies() { return Object.values(this.parts).map((p) => p.body); }
    isConnected(part) {
      while (part.parentJoint) { if (part.parentJoint.broken) return false; part = part.parentJoint.parent; }
      return true;
    }
    worldPoint(partName, lx, ly) { return this.parts[partName].body.getWorldPoint(V(lx * this.scale, ly * this.scale)); }
    handPoint(side) { const LA = this.geo('larm'); return this.parts['larm' + side].body.getWorldPoint(V(0, LA.hh)); }
    footPoint(side) { const LL = this.geo('lleg'), F = this.geo('foot'); return this.parts['lleg' + side].body.getWorldPoint(V(F.dx, LL.hh + F.hh)); }

    /* ---------- attachments (hands on handlebars etc.) ---------- */
    attachTo(partName, body, worldAnchor, breakForce, opts) {
      const part = this.parts[partName];
      const def = Object.assign({ collideConnected: false }, opts || {});
      const joint = P.revolute(this.world, body, part.body, worldAnchor, def);
      const rec = { name: 'attach:' + partName, joint, part, body, breakForce, broken: false, tag: opts && opts.tag };
      this.attach.push(rec);
      return rec;
    }
    /** Release the rider's grips on the vehicle. Impale joints (tag 'impale', the rider stuck on a spike) are not
     *  grips: they stay, and they do not count as being attached to the vehicle. */
    releaseAll() {
      let released = 0;
      for (const a of this.attach) if (!a.broken && a.tag !== 'impale') { a.broken = true; this.world.destroyJoint(a.joint); released++; }
      return released;
    }
    isAttached() { return this.attach.some((a) => !a.broken && a.tag !== 'impale'); }

    /* ---------- pose control ---------- */
    setPoseTargets(targets) {
      for (const k in targets) if (this.joints[k]) this.joints[k].target = targets[k];
    }
    /** Record the current joint angles as the held pose. */
    holdCurrentPose() {
      for (const rec of this.jointList) rec.target = U.clamp(rec.joint.getJointAngle(), rec.lower, rec.upper);
    }

    /* ---------- per-frame ---------- */
    update(dt, invDtSub) {
      const alive = this.alive;
      if (this.flail > 0) this.flail -= dt;
      for (const rec of this.jointList) {
        if (rec.broken) continue;
        const j = rec.joint;
        if (alive) {
          const ang = j.getJointAngle();
          const target = this.flail > 0 ? rec.flailTarget : rec.target;
          const err = target - ang;
          j.setMotorSpeed(U.clamp(err * 12, -12, 12));
          j.setMaxMotorTorque(rec.strength * this.strengthMul);
        }
        const F = j.getReactionForce(invDtSub).length();
        if (F > rec.breakForce * this.breakMul) this.sever(rec, 'force');
      }
      for (const a of this.attach) {
        if (a.broken) continue;
        const F = a.joint.getReactionForce(invDtSub).length();
        if (F > a.breakForce * this.breakMul) {
          a.broken = true;
          this.world.destroyJoint(a.joint);
          this.sim.emit('detach', { ragdoll: this, tag: a.tag });
        }
      }
      // bleeding
      const gore = this.sim.gore;
      for (let i = this.wounds.length - 1; i >= 0; i--) {
        const w = this.wounds[i];
        w.t -= dt;
        if (w.t <= 0) { this.wounds.splice(i, 1); continue; }
        w.acc += w.rate * dt;
        while (w.acc >= 1) {
          w.acc -= 1;
          const p = w.body.getWorldPoint(V(w.lx, w.ly));
          const v = w.body.getLinearVelocityFromWorldPoint(p);
          gore.blood(p.x, p.y, 1, v.x * 0.5 + U.rand(-1.5, 1.5), v.y * 0.5 + U.rand(-2.5, 0.5), 0.05 + Math.random() * 0.06);
        }
        w.rate *= Math.pow(0.4, dt);
      }
    }

    /* ---------- damage ---------- */
    thresholds(part) {
      const t = IMPACT[part.kind];
      const f = Math.sqrt(this.scale); // smaller riders are a little more fragile
      return { w: t.w * f, k: t.k * f };
    }

    /** A part changed velocity by `dv` m/s in one frame while touching something, at world point (px,py). */
    impact(part, dv, px, py) {
      const th = this.thresholds(part);
      if (dv < th.w) return;
      const over = (dv - th.w) / (th.k - th.w); // 0..1+ severity
      const amount = 8 + over * 30;
      if (dv >= th.k) {
        if (part.kind === 'head') { this.wound(part, px, py, 60, 'head'); this.kill('head'); return; }
        if (part.kind === 'torso') { this.wound(part, px, py, 60, 'torso'); this.kill('crushed'); return; }
        // limb torn off by direct impact
        this.wound(part, px, py, amount, 'impact');
        if (part.parentJoint && !part.parentJoint.broken) this.sever(part.parentJoint, 'impact');
        return;
      }
      this.wound(part, px, py, amount, 'impact');
    }

    wound(part, px, py, amount, kind) {
      const body = part.body;
      const lp = body.getLocalPoint(V(px, py));
      const gore = this.sim.gore;
      const v = body.getLinearVelocityFromWorldPoint(V(px, py));
      gore.burst(px, py, Math.min(60, 4 + amount * 0.9), v.x * 0.4, v.y * 0.4, 4 + amount * 0.12);
      this.wounds.push({ body, lx: lp.x, ly: lp.y, rate: 6 + amount * 0.6, t: 1.5 + amount * 0.08, acc: 0 });
      part.wounds.push({ lx: lp.x, ly: lp.y, r: (0.04 + Math.min(0.1, amount * 0.0025)) * this.scale });
      if (part.wounds.length > 6) part.wounds.shift();
      this.sim.emit('wound', { ragdoll: this, part, amount, kind, x: px, y: py });
      if (!this.alive) return;
      this.health -= amount;
      this.flail = 0.5;
      for (const rec of this.jointList) rec.flailTarget = U.lerp(rec.lower, rec.upper, this.sim.random ? this.sim.random() : Math.random());
      if (this.health <= 0) this.kill('trauma');
    }

    sever(rec, cause) {
      if (rec.broken) return;
      rec.broken = true;
      const a = rec.joint.getAnchorA();
      const ax = a.x, ay = a.y;
      this.world.destroyJoint(rec.joint);
      const child = rec.child, parent = rec.parent;
      child.severed = true;
      this.severedCount++;
      // detached pieces collide with everything, including the body they came from
      const walk = (p) => { P.setGroup(p.body, 0); for (const c of p.children) if (!c.parentJoint.broken) walk(c); };
      walk(child);
      // stumps bleed on both sides
      const la = parent.body.getLocalPoint(V(ax, ay)), lb = child.body.getLocalPoint(V(ax, ay));
      const r = 0.07 * this.scale;
      parent.wounds.push({ lx: la.x, ly: la.y, r: r * 1.3, stump: true });
      child.wounds.push({ lx: lb.x, ly: lb.y, r, stump: true });
      this.wounds.push({ body: parent.body, lx: la.x, ly: la.y, rate: 40, t: 6, acc: 0 });
      this.wounds.push({ body: child.body, lx: lb.x, ly: lb.y, rate: 25, t: 5, acc: 0 });
      const va = parent.body.getLinearVelocityFromWorldPoint(V(ax, ay));
      this.sim.gore.burst(ax, ay, 70, va.x * 0.5, va.y * 0.5, 7);
      this.sim.emit('sever', { ragdoll: this, joint: rec.name, cause, x: ax, y: ay });
      if (this.alive) {
        this.health -= (rec.name === 'neck' || rec.name === 'spine') ? 200 : 30;
        this.flail = 0.8;
        if (rec.name === 'neck') this.kill('decapitated');
        else if (rec.name === 'spine') this.kill('torn in half');
        else if (this.health <= 0) this.kill('blood loss');
      }
    }

    kill(cause) {
      if (!this.alive) return;
      this.alive = false;
      this.cause = cause;
      for (const rec of this.jointList) if (!rec.broken) { rec.joint.setMaxMotorTorque(0); rec.joint.setMotorSpeed(0); }
      this.sim.emit('death', { ragdoll: this, cause });
    }

    /** Velocity change applied to every connected body (boosts, hops). */
    addVelocity(dx, dy) { P.addVelocity(this.connectedBodies(), dx, dy); }
    setVelocity(vx, vy) { P.setVelocityAll(this.connectedBodies(), vx, vy); }

    centre() {
      const p = this.parts.torso.body.getPosition();
      return [p.x, p.y];
    }
  }

  WR.Ragdoll = Ragdoll;
  WR.RAGDOLL_GEO = GEO;
  WR.ik2 = ik2;
})();
