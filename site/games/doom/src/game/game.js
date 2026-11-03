(function (ns) {
  'use strict';
  // game.js: the application. A state machine over title, menus, play, intermission, finale
  // and credits; level progression through STOINLY.levels; the card collection and options
  // kept in a storage object the browser shell provides (localStorage, or a Map in tests);
  // and six save slots holding the full state of a level in play. Input arrives once per
  // tic as { held, pressed, typed, mouseDX }; draw() fills the 320x200 framebuffer.
  // The flashy layer (2026-11-03): juice.js effects, meta.js hooks (stars, FOIL, the
  // locker, the day streak, the daily chest and the daily challenge), the exit celebration.
  // STOINLY NEXUS settings arrive from the shell as plain values (configure, setBindings):
  // input is matched by action through the bindings, never by key name.

  const W = 320;
  const VIEW_H = 168;
  const KEY = { collection: 'stoinly.collection', options: 'stoinly.options', save: 'stoinly.save.' };
  const DEFAULT_OPTIONS = { alwaysRun: true, mouse: 5, sound: 7, music: 5, scanlines: false, messages: true };

  function T() {
    return ns.defs.text;
  }

  function levels() {
    return (ns.levels || []).slice().sort(function (a, b) { return a.slug < b.slug ? -1 : 1; });
  }

  // The nexus settings as the game sees them: plain numbers and flags, never window.
  // sfx and music are gains (0..1, mute folded in); shake and particles multiply the juice;
  // flashes false skips white hit flashes, blinking and strobing lights; reduced stops
  // sliding and wobbling, hit-stop and shake; performance halves particles and the view's
  // horizontal resolution; textScale enlarges the pop-up numbers and the announcer.
  const DEFAULT_SETTINGS = { sfx: 1, music: 1, shake: 1, particles: 1, flashes: true, reduced: false, performance: false, textScale: 1 };

  function settingsFrom(s) {
    const o = Object.assign({}, DEFAULT_SETTINGS, s || {});
    const num = function (x, lo, hi, d) {
      x = Number(x);
      return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
    };
    return {
      sfx: num(o.sfx, 0, 1, 1),
      music: num(o.music, 0, 1, 1),
      shake: num(o.shake, 0, 1, 1),
      particles: num(o.particles, 0, 1, 1),
      flashes: Boolean(o.flashes),
      reduced: Boolean(o.reduced),
      performance: Boolean(o.performance),
      textScale: num(o.textScale, 0.8, 1.6, 1)
    };
  }

  // opts: { today: function returning the local date 'YYYY-MM-DD', settings (DEFAULT_SETTINGS
  // shape), reducedMotion (older callers: the same as settings with reduced on), bindings
  // ({ actionId: [KeyboardEvent.code] }, default ns.controls.defaults()), nexus (true when
  // opened from the STOINLY NEXUS: the main menu gets a NEXUS item) }
  function create(storage, opts) {
    const store = storage || memoryStore();
    const o = opts || {};
    const app = {
      state: 'title',
      tic: 0,
      menu: null,
      g: null,
      options: Object.assign({}, DEFAULT_OPTIONS, readJSON(store, KEY.options) || {}),
      collection: readJSON(store, KEY.collection) || {},
      store: store,
      automap: false,
      paused: false,
      inter: null,
      finaleTic: 0,
      events: [],
      quit: false,
      meta: ns.meta.load(store),
      juice: ns.juice.create(false),
      reduced: false,
      still: false,
      settings: null,
      bindings: ns.controls.defaults(),
      nexus: Boolean(o.nexus),
      nav: null,
      todayFn: o.today || function () { return ns.meta.dateKey(new Date()); },
      dailyRun: null,
      exiting: 0
    };
    app.today = function () {
      return app.todayFn();
    };
    app.configure = function (s) {
      configure(app, s);
    };
    app.setBindings = function (b) {
      app.bindings = Object.assign(ns.controls.defaults(), b || {});
    };
    app.mix = function () {
      return mix(app);
    };
    configure(app, o.settings || (o.reducedMotion ? { reduced: true, shake: 0, particles: 0.25, flashes: false } : null));
    if (o.bindings) {
      app.setBindings(o.bindings);
    }
    ns.meta.refreshUnlocks(app.meta, app.today());
    saveMeta(app);
    app.tick = function (input) {
      tick(app, input);
    };
    app.draw = function (fb, frac) {
      return draw(app, fb, frac);
    };
    app.song = function () {
      return song(app);
    };
    app.startLevel = function (index, skill, carry) {
      startLevel(app, index, skill, carry);
    };
    return app;
  }

  // Applies a settings object (DEFAULT_SETTINGS shape) to the app, the juice layer and the
  // level in play; called at start and again whenever the settings change.
  function configure(app, s) {
    const v = settingsFrom(s);
    app.settings = v;
    app.reduced = v.reduced;
    app.still = !v.flashes || v.reduced;
    ns.juice.configure(app.juice, v);
    if (app.g) {
      app.g.steadyLights = app.still;
    }
  }

  // Final gains for the audio shell: the in-game sliders (0..10) times the nexus volumes.
  function mix(app) {
    const o = app.options;
    const s = app.settings;
    return { sfx: o.sound / 10 * s.sfx, music: o.music / 10 * 0.6 * s.music };
  }

  function saveMeta(app) {
    ns.meta.save(app.store, app.meta);
  }

  function equipped(app, kind) {
    return ns.meta.cosmetic(app.meta.equipped[kind]);
  }

  function memoryStore() {
    const m = new Map();
    return { get: function (k) { return m.has(k) ? m.get(k) : null; }, set: function (k, v) { m.set(k, v); } };
  }

  function readJSON(store, key) {
    try {
      const v = store.get(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(store, key, value) {
    try {
      store.set(key, JSON.stringify(value));
    } catch (e) {
      // storage can be unavailable (private windows); the game goes on without it
    }
  }

  // ------------------------------------------------------------------ levels

  function startLevel(app, index, skill, carry) {
    const list = levels();
    const def = list[index];
    const level = ns.map.compile(def);
    const daily = app.dailyRun && app.dailyRun.level === index ? app.dailyRun : null;
    const g = {
      level: level,
      levelIndex: index,
      skill: skill,
      rng: ns.rng.create(daily ? (daily.seed % 100000) + 7 : 1000 + index * 77 + skill),
      collection: app.collection,
      saidStronger: app.g ? app.g.saidStronger : false,
      caravanDropped: app.g ? app.g.caravanDropped : false,
      mods: {},
      daily: Boolean(daily),
      steadyLights: app.still
    };
    if (daily) {
      g.mods[daily.mod.id] = true;
    }
    ns.level.start(g);
    applyMods(g);
    ns.player.spawn(g, carry || null);
    g.startCarry = ns.player.carryOut(g.player);
    g.mapSeen = new Uint8Array(level.w * level.h);
    // entering a map pulls its PLACES card
    if (def.card) {
      ns.level.pull(g, def.card);
    }
    app.g = g;
    app.state = 'play';
    app.menu = null;
    app.automap = false;
    app.paused = false;
    app.exiting = 0;
    const j = app.juice;
    j.combo.count = 0;
    j.spree = 0;
    j.parts.length = 0;
    j.pops.length = 0;
    j.announce = null;
    // the day streak counts days on which a map was played
    const today = app.today();
    if (ns.meta.touchStreak(app.meta, today)) {
      const n = app.meta.streak.count;
      ns.juice.brag(j, ns.defs.text.flashy.STREAK + ' ' + n);
    }
    ns.meta.refreshUnlocks(app.meta, today);
    saveMeta(app);
    if (daily) {
      ns.juice.brag(j, ns.defs.text.flashy.DAILY + ': ' + daily.mod.name + ' - ' + daily.mod.text);
    }
  }

  // The daily modifiers that change a map once it is loaded.
  function applyMods(g) {
    const m = g.mods;
    if (m.dark) {
      g.level.cells.forEach(function (c) {
        if (!c.solid) {
          c.light0 = Math.max(0, c.light0 - 4);
          c.light = c.light0;
        }
      });
    }
    for (const mo of g.things) {
      if (m.hostile && mo.def.lane === 'woman') {
        mo.provoked = true;
      }
      if (m.turbo && mo.def.lane === 'vehicle') {
        mo.speedScale = 1.5;
      }
    }
  }

  function finishLevel(app) {
    const g = app.g;
    const list = levels();
    const def = list[g.levelIndex];
    const next = list[g.levelIndex + 1];
    app.inter = {
      levelName: def.name,
      stats: g.stats,
      par: def.par || 0,
      pulled: g.pulled.slice(),
      shown: { kills: 0, items: 0, secrets: 0, time: 0 },
      target: {
        kills: ns.screens.pct(g.stats.kills, g.stats.killsTotal),
        items: ns.screens.pct(g.stats.items, g.stats.itemsTotal),
        secrets: ns.screens.pct(g.stats.secrets, g.stats.secretsTotal),
        time: Math.floor(g.stats.time / 35)
      },
      phase: 0,
      wait: 0,
      flipped: 0,
      next: next && !g.daily ? next.name + ' — ' + next.hour : null,
      carry: ns.player.carryOut(g.player),
      daily: g.daily,
      stars: null,
      rules: ns.meta.starRules(def.par || 0),
      starShown: 0,
      starWait: 0,
      foilShown: 0
    };
    // stars, FOIL, the daily score and whatever that unlocks
    const m = app.meta;
    const today = app.today();
    const stars = ns.meta.starsFor(g.stats, def.par || 0);
    app.inter.stars = stars;
    app.inter.rec = ns.meta.recordMap(m, def.slug, stars, g.stats.time);
    if (g.daily) {
      const score = ns.meta.dailyScore(g.stats, def.par || 0);
      app.inter.dailyScore = score;
      app.inter.dailyBest = ns.meta.recordDaily(m, today, score);
    }
    m.bestCombo = Math.max(m.bestCombo, app.juice.combo.best);
    app.inter.unlocked = ns.meta.refreshUnlocks(m, today);
    saveMeta(app);
    app.state = 'inter';
    saveCollection(app);
  }

  function saveCollection(app) {
    writeJSON(app.store, KEY.collection, app.collection);
  }

  // ------------------------------------------------------------------ input helpers

  // Input tokens are KeyboardEvent.code values plus 'mouse0'..'mouse2'. An action is pressed
  // or held when any of its bound codes is; menu OK also takes the left mouse button.
  function pressed(input, keys) {
    return input.pressed.some(function (k) { return keys.indexOf(k) >= 0; });
  }

  function keysOf(app, ids) {
    let out = [];
    for (const id of ids) {
      out = out.concat(app.bindings[id] || []);
      if (id === 'menu_ok') {
        out.push('mouse0');
      }
    }
    return out;
  }

  // act(app, input, 'menu_ok') or act(app, input, ['menu_back', 'menu_ok'])
  function act(app, input, ids) {
    return pressed(input, keysOf(app, typeof ids === 'string' ? [ids] : ids));
  }

  function holding(app, input, id) {
    const h = input.held || {};
    const keys = app.bindings[id] || [];
    for (let i = 0; i < keys.length; i++) {
      if (h[keys[i]]) {
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ menus

  function openMenu(app, name, sel) {
    app.menu = { name: name, sel: sel || 0, prompt: null, typing: null };
    app.events.push({ sound: 'MENU_SELECT' });
  }

  function menuItems(app) {
    const t = T();
    const m = app.menu;
    const o = app.options;
    switch (m.name) {
      case 'main': {
        const list = t.flashy.menu.map(function (label, i) {
          const it = { label: label };
          if (i === 7) {
            it.dim = !app.g || app.state !== 'play';
          }
          if (i === 2 && ns.meta.chestReady(app.meta, app.today())) {
            it.badge = t.flashy.NEW;
          }
          if (i === 4 && Object.keys(app.meta.fresh).length) {
            it.badge = t.flashy.NEW;
          }
          return it;
        });
        if (app.nexus) {
          list.push({ label: t.flashy.NEXUS, icon: 'back' });
        }
        return list;
      }
      case 'skill':
        return t.skills.map(function (s) { return { label: s }; });
      case 'options':
        return [
          { label: t.options[0], value: o.alwaysRun ? 'ON' : 'OFF' },
          { label: t.options[1], value: ns.screens.slider(o.mouse, 10) },
          { label: t.options[2], value: ns.screens.slider(o.sound, 10) },
          { label: t.options[3], value: ns.screens.slider(o.music, 10) },
          { label: t.options[4], value: o.scanlines ? 'ON' : 'OFF' },
          { label: t.options[5], value: o.messages ? 'ON' : 'OFF' },
          { label: t.options[6] }
        ];
      case 'load':
      case 'save':
        return [0, 1, 2, 3, 4, 5].map(function (i) {
          const s = readJSON(app.store, KEY.save + i);
          let label = s ? s.name : t.EMPTY_SLOT;
          if (m.typing && m.typing.slot === i) {
            label = m.typing.text + (app.still || Math.floor(app.tic / 12) % 2 ? '_' : ' ');
          }
          return { label: label, dim: m.name === 'load' && !s };
        });
      default:
        return [];
    }
  }

  function menuTick(app, input) {
    const m = app.menu;
    const t = T();
    if (m.prompt) {
      if (act(app, input, 'yes')) {
        const action = m.prompt.yes;
        m.prompt = null;
        action();
      } else if (act(app, input, 'no')) {
        m.prompt = null;
        app.events.push({ sound: 'MENU_BACK' });
      }
      return;
    }
    if (m.typing) {
      for (const ch of input.typed) {
        if (m.typing.text.length < 22 && /^[ -~]$/.test(ch)) {
          m.typing.text += ch.toUpperCase();
        }
      }
      if (act(app, input, 'erase')) {
        m.typing.text = m.typing.text.slice(0, -1);
      } else if (act(app, input, 'cancel')) {
        m.typing = null;
      } else if (act(app, input, 'confirm')) {
        saveGame(app, m.typing.slot, m.typing.text || app.g.level.name);
        m.typing = null;
        app.menu = null;
      }
      return;
    }
    if (m.name === 'locker') {
      lockerTick(app, m, input);
      return;
    }
    if (m.name === 'chest') {
      chestTick(app, m, input);
      return;
    }
    if (m.name === 'daily') {
      if (act(app, input, 'menu_ok')) {
        startDaily(app);
      } else if (act(app, input, 'menu_back')) {
        openMenu(app, 'main', 1);
      }
      return;
    }
    if (m.name === 'credits') {
      creditsTick(app, m, input);
      return;
    }
    if (m.name === 'collection') {
      if (act(app, input, 'menu_left')) {
        m.sel = (m.sel + 32) % 33;
      } else if (act(app, input, 'menu_right')) {
        m.sel = (m.sel + 1) % 33;
      } else if (act(app, input, 'menu_up')) {
        m.sel = (m.sel + 33 - 11) % 33;
      } else if (act(app, input, 'menu_down')) {
        m.sel = (m.sel + 11) % 33;
      } else if (act(app, input, ['menu_back', 'menu_ok'])) {
        openMenu(app, 'main', 3);
      }
      return;
    }
    const items = menuItems(app);
    if (act(app, input, 'menu_up')) {
      m.sel = (m.sel + items.length - 1) % items.length;
      app.events.push({ sound: 'MENU_MOVE' });
    } else if (act(app, input, 'menu_down')) {
      m.sel = (m.sel + 1) % items.length;
      app.events.push({ sound: 'MENU_MOVE' });
    } else if (act(app, input, 'menu_back')) {
      app.events.push({ sound: 'MENU_BACK' });
      if (m.name === 'main') {
        app.menu = null;
      } else {
        openMenu(app, 'main', 0);
      }
    } else if (m.name === 'options' && act(app, input, ['menu_left', 'menu_right'])) {
      const dir = act(app, input, 'menu_left') ? -1 : 1;
      const o = app.options;
      const key = [null, 'mouse', 'sound', 'music'][m.sel];
      if (key) {
        o[key] = Math.max(key === 'mouse' ? 1 : 0, Math.min(10, o[key] + dir));
        writeJSON(app.store, KEY.options, o);
        app.events.push({ sound: 'MENU_MOVE' });
      }
    } else if (act(app, input, 'menu_ok')) {
      choose(app, m, items, t);
    }
  }

  function choose(app, m, items, t) {
    const it = items[m.sel];
    if (it && it.dim) {
      app.events.push({ sound: 'MENU_BACK' });
      return;
    }
    app.events.push({ sound: 'MENU_SELECT' });
    m.pressTic = app.tic;
    if (m.name === 'main') {
      if (m.sel === 0) {
        openMenu(app, 'skill', 2);
      } else if (m.sel === 1) {
        openMenu(app, 'daily', 0);
      } else if (m.sel === 2) {
        openMenu(app, 'chest', 0);
        app.menu.chest = { pokes: 0, shakeTic: -100, openTic: -1, prize: null };
      } else if (m.sel === 3) {
        openMenu(app, 'collection', 0);
      } else if (m.sel === 4) {
        openMenu(app, 'locker', 0);
        app.menu.prev = 0;
      } else if (m.sel === 5) {
        openMenu(app, 'options', 0);
      } else if (m.sel === 6) {
        openMenu(app, 'load', 0);
      } else if (m.sel === 7) {
        openMenu(app, 'save', 0);
      } else if (m.sel === 8) {
        openMenu(app, 'credits', 0);
        app.menu.scroll = 0;
      } else if (m.sel === 10) {
        // back to the STOINLY NEXUS; the shell does the navigation
        app.nav = 'nexus';
      } else if (m.sel === 9) {
        const died = app.g && app.g.player && app.g.player.dead;
        m.prompt = { text: died ? t.QUIT_AFTER_DEATH : t.QUIT_PROMPT, yes: function () { app.g = null; app.state = 'title'; app.menu = null; } };
      }
    } else if (m.name === 'skill') {
      const skill = m.sel;
      if (skill === 4) {
        m.prompt = { text: t.NIGHTMARE, yes: function () { newGame(app, 4); } };
      } else {
        newGame(app, skill);
      }
    } else if (m.name === 'options') {
      const o = app.options;
      if (m.sel === 0) {
        o.alwaysRun = !o.alwaysRun;
      } else if (m.sel === 4) {
        o.scanlines = !o.scanlines;
      } else if (m.sel === 5) {
        o.messages = !o.messages;
      } else if (m.sel === 6) {
        m.prompt = { text: t.RESET_CONFIRM, yes: function () { app.collection = {}; if (app.g) { app.g.collection = app.collection; } saveCollection(app); } };
      }
      writeJSON(app.store, KEY.options, o);
    } else if (m.name === 'load') {
      loadGame(app, m.sel);
    } else if (m.name === 'save') {
      const s = readJSON(app.store, KEY.save + m.sel);
      m.typing = { slot: m.sel, text: s ? s.name : '' };
    }
  }

  function newGame(app, skill) {
    app.g = null;
    app.dailyRun = null;
    startLevel(app, 0, skill, null);
  }

  function startDaily(app) {
    const d = ns.meta.daily(app.today(), levels().length);
    app.g = null;
    app.dailyRun = d;
    app.events.push({ sound: 'STING_REWARD' });
    startLevel(app, d.level, 2, JSON.parse(JSON.stringify(d.carry)));
  }

  // ------------------------------------------------------------------ the locker

  function lockerTick(app, m, input) {
    const list = ns.meta.COSMETICS;
    const meta = app.meta;
    const row = 7;
    const before = m.sel;
    if (act(app, input, 'menu_left')) {
      m.sel = (m.sel + list.length - 1) % list.length;
    } else if (act(app, input, 'menu_right')) {
      m.sel = (m.sel + 1) % list.length;
    } else if (act(app, input, ['menu_up', 'menu_down'])) {
      m.sel = (m.sel + row) % list.length;
    } else if (act(app, input, 'menu_back')) {
      openMenu(app, 'main', 4);
      saveMeta(app);
      return;
    } else if (act(app, input, 'menu_ok')) {
      const c = list[m.sel];
      m.pressTic = app.tic;
      if (meta.unlocked[c.id]) {
        ns.meta.equip(meta, c.id);
        app.events.push({ sound: 'MENU_SELECT' });
        m.note = null;
      } else if (c.unlock.foil && ns.meta.buy(meta, c.id)) {
        ns.meta.equip(meta, c.id);
        app.events.push({ sound: 'STING_UNLOCK' });
        ns.juice.confetti(app.juice, 80, 160, 70);
        m.note = null;
      } else {
        app.events.push({ sound: 'MENU_BACK' });
        m.note = c.unlock.foil ? ns.defs.text.flashy.LOCKER_POOR : null;
        ns.juice.shake(app.juice, 2);
      }
      saveMeta(app);
      return;
    }
    if (m.sel !== before) {
      app.events.push({ sound: 'MENU_MOVE' });
      // a NEW! badge goes once its item has been looked at
      if (meta.fresh[list[before].id]) {
        delete meta.fresh[list[before].id];
        saveMeta(app);
      }
      m.note = null;
    }
  }

  // ------------------------------------------------------------------ the daily chest

  function chestTick(app, m, input) {
    const c = m.chest;
    if (act(app, input, 'menu_back')) {
      openMenu(app, 'main', 2);
      return;
    }
    if (!act(app, input, 'menu_ok')) {
      return;
    }
    if (c.openTic >= 0 || !ns.meta.chestReady(app.meta, app.today())) {
      openMenu(app, 'main', 2);
      return;
    }
    c.pokes++;
    c.shakeTic = app.tic;
    app.events.push({ sound: 'STING_SHAKE' });
    if (c.pokes >= 3) {
      c.prize = ns.meta.openChest(app.meta, app.today());
      c.openTic = app.tic;
      saveMeta(app);
      app.events.push({ sound: 'STING_POP' });
      app.events.push({ sound: c.prize && c.prize.item ? 'STING_UNLOCK' : 'STING_REWARD' });
      ns.juice.confetti(app.juice, 180, 160, 88);
      ns.juice.shake(app.juice, 3);
    }
  }

  // ------------------------------------------------------------------ the credits crawl

  function creditsTick(app, m, input) {
    if (act(app, input, ['menu_back', 'confirm'])) {
      if (app.state === 'credits') {
        app.state = 'title';
        app.titleSince = app.tic;
        app.menu = null;
      } else {
        openMenu(app, 'main', 8);
      }
      return;
    }
    const speed = holding(app, input, 'menu_down') ? 3 : (holding(app, input, 'menu_up') ? -3 : 0.5);
    m.scroll = Math.max(0, m.scroll + speed);
    const end = ns.screens.creditsLength();
    if (m.scroll > end) {
      if (app.state === 'credits') {
        app.state = 'title';
        app.titleSince = app.tic;
        app.menu = null;
      } else {
        m.scroll = 0;
      }
    }
  }

  // ------------------------------------------------------------------ save and load

  function serialize(g) {
    const ids = new Map();
    g.things.forEach(function (o) { ids.set(o, o.id); });
    const ref = function (o) {
      return o && ids.has(o) ? o.id : null;
    };
    const things = g.things.filter(function (o) { return !o.removed; }).map(function (o) {
      const out = {};
      for (const k in o) {
        const v = o[k];
        if (k === 'def' || k === 'cellRef' || k === 'route') {
          continue;
        }
        if (v && typeof v === 'object' && v.id !== undefined && v.def) {
          out[k] = { ref: ref(v) };
        } else if (typeof v !== 'function') {
          out[k] = v;
        }
      }
      if (o.route) {
        out.routeTag = o.routeTag;
      }
      return out;
    });
    const cells = g.level.cells.map(function (c) {
      return {
        fz: c.fz, cz: c.cz, light: c.light, door: c.door ? Object.assign({}, c.door) : null,
        sw: c.sw ? Object.assign({}, c.sw) : null, secretFound: Boolean(c.secretFound),
        tex: c.tex, faces: c.faces, decals: c.decals
      };
    });
    return {
      levelIndex: g.levelIndex, skill: g.skill, rng: g.rng.getState(), tic: g.tic, nextId: g.nextId,
      stats: g.stats, pulled: g.pulled, saidStronger: g.saidStronger, caravanDropped: g.caravanDropped,
      startCarry: g.startCarry, things: things, cells: cells,
      movers: g.level.movers.map(function (m) { return { state: m.state, timer: m.timer }; }),
      triggers: g.level.triggers.map(function (t) { return t.fired; }),
      mapSeen: Array.from(g.mapSeen)
    };
  }

  function saveGame(app, slot, name) {
    const g = app.g;
    const data = { name: name.slice(0, 22), state: serialize(g) };
    writeJSON(app.store, KEY.save + slot, data);
  }

  function loadGame(app, slot) {
    const data = readJSON(app.store, KEY.save + slot);
    if (!data) {
      return;
    }
    const s = data.state;
    app.dailyRun = null;
    startLevel(app, s.levelIndex, s.skill, s.startCarry);
    const g = app.g;
    g.rng.setState(s.rng);
    g.tic = s.tic;
    g.nextId = s.nextId;
    g.stats = s.stats;
    g.pulled = s.pulled;
    g.saidStronger = s.saidStronger;
    g.caravanDropped = s.caravanDropped;
    g.startCarry = s.startCarry;
    g.mapSeen = Uint8Array.from(s.mapSeen);
    s.cells.forEach(function (c, i) {
      const cell = g.level.cells[i];
      cell.fz = c.fz;
      cell.cz = c.cz;
      cell.light = c.light;
      if (c.door) {
        Object.assign(cell.door, c.door);
      }
      if (c.sw) {
        Object.assign(cell.sw, c.sw);
      }
      cell.secretFound = c.secretFound;
      cell.tex = c.tex;
      cell.faces = c.faces;
      cell.decals = c.decals;
    });
    ns.render.prepare(g.level);
    s.movers.forEach(function (m, i) {
      Object.assign(g.level.movers[i], m);
    });
    s.triggers.forEach(function (f, i) {
      g.level.triggers[i].fired = f;
    });
    // rebuild the things, then their references
    const byId = new Map();
    g.things = s.things.map(function (o) {
      const def = o.type === 'PLAYER' ? null : ns.defs.things[o.type];
      const mo = Object.assign({}, o);
      mo.def = def || g.player.def;
      byId.set(mo.id, mo);
      return mo;
    });
    g.things.forEach(function (mo) {
      for (const k in mo) {
        const v = mo[k];
        if (v && typeof v === 'object' && v.ref !== undefined) {
          mo[k] = v.ref === null ? null : (byId.get(v.ref) || null);
        }
      }
      if (mo.routeTag) {
        mo.route = g.level.tags[mo.routeTag];
      }
      if (mo.player) {
        g.player = mo;
        mo.cellRef = ns.map.cellAt(g.level, mo.x, mo.y);
      }
    });
    app.menu = null;
  }

  // ------------------------------------------------------------------ the tic

  function playInput(app, input) {
    const o = app.options;
    const h = input.held || {};
    const on = function (id) {
      return holding(app, input, id);
    };
    const shift = on('run');
    const run = o.alwaysRun ? !shift : shift;
    const turnSpeed = run ? 0.1 : 0.06;
    const side = on('strafe_mod');
    let forward = 0;
    let strafe = 0;
    let turn = 0;
    if (on('forward')) {
      forward += 1;
    }
    if (on('back')) {
      forward -= 1;
    }
    if (on('strafe_left')) {
      strafe -= 1;
    }
    if (on('strafe_right')) {
      strafe += 1;
    }
    if (on('turn_left')) {
      if (side) {
        strafe -= 1;
      } else {
        turn -= turnSpeed;
      }
    }
    if (on('turn_right')) {
      if (side) {
        strafe += 1;
      } else {
        turn += turnSpeed;
      }
    }
    let weapon = 0;
    for (const k of input.pressed) {
      for (let n = 1; n <= 7; n++) {
        if ((app.bindings['weapon' + n] || []).indexOf(k) >= 0) {
          weapon = n;
        }
      }
    }
    return {
      forward: forward,
      strafe: strafe,
      turn: turn,
      mouseTurn: (input.mouseDX || 0) * 0.0008 * (o.mouse + 1),
      run: run,
      fire: Boolean(on('fire') || h.mouse0),
      use: act(app, input, 'use'),
      weapon: weapon,
      cycle: input.wheel || 0
    };
  }

  function tick(app, input) {
    app.tic++;
    const stings = [];
    ns.juice.tick(app.juice, app.tic, stings);
    for (const s0 of stings) {
      app.events.push({ sound: s0 });
    }
    if (app.menu) {
      menuTick(app, input);
      return;
    }
    switch (app.state) {
      case 'title':
        if (input.pressed.length) {
          openMenu(app, 'main', 0);
          app.titleSince = app.tic;
        }
        if (app.titleSince === undefined) {
          app.titleSince = app.tic;
        }
        if (app.tic - app.titleSince >= 35 * 20) {
          app.titleSince = app.tic;
          startCredits(app);
        }
        return;
      case 'credits':
        if (input.pressed.length && !act(app, input, ['menu_up', 'menu_down'])) {
          app.state = 'title';
          app.titleSince = app.tic;
          app.menu = null;
          return;
        }
        creditsTick(app, app.creditsView, input);
        return;
      case 'play':
        playTick(app, input);
        return;
      case 'inter':
        interTick(app, input);
        return;
      case 'finale':
        app.finaleTic++;
        if (app.finaleTic > 70 && (app.finaleTic - 70) * 3 < T().FINALE.length && app.finaleTic % 4 === 0) {
          app.events.push({ sound: 'COUNT_TICK' });
        }
        if (app.finaleTic > 70 && act(app, input, ['menu_ok', 'menu_back']) && app.finaleTic > 70 + T().FINALE.length / 3) {
          startCredits(app);
          app.g = null;
        }
        return;
      default:
        return;
    }
  }

  function startCredits(app) {
    app.state = 'credits';
    app.creditsTic = app.tic;
    app.creditsView = { scroll: 0 };
  }

  function playTick(app, input) {
    if (app.exiting > 0) {
      // the exit celebration: the world holds still under the confetti
      if (--app.exiting === 0) {
        finishLevel(app);
      }
      return;
    }
    if (act(app, input, 'menu')) {
      openMenu(app, 'main', 0);
      return;
    }
    if (act(app, input, 'quicksave')) {
      openMenu(app, 'save', 0);
      return;
    }
    if (act(app, input, 'quickload')) {
      openMenu(app, 'load', 0);
      return;
    }
    if (act(app, input, 'automap')) {
      app.automap = !app.automap;
    }
    if (act(app, input, 'pause')) {
      app.paused = !app.paused;
    }
    if (app.paused) {
      return;
    }
    // hit-stop: a kill freezes the world for a couple of tics (never under reduced motion)
    if (app.reduced) {
      app.juice.stop = 0;
    }
    if (app.juice.stop > 0) {
      app.juice.stop--;
      return;
    }
    const g = app.g;
    g.tic++;
    g.stats.time++;
    ns.player.tick(g, playInput(app, input));
    ns.world.tick(g);
    ns.level.tick(g);
    if (g.tic % 4 === 0) {
      ns.hud.markSeen(g);
    }
    if (g.collectionDirty) {
      g.collectionDirty = false;
      saveCollection(app);
    }
    // move the game's sound events to the app for the audio shell
    for (const e of g.events) {
      app.events.push(e);
    }
    g.events.length = 0;
    const stings = [];
    for (const ev of g.fx) {
      ns.juice.event(app.juice, ev, g.tic, stings);
    }
    g.fx.length = 0;
    for (const s0 of stings) {
      app.events.push({ sound: s0 });
    }
    if (g.restart) {
      startLevel(app, g.levelIndex, g.skill, g.startCarry);
      return;
    }
    if (g.finale) {
      ns.level.pull(g, 31);
      saveCollection(app);
      app.state = 'finale';
      app.finaleTic = 0;
      return;
    }
    if (g.exit) {
      app.events.push({ sound: 'LEVEL_EXIT' });
      app.events.push({ sound: 'STING_CLEAR' });
      app.events.push({ sound: 'STING_POP' });
      ns.juice.confetti(app.juice, 180);
      ns.juice.announce(app.juice, T().flashy.LEVEL_CLEAR, { rainbow: true, life: 50, y: 60 });
      app.exiting = 50;
    }
  }

  // The tally: KILLS, ITEMS, SECRETS count up; TIME and PAR; the three stars land one by one
  // with their rules; FOIL ticks up; the cards pulled flip in; then ENTERING. Fire skips.
  function interTick(app, input) {
    const st = app.inter;
    const skip = act(app, input, 'menu_ok');
    const keys = ['kills', 'items', 'secrets'];
    if (st.wait > 0) {
      st.wait--;
      if (!skip) {
        return;
      }
    }
    if (skip && st.phase < 6) {
      keys.forEach(function (kk) { st.shown[kk] = st.target[kk]; });
      st.shown.time = st.target.time;
      st.starShown = 3;
      st.foilShown = st.rec ? st.rec.foil : 0;
      st.flipped = st.pulled.length;
      st.phase = 6;
      st.wait = 6;
      if (st.stars && st.stars.every(Boolean)) {
        ns.juice.confetti(app.juice, 80);
      }
      return;
    }
    if (st.phase < 3) {
      const k = keys[st.phase];
      st.shown[k] = Math.min(st.target[k], st.shown[k] + 2);
      if (app.tic % 3 === 0) {
        app.events.push({ sound: 'COUNT_TICK' });
      }
      if (st.shown[k] >= st.target[k]) {
        st.phase++;
        st.wait = 14;
        app.events.push({ sound: 'COUNT_PAUSE' });
      }
      return;
    }
    if (st.phase === 3) {
      st.shown.time = Math.min(st.target.time, st.shown.time + 3);
      if (st.shown.time >= st.target.time) {
        st.shown.time = st.target.time;
        st.phase = 4;
        st.wait = 14;
      }
      return;
    }
    if (st.phase === 4) {
      // the stars, one by one; an unearned star lands grey and silent
      if (st.starShown < 3) {
        if (--st.starWait <= 0) {
          const i = st.starShown;
          st.starShown++;
          st.starTic = app.tic;
          st.starWait = 20;
          if (st.stars[i]) {
            app.events.push({ sound: 'STING_STAR' });
            const pos = ns.screens.STAR_POS[i];
            ns.juice.confetti(app.juice, 30, pos[0], pos[1]);
          } else {
            app.events.push({ sound: 'MENU_BACK' });
          }
          if (st.starShown === 3 && st.stars.every(Boolean)) {
            app.events.push({ sound: 'STING_REWARD' });
            ns.juice.confetti(app.juice, 120);
          }
        }
        return;
      }
      const foil = st.rec ? st.rec.foil : 0;
      if (st.foilShown < foil) {
        st.foilShown = Math.min(foil, st.foilShown + 1);
        if (app.tic % 2 === 0) {
          app.events.push({ sound: 'TINK_' + (1 + Math.min(7, Math.floor(st.foilShown / 8))) });
        }
        return;
      }
      st.phase = 5;
      st.wait = 10;
      return;
    }
    if (st.phase === 5) {
      if (app.tic % 12 === 0 && st.flipped < st.pulled.length) {
        st.flipped++;
        app.events.push({ sound: 'WEAPON_PICKUP' });
      }
      if (st.flipped >= st.pulled.length) {
        st.phase = 6;
        st.wait = 10;
        if (st.unlocked && st.unlocked.length) {
          app.events.push({ sound: 'STING_UNLOCK' });
          ns.juice.confetti(app.juice, 80);
        }
      }
      return;
    }
    if (st.phase === 6 && skip) {
      const next = app.g.levelIndex + 1;
      if (!st.daily && next < levels().length) {
        startLevel(app, next, app.g.skill, st.carry);
      } else {
        app.state = 'title';
        app.titleSince = app.tic;
        app.g = null;
        app.dailyRun = null;
      }
    }
  }

  // ------------------------------------------------------------------ drawing

  // still: no blinking, so a power-up running out holds its look to the end.
  function camera(g, frac, still) {
    const pl = g.player;
    const lerp = function (a, b) {
      return a + (b - a) * frac;
    };
    let da = pl.angle - (pl.pangle === undefined ? pl.angle : pl.pangle);
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const pw = pl.powers;
    let fixed = null;
    if (pw.ceiling > 0 && (still || pw.ceiling > 128 || (pw.ceiling & 8))) {
      fixed = 32;
    } else if (pw.glasses > 0 && (still || pw.glasses > 128 || (pw.glasses & 8))) {
      fixed = 0;
    }
    return {
      x: lerp(pl.px, pl.x),
      y: lerp(pl.py, pl.y),
      z: pl.viewz,
      angle: (pl.pangle === undefined ? pl.angle : pl.pangle) + da * frac,
      extra: pl.psp.flash > 0 ? 1 : 0,
      fixed: fixed
    };
  }

  function sprites(g, frac, still) {
    const out = [];
    for (const o of g.things) {
      if (o.removed || o.player || !o.sprite || o.def.kind === 'spot') {
        continue;
      }
      out.push({
        x: o.px + (o.x - o.px) * frac,
        y: o.py + (o.y - o.py) * frac,
        z: o.pz + (o.z - o.pz) * frac,
        angle: o.angle,
        sprite: o.sprite,
        frame: o.frame,
        bright: o.bright || o.def.bright,
        fuzz: o.type === 'JAWN',
        flash: !still && !o.dead && o.flashUntil !== undefined && o.flashUntil > g.tic
      });
    }
    return out;
  }

  // What the pause screen and the title show about the hooks.
  function hookInfo(app) {
    const m = app.meta;
    const today = app.today();
    return {
      stars: ns.meta.totalStars(m),
      starsMax: levels().length * 3,
      foil: m.foil,
      streak: ns.meta.streakNow(m, today),
      chestReady: ns.meta.chestReady(m, today),
      bestCombo: m.bestCombo,
      daily: ns.meta.daily(today, levels().length),
      dailyBest: m.daily.date === today ? m.daily.best : 0,
      dailyPlays: m.daily.date === today ? m.daily.plays : 0,
      levelName: function (i) { return levels()[i].name; },
      reduced: app.reduced,
      still: app.still,
      fresh: Object.keys(m.fresh).length
    };
  }

  function drawPlay(app, fb, frac) {
    const g = app.g;
    const j = app.juice;
    if (app.automap) {
      ns.hud.automap(fb, g, 8);
    } else {
      const cam = camera(g, frac, app.still);
      ns.render.view(fb, g.level, cam, sprites(g, frac, app.still), { tic: g.tic, weapon: ns.hud.weaponView(g, g.player, frac, equipped(app, 'weapon')), lowDetail: app.settings.performance });
      ns.juice.drawWorld(fb, j, cam, app.tic);
      ns.juice.applyShake(fb, j, app.tic);
    }
    ns.hud.statusBar(fb, g);
    ns.hud.theme(fb, equipped(app, 'hud'), app.tic, app.reduced);
    const ticker = ns.juice.drawTicker(fb, j, app.tic);
    ns.hud.messages(fb, g, app.options.messages, ticker ? 16 : 3);
    if (g.player.dead) {
      ns.screens.deathOverlay(fb, g.player.deadTics);
    }
    ns.juice.drawScreen(fb, j, app.tic);
    if (app.paused && !app.menu) {
      const def = levels()[g.levelIndex];
      ns.screens.pause(fb, app.tic, {
        stars: app.meta.stars[def.slug] || [false, false, false],
        rules: ns.meta.starRules(def.par || 0),
        now: ns.meta.starsFor(g.stats, def.par || 0),
        stats: g.stats,
        reduced: app.reduced
      });
    }
    return ns.hud.tint(g, app.still);
  }

  function draw(app, fb, frac) {
    let tint = null;
    switch (app.state) {
      case 'title':
        ns.screens.title(fb, app.tic, hookInfo(app));
        break;
      case 'credits':
        ns.screens.credits(fb, app.tic, app.creditsView ? app.creditsView.scroll : 0, app.still);
        break;
      case 'play':
        tint = drawPlay(app, fb, app.paused || app.menu || app.exiting ? 0 : frac);
        break;
      case 'inter':
        ns.screens.intermission(fb, app.inter, app.tic, app.reduced, app.still);
        ns.juice.drawScreen(fb, app.juice, app.tic);
        break;
      case 'finale':
        if (app.finaleTic < 70) {
          if (app.g) {
            drawPlay(app, fb, 0);
          }
          ns.screens.whiteout(fb, app.finaleTic / 70);
        } else {
          ns.screens.finale(fb, app.tic, (app.finaleTic - 70) * 3, app.still);
        }
        break;
      default:
        break;
    }
    if (app.menu) {
      const m = app.menu;
      const full = { collection: 1, locker: 1, chest: 1, daily: 1, credits: 1 };
      if (!full[m.name]) {
        ns.render.darken(fb, 0, 0, W, 200, app.state === 'play' ? 10 : 14);
      }
      if (m.name === 'collection') {
        ns.screens.collection(fb, app.collection, m.sel, app.tic, app.still);
      } else if (m.name === 'locker') {
        ns.screens.locker(fb, app.meta, m, app.tic, app.reduced, app.still);
      } else if (m.name === 'chest') {
        ns.screens.chest(fb, m.chest, ns.meta.chestReady(app.meta, app.today()) || m.chest.openTic >= 0, app.tic, app.reduced, app.still);
      } else if (m.name === 'daily') {
        ns.screens.daily(fb, hookInfo(app), app.today(), app.tic, app.reduced, app.still);
      } else if (m.name === 'credits') {
        ns.screens.credits(fb, app.tic, m.scroll, app.still);
      } else {
        const t = T();
        const titles = { main: null, skill: t.EPISODE, options: t.menu.OPTIONS, load: t.menu.LOAD, save: t.menu.SAVE };
        const opts = { title: titles[m.name], pressTic: m.pressTic, reduced: app.reduced, still: app.still };
        if (m.name === 'skill') {
          opts.x = 26;
          opts.y = 64;
          opts.step = 20;
        } else if (m.name === 'options') {
          opts.font = 'SMALL';
          opts.x = 40;
          opts.y = 50;
          opts.step = 14;
        } else if (m.name === 'load' || m.name === 'save') {
          opts.font = 'SMALL';
          opts.x = 70;
          opts.y = 54;
          opts.step = 16;
        }
        const items = menuItems(app);
        if (m.name === 'main') {
          // eleven items (with the NEXUS one) need a tighter column to fit the screen
          opts.y = items.length > 10 ? 14 : 22;
          opts.x = 72;
          opts.step = items.length > 10 ? 16 : 17;
        }
        const top = Math.max(4, (opts.y || 46) - (opts.title ? 36 : 10));
        const bottom = Math.min(196, (opts.y || 46) + items.length * (opts.step || 19) + 4);
        ns.screens.panel(fb, 8, top, 304, bottom - top);
        ns.screens.menu(fb, items, m.sel, app.tic, opts);
      }
      if (m.prompt) {
        ns.screens.prompt(fb, m.prompt.text);
      }
      ns.juice.drawScreen(fb, app.juice, app.tic);
    }
    return tint;
  }

  function song(app) {
    if (app.state === 'play' && app.g) {
      return levels()[app.g.levelIndex].music || 'D_HEN';
    }
    if (app.state === 'inter') {
      return 'D_INTER';
    }
    if (app.state === 'finale') {
      return 'D_STOI';
    }
    return 'D_FEED';
  }

  ns.game = { create: create, levels: levels, DEFAULT_SETTINGS: DEFAULT_SETTINGS, settingsFrom: settingsFrom };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
