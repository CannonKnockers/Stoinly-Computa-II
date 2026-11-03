/* Wreck Riders - synthesized audio. Web Audio API only (no audio files). Browser only.
 * Interface (see docs/ENGINE.md):
 *   const audio = new WR.Audio();
 *   audio.unlock();           // from a user gesture: creates the AudioContext lazily, resumes it if suspended
 *   audio.attach(sim);        // subscribe to sim.events ('sfx', 'thud', 'wound', 'sever', 'death', 'detach', 'eject', 'win',
 *                             //   'explosion', 'hop', 'boing', 'land'); detaches from the previous sim first
 *   audio.update(sim, dt);    // continuous sounds from vehicle state (rocketOn, wheelSpeed, charging, nearby blades)
 *   audio.ui(name);           // 'move' | 'select' | 'back'
 *   audio.sting(name, n);     // reward/feedback stings: 'coin' 'trick' 'combo' 'crack' 'sparkle' 'star' 'unlock' 'reward'
 *                             //   'chestShake' 'chestOpen' 'buy' 'nope' (n = chain/combo/star number where it matters)
 *   audio.setMuted(bool); audio.muted
 *   audio.setVolume(0..1)     // STOINLY NEXUS sfx volume; multiplies the master gain (0 = skip every one-shot)
 *   audio.silenceLoops();     // fade out every looping sound (pause, leaving a level for the menus)
 * Every method is a no-op before unlock() (no context) and never throws into the game loop: a failure inside a sound is
 * recorded in audio.lastError and surfaced through WR.lastError (the renderer draws that in red).
 *
 * Signal path: one-shots and loops -> bus -> compressor -> master (0.5 x volume, or 0 when muted) -> destination.
 * Everything is procedural: oscillators, one shared white-noise buffer, biquad filters, gain envelopes, one wave shaper.
 */
