/* STOINLY NEXUS shared settings reader, contract v1.
 *
 * Every game vendors an IDENTICAL copy of this file (copy it, don't edit it)
 * and loads it with a plain <script> tag before its own code. It works with or
 * without the nexus: no saved settings means defaults, which means the game
 * behaves exactly as it did before. No DOM work happens until a game calls
 * applyDisplay().
 *
 * Storage: localStorage["stoinly.nexus.settings.v1"] = JSON (shape below).
 * The nexus writes it. Games only read it, except setKeys(), which the
 * nexus calls. Same-origin tabs get live updates through the `storage` event.
 */
(function (root) {
  'use strict';
  var KEY = 'stoinly.nexus.settings.v1';

  var DEFAULTS = {
    v: 1,
    audio:   { master: 1, music: 0.8, sfx: 1, mute: false },
    motion:  { reduce: false, shake: 1, flashes: true, particles: 1 },
    display: { fullscreen: false, textScale: 1, colorblind: 'off', performance: false },
    controls: {} // { [gameId]: { [actionId]: ["KeyW", "ArrowUp"] } } (KeyboardEvent.code values)
  };
  var CB_MODES = ['off', 'protanopia', 'deuteranopia', 'tritanopia'];

  function clamp(x, lo, hi, d) { x = Number(x); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; }
  function bool(x, d) { return typeof x === 'boolean' ? x : d; }

  function sanitize(raw) {
    var s = JSON.parse(JSON.stringify(DEFAULTS));
    if (!raw || typeof raw !== 'object') return s;
    var a = raw.audio || {}, m = raw.motion || {}, d = raw.display || {};
    s.audio.master = clamp(a.master, 0, 1, 1);
    s.audio.music = clamp(a.music, 0, 1, 0.8);
    s.audio.sfx = clamp(a.sfx, 0, 1, 1);
    s.audio.mute = bool(a.mute, false);
    s.motion.reduce = bool(m.reduce, false);
    s.motion.shake = clamp(m.shake, 0, 1, 1);
    s.motion.flashes = bool(m.flashes, true);
    s.motion.particles = clamp(m.particles, 0, 1, 1);
    s.display.fullscreen = bool(d.fullscreen, false);
    s.display.textScale = clamp(d.textScale, 0.8, 1.6, 1);
    s.display.colorblind = CB_MODES.indexOf(d.colorblind) >= 0 ? d.colorblind : 'off';
    s.display.performance = bool(d.performance, false);
    var c = raw.controls;
    if (c && typeof c === 'object') {
      for (var g in c) if (c[g] && typeof c[g] === 'object') {
        s.controls[g] = {};
        for (var act in c[g]) if (Array.isArray(c[g][act])) {
          s.controls[g][act] = c[g][act].filter(function (k) { return typeof k === 'string'; }).slice(0, 3);
        }
      }
    }
    return s;
  }

  function osReducedMotion() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  var cache = null, listeners = [];
  function load() {
    var raw = null;
    try { raw = JSON.parse(root.localStorage.getItem(KEY)); } catch (e) { raw = null; }
    cache = sanitize(raw);
    return cache;
  }
  function get() { return cache || load(); }

  function save(next) {
    cache = sanitize(next);
    try { root.localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
    fire();
    return cache;
  }

  function fire() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](cache); } catch (e) { if (root.console) console.error(e); } } }
  function onChange(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  if (root.addEventListener) root.addEventListener('storage', function (e) { if (e.key === KEY) { load(); fire(); } });

  /* ---- derived helpers games should use ---- */
  // Final gain for a channel ('sfx' or 'music'): 0 when muted.
  function volume(channel) {
    var a = get().audio;
    if (a.mute) return 0;
    return a.master * (channel === 'music' ? a.music : a.sfx);
  }
  // True if the OS asks for reduced motion OR the nexus setting is on.
  function reducedMotion() { return get().motion.reduce || osReducedMotion(); }
  // Multiplier for screen shake (0 when reduced).
  function shakeScale() { return reducedMotion() ? 0 : get().motion.shake; }
  // Multiplier for particle counts. Reduced motion caps it at 0.25.
  function particleScale() { var p = get().motion.particles; return reducedMotion() ? Math.min(p, 0.25) : p; }
  // False means skip white hit flashes, strobes and blinking text.
  function flashesAllowed() { return get().motion.flashes && !reducedMotion(); }
  // Key codes bound to an action: the user's override if set, else defaults.
  function keysFor(gameId, actionId, defaults) {
    var g = get().controls[gameId];
    return (g && g[actionId] && g[actionId].length) ? g[actionId].slice() : (defaults || []).slice();
  }
  function setKeys(gameId, actionId, codes) {
    var s = JSON.parse(JSON.stringify(get()));
    s.controls[gameId] = s.controls[gameId] || {};
    if (codes && codes.length) s.controls[gameId][actionId] = codes; else delete s.controls[gameId][actionId];
    return save(s);
  }

  /* ---- display: one call per page, re-applied on change ---- */
  // Sets --stoinly-text-scale on <html>; toggles the classes stoinly-reduced-motion,
  // stoinly-no-flash and stoinly-perf; and applies a colour-blind filter to `targets`
  // (elements or selectors; default: every <canvas> plus [data-stoinly-cb]).
  // Games are expected to use the CSS variable and classes in their own CSS.
  var CB_MATRIX = { // daltonization-style simulation-compensation matrices (approximate)
    protanopia:   '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
    deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
    tritanopia:   '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0'
  };
  function ensureSvg(doc) {
    if (doc.getElementById('stoinly-cb-filters')) return;
    var ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('id', 'stoinly-cb-filters');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    for (var mode in CB_MATRIX) {
      var f = doc.createElementNS(ns, 'filter'); f.setAttribute('id', 'stoinly-cb-' + mode);
      f.setAttribute('color-interpolation-filters', 'linearRGB');
      var cm = doc.createElementNS(ns, 'feColorMatrix'); cm.setAttribute('type', 'matrix'); cm.setAttribute('values', CB_MATRIX[mode]);
      f.appendChild(cm); svg.appendChild(f);
    }
    (doc.body || doc.documentElement).appendChild(svg);
  }
  function applyDisplay(doc, targets) {
    doc = doc || root.document; if (!doc) return;
    function run() {
      var s = get(), html = doc.documentElement;
      html.style.setProperty('--stoinly-text-scale', String(s.display.textScale));
      html.classList.toggle('stoinly-reduced-motion', reducedMotion());
      html.classList.toggle('stoinly-no-flash', !flashesAllowed());
      html.classList.toggle('stoinly-perf', s.display.performance);
      var els = [];
      var sel = targets || ['canvas', '[data-stoinly-cb]'];
      for (var i = 0; i < sel.length; i++) {
        if (typeof sel[i] === 'string') els = els.concat([].slice.call(doc.querySelectorAll(sel[i]))); else if (sel[i]) els.push(sel[i]);
      }
      if (s.display.colorblind !== 'off') ensureSvg(doc);
      for (var j = 0; j < els.length; j++) els[j].style.filter = s.display.colorblind === 'off' ? '' : 'url(#stoinly-cb-' + s.display.colorblind + ')';
    }
    run(); onChange(run);
  }
  // Call from a user gesture (first click or keypress) if display.fullscreen is on.
  function maybeFullscreen(doc) {
    doc = doc || root.document;
    if (!get().display.fullscreen || !doc || doc.fullscreenElement) return;
    var el = doc.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
  }
  // True when the page was opened from the nexus (?from=nexus); show a "◄ NEXUS" link to "/".
  function fromNexus() { try { return /(?:^|[?&])from=nexus(?:&|$)/.test(root.location.search) || root.sessionStorage.getItem('stoinly.fromNexus') === '1'; } catch (e) { return false; } }
  try { if (/(?:^|[?&])from=nexus(?:&|$)/.test(root.location.search)) root.sessionStorage.setItem('stoinly.fromNexus', '1'); } catch (e) {}

  root.StoinlySettings = {
    KEY: KEY, DEFAULTS: DEFAULTS, CB_MODES: CB_MODES, version: 1,
    get: get, save: save, sanitize: sanitize, onChange: onChange,
    volume: volume, reducedMotion: reducedMotion, shakeScale: shakeScale, particleScale: particleScale,
    flashesAllowed: flashesAllowed, keysFor: keysFor, setKeys: setKeys,
    applyDisplay: applyDisplay, maybeFullscreen: maybeFullscreen, fromNexus: fromNexus
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.StoinlySettings;
})(typeof window !== 'undefined' ? window : globalThis);
