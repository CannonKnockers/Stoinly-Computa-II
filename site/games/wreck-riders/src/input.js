/* Wreck Riders - keyboard state.
 * input.state is the sim input object {up, down, left, right, space, shift, z}. Which key codes drive each field comes from
 * setBindings({field: [codes]}) (main.js passes the STOINLY NEXUS bindings from WR.Prefs); the defaults below are the
 * game's original keys. Saved runs never go through this class: they feed input objects straight to sim.update. */
(function () {
  const WR = window.WR = window.WR || {};
  const DEFAULT_BINDINGS = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], space: ['Space'], shift: ['ShiftLeft', 'ShiftRight'], z: ['KeyZ'] };
  const BASE_SWALLOW = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];   // Tab switches collection tabs
  class Input {
    constructor(target, bindings) {
      this.state = { up: false, down: false, left: false, right: false, space: false, shift: false, z: false };
      this.down = new Set();
      this.pressedCodes = new Set();   // codes pressed since the last consume()
      this.anyPressed = false;
      this.listeners = [];
      this.setBindings(bindings || DEFAULT_BINDINGS);
      target.addEventListener('keydown', (e) => {
        // the original keys always; other bound keys only without Ctrl/Alt/Meta, so browser shortcuts still work
        if (this.baseSwallow.has(e.code) || (this.swallow.has(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey)) e.preventDefault();
        if (!this.down.has(e.code)) { this.pressedCodes.add(e.code); this.anyPressed = true; }
        this.down.add(e.code);
        const ks = this.map.get(e.code); if (ks) for (const k of ks) this.state[k] = true;
        for (const l of this.listeners) l(e.code);
      });
      target.addEventListener('keyup', (e) => {
        this.down.delete(e.code);
        const ks = this.map.get(e.code); if (ks) for (const k of ks) this.state[k] = false;
      });
      target.addEventListener('blur', () => this.reset());
    }
    /** bindings = {up: ['ArrowUp', 'KeyW'], ...}; fields left out keep their default keys. Held keys are re-read. */
    setBindings(bindings, extraSwallow) {
      const b = Object.assign({}, DEFAULT_BINDINGS, bindings || {});
      this.map = new Map();
      for (const k in b) {
        if (!(k in this.state)) continue;
        for (const code of b[k] || []) { if (!this.map.has(code)) this.map.set(code, []); this.map.get(code).push(k); }
      }
      // keys the browser must not act on (page scroll, focus moves): the original set plus every bound gameplay key
      this.baseSwallow = new Set(BASE_SWALLOW);
      this.swallow = new Set([...this.map.keys()].concat(extraSwallow || []));
      for (const k in this.state) this.state[k] = false;
      if (this.down) for (const code of this.down) { const ks = this.map.get(code); if (ks) for (const k of ks) this.state[k] = true; }
    }
    reset() { this.down.clear(); for (const k in this.state) this.state[k] = false; }
    /** True once for each physical key press of `code` (e.g. 'Enter', 'KeyR'). */
    justPressed(code) { return this.pressedCodes.has(code); }
    /** True once if any of `codes` was pressed since the last consume(). */
    anyJustPressed(codes) { for (const c of codes || []) if (this.pressedCodes.has(c)) return true; return false; }
    /** Call once per frame after reading justPressed(). */
    consume() { this.pressedCodes.clear(); this.anyPressed = false; }
    onKey(fn) { this.listeners.push(fn); }
  }
  Input.DEFAULT_BINDINGS = DEFAULT_BINDINGS;
  WR.Input = Input;
})();
