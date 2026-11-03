(function (ns) {
  'use strict';
  // meta.js: the hooks that live across games, saved in one localStorage key
  // (`stoinly.doom.meta.v1`): stars per map with their rules, FOIL (the soft currency,
  // never bought with money), cosmetic unlocks (weapon skins and HUD themes) with NEW!
  // badges, the day streak, the daily chest and the daily challenge (a map and a modifier
  // seeded from the local date). DOM-free: the caller passes the store and today's date as
  // 'YYYY-MM-DD'. Corrupt or foreign JSON never throws; it falls back to a fresh record.

  const KEY = 'stoinly.doom.meta.v1';
  const VERSION = 1;

  // Weapon skins recolor the held weapon (hands keep their skin ramp); HUD themes recolor
  // the status bar's cyan. Ramps as in palette.js: 5 red, 6 orange, 7 yellow, 8 lime,
  // 9 teal, 10 cyan, 11 blue, 12 navy, 13 purple, 14 magenta, 15 foil. 'bands' cycle.
  const COSMETICS = [
    { id: 'w_stock', kind: 'weapon', name: 'STOCK', ramp: -1, unlock: { free: true } },
    { id: 'w_gold', kind: 'weapon', name: 'GOLD CARD', ramp: 6, unlock: { stars: 3 } },
    { id: 'w_wintergreen', kind: 'weapon', name: 'WINTERGREEN', ramp: 9, unlock: { stars: 6 } },
    { id: 'w_vapor', kind: 'weapon', name: 'VAPORWAVE', bands: [14, 10], unlock: { foil: 120 } },
    { id: 'w_sepia', kind: 'weapon', name: 'SEPIA 1979', ramp: 3, unlock: { stars: 10 } },
    { id: 'w_scam', kind: 'weapon', name: 'SCAM RED', ramp: 5, unlock: { foil: 200 } },
    { id: 'w_holo', kind: 'weapon', name: 'HOLO FOIL', bands: [5, 6, 7, 8, 10, 11, 14], unlock: { stars: 16 } },
    { id: 'h_cyan', kind: 'hud', name: 'SITE CYAN', ramp: 10, unlock: { free: true } },
    { id: 'h_hot', kind: 'hud', name: 'HOT PINK', ramp: 14, unlock: { stars: 2 } },
    { id: 'h_lime', kind: 'hud', name: 'LIME TICKER', ramp: 8, unlock: { foil: 80 } },
    { id: 'h_gold', kind: 'hud', name: 'GOLD', ramp: 6, unlock: { stars: 8 } },
    { id: 'h_flame', kind: 'hud', name: 'STREAK FLAME', ramp: 5, unlock: { streak: 3 } },
    { id: 'h_purple', kind: 'hud', name: 'ROYALTY', ramp: 13, unlock: { foil: 150 } },
    { id: 'h_rainbow', kind: 'hud', name: 'RAINBOW', bands: [5, 6, 7, 8, 10, 11, 14], unlock: { stars: 14 } }
  ];

  // Daily modifiers. The game reads them through g.mods.
  const MODIFIERS = [
    { id: 'glass', name: 'GLASS CANNON', text: 'YOU DEAL DOUBLE. YOU TAKE DOUBLE.' },
    { id: 'dark', name: 'LIGHTS OUT', text: 'THE BREAKER TRIPPED. EVERY ROOM IS DARKER.' },
    { id: 'hostile', name: 'NO MORE MR NICE GUY', text: 'EVERY STRONG WOMAN IS PROVOKED FROM THE START.' },
    { id: 'money', name: 'MONEY RAIN', text: 'EVERY KILL DROPS A DOLLAR.' },
    { id: 'turbo', name: 'TURBO TRAFFIC', text: 'EVERY VEHICLE DRIVES 1.5X FASTER.' }
  ];

  // The loadout a daily run starts with: what a player would carry into that map.
  const DAILY_KIT = [
    { weapons: [true, true, false, false, false, false, false, false], ammo: { cards: 50, packs: 0, pods: 0, cans: 0 } },
    { weapons: [true, true, true, false, false, false, false, false], ammo: { cards: 80, packs: 12, pods: 0, cans: 0 } },
    { weapons: [true, true, true, true, false, false, false, false], ammo: { cards: 150, packs: 20, pods: 0, cans: 0 } },
    { weapons: [true, true, true, true, true, false, false, false], ammo: { cards: 150, packs: 25, pods: 6, cans: 0 } },
    { weapons: [true, true, true, true, true, true, false, false], ammo: { cards: 180, packs: 30, pods: 8, cans: 120 } },
    { weapons: [true, true, true, true, true, true, false, true], ammo: { cards: 200, packs: 40, pods: 12, cans: 200 } }
  ];

  function fresh() {
    return {
      v: VERSION,
      stars: {},
      bestTime: {},
      foil: 0,
      unlocked: { w_stock: true, h_cyan: true },
      fresh: {},
      equipped: { weapon: 'w_stock', hud: 'h_cyan' },
      streak: { last: '', count: 0, best: 0 },
      chest: { last: '' },
      daily: { date: '', best: 0, plays: 0 },
      bestCombo: 0
    };
  }

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function num(v, d) {
    return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : d;
  }

  function str(v, d) {
    return typeof v === 'string' && v.length < 40 ? v : d;
  }

  // Coerces whatever was stored into the current shape, keeping every valid field.
  function sanitize(raw) {
    const m = fresh();
    if (!isObj(raw) || raw.v !== VERSION) {
      return m;
    }
    if (isObj(raw.stars)) {
      for (const slug in raw.stars) {
        const s = raw.stars[slug];
        if (Array.isArray(s) && /^E\dM\d$/.test(slug)) {
          m.stars[slug] = [Boolean(s[0]), Boolean(s[1]), Boolean(s[2])];
        }
      }
    }
    if (isObj(raw.bestTime)) {
      for (const slug in raw.bestTime) {
        if (/^E\dM\d$/.test(slug) && num(raw.bestTime[slug], 0) > 0) {
          m.bestTime[slug] = num(raw.bestTime[slug], 0);
        }
      }
    }
    m.foil = Math.min(999999, num(raw.foil, 0));
    const ids = {};
    COSMETICS.forEach(function (c) { ids[c.id] = c; });
    if (isObj(raw.unlocked)) {
      for (const id in raw.unlocked) {
        if (ids[id] && raw.unlocked[id] === true) {
          m.unlocked[id] = true;
        }
      }
    }
    if (isObj(raw.fresh)) {
      for (const id in raw.fresh) {
        if (ids[id] && raw.fresh[id] === true) {
          m.fresh[id] = true;
        }
      }
    }
    if (isObj(raw.equipped)) {
      ['weapon', 'hud'].forEach(function (k) {
        const id = raw.equipped[k];
        if (ids[id] && ids[id].kind === k && m.unlocked[id]) {
          m.equipped[k] = id;
        }
      });
    }
    if (isObj(raw.streak)) {
      m.streak.last = str(raw.streak.last, '');
      m.streak.count = num(raw.streak.count, 0);
      m.streak.best = Math.max(num(raw.streak.best, 0), m.streak.count);
    }
    if (isObj(raw.chest)) {
      m.chest.last = str(raw.chest.last, '');
    }
    if (isObj(raw.daily)) {
      m.daily.date = str(raw.daily.date, '');
      m.daily.best = num(raw.daily.best, 0);
      m.daily.plays = num(raw.daily.plays, 0);
    }
    m.bestCombo = num(raw.bestCombo, 0);
    return m;
  }

  function load(store) {
    let raw = null;
    try {
      const s = store && store.get(KEY);
      raw = s ? JSON.parse(s) : null;
    } catch (e) {
      raw = null;
    }
    return sanitize(raw);
  }

  function save(store, m) {
    try {
      store.set(KEY, JSON.stringify(m));
    } catch (e) {
      // storage can be unavailable (private windows); the hooks still work for the session
    }
  }

  // ------------------------------------------------------------------ dates

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // The local calendar date of a Date object, 'YYYY-MM-DD'.
  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
  }

  // Calendar arithmetic in UTC so a daylight-saving change cannot skip or repeat a day.
  function addDays(key, n) {
    const p = parseKey(key);
    if (!p) {
      return '';
    }
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }

  // FNV-1a, 32 bit.
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  // ------------------------------------------------------------------ streak

  // Marks today as played. Returns true when the streak grew today.
  function touchStreak(m, today) {
    const s = m.streak;
    if (s.last === today) {
      return false;
    }
    s.count = s.last && addDays(s.last, 1) === today ? s.count + 1 : 1;
    s.last = today;
    s.best = Math.max(s.best, s.count);
    return true;
  }

  // The streak as it stands today: unbroken if the last play was today or yesterday.
  function streakNow(m, today) {
    const s = m.streak;
    if (s.last === today || (s.last && addDays(s.last, 1) === today)) {
      return s.count;
    }
    return 0;
  }

  // ------------------------------------------------------------------ stars

  // The three stars of a map and their rules, shown on the tally.
  function starRules(par) {
    const p = Math.floor(par / 60) + ':' + pad(par % 60);
    return [
      'FINISH THE MAP',
      'KILLS 75% OR MORE',
      'PAR ' + p + ' OR ALL SECRETS'
    ];
  }

  function starsFor(stats, par) {
    const killPct = stats.killsTotal > 0 ? stats.kills * 100 / stats.killsTotal : 100;
    const sec = Math.floor(stats.time / 35);
    const allSecrets = stats.secretsTotal > 0 && stats.secrets >= stats.secretsTotal;
    return [true, killPct >= 75, (par > 0 && sec <= par) || allSecrets];
  }

  // Records a finished map; returns { earned, fresh (stars new to this map), foil }.
  function recordMap(m, slug, stars, timeTics) {
    const had = m.stars[slug] || [false, false, false];
    const now = [had[0] || stars[0], had[1] || stars[1], had[2] || stars[2]];
    let fresh = 0;
    for (let i = 0; i < 3; i++) {
      if (now[i] && !had[i]) {
        fresh++;
      }
    }
    m.stars[slug] = now;
    const sec = Math.floor(timeTics / 35);
    let bestTime = false;
    if (sec > 0 && (!m.bestTime[slug] || sec < m.bestTime[slug])) {
      m.bestTime[slug] = sec;
      bestTime = true;
    }
    const earned = stars.filter(Boolean).length;
    const foil = earned * 5 + fresh * 15;
    m.foil += foil;
    return { earned: earned, fresh: fresh, foil: foil, bestTime: bestTime };
  }

  function totalStars(m) {
    let n = 0;
    for (const slug in m.stars) {
      n += m.stars[slug].filter(Boolean).length;
    }
    return n;
  }

  // ------------------------------------------------------------------ cosmetics

  function cosmetic(id) {
    for (const c of COSMETICS) {
      if (c.id === id) {
        return c;
      }
    }
    return null;
  }

  function unlockText(c) {
    const u = c.unlock;
    if (u.free) {
      return 'ALWAYS YOURS';
    }
    if (u.stars) {
      return 'EARN ' + u.stars + ' STARS';
    }
    if (u.streak) {
      return 'PLAY ' + u.streak + ' DAYS IN A ROW';
    }
    return u.foil + ' FOIL';
  }

  // Unlocks everything whose star or streak goal is met; returns the newly unlocked ids.
  function refreshUnlocks(m, today) {
    const stars = totalStars(m);
    const streak = Math.max(streakNow(m, today), 0);
    const out = [];
    COSMETICS.forEach(function (c) {
      if (m.unlocked[c.id]) {
        return;
      }
      const u = c.unlock;
      if (u.free || (u.stars && stars >= u.stars) || (u.streak && (streak >= u.streak || m.streak.best >= u.streak))) {
        m.unlocked[c.id] = true;
        m.fresh[c.id] = true;
        out.push(c.id);
      }
    });
    return out;
  }

  // Buys a FOIL item. Returns true when it was bought.
  function buy(m, id) {
    const c = cosmetic(id);
    if (!c || m.unlocked[id] || !c.unlock.foil || m.foil < c.unlock.foil) {
      return false;
    }
    m.foil -= c.unlock.foil;
    m.unlocked[id] = true;
    return true;
  }

  function equip(m, id) {
    const c = cosmetic(id);
    if (!c || !m.unlocked[id]) {
      return false;
    }
    m.equipped[c.kind] = id;
    delete m.fresh[id];
    return true;
  }

  // ------------------------------------------------------------------ daily

  function daily(today, levelCount) {
    const h = hash('stoinly.doom.daily.' + today);
    const n = Math.max(1, levelCount || 6);
    const level = h % n;
    const mod = MODIFIERS[(h >>> 8) % MODIFIERS.length];
    const kit = DAILY_KIT[Math.min(level, DAILY_KIT.length - 1)];
    return {
      date: today,
      seed: h,
      level: level,
      mod: mod,
      carry: { hp: 100, armor: 50, absorb: 1 / 3, ammo: Object.assign({}, kit.ammo), binder: false, weapons: kit.weapons.slice(), ready: level > 0 ? 2 : 1 }
    };
  }

  // A daily score: kills, secrets, items, and a time bonus against par.
  function dailyScore(stats, par) {
    const sec = Math.floor(stats.time / 35);
    return stats.kills * 100 + stats.secrets * 500 + stats.items * 20 + Math.max(0, par - sec) * 10;
  }

  function recordDaily(m, today, score) {
    if (m.daily.date !== today) {
      m.daily.date = today;
      m.daily.best = 0;
      m.daily.plays = 0;
    }
    m.daily.plays++;
    const best = score > m.daily.best;
    if (best) {
      m.daily.best = score;
    }
    return best;
  }

  // ------------------------------------------------------------------ chest

  function chestReady(m, today) {
    return m.chest.last !== today;
  }

  // Opens today's chest. Contents depend only on the date: FOIL, and on some days a locked
  // FOIL cosmetic for free.
  function openChest(m, today) {
    if (!chestReady(m, today)) {
      return null;
    }
    m.chest.last = today;
    const h = hash('stoinly.doom.chest.' + today);
    const amount = 20 + (h % 7) * 10;
    m.foil += amount;
    let item = null;
    if ((h >>> 4) % 4 === 0) {
      const locked = COSMETICS.filter(function (c) { return c.unlock.foil && !m.unlocked[c.id]; });
      if (locked.length) {
        item = locked[(h >>> 8) % locked.length];
        m.unlocked[item.id] = true;
        m.fresh[item.id] = true;
      }
    }
    return { foil: amount, item: item ? item.id : null };
  }

  ns.meta = {
    KEY: KEY,
    VERSION: VERSION,
    COSMETICS: COSMETICS,
    MODIFIERS: MODIFIERS,
    fresh: fresh,
    sanitize: sanitize,
    load: load,
    save: save,
    dateKey: dateKey,
    addDays: addDays,
    hash: hash,
    touchStreak: touchStreak,
    streakNow: streakNow,
    starRules: starRules,
    starsFor: starsFor,
    recordMap: recordMap,
    totalStars: totalStars,
    cosmetic: cosmetic,
    unlockText: unlockText,
    refreshUnlocks: refreshUnlocks,
    buy: buy,
    equip: equip,
    daily: daily,
    dailyScore: dailyScore,
    recordDaily: recordDaily,
    chestReady: chestReady,
    openChest: openChest
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
