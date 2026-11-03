/* Wreck Riders - STOINLY NEXUS settings glue. DOM-free (loads in Node for tests).
 * src/stoinly-settings.js (the vendored, byte-identical shared reader) owns the stored settings; this file turns them into
 * WR.prefs, the plain object the renderer, effects, audio and input read every frame. Settings change ONLY drawing, sound,
 * key mapping and UI: nothing here is read by the sim, so saved winning runs replay the same with any settings
 * (test/settings.test.js checks that).
 *
 *   WR.Prefs.ACTIONS                       // every rebindable action: {id, label, defaults, group, input?}
 *   WR.Prefs.update(S, { rm })             // S = window.StoinlySettings (or null); rm = the ?rm=1 test override
 *   WR.prefs = { reduced, shake, particles, flashes, hitStop, textScale, performance, sfx, muted, keys: {actionId: [codes]} }
 *   WR.Prefs.textSize(px)                  // a canvas font size with the text scale applied (big titles grow less)
 *   WR.Prefs.keep(seed, scale)             // stable yes/no for thinning a particle by `scale` (seed = a per-particle constant)
 */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const GAME_ID = 'wreck-riders';

  // Defaults are the bindings the game had before the nexus. `input` names the field of the sim input object
  // ({up, down, left, right, space, shift, z}) a gameplay action drives; menu actions have none.
  const ACTIONS = [
    { id: 'up', label: 'Up (push / pedal / speed up / hop forward)', defaults: ['ArrowUp', 'KeyW'], group: 'ride', input: 'up' },
    { id: 'down', label: 'Down (brake / reverse / hop backward)', defaults: ['ArrowDown', 'KeyS'], group: 'ride', input: 'down' },
    { id: 'left', label: 'Lean / tilt left', defaults: ['ArrowLeft', 'KeyA'], group: 'ride', input: 'left' },
    { id: 'right', label: 'Lean / tilt right', defaults: ['ArrowRight', 'KeyD'], group: 'ride', input: 'right' },
    { id: 'special', label: 'Special (rocket / hop / bunny hop / pogo spring)', defaults: ['Space'], group: 'ride', input: 'space' },
    { id: 'passenger', label: 'Eject Pip (bicycle only)', defaults: ['ShiftLeft', 'ShiftRight'], group: 'ride', input: 'shift' },
    { id: 'eject', label: 'Eject the rider', defaults: ['KeyZ'], group: 'ride', input: 'z' },
    { id: 'restart', label: 'Restart the course', defaults: ['KeyR'], group: 'run' },
    { id: 'pause', label: 'Pause', defaults: ['KeyP'], group: 'run' },
    { id: 'mute', label: 'Mute (the shared nexus mute)', defaults: ['KeyM'], group: 'run' },
    { id: 'confirm', label: 'Confirm / next course / retry', defaults: ['Enter', 'Space'], group: 'menu' },
    { id: 'back', label: 'Back one screen', defaults: ['Escape'], group: 'menu' },
    { id: 'menuUp', label: 'Menu up', defaults: ['ArrowUp', 'KeyW'], group: 'menu' },
    { id: 'menuDown', label: 'Menu down', defaults: ['ArrowDown', 'KeyS'], group: 'menu' },
    { id: 'menuLeft', label: 'Menu left', defaults: ['ArrowLeft', 'KeyA'], group: 'menu' },
    { id: 'menuRight', label: 'Menu right', defaults: ['ArrowRight', 'KeyD'], group: 'menu' },
    { id: 'daily', label: 'Daily challenge (title screen)', defaults: ['KeyD'], group: 'menu' },
    { id: 'collection', label: 'Collection (title screen)', defaults: ['KeyC'], group: 'menu' },
    { id: 'tabNext', label: 'Next collection tab', defaults: ['Tab', 'KeyE'], group: 'menu' },
    { id: 'tabPrev', label: 'Previous collection tab', defaults: ['KeyQ'], group: 'menu' },
    { id: 'chest', label: 'Open the daily chest', defaults: ['KeyO'], group: 'menu' },
  ];
  const BY_ID = {};
  for (const a of ACTIONS) BY_ID[a.id] = a;

  function defaultKeys() { const k = {}; for (const a of ACTIONS) k[a.id] = a.defaults.slice(); return k; }
  const DEFAULTS = { reduced: false, shake: 1, particles: 1, flashes: true, hitStop: true, textScale: 1, performance: false, sfx: 1, muted: false };

  /** The prefs for settings object S (null = defaults) and test overrides o ({rm: true} forces reduced motion). */
  function derive(S, o) {
    o = o || {};
    const p = Object.assign({}, DEFAULTS, { keys: defaultKeys() });
    if (S) {
      const s = S.get();
      p.performance = !!s.display.performance;
      p.textScale = s.display.textScale;
      p.reduced = S.reducedMotion();
      p.shake = S.shakeScale();
      p.particles = S.particleScale();
      p.flashes = S.flashesAllowed();
      p.sfx = S.volume('sfx');
      p.muted = !!s.audio.mute;
      for (const a of ACTIONS) p.keys[a.id] = S.keysFor(GAME_ID, a.id, a.defaults);
    }
    if (o.rm) { p.reduced = true; p.shake = 0; p.flashes = false; p.particles = Math.min(p.particles, 0.25); }
    if (p.performance) p.particles *= 0.5;   // performance mode halves particles on top of the motion setting
    p.hitStop = !p.reduced;
    return p;
  }

  const prefs = WR.prefs = derive(null);
  WR.reducedMotion = prefs.reduced;

  /** Recompute WR.prefs in place (the object identity is kept, so modules may hold a reference). */
  function update(S, o) {
    const next = derive(S, o);
    for (const k in next) prefs[k] = next[k];
    WR.reducedMotion = prefs.reduced;   // the flag the screens and effects already read
    return prefs;
  }

  /** Font size with the text scale: small text scales fully; text above 22 px gains at most what 22 px gains. */
  function textSize(px) {
    const ts = prefs.textScale || 1;
    if (ts === 1) return px;
    return px + Math.min(px, 22) * (ts - 1);
  }

  /** Stable thinning: true for about `scale` of particles, decided by a per-particle random constant (e.g. its life). */
  function keep(seed, scale) {
    if (scale >= 1) return true;
    if (scale <= 0) return false;
    const f = (seed * 7919.371) % 1;
    return (f < 0 ? f + 1 : f) < scale;
  }

  /** Short on-screen name for a key code: KeyR -> R, Escape -> ESC, ArrowUp -> UP. */
  function keyName(code) {
    if (!code) return '?';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return 'NUM' + code.slice(6);
    const map = { Escape: 'ESC', Enter: 'ENTER', Space: 'SPACE', Tab: 'TAB', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
      ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', AltRight: 'R-ALT', Backspace: 'BKSP' };
    return map[code] || code.toUpperCase();
  }
  /** The first key bound to an action, as text. */
  function keyFor(id) { const k = prefs.keys[id]; return keyName(k && k[0]); }
  /** True when every gameplay action still has its default keys. */
  function rideKeysDefault() {
    return ACTIONS.filter((a) => a.group === 'ride').every((a) => String(prefs.keys[a.id]) === String(a.defaults));
  }
  /** "UP I · DOWN K · ..." for the gameplay actions (shown when the player has rebound them). */
  function rideKeysText() {
    const short = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', special: 'SPECIAL', passenger: 'EJECT PIP', eject: 'EJECT' };
    return ACTIONS.filter((a) => a.group === 'ride').map((a) => `${short[a.id]} ${prefs.keys[a.id].map(keyName).join('/')}`).join('  ·  ');
  }
  /** {inputField: [codes]} for WR.Input from the gameplay actions. */
  function inputBindings() {
    const b = {};
    for (const a of ACTIONS) if (a.input) b[a.input] = prefs.keys[a.id].slice();
    return b;
  }

  WR.Prefs = { GAME_ID, ACTIONS, BY_ID, DEFAULTS, defaultKeys, derive, update, textSize, keep, keyName, keyFor, rideKeysDefault, rideKeysText, inputBindings };
})();