(function () {
  const WR = window.WR = window.WR || {};
  const U = WR.util || { clamp: (v, a, b) => (v < a ? a : (v > b ? b : v)), rand: (a, b) => a + Math.random() * (b - a) };

  const MASTER_GAIN = 0.5;
  const MAX_VOICES = 28;        // concurrently sounding one-shots before low-priority ones are dropped
  const THUD_PER_SEC = 8;
  const THUD_MIN_I = 28;        // N*s; the sim already drops thuds below 20
  const BLADE_RANGE = 15;       // m
  const LOOP_RATE = 1 / 30;     // continuous parameters are refreshed at ~30 Hz (plenty for smoothing, cheap on CPU)
  const EVENTS = ['sfx', 'thud', 'wound', 'sever', 'death', 'detach', 'eject', 'win', 'explosion', 'hop', 'boing', 'land'];
  // minimum spacing (s) between repeats of one sound, so a burst of events in one frame does not stack dozens of voices
  const MIN_GAP = {
    wound: 0.05, sever: 0.06, death: 0.2, detach: 0.05, eject: 0.1, win: 1, explosion: 0.05, hop: 0.05, boing: 0.05, land: 0.05,
    'sting:coin': 0.03, 'sting:trick': 0.08, 'sting:combo': 0.08, 'sting:crack': 0.2, 'sting:sparkle': 0.08, 'sting:star': 0.1,
    'sting:unlock': 0.3, 'sting:reward': 0.3, 'sting:chestShake': 0.05, 'sting:chestOpen': 0.5, 'sting:buy': 0.1, 'sting:nope': 0.15,
    spikes: 0.06, clank: 0.05, blade: 0.08, grind: 0.08, boost: 0.1, glass: 0.08, tramp: 0.08, harpoon: 0.05, stab: 0.05, thunk: 0.05, release: 0.1,
  };
  const METAL = { vehicle: 1, platform: 1, spikes: 1, blade: 1, rotator: 1, mover: 1, van: 1, vanwheel: 1, wreckball: 1, link: 1, anchor: 1, turret: 1, projectile: 1 };
  const WOOD = { crate: 1, plank: 1, ramp: 1, ball: 1, pivot: 1 };
  // wheel hum flavours: rad/s at full volume and the loudest gain
  const HUM = { wheelchair: { full: 40, max: 0.18 }, scooter: { full: 55, max: 0.12 }, bike: { full: 34, max: 0.22 } };

  class Audio {
    constructor() {
      this.muted = false;
      this.volume = 1;           // STOINLY NEXUS sfx volume (master x sfx, 0 when muted there); multiplies MASTER_GAIN
      this.ctx = null;
      this.sim = null;
      this.handlers = null;
      this.lastError = null;
      this.failed = false;       // AudioContext construction failed: do not retry on every key press
      this.master = null; this.comp = null; this.bus = null;
      this.noiseBuf = null; this.tickBuf = null; this.curve = null;
      this.rocket = null; this.hum = null; this.creak = null; this.bladeLoop = null;
      this.voices = [];          // end times of scheduled one-shots (voice cap)
      this.thudStamps = [];      // start times of recent thuds (rate limit)
      this.last = {};            // last start time per sound name (MIN_GAP)
      this.loopAcc = 0;
    }

    /* ---------------- lifecycle ---------------- */

    /** Create the AudioContext (lazily, from a user gesture) and resume it if the browser suspended it. */
    unlock() {
      try {
        if (!this.ctx) {
          if (this.failed) return;
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) { this.failed = true; return; }
          this.ctx = new AC();
          this.buildGraph();
        }
        const A = this.ctx;
        if (A.state === 'suspended' && typeof A.resume === 'function') {
          const p = A.resume();
          if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay policy: try again on the next gesture */ });
        }
      } catch (e) { this.failed = true; this.ctx = null; this.fail(e); }
    }

    buildGraph() {
      const A = this.ctx;
      this.comp = A.createDynamicsCompressor();
      setParam(this.comp.threshold, -18); setParam(this.comp.knee, 20); setParam(this.comp.ratio, 6);
      setParam(this.comp.attack, 0.004); setParam(this.comp.release, 0.2);
      this.master = A.createGain();
      this.master.gain.value = this.gainNow();
      this.bus = A.createGain();
      this.bus.gain.value = 1;
      this.bus.connect(this.comp);
      this.comp.connect(this.master);
      this.master.connect(A.destination);
      const sr = A.sampleRate || 44100;
      // 2 s of white noise; every noise burst starts at a random offset so repeats differ
      const n = Math.floor(sr * 2);
      this.noiseBuf = A.createBuffer(1, n, sr);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      // one 1.5 ms click in a 1/60 s buffer: looped, its playback rate turns wheel speed into a freewheel tick rate
      const tn = Math.max(16, Math.floor(sr / 60));
      this.tickBuf = A.createBuffer(1, tn, sr);
      const td = this.tickBuf.getChannelData(0);
      const cl = Math.max(4, Math.floor(sr * 0.0015));
      for (let i = 0; i < cl && i < tn; i++) td[i] = (Math.random() * 2 - 1) * (1 - i / cl);
      // soft-clip curve (explosions)
      const curve = new Float32Array(257);
      for (let i = 0; i <= 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3) / Math.tanh(3); }
      this.curve = curve;
    }

    /** Subscribe to a sim's events; unsubscribes from the previous sim. Safe before unlock(). */
    attach(sim) {
      this.detach();
      this.sim = sim || null;
      if (!sim || !sim.events || typeof sim.events.on !== 'function') return;
      const H = this.handlers = {};
      for (const name of EVENTS) {
        H[name] = (d) => { if (this.sim === sim) this.onEvent(name, d || {}); };
        sim.events.on(name, H[name]);
      }
      this.silenceLoops();
    }

    detach() {
      const sim = this.sim, H = this.handlers;
      this.sim = null; this.handlers = null;
      if (!sim || !H || !sim.events) return;
      // WR.util.Emitter has no off(): remove our listeners from its Map of arrays
      const map = sim.events.map;
      if (!map || typeof map.get !== 'function') return;
      for (const name in H) {
        const l = map.get(name);
        if (!l) continue;
        const i = l.indexOf(H[name]);
        if (i >= 0) l.splice(i, 1);
      }
    }

    setMuted(m) {
      this.muted = !!m;
      this.applyGain();
    }
    /** Volume 0..1 from the shared settings (StoinlySettings.volume('sfx'), which is already 0 when muted). */
    setVolume(v) {
      v = Number(v);
      this.volume = Number.isFinite(v) ? U.clamp(v, 0, 1) : 1;
      this.applyGain();
    }
    /** True when nothing would be heard: one-shots are skipped entirely. */
    silent() { return this.muted || !(this.volume > 0); }
    gainNow() { return this.silent() ? 0 : MASTER_GAIN * this.volume; }
    applyGain() {
      if (!this.ctx || !this.master) return;
      try { this.master.gain.setTargetAtTime(this.gainNow(), this.ctx.currentTime, 0.02); } catch (e) { this.fail(e); }
    }

    fail(e) {
      this.lastError = e;
      if (!WR.lastError) WR.lastError = 'audio: ' + (e && e.message ? e.message : String(e));
    }

    /* ---------------- continuous sounds ---------------- */

    update(sim, dt) {
      const A = this.ctx;
      if (!A || !sim) return;
      this.loopAcc += (typeof dt === 'number' && dt > 0) ? dt : 1 / 60;
      if (this.loopAcc < LOOP_RATE) return;
      this.loopAcc = 0;
      try {
        const t = A.currentTime;
        const v = sim.vehicle;
        const playing = sim.status === 'playing';
        if (v) {
          this.updateRocket(v, playing, t);
          this.updateHum(v, playing, t);
          this.updateCreak(v, playing, t);
        }
        this.updateBlade(sim, t);
      } catch (e) { this.fail(e); }
    }

    silenceLoops() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      try {
        if (this.rocket) { this.rocket.target = -1; this.rocket.gain.gain.setTargetAtTime(0, t, 0.03); }
        if (this.creak) { this.creak.target = -1; this.creak.gain.gain.setTargetAtTime(0, t, 0.03); }
        if (this.bladeLoop) this.bladeLoop.gain.gain.setTargetAtTime(0, t, 0.03);
        this.killHum();
      } catch (e) { this.fail(e); }
    }

    loopGain() { const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.bus); return g; }

    // wheelchair rocket: band-passed noise roar (band centre wobbles with an LFO) + a low rumble
    updateRocket(v, playing, t) {
      const on = playing && !!v.rocketOn;
      if (!this.rocket) {
        if (!on) return;
        const gain = this.loopGain();
        const roar = this.noise(t, null, 1, true);
        const bp = this.filt('bandpass', 420, 0.7);
        this.link(roar, bp, gain);
        const lfo = this.osc('sine', 6.5, t, null);
        const lg = this.ctx.createGain(); lg.gain.value = 140;
        this.link(lfo, lg, bp.frequency);
        const rumble = this.noise(t, null, 0.5, true);
        const lp = this.filt('lowpass', 110, 1.2);
        const rg = this.ctx.createGain(); rg.gain.value = 1.6;
        this.link(rumble, lp, rg, gain);
        this.rocket = { gain, bp, target: -1 };
      }
      const R = this.rocket;
      const target = on ? 0.55 : 0;
      if (target !== R.target) {
        R.target = target;
        // a target follower with tau = 27 ms reaches 95 % in ~80 ms: click-free in and out
        R.gain.gain.setTargetAtTime(target, t, 0.027);
      }
      if (on && v.frame && typeof v.frame.getLinearVelocity === 'function') {
        const vel = v.frame.getLinearVelocity();
        const sp = Math.hypot(vel.x || 0, vel.y || 0);
        R.bp.frequency.setTargetAtTime(380 + U.clamp(sp, 0, 30) * 7, t, 0.1);
      }
    }

    // wheel / engine hum: pitch and level follow |wheelSpeed| while a wheel touches the ground
    updateHum(v, playing, t) {
      const kind = HUM[v.id] ? v.id : null;
      if (this.hum && this.hum.id !== kind) this.killHum();
      if (!kind) return;
      let grounded = false;
      if (typeof v.anyWheelGrounded === 'function') grounded = !!v.anyWheelGrounded();
      const ws = Math.abs(+v.wheelSpeed || 0);
      const active = playing && grounded && ws > 1.5;
      if (!this.hum) {
        if (!active) return;
        this.hum = this.buildHum(kind, t);
      }
      const H = this.hum, spec = HUM[kind];
      const amt = active ? U.clamp(ws / spec.full, 0, 1) : 0;
      H.gain.gain.setTargetAtTime(active ? spec.max * (0.25 + 0.75 * amt) : 0, t, active ? 0.06 : 0.1);
      if (active) H.setSpeed(ws, t);
    }

    buildHum(kind, t) {
      const A = this.ctx;
      const gain = this.loopGain();
      const H = { id: kind, gain, sources: [] };
      if (kind === 'wheelchair') {
        // quiet rubber hum: low-passed noise + a soft sine
        const n = this.noise(t, null, 1, true);
        const lp = this.filt('lowpass', 180, 0.9);
        this.link(n, lp, gain);
        const o = this.osc('sine', 60, t, null);
        const og = A.createGain(); og.gain.value = 0.5;
        this.link(o, og, gain);
        H.sources.push(n, o);
        H.setSpeed = (ws, tt) => {
          lp.frequency.setTargetAtTime(160 + ws * 4, tt, 0.08);
          o.frequency.setTargetAtTime(50 + ws * 0.9, tt, 0.08);
        };
      } else if (kind === 'scooter') {
        // electric whine: sawtooth + an octave above, low-passed
        const o = this.osc('sawtooth', 300, t, null);
        const o2 = this.osc('square', 600, t, null);
        const g2 = A.createGain(); g2.gain.value = 0.25;
        const lp = this.filt('lowpass', 1400, 1.5);
        o.connect(lp); this.link(o2, g2, lp); lp.connect(gain);
        H.sources.push(o, o2);
        H.setSpeed = (ws, tt) => {
          const f = 180 + ws * 9;
          o.frequency.setTargetAtTime(f, tt, 0.05);
          o2.frequency.setTargetAtTime(f * 2, tt, 0.05);
        };
      } else {
        // bike: soft freewheel ticking, 12 ticks per wheel revolution (looped click; rate 1 = 60 ticks/s)
        const s = A.createBufferSource();
        s.buffer = this.tickBuf; s.loop = true; s.playbackRate.value = 0.5;
        s.start(t);
        const bp = this.filt('bandpass', 2600, 3);
        this.link(s, bp, gain);
        H.sources.push(s);
        H.setSpeed = (ws, tt) => {
          const ticksPerSec = ws * (12 / (2 * Math.PI));
          s.playbackRate.setTargetAtTime(U.clamp(ticksPerSec / 60, 0.1, 3), tt, 0.08);
        };
      }
      return H;
    }

    killHum() {
      const H = this.hum;
      this.hum = null;
      if (!H) return;
      try {
        for (const s of H.sources) s.stop();
        H.gain.disconnect();
      } catch (e) { /* already stopped */ }
    }

    // pogo spring creak while charging: a resonant sawtooth whose pitch rises with compression
    updateCreak(v, playing, t) {
      const on = playing && v.id === 'pogo' && !!v.charging;
      if (!this.creak) {
        if (!on) return;
        const gain = this.loopGain();
        const osc = this.osc('sawtooth', 110, t, null);
        const bp = this.filt('bandpass', 330, 7);
        const vib = this.osc('sine', 11, t, null);
        const vg = this.ctx.createGain(); vg.gain.value = 6;
        this.link(vib, vg, osc.frequency);
        this.link(osc, bp, gain);
        this.creak = { gain, osc, bp, target: -1 };
      }
      const C = this.creak;
      const target = on ? 0.16 : 0;
      if (target !== C.target) { C.target = target; C.gain.gain.setTargetAtTime(target, t, on ? 0.03 : 0.05); }
      if (on) {
        const comp = U.clamp(+v.compression || 0, 0, 0.5);
        const f = 110 * (1 + comp * 2.6);     // 110 Hz extended -> ~250 Hz squashed
        C.osc.frequency.setTargetAtTime(f, t, 0.05);
        C.bp.frequency.setTargetAtTime(f * 3, t, 0.05);
      }
    }

    // circular saw whir when a blade hazard is near the camera focus; level by distance
    updateBlade(sim, t) {
      const hz = sim.hazards;
      if (!hz || !hz.length || typeof sim.focusBody !== 'function') return;
      const fb = sim.focusBody();
      if (!fb) return;
      const p = fb.getPosition();
      let best = Infinity, bestH = null;
      for (let i = 0; i < hz.length; i++) {
        const h = hz[i];
        if (!h || h.type !== 'blade' || !h.body) continue;
        const q = h.body.getPosition();
        const d = Math.hypot(q.x - p.x, q.y - p.y) - (h.r || 0);
        if (d < best) { best = d; bestH = h; }
      }
      const on = best < BLADE_RANGE;
      if (!this.bladeLoop) {
        if (!on) return;
        const gain = this.loopGain();
        const osc = this.osc('sawtooth', 130, t, null);
        const lp = this.filt('lowpass', 900, 1);
        this.link(osc, lp, gain);
        const n = this.noise(t, null, 1, true);
        const bp = this.filt('bandpass', 3200, 2.5);
        const ng = this.ctx.createGain(); ng.gain.value = 0.5;
        this.link(n, bp, ng, gain);
        this.bladeLoop = { gain, osc };
      }
      const amt = on ? U.clamp(1 - best / BLADE_RANGE, 0, 1) : 0;
      this.bladeLoop.gain.gain.setTargetAtTime(0.3 * amt * amt, t, 0.08);
      if (on) {
        const w = typeof bestH.body.getAngularVelocity === 'function' ? Math.abs(bestH.body.getAngularVelocity()) : 9;
        this.bladeLoop.osc.frequency.setTargetAtTime(90 + U.clamp(w, 0, 40) * 6, t, 0.1);
      }
    }

    /* ---------------- events ---------------- */

    onEvent(name, d) {
      if (!this.ctx) return;
      try {
        switch (name) {
          case 'sfx': this.sfx(d); break;
          case 'thud': this.thud(d); break;
          case 'wound': this.wound(d); break;
          case 'sever': this.sever(d); break;
          case 'death': this.death(d); break;
          case 'detach': this.snap(d); break;
          case 'eject': this.whoosh(d); break;
          case 'win': this.win(d); break;
          case 'explosion': this.explosion(d); break;
          case 'hop': this.hop(d); break;
          case 'boing': this.boing(d); break;
          case 'land': this.land(d); break;
          default: break;
        }
      } catch (e) { this.fail(e); }
    }

    sfx(d) {
      switch (d.name) {
        case 'spikes': this.spikes(d); break;
        case 'clank': this.clank(d); break;
        case 'blade': this.bladeHit(d); break;
        case 'grind': this.grind(d); break;
        case 'boost': this.boost(d); break;
        case 'glass': this.glass(d); break;
        case 'tramp': this.tramp(d); break;
        case 'harpoon': this.harpoon(d); break;
        case 'stab': this.stab(d); break;
        case 'thunk': this.thunk(d); break;
        case 'release': this.release(d); break;
        case 'explosion': break;   // the sim emits the 'explosion' event right after this sfx; played there
        default: break;
      }
    }

    ui(name) {
      if (!this.ctx) return;
      try {
        const t = this.begin('ui', 0.15, 1);
        if (t == null) return;
        const pv = U.rand(0.98, 1.02);   // menu blips stay nearly constant
        if (name === 'move') this.blip(t, 880 * pv, 0.04, 0.12);
        else if (name === 'select') { this.blip(t, 660 * pv, 0.05, 0.15); this.blip(t + 0.055, 990 * pv, 0.08, 0.15); }
        else if (name === 'back') { this.blip(t, 520 * pv, 0.05, 0.13); this.blip(t + 0.055, 390 * pv, 0.08, 0.12); }
        else this.blip(t, 700 * pv, 0.04, 0.1);
      } catch (e) { this.fail(e); }
    }

    /**
     * Reward and feedback stings (synthesized, like everything else here):
     * 'coin' (n = pickup chain: the tink climbs a semitone per coin), 'trick' (n = flip count), 'combo' (n = multiplier),
     * 'crack' (combo broken), 'sparkle' (gore sparkle), 'star' (n = 1..3, rising), 'unlock' / 'reward' (rising arpeggio),
     * 'chestShake', 'chestOpen', 'buy', 'nope'.
     */
    sting(name, n) {
      if (!this.ctx) return;
      try {
        const k = Math.max(0, Math.min(16, (n | 0) || 0));
        const t = this.begin('sting:' + name, 0.6, name === 'crack' || name === 'star' || name === 'unlock' ? 2 : 1);
        if (t == null) return;
        const semi = (s) => Math.pow(2, s / 12);
        const bell = (on, f, amp, dur) => {
          for (const [mul, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
            const o = this.osc('sine', f * mul, on, dur + 0.02);
            this.link(o, this.gainEnv(on, 0.002, amp * a, on + dur * (mul > 1 ? 0.5 : 1)));
          }
        };
        const arp = (on, notes, step, amp, type) => {
          notes.forEach((f, i) => {
            const s0 = on + i * step, last = i === notes.length - 1;
            const o = this.osc(type || 'square', f, s0, (last ? 0.45 : 0.14) + 0.02);
            const lp = this.filt('lowpass', 3600, 0.7); lp.connect(this.bus);
            this.link(o, this.gainEnv(s0, 0.004, amp, s0 + (last ? 0.45 : 0.14), 0, lp));
          });
        };
        switch (name) {
          case 'coin': { const f = 1318.5 * semi(Math.min(k, 12)); bell(t, f, 0.11, 0.18); bell(t + 0.06, f * 1.5, 0.08, 0.22); break; }
          case 'trick': { const b = 523.25 * semi(Math.min(k, 6) * 2); arp(t, [b, b * semi(4), b * semi(7)], 0.06, 0.07, 'triangle'); break; }
          case 'combo': { const b = 659.25 * semi(Math.min(k, 5) * 2); arp(t, [b, b * 2], 0.05, 0.06, 'square'); break; }
          case 'crack': {
            const nz = this.noise(t, 0.25, 0.6);
            const bp = this.filt('bandpass', 2400, 1.4);
            this.sweep(bp.frequency, 2400, 500, t, t + 0.2);
            this.link(nz, bp, this.gainEnv(t, 0.002, 0.35, t + 0.22));
            const o = this.osc('sawtooth', 220, t, 0.32);
            this.sweep(o.frequency, 220, 55, t, t + 0.3);
            this.link(o, this.filt('lowpass', 900, 1), this.gainEnv(t, 0.003, 0.12, t + 0.3));
            break;
          }
          case 'sparkle': { for (let i = 0; i < 3; i++) bell(t + i * 0.035, 2093 * semi(i * 5), 0.04, 0.12); break; }
          case 'star': { const f = [0, 1046.5, 1318.5, 1568][Math.max(1, Math.min(3, k))]; bell(t, f, 0.16, 0.5); bell(t + 0.04, f * 2, 0.05, 0.3); break; }
          case 'unlock': case 'reward': arp(t, [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], 0.07, 0.08, 'square'); bell(t + 0.42, 2093, 0.08, 0.6); break;
          case 'chestShake': {
            const nz = this.noise(t, 0.08, 0.3);
            this.link(nz, this.filt('bandpass', 380 + k * 60, 3), this.gainEnv(t, 0.002, 0.3, t + 0.07));
            break;
          }
          case 'chestOpen': {
            const nz = this.noise(t, 0.4, 1);
            const hp = this.filt('highpass', 600, 0.7);
            this.sweep(hp.frequency, 600, 6000, t, t + 0.35);
            this.link(nz, hp, this.gainEnv(t, 0.02, 0.12, t + 0.38));
            arp(t + 0.12, [783.99, 987.77, 1174.66, 1567.98], 0.06, 0.08, 'triangle');
            break;
          }
          case 'buy': bell(t, 1567.98, 0.12, 0.15); bell(t + 0.08, 2093, 0.12, 0.3); break;
          case 'nope': { const o = this.osc('square', 140, t, 0.2); this.link(o, this.filt('lowpass', 700, 1), this.gainEnv(t, 0.004, 0.1, t + 0.18)); break; }
          default: this.blip(t, 900, 0.05, 0.08);
        }
      } catch (e) { this.fail(e); }
    }

    /* ---------------- scheduling helpers ---------------- */

    /** Start time for a new one-shot, or null when it should be skipped (muted, suspended, too soon, too many voices). */
    begin(name, dur, priority) {
      const A = this.ctx;
      if (!A || this.silent() || A.state !== 'running') return null;
      const now = A.currentTime;
      const gap = MIN_GAP[name] || 0;
      if (gap && this.last[name] != null && now - this.last[name] < gap) return null;
      const v = this.voices;
      let k = 0;
      for (let i = 0; i < v.length; i++) if (v[i] > now) v[k++] = v[i];
      v.length = k;
      if (v.length >= MAX_VOICES && priority < 2) return null;
      if (v.length >= MAX_VOICES + 8) return null;
      const t = now + 0.01;   // a little lookahead so the attack ramp is never in the past
      v.push(t + dur);
      this.last[name] = now;
      return t;
    }

    pv() { return U.rand(0.92, 1.08); }

    /** Distance attenuation from the camera focus (1 on top of the player, 1/2 at `range` metres). */
    near(x, y, range) {
      if (typeof x !== 'number' || typeof y !== 'number' || !this.sim || typeof this.sim.focusBody !== 'function') return 1;
      const fb = this.sim.focusBody();
      if (!fb) return 1;
      const p = fb.getPosition();
      const r = Math.hypot(x - p.x, y - p.y) / range;
      return 1 / (1 + r * r);
    }

    /** Gain node with an envelope: linear attack to `peak`, optional hold, exponential decay reaching silence at `end`. */
    gainEnv(t0, att, peak, end, hold, out) {
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const p = g.gain, pk = Math.max(peak, 0.0002), h = hold || 0;
      p.setValueAtTime(0.0001, t0);
      p.linearRampToValueAtTime(pk, t0 + att);
      if (h > 0) p.setValueAtTime(pk, t0 + att + h);
      p.exponentialRampToValueAtTime(0.0001, Math.max(end, t0 + att + h + 0.001));
      g.connect(out || this.bus);
      return g;
    }

    noise(t0, dur, rate, loop) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = !!loop;
      if (rate && rate !== 1) s.playbackRate.value = rate;
      s.start(t0, loop ? 0 : Math.random() * 0.9);
      if (dur != null) s.stop(t0 + dur);
      return s;
    }

    osc(type, f, t0, dur) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start(t0);
      if (dur != null) o.stop(t0 + dur);
      return o;
    }

    filt(type, f, q, gainDb) {
      const b = this.ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      if (q != null) b.Q.value = q;
      if (gainDb != null) b.gain.value = gainDb;
      return b;
    }

    link() {
      for (let i = 0; i + 1 < arguments.length; i++) arguments[i].connect(arguments[i + 1]);
      return arguments[arguments.length - 1];
    }

    sweep(param, f0, f1, t0, t1) {
      param.setValueAtTime(f0, t0);
      param.exponentialRampToValueAtTime(f1, t1);
    }

    blip(t, f, dur, amp) {
      const o = this.osc('sine', f, t, dur + 0.01);
      this.link(o, this.gainEnv(t, 0.004, amp, t + dur));
    }

    /* ---------------- shared building blocks ---------------- */

    // wet squelch: noise through a resonant low-pass that sweeps down, plus a dropping sine
    squelch(t, amp, pv, lowCut) {
      const n = this.noise(t, 0.22, pv);
      const lp = this.filt('lowpass', 1800 * pv, 9);
      this.sweep(lp.frequency, 1800 * pv, (lowCut || 260) * pv, t, t + 0.16);
      this.link(n, lp, this.gainEnv(t, 0.006, amp, t + 0.2));
      const o = this.osc('sine', 420 * pv, t, 0.14);
      this.sweep(o.frequency, 420 * pv, 110 * pv, t, t + 0.1);
      this.link(o, this.gainEnv(t, 0.004, amp * 0.5, t + 0.12));
    }

    // crackly crunch: very slow noise (grainy steps) through a band-pass
    crunch(t, amp, pv) {
      const n = this.noise(t, 0.2, 0.12 * pv);
      const bp = this.filt('bandpass', 1300 * pv, 1.0);
      this.link(n, bp, this.gainEnv(t, 0.004, amp, t + 0.18, 0.04));
    }

    // inharmonic metallic partials
    metal(t, amp, pv, freqs, decay, type) {
      for (let i = 0; i < freqs.length; i++) {
        const o = this.osc(type || 'sine', freqs[i] * pv, t, decay * 1.1 + 0.02);
        this.link(o, this.gainEnv(t, 0.001, amp / (1 + i * 0.6), t + decay * (1 - i * 0.15)));
      }
    }

    /* ---------------- one-shots ---------------- */

    thud(d) {
      const A = this.ctx;
      const I = +d.I || 0;
      if (I < THUD_MIN_I) return;
      const now = A.currentTime;
      const st = this.thudStamps;
      let k = 0;
      for (let i = 0; i < st.length; i++) if (now - st[i] < 1) st[k++] = st[i];
      st.length = k;
      if (st.length >= THUD_PER_SEC) return;
      const t = this.begin('thud', 0.25, 0);
      if (t == null) return;
      st.push(now);
      const vol = U.clamp((I - 20) / 500, 0, 1);
      const amp = (0.15 + 0.55 * vol) * this.near(d.x, d.y, 22);
      const pv = this.pv();
      const n = this.noise(t, 0.16, pv);
      const lp = this.filt('lowpass', (520 - 300 * vol) * pv, 0.8);
      this.link(n, lp, this.gainEnv(t, 0.004, amp, t + 0.14));
      const o = this.osc('sine', 95 * pv, t, 0.2);
      this.sweep(o.frequency, 95 * pv, 45, t, t + 0.12);
      this.link(o, this.gainEnv(t, 0.003, amp * 0.8, t + 0.18));
      // a hint of what was hit
      const metal = METAL[d.a] || METAL[d.b], wood = WOOD[d.a] || WOOD[d.b];
      if (metal) this.metal(t, amp * 0.25, pv, [1180, 2650], 0.16, 'triangle');
      else if (wood) {
        const w = this.osc('triangle', 240 * pv, t, 0.12);
        this.link(w, this.gainEnv(t, 0.002, amp * 0.35, t + 0.1));
      }
    }

    wound(d) {
      const t = this.begin('wound', 0.3, 1);
      if (t == null) return;
      const amt = U.clamp((+d.amount || 20) / 60, 0.3, 1);
      this.squelch(t, 0.45 * amt * this.near(d.x, d.y, 20), this.pv());
    }

    // bone crack: two clicks + crunch + wet splat
    sever(d) {
      const t = this.begin('sever', 0.4, 2);
      if (t == null) return;
      const pv = this.pv(), amp = 0.7 * this.near(d.x, d.y, 24);
      for (const dt of [0, 0.045]) {
        const c = this.noise(t + dt, 0.012, 1.5 * pv);
        this.link(c, this.filt('highpass', 1400 * pv, 1.5), this.gainEnv(t + dt, 0.001, amp, t + dt + 0.012));
      }
      this.crunch(t + 0.02, amp * 0.6, pv);
      this.squelch(t + 0.07, amp * 0.6, pv, 180);
    }

    // short low sting: a detuned minor cluster sliding down behind a closing low-pass
    death(d) {
      const t = this.begin('death', 0.9, 2);
      if (t == null) return;
      const pv = this.pv();
      const lp = this.filt('lowpass', 520 * pv, 2);
      this.sweep(lp.frequency, 520 * pv, 90, t, t + 0.8);
      lp.connect(this.gainEnv(t, 0.02, 0.4, t + 0.85, 0.15));
      for (const f of [55, 55 * 1.189, 110.5]) {
        const o = this.osc('sawtooth', f * pv, t, 0.9);
        this.sweep(o.frequency, f * pv, f * pv * 0.7, t, t + 0.8);
        o.connect(lp);
      }
    }

    // quick snap (a grip tore loose)
    snap(d) {
      const t = this.begin('detach', 0.12, 1);
      if (t == null) return;
      const pv = this.pv();
      const o = this.osc('triangle', 320 * pv, t, 0.07);
      this.sweep(o.frequency, 320 * pv, 70, t, t + 0.05);
      this.link(o, this.gainEnv(t, 0.002, 0.4, t + 0.065));
      const c = this.noise(t, 0.01, 1.4 * pv);
      this.link(c, this.filt('highpass', 2200, 1), this.gainEnv(t, 0.001, 0.35, t + 0.01));
    }

    // eject whoosh
    whoosh(d) {
      const t = this.begin('eject', 0.5, 1);
      if (t == null) return;
      const pv = this.pv();
      const n = this.noise(t, 0.5, pv);
      const bp = this.filt('bandpass', 300 * pv, 1.1);
      bp.frequency.setValueAtTime(300 * pv, t);
      bp.frequency.exponentialRampToValueAtTime(2600 * pv, t + 0.18);
      bp.frequency.exponentialRampToValueAtTime(500 * pv, t + 0.48);
      this.link(n, bp, this.gainEnv(t, 0.08, 0.45, t + 0.48, 0.1));
    }

    // big: sub sine drop + noise with a slow decay, soft-clipped
    explosion(d) {
      const t = this.begin('explosion', 1.8, 2);
      if (t == null) return;
      const A = this.ctx;
      const pv = this.pv(), amp = 0.5 + 0.5 * this.near(d.x, d.y, 60);
      const ws = A.createWaveShaper();
      ws.curve = this.curve;
      ws.oversample = 'none';
      ws.connect(this.gainEnv(t, 0.005, 0.9 * amp, t + 1.7, 0.05));
      const o = this.osc('sine', 75 * pv, t, 1.1);
      this.sweep(o.frequency, 75 * pv, 24, t, t + 0.9);
      this.link(o, this.gainEnv(t, 0.004, 0.9, t + 1.0, 0.1, ws));
      const n = this.noise(t, 1.7, pv);
      const lp = this.filt('lowpass', 1600 * pv, 0.9);
      this.sweep(lp.frequency, 1600 * pv, 120, t, t + 1.5);
      this.link(n, lp, this.gainEnv(t, 0.006, 0.9, t + 1.6, 0.12, ws));
      const c = this.noise(t, 0.06, 1.3);
      this.link(c, this.filt('highpass', 1500, 0.8), this.gainEnv(t, 0.001, 0.5, t + 0.06, 0, ws));
    }

    // metallic stab + squelch
    spikes(d) {
      const t = this.begin('spikes', 0.35, 2);
      if (t == null) return;
      const pv = this.pv(), amp = U.clamp(0.4 + (+d.intensity || 0) / 20, 0.4, 1) * this.near(d.x, d.y, 22);
      this.metal(t, amp * 0.5, pv, [2300, 3470, 5200], 0.09);
      this.squelch(t + 0.03, amp * 0.6, pv, 220);
    }

    clank(d) {
      const t = this.begin('clank', 0.35, 1);
      if (t == null) return;
      const pv = this.pv(), amp = U.clamp(0.3 + (+d.intensity || 0) / 14, 0.3, 1) * this.near(d.x, d.y, 24);
      this.metal(t, amp * 0.35, pv, [640, 1470, 2890, 4100], 0.28, 'triangle');
      const c = this.noise(t, 0.03, 1.2 * pv);
      this.link(c, this.filt('bandpass', 2500 * pv, 1.5), this.gainEnv(t, 0.001, amp * 0.5, t + 0.03));
    }

    // saw screech + crunch (+ splat)
    bladeHit(d) {
      const t = this.begin('blade', 0.4, 2);
      if (t == null) return;
      const pv = this.pv(), amp = 0.7 * this.near(d.x, d.y, 22);
      const o = this.osc('sawtooth', 1100 * pv, t, 0.3);
      this.sweep(o.frequency, 1100 * pv, 2300 * pv, t, t + 0.25);
      const bp = this.filt('bandpass', 1600 * pv, 4);
      this.sweep(bp.frequency, 1600 * pv, 3200 * pv, t, t + 0.25);
      this.link(o, bp, this.gainEnv(t, 0.01, amp * 0.45, t + 0.28, 0.1));
      this.crunch(t + 0.02, amp * 0.6, pv);
      this.squelch(t + 0.05, amp * 0.5, pv, 200);
    }

    // metal grind: resonant noise with a fast tremolo + a buzzy low square
    grind(d) {
      const t = this.begin('grind', 0.4, 1);
      if (t == null) return;
      const pv = this.pv(), amp = 0.5 * this.near(d.x, d.y, 22);
      const n = this.noise(t, 0.35, pv);
      const bp = this.filt('bandpass', 1900 * pv, 3.5);
      const g = this.gainEnv(t, 0.01, amp, t + 0.33, 0.12);
      this.link(n, bp, g);
      const tr = this.osc('sine', 23, t, 0.35);
      const tg = this.ctx.createGain(); tg.gain.value = amp * 0.5;
      this.link(tr, tg, g.gain);
      const o = this.osc('square', 170 * pv, t, 0.3);
      this.link(o, this.filt('lowpass', 800 * pv, 1), this.gainEnv(t, 0.01, amp * 0.25, t + 0.28, 0.1));
    }

    // rising whoosh
    boost(d) {
      const t = this.begin('boost', 0.6, 2);
      if (t == null) return;
      const pv = this.pv();
      const n = this.noise(t, 0.6, pv);
      const bp = this.filt('bandpass', 250 * pv, 1.3);
      this.sweep(bp.frequency, 250 * pv, 3200 * pv, t, t + 0.5);
      this.link(n, bp, this.gainEnv(t, 0.12, 0.5, t + 0.58, 0.15));
      const o = this.osc('sine', 220 * pv, t, 0.5);
      this.sweep(o.frequency, 220 * pv, 980 * pv, t, t + 0.45);
      this.link(o, this.gainEnv(t, 0.05, 0.18, t + 0.48, 0.1));
    }

    // bright noisy shatter with sparkly high partials
    glass(d) {
      const t = this.begin('glass', 0.6, 2);
      if (t == null) return;
      const pv = this.pv(), amp = 0.6 * this.near(d.x, d.y, 26);
      const c = this.noise(t, 0.02, 1.6);
      this.link(c, this.filt('highpass', 2500, 1), this.gainEnv(t, 0.001, amp, t + 0.02));
      const n = this.noise(t + 0.01, 0.4, 1.2 * pv);
      this.link(n, this.filt('highpass', 3200 * pv, 0.9), this.gainEnv(t + 0.01, 0.004, amp * 0.7, t + 0.4, 0.03));
      for (let i = 0; i < 6; i++) {
        const f = U.rand(2600, 7400) * pv, on = t + U.rand(0, 0.08), dur = U.rand(0.15, 0.45);
        const o = this.osc('sine', f, on, dur + 0.02);
        this.link(o, this.gainEnv(on, 0.002, amp * 0.12, on + dur));
      }
    }

    // springy boing
    tramp(d) {
      const t = this.begin('tramp', 0.55, 1);
      if (t == null) return;
      const pv = this.pv(), amp = U.clamp(0.25 + (+d.intensity || 0) / 20, 0.25, 0.6);
      const o = this.osc('triangle', 130 * pv, t, 0.5);
      o.frequency.setValueAtTime(130 * pv, t);
      o.frequency.exponentialRampToValueAtTime(270 * pv, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(170 * pv, t + 0.45);
      const vib = this.osc('sine', 17, t, 0.5);
      const vg = this.ctx.createGain(); vg.gain.value = 22;
      this.link(vib, vg, o.frequency);
      this.link(o, this.gainEnv(t, 0.01, amp, t + 0.5, 0.08));
    }

    // pneumatic shot
    harpoon(d) {
      const t = this.begin('harpoon', 0.35, 2);
      if (t == null) return;
      const pv = this.pv(), amp = 0.6 * (0.5 + 0.5 * this.near(d.x, d.y, 40));
      const n = this.noise(t, 0.14, pv);
      const bp = this.filt('bandpass', 1000 * pv, 1.2);
      this.sweep(bp.frequency, 1000 * pv, 260 * pv, t, t + 0.12);
      this.link(n, bp, this.gainEnv(t, 0.003, amp, t + 0.13));
      const o = this.osc('sine', 120 * pv, t, 0.12);
      this.sweep(o.frequency, 120 * pv, 50, t, t + 0.1);
      this.link(o, this.gainEnv(t, 0.002, amp * 0.6, t + 0.11));
      const h = this.noise(t + 0.05, 0.3, 1.3);
      this.link(h, this.filt('highpass', 4000, 0.8), this.gainEnv(t + 0.05, 0.01, amp * 0.15, t + 0.33, 0.05));
    }

    // harpoon hits a body
    stab(d) {
      const t = this.begin('stab', 0.3, 2);
      if (t == null) return;
      const pv = this.pv(), amp = 0.6 * this.near(d.x, d.y, 22);
      const n = this.noise(t, 0.07, pv);
      this.link(n, this.filt('lowpass', 1300 * pv, 1), this.gainEnv(t, 0.002, amp, t + 0.06));
      const o = this.osc('sine', 260 * pv, t, 0.1);
      this.sweep(o.frequency, 260 * pv, 90, t, t + 0.08);
      this.link(o, this.gainEnv(t, 0.002, amp * 0.5, t + 0.09));
      this.squelch(t + 0.02, amp * 0.7, pv, 240);
    }

    // harpoon hits a wall
    thunk(d) {
      const t = this.begin('thunk', 0.25, 1);
      if (t == null) return;
      const pv = this.pv(), amp = 0.5 * this.near(d.x, d.y, 24);
      const n = this.noise(t, 0.1, pv);
      this.link(n, this.filt('lowpass', 420 * pv, 0.9), this.gainEnv(t, 0.003, amp, t + 0.09));
      const o = this.osc('sine', 85 * pv, t, 0.16);
      this.sweep(o.frequency, 85 * pv, 42, t, t + 0.13);
      this.link(o, this.gainEnv(t, 0.002, amp * 0.8, t + 0.15));
      const w = this.osc('triangle', 230 * pv, t, 0.1);
      this.link(w, this.gainEnv(t, 0.002, amp * 0.3, t + 0.09));
    }

    // creak + clunk (a triggered object drops)
    release(d) {
      const t = this.begin('release', 0.6, 1);
      if (t == null) return;
      const pv = this.pv(), amp = 0.5 * (0.4 + 0.6 * this.near(d.x, d.y, 30));
      const o = this.osc('sawtooth', 170 * pv, t, 0.32);
      this.sweep(o.frequency, 170 * pv, 250 * pv, t, t + 0.3);
      const bp = this.filt('bandpass', 650 * pv, 8);
      this.sweep(bp.frequency, 650 * pv, 1000 * pv, t, t + 0.3);
      const vib = this.osc('sine', 9, t, 0.32);
      const vg = this.ctx.createGain(); vg.gain.value = 10;
      this.link(vib, vg, o.frequency);
      this.link(o, bp, this.gainEnv(t, 0.03, amp * 0.35, t + 0.3, 0.15));
      const t2 = t + 0.3;
      const n = this.noise(t2, 0.1, pv);
      this.link(n, this.filt('lowpass', 500 * pv, 0.9), this.gainEnv(t2, 0.003, amp, t2 + 0.09));
      const o2 = this.osc('sine', 72 * pv, t2, 0.15);
      this.sweep(o2.frequency, 72 * pv, 44, t2, t2 + 0.12);
      this.link(o2, this.gainEnv(t2, 0.002, amp * 0.7, t2 + 0.14));
    }

    // soft tick
    hop(d) {
      const t = this.begin('hop', 0.06, 0);
      if (t == null) return;
      const pv = this.pv();
      const c = this.noise(t, 0.012, 1.3 * pv);
      this.link(c, this.filt('highpass', 1600, 1), this.gainEnv(t, 0.001, 0.22, t + 0.012));
      const o = this.osc('sine', 520 * pv, t, 0.03);
      this.link(o, this.gainEnv(t, 0.002, 0.1, t + 0.028));
    }

    // pogo launch: sine sweep up, pitch from speed
    boing(d) {
      const t = this.begin('boing', 0.45, 1);
      if (t == null) return;
      const pv = this.pv(), sp = U.clamp(+d.speed || 0, 0, 14);
      const f0 = (150 + 20 * sp) * pv;
      const o = this.osc('sine', f0, t, 0.4);
      this.sweep(o.frequency, f0, f0 * 2.1, t, t + 0.25);
      this.link(o, this.gainEnv(t, 0.008, 0.4, t + 0.38, 0.05));
      const o2 = this.osc('triangle', f0 * 2, t, 0.3);
      this.sweep(o2.frequency, f0 * 2, f0 * 4.2, t, t + 0.25);
      this.link(o2, this.gainEnv(t, 0.008, 0.08, t + 0.28));
    }

    // soft thump
    land(d) {
      const t = this.begin('land', 0.2, 0);
      if (t == null) return;
      const pv = this.pv(), amp = U.clamp(0.15 + (+d.speed || 0) / 10, 0.15, 0.5);
      const n = this.noise(t, 0.1, pv);
      this.link(n, this.filt('lowpass', 320 * pv, 0.8), this.gainEnv(t, 0.004, amp, t + 0.09));
      const o = this.osc('sine', 72 * pv, t, 0.15);
      this.sweep(o.frequency, 72 * pv, 40, t, t + 0.12);
      this.link(o, this.gainEnv(t, 0.003, amp * 0.8, t + 0.14));
    }

    // short bright jingle: C5 E5 G5 C6 E6
    win(d) {
      const t = this.begin('win', 1.2, 2);
      if (t == null) return;
      const pv = U.rand(0.97, 1.03);
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      const lp = this.filt('lowpass', 3200, 0.7);
      lp.connect(this.bus);
      for (let i = 0; i < notes.length; i++) {
        const on = t + i * 0.11, last = i === notes.length - 1, dur = last ? 0.7 : 0.32;
        const o = this.osc('square', notes[i] * pv, on, dur + 0.02);
        this.link(o, this.gainEnv(on, 0.006, 0.16, on + dur, last ? 0.15 : 0.02, lp));
        const o2 = this.osc('sine', notes[i] * 2 * pv, on, dur + 0.02);
        this.link(o2, this.gainEnv(on, 0.006, 0.05, on + dur, 0, lp));
      }
    }
  }

  function setParam(p, v) { if (p && typeof p === 'object') p.value = v; }

  WR.Audio = Audio;
})();
