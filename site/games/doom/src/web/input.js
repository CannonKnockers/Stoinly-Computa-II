(function (ns) {
  'use strict';
  // input.js: keyboard and mouse for the browser. Keeps which keys are held, the keys
  // pressed since the last tic (for menus and one-shot actions), typed characters (save
  // names), mouse movement while the pointer is locked and the wheel. The page asks for
  // pointer lock on the first click into the game. Keys are KeyboardEvent.code values (the
  // physical key, which is what the STOINLY NEXUS rebinding stores); the game maps them to
  // actions through its bindings; bind() says which rebound keys the browser must not keep.

  // The key names whose browser default (scrolling, focus, find, reload) is always stopped.
  const KEEP_FROM_BROWSER = ['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', "'", '/', 'F2', 'F3', 'F5', 'F6'];

  function create(canvas) {
    const held = {};
    let pressed = [];
    let typed = [];
    let mouseDX = 0;
    let wheel = 0;
    let boundCodes = {};
    const gestures = [];

    // the physical key; keyboards that report no code fall back to the key's old name
    function codeOf(e) {
      if (e.code && e.code !== 'Unidentified') {
        return e.code;
      }
      const name = e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' ? e.key : (e.key.length === 1 ? e.key.toLowerCase() : e.key);
      return ns.controls.legacyCode(name);
    }

    function gesture() {
      for (const fn of gestures) {
        fn();
      }
    }

    window.addEventListener('keydown', function (e) {
      const k = codeOf(e);
      if (!held[k]) {
        pressed.push(k);
      }
      held[k] = true;
      if (e.key.length === 1) {
        typed.push(e.key);
      }
      // keep the browser from scrolling, tabbing away or opening find; a key newly bound to
      // a game action is kept from the browser too (Escape never is: it frees the pointer)
      if (KEEP_FROM_BROWSER.indexOf(e.key) >= 0 || e.ctrlKey || (boundCodes[k] && k !== 'Escape')) {
        e.preventDefault();
      }
      gesture();
    });
    window.addEventListener('keyup', function (e) {
      held[codeOf(e)] = false;
    });
    window.addEventListener('blur', function () {
      for (const k in held) {
        held[k] = false;
      }
    });
    canvas.addEventListener('mousedown', function (e) {
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
      const k = 'mouse' + e.button;
      held[k] = true;
      pressed.push(k);
      e.preventDefault();
    });
    window.addEventListener('mousedown', gesture);
    window.addEventListener('mouseup', function (e) {
      held['mouse' + e.button] = false;
    });
    window.addEventListener('mousemove', function (e) {
      if (document.pointerLockElement === canvas) {
        mouseDX += e.movementX || 0;
      }
    });
    window.addEventListener('wheel', function (e) {
      wheel += e.deltaY > 0 ? 1 : -1;
    }, { passive: true });
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    // Called once per tic: hands the game everything since the last tic.
    function take() {
      const out = { held: held, pressed: pressed, typed: typed, mouseDX: mouseDX, wheel: wheel > 0 ? 1 : (wheel < 0 ? -1 : 0) };
      pressed = [];
      typed = [];
      mouseDX = 0;
      wheel = 0;
      return out;
    }

    // bindings: { actionId: [codes] }. Keys a player rebound to (codes no default uses) are
    // kept from the browser; the default keys behave exactly as before the nexus.
    function bind(bindings) {
      const defaults = {};
      for (const a of ns.controls.ACTIONS) {
        for (const c of a.defaults) {
          defaults[c] = true;
        }
      }
      boundCodes = {};
      for (const id in bindings) {
        for (const c of bindings[id]) {
          if (!defaults[c]) {
            boundCodes[c] = true;
          }
        }
      }
    }

    // fn runs on every key press and mouse button (a user gesture: audio, fullscreen)
    function onGesture(fn) {
      gestures.push(fn);
    }

    return { take: take, held: held, bind: bind, onGesture: onGesture };
  }

  ns.web = ns.web || {};
  ns.web.input = { create: create };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
