(function (ns) {
  'use strict';
  // player.js: Rudiger. Turns input into Doom's movement (thrust, friction, sliding along
  // walls), runs the weapon state machine and its fire actions, picks things up, applies
  // powerups, takes damage through KICKS (armor), drives the status bar face and handles
  // death. The player's inventory persists between levels in g.carry.

  const RUN_THRUST = 0.26 * (1 - 0.90625);
  const EYE = 0.64;
  const W = function () {
    return ns.world;
  };

  // Weapon table (design section 5). fire: [frame, tics, action] steps; refire: holding the
  // trigger goes straight back to the first fire step.
  const WEAPONS = [
    { name: 'HANDS', sprite: 'PUNG', ammo: null, fire: [['B', 4], ['C', 4, 'punch'], ['D', 5], ['A', 3]], slot: 1 },
    { name: 'COMMONS', sprite: 'CARD', ammo: 'cards', use: 1, fire: [['B', 4], ['C', 3, 'card'], ['D', 7]], slot: 2 },
    { name: 'POWER PACK', sprite: 'PAKG', ammo: 'packs', use: 1, fire: [['B', 4], ['C', 5, 'pack'], ['D', 12], ['E', 10], ['A', 6]], slot: 3 },
    { name: 'RIPPING STATION', sprite: 'RIPG', ammo: 'cards', use: 1, fire: [['B', 4, 'rip'], ['C', 4, 'rip']], refire: true, slot: 4 },
    { name: 'THE GUY', sprite: 'GUYG', ammo: 'pods', use: 1, fire: [['B', 8], ['C', 6, 'cloud'], ['D', 6]], slot: 5 },
    { name: 'THE MONSTER', sprite: 'MONG', ammo: 'cans', use: 1, fire: [['B', 3, 'bolt']], refire: true, cooldown: [['C', 20]], slot: 6 },
    { name: 'THE GUM', sprite: 'GUMG', ammo: 'cans', use: 40, fire: [['B', 20, 'gumcharge'], ['C', 10, 'gum'], ['D', 20]], slot: 7 },
    { name: 'THE RAZOR', sprite: 'RAZG', ammo: null, fire: [['B', 4, 'slash'], ['C', 4]], refire: true, slot: 1 }
  ];

  const MAX_AMMO = { cards: 200, packs: 50, pods: 50, cans: 300 };

  function newCarry() {
    return {
      hp: 100,
      armor: 0,
      absorb: 0,
      ammo: { cards: 50, packs: 0, pods: 0, cans: 0 },
      binder: false,
      weapons: [true, true, false, false, false, false, false, false],
      ready: 1
    };
  }

  function spawn(g, carry) {
    const lv = g.level;
    const s = lv.start;
    const mo = W().spawn(g, 'PUFF', s.x, s.y, null, s.angle);
    // the player is a thing with no state table of its own
    mo.def = { kind: 'player', lane: 'player', stateList: null, labels: {}, flagSet: {}, mass: 100 };
    mo.type = 'PLAYER';
    mo.sprite = null;
    mo.player = true;
    mo.radius = 0.25;
    mo.height = 0.875;
    mo.solid = true;
    mo.shootable = true;
    mo.float = false;
    mo.si = -1;
    mo.tics = -1;
    const c = carry || newCarry();
    mo.hp = c.hp;
    mo.armor = c.armor;
    mo.absorb = c.absorb;
    mo.ammo = Object.assign({}, c.ammo);
    mo.binder = c.binder;
    mo.weapons = c.weapons.slice();
    mo.readyWeapon = c.ready;
    mo.pendingWeapon = -1;
    mo.keys = {};
    mo.powers = { lip: false, jawn: 0, ceiling: 0, waders: 0, computer: false, glasses: 0 };
    mo.viewz = mo.z + EYE;
    mo.viewheight = EYE;
    mo.deltaview = 0;
    mo.bob = 0;
    mo.psp = { step: -1, tics: 0, frame: 'A', y: 0, raise: 0, lowering: false, flash: 0 };
    mo.face = { state: 'normal', timer: 0, look: 0, lastHp: mo.hp, rampage: 0 };
    mo.damageCount = 0;
    mo.bonusCount = 0;
    mo.attacker = null;
    mo.refire = 0;
    mo.dead = false;
    mo.deadTics = 0;
    mo.cellRef = ns.map.cellAt(lv, mo.x, mo.y);
    g.player = mo;
    return mo;
  }

  function carryOut(pl) {
    return {
      hp: Math.max(1, pl.hp),
      armor: pl.armor,
      absorb: pl.absorb,
      ammo: Object.assign({}, pl.ammo),
      binder: pl.binder,
      weapons: pl.weapons.slice(),
      ready: pl.readyWeapon
    };
  }

  function maxAmmo(pl, kind) {
    return MAX_AMMO[kind] * (pl.binder ? 2 : 1);
  }

  // ------------------------------------------------------------------ movement

  function thrust(pl, angle, amount) {
    pl.momx += Math.cos(angle) * amount;
    pl.momy += Math.sin(angle) * amount;
  }

  function move(g, pl) {
    if (pl.momx === 0 && pl.momy === 0) {
      return;
    }
    // split fast moves so the player never skips through a thin wall
    const steps = Math.ceil(Math.hypot(pl.momx, pl.momy) / 0.15);
    for (let s = 0; s < steps; s++) {
      const dx = pl.momx / steps;
      const dy = pl.momy / steps;
      if (W().tryMove(g, pl, pl.x + dx, pl.y + dy, true)) {
        continue;
      }
      // slide along whatever stopped us
      if (W().tryMove(g, pl, pl.x + dx, pl.y, true)) {
        pl.momy = 0;
        continue;
      }
      if (W().tryMove(g, pl, pl.x, pl.y + dy, true)) {
        pl.momx = 0;
        continue;
      }
      pl.momx = 0;
      pl.momy = 0;
      break;
    }
  }

  // ------------------------------------------------------------------ weapons

  function hasAmmo(pl, w) {
    const def = WEAPONS[w];
    return !def.ammo || pl.ammo[def.ammo] >= def.use;
  }

  function bestWeapon(pl) {
    const order = [6, 5, 2, 3, 4, 1, 7, 0];
    for (const w of order) {
      if (pl.weapons[w] && hasAmmo(pl, w) && w !== 4 && w !== 6) {
        return w;
      }
    }
    return 0;
  }

  function startFire(g, pl) {
    const def = WEAPONS[pl.readyWeapon];
    if (!hasAmmo(pl, pl.readyWeapon)) {
      pl.pendingWeapon = bestWeapon(pl);
      return;
    }
    pl.psp.step = 0;
    setPsp(g, pl, def.fire[0]);
  }

  function setPsp(g, pl, st) {
    pl.psp.frame = st[0];
    pl.psp.tics = st[1];
    if (st[2]) {
      FIRE[st[2]](g, pl);
    }
  }

  function useAmmo(pl) {
    const def = WEAPONS[pl.readyWeapon];
    if (def.ammo) {
      pl.ammo[def.ammo] = Math.max(0, pl.ammo[def.ammo] - def.use);
    }
  }

  function shotAngle(g, pl, spread) {
    return pl.angle + (spread ? (g.rng.next() - 0.5) * spread : 0);
  }

  function eyeZ(pl) {
    return pl.z + 0.6;
  }

  function flash(pl, level) {
    pl.psp.flash = level;
  }

  function fireCard(g, pl, spread, dmgRange) {
    const a = shotAngle(g, pl, spread);
    const slope = W().aimSlope(g, pl, a, 32, eyeZ(pl));
    W().hitscan(g, pl, a, slope, 32, W().rand(g, dmgRange));
    throughStoinly(g, pl, a);
  }

  // Shots pass through THE STOINLY; the first time one does, the game says so.
  function throughStoinly(g, pl, a) {
    if (g.saidReal) {
      return;
    }
    for (const o of g.things) {
      if (o.type !== 'STOI' || o.removed) {
        continue;
      }
      let da = Math.atan2(o.y - pl.y, o.x - pl.x) - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const d = Math.hypot(o.x - pl.x, o.y - pl.y);
      if (Math.abs(da) < Math.atan2(o.radius, d) && W().checkSight(g, pl, o)) {
        g.saidReal = true;
        W().message(g, ns.defs.text.STOINLY_REAL);
      }
    }
  }

  const FIRE = {
    punch: function (g, pl) {
      let dmg = W().rand(g, [2, 20]);
      if (pl.powers.lip) {
        dmg *= 10;
      }
      const slope = W().aimSlope(g, pl, pl.angle, 1.1, eyeZ(pl));
      const r = W().trace(g, pl, pl.x, pl.y, eyeZ(pl), pl.angle + (g.rng.next() - 0.5) * 0.1, slope, 1.1);
      if (r.thing) {
        W().damage(g, r.thing, pl, pl, dmg);
        W().sound(g, 'PUNCH_HIT', pl);
        pl.angle = Math.atan2(r.thing.y - pl.y, r.thing.x - pl.x);
      } else {
        W().sound(g, 'PUNCH_WHIFF', pl);
      }
    },
    slash: function (g, pl) {
      let dmg = W().rand(g, [2, 20]);
      if (pl.powers.lip) {
        dmg *= 2;
      }
      const slope = W().aimSlope(g, pl, pl.angle, 1.2, eyeZ(pl));
      const r = W().trace(g, pl, pl.x, pl.y, eyeZ(pl), pl.angle + (g.rng.next() - 0.5) * 0.15, slope, 1.2);
      W().sound(g, r.thing ? 'PUNCH_HIT' : 'PUNCH_WHIFF', pl);
      if (r.thing) {
        W().damage(g, r.thing, pl, pl, dmg);
      }
    },
    card: function (g, pl) {
      useAmmo(pl);
      W().sound(g, 'PISTOL', pl);
      flash(pl, 2);
      fireCard(g, pl, pl.refire ? 0.1 : 0, [5, 15]);
      ns.level.noise(g, pl);
    },
    pack: function (g, pl) {
      useAmmo(pl);
      W().sound(g, 'SHOTGUN', pl);
      flash(pl, 3);
      for (let i = 0; i < 5; i++) {
        fireCard(g, pl, 0.17, [5, 15]);
      }
      ns.level.noise(g, pl);
      g.events.push({ sound: 'SHOTGUN_PUMP', delay: 18 });
    },
    rip: function (g, pl) {
      if (!hasAmmo(pl, 3)) {
        return;
      }
      useAmmo(pl);
      W().sound(g, 'CHAINGUN', pl);
      flash(pl, 2);
      fireCard(g, pl, pl.refire ? 0.1 : 0.02, [5, 15]);
      ns.level.noise(g, pl);
    },
    cloud: function (g, pl) {
      useAmmo(pl);
      W().sound(g, 'ROCKET_LAUNCH', pl);
      flash(pl, 2);
      W().missile(g, pl, 'CLOD', null);
      ns.level.noise(g, pl);
    },
    bolt: function (g, pl) {
      if (!hasAmmo(pl, 5)) {
        return;
      }
      useAmmo(pl);
      flash(pl, 2);
      W().missile(g, pl, 'MBLT', null);
      ns.level.noise(g, pl);
    },
    gumcharge: function (g, pl) {
      W().sound(g, 'BFG_CHARGE', pl);
    },
    gum: function (g, pl) {
      useAmmo(pl);
      W().sound(g, 'BFG_FIRE', pl);
      flash(pl, 4);
      W().missile(g, pl, 'GUMB', null);
      ns.level.noise(g, pl);
    }
  };

  function tickWeapon(g, pl, input) {
    const psp = pl.psp;
    // lowering and raising when switching
    if (psp.lowering) {
      psp.y += 6;
      if (psp.y >= 60) {
        pl.readyWeapon = pl.pendingWeapon;
        pl.pendingWeapon = -1;
        psp.lowering = false;
        psp.raise = 1;
        psp.step = -1;
        psp.frame = 'A';
      }
      return;
    }
    if (psp.raise) {
      psp.y -= 6;
      if (psp.y <= 0) {
        psp.y = 0;
        psp.raise = 0;
      }
      return;
    }
    const def = WEAPONS[pl.readyWeapon];
    if (psp.step >= 0) {
      if (--psp.tics > 0) {
        return;
      }
      psp.step++;
      if (psp.step < def.fire.length) {
        setPsp(g, pl, def.fire[psp.step]);
        return;
      }
      // end of the fire sequence: refire if the trigger is still held
      if (input.fire && hasAmmo(pl, pl.readyWeapon) && pl.pendingWeapon < 0) {
        pl.refire++;
        psp.step = 0;
        setPsp(g, pl, def.fire[0]);
        return;
      }
      pl.refire = 0;
      if (def.cooldown && psp.step === def.fire.length) {
        psp.step = def.fire.length + 100;
        psp.frame = def.cooldown[0][0];
        psp.tics = def.cooldown[0][1];
        return;
      }
      psp.step = -1;
      psp.frame = 'A';
      if (!hasAmmo(pl, pl.readyWeapon)) {
        pl.pendingWeapon = bestWeapon(pl);
      }
      return;
    }
    if (pl.pendingWeapon >= 0 && pl.pendingWeapon !== pl.readyWeapon) {
      psp.lowering = true;
      return;
    }
    pl.pendingWeapon = -1;
    if (input.fire) {
      startFire(g, pl);
    }
  }

  function selectSlot(pl, slot) {
    // slot 1 toggles between the hands and the razor, as Doom's 1 key toggles fist and saw
    let w;
    if (slot === 1) {
      w = pl.weapons[7] && pl.readyWeapon !== 7 ? 7 : 0;
    } else {
      w = [null, null, 1, 2, 3, 4, 5, 6][slot];
    }
    if (w === null || w === undefined || !pl.weapons[w]) {
      return;
    }
    if (w !== pl.readyWeapon) {
      pl.pendingWeapon = w;
    }
  }

  function cycle(pl, dir) {
    let w = pl.readyWeapon;
    for (let k = 0; k < 8; k++) {
      w = (w + dir + 8) % 8;
      if (pl.weapons[w] && hasAmmo(pl, w)) {
        pl.pendingWeapon = w;
        return;
      }
    }
  }

  // ------------------------------------------------------------------ pickups

  function give(g, pl, mo) {
    const gv = mo.def.give;
    const T = ns.defs.text;
    let took = false;
    let msg = T.pickup[mo.type];
    let snd = 'ITEM_PICKUP';
    if (gv.money) {
      if (pl.hp < gv.max) {
        pl.hp = Math.min(gv.max, pl.hp + gv.money);
        took = true;
        if (pl.hp >= 200) {
          msg = T.ACCOUNT_FULL;
        }
      }
    } else if (gv.kicks) {
      if (pl.armor < gv.max) {
        pl.armor = Math.min(gv.max, pl.armor + gv.kicks);
        if (!pl.absorb) {
          pl.absorb = 1 / 3;
        }
        took = true;
      }
    } else if (gv.armor) {
      if (pl.armor < gv.armor) {
        pl.armor = gv.armor;
        pl.absorb = gv.absorb;
        took = true;
      }
    } else if (gv.ammo && gv.weapon === undefined) {
      const kind = gv.ammo;
      if (pl.ammo[kind] < maxAmmo(pl, kind)) {
        let amount = gv.amount;
        if (g.skill === 0) {
          amount *= 2;
        }
        const had = pl.ammo[kind];
        pl.ammo[kind] = Math.min(maxAmmo(pl, kind), had + amount);
        took = true;
        // Doom switches up from the fist when ammo arrives for something better
        if (had === 0 && pl.readyWeapon === 0) {
          const w = { cards: 1, packs: 2, pods: -1, cans: 5 }[kind];
          if (w > 0 && pl.weapons[w]) {
            pl.pendingWeapon = w;
          }
        }
      }
    } else if (gv.weapon !== undefined) {
      const w = gv.weapon;
      const had = pl.weapons[w];
      if (gv.ammo) {
        const before = pl.ammo[gv.ammo];
        pl.ammo[gv.ammo] = Math.min(maxAmmo(pl, gv.ammo), before + gv.amount * (g.skill === 0 ? 2 : 1));
        took = took || pl.ammo[gv.ammo] > before;
      }
      if (!had) {
        pl.weapons[w] = true;
        pl.pendingWeapon = w;
        took = true;
        pl.face.state = 'grin';
        pl.face.timer = 70;
      }
      msg = T.weapon[w];
      snd = 'WEAPON_PICKUP';
    } else if (gv.key) {
      if (!pl.keys[gv.key]) {
        pl.keys[gv.key] = true;
        took = true;
        snd = 'KEY_PICKUP';
      }
    } else if (gv.power) {
      took = true;
      snd = 'POWERUP';
      const p = gv.power;
      if (p === 'lip') {
        pl.powers.lip = true;
        pl.hp = Math.max(pl.hp, 100);
        if (pl.readyWeapon !== 0) {
          pl.pendingWeapon = 0;
        }
      } else if (p === 'computer') {
        pl.powers.computer = true;
      } else {
        pl.powers[p] = gv.tics;
      }
    } else if (gv.binder) {
      took = true;
      if (!pl.binder) {
        pl.binder = true;
      }
      ['cards', 'packs', 'pods', 'cans'].forEach(function (k, i) {
        pl.ammo[k] = Math.min(maxAmmo(pl, k), pl.ammo[k] + [10, 4, 1, 20][i]);
      });
    }
    if (!took) {
      return false;
    }
    if (mo.def.flagSet.countitem) {
      g.stats.items++;
    }
    if (mo.def.card) {
      ns.level.pull(g, mo.def.card);
    }
    for (const t of g.level.triggers) {
      if (t.when === 'pickup' && t.item === mo.type && !t.fired) {
        t.fired = true;
        if (t.fire) {
          ns.level.fireTag(g, t.fire);
        }
        if (t.message) {
          W().message(g, t.message);
        }
      }
    }
    if (msg) {
      W().message(g, msg);
    }
    W().sound(g, snd, pl);
    pl.bonusCount = Math.min(pl.bonusCount + 6, 20);
    if (g.fx) {
      g.fx.push({ kind: 'pickup', x: mo.x, y: mo.y, z: mo.z, money: gv.money || 0, armor: gv.kicks || (gv.armor ? gv.armor : 0) });
    }
    // a pickup near a strong woman provokes her: she saw you take that
    for (const o of g.things) {
      if (o.def.lane === 'woman' && !o.dead && !o.provoked && Math.hypot(o.x - pl.x, o.y - pl.y) < 3) {
        W().provoke(g, o, pl);
        o.target = pl;
        if (W().inLabel(o, 'spawn')) {
          W().setLabel(g, o, 'see');
        }
      }
    }
    return true;
  }

  function touchItems(g, pl) {
    for (const mo of g.things) {
      if (mo.removed || mo.def.kind !== 'item') {
        continue;
      }
      const r = mo.radius + pl.radius;
      if (Math.abs(mo.x - pl.x) > r || Math.abs(mo.y - pl.y) > r) {
        continue;
      }
      if (mo.z > pl.z + pl.height || mo.z + 0.3 < pl.z - 0.1) {
        continue;
      }
      if (give(g, pl, mo)) {
        mo.removed = true;
      }
    }
  }

  // ------------------------------------------------------------------ damage

  function damage(g, pl, inflictor, source, amount) {
    if (pl.dead) {
      return;
    }
    if (pl.powers.ceiling > 0) {
      return;
    }
    if (g.skill === 0) {
      amount = Math.max(1, amount >> 1);
    }
    if (g.mods && g.mods.glass) {
      amount *= 2;
    }
    // the jawn: ranged attackers mostly miss a player they can barely see
    if (pl.powers.jawn > 0 && source && source !== pl && source.def && source.def.kind === 'monster' && Math.hypot(source.x - pl.x, source.y - pl.y) > source.radius + pl.radius + 0.6 && g.rng.byte() < 140) {
      return;
    }
    if (pl.armor > 0) {
      let saved = Math.floor(amount * pl.absorb);
      if (saved > pl.armor) {
        saved = pl.armor;
      }
      pl.armor -= saved;
      if (pl.armor <= 0) {
        pl.absorb = 0;
      }
      amount -= saved;
    }
    pl.hp -= amount;
    if (g.fx && amount > 0) {
      g.fx.push({ kind: 'hurt', amount: amount });
    }
    pl.attacker = source && source !== pl ? source : null;
    pl.damageCount = Math.min(100, pl.damageCount + amount);
    if (amount >= 20) {
      pl.face.state = 'ouch';
      pl.face.timer = 35;
    } else if (pl.face.state !== 'ouch') {
      pl.face.state = 'hurt';
      pl.face.timer = 18;
    }
    if (inflictor && source && inflictor.def && inflictor.def.kind !== 'missile') {
      const a = Math.atan2(pl.y - inflictor.y, pl.x - inflictor.x);
      pl.momx += Math.cos(a) * amount * 0.0015;
      pl.momy += Math.sin(a) * amount * 0.0015;
    }
    if (pl.hp <= 0) {
      pl.hp = 0;
      pl.dead = true;
      pl.shootable = false;
      W().sound(g, 'PLAYER_DEATH', pl);
      W().message(g, ns.defs.text.DELETED);
    } else {
      W().sound(g, 'PLAYER_PAIN', pl);
    }
  }

  // ------------------------------------------------------------------ the tic

  function tick(g, input) {
    const pl = g.player;
    pl.px = pl.x;
    pl.py = pl.y;
    pl.pz = pl.z;
    pl.pangle = pl.angle;
    // powers count down
    const pw = pl.powers;
    ['jawn', 'ceiling', 'waders', 'glasses'].forEach(function (k) {
      if (pw[k] > 0) {
        pw[k]--;
      }
    });
    if (pl.damageCount > 0) {
      pl.damageCount--;
    }
    if (pl.bonusCount > 0) {
      pl.bonusCount--;
    }
    if (pl.dead) {
      deathTic(g, pl, input);
      return;
    }
    // turning
    pl.angle += input.turn + input.mouseTurn;
    pl.angle = Math.atan2(Math.sin(pl.angle), Math.cos(pl.angle));
    // movement: only on the ground (Doom gives a little air control; we give none)
    const onGround = pl.z <= pl.floorz + 0.001;
    if (onGround && pl.reaction <= 0) {
      const t = RUN_THRUST * (input.run ? 1 : 0.5);
      if (input.forward) {
        thrust(pl, pl.angle, t * input.forward);
      }
      if (input.strafe) {
        thrust(pl, pl.angle + Math.PI / 2, t * input.strafe);
      }
    }
    if (pl.reaction > 0) {
      pl.reaction--;
    }
    move(g, pl);
    pl.momx *= 0.90625;
    pl.momy *= 0.90625;
    if (Math.abs(pl.momx) < 0.0005) {
      pl.momx = 0;
    }
    if (Math.abs(pl.momy) < 0.0005) {
      pl.momy = 0;
    }
    // floor, steps and falls
    let floor = -Infinity;
    W().forCells(g, pl.x, pl.y, pl.radius, function (cell) {
      if (cell && !cell.solid) {
        floor = Math.max(floor, cell.fz);
      }
    });
    pl.floorz = floor;
    if (pl.z < floor) {
      // stepping up: Doom lowers the eye and lets it catch up
      pl.viewheight -= floor - pl.z;
      pl.deltaview = (EYE - pl.viewheight) / 8;
      pl.z = floor;
    } else if (pl.z > floor) {
      pl.momz -= W().GRAVITY;
      pl.z += pl.momz;
      if (pl.z <= floor) {
        if (pl.momz < -0.12) {
          pl.viewheight += pl.momz * 0.6;
          pl.deltaview = (EYE - pl.viewheight) / 8;
          W().sound(g, 'PUNCH_WHIFF', pl);
        }
        pl.z = floor;
        pl.momz = 0;
      }
    }
    // view height and bob
    if (pl.viewheight < EYE) {
      pl.viewheight += pl.deltaview;
      if (pl.viewheight >= EYE) {
        pl.viewheight = EYE;
        pl.deltaview = 0;
      }
    }
    const speed = Math.min(1, Math.hypot(pl.momx, pl.momy) / 0.26);
    pl.bob = 0.05 * speed * speed;
    pl.viewz = pl.z + pl.viewheight + Math.sin(g.tic * Math.PI * 2 / 20) * pl.bob;
    const cell = ns.map.cellAt(g.level, pl.x, pl.y);
    const ceil = cell ? cell.cz : pl.z + 2;
    if (pl.viewz > ceil - 0.06) {
      pl.viewz = ceil - 0.06;
    }
    // specials of the cell underfoot
    const entered = cell !== pl.cellRef;
    pl.cellRef = cell;
    ns.level.playerInCell(g, pl, cell, entered);
    if (input.use) {
      ns.level.use(g, pl);
    }
    if (input.weapon) {
      selectSlot(pl, input.weapon);
    }
    if (input.cycle) {
      cycle(pl, input.cycle);
    }
    tickWeapon(g, pl, input);
    if (pl.psp.flash > 0) {
      pl.psp.flash--;
    }
    touchItems(g, pl);
    tickFace(g, pl, input);
    // the first strong woman in view
    if (!g.saidStronger && g.tic % 8 === 0) {
      for (const o of g.things) {
        if (o.def.lane === 'woman' && !o.dead && Math.hypot(o.x - pl.x, o.y - pl.y) < 12 && W().checkSight(g, pl, o)) {
          let da = Math.atan2(o.y - pl.y, o.x - pl.x) - pl.angle;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) < 0.7) {
            g.saidStronger = true;
            W().message(g, ns.defs.text.STRONGER);
            break;
          }
        }
      }
    }
  }

  function tickFace(g, pl, input) {
    const f = pl.face;
    if (input.fire && pl.psp.step >= 0) {
      f.rampage++;
    } else {
      f.rampage = 0;
    }
    if (f.timer > 0) {
      f.timer--;
      if (f.timer === 0) {
        f.state = 'normal';
      }
    }
    if (f.state === 'normal' && f.rampage > 70) {
      f.state = 'rampage';
      f.timer = 2;
    }
    if (g.tic % 17 === 0 && f.state === 'normal') {
      f.look = [0, 0, -1, 1, 0][g.rng.byte() % 5];
    }
  }

  function deathTic(g, pl, input) {
    pl.deadTics++;
    // the view sinks to the floor and turns toward whoever did it
    if (pl.viewheight > 0.12) {
      pl.viewheight -= 0.03;
    }
    pl.viewz = pl.z + pl.viewheight;
    if (pl.attacker && !pl.attacker.removed) {
      const want = Math.atan2(pl.attacker.y - pl.y, pl.attacker.x - pl.x);
      let da = want - pl.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      pl.angle += Math.max(-0.06, Math.min(0.06, da));
    }
    pl.momx *= 0.9;
    pl.momy *= 0.9;
    move(g, pl);
    if (pl.deadTics > 35 && (input.use || input.fire)) {
      g.restart = true;
    }
  }

  function weaponFrame(pl) {
    const def = WEAPONS[pl.readyWeapon];
    return def.sprite + pl.psp.frame + '0';
  }

  ns.player = {
    WEAPONS: WEAPONS,
    MAX_AMMO: MAX_AMMO,
    EYE: EYE,
    newCarry: newCarry,
    spawn: spawn,
    carryOut: carryOut,
    tick: tick,
    damage: damage,
    weaponFrame: weaponFrame,
    maxAmmo: maxAmmo
  };
})(typeof window !== 'undefined' ? (window.STOINLY = window.STOINLY || {}) : (global.STOINLY = global.STOINLY || {}));
