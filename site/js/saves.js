/* Save data, read only through a manifest's saveKeys and savePrefixes (CONTRACT.md section 4).
 * Pure: every function takes a localStorage-like `store` ({ length, key(i), getItem, setItem, removeItem }),
 * so the node tests and the ?fixtures=1 mode can pass an in-memory one.
 */

export const EXPORT_FORMAT = 'stoinly-nexus-saves';
export const SETTINGS_KEY = 'stoinly.nexus.settings.v1';

/** Every key in `store` that belongs to this manifest, sorted. */
export function keysFor(store, manifest) {
  if (!store || !manifest) return [];
  const out = new Set();
  for (const k of manifest.saveKeys || []) {
    try { if (store.getItem(k) !== null) out.add(k); } catch { /* blocked storage */ }
  }
  const prefixes = manifest.savePrefixes || [];
  if (prefixes.length) {
    let n = 0;
    try { n = store.length; } catch { n = 0; }
    for (let i = 0; i < n; i++) {
      let k = null;
      try { k = store.key(i); } catch { k = null; }
      if (k && prefixes.some((p) => k.startsWith(p))) out.add(k);
    }
  }
  return [...out].sort();
}

/** True if `key` is one this manifest is allowed to touch. */
export function ownsKey(manifest, key) {
  if (!manifest || typeof key !== 'string' || key.startsWith('stoinly.nexus.')) return false;
  return (manifest.saveKeys || []).includes(key) || (manifest.savePrefixes || []).some((p) => key.startsWith(p));
}

export function resetGame(store, manifest) {
  const keys = keysFor(store, manifest);
  for (const k of keys) { try { store.removeItem(k); } catch { /* ignore */ } }
  return keys;
}

/** One object with every game's keys (raw strings, so nothing is lost) and the nexus settings. */
export function exportAll(store, manifests, now = new Date()) {
  const games = {};
  for (const m of manifests) {
    const data = {};
    for (const k of keysFor(store, m)) data[k] = store.getItem(k);
    games[m.id] = data;
  }
  let settings = null;
  try { settings = store.getItem(SETTINGS_KEY); } catch { settings = null; }
  return { format: EXPORT_FORMAT, v: 1, exportedAt: now.toISOString(), settings, games };
}

/**
 * Reads an export back without writing anything.
 * -> { ok, error?, rows: [{ gameId, key, status: 'new'|'replace'|'same', bytes }], skipped: [{ gameId, key, why }], settings: 'new'|'replace'|'same'|null }
 */
export function previewImport(text, store, manifests) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'That file is not JSON.', rows: [], skipped: [], settings: null }; }
  if (!data || typeof data !== 'object' || data.format !== EXPORT_FORMAT || !data.games || typeof data.games !== 'object') {
    return { ok: false, error: 'That file is not a STOINLY NEXUS save export.', rows: [], skipped: [], settings: null };
  }
  const byId = Object.fromEntries(manifests.map((m) => [m.id, m]));
  const rows = [];
  const skipped = [];
  for (const [gameId, keys] of Object.entries(data.games)) {
    if (!keys || typeof keys !== 'object') continue;
    const m = byId[gameId];
    for (const [key, value] of Object.entries(keys)) {
      if (!m) { skipped.push({ gameId, key, why: 'no game with that id sent its paperwork' }); continue; }
      if (!ownsKey(m, key)) { skipped.push({ gameId, key, why: 'not one of this game\'s save keys' }); continue; }
      if (typeof value !== 'string') { skipped.push({ gameId, key, why: 'value is not text' }); continue; }
      let cur = null;
      try { cur = store.getItem(key); } catch { cur = null; }
      rows.push({ gameId, key, value, status: cur === null ? 'new' : cur === value ? 'same' : 'replace', bytes: value.length });
    }
  }
  let settings = null;
  if (typeof data.settings === 'string') {
    let cur = null;
    try { cur = store.getItem(SETTINGS_KEY); } catch { cur = null; }
    settings = cur === null ? 'new' : cur === data.settings ? 'same' : 'replace';
  }
  return { ok: true, rows, skipped, settings, settingsValue: typeof data.settings === 'string' ? data.settings : null };
}

