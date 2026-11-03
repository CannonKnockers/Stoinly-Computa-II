(function (ns) {
  'use strict';
  // controls.js: the keyboard actions of the game and their default keys, as KeyboardEvent.code
  // values (the STOINLY NEXUS contract). The browser shell resolves each action through
  // StoinlySettings.keysFor('doom', id, defaults) and hands the game the result as plain data
  // (bindings: { actionId: [codes] }); the game only ever asks "is this action held or
  // pressed". The defaults are the bindings the game had before the nexus, so nothing changes
  // until a player rebinds. The mouse (fire, menu OK, turning, the wheel) is not rebindable.

  const ACTIONS = [
    { id: 'forward', label: 'Walk forward', defaults: ['KeyW', 'ArrowUp'] },
    { id: 'back', label: 'Walk back', defaults: ['KeyS', 'ArrowDown'] },
    { id: 'strafe_left', label: 'Step left', defaults: ['KeyA'] },
    { id: 'strafe_right', label: 'Step right', defaults: ['KeyD'] },
    { id: 'turn_left', label: 'Turn left', defaults: ['ArrowLeft'] },
    { id: 'turn_right', label: 'Turn right', defaults: ['ArrowRight'] },
    { id: 'strafe_mod', label: 'Hold: turn keys step sideways', defaults: ['AltLeft', 'AltRight'] },
    { id: 'run', label: 'Hold: walk (run when ALWAYS RUN is off)', defaults: ['ShiftLeft', 'ShiftRight'] },
    { id: 'fire', label: 'Fire', defaults: ['ControlLeft', 'ControlRight'] },
    { id: 'use', label: 'Use (doors, switches)', defaults: ['Space', 'KeyE'] },
    { id: 'weapon1', label: 'Weapon 1 (hands / THE RAZOR)', defaults: ['Digit1', 'Numpad1'] },
    { id: 'weapon2', label: 'Weapon 2', defaults: ['Digit2', 'Numpad2'] },
    { id: 'weapon3', label: 'Weapon 3', defaults: ['Digit3', 'Numpad3'] },
    { id: 'weapon4', label: 'Weapon 4', defaults: ['Digit4', 'Numpad4'] },
    { id: 'weapon5', label: 'Weapon 5', defaults: ['Digit5', 'Numpad5'] },
    { id: 'weapon6', label: 'Weapon 6', defaults: ['Digit6', 'Numpad6'] },
    { id: 'weapon7', label: 'Weapon 7', defaults: ['Digit7', 'Numpad7'] },
    { id: 'automap', label: 'Map', defaults: ['Tab'] },
    { id: 'pause', label: 'Pause', defaults: ['KeyP', 'Pause'] },
    { id: 'menu', label: 'Open the menu (in play)', defaults: ['Escape'] },
    { id: 'quicksave', label: 'Save game menu', defaults: ['F2', 'F5'] },
    { id: 'quickload', label: 'Load game menu', defaults: ['F3', 'F6'] },
    { id: 'menu_up', label: 'Menu up (also scrolls the credits)', defaults: ['ArrowUp', 'KeyW'] },
    { id: 'menu_down', label: 'Menu down (also scrolls the credits)', defaults: ['ArrowDown', 'KeyS'] },
    { id: 'menu_left', label: 'Menu left / slider down', defaults: ['ArrowLeft', 'KeyA'] },
    { id: 'menu_right', label: 'Menu right / slider up', defaults: ['ArrowRight', 'KeyD'] },
    { id: 'menu_ok', label: 'Menu choose / skip the tally', defaults: ['Enter', 'NumpadEnter', 'Space', 'KeyE'] },
    { id: 'menu_back', label: 'Menu back', defaults: ['Escape', 'Backspace'] },
    { id: 'yes', label: 'Answer yes to a question', defaults: ['KeyY', 'Enter', 'NumpadEnter'] },
    { id: 'no', label: 'Answer no to a question', defaults: ['KeyN', 'Escape'] },
    { id: 'confirm', label: 'Confirm a save name / close the credits', defaults: ['Enter', 'NumpadEnter'] },
    { id: 'erase', label: 'Erase a letter of a save name', defaults: ['Backspace'] },
    { id: 'cancel', label: 'Stop typing a save name', defaults: ['Escape'] }
  ];

  function defaults() {
    const out = {};
    for (const a of ACTIONS) {
      out[a.id] = a.defaults.slice();
    }
    return out;
  }

  // keysFor(id, defaults) -> codes; with no function, the defaults.
  function resolve(keysFor) {
    const out = {};
    for (const a of ACTIONS) {
      const k = keysFor ? keysFor(a.id, a.defaults.slice()) : a.defaults.slice();
      out[a.id] = Array.isArray(k) ? k.slice() : a.defaults.slice();
    }
    return out;
  }

  // The KeyboardEvent.code a pre-nexus key name meant, for scripted test routes and for
  // keyboards that report no code: 'w' -> 'KeyW', ' ' -> 'Space', 'Control' -> 'ControlLeft'.
  const NAMED = { ' ': 'Space', Control: 'ControlLeft', Shift: 'ShiftLeft', Alt: 'AltLeft', Meta: 'MetaLeft' };
  function legacyCode(name) {
    if (NAMED[name]) {
      return NAMED[name];
    }
    if (/^[a-zA-Z]$/.test(name)) {
      return 'Key' + name.toUpperCase();
    }
    if (/^[0-9]$/.test(name)) {
      return 'Digit' + name;
    }
    return name;
  }

  ns.controls = { ACTIONS: ACTIONS, defaults: defaults, resolve: resolve, legacyCode: legacyCode };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
