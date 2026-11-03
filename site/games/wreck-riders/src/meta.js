/* Wreck Riders - meta progression (DOM-free; loads in Node for tests).
 * Stars per course, coins, cosmetic unlocks, the daily challenge, the day streak and the daily chest.
 * Nothing here touches physics: cosmetics are drawn by render.js only, and the daily challenge only picks a course, a rider,
 * a sim seed (the existing WR.Sim `seed` option) and a scoring/visual modifier.
 *
 * Interface:
 *   const M = WR.meta;
 *   const m = M.load(storage);            // storage: localStorage-like ({getItem,setItem}) or null; never throws
 *   M.save(storage, m);                   // never throws
 *   M.starRules(level)                    // [{id:'finish'|'par'|'style', label, target}]
 *   M.recordRun(m, run, levels, chars)    // run = {levelId, charId, won, time, style, coins, daily?}; returns a report
 *   M.dateKey(date) 'YYYY-MM-DD' (local); M.dailyFor(dateKey, levels, chars); M.markPlayed(m, dateKey)
 *   M.chestReady(m, dateKey); M.openChest(m, dateKey); M.buy(m, id); M.equip(m, id); M.isUnlocked(m, id)
 *   M.totalStars(m)
 * Save key: 'stoinly.wreckriders.meta.v1' (versioned; corrupt JSON falls back to defaults and the bad text is kept
 * under '<key>.bak' so nothing is silently lost). */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const KEY = 'stoinly.wreckriders.meta.v1';
  const VERSION = 1;
  const LEGACY_BEST_KEY = 'wreck-riders-best';

  // Riders with a saved winning run per course (test/levels/levelN.solutions.json, 2026-10-30). The daily challenge only
  // picks from these, so the day's challenge is known to be finishable.
  const PROVEN = {
    'ward-nine': ['wheelchair', 'scooter', 'bike', 'pogo'],
    'harpoon-alley': ['wheelchair', 'scooter', 'bike', 'pogo'],
    'minefield-meadow': ['bike', 'scooter'],
    'the-big-drop': ['wheelchair', 'bike'],
    'the-gauntlet': ['wheelchair', 'bike'],
  };
  // Style score needed for the third star. `node test/meta.test.js` prints what each saved winning run scores; those bot
  // runs never flip, so they score about the coin total (25 per coin). The targets sit above that on courses 1, 2 and 4, so
  // the star asks for most coins plus a flip or big air; on 3 and 5 some of the saved runs already reach it.
  const STYLE_TARGET = { 'ward-nine': 700, 'harpoon-alley': 900, 'minefield-meadow': 1100, 'the-big-drop': 1000, 'the-gauntlet': 1400 };

  /* ---------- cosmetics (render-only) ----------
   * unlock: {free} | {stars:n} (automatic once the star total reaches n) | {coins:n} (bought in the collection) |
   *         {streak:n} (a day streak of n) | {chest:true} (only from the daily chest). rarity drives the foil sheen. */
  const COSMETICS = [
    { id: 'skin:classic', kind: 'skin', name: 'Factory Paint', unlock: { free: true }, rarity: 'common' },
    { id: 'skin:vapor', kind: 'skin', name: 'Vaporwave', unlock: { stars: 3 }, rarity: 'common', colors: { shirt: '#ff00ff', sleeve: '#ff4dff', pants: '#00cccc', shoes: '#00ffff', helmet: '#00ffff' } },
    { id: 'skin:lime', kind: 'skin', name: 'Toxic Lime', unlock: { coins: 40 }, rarity: 'common', colors: { shirt: '#00ff00', sleeve: '#33ff33', pants: '#111111', shoes: '#00ff00', helmet: '#111111' } },
    { id: 'skin:scam', kind: 'skin', name: 'Scam Alert', unlock: { stars: 6 }, rarity: 'rare', colors: { shirt: '#ff0033', sleeve: '#ffffff', pants: '#ffffff', shoes: '#ff0033', helmet: '#ff0033' } },
    { id: 'skin:midnight', kind: 'skin', name: 'Midnight Modem', unlock: { coins: 120 }, rarity: 'rare', colors: { shirt: '#000066', sleeve: '#6666ff', pants: '#000033', shoes: '#00ffff', helmet: '#6666ff' } },
    { id: 'skin:stoinly', kind: 'skin', name: 'Stoinly Purple', unlock: { chest: true }, rarity: 'rare', colors: { shirt: '#330066', sleeve: '#660099', pants: '#ffd700', shoes: '#ffd700', helmet: '#ffd700' } },
    { id: 'skin:gold', kind: 'skin', name: 'Gold Plated', unlock: { stars: 10 }, rarity: 'holo', colors: { shirt: '#ffd700', sleeve: '#ffe766', pants: '#c9a000', shoes: '#fff3a0', helmet: '#ffd700' } },
    { id: 'skin:holo', kind: 'skin', name: 'Holo Foil', unlock: { stars: 15 }, rarity: 'ultra', holo: true },
    { id: 'trail:none', kind: 'trail', name: 'No Trail', unlock: { free: true }, rarity: 'common' },
    { id: 'trail:rainbow', kind: 'trail', name: 'Rainbow Road', unlock: { stars: 2 }, rarity: 'common' },
    { id: 'trail:sparkle', kind: 'trail', name: 'Sparkle Dust', unlock: { coins: 60 }, rarity: 'common' },
    { id: 'trail:flame', kind: 'trail', name: 'Afterburner', unlock: { streak: 3 }, rarity: 'rare' },
    { id: 'trail:ghost', kind: 'trail', name: 'Lime Ghosts', unlock: { chest: true }, rarity: 'rare' },
    { id: 'trail:stars', kind: 'trail', name: 'Starfield', unlock: { stars: 8 }, rarity: 'holo' },
    { id: 'hat:none', kind: 'hat', name: 'Bare Head', unlock: { free: true }, rarity: 'common' },
    { id: 'hat:party', kind: 'hat', name: 'Party Hat', unlock: { stars: 1 }, rarity: 'common' },
    { id: 'hat:cone', kind: 'hat', name: 'Traffic Cone', unlock: { coins: 25 }, rarity: 'common' },
    { id: 'hat:propeller', kind: 'hat', name: 'Propeller Cap', unlock: { chest: true }, rarity: 'common' },
    { id: 'hat:tophat', kind: 'hat', name: 'Top Hat', unlock: { coins: 90 }, rarity: 'rare' },
    { id: 'hat:horns', kind: 'hat', name: 'Viking Horns', unlock: { chest: true }, rarity: 'rare' },
    { id: 'hat:crown', kind: 'hat', name: 'Crown', unlock: { stars: 12 }, rarity: 'holo' },
    { id: 'hat:halo', kind: 'hat', name: 'Halo', unlock: { streak: 7 }, rarity: 'ultra' },
  ];
  const BY_ID = {};
  for (const c of COSMETICS) BY_ID[c.id] = c;
  const KINDS = ['skin', 'trail', 'hat'];

  // Daily modifiers change scoring or drawing only, never physics.
  const MODIFIERS = [
    { id: 'bighead', name: 'BIG HEAD MODE', desc: 'Heads are drawn three times bigger. Style counts double.', style: 2 },
    { id: 'goldrush', name: 'GOLD RUSH', desc: 'Every coin is worth 5x style.', coin: 5 },
    { id: 'airmail', name: 'AIR MAIL', desc: 'Airtime and flips score triple.', air: 3 },
    { id: 'gorefest', name: 'GORE FEST', desc: 'Every severed limb scores triple.', gore: 3 },
    { id: 'disco', name: 'DISCO INFERNO', desc: 'Disco lights. All style x1.5.', style: 1.5 },
    { id: 'speedrun', name: 'SPEED RUN', desc: 'The time bonus is tripled.', time: 3 },
  ];

  /* ---------- small helpers ---------- */
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi == null ? Infinity : hi, Math.max(lo == null ? -Infinity : lo, v)) : d);
  const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isDate = (s) => typeof s === 'string' && DATE_RE.test(s);
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) {   // same mulberry32 as WR.util.seeded, repeated so this file has no load-order dependency
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { d = d || new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  /** Whole local days from date key a to date key b (b later = positive). Uses noon to dodge DST edges. */
  function daysBetween(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    const ta = new Date(pa[0], pa[1] - 1, pa[2], 12).getTime(), tb = new Date(pb[0], pb[1] - 1, pb[2], 12).getTime();
    return Math.round((tb - ta) / 86400000);
  }

  function defaults() {
    return {
      v: VERSION,
      best: {},          // best[levelId][charId] = seconds
      stars: {},         // stars[levelId] = {finish:bool, par:bool, style:bool}
      style: {},         // style[levelId] = best style score
      coins: 0, coinsTotal: 0,
      owned: { 'skin:classic': 1, 'trail:none': 1, 'hat:none': 1 },
      seen: { 'skin:classic': 1, 'trail:none': 1, 'hat:none': 1 },   // seen[id] = 1 once shown in the collection (drives NEW! badges)
      equip: { skin: 'skin:classic', trail: 'trail:none', hat: 'hat:none' },
      streak: { count: 0, last: null, best: 0 },
      chest: { last: null },
      daily: { date: null, best: null, plays: 0, won: false },
      runs: 0, deaths: 0, severs: 0, flips: 0,
    };
  }

  /** Repair any parsed value into a well-formed save. Unknown fields are dropped; bad values fall back to defaults. */
  function sanitize(raw) {
    const m = defaults();
    if (!isObj(raw)) return m;
    if (isObj(raw.best)) for (const lid of Object.keys(raw.best)) {
      const e = raw.best[lid];
      if (!isObj(e)) continue;
      for (const cid of Object.keys(e)) if (typeof e[cid] === 'number' && Number.isFinite(e[cid]) && e[cid] > 0) { (m.best[lid] = m.best[lid] || {})[cid] = e[cid]; }
    }
    if (isObj(raw.stars)) for (const lid of Object.keys(raw.stars)) {
      const s = raw.stars[lid];
      if (isObj(s)) m.stars[lid] = { finish: s.finish === true, par: s.par === true, style: s.style === true };
    }
    if (isObj(raw.style)) for (const lid of Object.keys(raw.style)) { const v = num(raw.style[lid], null, 0, 1e9); if (v != null) m.style[lid] = Math.round(v); }
    m.coins = int(raw.coins, 0, 0, 1e9);
    m.coinsTotal = int(raw.coinsTotal, m.coins, 0, 1e9);
    if (isObj(raw.owned)) for (const id of Object.keys(raw.owned)) if (BY_ID[id] && raw.owned[id]) m.owned[id] = 1;
    if (isObj(raw.seen)) for (const id of Object.keys(raw.seen)) if (BY_ID[id] && raw.seen[id]) m.seen[id] = 1;
    if (isObj(raw.equip)) for (const k of KINDS) { const id = raw.equip[k]; if (typeof id === 'string' && BY_ID[id] && BY_ID[id].kind === k) m.equip[k] = id; }
    if (isObj(raw.streak)) {
      m.streak.count = int(raw.streak.count, 0, 0, 1e6);
      m.streak.best = Math.max(m.streak.count, int(raw.streak.best, 0, 0, 1e6));
      m.streak.last = isDate(raw.streak.last) ? raw.streak.last : null;
    }
    if (isObj(raw.chest)) m.chest.last = isDate(raw.chest.last) ? raw.chest.last : null;
    if (isObj(raw.daily) && isDate(raw.daily.date)) {
      m.daily.date = raw.daily.date;
      m.daily.best = num(raw.daily.best, null, 0, 1e9);
      m.daily.plays = int(raw.daily.plays, 0, 0, 1e6);
      m.daily.won = raw.daily.won === true;
    }
    for (const k of ['runs', 'deaths', 'severs', 'flips']) m[k] = int(raw[k], 0, 0, 1e9);
    // equipped items must be owned (a hand-edited save cannot equip a locked item)
    for (const k of KINDS) if (!m.owned[m.equip[k]]) m.equip[k] = k + ':' + (k === 'skin' ? 'classic' : 'none');
    return m;
  }

  function load(storage) {
    let m = null, rawText = null;
    try { rawText = storage ? storage.getItem(KEY) : null; } catch (e) { rawText = null; }
    if (rawText) {
      try {
        const raw = JSON.parse(rawText);
        if (isObj(raw) && (raw.v == null || raw.v <= VERSION)) m = sanitize(raw);
      } catch (e) { m = null; }
      if (!m) { try { storage.setItem(KEY + '.bak', rawText); } catch (e) { /* storage full or unavailable */ } }
    }
    if (!m) {
      m = defaults();
      // carry over best times from the save format before this one
      try {
        const old = storage ? JSON.parse(storage.getItem(LEGACY_BEST_KEY) || 'null') : null;
        if (isObj(old)) m.best = sanitize({ best: old }).best;
      } catch (e) { /* ignore a corrupt legacy save */ }
    }
    refreshUnlocks(m);
    return m;
  }

  function save(storage, m) {
    if (!storage) return false;
    try { storage.setItem(KEY, JSON.stringify(m)); return true; } catch (e) { return false; }
  }

  /* ---------- stars ---------- */
  function starRules(level) {
    const lid = level.id || String(level.index);
    const target = STYLE_TARGET[lid] || 1000;
    const rules = [{ id: 'finish', label: 'Cross the finish line', target: null }];
    if (level.par) rules.push({ id: 'par', label: `Finish under par (${fmtTime(level.par)})`, target: level.par });
    else rules.push({ id: 'par', label: 'Finish in under 1:00', target: 60 });
    rules.push({ id: 'style', label: `Style score ${target}+`, target });
    return rules;
  }
  function fmtTime(t) { const mm = Math.floor(t / 60), s = Math.round(t - mm * 60); return `${mm}:${s < 10 ? '0' : ''}${s}`; }
  function evalStars(level, run) {
    const out = {};
    for (const r of starRules(level)) {
      if (r.id === 'finish') out.finish = !!run.won;
      else if (r.id === 'par') out.par = !!run.won && run.time <= r.target;
      else if (r.id === 'style') out.style = !!run.won && run.style >= r.target;
    }
    return out;
  }
  function starCount(s) { return s ? (s.finish ? 1 : 0) + (s.par ? 1 : 0) + (s.style ? 1 : 0) : 0; }
  function totalStars(m) { let n = 0; for (const lid of Object.keys(m.stars)) n += starCount(m.stars[lid]); return n; }

  /* ---------- unlocks ---------- */
  function unlockText(c) {
    const u = c.unlock;
    if (u.free) return 'FREE';
    if (u.stars) return `${u.stars} STARS`;
    if (u.coins) return `${u.coins} COINS`;
    if (u.streak) return `${u.streak}-DAY STREAK`;
    if (u.chest) return 'DAILY CHEST';
    return '?';
  }
  /** Grant every item whose automatic condition is met. Returns the ids granted now. */
  function refreshUnlocks(m) {
    const got = [], stars = totalStars(m);
    for (const c of COSMETICS) {
      if (m.owned[c.id]) continue;
      const u = c.unlock;
      if (u.free || (u.stars && stars >= u.stars) || (u.streak && m.streak.best >= u.streak)) { m.owned[c.id] = 1; got.push(c.id); }
    }
    for (const id of got) if (BY_ID[id].unlock.free) m.seen[id] = 1;
    return got.filter((id) => !BY_ID[id].unlock.free);
  }
  function isUnlocked(m, id) { return !!m.owned[id]; }
  function isNew(m, id) { return !!m.owned[id] && !m.seen[id]; }
  function newCount(m, kind) { let n = 0; for (const c of COSMETICS) if ((!kind || c.kind === kind) && isNew(m, c.id)) n++; return n; }
  function buy(m, id) {
    const c = BY_ID[id];
    if (!c || m.owned[id] || !c.unlock.coins || m.coins < c.unlock.coins) return false;
    m.coins -= c.unlock.coins; m.owned[id] = 1; m.seen[id] = 1;
    return true;
  }
  function equip(m, id) {
    const c = BY_ID[id];
    if (!c || !m.owned[id]) return false;
    m.equip[c.kind] = id; m.seen[id] = 1;
    return true;
  }

  /* ---------- daily challenge, streak, chest ---------- */
  function dailyFor(dk, levels, chars) {
    const rnd = seeded(hashStr('wreck-riders-daily:' + dk));
    const usable = levels.filter((L) => PROVEN[L.id]);
    const pool = usable.length ? usable : levels;
    const level = pool[Math.floor(rnd() * pool.length)];
    const ids = (PROVEN[level.id] || chars.map((c) => c.id)).filter((id) => chars.some((c) => c.id === id));
    const charId = ids[Math.floor(rnd() * ids.length)] || chars[0].id;
    const modifier = MODIFIERS[Math.floor(rnd() * MODIFIERS.length)];
    const seed = hashStr('wreck-riders-seed:' + dk) || 1;
    return { date: dk, levelIndex: levels.indexOf(level), levelId: level.id, charId, charIndex: chars.findIndex((c) => c.id === charId), modifier, seed };
  }
  /** Count today as played. Returns {count, extended, reset}. */
  function markPlayed(m, dk) {
    const s = m.streak;
    if (s.last === dk) return { count: s.count, extended: false, reset: false };
    const gap = s.last ? daysBetween(s.last, dk) : null;
    let reset = false;
    if (gap === 1) s.count += 1;
    else { reset = s.count > 1 && gap != null && gap > 1; s.count = 1; }
    s.last = dk;
    s.best = Math.max(s.best, s.count);
    return { count: s.count, extended: true, reset };
  }
  /** The streak as shown on the title: a missed day shows 0 until the next run starts a new one. */
  function liveStreak(m, dk) {
    const s = m.streak;
    if (!s.last) return 0;
    const gap = daysBetween(s.last, dk);
    return gap <= 1 ? s.count : 0;
  }
  function chestReady(m, dk) { return m.chest.last !== dk; }
  /** Open today's chest: coins, or (sometimes) a chest-only cosmetic not owned yet. Seeded by the date. */
  function openChest(m, dk) {
    if (!chestReady(m, dk)) return null;
    const rnd = seeded(hashStr('wreck-riders-chest:' + dk));
    const locked = COSMETICS.filter((c) => c.unlock.chest && !m.owned[c.id]);
    let prize;
    const streakBonus = Math.min(30, liveStreak(m, dk) * 5);
    if (locked.length && rnd() < 0.45) {
      const c = locked[Math.floor(rnd() * locked.length)];
      m.owned[c.id] = 1;
      prize = { type: 'item', id: c.id, name: c.name, kind: c.kind, rarity: c.rarity, coins: 10 + streakBonus };
    } else {
      prize = { type: 'coins', coins: 20 + Math.floor(rnd() * 31) + streakBonus };
    }
    m.coins += prize.coins; m.coinsTotal += prize.coins;
    m.chest.last = dk;
    return prize;
  }
  function dailyScore(run, level, mod) {
    const tMul = (mod && mod.time) || 1;
    const par = level.par || 60;
    if (run.won) return Math.round(run.style + 1000 + Math.max(0, par - run.time) * 25 * tMul);
    return Math.round(run.style + (run.progress || 0) * 500);
  }

  /* ---------- after a run ---------- */
  /**
   * Bank a finished or failed run. run = {levelId, charId, won, time, style, coins, progress, severs, flips, daily?, dateKey?}
   * Returns {stars:{finish,par,style}, newStars:[ids], bestTime:bool, prevTime, bestStyle:bool, coins, unlocked:[ids], daily?}
   */
  function recordRun(m, run, levels) {
    const level = levels.find((L) => (L.id || String(L.index)) === run.levelId) || levels[0];
    const lid = run.levelId;
    const rep = { stars: evalStars(level, run), newStars: [], bestTime: false, prevTime: null, bestStyle: false, coins: 0, unlocked: [] };
    m.runs += 1;
    if (!run.won) m.deaths += 1;
    m.severs += run.severs || 0; m.flips += run.flips || 0;
    const coins = Math.max(0, Math.round(run.coins || 0));
    m.coins += coins; m.coinsTotal += coins; rep.coins = coins;
    if (run.daily) {
      const dk = run.dateKey;
      if (m.daily.date !== dk) m.daily = { date: dk, best: null, plays: 0, won: false };
      m.daily.plays += 1;
      const score = dailyScore(run, level, run.daily.modifier);
      rep.daily = { score, prev: m.daily.best, best: m.daily.best == null || score > m.daily.best };
      if (rep.daily.best) m.daily.best = score;
      if (run.won) m.daily.won = true;
    }
    if (run.won) {
      const prev = m.best[lid] && m.best[lid][run.charId];
      rep.prevTime = prev != null ? prev : null;
      if (prev == null || run.time < prev) { (m.best[lid] = m.best[lid] || {})[run.charId] = run.time; rep.bestTime = true; }
      const old = m.stars[lid] || { finish: false, par: false, style: false };
      const now = { finish: old.finish || rep.stars.finish, par: old.par || rep.stars.par, style: old.style || rep.stars.style };
      for (const k of ['finish', 'par', 'style']) if (now[k] && !old[k]) rep.newStars.push(k);
      m.stars[lid] = now;
    }
    if (m.style[lid] == null || run.style > m.style[lid]) { rep.bestStyle = run.style > 0 && m.style[lid] != null; m.style[lid] = Math.round(run.style); }
    rep.unlocked = refreshUnlocks(m);
    return rep;
  }

  WR.meta = {
    KEY, VERSION, COSMETICS, BY_ID, KINDS, MODIFIERS, PROVEN, STYLE_TARGET,
    defaults, sanitize, load, save, hashStr, seeded, dateKey, daysBetween,
    starRules, evalStars, starCount, totalStars, maxStars: (levels) => levels.length * 3,
    unlockText, refreshUnlocks, isUnlocked, isNew, newCount, buy, equip,
    dailyFor, markPlayed, liveStreak, chestReady, openChest, dailyScore, recordRun,
  };
})();
