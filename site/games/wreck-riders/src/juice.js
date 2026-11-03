/* Wreck Riders - "juice": style tricks, coin tokens, combo chain, pop-ups, sparkles, hit-stop, shake and rider flash.
 * DOM-free (loads in Node for tests). It only READS the sim: body positions, angles, contacts and sim.events. It never
 * calls sim.random(), never creates bodies and never applies forces, so it cannot change a run (test/meta.test.js
 * replays every saved winning run with a Juice attached and checks the finish times are identical).
 *
 *   const juice = new WR.Juice({ reduced: bool, particleScale: 0..1, shakeScale: 0..1 });
 *   juice.particleScale, juice.shakeScale  // live-settable (STOINLY NEXUS settings): sparkle counts, and 0 = no shake trauma
 *   juice.attach(sim, { modifier });      // modifier from WR.meta.MODIFIERS or null (daily challenge)
 *   juice.update(sim, dt);                // after every sim.update (fixed 60 Hz step)
 *   juice.tick(dt);                       // real frame time: ages pop-ups and particles (they keep moving in hit-stop)
 *   juice.takeHitStop()                   // seconds of hit-stop requested since the last call (main.js freezes the sim)
 *   juice.style, juice.coins, juice.chain, juice.mult, juice.flips, juice.severs, juice.tokens, juice.popups, juice.parts,
 *   juice.trail (recent vehicle frame positions), juice.shake (0..1 trauma), juice.flash (s), juice.feed (recent tricks)
 *   juice.onSting = (name, n) => {}       // sound hook (WR.Audio.sting): 'coin' n=chain, 'trick', 'combo' n=mult, 'crack', 'sparkle'
 * World coordinates are metres, y down (see docs/ENGINE.md). */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const TAU = Math.PI * 2;
  const COMBO_WINDOW = 2.5;      // s between scoring events to keep the chain alive
  const TOKEN_GAP = 9;           // m between coin tokens
  const TOKEN_LIFT = 1.4;        // m above the highest nearby floor
  const TOKEN_R = 1.05;          // m pickup radius around any rider part or vehicle body
  const POINTS = { coin: 25, air: 100 /* per second */, flip: 300, sever: 150, decap: 250, spine: 250 };
  const EVENTS = ['sever', 'death', 'thud', 'wound', 'explosion'];
  const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

  class Juice {
    constructor(opts) {
      this.reduced = !!(opts && opts.reduced);
      // reduced motion used to mean 0.3x sparkles and no shake; the nexus settings now set these directly (main.js)
      this.particleScale = opts && opts.particleScale != null ? opts.particleScale : (this.reduced ? 0.3 : 1);
      this.shakeScale = opts && opts.shakeScale != null ? opts.shakeScale : (this.reduced ? 0 : 1);
      this.onSting = null;
      this.reset(null, null);
    }

    reset(sim, modifier) {
      this.sim = sim; this.mod = modifier || null;
      this.style = 0; this.coins = 0; this.chain = 0; this.mult = 1; this.chainT = 0; this.coinChain = 0; this.coinT = 0;
      this.flips = 0; this.severs = 0; this.bestChain = 0;
      this.air = false; this.airT = 0; this.spin = 0; this.flipsThisAir = 0; this.prevAngle = null;
      this.popups = []; this.parts = []; this.pickups = []; this.feed = []; this.trail = [];
      this.tokens = [];
      this.hitStop = 0; this.hitStopCool = 0; this.shake = 0; this.flash = 0;
      this.crashed = false;
    }

    attach(sim, opts) {
      this.detach();
      this.reset(sim, opts && opts.modifier);
      if (!sim) return;
      if (sim.events && typeof sim.events.on === 'function') {
        const H = this.handlers = {};
        for (const name of EVENTS) { H[name] = (d) => { if (this.sim === sim) this.onEvent(name, d || {}); }; sim.events.on(name, H[name]); }
      }
      try { this.tokens = Juice.placeTokens(sim); } catch (e) { this.tokens = []; }
    }

    detach() {
      const sim = this.sim, H = this.handlers;
      this.handlers = null;
      if (!sim || !H || !sim.events || !sim.events.map) return;
      for (const name in H) { const l = sim.events.map.get(name); if (!l) continue; const i = l.indexOf(H[name]); if (i >= 0) l.splice(i, 1); }
    }

    /** Coin positions along the course: every TOKEN_GAP metres, TOKEN_LIFT above the highest floor within 3 m (so a
     * coin over a pit floats at rim height, on the jump), skipped where a ceiling or any solid body is in the way. */
    static placeTokens(sim) {
      const lines = sim.terrain || [];
      const floorsAt = (x) => {
        let top = Infinity;
        for (const L of lines) {
          if (L.fill === 'above') continue;
          const p = L.pts;
          for (let i = 0; i + 1 < p.length; i++) {
            const a = p[i], b = p[i + 1];
            const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
            if (x < x0 || x > x1 || x1 - x0 < 1e-6) continue;
            const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
            if (y < top) top = y;
          }
        }
        return top;
      };
      const blockedBetween = (x, y0, y1) => {   // any polyline crossing x with y in (y0, y1)
        for (const L of lines) {
          const p = L.pts;
          for (let i = 0; i + 1 < p.length; i++) {
            const a = p[i], b = p[i + 1];
            const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
            if (x < x0 - 0.3 || x > x1 + 0.3) continue;
            const y = x1 - x0 < 1e-6 ? Math.min(a[1], b[1]) : a[1] + (b[1] - a[1]) * (Math.max(x0, Math.min(x1, x)) - a[0]) / (b[0] - a[0]);
            const ylo = x1 - x0 < 1e-6 ? Math.min(a[1], b[1]) : y, yhi = x1 - x0 < 1e-6 ? Math.max(a[1], b[1]) : y;
            if (yhi > y0 && ylo < y1) return true;
          }
        }
        return false;
      };
      const solidAt = (x, y) => {
        if (!sim.world || typeof planckVec !== 'function') return false;
        const pt = planckVec(x, y);
        for (let b = sim.world.getBodyList(); b; b = b.getNext()) {
          const ud = b.getUserData && b.getUserData();
          if (ud && (ud.kind === 'part' || ud.kind === 'vehicle' || ud.kind === 'finish')) continue;
          for (let f = b.getFixtureList(); f; f = f.getNext()) {
            if (f.isSensor && f.isSensor()) continue;
            try { if (f.testPoint(pt)) return true; } catch (e) { /* shape without testPoint */ }
          }
        }
        return false;
      };
      const out = [];
      const sx = (sim.level.start && sim.level.start[0]) || 0, fx = sim.finish ? sim.finish.x : sx + 100;
      for (let x = sx + 10; x < fx - 3; x += TOKEN_GAP) {
        let top = Infinity;
        for (let dx = -3; dx <= 3; dx += 0.5) top = Math.min(top, floorsAt(x + dx));
        if (!Number.isFinite(top)) continue;
        const y = top - TOKEN_LIFT;
        const floorHere = floorsAt(x);
        if (blockedBetween(x, y - 0.8, Math.min(floorHere, top + 0.3) - 0.15)) continue;
        if (solidAt(x, y) || solidAt(x, y - 0.4) || solidAt(x, y + 0.4)) continue;
        out.push({ x, y, taken: false, t: 0, phase: (x * 0.37) % TAU });
      }
      return out;
    }

    /* ---------- scoring ---------- */
    styleMul(kind) {
      const m = this.mod;
      if (!m) return 1;
      let k = m.style || 1;
      if (kind === 'coin' && m.coin) k *= m.coin;
      if ((kind === 'air' || kind === 'flip') && m.air) k *= m.air;
      if (kind === 'sever' && m.gore) k *= m.gore;
      return k;
    }
    score(kind, base, label, x, y, color, big) {
      if (!this.sim || this.sim.status !== 'playing') return 0;   // the score is final once the run ends
      const prevMult = this.mult;
      if (kind !== 'coin') {   // tricks build the combo chain; coins score flat (their pickup sound climbs instead)
        this.chain += 1; this.chainT = COMBO_WINDOW;
        this.bestChain = Math.max(this.bestChain, this.chain);
        this.mult = Math.min(5, 1 + 0.5 * (this.chain - 1));
      }
      const pts = Math.round(base * (kind === 'coin' ? 1 : this.mult) * this.styleMul(kind));
      this.style += pts;
      this.pop(`${label} +${pts}`, x, y - 0.6, color, big ? 30 : (kind === 'coin' ? 17 : 24), big);
      if (kind !== 'coin') { this.feed.push(`${label} +${pts}`); if (this.feed.length > 8) this.feed.shift(); }
      if (this.mult >= 2 && this.mult > prevMult && Number.isInteger(this.mult)) this.sting('combo', this.mult);
      return pts;
    }
    pop(text, x, y, color, size, rainbow) {
      this.popups.push({ text, x, y, color: color || '#ffd700', size: size || 22, t: 0, life: rainbow ? 1.6 : 1.2, rainbow: !!rainbow, vy: -1.6 });
      if (this.popups.length > 24) this.popups.shift();
    }
    sting(name, n) { if (this.onSting) { try { this.onSting(name, n); } catch (e) { /* sound must not break the game */ } } }
    addShake(k) { if (this.shakeScale > 0) this.shake = Math.min(1, this.shake + k); }   // the renderer scales the offset
    addHitStop(s) { if (this.hitStopCool <= 0) { this.hitStop = Math.max(this.hitStop, s); this.hitStopCool = 0.35; } }
    takeHitStop() { const h = this.hitStop; this.hitStop = 0; return h; }
    burst(x, y, n, kinds) {
      const count = Math.round(n * Math.max(0, this.particleScale));
      if (count <= 0) return;
      for (let i = 0; i < count; i++) {
        const kind = kinds[i % kinds.length];
        const a = Math.random() * TAU, sp = kind === 'drop' ? 2 + Math.random() * 6 : 1.5 + Math.random() * 5;
        this.parts.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'drop' ? 3 : 1.5), t: 0, life: 0.5 + Math.random() * 0.6,
          s: kind === 'drop' ? 0.05 + Math.random() * 0.07 : 0.07 + Math.random() * 0.09, rot: Math.random() * TAU, c: kind === 'star' ? ['#ffffff', '#ffd700', '#ff00ff', '#00ffff'][i % 4] : '#e0001b' });
      }
      if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
    }

    onEvent(name, d) {
      const sim = this.sim;
      const main = sim && sim.rider;
      if (name === 'sever') {
        const head = d.joint === 'neck', spine = d.joint === 'spine';
        this.severs += 1;
        const label = head ? 'DECAPITATED!' : (spine ? 'TORN IN HALF!' : 'SEVERED!');
        this.score('sever', head ? POINTS.decap : (spine ? POINTS.spine : POINTS.sever), label, d.x, d.y, '#ff0033', head || spine);
        this.burst(d.x, d.y, 18, ['star', 'drop', 'star']);
        this.addShake(0.35); this.addHitStop(0.06);
        this.sting('sparkle', 1);
      } else if (name === 'death') {
        if (d.ragdoll && main && d.ragdoll !== main) return;
        this.addShake(0.55); this.addHitStop(0.08);
        if (this.chain >= 2) { this.pop('COMBO BROKEN', this.focusX(), this.focusY() - 1.2, '#ff0033', 26, false); this.sting('crack', this.chain); this.addShake(0.3); }
        this.chain = 0; this.mult = 1; this.chainT = 0; this.crashed = true;
      } else if (name === 'thud') {
        const I = d.I || 0;
        if ((d.a === 'part' || d.b === 'part') && I > 260) { this.addShake(Math.min(0.45, I / 1800)); if (I > 520) this.addHitStop(0.045); }
      } else if (name === 'wound') {
        if (d.ragdoll && main && d.ragdoll === main && (d.amount || 0) >= 12) this.flash = 0.05;
      } else if (name === 'explosion') {
        this.addShake(0.7); this.addHitStop(0.07);
        this.burst(d.x, d.y, 10, ['star']);
      }
    }
    focusX() { try { return this.sim.focusBody().getPosition().x; } catch (e) { return 0; } }
    focusY() { try { return this.sim.focusBody().getPosition().y; } catch (e) { return 0; } }

    /* ---------- per step ---------- */
    update(sim, dt) {
      if (!sim || sim !== this.sim) return;
      this.hitStopCool = Math.max(0, this.hitStopCool - dt);
      const veh = sim.vehicle, frame = veh && veh.frame;
      if (frame) {
        const p = frame.getPosition();
        this.trail.push({ x: p.x, y: p.y });
        if (this.trail.length > 36) this.trail.shift();
      }
      if (this.chainT > 0) { this.chainT -= dt; if (this.chainT <= 0) { this.chain = 0; this.mult = 1; } }
      if (this.coinT > 0) { this.coinT -= dt; if (this.coinT <= 0) this.coinChain = 0; }
      if (sim.status !== 'playing' || !frame) { this.air = false; return; }
      this.updateAir(sim, veh, frame, dt);
      this.updateTokens(sim, veh);
    }

    updateAir(sim, veh, frame, dt) {
      const P = WR.physics, rd = sim.rider;
      const attached = rd && rd.alive && rd.isAttached();
      let airborne = false;
      if (attached && P && typeof P.touchingGround === 'function') {
        const set = veh.assemblySet();
        airborne = true;
        for (const b of set) { if (P.touchingGround(b, set)) { airborne = false; break; } }
      }
      const a = frame.getAngle();
      if (airborne) {
        if (!this.air) { this.air = true; this.airT = 0; this.spin = 0; this.flipsThisAir = 0; }
        else this.spin += wrap(a - this.prevAngle);
        this.airT += dt;
        const need = TAU * (this.flipsThisAir + 1) - 0.6;
        if (Math.abs(this.spin) >= need) {
          this.flipsThisAir += 1; this.flips += 1;
          const dir = this.spin > 0 ? 'FRONTFLIP' : 'BACKFLIP';
          const n = this.flipsThisAir;
          const pre = n === 1 ? '' : (['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD '][n] || `${n}x `);
          const p = frame.getPosition();
          this.score('flip', POINTS.flip, `${pre}${dir}!`, p.x, p.y - 0.8, '#00ff00', true);   // the combo multiplier grows per flip
          this.sting('trick', this.flipsThisAir + 1);
        }
      } else if (this.air) {
        this.air = false;
        const minAir = veh.id === 'pogo' ? 1.15 : 0.75;
        if (attached && this.airT >= minAir) {
          const t = this.airT, p = frame.getPosition();
          const label = t >= 3.5 ? 'HUGE AIR!' : (t >= 2 ? 'BIG AIR!' : 'AIR');
          this.score('air', POINTS.air * t, `${label} ${t.toFixed(1)}s`, p.x, p.y - 0.8, '#00ffff', t >= 2);
          this.sting('trick', 1);
        }
      }
      this.prevAngle = a;
    }

    updateTokens(sim, veh) {
      if (!this.tokens.length) return;
      const fx = this.focusX();
      let bodies = null;
      for (const tk of this.tokens) {
        if (tk.taken || Math.abs(tk.x - fx) > 5) continue;
        if (!bodies) { bodies = veh.bodies.slice(); for (const rd of sim.ragdolls) if (rd.alive) bodies.push(...rd.allBodies()); }
        for (const b of bodies) {
          const p = b.getPosition();
          if ((p.x - tk.x) * (p.x - tk.x) + (p.y - tk.y) * (p.y - tk.y) < TOKEN_R * TOKEN_R) {
            tk.taken = true; tk.t = 0;
            this.coins += 1;
            this.coinChain = this.coinT > 0 ? this.coinChain + 1 : 1; this.coinT = 2.2;
            this.score('coin', POINTS.coin, 'COIN', tk.x, tk.y, '#ffd700', false);
            this.pickups.push({ x: tk.x, y: tk.y });
            this.burst(tk.x, tk.y, 6, ['star']);
            this.sting('coin', this.coinChain);
            break;
          }
        }
      }
    }

    /* ---------- per frame (real time) ---------- */
    tick(dt) {
      dt = Math.min(dt || 0, 0.1);
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.flash = Math.max(0, this.flash - dt);
      for (const p of this.popups) { p.t += dt; p.y += p.vy * dt; p.vy *= (1 - 2 * dt); }
      this.popups = this.popups.filter((p) => p.t < p.life);
      for (const p of this.parts) { p.t += dt; p.vy += 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 6; }
      this.parts = this.parts.filter((p) => p.t < p.life);
      for (const tk of this.tokens) tk.t += dt;
    }
  }
  // planck.Vec2 when available (browser global `planck`, or the Node harness's global)
  function planckVec(x, y) { const pl = g.planck; return pl && pl.Vec2 ? pl.Vec2(x, y) : { x, y }; }
  Juice.POINTS = POINTS;
  WR.Juice = Juice;
})();
