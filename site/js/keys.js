/* Display names for KeyboardEvent.code values, and binding conflict checks. Pure; tested in node. */

const NAMED = {
  Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Escape: 'ESC', Backspace: 'BACKSPACE', Tab: 'TAB',
  ShiftLeft: 'LEFT SHIFT', ShiftRight: 'RIGHT SHIFT', ControlLeft: 'LEFT CTRL', ControlRight: 'RIGHT CTRL',
  AltLeft: 'LEFT ALT', AltRight: 'RIGHT ALT', MetaLeft: 'LEFT META', MetaRight: 'RIGHT META', CapsLock: 'CAPS LOCK',
  ArrowUp: '↑ UP', ArrowDown: '↓ DOWN', ArrowLeft: '← LEFT', ArrowRight: '→ RIGHT',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\ (ISO)',
  Insert: 'INSERT', Delete: 'DELETE', Home: 'HOME', End: 'END', PageUp: 'PAGE UP', PageDown: 'PAGE DOWN',
  ContextMenu: 'MENU', PrintScreen: 'PRINT SCREEN', ScrollLock: 'SCROLL LOCK', Pause: 'PAUSE', NumLock: 'NUM LOCK',
  NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
};

export function keyName(code) {
  if (typeof code !== 'string' || !code) return '?';
  if (NAMED[code]) return NAMED[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return 'NUM ' + m[1];
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

/** Keys the rebind dialog will not accept: Escape cancels the dialog. */
export const RESERVED = ['Escape'];

/** Other actions in the same game already using `code`: [{ id, label }]. `bindings` is { actionId: [codes] }. */
export function conflicts(actions, bindings, actionId, code) {
  return actions.filter((a) => a.id !== actionId && (bindings[a.id] || []).includes(code)).map((a) => ({ id: a.id, label: a.label }));
}

/** New key list for an action after putting `code` into `slot` (slot === list length means "add"). Max 3, no duplicates. */
export function withKey(list, slot, code) {
  const next = list.slice();
  if (slot >= next.length) next.push(code); else next[slot] = code;
  return next.filter((c, i) => next.indexOf(c) === i).slice(0, 3);
}