/** Writes what previewImport accepted. Returns how many keys were written. */
export function applyImport(preview, store, { includeSettings = true } = {}) {
  let n = 0;
  for (const r of preview.rows) {
    if (r.status === 'same') continue;
    store.setItem(r.key, r.value);
    n++;
  }
  if (includeSettings && preview.settingsValue && preview.settings !== 'same') { store.setItem(SETTINGS_KEY, preview.settingsValue); n++; }
  return n;
}

// ---------------------------------------------------------------- tile stats
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

function countStars(v, depth = 0) {
  if (depth > 4) return 0;
  if (v === true) return 1;
  if (typeof v === 'number' && isFinite(v) && v > 0) return Math.floor(v);
  if (Array.isArray(v)) return v.reduce((n, x) => n + countStars(x, depth + 1), 0);
  if (isObj(v)) return Object.values(v).reduce((n, x) => n + countStars(x, depth + 1), 0);
  return 0;
}

function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * Best-effort numbers for a home tile, from the JSON saves the manifest names. Never throws.
 * Recognised shapes (the ones the games use on 2026-11-03): `stars` as a number, or nested booleans/arrays/numbers;
 * `streak: { count, last: 'YYYY-MM-DD', best }` (a streak whose last day is before yesterday shows as 0);
 * `bestCombo` / `runs.bestCombo`; `runs.bestCleared`; `style: { level: n }`; `daily: { date, best }` for today.
 * -> { found: bool, stars: n|null, streak: n|null, bests: [{ label, value }] }
 */
export function readStats(store, manifest, now = new Date()) {
  const out = { found: false, stars: null, streak: null, bests: [] };
  const today = dayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y);
  let bestCombo = null;
  let bestRound = null;
  let bestStyle = null;
  let dailyBest = null;
  for (const k of keysFor(store, manifest)) {
    let v;
    try { v = JSON.parse(store.getItem(k)); } catch { continue; }
    out.found = true;
    if (!isObj(v)) continue;
    if ('stars' in v) out.stars = (out.stars || 0) + countStars(v.stars);
    if (isObj(v.streak) && num(v.streak.count) !== null) {
      const live = v.streak.last === today || v.streak.last === yesterday;
      out.streak = Math.max(out.streak || 0, live ? v.streak.count : 0);
    }
    const combo = num(v.bestCombo) ?? (isObj(v.runs) ? num(v.runs.bestCombo) : null);
    if (combo !== null && combo > 0) bestCombo = Math.max(bestCombo || 0, combo);
    if (isObj(v.runs) && num(v.runs.bestCleared) !== null && v.runs.bestCleared > 0) bestRound = Math.max(bestRound || 0, v.runs.bestCleared);
    if (isObj(v.style)) for (const s of Object.values(v.style)) if (num(s) !== null && s > 0) bestStyle = Math.max(bestStyle || 0, s);
    if (isObj(v.daily) && v.daily.date === today && num(v.daily.best) !== null && v.daily.best > 0) dailyBest = v.daily.best;
  }
  if (bestRound !== null) out.bests.push({ label: 'BEST ROUND', value: String(bestRound) });
  if (bestCombo !== null) out.bests.push({ label: 'BEST COMBO', value: 'x' + bestCombo });
  if (bestStyle !== null) out.bests.push({ label: 'BEST STYLE', value: String(Math.round(bestStyle)) });
  if (dailyBest !== null) out.bests.push({ label: "TODAY'S DAILY", value: String(Math.round(dailyBest)) });
  return out;
}

/** A Map-backed store with the localStorage interface (for tests and ?fixtures=1). */
export function memoryStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}
