/* ACCOUNT FULL — meta progress
   Everything that lasts between runs and is not the binder: stars, cosmetic
   unlocks, the daily challenge, the day streak and the daily chest. Saved under
   one key, versioned, and read defensively: a corrupt or foreign value is set
   aside under KEY + '.corrupt' and the game starts from defaults.

   Nothing here touches the rules of a run. Stars and the chest pay out only in
   cosmetics, and the daily challenge is a normal run with a seed taken from the
   local date. No DOM; this file also loads in node. */
(function (AF) {
  'use strict';

  const KEY = 'stoinly.accountfull.meta.v1';
  const VERSION = 1;

  // ---------------------------------------------------------------- dates (local, YYYY-MM-DD)
  const pad = n => String(n).padStart(2, '0');
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + n));
  }
  function prettyDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m - 1] + ' ' + d + ', ' + y;
  }
  // FNV-1a over the date string: the same seed for everybody on the same local date
  function seedFor(key) {
    let h = 0x811c9dc5;
    const s = 'ACCOUNT FULL DAILY ' + key;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) & 0x7fffffff;
  }
  // tests and the debug page can pin "today"
  let todayOverride = null;
  const today = () => todayOverride || dayKey();

  // ---------------------------------------------------------------- stars
  // one star for each milestone a run passes; shown on the result screen
  const STAR_RULES = [
    { round: 10, text: 'CLEAR ROUND 10' },
    { round: 20, text: 'CLEAR ROUND 20' },
    { round: 30, text: 'CLEAR ALL 30 ROUNDS (THE ACCOUNT STAYS FULL)' },
  ];
  function starsForCleared(cleared) { return STAR_RULES.filter(r => cleared >= r.round).length; }

  // ---------------------------------------------------------------- cosmetics
  // need: { stars: n } lifetime stars · { chest: true } only from the daily chest
  //       { daily: true } a star in a daily challenge · { streak: n } a day streak of n
  const COSMETICS = [
    { id: 'back-classic', kind: 'back', name: 'STOINLY CLASSIC', blurb: 'The back every pack ships with.', need: null },
    { id: 'back-gold', kind: 'back', name: 'GOLD MEMBER', blurb: 'A card back for people with full accounts.', need: { stars: 3 } },
    { id: 'back-lime', kind: 'back', name: 'LIME TERMINAL', blurb: 'Green text on black. Very secure.', need: { stars: 6 } },
    { id: 'back-notice', kind: 'back', name: 'OFFICIAL NOTICE', blurb: 'From the bank. Do not ignore.', need: { stars: 10 } },
    { id: 'back-moon', kind: 'back', name: 'MOON CHILD', blurb: 'The stoinly, risen, on every back.', need: { chest: true } },

    { id: 'board-stars', kind: 'board', name: 'STARFIELD', blurb: 'The night sky over stoinly.computer.', need: null },
    { id: 'board-grid', kind: 'board', name: 'VAPOR GRID', blurb: 'A grid that goes on forever. The money still walks.', need: { stars: 2 } },
    { id: 'board-felt', kind: 'board', name: 'CASINO FELT', blurb: 'The house always gives it away.', need: { stars: 8 } },
    { id: 'board-vault', kind: 'board', name: 'THE VAULT', blurb: 'Brushed steel. Rivets. Full.', need: { chest: true } },
    { id: 'board-construction', kind: 'board', name: 'UNDER CONSTRUCTION', blurb: 'This board is under construction. It always will be.', need: { daily: true } },

    { id: 'burst-confetti', kind: 'burst', name: 'CONFETTI', blurb: 'Every finished bill throws a little party.', need: null },
    { id: 'burst-gum', kind: 'burst', name: 'GUM BUBBLES', blurb: 'Pink, round, not included.', need: { stars: 1 } },
    { id: 'burst-sparkle', kind: 'burst', name: 'SPARKLES', blurb: 'The cursor trail from the homepage.', need: { stars: 5 } },
    { id: 'burst-cash', kind: 'burst', name: 'MAKE IT RAIN', blurb: 'Little bills. Given away.', need: { stars: 15 } },
    { id: 'burst-hearts', kind: 'burst', name: 'HEARTS', blurb: 'Giving money away is love.', need: { chest: true } },

    { id: 'pack-foil', kind: 'pack', name: 'SILVER FOIL', blurb: 'The crimped pouch from the card shop.', need: null },
    { id: 'pack-gold', kind: 'pack', name: 'GOLD FOIL', blurb: 'Same five cards. Shinier.', need: { stars: 4 } },
    { id: 'pack-hot', kind: 'pack', name: 'HOT PINK', blurb: 'Ripped open in style.', need: { chest: true } },
    { id: 'pack-black', kind: 'pack', name: 'BLACK HOLO', blurb: 'For anyone who came back three days running.', need: { streak: 3 } },
  ];
  const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map(c => [c.id, c]));
  const KINDS = { back: 'CARD BACKS', board: 'BOARDS', burst: 'BILL BURSTS', pack: 'PACKS' };
  const DEFAULTS_EQUIPPED = { back: 'back-classic', board: 'board-stars', burst: 'burst-confetti', pack: 'pack-foil' };
  function needText(need) {
    if (!need) return 'FREE';
    if (need.stars) return need.stars + ' STAR' + (need.stars > 1 ? 'S' : '') + ' IN TOTAL';
    if (need.chest) return 'ONLY IN THE DAILY CHEST';
    if (need.daily) return 'EARN A STAR IN A DAILY CHALLENGE';
    if (need.streak) return 'PLAY ' + need.streak + ' DAYS IN A ROW';
    return '';
  }

  // ---------------------------------------------------------------- storage
  function storage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } }

  function fresh() {
    return {
      v: VERSION,
      stars: 0,                                          // lifetime stars banked
      runs: { started: 0, finished: 0, won: 0, bestCleared: 0, bestGiven: 0, bestStars: 0, bestCombo: 0 },
      run: null,                                         // { id, stars, daily } for the run in the save slot
      unlocked: {},                                      // id -> { at: day, seen: bool }
      equipped: Object.assign({}, DEFAULTS_EQUIPPED),
      streak: { last: null, count: 0, best: 0 },
      chest: { last: null, opened: 0 },
      daily: {},                                         // day -> { cleared, given, stars, runs }
    };
  }
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
  const day = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  // take only what is well-formed from a parsed value; anything else falls back to the default
  function sanitize(raw) {
    const m = fresh();
    if (!isObj(raw) || raw.v !== VERSION) return null;
    m.stars = Math.floor(num(raw.stars, 0));
    if (isObj(raw.runs)) for (const k of Object.keys(m.runs)) m.runs[k] = num(raw.runs[k], 0);
    if (isObj(raw.run) && typeof raw.run.id === 'string') m.run = { id: raw.run.id, stars: Math.min(3, Math.floor(num(raw.run.stars, 0))), daily: day(raw.run.daily) };
    if (isObj(raw.unlocked)) for (const [id, u] of Object.entries(raw.unlocked)) if (COSMETIC_BY_ID[id] && isObj(u)) m.unlocked[id] = { at: day(u.at), seen: !!u.seen };
    if (isObj(raw.equipped)) for (const k of Object.keys(DEFAULTS_EQUIPPED)) { const id = raw.equipped[k]; if (COSMETIC_BY_ID[id] && COSMETIC_BY_ID[id].kind === k) m.equipped[k] = id; }
    if (isObj(raw.streak)) m.streak = { last: day(raw.streak.last), count: Math.floor(num(raw.streak.count, 0)), best: Math.floor(num(raw.streak.best, 0)) };
    if (isObj(raw.chest)) m.chest = { last: day(raw.chest.last), opened: Math.floor(num(raw.chest.opened, 0)) };
    if (isObj(raw.daily)) for (const [k, d] of Object.entries(raw.daily)) if (day(k) && isObj(d)) m.daily[k] = { cleared: num(d.cleared, 0), given: num(d.given, 0), stars: num(d.stars, 0), runs: num(d.runs, 0) };
    // an equipped item that is not owned goes back to the default
    for (const k of Object.keys(m.equipped)) if (!owned(m, m.equipped[k])) m.equipped[k] = DEFAULTS_EQUIPPED[k];
    return m;
  }

  function load() {
    const ls = storage();
    if (!ls) return fresh();
    let text = null;
    try { text = ls.getItem(KEY); } catch (_) { return fresh(); }
    if (text == null) return fresh();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) { parsed = undefined; }
    const m = parsed === undefined ? null : sanitize(parsed);
    if (!m) {
      // keep what was there, so nothing is destroyed by a bad read
      try { ls.setItem(KEY + '.corrupt', text); } catch (_) {}
      return fresh();
    }
    return m;
  }

  let M = load();
  function save() { const ls = storage(); if (!ls) return; try { ls.setItem(KEY, JSON.stringify(M)); } catch (_) {} }

  function owned(m, id) { const c = COSMETIC_BY_ID[id]; return !!c && (!c.need || !!m.unlocked[id]); }

  // ---------------------------------------------------------------- streak
  // the streak only counts while it is alive: played today or yesterday
  function streakNow() {
    const t = today();
    if (M.streak.last === t || M.streak.last === addDays(t, -1)) return M.streak.count;
    return 0;
  }
  function touchStreak() {
    const t = today();
    if (M.streak.last === t) return { changed: false, count: M.streak.count, unlocks: [] };
    M.streak.count = M.streak.last === addDays(t, -1) ? M.streak.count + 1 : 1;
    M.streak.last = t;
    M.streak.best = Math.max(M.streak.best, M.streak.count);
    const unlocks = checkUnlocks();
    save();
    return { changed: true, count: M.streak.count, unlocks };
  }

  // ---------------------------------------------------------------- unlocks
  function unlock(id) {
    if (owned(M, id)) return false;
    M.unlocked[id] = { at: today(), seen: false };
    return true;
  }
  // everything that is earned by a number crossing a line
  function checkUnlocks(extra) {
    const out = [];
    for (const c of COSMETICS) {
      if (!c.need || owned(M, c.id)) continue;
      const n = c.need;
      const ok = (n.stars && M.stars >= n.stars) || (n.streak && M.streak.best >= n.streak) || (n.daily && extra && extra.daily);
      if (ok && unlock(c.id)) out.push(c);
    }
    return out;
  }
  function newCount() { return Object.values(M.unlocked).filter(u => !u.seen).length; }
  function markSeen(id) { if (M.unlocked[id] && !M.unlocked[id].seen) { M.unlocked[id].seen = true; save(); return true; } return false; }
  function equip(id) {
    const c = COSMETIC_BY_ID[id];
    if (!c || !owned(M, id)) return false;
    M.equipped[c.kind] = id; save(); return true;
  }

  // ---------------------------------------------------------------- runs
  function newRunId() { return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function beginRun(opts) {
    const id = (opts && opts.id) || newRunId();
    M.run = { id, stars: 0, daily: (opts && opts.daily) || null };
    M.runs.started++;
    if (M.run.daily) { const d = dailyRecord(M.run.daily); d.runs++; }
    save();
    return id;
  }
  // a save made before this file existed has no run id; adopt it as a run without stars yet
  function adoptRun(id, daily) {
    if (M.run && M.run.id === id) return id;
    M.run = { id: id || newRunId(), stars: 0, daily: daily || null };
    save();
    return M.run.id;
  }
  function dailyRecord(k) { return M.daily[k] || (M.daily[k] = { cleared: 0, given: 0, stars: 0, runs: 0 }); }

  // called whenever a round is cleared; banks the stars this run has not been paid for yet
  function roundCleared(runId, cleared) {
    if (!M.run || M.run.id !== runId) adoptRun(runId);
    const have = starsForCleared(cleared);
    const gained = Math.max(0, have - M.run.stars);
    if (!gained) return { gained: 0, stars: M.run.stars, unlocks: [] };
    M.run.stars = have;
    M.stars += gained;
    const unlocks = checkUnlocks({ daily: !!M.run.daily });
    save();
    return { gained, stars: have, total: M.stars, unlocks };
  }

  // called once when a run ends, won or lost
  function finishRun(runId, result) {
    if (!M.run || M.run.id !== runId) adoptRun(runId, result.daily);
    const cleared = result.cleared, given = Math.round(result.given || 0);
    const before = roundCleared(runId, cleared);          // in case the last milestone was the win itself
    const stars = M.run.stars;
    const r = M.runs;
    const newBest = cleared > r.bestCleared || (cleared === r.bestCleared && given > r.bestGiven);
    r.finished++; if (result.won) r.won++;
    if (newBest) { r.bestCleared = cleared; r.bestGiven = given; }
    r.bestStars = Math.max(r.bestStars, stars);
    r.bestCombo = Math.max(r.bestCombo, result.combo || 0);
    let newDailyBest = false;
    const dk = M.run.daily;
    if (dk) {
      const d = dailyRecord(dk);
      if (cleared > d.cleared || (cleared === d.cleared && given > d.given)) { d.cleared = cleared; d.given = given; newDailyBest = true; }
      d.stars = Math.max(d.stars, stars);
    }
    // keep two weeks of daily records
    const keys = Object.keys(M.daily).sort();
    while (keys.length > 14) delete M.daily[keys.shift()];
    M.run = null;
    save();
    return { stars, gained: before.gained, total: M.stars, newBest, newDailyBest, daily: dk, unlocks: before.unlocks || [] };
  }
  function forgetRun() { M.run = null; save(); }

  // ---------------------------------------------------------------- daily chest
  function chestReady() { return M.chest.last !== today(); }
  // rng is injectable for tests; the prize is a chest-only cosmetic about half the time while any are left, otherwise stars
  function openChest(rng) {
    rng = rng || Math.random;
    if (!chestReady()) return null;
    M.chest.last = today(); M.chest.opened++;
    const locked = COSMETICS.filter(c => c.need && c.need.chest && !owned(M, c.id));
    let prize;
    if (locked.length && (rng() < 0.5 || M.chest.opened === 1)) {
      const c = locked[Math.floor(rng() * locked.length)];
      unlock(c.id);
      prize = { type: 'cosmetic', item: c };
    } else {
      const q = rng();
      const n = q < 0.6 ? 1 : q < 0.9 ? 2 : 3;
      M.stars += n;
      prize = { type: 'stars', n };
    }
    prize.unlocks = checkUnlocks();
    prize.total = M.stars;
    save();
    return prize;
  }

  AF.meta = {
    KEY, VERSION, STAR_RULES, COSMETICS, COSMETIC_BY_ID, KINDS, DEFAULTS_EQUIPPED,
    dayKey, addDays, prettyDay, seedFor, today, starsForCleared, needText,
    get state() { return M; },
    owned: id => owned(M, id),
    equipped: kind => M.equipped[kind],
    streakNow, touchStreak, newCount, markSeen, equip,
    beginRun, adoptRun, roundCleared, finishRun, forgetRun,
    chestReady, openChest,
    dailyToday: () => M.daily[today()] || null,
    reload() { M = load(); return M; },
    // for the test page only
    _setToday(k) { todayOverride = k; },
    _replace(obj) { M = sanitize(Object.assign(fresh(), obj)) || fresh(); save(); return M; },
    _sanitize: sanitize,
  };
})(typeof window !== 'undefined' ? (window.AF = window.AF || {}) : (global.AF = global.AF || {}));
