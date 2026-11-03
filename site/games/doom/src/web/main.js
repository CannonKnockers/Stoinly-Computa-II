(function (ns) {
  'use strict';
  // main.js: boots the game in the page. Decodes the asset sheets, creates the app, the
  // input and the audio, and runs the loop: game logic at a fixed 35 tics per second,
  // drawing every animation frame with the view interpolated between tics, the palette
  // (with the damage, pickup and waders tints) turning indices into pixels, and the canvas
  // scaled by CSS to the largest 4:3 box. ?test=LEVEL,TICS,KEYS runs a scripted test and
  // stops on the resulting frame, for headless screenshots.
  // The STOINLY NEXUS settings (src/web/stoinly-settings.js, window.StoinlySettings) are read
  // here and only here, turned into plain values for the game (app.configure, setBindings)
  // and re-read whenever they change, in this tab or another.

  const W = 320;
  const H = 200;
  const TIC_MS = 1000 / 35;

  function boot() {
    const canvas = document.getElementById('screen');
    const errors = document.getElementById('errors');
    const report = function (msg) {
      errors.textContent += msg + '\n';
      errors.style.display = 'block';
    };
    window.addEventListener('error', function (e) {
      report(String(e.message || e));
    });
    try {
      ns.assets.decodeAll();
    } catch (e) {
      report('assets: ' + e.message);
      return;
    }
    const ctx2d = canvas.getContext('2d');
    const image = ctx2d.createImageData(W, H);
    const pixels = new Uint32Array(image.data.buffer);
    const fb = new Uint8Array(W * H);
    let table = ns.palette.rgbaTable(null);
    let lastTint = '';
    const storage = {
      get: function (k) {
        try {
          return window.localStorage.getItem(k);
        } catch (e) {
          return null;
        }
      },
      set: function (k, v) {
        try {
          window.localStorage.setItem(k, v);
        } catch (e) {
          // private windows refuse storage; the game carries on
        }
      }
    };
    const params = new URLSearchParams(window.location.search);
    // the local calendar date drives the streak, the chest and the daily; &date= pins it for tests
    const pinned = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : null;
    const S = window.StoinlySettings || null;
    // a test run may set the nexus settings for its own page (&settings=JSON); the stored
    // value is put back as soon as the test frame is drawn
    const restoreSettings = params.get('test') && params.get('settings') && S ? seedSettings(S, params.get('settings'), report) : null;
    const forceReduced = params.get('reduced') === '1';
    const app = ns.game.create(params.get('test') ? memoryStorage(storage, params) : storage, {
      today: function () { return pinned || ns.meta.dateKey(new Date()); },
      settings: readSettings(S, forceReduced),
      bindings: readBindings(S),
      nexus: Boolean(S && S.fromNexus())
    });
    // reachable for in-page checks (tests/web/live-settings.html)
    ns.web.app = app;
    const input = ns.web.input.create(canvas);
    input.bind(app.bindings);
    const audio = ns.web.audio.create();
    function applySettings() {
      app.configure(readSettings(S, forceReduced));
      app.setBindings(readBindings(S));
      input.bind(app.bindings);
      const mix = app.mix();
      audio.volumes(mix.sfx, mix.music);
    }
    if (S) {
      S.applyDisplay(document);
      S.onChange(applySettings);
    }
    // the OS reduced-motion switch can flip while the page is open; StoinlySettings reads it fresh
    const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (reduceQuery && reduceQuery.addEventListener) {
      reduceQuery.addEventListener('change', applySettings);
    }
    let gestured = false;
    input.onGesture(function () {
      audio.unlock();
      const mix = app.mix();
      audio.volumes(mix.sfx, mix.music);
      if (!gestured) {
        gestured = true;
        if (S) {
          S.maybeFullscreen(document);
        }
      }
    });
    const nexusLink = document.getElementById('nexus');
    let linkShown = false;
    // the ◄ NEXUS link: on the title, in any menu and on the pause screen, when the page was
    // opened from the nexus; showing it frees the pointer so the link can be clicked
    function updateNexusLink() {
      const show = Boolean(app.nexus && (app.state === 'title' || app.menu || app.paused));
      if (show !== linkShown && nexusLink) {
        linkShown = show;
        nexusLink.style.display = show ? 'block' : 'none';
        if (show && document.pointerLockElement && document.exitPointerLock) {
          document.exitPointerLock();
        }
      }
      if (app.nav === 'nexus') {
        app.nav = null;
        window.location.href = nexusLink ? nexusLink.getAttribute('href') : '../../index.html';
      }
    }

    function present(tint) {
      const key = tint ? tint.name + Math.round(tint.strength * 20) : '';
      if (key !== lastTint) {
        lastTint = key;
        table = tint ? ns.palette.rgbaTable(tint.name, tint.strength, table) : ns.palette.rgbaTable(null, 0, table);
      }
      const scan = app.options.scanlines;
      for (let i = 0; i < W * H; i++) {
        pixels[i] = table[fb[i]];
      }
      if (scan) {
        for (let y = 1; y < H; y += 2) {
          for (let x = 0; x < W; x++) {
            const p = pixels[y * W + x];
            pixels[y * W + x] = (p & 0xff000000) | ((p >> 1) & 0x7f7f7f);
          }
        }
      }
      ctx2d.putImageData(image, 0, 0);
    }

    function fit() {
      const ww = window.innerWidth;
      const wh = window.innerHeight;
      let w = ww;
      let h = Math.floor(ww * 3 / 4);
      if (h > wh) {
        h = wh;
        w = Math.floor(wh * 4 / 3);
      }
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    window.addEventListener('resize', fit);
    window.addEventListener('blur', function () {
      if (app.state === 'play' && !app.menu) {
        app.paused = true;
      }
    });
    fit();

    // ---------------------------------------------------------------- test mode
    if (params.get('test')) {
      runTest(app, params, fb, present, report);
      updateNexusLink();
      if (restoreSettings) {
        restoreSettings();
      }
      return;
    }

    let acc = 0;
    let last = performance.now();
    function frame(now) {
      acc += Math.min(250, now - last);
      last = now;
      let n = 0;
      while (acc >= TIC_MS && n < 4) {
        try {
          app.tick(input.take());
        } catch (e) {
          report('tick: ' + e.message + '\n' + e.stack);
          return;
        }
        acc -= TIC_MS;
        n++;
      }
      if (n === 4) {
        acc = 0;
      }
      // sounds and music
      const pl = app.g && app.g.player;
      for (const ev of app.events) {
        if (ev.sound) {
          audio.play(ev.sound, pl, ev.x, ev.y, app.tic);
        }
      }
      app.events.length = 0;
      audio.playSong(app.song());
      const mix = app.mix();
      audio.volumes(mix.sfx, mix.music);
      updateNexusLink();
      let tint = null;
      try {
        tint = app.draw(fb, acc / TIC_MS);
      } catch (e) {
        report('draw: ' + e.message + '\n' + e.stack);
        return;
      }
      present(tint);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // The nexus settings as the game's plain values (game.js DEFAULT_SETTINGS). forceReduced is
  // the &reduced=1 test switch: reduced motion as if the OS or the nexus had asked for it.
  function readSettings(S, forceReduced) {
    if (!S) {
      const q = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const r = forceReduced || Boolean(q);
      return { reduced: r, shake: r ? 0 : 1, particles: r ? 0.25 : 1, flashes: !r };
    }
    const s = S.get();
    const reduced = forceReduced || S.reducedMotion();
    return {
      sfx: S.volume('sfx'),
      music: S.volume('music'),
      shake: reduced ? 0 : S.shakeScale(),
      particles: reduced ? Math.min(0.25, S.particleScale()) : S.particleScale(),
      flashes: !reduced && S.flashesAllowed(),
      reduced: reduced,
      performance: s.display.performance,
      textScale: s.display.textScale
    };
  }

  function readBindings(S) {
    return ns.controls.resolve(S ? function (id, defaults) { return S.keysFor('doom', id, defaults); } : null);
  }

  // Test runs only: writes the given settings, returns a function that puts back what was
  // stored before (the in-page copy stays in force for the screenshot).
  function seedSettings(S, json, report) {
    let before = null;
    try {
      before = window.localStorage.getItem(S.KEY);
      S.save(JSON.parse(json));
    } catch (e) {
      report('settings: ' + e.message);
      return null;
    }
    return function () {
      try {
        if (before === null) {
          window.localStorage.removeItem(S.KEY);
        } else {
          window.localStorage.setItem(S.KEY, before);
        }
      } catch (e) {
        // storage refused; nothing was written either
      }
    };
  }

  // Test runs never touch the real save: they get an in-memory store, optionally seeded with
  // a demo meta record (&demo=1) so the hook screens have something to show.
  function memoryStorage(real, params) {
    const m = new Map();
    const store = { get: function (k) { return m.has(k) ? m.get(k) : null; }, set: function (k, v) { m.set(k, v); } };
    if (params.get('demo')) {
      const meta = ns.meta.fresh();
      meta.stars = { E1M1: [true, true, true], E1M2: [true, true, false], E1M3: [true, false, false] };
      meta.foil = 140;
      meta.unlocked.w_gold = meta.unlocked.w_wintergreen = meta.unlocked.h_hot = meta.unlocked.h_lime = true;
      meta.fresh.w_wintergreen = true;
      meta.equipped = { weapon: params.get('skin') || 'w_gold', hud: params.get('hud') || 'h_hot' };
      meta.unlocked[meta.equipped.weapon] = meta.unlocked[meta.equipped.hud] = true;
      const today = params.get('date') || ns.meta.dateKey(new Date());
      meta.streak = { last: ns.meta.addDays(today, -1), count: 3, best: 3 };
      meta.bestCombo = 5;
      store.set(ns.meta.KEY, JSON.stringify(meta));
    }
    void real;
    return store;
  }

  // ?test=level,tics,script&skill=2&menu=main — runs synchronously during page load so a
  // headless screenshot taken at the load event shows the result. script is a list of
  // steps "key:tics" separated by '+', e.g. w:40+ArrowLeft:10+Control:20.
  function runTest(app, params, fb, present, report) {
    try {
      const spec = params.get('test').split(',');
      const what = spec[0];
      const skill = Number(params.get('skill') || 2);
      if (what === 'title') {
        for (let i = 0; i < Number(spec[1] || 10); i++) {
          app.tick({ held: {}, pressed: [], typed: [], mouseDX: 0 });
        }
      } else if (what === 'inter' || what === 'finale' || what === 'dead') {
        app.startLevel(Number(spec[1] || 0), skill, null);
        for (let i = 0; i < 60; i++) {
          app.tick({ held: {}, pressed: [], typed: [], mouseDX: 0 });
        }
        if (what === 'inter') {
          app.g.stats.kills = Math.floor(app.g.stats.killsTotal * 0.8);
          app.g.stats.items = Math.floor(app.g.stats.itemsTotal * 0.6);
          app.g.stats.secrets = 1;
          app.g.pulled = [19, 28, 27, 4, 7];
          app.g.exit = 'normal';
        } else if (what === 'finale') {
          app.g.finale = true;
        } else {
          app.g.player.hp = 1;
          ns.world.damage(app.g, app.g.player, null, null, 50);
        }
        const more = Number(spec[2] || 300);
        for (let i = 0; i < more; i++) {
          app.tick({ held: {}, pressed: [], typed: [], mouseDX: 0 });
        }
      } else if (what === 'locker' || what === 'chest' || what === 'daily' || what === 'credits') {
        // a hook screen from the menu: &sel= picks the item, &pokes= shakes the chest, &open=1
        // opens it, &scroll= moves the credits crawl; &tics= runs that many tics afterwards
        app.tick({ held: {}, pressed: ['x'], typed: [], mouseDX: 0 });
        app.menu = { name: what, sel: Number(params.get('sel') || 0), prompt: null, typing: null, scroll: Number(params.get('scroll') || 0) };
        if (what === 'chest') {
          app.menu.chest = { pokes: 0, shakeTic: -100, openTic: -1, prize: null };
          const pokes = params.get('open') ? 3 : Number(params.get('pokes') || 0);
          for (let i = 0; i < pokes; i++) {
            app.tick({ held: {}, pressed: ['Enter'], typed: [], mouseDX: 0 });
            for (let k = 0; k < 3; k++) {
              app.tick({ held: {}, pressed: [], typed: [], mouseDX: 0 });
            }
          }
        }
        for (let i = 0; i < Number(params.get('tics') || 0); i++) {
          app.tick({ held: {}, pressed: [], typed: [], mouseDX: 0 });
        }
      } else if (what === 'collection') {
        app.collection[1] = app.collection[7] = app.collection[19] = app.collection[25] = app.collection[31] = true;
        app.tick({ held: {}, pressed: ['x'], typed: [], mouseDX: 0 });
        app.menu = { name: 'collection', sel: 6, prompt: null, typing: null };
      } else {
        app.startLevel(Number(what), skill, null);
        const steps = (spec[2] || '').split('+').filter(Boolean).map(function (s) {
          const p = s.split(':');
          return { key: p[0] === 'wait' ? 'wait' : ns.controls.legacyCode(p[0]), tics: Number(p[1] || 1) };
        });
        const idle = Number(spec[1] || 1);
        for (let i = 0; i < idle; i++) {
          app.tick({ held: {}, pressed: [], typed: [], mouseDX: 0 });
        }
        if (params.get('at')) {
          // &at=x,y,deg puts the player there, facing that way, and settles one tic
          const a = params.get('at').split(',').map(Number);
          const pl = app.g.player;
          pl.x = pl.px = a[0];
          pl.y = pl.py = a[1];
          pl.angle = pl.pangle = a[2] * Math.PI / 180;
          pl.cellRef = ns.map.cellAt(app.g.level, pl.x, pl.y);
          app.tick({ held: {}, pressed: [], typed: [], mouseDX: 0 });
        }
        if (params.get('mhp')) {
          // every monster's health set low, so a scripted shot shows a kill
          for (const o of app.g.things) {
            if (o.def.kind === 'monster' && !o.dead) {
              o.hp = Number(params.get('mhp'));
            }
          }
        }
        if (params.get('wake')) {
          // every monster sees the player
          for (const o of app.g.things) {
            if (o.def.kind === 'monster' && !o.dead) {
              o.target = app.g.player;
              o.provoked = true;
            }
          }
        }
        for (const st of steps) {
          const held = {};
          if (st.key !== 'wait') {
            held[st.key] = true;
          }
          for (let i = 0; i < st.tics; i++) {
            app.tick({ held: held, pressed: i === 0 && st.key !== 'wait' ? [st.key] : [], typed: [], mouseDX: 0 });
            if (params.get('god') && app.g && app.g.player) {
              app.g.player.hp = 100;
            }
          }
        }
        if (params.get('pause')) {
          app.paused = true;
        }
        if (params.get('god')) {
          app.g.player.hp = 100;
        }
        if (params.get('map')) {
          app.automap = true;
        }
      }
      if (params.get('menu')) {
        app.menu = { name: params.get('menu'), sel: Number(params.get('sel') || 0), prompt: null, typing: null };
      }
      const tint = app.draw(fb, 0);
      present(tint);
      if (params.get('bench')) {
        // frame cost in this browser: game tic + draw + palette conversion, 200 times
        const n = 200;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          app.tick({ held: { ArrowLeft: true }, pressed: [], typed: [], mouseDX: 0 });
          present(app.draw(fb, 0.5));
        }
        const ms = (performance.now() - t0) / n;
        report('BENCH ' + ms.toFixed(2) + ' ms per tic+frame over ' + n + ' frames (' + navigator.userAgent.split(' ').pop() + ')');
      }
      document.title = 'TEST DONE';
    } catch (e) {
      report('test: ' + e.message + '\n' + e.stack);
    }
  }

  ns.web = ns.web || {};
  ns.web.boot = boot;
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
