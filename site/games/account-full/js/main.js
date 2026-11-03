/* ACCOUNT FULL — bootstrap
   The frame loop, saving, and the glue between sim, renderer and interface. */
(function (AF) {
  'use strict';

  const D = AF.DATA;
  const SAVE_KEY = 'account-full.save.v1', SET_KEY = 'account-full.settings.v1', BINDER_KEY = 'account-full.binder.v1';
  const STEP = 1 / 60;

  function read(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (_) { return null; } }
  function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {} }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) {} }

  const app = {
    sim: null,
    speed: 1,
    paused: true,
    settings: Object.assign({ sound: true, auto: false, speed: 1 }, read(SET_KEY) || {}),
    binder: read(BINDER_KEY) || {},
    view: { hover: null, selected: null, ghost: null, placing: null, selectedHand: null },
    ended: false,
    autoAt: 0,
    runId: null,          // which run the meta file is paying stars to
    daily: null,          // YYYY-MM-DD when this run is that day's daily challenge
    result: null,         // what finishing the run paid out, for the end screen

    // the run save keeps its v1 shape; runId and daily ride along and older saves simply lack them
    save() { if (this.sim && this.sim.phase === 'idle') write(SAVE_KEY, Object.assign(this.sim.toJSON(), { runId: this.runId, daily: this.daily })); },
    clearSave() { remove(SAVE_KEY); },
    hasSave() { const j = read(SAVE_KEY); return j && j.v === 1 ? j : null; },
    saveSettings() { write(SET_KEY, this.settings); },
    recordPulls(ids) { for (const id of ids) this.binder[id] = (this.binder[id] || 0) + 1; write(BINDER_KEY, this.binder); },

    resetView() { this.view.hover = null; this.view.selected = null; this.view.ghost = null; this.view.placing = null; this.view.selectedHand = null; },
    // everything that belongs to one game and must not leak into the next
    startFresh(sim) {
      this.sim = sim;
      this.sim.autostart = !!this.settings.auto;
      this.ended = false; this.autoAt = 0; this.result = null; this.resetView();
      AF.render.reset();
      AF.juice.comboReset();
      AF.ui.bind(this.sim);
      document.getElementById('app').hidden = false;
    },
    // opts.daily: play today's daily challenge, seeded from the local date
    newGame(seed, opts) {
      this.clearSave();
      this.daily = opts && opts.daily ? AF.meta.today() : null;
      if (this.daily) seed = AF.meta.seedFor(this.daily);
      this.runId = AF.meta.beginRun({ daily: this.daily });
      this.startFresh(new AF.Sim(seed));
      this.save();
    },
    resume() {
      const j = this.hasSave(); if (!j) return false;
      this.daily = typeof j.daily === 'string' ? j.daily : null;
      this.runId = AF.meta.adoptRun(typeof j.runId === 'string' ? j.runId : null, this.daily);
      this.startFresh(AF.Sim.fromJSON(j));
      if (!j.runId) this.save();
      return true;
    },
    // called once per run when it is won or lost; later calls return the same result
    endRun() {
      if (this.result) return this.result;
      const sim = this.sim; if (!sim) return null;
      const won = sim.phase === 'won';
      const cleared = won ? D.WAVES.length : Math.max(0, sim.round - 1);
      this.result = AF.meta.finishRun(this.runId, { cleared, given: sim.given, won, daily: this.daily, combo: AF.juice.combo.best });
      this.result.cleared = cleared; this.result.won = won; this.result.combo = AF.juice.combo.best;
      return this.result;
    },
    toTitle() {
      this.autoAt = 0;
      const j = this.hasSave();
      const b = document.getElementById('btnResume');
      b.hidden = !j;
      if (j) b.textContent = 'RESUME · ROUND ' + Math.min(j.round, D.WAVES.length);
      // one lit button: RESUME when there is a game to go back to, NEW GAME when there is not
      document.getElementById('btnNew').classList.toggle('btn-primary', !j);
      AF.ui.renderTitleMeta();
      AF.ui.showScreen('screenTitle');
    },
  };

  // ---------------------------------------------------------------- canvas sizing
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  let lastW = 0, lastH = 0;
  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; canvas.width = w; canvas.height = h; }
    const s = w / D.BOARD.w;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    app.view.scale = cw / D.BOARD.w;     // CSS pixels per board unit; the renderer enlarges money labels when this is small
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now(), acc = 0, clock = 0;
  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    const sim = app.sim;
    if (sim && !app.paused) {
      clock += dt;
      if (sim.phase === 'running') {
        // a tiny hit-stop on big bursts: the sim waits a few frames, the effects keep playing
        if (now >= AF.render.hitStopUntil) acc += dt * app.speed;
        let n = 0;
        while (acc >= STEP && n < 20) { sim.step(STEP); acc -= STEP; n++; }
        if (acc > STEP * 20) acc = 0;
        if (sim.phase === 'idle') { app.save(); app.autoAt = clock + 2.0; AF.ui.onRoundCleared(sim.round - 1); }
        else if (sim.phase === 'won') AF.ui.onRoundCleared(D.WAVES.length);
      } else if (sim.phase === 'idle') {
        sim.step(0);
        if (app.settings.auto && clock >= app.autoAt && app.autoAt > 0) { app.autoAt = 0; if (sim.startRound()) { app.save(); AF.ui.onRoundStart(); } }
      }
      if ((sim.phase === 'lost' || sim.phase === 'won') && !app.ended) { app.ended = true; app.clearSave(); app.endRun(); setTimeout(() => { if (app.sim === sim) AF.ui.showEnd(); }, 900); }
    }
    fitCanvas();
    if (sim) AF.render.render(ctx, sim, app.view, clock, (n, a, b) => AF.audio.play(n, a, b));
    AF.ui.tick(now);
  }
  function loop(now) { if (!app.manualFrames) frame(now); requestAnimationFrame(loop); }
  // the test page drives frames itself: headless virtual time does not run requestAnimationFrame
  app.debugFrame = frame;

  // ---------------------------------------------------------------- boot
  async function boot() {
    // STOINLY NEXUS display settings: text size, reduced motion, no flashes, performance mode and the colour-blind
    // filter on [data-stoinly-cb] (the <body>, so cards and board are filtered together); re-applied on every change
    if (window.StoinlySettings) window.StoinlySettings.applyDisplay(document, ['[data-stoinly-cb]']);
    app.speed = app.settings.speed || 1;
    AF.audio.setMuted(app.settings.sound === false);
    AF.ui.init(app);
    try { await Promise.all([document.fonts.load('700 14px Oswald'), document.fonts.load('600 14px Oswald'), document.fonts.load('400 12px "IBM Plex Mono"'), document.fonts.load('600 12px "IBM Plex Mono"'), document.fonts.load('400 14px "IBM Plex Sans"')]); } catch (_) {}
    await AF.render.loadImages();
    window.addEventListener('resize', fitCanvas);
    app.toTitle();
    requestAnimationFrame(loop);
    // js/debug.js drives scripted scenarios for headless testing; only loaded when asked for
    if (/[?&]test=/.test(location.search)) { const s = document.createElement('script'); s.src = 'js/debug.js'; document.body.appendChild(s); }
  }

  AF.app = app;
  boot();
})(window.AF = window.AF || {});
