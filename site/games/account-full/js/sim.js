/* ACCOUNT FULL — simulation
   Everything that is a rule lives here. No DOM, no canvas: the renderer reads
   this state, the UI calls these methods, and the same file runs in node for
   balance checks. Time is in seconds of simulated play. */
(function (AF) {
  'use strict';

  const D = AF.DATA, P = AF.PATH;
  const ECON = D.ECON, MONEY = D.MONEY;
  const BILL_R = 12;        // radius used for range checks
  const TOWER_R = 22;       // footprint of a placed card
  const BIG = { case: 1, truck: 1, bailout: 1 };

  // the generator's state is kept on an object so it can be saved: a reload draws the same next pack
  function mulberry32(a, box) {
    box = box || { s: a | 0 };
    const f = function () {
      a = box.s; a |= 0; a = a + 0x6D2B79F5 | 0; box.s = a;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    f.box = box;
    return f;
  }

  // The stats of a card at a given tier: base mechanic with tier overrides applied.
  function statsFor(card, tier) {
    const base = card.tower || card.zone || card.vehicle || card.action;
    const out = Object.assign({}, base);
    for (let i = 0; i < (tier || 0) && card.tiers && i < card.tiers.length; i++) Object.assign(out, card.tiers[i].set);
    return out;
  }

  class Sim {
    constructor(seed) { this.reset(seed); }

    reset(seed) {
      this.seed = seed == null ? (Date.now() & 0x7fffffff) : seed;
      this.rng = mulberry32(this.seed);
      this.time = 0;
      this.round = 1;               // the round about to be played / being played
      this.phase = 'idle';          // idle | running | won | lost
      this.room = ECON.roomMax;
      this.gum = ECON.startGum;
      this.gumFrac = 0;
      this.given = 0;
      this.hand = [];
      this.towers = [];
      this.zones = [];
      this.vehicles = [];
      this.bills = [];
      this.clouds = [];
      this.buffs = { rate: { mult: 1, until: 0 }, dmg: { mult: 1, until: 0 } };
      this.effects = [];
      this.notices = [];
      this.spawns = [];
      this.spawnIdx = 0;
      this.roundTime = 0;
      this.packsOpened = 0;
      this.seen = {};
      this.stats = { finished: 0, leaked: 0, leakedValue: 0, packs: 0, placed: 0, upgrades: 0, actions: 0 };
      this.nextUid = 1;
      this.autostart = false;
      this.hitSoundAt = 0;
    }

    uid() { return this.nextUid++; }
    notice(text, kind) { this.notices.push({ text, kind: kind || 'info', at: this.time, id: this.uid() }); }
    fx(e) { e.t0 = this.time; this.effects.push(e); }
    card(id) { return D.CARD_BY_ID[id]; }

    // ------------------------------------------------------------ packs
    drawPack(opts) {
      const pool = D.CARDS.map(c => ({ c, w: D.RARITY[c.rarity].weight }));
      const picks = [];
      for (let i = 0; i < ECON.packSize && pool.length; i++) {
        let total = 0; for (const p of pool) total += p.w;
        let r = this.rng() * total, idx = 0;
        for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
        idx = Math.min(idx, pool.length - 1);
        picks.push(pool[idx].c); pool.splice(idx, 1);
      }
      if (opts && opts.forceStrong && !picks.some(c => c.cat === 'strong')) {
        const strong = pool.filter(p => p.c.cat === 'strong');
        let total = 0; for (const p of strong) total += p.w;
        let r = this.rng() * total, pick = strong[0];
        for (const p of strong) { r -= p.w; if (r <= 0) { pick = p; break; } }
        picks[picks.length - 1] = pick.c;
      }
      return picks;
    }

    packCost() { return ECON.packCost(this.packsOpened); }

    ripPack() {
      const cost = this.packCost();
      if (this.gum < cost) return { ok: false, reason: 'NOT ENOUGH GUM' };
      this.gum -= cost;
      const cards = this.drawPack({ forceStrong: this.packsOpened === 0 });
      this.packsOpened++; this.stats.packs++;
      const pulled = cards.map(c => { this.seen[c.id] = (this.seen[c.id] || 0) + 1; return { uid: this.uid(), cardId: c.id, tier: 0 }; });
      return { ok: true, cards: pulled };
    }
    takeCards(pulled) { for (const h of pulled) this.hand.push(h); }

    tradeIn(handUid) {
      const i = this.hand.findIndex(h => h.uid === handUid);
      if (i < 0) return { ok: false };
      const h = this.hand[i];
      const card = this.card(h.cardId);
      const value = ECON.tradeValue[card.rarity] + (h.tier || 0) * ECON.tradeTier;
      this.hand.splice(i, 1);
      this.gum += value;
      return { ok: true, value, card };
    }

    // ------------------------------------------------------------ placement
    previewPlacement(cardId, x, y, tier) {
      const card = this.card(cardId);
      const near = P.nearest(x, y);
      const B = D.BOARD;
      if (card.kind === 'tower') {
        const st = statsFor(card, tier || 0);
        if (st.unique && this.towers.some(t => t.cardId === cardId)) {
          const t = this.towers.find(t => t.cardId === cardId);
          if (Math.hypot(t.x - x, t.y - y) <= TOWER_R + 10) return { ok: t.tier < 2, kind: 'upgrade-unique', x: t.x, y: t.y, range: st.range, reason: t.tier < 2 ? 'DROP TO RISE' : 'ALREADY RISEN' };
          return { ok: false, kind: 'tower', x, y, range: st.range, reason: 'THERE IS ONLY ONE. DROP IT ON THE STOINLY.' };
        }
        if (x < 24 || y < 24 || x > B.w - 24 || y > B.h - 24) return { ok: false, kind: 'tower', x, y, range: st.range, reason: 'OFF THE BOARD' };
        if (near.d < P.HALF_W + TOWER_R - 4) return { ok: false, kind: 'tower', x, y, range: st.range, reason: 'NEXT TO THE TRACK, NOT ON IT' };
        for (const t of this.towers) if (Math.hypot(t.x - x, t.y - y) < TOWER_R * 2) return { ok: false, kind: 'tower', x, y, range: st.range, reason: 'TOO CLOSE' };
        return { ok: true, kind: 'tower', x, y, range: st.range };
      }
      if (card.kind === 'zone') {
        const st = statsFor(card, 0);
        const half = st.len / 2;
        const s = Math.max(half, Math.min(P.length - half, near.s));
        const q = P.posAt(s);
        if (near.d > P.HALF_W + 14) return { ok: false, kind: 'zone', x: q.x, y: q.y, s, len: st.len, reason: 'HAS TO BE ON THE TRACK' };
        for (const z of this.zones) if (Math.abs(z.s - s) < (z.len + st.len) / 2 + 4) return { ok: false, kind: 'zone', x: q.x, y: q.y, s, len: st.len, reason: 'OVERLAPS ' + this.card(z.cardId).name };
        return { ok: true, kind: 'zone', x: q.x, y: q.y, s, len: st.len };
      }
      if (card.kind === 'vehicle') {
        const st = statsFor(card, 0);
        const span = st.stationary ? st.len : st.seg;
        const half = span / 2;
        const s = Math.max(half, Math.min(P.length - half, near.s));
        const q = P.posAt(s);
        if (near.d > P.HALF_W + 14) return { ok: false, kind: 'vehicle', x: q.x, y: q.y, s, len: span, stationary: !!st.stationary, reason: 'HAS TO BE ON THE TRACK' };
        if (st.stationary) for (const v of this.vehicles) if (v.stationary && Math.abs(v.s - s) < (v.len + st.len) / 2) return { ok: false, kind: 'vehicle', x: q.x, y: q.y, s, len: span, stationary: true, reason: 'ALREADY A RAZOR THERE' };
        return { ok: true, kind: 'vehicle', x: q.x, y: q.y, s, len: span, stationary: !!st.stationary };
      }
      if (card.kind === 'action') {
        const a = card.action;
        if (a.effect !== 'room' && this.phase !== 'running') return { ok: false, kind: a.target === 'track' ? 'cloud' : 'global', x, y, s: near.s, len: a.len || 0, reason: 'PLAY IT DURING A ROUND' };
        if (a.target === 'track') {
          const half = a.len / 2;
          const s = Math.max(half, Math.min(P.length - half, near.s));
          const q = P.posAt(s);
          if (near.d > P.HALF_W + 30) return { ok: false, kind: 'cloud', x: q.x, y: q.y, s, len: a.len, reason: 'DROP IT ON THE TRACK' };
          return { ok: true, kind: 'cloud', x: q.x, y: q.y, s, len: a.len };
        }
        return { ok: true, kind: 'global', x, y };
      }
      return { ok: false, reason: '?' };
    }

    placeFromHand(handUid, x, y) {
      const i = this.hand.findIndex(h => h.uid === handUid);
      if (i < 0) return { ok: false, reason: 'NOT IN HAND' };
      const h = this.hand[i];
      const card = this.card(h.cardId);
      const pv = this.previewPlacement(h.cardId, x, y, h.tier);
      if (!pv.ok) return pv;
      this.hand.splice(i, 1);
      if (pv.kind === 'upgrade-unique') {
        const t = this.towers.find(t => t.cardId === h.cardId);
        t.tier = Math.min(2, Math.max(t.tier, h.tier || 0) + 1);
        this.fx({ type: 'rise', x: t.x, y: t.y });
        this.notice(card.name + ': ' + card.tiers[t.tier - 1].name, 'gold');
        return { ok: true, kind: 'upgrade-unique', uid: t.uid };
      }
      if (card.kind === 'tower') {
        const t = { uid: this.uid(), cardId: card.id, tier: h.tier || 0, x: pv.x, y: pv.y, cd: 0, pulseAt: this.time + 1, target: h.target || statsFor(card, 0).target, given: h.given || 0 };
        this.towers.push(t); this.stats.placed++;
        this.fx({ type: 'place', x: t.x, y: t.y });
        return { ok: true, kind: 'tower', uid: t.uid };
      }
      if (card.kind === 'zone') {
        const z = { uid: this.uid(), cardId: card.id, tier: h.tier || 0, s: pv.s, len: pv.len, given: 0, x: pv.x, y: pv.y };
        this.zones.push(z); this.stats.placed++;
        this.fx({ type: 'place', x: pv.x, y: pv.y });
        return { ok: true, kind: 'zone', uid: z.uid };
      }
      if (card.kind === 'vehicle') {
        const st = statsFor(card, h.tier || 0);
        const v = { uid: this.uid(), cardId: card.id, tier: h.tier || 0, s: pv.s, s0: pv.s - pv.len / 2, s1: pv.s + pv.len / 2, dir: 1, stationary: pv.stationary, len: pv.len, given: 0, stopAt: this.time + (st.stopEvery || 0), stoppedUntil: 0, x: pv.x, y: pv.y };
        this.vehicles.push(v); this.stats.placed++;
        this.fx({ type: 'place', x: pv.x, y: pv.y });
        return { ok: true, kind: 'vehicle', uid: v.uid };
      }
      if (card.kind === 'action') {
        this.playAction(card, pv);
        this.stats.actions++;
        return { ok: true, kind: 'action' };
      }
      return { ok: false, reason: '?' };
    }

    // Big money cannot be pinned, held or stunned; it can only be slowed.
    stoppable(b) { return !BIG[b.kind]; }

    findPlaced(uid) {
      return this.towers.find(t => t.uid === uid) || this.zones.find(z => z.uid === uid) || this.vehicles.find(v => v.uid === uid) || null;
    }
    listFor(obj) { return this.towers.includes(obj) ? this.towers : this.zones.includes(obj) ? this.zones : this.vehicles; }

    upgradeCost(obj) {
      const card = this.card(obj.cardId);
      if (!card.tiers || obj.tier >= card.tiers.length) return null;
      return ECON.upgradeCost[card.rarity][obj.tier];
    }
    upgrade(uid) {
      const obj = this.findPlaced(uid); if (!obj) return { ok: false };
      const cost = this.upgradeCost(obj);
      if (cost == null) return { ok: false, reason: 'MAXED' };
      if (this.gum < cost) return { ok: false, reason: 'NOT ENOUGH GUM' };
      this.gum -= cost; obj.tier++; obj.spent = (obj.spent || 0) + cost; this.stats.upgrades++;
      const card = this.card(obj.cardId);
      if (obj.s0 != null) {  // vehicles keep their segment; nothing else to recompute
      }
      this.fx({ type: 'upgrade', x: obj.x, y: obj.y });
      this.notice(card.name + ': ' + card.tiers[obj.tier - 1].name, 'good');
      return { ok: true };
    }
    pickUp(uid) {
      if (this.phase !== 'idle') return { ok: false, reason: 'BETWEEN ROUNDS ONLY' };
      const obj = this.findPlaced(uid); if (!obj) return { ok: false };
      const list = this.listFor(obj);
      list.splice(list.indexOf(obj), 1);
      this.hand.push({ uid: this.uid(), cardId: obj.cardId, tier: obj.tier, target: obj.target, given: obj.given || 0 });
      return { ok: true };
    }
    setTarget(uid, mode) { const t = this.towers.find(t => t.uid === uid); if (t) t.target = mode; }

    // ------------------------------------------------------------ actions
    playAction(card, pv) {
      const a = card.action;
      this.notice(card.name, 'action');
      if (a.effect === 'room') {
        const before = this.room;
        this.room = Math.min(ECON.roomMax, this.room + a.amount);
        this.fx({ type: 'banner', text: '+$' + (this.room - before) + ' ROOM' });
      } else if (a.effect === 'cloud') {
        this.clouds.push({ uid: this.uid(), s: pv.s, len: a.len, until: this.time + a.dur, slow: a.slow || 1, reverse: !!a.reverse, cardId: card.id, x: pv.x, y: pv.y });
      } else if (a.effect === 'buff') {
        this.buffs[a.stat] = { mult: a.mult, until: this.time + a.dur };
        this.fx({ type: 'banner', text: card.name });
      } else if (a.effect === 'pushback') {
        for (const b of this.bills) {
          const f = BIG[b.kind] ? a.bigFrac : a.frac;
          b.dist = Math.max(0, b.dist - f * P.length);
          b.inZone = {};
        }
        this.fx({ type: 'banner', text: 'RUN IT BACK' });
      } else if (a.effect === 'crisis') {
        let total = 0;
        for (const b of this.bills.slice()) {
          const cut = Math.ceil(b.value * a.frac);
          total += this.hit(b, cut, 'void', null, { silent: true });
        }
        this.fx({ type: 'crash' });
        this.fx({ type: 'banner', text: 'THE MARKET CRASHED. $' + fmt(total) + ' GONE.' });
      } else if (a.effect === 'divorce') {
        // back toward the mail in the order they walked, never further along than they were
        const order = this.bills.slice().sort((a, b) => a.dist - b.dist);
        const extra = [];
        let i = 0;
        for (const b of order) {
          b.dist = Math.min(b.dist, (i++) * 9); b.inZone = {}; b.holdUntil = 0; b.stunUntil = 0; b.reverseUntil = 0;
          if (!BIG[b.kind] && b.value >= 2) {
            const half = Math.floor(b.value / 2);
            b.value -= half; b.max = Math.min(b.max, b.value);
            const share = (b.gumShare == null ? 1 : b.gumShare) / 2;
            b.gumShare = share;
            const e = this.makeMoney(b.kind, half, Object.assign({}, b.mods), Math.max(0, b.dist - 9), half);
            e.gumShare = share;
            extra.push(e);
          }
        }
        for (const e of extra) this.bills.push(e);
        this.fx({ type: 'banner', text: 'EVERYONE GOES TO THE MAILBOX.' });
      }
    }

    // ------------------------------------------------------------ money
    makeMoney(kind, value, mods, dist, max) {
      const m = {};
      if (Array.isArray(mods)) for (const k of mods) m[k] = true; else Object.assign(m, mods || {});
      // placed on the track at once, so money born mid-step is never drawn at the board's corner
      const p = P.posAt(dist || 0);
      return { uid: this.uid(), kind, value, max: max || value, dist: dist || 0, mods: m, stunUntil: 0, holdUntil: 0, soggyUntil: 0, soggyAll: false,
        accrueAt: this.time + 2.5, hits: {}, inZone: {}, dotAt: 0, x: p.x, y: p.y, a: p.a, dead: false, born: this.time };
    }
    spawn(kind, value, mods, dist) { const b = this.makeMoney(kind, value, mods, dist); this.bills.push(b); return b; }

    // Apply a hit. Returns the dollars actually given away.
    hit(b, amount, dtype, source, opts) {
      if (b.dead || !(amount > 0)) return 0;   // also rejects NaN, which would make a bill immortal
      if (dtype === 'force') {
        if (b.mods.check) { if (!opts || !opts.silent) this.fx({ type: 'bounce', x: b.x, y: b.y }); return 0; }
        if (b.mods.strapped) amount *= 0.5;
        if (b.soggyUntil > this.time) amount *= 1.25;
      } else if (dtype === 'transaction') {
        if (b.soggyUntil > this.time && b.soggyAll) amount *= 1.25;
      }
      const given = Math.min(b.value, amount);
      b.value -= given;
      this.given += given;
      if (source) source.given = (source.given || 0) + given;
      if (!opts || !opts.silent) this.fx({ type: 'hit', x: b.x, y: b.y, amt: given, dtype });
      if (b.value <= 0.01) this.finish(b);
      return given;
    }

    finish(b) {
      if (b.dead) return;
      b.dead = true;
      this.stats.finished++;
      this.gumFrac += ECON.gumFor(b.kind, b.max) * (b.gumShare == null ? 1 : b.gumShare);
      while (this.gumFrac >= 1) { this.gumFrac -= 1; this.gum++; }
      const def = MONEY.kinds[b.kind];
      if (def.burst) {
        const bu = def.burst;
        for (let i = 0; i < bu.n; i++) {
          const c = this.spawn(bu.kind, bu.value, bu.mods || [], Math.max(0, b.dist - 14 * i));
          c.accrueAt = this.time + 2.5;
        }
        this.fx({ type: 'burst', x: b.x, y: b.y, kind: b.kind });
      } else {
        this.fx({ type: 'finish', x: b.x, y: b.y, value: b.max });
      }
    }

    leak(b) {
      b.dead = true;
      const v = Math.ceil(b.value);
      this.room = Math.max(0, this.room - v);
      this.stats.leaked++; this.stats.leakedValue += v;
      this.fx({ type: 'leak', value: v });
      if (this.room <= 0 && this.phase === 'running') { this.phase = 'lost'; this.fx({ type: 'lost' }); }
    }

    // ------------------------------------------------------------ rounds
    startRound() {
      if (this.phase !== 'idle') return false;
      const wave = D.WAVES[this.round - 1];
      if (!wave) return false;
      this.spawns = [];
      let t = 1.0;
      for (const grp of wave) {
        for (let i = 0; i < grp.n; i++) this.spawns.push({ t: t + i * grp.gap, v: grp.v, kind: grp.kind, mods: grp.mods });
        t += grp.n * grp.gap + grp.pause;
      }
      this.spawnIdx = 0; this.roundTime = 0;
      this.phase = 'running';
      this.fx({ type: 'round', round: this.round });
      if (D.INTRO[this.round]) this.notice(D.INTRO[this.round], 'intro');
      return true;
    }

    endRound() {
      // action cards last one round at most
      this.clouds = [];
      this.buffs = { rate: { mult: 1, until: 0 }, dmg: { mult: 1, until: 0 } };
      const bonus = ECON.roundBonus(this.round);
      this.gum += bonus;
      this.fx({ type: 'roundEnd', round: this.round, bonus });
      this.round++;
      if (this.round > D.WAVES.length) { this.phase = 'won'; this.fx({ type: 'won' }); }
      else this.phase = 'idle';
    }

    // ------------------------------------------------------------ helpers
    buff(stat) { const b = this.buffs[stat]; return b.until > this.time ? b.mult : 1; }

    auraFor(t) {
      let rate = 0, dmg = 0;
      const card = this.card(t.cardId);
      for (const o of this.towers) {
        if (o === t) continue;
        const st = o._st || statsFor(this.card(o.cardId), o.tier);
        if (!st.auraRate && !st.auraDmg) continue;
        if (!st.auraAll && card.cat !== 'strong') continue;
        if (!st.global && Math.hypot(o.x - t.x, o.y - t.y) > st.range) continue;
        rate += st.auraRate || 0; dmg += st.auraDmg || 0;
      }
      return { rate: 1 + rate, dmg: 1 + dmg };
    }

    targetsFor(t, st, n) {
      const cands = [];
      const r2 = (st.range + BILL_R) * (st.range + BILL_R);
      for (const b of this.bills) {
        if (b.dead) continue;
        if (b.mods.crypto && !st.sees) continue;
        if (st.splitMin && b.value < st.splitMin && !BIG[b.kind]) continue;
        if (!st.global) { const dx = b.x - t.x, dy = b.y - t.y; if (dx * dx + dy * dy > r2) continue; }
        cands.push(b);
      }
      if (!cands.length) return cands;
      const mode = t.target || 'first';
      cands.sort((a, b) => mode === 'first' ? b.dist - a.dist : mode === 'last' ? a.dist - b.dist : mode === 'strong' ? b.value - a.value : a.value - b.value);
      return cands.slice(0, n || 1);
    }

    towerShoot(t, st, card) {
      const aura = this.auraFor(t);
      const dmgMult = aura.dmg * this.buff('dmg');
      const targets = this.targetsFor(t, st, st.multi || 1);
      if (!targets.length) return false;
      for (const b of targets) {
        this.fx({ type: 'tracer', x1: t.x, y1: t.y, x2: b.x, y2: b.y, cat: card.cat });
        if (st.splitShare) { this.makeItRain(t, st, b, dmgMult); continue; }
        let amt = st.pct ? Math.max(st.pctMin || 0, b.value * st.pct) : st.dmg;
        amt *= dmgMult;
        this.hit(b, amt, st.dtype, t);
        if (st.chain) {
          let from = b, left = st.chain;
          const hitSet = new Set([b.uid]);
          while (left-- > 0) {
            let best = null, bd = Infinity;
            for (const o of this.bills) {
              if (o.dead || hitSet.has(o.uid) || (o.mods.crypto && !st.sees)) continue;
              const d = Math.hypot(o.x - from.x, o.y - from.y);
              if (d <= st.chainRange && d < bd) { bd = d; best = o; }
            }
            if (!best) break;
            hitSet.add(best.uid);
            this.fx({ type: 'arc', x1: from.x, y1: from.y, x2: best.x, y2: best.y });
            this.hit(best, st.dmg * dmgMult, st.dtype, t);
            from = best;
          }
        }
      }
      return true;
    }

    makeItRain(t, st, b, dmgMult) {
      const share = Math.min(0.9, st.splitShare * dmgMult);
      this.hit(b, b.value * share, 'void', t);
      if (b.dead || BIG[b.kind] || b.value < 2) return;
      const n = Math.min(st.splitN, Math.floor(b.value));
      const piece = Math.floor(b.value / n);
      let rem = b.value - piece * n;
      b.value = piece + rem; b.max = Math.min(b.max, b.value);   // an accruing piece regrows only to its own size
      const gshare = (b.gumShare == null ? 1 : b.gumShare) / n;     // splitting a bill does not multiply its gum
      b.gumShare = gshare;
      for (let i = 1; i < n; i++) {
        const c = this.makeMoney(b.kind, piece, Object.assign({}, b.mods), Math.max(0, b.dist - st.splitPush * i), piece);
        c.gumShare = gshare;
        this.bills.push(c);
      }
      this.fx({ type: 'rain', x: b.x, y: b.y });
    }

    pulse(t, st, card, aura) {
      let any = false;
      const mult = aura.dmg * this.buff('dmg');
      for (const b of this.bills) {
        if (b.dead) continue;
        if (b.mods.crypto && !st.sees) continue;
        if (!st.global && Math.hypot(b.x - t.x, b.y - t.y) > st.range + BILL_R) continue;
        any = true;
        if (st.pulseStun && this.stoppable(b)) b.stunUntil = Math.max(b.stunUntil, this.time + st.pulseStun);
        const base = st.pulsePct ? Math.max(st.pulseMin || 0, b.value * st.pulsePct) : st.dmg;
        this.hit(b, base * mult, st.dtype, t);
      }
      if (any) this.fx({ type: 'pulse', x: t.x, y: t.y, r: st.global ? 0 : st.range, cat: card.cat });
    }

    // ------------------------------------------------------------ step
    step(dt) {
      if (this.phase !== 'running') { this.ageEffects(); return; }
      this.time += dt; this.roundTime += dt;
      const now = this.time;

      // spawn
      while (this.spawnIdx < this.spawns.length && this.spawns[this.spawnIdx].t <= this.roundTime) {
        const s = this.spawns[this.spawnIdx++];
        this.spawn(s.kind, s.v, s.mods, 0);
      }

      // positions
      for (const b of this.bills) { const p = P.posAt(b.dist); b.x = p.x; b.y = p.y; b.a = p.a; }

      // stats at the current tier, once per step
      for (const t of this.towers) t._st = statsFor(this.card(t.cardId), t.tier);
      for (const z of this.zones) z._st = statsFor(this.card(z.cardId), z.tier);
      for (const v of this.vehicles) v._st = statsFor(this.card(v.cardId), v.tier);
      // a board-wide aura (THE STOINLY) reaches vehicles and places too; towers get it through auraFor
      let gdmg = 1;
      for (const t of this.towers) if (t._st.global && t._st.auraAll) gdmg += t._st.auraDmg || 0;
      const zdmg = this.buff('dmg') * gdmg;

      // towers
      const rateBuff = this.buff('rate');
      for (const t of this.towers) {
        const card = this.card(t.cardId);
        const st = t._st;
        if (st.pulseEvery) {
          if (now >= t.pulseAt) { const aura = this.auraFor(t); this.pulse(t, st, card, aura); t.pulseAt = now + st.pulseEvery / (rateBuff * aura.rate); }
          continue;
        }
        t.cd -= dt;
        if (t.cd > 0) continue;
        const aura = this.auraFor(t);
        if (this.towerShoot(t, st, card)) t.cd = 1 / (st.rate * aura.rate * rateBuff);
        else t.cd = 0.05;
      }

      // vehicles (DRINK A MONSTER shortens the gap between hits and speeds up the patrol)
      for (const v of this.vehicles) {
        const st = v._st;
        const cd = st.cd / rateBuff;
        if (v.stationary) {
          for (const b of this.bills) {
            if (b.dead || b.mods.crypto) continue;
            if (Math.abs(b.dist - v.s) > st.len / 2) continue;
            if ((b.hits[v.uid] || -9) + cd > now) continue;
            b.hits[v.uid] = now;
            this.hit(b, st.dmg * zdmg, 'force', v);
            if (st.stun && this.stoppable(b)) b.stunUntil = Math.max(b.stunUntil, now + st.stun);
          }
          continue;
        }
        if (st.stopEvery) {
          if (now < v.stoppedUntil) {
            for (const b of this.bills) {
              if (b.dead || b.mods.crypto || Math.abs(b.dist - v.s) > st.stopRadius) continue;
              if (this.stoppable(b)) b.holdUntil = Math.max(b.holdUntil, now + 0.1);
              if (st.stopDmg && !b.hits['stop' + v.uid + ':' + v.stopAt]) { b.hits['stop' + v.uid + ':' + v.stopAt] = 1; this.hit(b, st.stopDmg * zdmg, 'force', v); }
            }
          } else if (now >= v.stopAt) {
            v.stoppedUntil = now + st.stopDur; v.stopAt = now + st.stopEvery;
            this.fx({ type: 'busstop', x: v.x, y: v.y, r: st.stopRadius });
          }
        }
        if (now >= v.stoppedUntil) {
          v.s += v.dir * st.speed * rateBuff * dt;
          if (v.s > v.s1) { v.s = v.s1; v.dir = -1; }
          if (v.s < v.s0) { v.s = v.s0; v.dir = 1; }
        }
        const p = P.posAt(v.s); v.x = p.x; v.y = p.y; v.a = p.a;
        for (const b of this.bills) {
          if (b.dead || b.mods.crypto) continue;
          if (Math.abs(b.dist - v.s) > 22) continue;
          if ((b.hits[v.uid] || -9) + cd > now) continue;
          b.hits[v.uid] = now;
          this.hit(b, st.dmg * zdmg, 'force', v);
        }
      }

      // zones: entry / exit / inside
      for (const z of this.zones) {
        const st = z._st;
        const half = z.len / 2;
        for (const b of this.bills) {
          if (b.dead) continue;
          if (b.mods.crypto && !st.sees) continue;
          const inside = Math.abs(b.dist - z.s) <= half;
          const was = !!b.inZone[z.uid];
          if (inside && !was) {
            b.inZone[z.uid] = true;
            if (st.hold && this.stoppable(b)) b.holdUntil = Math.max(b.holdUntil, now + st.hold);
            if (st.strip) {
              const had = b.mods.crypto || b.mods.strapped || b.mods.accruing || b.mods.check;
              b.mods.crypto = b.mods.strapped = b.mods.accruing = b.mods.check = false;
              if (had) this.fx({ type: 'clean', x: b.x, y: b.y });
            }
            if (st.toll) this.hit(b, st.toll * zdmg, 'transaction', z);
            if (st.pct) this.hit(b, Math.max(1, b.value * st.pct) * zdmg, 'transaction', z);
            b.dotAt = now + (st.dotEvery || 0) / rateBuff;
          } else if (!inside && was) {
            b.inZone[z.uid] = false;
            if (st.tollExit && st.toll) this.hit(b, st.toll * zdmg, 'transaction', z);
            if (st.soggy) { b.soggyUntil = now + st.soggy; b.soggyAll = !!st.soggyAll; }
          } else if (inside && st.dotDmg && now >= b.dotAt) {
            b.dotAt = now + st.dotEvery / rateBuff;
            this.hit(b, st.dotDmg * zdmg, 'transaction', z);
          }
        }
      }

      // bills move
      for (const b of this.bills) {
        if (b.dead) continue;
        if (b.mods.accruing && now >= b.accrueAt) {
          b.accrueAt = now + 2.5;
          if (b.value < b.max) { b.value = Math.min(b.max, b.value + Math.ceil(b.max * 0.1)); this.fx({ type: 'accrue', x: b.x, y: b.y }); }
        }
        if (now < b.stunUntil || now < b.holdUntil) continue;
        let f = MONEY.baseSpeed * MONEY.speedFor(b.kind, b.value, b.mods);
        let slow = 1, dir = 1;
        for (const z of this.zones) {
          const st = z._st;
          if (st.slow && Math.abs(b.dist - z.s) <= z.len / 2 && (!b.mods.crypto || st.sees)) slow = Math.min(slow, st.slow);
        }
        for (const c of this.clouds) {
          if (Math.abs(b.dist - c.s) > c.len / 2) continue;
          if (c.slow < 1) slow = Math.min(slow, c.slow);
          if (c.reverse) { if (this.stoppable(b)) b.reverseUntil = Math.max(b.reverseUntil || 0, c.until); else slow = Math.min(slow, 0.5); }
        }
        if (b.reverseUntil > now) dir = -1;
        for (const t of this.towers) {
          const st = t._st;
          if (!st.slowAura) continue;
          if (b.mods.crypto && !st.sees) continue;
          if (Math.hypot(b.x - t.x, b.y - t.y) <= st.range + BILL_R) slow = Math.min(slow, st.slowAura);
        }
        b.dist += f * slow * dir * dt;
        if (b.dist < 0) b.dist = 0;
        if (b.dist >= P.length) this.leak(b);
      }

      // sweep
      if (this.bills.some(b => b.dead)) this.bills = this.bills.filter(b => !b.dead);
      this.clouds = this.clouds.filter(c => c.until > now);
      this.ageEffects();

      if (this.phase === 'running' && this.spawnIdx >= this.spawns.length && this.bills.length === 0) this.endRound();
    }

    ageEffects() {
      if (this.effects.length > 400) this.effects.splice(0, this.effects.length - 400);
    }
    takeEffects() { const e = this.effects; this.effects = []; return e; }
    takeNotices() { const n = this.notices; this.notices = []; return n; }

    // ------------------------------------------------------------ save
    toJSON() {
      return {
        v: 1, seed: this.seed, round: this.round, room: this.room, gum: this.gum, gumFrac: this.gumFrac, given: this.given,
        hand: this.hand, towers: this.towers.map(t => ({ uid: t.uid, cardId: t.cardId, tier: t.tier, x: t.x, y: t.y, target: t.target, given: t.given, spent: t.spent })),
        zones: this.zones.map(z => ({ uid: z.uid, cardId: z.cardId, tier: z.tier, s: z.s, len: z.len, given: z.given, spent: z.spent, x: z.x, y: z.y, side: z.side })),
        vehicles: this.vehicles.map(v => ({ uid: v.uid, cardId: v.cardId, tier: v.tier, s: v.s, s0: v.s0, s1: v.s1, stationary: v.stationary, len: v.len, given: v.given, spent: v.spent, x: v.x, y: v.y, dir: v.dir, stopAt: v.stopAt, stoppedUntil: v.stoppedUntil })),
        packsOpened: this.packsOpened, seen: this.seen, stats: this.stats, nextUid: this.nextUid, time: this.time, autostart: this.autostart, rngState: this.rng.box.s,
      };
    }
    static fromJSON(j) {
      const s = new Sim(j.seed);
      s.round = j.round; s.room = j.room; s.gum = j.gum; s.gumFrac = j.gumFrac || 0; s.given = j.given || 0;
      s.hand = j.hand || [];
      s.towers = (j.towers || []).map(t => Object.assign({ cd: 0, pulseAt: 0 }, t));
      s.zones = j.zones || [];
      s.vehicles = (j.vehicles || []).map(v => Object.assign({ dir: 1, stopAt: 0, stoppedUntil: 0 }, v));
      s.packsOpened = j.packsOpened || 0; s.seen = j.seen || {}; s.stats = Object.assign(s.stats, j.stats || {});
      s.nextUid = j.nextUid || 1000; s.time = j.time || 0; s.autostart = !!j.autostart;
      // advance the rng so a reload does not replay the same packs
      // continue the same random stream, so a reload draws the pack the player would have drawn anyway
      s.rng = j.rngState != null ? mulberry32(j.rngState, { s: j.rngState }) : mulberry32((j.seed ^ (s.packsOpened * 2654435761)) >>> 0);
      s.phase = s.round > D.WAVES.length ? 'won' : 'idle';
      return s;
    }
  }

  function fmt(n) {
    n = Math.round(n);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  AF.Sim = Sim;
  AF.statsFor = statsFor;
  AF.fmt = fmt;
  AF.BILL_R = BILL_R;
  AF.TOWER_R = TOWER_R;
})(typeof window !== 'undefined' ? (window.AF = window.AF || {}) : (global.AF = global.AF || {}));
