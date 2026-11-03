/* ACCOUNT FULL — sound
   Everything is synthesised with the Web Audio API. No files. The context is
   created on the first user gesture, which is what browsers require.

   Loudness is the game's own 0.5 times the STOINLY NEXUS shared sfx volume
   (master x sfx, 0 when muted there), re-read whenever the shared settings
   change, including from another tab. The in-game sound toggle (M) is a second,
   local mute on top of that: it can silence the game but cannot unmute what the
   nexus muted. There is no music. */
(function (AF) {
  'use strict';

  let ctx = null, master = null, muted = false, lastHit = 0, lastFinish = 0, lastCoin = 0;
  const SS = window.StoinlySettings || null;
  const shared = () => (SS ? SS.volume('sfx') : 1);
  const gainNow = () => (muted ? 0 : 0.5 * shared());
  function applyGain() { if (master) master.gain.value = gainNow(); }
  if (SS) SS.onChange(applyGain);

  function ensure() {
    if (ctx) return true;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = gainNow();
    master.connect(ctx.destination);
    return true;
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function tone(freq, dur, opts) {
    if (!ensure() || !gainNow()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const t = ctx.currentTime + (opts.delay || 0);
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol || 0.2, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, opts) {
    if (!ensure() || !gainNow()) return;
    const t = ctx.currentTime + (opts.delay || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 1500, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol || 0.2, t + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  const S = {
    hit() {
      const now = performance.now();
      if (now - lastHit < 45) return;
      lastHit = now;
      tone(1800 + Math.random() * 400, 0.03, { type: 'square', vol: 0.03 });
    },
    // the coin tink climbs half a semitone with every step of a combo, up to an octave
    finish(value, combo) {
      const now = performance.now();
      if (now - lastFinish < 28) return;
      lastFinish = now;
      const base = (value >= 100 ? 900 : value >= 20 ? 1100 : 1400) * Math.pow(2, Math.min(24, Math.max(0, (combo || 1) - 1)) / 12 * 0.5);
      tone(base, 0.06, { vol: 0.12 });
      tone(base * 1.5, 0.09, { vol: 0.12, delay: 0.05 });
    },
    burst() {
      noise(0.25, { freq: 400, to: 3000, vol: 0.2, q: 0.7 });
      tone(220, 0.3, { type: 'triangle', to: 110, vol: 0.2 });
    },
    leak() { tone(110, 0.25, { type: 'triangle', to: 55, vol: 0.25 }); noise(0.12, { freq: 200, vol: 0.1, filter: 'lowpass' }); },
    place() { tone(300, 0.08, { type: 'triangle', to: 180, vol: 0.15 }); },
    pick() { tone(180, 0.08, { type: 'triangle', to: 300, vol: 0.12 }); },
    upgrade() { tone(520, 0.08, { vol: 0.12 }); tone(660, 0.08, { vol: 0.12, delay: 0.08 }); tone(880, 0.14, { vol: 0.12, delay: 0.16 }); },
    rip() { noise(0.35, { freq: 800, to: 4000, vol: 0.25, q: 0.5 }); noise(0.5, { freq: 3000, to: 600, vol: 0.12, q: 0.5, delay: 0.3 }); },
    flip() { noise(0.05, { freq: 2500, vol: 0.12, q: 2 }); tone(700, 0.04, { vol: 0.06 }); },
    holo() { tone(1200, 0.12, { vol: 0.08 }); tone(1600, 0.12, { vol: 0.08, delay: 0.1 }); tone(2400, 0.25, { vol: 0.08, delay: 0.2 }); },
    gum() { tone(1000, 0.05, { type: 'square', vol: 0.05 }); },
    round() { tone(330, 0.1, { type: 'triangle', vol: 0.15 }); tone(440, 0.16, { type: 'triangle', vol: 0.15, delay: 0.1 }); },
    roundEnd() { tone(440, 0.1, { type: 'triangle', vol: 0.12 }); tone(554, 0.1, { type: 'triangle', vol: 0.12, delay: 0.09 }); tone(659, 0.18, { type: 'triangle', vol: 0.12, delay: 0.18 }); },
    action() { tone(600, 0.12, { type: 'sawtooth', to: 1200, vol: 0.08 }); },
    crash() { noise(1.2, { freq: 120, to: 40, vol: 0.4, filter: 'lowpass', q: 0.5 }); tone(80, 1.0, { type: 'sawtooth', to: 30, vol: 0.2 }); },
    lost() { [440, 415, 392, 349].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.18, delay: i * 0.3 })); },
    won() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { vol: 0.15, delay: i * 0.12 })); },
    click() { tone(900, 0.025, { type: 'square', vol: 0.03 }); },
    // ---- stings for the flashy layer: rewards rise, breaks fall
    bounce() { tone(520, 0.05, { type: 'triangle', to: 780, vol: 0.06 }); },
    coin() {
      const now = performance.now(); if (now - lastCoin < 40) return; lastCoin = now;
      tone(1975, 0.05, { type: 'square', vol: 0.035 }); tone(2637, 0.12, { type: 'square', vol: 0.035, delay: 0.045 });
    },
    comboUp(n) { const s = Math.min(4, Math.floor(Math.log2(n / 5))); [0, 4, 7, 12].forEach((st, i) => tone(660 * Math.pow(2, (st + s * 2) / 12), 0.09, { type: 'square', vol: 0.05, delay: i * 0.05 })); },
    crack() { noise(0.18, { freq: 2600, to: 500, vol: 0.28, q: 0.8 }); tone(240, 0.22, { type: 'sawtooth', to: 70, vol: 0.12 }); },
    star(i) { const b = 784 * Math.pow(2, (i || 0) * 4 / 12); tone(b, 0.1, { vol: 0.13 }); tone(b * 1.26, 0.1, { vol: 0.13, delay: 0.07 }); tone(b * 1.5, 0.1, { vol: 0.13, delay: 0.14 }); tone(b * 2, 0.32, { vol: 0.12, delay: 0.21 }); noise(0.25, { freq: 6000, vol: 0.05, q: 0.6, delay: 0.21 }); },
    starEmpty() { tone(330, 0.12, { type: 'triangle', to: 300, vol: 0.06 }); },
    chestShake(i) { noise(0.12, { freq: 300 + (i || 0) * 200, vol: 0.2, q: 1.2 }); tone(140 + (i || 0) * 40, 0.12, { type: 'triangle', vol: 0.15 }); },
    chestOpen() { noise(0.4, { freq: 600, to: 6000, vol: 0.22, q: 0.5 }); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, { vol: 0.1, delay: 0.12 + i * 0.07 })); },
    unlock() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.12, delay: i * 0.08 })); tone(2093, 0.4, { vol: 0.06, delay: 0.32 }); },
    streak() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.14, { type: 'square', vol: 0.05, delay: i * 0.06 })); },
    newBest() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.05, delay: i * 0.09 })); tone(1319, 0.5, { vol: 0.1, delay: 0.36 }); },
    tick() { tone(1500, 0.015, { type: 'square', vol: 0.02 }); },
    deny() { tone(200, 0.12, { type: 'square', to: 150, vol: 0.06 }); },
  };

  AF.audio = {
    // nothing plays until unlock() has run inside a user gesture; browsers refuse audio before that
    play(name, arg, arg2) { if (ctx && S[name]) { resume(); S[name](arg, arg2); } },
    unlock() { ensure(); resume(); },
    setMuted(m) { muted = m; applyGain(); },
    get muted() { return muted; },                 // the local in-game toggle
    get sharedSilent() { return shared() <= 0; },  // muted or at zero in the nexus settings
    get silent() { return gainNow() <= 0; },       // nothing will be heard, for either reason
    get gain() { return master ? master.gain.value : gainNow(); },  // the master gain now (for the test page)
  };
})(window.AF = window.AF || {});
