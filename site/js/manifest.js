/* Manifest validation (CONTRACT.md section 3). Pure: no DOM, no fetch; also imported by the node tests.
 *
 * validateManifest(raw, expectedId) -> { ok, errors: [..], warnings: [..], manifest }
 *   ok=false only for things the nexus cannot work around (not an object, wrong or missing id, no title).
 *   Everything else is repaired: bad optional fields are dropped with a warning, so one sloppy field
 *   never takes a whole tile down.
 */

export const SUPPORT_KEYS = ['audio', 'music', 'shake', 'flashes', 'particles', 'textScale', 'colorblind', 'performance', 'rebinding'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** A path inside the game's folder: relative, no "..", no scheme, no leading slash, no backslash. */
export function safeRelPath(p) {
  if (typeof p !== 'string') return false;
  const s = p.trim();
  if (!s || s.length > 300) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/') || s.includes('\\') || s.includes('\0')) return false;
  // Browsers treat %2e%2e as "..", so look at the decoded-dot form too.
  const pathPart = s.split(/[?#]/)[0].replace(/%2e/gi, '.');
  return !pathPart.split('/').some((seg) => seg === '..' || seg === '.');
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const CODE = /^[A-Za-z][A-Za-z0-9]{0,31}$/; // KeyboardEvent.code shape: KeyW, ArrowUp, Digit1, F5, NumpadEnter...

function strList(v, field, warnings, max = 40) {
  if (v === undefined) return [];
  if (!Array.isArray(v)) { warnings.push(`${field} should be a list of text lines; ignored.`); return []; }
  const out = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max);
  if (out.length !== v.length) warnings.push(`${field}: dropped ${v.length - out.length} entr${v.length - out.length === 1 ? 'y' : 'ies'} that were not text.`);
  return out;
}

export function validateManifest(raw, expectedId) {
  const errors = [];
  const warnings = [];
  if (!isObj(raw)) return { ok: false, errors: ['The manifest is not a JSON object.'], warnings, manifest: null };

  const id = str(raw.id);
  if (!id) errors.push('Missing "id".');
  else if (expectedId && id !== expectedId) errors.push(`"id" is "${id}" but this game's folder is "${expectedId}".`);
  const title = str(raw.title);
  if (!title) errors.push('Missing "title".');

  const m = {
    id: id || expectedId || '',
    title,
    tagline: str(raw.tagline),
    genre: str(raw.genre),
    entry: 'index.html',
    accent: '#ff00ff',
    cover: null,
    saveKeys: [],
    savePrefixes: [],
    actions: [],
    mouse: [],
    touch: [],
    howToPlay: [],
    settingsSupport: {},
  };
  if (!m.tagline) warnings.push('No "tagline".');
  if (!m.genre) warnings.push('No "genre".');

  if (raw.entry !== undefined) {
    if (safeRelPath(raw.entry)) m.entry = raw.entry.trim();
    else warnings.push('"entry" is not a safe relative path; using index.html.');
  }
  if (raw.accent !== undefined) {
    if (typeof raw.accent === 'string' && HEX.test(raw.accent.trim())) m.accent = raw.accent.trim();
    else warnings.push('"accent" is not a #rgb or #rrggbb colour; using hot pink.');
  }
  if (raw.cover !== undefined) {
    if (safeRelPath(raw.cover)) m.cover = raw.cover.trim();
    else warnings.push('"cover" is not a safe relative path; no cover shown.');
  }

  m.saveKeys = strList(raw.saveKeys, 'saveKeys', warnings, 64);
  m.savePrefixes = strList(raw.savePrefixes, 'savePrefixes', warnings, 16).filter((p) => {
    if (p.length < 4) { warnings.push(`savePrefixes: "${p}" is too short to be safe; ignored.`); return false; }
    if (p.startsWith('stoinly.nexus.')) { warnings.push(`savePrefixes: "${p}" belongs to the nexus; ignored.`); return false; }
    return true;
  });
  m.saveKeys = m.saveKeys.filter((k) => {
    if (k.startsWith('stoinly.nexus.')) { warnings.push(`saveKeys: "${k}" belongs to the nexus; ignored.`); return false; }
    return true;
  });

  if (raw.actions !== undefined) {
    if (!Array.isArray(raw.actions)) warnings.push('"actions" should be a list; ignored.');
    else {
      const seen = new Set();
      raw.actions.forEach((a, i) => {
        if (!isObj(a) || !str(a.id) || !str(a.label)) { warnings.push(`actions[${i}] needs an "id" and a "label"; skipped.`); return; }
        if (seen.has(a.id.trim())) { warnings.push(`actions: "${a.id}" appears twice; kept the first.`); return; }
        seen.add(a.id.trim());
        const defs = Array.isArray(a.defaults) ? a.defaults.filter((c) => typeof c === 'string' && CODE.test(c)) : [];
        if (!Array.isArray(a.defaults) || defs.length !== a.defaults.length) warnings.push(`actions "${a.id}": some defaults are not KeyboardEvent.code values; dropped.`);
        m.actions.push({ id: a.id.trim(), label: a.label.trim(), defaults: defs });
      });
    }
  }
  m.mouse = strList(raw.mouse, 'mouse', warnings);
  m.touch = strList(raw.touch, 'touch', warnings);

  if (raw.howToPlay !== undefined) {
    if (!Array.isArray(raw.howToPlay)) warnings.push('"howToPlay" should be a list; ignored.');
    else raw.howToPlay.forEach((h, i) => {
      if (isObj(h) && str(h.title) && str(h.body)) m.howToPlay.push({ title: h.title.trim(), body: h.body.trim() });
      else warnings.push(`howToPlay[${i}] needs a "title" and a "body"; skipped.`);
    });
  }

  if (raw.settingsSupport !== undefined && !isObj(raw.settingsSupport)) warnings.push('"settingsSupport" should be an object; ignored.');
  const ss = isObj(raw.settingsSupport) ? raw.settingsSupport : {};
  for (const k of SUPPORT_KEYS) {
    const v = ss[k];
    if (v === true || v === false || v === 'partial') m.settingsSupport[k] = v;
    else if (v !== undefined) warnings.push(`settingsSupport.${k} should be true, false or "partial".`);
  }

  return { ok: errors.length === 0, errors, warnings, manifest: errors.length ? null : m };
}

/** 'yes' | 'no' | 'partial' | 'unknown' for one settingsSupport key. */
export function supportOf(manifest, key) {
  const v = manifest && manifest.settingsSupport ? manifest.settingsSupport[key] : undefined;
  return v === true ? 'yes' : v === false ? 'no' : v === 'partial' ? 'partial' : 'unknown';
}
