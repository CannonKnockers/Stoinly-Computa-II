(function (ns) {
  'use strict';
  // things.js (defs): every kind of thing in the game: monsters with Doom-style state
  // tables, projectiles and effects, pickups and decorations. Numbers come from
  // docs/design.md section 3; walking speeds were tuned to 45% of the design's figures
  // after comparing them with Doom's (the design's were about 2.5x Doom's), while charges,
  // darts and hops keep theirs. Speeds are units per tic; damage ranges are [min, max].
  //
  // State notation: 'E8 face, F6 missile:PBLT, G6, goto see' — frame letter and tics, then
  // an optional action with an argument; 'loop' returns to the label's first state, 'goto x'
  // jumps, 'stop' removes the thing, tics -1 holds forever.

  ns.defs = ns.defs || {};

  const VEH = 'vehicle';
  const WOM = 'woman';
  const GST = 'guest';
  const BOS = 'boss';

  const walk4 = 'A4 chase, B4 chase, C4 chase, D4 chase, loop';
  const look2 = 'A10 look, B10 look, loop';

  const T = {};

  // ------------------------------------------------------------------ vehicles
  T.RAZR = {
    lane: VEH, card: 28, hp: 20, radius: 0.25, height: 0.5, speed: 0.06, dart: 0.2, mass: 30, pain: 128,
    melee: [3, 9], voice: 'HONK', flags: 'countkill',
    states: {
      spawn: 'A10 look, B10 look, loop',
      see: 'A3 chase, B3 chase, loop',
      melee: 'C4 face, C12 dart, B10, goto see',
      pain: 'D4 pain, goto see',
      death: 'E5 scream, F5 fall, G-1'
    }
  };
  T.HUFF = {
    lane: VEH, card: 27, hp: 30, radius: 0.3, height: 0.8, speed: 0.055, hop: 0.22, mass: 60, pain: 200,
    melee: [3, 15], voice: 'HONK', drop: 'CMON', flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      melee: 'E6 face, E10 hop, F8 melee, goto see',
      pain: 'G4 pain, goto see',
      death: 'H5 scream, I5 fall, J6, K-1'
    }
  };
  T.CIVC = {
    lane: VEH, card: 29, hp: 60, radius: 0.4, height: 0.8, speed: 0.045, mass: 150, pain: 150,
    melee: [3, 24], hitscan: { pellets: 3, dmg: [3, 9], spread: 8 }, voice: 'HONK', drop: 'PACK', flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      missile: 'E8 face, F6 hitscan, A10, goto see',
      melee: 'E6 face, F6 melee, goto see',
      pain: 'G4 pain, goto see',
      death: 'H6 scream, I6 fall, J6, K6, L-1'
    }
  };
  T.CARA = {
    lane: VEH, card: 25, hp: 150, radius: 0.5, height: 1.0, speed: 0.035, mass: 400, pain: 80,
    melee: [5, 40], voice: 'HONK', drop: 'CARADROP', flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      melee: 'E8 face, F8 melee, A24, goto see',
      pain: 'G5 pain, goto see',
      death: 'H6 scream, I6 fall, J6 honk, K6, L-1'
    }
  };
  T.TIBU = {
    lane: VEH, card: 26, hp: 40, radius: 0.4, height: 0.6, speed: 0.15, mass: 120, pain: 255,
    melee: [10, 60], voice: 'HONK', explode: { radius: 1.5, damage: 64 }, flags: 'countkill',
    states: {
      spawn: look2, see: 'A2 chase, B2 chase, C2 chase, D2 chase, loop',
      melee: 'E5 face, F5 melee, A25, goto see',
      pain: 'G20 pain, goto see',
      death: 'H4 scream, I6 explode, J-1 fall'
    }
  };
  T.SBUS = {
    lane: VEH, card: 30, hp: 400, radius: 0.6, height: 1.2, speed: 0.025, mass: 1000, pain: 20,
    melee: [10, 40], voice: 'HONK', flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      melee: 'E8 face, F6 melee, A36, goto see',
      missile: 'E10 face, F10 passengers, F10, goto see',
      pain: 'G5 pain, goto see',
      death: 'H6 scream, I6 fall, J6, K6, L-1'
    }
  };

  // ------------------------------------------------------------------ strong women
  const ko = 'I6 scream, J6, K5 fall, L5, M-1';
  T.PRIN = {
    lane: WOM, card: 4, hp: 120, radius: 0.3, height: 0.9, speed: 0.05, mass: 100, pain: 100,
    melee: [3, 24], missile: 'PBLT', voice: 'CHIME', decree: 10, flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      missile: 'E8 face, F6 missile, G6, goto see',
      melee: 'E6 face, F6 melee, G4, goto see',
      pain: 'H3, H3 pain, goto see',
      death: ko
    }
  };
  T.MACH = {
    lane: WOM, card: 1, hp: 150, radius: 0.35, height: 0.9, speed: 0.085, mass: 300, pain: 40, straight: true,
    melee: [4, 40], voice: 'GROWL', flags: 'countkill',
    states: {
      spawn: look2, see: 'A2 chase, B2 chase, C2 chase, D2 chase, loop',
      melee: 'E6 face, F6 melee, G6, A7, goto see',
      pain: 'H2, H2 pain, goto see',
      death: ko
    }
  };
  T.QUEN = {
    lane: WOM, card: 5, hp: 200, radius: 0.35, height: 0.9, speed: 0.055, mass: 250, pain: 60,
    melee: [5, 30], arc: [10, 30], voice: 'CHIME', patrols: true, flags: 'countkill',
    states: {
      spawn: 'A4 patrol, B4 patrol, C4 patrol, D4 patrol, loop', see: walk4,
      missile: 'E10 face, F8 arc, G6, goto see',
      melee: 'E6 face, F6 melee, goto see',
      pain: 'H3, H3 pain, goto see',
      death: ko
    }
  };
  T.GLAM = {
    lane: WOM, card: 3, hp: 250, radius: 0.35, height: 0.95, speed: 0.06, mass: 300, pain: 90,
    melee: [10, 50], missile: 'BELT', voice: 'CHIME', team: true, flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      missile: 'E10 face, F8 missile, G6, goto see',
      melee: 'E8 face, F6 melee, A36, goto see',
      pain: 'H3, H3 pain, goto see',
      apron: 'N10 rest, N10 rest, loop',
      death: ko
    }
  };
  T.BICP = {
    lane: WOM, card: 6, hp: 300, radius: 0.4, height: 1.0, speed: 0.035, mass: 600, pain: 0,
    melee: [20, 100], voice: 'GROWL', flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      melee: 'E35 flex, F10 uppercut, G10, A35, goto see',
      pain: 'H3, goto see',
      death: ko
    }
  };
  T.ORIG = {
    lane: WOM, card: 2, hp: 500, radius: 0.4, height: 1.0, speed: 0.06, mass: 800, pain: 50,
    melee: [10, 80], missile: 'OBLT', voice: 'GROWL', opensLocked: true, flags: 'countkill',
    states: {
      spawn: look2, see: walk4,
      missile: 'E10 face, F8 missile, G6, goto see',
      melee: 'E8 face, F8 melee, A24, goto see',
      pain: 'H4, H4 pain, goto see',
      death: ko
    }
  };

  // ------------------------------------------------------------------ guests
  function guest(card, hp, speed, pain, extra) {
    return Object.assign({
      lane: GST, card: card, hp: hp, radius: 0.5, height: 0.9, speed: speed, mass: 200, pain: pain,
      float: 1.0, voice: 'CHIME', flags: 'countkill,float',
      states: {
        spawn: 'A10 look, B10 look, loop',
        see: 'A4 chase, A4 chase, B4 chase, B4 chase, loop',
        missile: 'C20 face, D8 guestattack, A8, goto see',
        pain: 'E6 pain, goto see',
        death: 'F6 depart, G6, G6, H8, H8, stop'
      }
    }, extra);
  }
  T.TIMC = guest(7, 600, 0.04, 60, { attack: 'ticker', dmg: [10, 40], drop: 'COMP', heal: 100 });
  T.TECH = guest(8, 400, 0.055, 90, { attack: 'chopper', dmg: [3, 9], drop: 'KEYG' });
  T.WAYN = guest(9, 450, 0.045, 128, { attack: 'fireman', dmg: [8, 40], drop: 'KEYR', blink: true });
  T.AMAZ = guest(10, 700, 0.03, 200, { attack: 'rant', dmg: [2, 2], drop: 'KEYB' });
  T.WIRD = guest(11, 500, 0.04, 100, { attack: 'parody', dmg: [5, 15], drop: 'KEYR' });
  T.YELA = guest(12, 450, 0.045, 70, { attack: 'howl', dmg: [10, 30], drop: 'KEYR', float: 0.5 });

  // ------------------------------------------------------------------ bosses
  T.CRIS = {
    lane: BOS, card: 32, hp: 2500, radius: 0.75, height: 2.0, speed: 0.035, mass: 2000, pain: 10,
    missile: 'CRSH', dmg: [10, 30], voice: 'GROWL', flags: 'countkill,boss', bailout: 1250,
    states: {
      spawn: look2, see: 'A6 chase, B6 chase, C6 chase, D6 chase, loop',
      missile: 'E25 face, F10 missile, A10, goto see',
      melee: 'G10 face, H8 foreclose, A8, goto see',
      pain: 'I6 pain, goto see',
      bailout: 'M70 bailout, goto see',
      death: 'J12 scream, K12, L12, N12, O-1 cleared'
    }
  };
  function half(card) {
    return {
      lane: BOS, card: card, hp: 1200, radius: 0.6, height: 1.6, speed: 0.04, mass: 1500, pain: 30,
      missile: 'PAPR', melee: [15, 70], voice: 'HONK', flags: 'countkill,boss', team: true,
      states: {
        spawn: look2, see: 'A5 chase, B5 chase, C5 chase, D5 chase, loop',
        missile: 'E10 face, F8 missile, A8, goto see',
        melee: 'E8 face, G8 melee, A6, goto see',
        pain: 'H5 pain, goto see',
        weekend: 'M10 weekend, loop',
        death: 'I8 scream, J8, K8 fall, L-1 cleared'
      }
    };
  }
  T.DIVM = half(33);
  T.DIVD = half(33);
  T.STOI = {
    lane: BOS, card: 31, hp: 1, radius: 1.0, height: 2.0, speed: 0.02, mass: 100000, pain: 0,
    flags: 'float,ghost,bright',
    states: { spawn: 'A12 stoinly, B12 stoinly, C12 stoinly, B12 stoinly, loop' }
  };

  // ------------------------------------------------------------------ projectiles
  function proj(speed, dmg, extra) {
    return Object.assign({
      kind: 'missile', speed: speed, dmg: dmg, radius: 0.12, height: 0.15, bright: true,
      states: { spawn: 'A3, B3, loop', death: 'C4, D4, E4, stop' }
    }, extra);
  }
  T.PBLT = proj(0.3, [3, 24], { sound: 'PLASMA' });
  T.OBLT = proj(0.22, [15, 60], {});
  T.BELT = proj(0.25, [5, 30], { states: { spawn: 'A3, B3, loop', death: 'stop' }, puff: 'DUST' });
  T.FIRE = proj(0.3, [8, 40], {});
  T.CHOP = proj(0.4, [3, 9], { states: { spawn: 'A3, B3, loop', death: 'stop' }, puff: 'SPRK' });
  T.CRSH = proj(0.18, [30, 120], { splash: { radius: 2, damage: 100 }, radius: 0.3, states: { spawn: 'A3, B3, loop', death: 'stop' }, puff: 'EXPL' });
  T.PAPR = proj(0.25, [20, 80], { states: { spawn: 'A4, B4, loop', death: 'stop' }, puff: 'DUST' });
  T.CLOD = proj(0.35, [20, 160], { splash: { radius: 2, damage: 128 }, radius: 0.15, states: { spawn: 'A3, B3, loop', death: 'stop' }, puff: 'EXPL', hurtsOwner: true });
  T.MBLT = proj(0.5, [5, 40], { radius: 0.08 });
  T.GUMB = proj(0.4, [100, 800], { radius: 0.22, bfg: true });

  // effects: animate once and vanish
  function fx(frames, tics) {
    return { kind: 'fx', bright: true, states: { spawn: frames.split('').map(function (f) { return f + tics; }).join(', ') + ', stop' } };
  }
  T.PUFF = fx('ABCD', 3);
  T.SPRK = fx('ABCD', 3);
  T.DUST = fx('ABCD', 4);
  T.FOIL = fx('ABCD', 4);
  T.TFOG = fx('ABCDEF', 4);
  T.EXPL = fx('ABCDE', 4);
  T.RANT = fx('ABC', 3);
  T.TICK = fx('ABC', 3);
  T.SHOK = fx('ABCD', 4);

  // ------------------------------------------------------------------ pickups
  function item(frames, give, extra) {
    const st = frames.length > 1 ? frames.split('').map(function (f) { return f + '6'; }).join(', ') + ', loop' : frames + '-1';
    return Object.assign({ kind: 'item', radius: 0.25, height: 0.3, give: give, flags: 'countitem', states: { spawn: st } }, extra);
  }
  T.DOLR = item('AB', { money: 1, max: 200 });
  T.MAIL = item('A', { money: 10, max: 100 });
  T.CASH = item('A', { money: 25, max: 100 });
  T.BANK = item('ABCD', { money: 100, max: 200 }, { bright: true });
  T.LACE = item('A', { kicks: 1, max: 200 });
  T.KICK = item('A', { armor: 100, absorb: 1 / 3 }, { card: 17 });
  T.FRSH = item('A', { armor: 200, absorb: 1 / 2 }, { card: 17 });
  T.LIPT = item('A', { power: 'lip' }, { card: 16 });
  T.JAWN = item('ABCD', { power: 'jawn', tics: 60 * 35 }, { card: 18 });
  T.CEIL = item('ABCD', { power: 'ceiling', tics: 30 * 35 }, { card: 13 });
  T.WADR = item('A', { power: 'waders', tics: 60 * 35 });
  T.COMP = item('A', { power: 'computer' });
  T.GLAS = item('A', { power: 'glasses', tics: 120 * 35 });
  T.BNDR = item('A', { binder: true });
  T.CMON = item('A', { ammo: 'cards', amount: 10 }, { flags: '' });
  T.CSTK = item('A', { ammo: 'cards', amount: 50 }, { flags: '' });
  T.PACK = item('A', { ammo: 'packs', amount: 4 }, { flags: '' });
  T.PKBX = item('A', { ammo: 'packs', amount: 20 }, { flags: '' });
  T.POD1 = item('A', { ammo: 'pods', amount: 1 }, { flags: '' });
  T.PODC = item('A', { ammo: 'pods', amount: 5 }, { flags: '' });
  T.CAN1 = item('A', { ammo: 'cans', amount: 20 }, { flags: '' });
  T.CANC = item('A', { ammo: 'cans', amount: 100 }, { flags: '' });
  T.KEYB = item('ABCD', { key: 'blue' }, { flags: 'key', bright: true });
  T.KEYR = item('ABCD', { key: 'red' }, { flags: 'key', bright: true });
  T.KEYG = item('ABCD', { key: 'gold' }, { flags: 'key', bright: true });
  // weapon pickups use the first-person sprites' world stand-ins: the pickup sprites
  T.WPAK = item('A', { weapon: 2, ammo: 'packs', amount: 8 }, { sprite: 'PKBX', flags: 'weapon' });
  T.WRIP = item('A', { weapon: 3, ammo: 'cards', amount: 20 }, { sprite: 'CSTK', flags: 'weapon' });
  T.WGUY = item('A', { weapon: 4, ammo: 'pods', amount: 2 }, { sprite: 'PODC', flags: 'weapon', card: 14 });
  T.WMON = item('A', { weapon: 5, ammo: 'cans', amount: 40 }, { sprite: 'CANC', flags: 'weapon', card: 15 });
  T.WGUM = item('A', { weapon: 6, ammo: 'cans', amount: 40 }, { sprite: 'GUMB', flags: 'weapon', bright: true });
  T.WRZR = item('A', { weapon: 7 }, { sprite: 'RAZR', flags: 'weapon', card: 28 });
  // A pack spot rolls one pickup from a rarity-weighted table when the map loads.
  T.SPOT = { kind: 'spot' };

  // ------------------------------------------------------------------ decorations
  function deco(radius, height, solid, frames, extra) {
    const st = frames && frames.length > 1 ? frames.split('').map(function (f) { return f + '8'; }).join(', ') + ', loop' : 'A-1';
    return Object.assign({ kind: 'deco', radius: radius, height: height, solid: solid, states: { spawn: st } }, extra);
  }
  T.LAMP = deco(0.15, 1.8, true);
  T.FLMP = deco(0.15, 0.9, true);
  T.PLNT = deco(0.2, 0.6, true);
  T.CART = deco(0.25, 0.6, true);
  T.TRSH = deco(0.15, 0.5, true);
  T.MBOX = deco(0.12, 0.6, true);
  T.HOOP = deco(0.12, 1.6, true);
  T.TELE = deco(0.2, 0.35, true, 'AB');
  T.COUC = deco(0.45, 0.45, true);
  T.FRDG = deco(0.22, 1.0, true);
  T.VEND = deco(0.25, 1.1, true);
  T.ATMM = deco(0.22, 1.0, true);
  T.GRIL = deco(0.22, 0.8, true);
  T.CHAR = deco(0.2, 0.5, true);
  T.TREE = deco(0.3, 2.0, true);
  T.HEDG = deco(0.45, 0.7, true);
  T.FOUN = deco(0.45, 0.7, true, 'AB');
  T.TABL = deco(0.4, 0.4, true);
  T.GBAG = deco(0.18, 0.2, false);
  T.BNCH = deco(0.4, 0.25, true);
  T.DUMY = deco(0.18, 0.9, true);
  T.CONE = deco(0.1, 0.32, true);
  T.TIRE = deco(0.2, 0.3, true);
  T.DRUM = deco(0.18, 0.56, true);
  // the propane tank is Doom's barrel: shoot it and it goes up
  T.PROP = { kind: 'barrel', radius: 0.18, height: 0.65, hp: 20, explode: { radius: 2, damage: 128 }, flags: 'shootable', states: { spawn: 'A-1', death: 'A2, A4 explode, stop' } };

  // ------------------------------------------------------------------ compile the state tables
  function parse(name, def) {
    const labels = {};
    const list = [];
    const pending = [];
    for (const label in def.states) {
      labels[label] = list.length;
      const tokens = def.states[label].split(',').map(function (s) { return s.trim(); });
      const start = list.length;
      for (const tok of tokens) {
        if (tok === 'loop') {
          list[list.length - 1].next = start;
          continue;
        }
        if (tok === 'stop') {
          if (list.length > start) {
            list[list.length - 1].next = -2;
          } else {
            list.push({ frame: 'A', tics: 0, action: null, arg: null, next: -2 });
          }
          continue;
        }
        if (tok.indexOf('goto ') === 0) {
          pending.push({ state: list[list.length - 1], label: tok.slice(5) });
          continue;
        }
        const m = /^([A-Z])(-?\d+)(?:\s+(\w+)(?::(\w+))?)?$/.exec(tok);
        if (!m) {
          throw new Error('things: bad state token "' + tok + '" in ' + name + '.' + label);
        }
        if (list.length > start) {
          list[list.length - 1].next = list.length;
        }
        list.push({ frame: m[1], tics: Number(m[2]), action: m[3] || null, arg: m[4] || null, next: -1 });
      }
    }
    for (const p of pending) {
      if (labels[p.label] === undefined) {
        throw new Error('things: ' + name + ' jumps to unknown label "' + p.label + '"');
      }
      p.state.next = labels[p.label];
    }
    def.stateList = list;
    def.labels = labels;
  }

  for (const name in T) {
    const def = T[name];
    def.name = name;
    def.sprite = def.sprite || name;
    def.flagSet = {};
    String(def.flags || '').split(',').filter(Boolean).forEach(function (f) {
      def.flagSet[f] = true;
    });
    if (!def.kind) {
      def.kind = 'monster';
    }
    if (def.states) {
      parse(name, def);
    }
  }

  // Rarity weights for pack spots (design section 4).
  ns.defs.spotTable = [
    { weight: 5, pick: ['CMON', 'PACK', 'MAIL', 'DOLR'] },
    { weight: 3, pick: ['CASH', 'KICK', 'PKBX', 'JAWN'] },
    { weight: 2, pick: ['BANK', 'LIPT', 'CANC'] },
    { weight: 1, pick: ['CEIL', 'FRSH'] }
  ];

  ns.defs.things = T;
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
