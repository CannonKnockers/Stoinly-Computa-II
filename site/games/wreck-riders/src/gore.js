/* Wreck Riders - blood particles, stains and effect particles. DOM-free (rendering lives in render.js). */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const P = WR.physics, U = WR.util;
  const V = P.v;

  class Gore {
    constructor(sim) {
      this.sim = sim;
      this.world = sim.world;
      this.particles = [];   // blood drops
      this.stains = [];      // ring buffer of {x,y,r,a}
      this.stainHead = 0;
      this.fx = [];          // fire / smoke / sparks / flame
      this.MAX_P = 650;
      this.MAX_S = 2600;
      this.totalBlood = 0;
    }
    blood(x, y, n, vx, vy, r) {
      for (let i = 0; i < n; i++) {
        if (this.particles.length >= this.MAX_P) return;
        this.particles.push({ x, y, px: x, py: y, vx: vx + U.rand(-0.6, 0.6), vy: vy + U.rand(-0.6, 0.6), r: r || U.rand(0.03, 0.08), t: 0, life: U.rand(2.5, 5) });
        this.totalBlood++;
      }
    }
    burst(x, y, n, vx, vy, spread) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, sp = (0.2 + Math.random() * 0.8) * spread;
        this.blood(x + U.rand(-0.05, 0.05), y + U.rand(-0.05, 0.05), 1, vx + Math.cos(a) * sp, vy + Math.sin(a) * sp - spread * 0.25, U.rand(0.03, 0.09));
      }
    }
    stain(x, y, r) {
      const s = { x, y, r, a: U.rand(0.6, 0.95) };
      if (this.stains.length < this.MAX_S) this.stains.push(s);
      else { this.stains[this.stainHead] = s; this.stainHead = (this.stainHead + 1) % this.MAX_S; }
    }
    fxAdd(p) { if (this.fx.length < 900) this.fx.push(p); }
    explosion(x, y, power) {
      const k = power || 1;
      for (let i = 0; i < 46 * k; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(2, 16) * k;
        this.fxAdd({ kind: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, r: U.rand(0.25, 0.7), t: 0, life: U.rand(0.35, 0.8) });
      }
      for (let i = 0; i < 30 * k; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(1, 6);
        this.fxAdd({ kind: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: U.rand(0.4, 1.0), t: 0, life: U.rand(1.5, 3.2) });
      }
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(6, 22);
        this.fxAdd({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, r: 0.05, t: 0, life: U.rand(0.5, 1.3) });
      }
    }
    flame(x, y, dx, dy, strength) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        this.fxAdd({ kind: 'flame', x: x + U.rand(-0.06, 0.06), y: y + U.rand(-0.06, 0.06), vx: dx * U.rand(6, 11) * strength + U.rand(-1, 1), vy: dy * U.rand(6, 11) * strength + U.rand(-1, 1), r: U.rand(0.16, 0.3), t: 0, life: U.rand(0.18, 0.32) });
      }
    }
    sparks(x, y, n, vx, vy) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(2, 9);
        this.fxAdd({ kind: 'spark', x, y, vx: (vx || 0) + Math.cos(a) * sp, vy: (vy || 0) + Math.sin(a) * sp, r: 0.04, t: 0, life: U.rand(0.3, 0.7) });
      }
    }
    smoke(x, y, n, r) {
      for (let i = 0; i < (n || 1); i++) this.fxAdd({ kind: 'smoke', x, y, vx: U.rand(-1, 1), vy: U.rand(-2.5, -0.5), r: r || U.rand(0.2, 0.5), t: 0, life: U.rand(0.8, 1.6) });
    }
    glassBits(x, y, n, vx, vy) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(1, 7);
        this.fxAdd({ kind: 'glass', x, y, vx: vx * 0.5 + Math.cos(a) * sp, vy: vy * 0.5 + Math.sin(a) * sp, r: U.rand(0.04, 0.1), t: 0, life: U.rand(0.8, 1.6), rot: Math.random() * 6, spin: U.rand(-10, 10) });
      }
    }

    update(dt) {
      const G = P.GRAVITY, world = this.world;
      // blood drops: integrate, then ray cast against static geometry to leave a stain
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.t += dt;
        if (p.t > p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        p.px = p.x; p.py = p.y;
        p.vy += G * dt;
        p.vx *= (1 - 0.3 * dt); p.vy *= (1 - 0.3 * dt);
        p.x += p.vx * dt; p.y += p.vy * dt;
        let hit = null;
        world.rayCast(V(p.px, p.py), V(p.x, p.y), (fixture, point, normal, fraction) => {
          if (fixture.isSensor()) return -1;
          const b = fixture.getBody();
          if (b.isDynamic()) return -1;
          hit = { x: point.x, y: point.y };
          return fraction;
        });
        if (hit) {
          this.stain(hit.x, hit.y, p.r * U.rand(1.6, 2.6));
          ps[i] = ps[ps.length - 1]; ps.pop();
        }
      }
      // effects
      const fx = this.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.t += dt;
        if (p.t > p.life) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        switch (p.kind) {
          case 'fire': p.vx *= (1 - 2.5 * dt); p.vy *= (1 - 2.5 * dt); p.vy -= 6 * dt; p.r += 0.6 * dt; break;
          case 'smoke': p.vx *= (1 - 1.2 * dt); p.vy *= (1 - 1.2 * dt); p.vy -= 1.5 * dt; p.r += 0.5 * dt; break;
          case 'spark': p.vy += G * dt; break;
          case 'flame': p.vx *= (1 - 3 * dt); p.vy *= (1 - 3 * dt); p.r *= (1 - 1.5 * dt); break;
          case 'glass': p.vy += G * dt; p.rot += p.spin * dt; break;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
  }
  WR.Gore = Gore;
})();
