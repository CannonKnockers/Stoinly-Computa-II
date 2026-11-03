/* ACCOUNT FULL — interface
   Everything made of DOM: the HUD, the hand, the inspect panel, the pack
   ripping screen, the binder, the menus, and the pointer handling that moves
   a card from the hand onto the board. */
(function (AF) {
  'use strict';

  const D = AF.DATA, LANES = D.LANES, ECON = D.ECON;
  const W = D.BOARD.w, H = D.BOARD.h;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = AF.fmt;
  const pad2 = n => String(n).padStart(2, '0');
  const gumText = v => (Math.floor(v) || (v % 1 ? '' : '0')) + (v % 1 ? '½' : '');

  const ICON_SOUND = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.2 5.3a6.6 6.6 0 0 1 0 9.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_MUTE = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 8l4 4M17 8l-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  let app, sim, view;
  const audio = (n, a) => AF.audio.play(n, a);

  // ---------------------------------------------------------------- keys (STOINLY NEXUS rebinding)
  // Every shortcut goes through StoinlySettings.keysFor('account-full', action, defaults). The defaults are the
  // bindings the game always had; stoinly-game.json lists the same actions and defaults for the nexus.
  const SS = window.StoinlySettings || null;
  const GAME_ID = 'account-full';
  const KEY_ACTIONS = [
    { id: 'speed', label: 'game speed', defaults: ['Space'] },
    { id: 'start', label: 'start the round', defaults: ['Enter', 'NumpadEnter'] },
    { id: 'pack', label: 'rip a pack', defaults: ['KeyP'] },
    { id: 'binder', label: 'binder', defaults: ['KeyB'] },
    { id: 'sound', label: 'sound', defaults: ['KeyM'] },
    { id: 'back', label: 'close or cancel', defaults: ['Escape'] },
  ];
  for (let i = 1; i <= 9; i++) KEY_ACTIONS.push({ id: 'hand' + i, label: 'pick card ' + i + ' from your hand', defaults: ['Digit' + i, 'Numpad' + i] });
  const binds = {};
  function loadBinds() {
    for (const a of KEY_ACTIONS) binds[a.id] = SS ? SS.keysFor(GAME_ID, a.id, a.defaults) : a.defaults.slice();
    renderKeyHints();
  }
  const bound = (action, code) => !!code && (binds[action] || []).includes(code);
  function keyLabel(code) {
    if (!code) return '?';
    const fixed = { Space: 'Space', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', ArrowLeft: '\u2190', ArrowRight: '\u2192', ArrowUp: '\u2191', ArrowDown: '\u2193', Backspace: 'Backspace', Tab: 'Tab' };
    if (fixed[code]) return fixed[code];
    let m = /^Key([A-Z])$/.exec(code) || /^Digit([0-9])$/.exec(code);
    if (m) return m[1];
    if ((m = /^Numpad([0-9])$/.exec(code))) return 'Num ' + m[1];
    return code.replace(/(Left|Right)$/, ' $1');
  }
  const kbd = action => '<kbd>' + esc(keyLabel((binds[action] || [])[0])) + '</kbd>';
  // the key line in the pause menu and the HUD tooltips show the keys actually bound
  function renderKeyHints() {
    const el = $('menuKeys'); if (!el) return;
    const handDefault = KEY_ACTIONS.filter(a => /^hand/.test(a.id)).every(a => (binds[a.id] || [])[0] === a.defaults[0]);
    const hand = handDefault ? kbd('hand1') + '\u2013' + kbd('hand9') : [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => kbd('hand' + i)).join(' ');
    el.innerHTML = kbd('speed') + ' game speed · ' + kbd('start') + ' start the round · ' + kbd('pack') + ' rip a pack · ' + kbd('binder') + ' binder · ' +
      kbd('sound') + ' sound · ' + kbd('back') + ' close or cancel · ' + hand + ' pick a card from your hand';
    $('btnSpeed').title = 'Game speed (' + keyLabel(binds.speed[0]) + ')';
    $('btnSound').title = 'Sound (' + keyLabel(binds.sound[0]) + ')';
    $('btnMenu').title = 'Menu (' + keyLabel(binds.back[0]) + ')';
  }

  // ---------------------------------------------------------------- card element
  function cardEl(card, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'tcard rarity-' + card.rarity + ' cat-' + card.cat;
    el.style.setProperty('--plate', LANES[card.cat].plate);
    el.style.setProperty('--plate-role', LANES[card.cat].role);
    if (opts.cw) el.style.setProperty('--cw', opts.cw + 'px');
    const pips = opts.tier ? '<div class="tcard-tier">' + '<i></i>'.repeat(opts.tier) + '</div>' : '';
    el.innerHTML =
      '<div class="tcard-face"><div class="tcard-frame">' +
        '<div class="tcard-topbar"><span>#' + pad2(card.num) + '/33</span><span class="series">SERIES 1</span></div>' +
        '<div class="tcard-raritychip">' + D.RARITY[card.rarity].label + '</div>' + pips +
        '<div class="tcard-art"><img src="' + card.img + '" alt="" style="object-position:' + card.pos + '" draggable="false"></div>' +
        '<div class="tcard-nameplate"><span class="tcard-name">' + esc(card.name) + '</span><span class="tcard-role">' + esc(card.role) + '</span></div>' +
        '<div class="tcard-credit">' + esc(card.credit) + '</div>' +
      '</div></div><div class="tcard-foil"></div>';
    return el;
  }
  // the back is a cosmetic: whichever one is equipped, unless a variant is asked for (the collection previews)
  function backEl(variant) {
    const el = document.createElement('div');
    el.className = 'tcard-back v-' + (variant || AF.meta.equipped('back'));
    el.innerHTML = '<div class="tback-frame"><div class="tback-word">STOINLY</div><img class="tback-moon" src="assets/photos/stoinly-moon.png" alt="" draggable="false"><div class="tback-sub">SERIES 1</div><div class="tback-tiny">GUM NOT INCLUDED</div></div>';
    return el;
  }
  function flipEl(card) {
    const el = document.createElement('div');
    el.className = 'flip';
    const inner = document.createElement('div');
    inner.className = 'flip-inner';
    inner.appendChild(cardEl(card));
    inner.appendChild(backEl());
    el.appendChild(inner);
    return el;
  }

  // ---------------------------------------------------------------- screens
  // While any screen is open the game underneath is paused and inert: it can take neither focus nor clicks.
  const SCREENS = ['screenTitle', 'screenHelp', 'screenPack', 'screenBinder', 'screenMenu', 'screenEnd', 'screenCollection', 'screenChest'];
  function anyScreenOpen() { return SCREENS.some(id => !$(id).hidden); }
  function syncScreens() { const open = anyScreenOpen(); app.paused = open; $('app').inert = open; }
  function showScreen(id) { $(id).hidden = false; syncScreens(); }
  function hideScreen(id) { $(id).hidden = true; syncScreens(); }
  function hideAllScreens() { SCREENS.forEach(id => { $(id).hidden = true; }); syncScreens(); }

  // ---------------------------------------------------------------- toasts
  function toast(text, kind) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, kind === 'intro' ? 7000 : 3500);
  }

  // ---------------------------------------------------------------- HUD
  const hudState = {};
  // the HUD numbers tick toward their value instead of jumping
  let cRoom = null, cGum = null, cGiven = null;
  function resetHud() {
    for (const k of Object.keys(hudState)) delete hudState[k];
    cRoom = AF.juice.counter($('hudRoom'), v => '$' + fmt(v));
    cGum = AF.juice.counter($('hudGum'), v => String(v), { dur: 300 });
    cGiven = AF.juice.counter($('hudGiven'), v => '$' + fmt(v));
  }
  function refreshHud() {
    if (!sim) return;
    if (hudState.round !== sim.round) { const first = hudState.round == null; hudState.round = sim.round; $('hudRound').textContent = Math.min(sim.round, D.WAVES.length); if (!first) AF.juice.pulse($('hudRound'), 'bump'); }
    if (hudState.room !== sim.room) {
      const first = hudState.room == null, hurt = !first && sim.room < hudState.room;
      hudState.room = sim.room;
      const el = $('hudRoom'); cRoom.set(sim.room, first);
      if (hurt) { AF.juice.pulse(el, 'hurt'); AF.juice.pulse($('hudRoomBox'), 'hurt'); }
      const frac = sim.room / ECON.roomMax;
      el.classList.toggle('low', frac < 0.25);
      const bar = $('hudRoomBar'); bar.style.transform = 'scaleX(' + frac + ')';
      bar.className = frac < 0.25 ? 'low' : frac < 0.55 ? 'mid' : '';
    }
    const gum = Math.floor(sim.gum);
    if (hudState.gum !== gum) {
      // gains are shown when the coins land (see coinsTo); spending shows at once
      if (hudState.gum == null || gum < hudState.gum || !coinsInFlight) cGum.set(gum, hudState.gum == null);
      hudState.gum = gum;
    }
    const given = Math.round(sim.given);
    if (hudState.given !== given) { const first = hudState.given == null; hudState.given = given; cGiven.set(given, first); }
    const cost = sim.packCost();
    const over = sim.phase === 'won' || sim.phase === 'lost';
    if (hudState.cost !== cost || hudState.canPack !== (gum >= cost && !over)) {
      hudState.cost = cost; hudState.canPack = gum >= cost && !over;
      $('packCost').textContent = cost === 0 ? 'FREE' : cost + ' GUM';
      $('btnPack').disabled = !hudState.canPack;
    }
    if (hudState.phase !== sim.phase) {
      hudState.phase = sim.phase;
      const b = $('btnStart');
      b.hidden = sim.phase !== 'idle';
      b.textContent = 'START ROUND ' + sim.round;
      refreshInspect();
    }
    if (hudState.speed !== app.speed) {
      hudState.speed = app.speed;
      $('btnSpeed').textContent = app.speed + '×';
      $('btnMenuSpeed').textContent = 'SPEED ' + app.speed + '×';
    }
    const snd = !AF.audio.silent;
    if (hudState.sound !== snd) {
      hudState.sound = snd;
      $('btnSound').innerHTML = snd ? ICON_SOUND : ICON_MUTE;
      $('btnSound').setAttribute('aria-label', snd ? 'Sound on' : 'Sound off');
      $('btnMenuSound').textContent = snd ? 'SOUND ON' : 'SOUND OFF';
    }
    const sig = sim.hand.map(h => h.uid + ':' + h.tier).join(',') + '|' + (view.selectedHand || '');
    if (hudState.hand !== sig) { hudState.hand = sig; renderHand(); }
    updateInspect();
  }

  // ---------------------------------------------------------------- hand
  // identical cards (same card, same tier) share one slot with a count
  function handGroups() {
    const groups = [], byKey = new Map();
    for (const h of sim.hand) {
      const key = h.cardId + ':' + (h.tier || 0);
      let g = byKey.get(key);
      if (!g) { g = { cardId: h.cardId, tier: h.tier || 0, uids: [] }; byKey.set(key, g); groups.push(g); }
      g.uids.push(h.uid);
    }
    return groups;
  }
  function renderHand() {
    const hand = $('hand');
    hand.innerHTML = '';
    if (!sim.hand.length) {
      const e = document.createElement('div'); e.className = 'hand-empty';
      e.textContent = sim.packsOpened === 0 ? 'No cards yet. Rip the free pack.' : 'No cards in hand. Rip a pack, or pick one up from the board between rounds.';
      hand.appendChild(e); syncHandFade(); return;
    }
    handGroups().forEach((g, i) => {
      const card = D.CARD_BY_ID[g.cardId];
      const el = cardEl(card, { tier: g.tier });
      el.dataset.uid = g.uids[0];
      el.title = card.name + (i < 9 ? '  (' + (i + 1) + ')' : '');
      el.tabIndex = 0;
      if (g.uids.length > 1) { const n = document.createElement('span'); n.className = 'tcard-count'; n.textContent = '×' + g.uids.length; el.appendChild(n); }
      if (g.uids.includes(view.selectedHand)) el.classList.add('selected');
      el.addEventListener('pointerdown', onHandPointerDown);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectHand(g.uids[0]); } });
      hand.appendChild(el);
    });
    syncHandFade();
  }
  // on a phone held sideways the hand is a column at the right; everywhere else it is a row
  function handVertical() { return getComputedStyle($('hand')).flexDirection === 'column'; }
  function syncHandFade() {
    const hand = $('hand');
    const more = handVertical() ? hand.scrollHeight - hand.clientHeight - hand.scrollTop > 4 : hand.scrollWidth - hand.clientWidth - hand.scrollLeft > 4;
    $('tray').classList.toggle('more', more);
  }

  function selectHand(uid) {
    const h = sim.hand.find(h => h.uid === uid);
    if (!h) return;
    view.selectedHand = uid; view.selected = null; view.placing = { uid, cardId: h.cardId };
    hudState.hand = '';
    showInspectHand(h);
  }
  function clearPlacing() { view.placing = null; view.ghost = null; view.selectedHand = null; hudState.hand = ''; }

  // ---------------------------------------------------------------- drag from hand
  let drag = null;
  function boardPoint(clientX, clientY) {
    const r = $('board').getBoundingClientRect();
    const x = (clientX - r.left) * W / r.width, y = (clientY - r.top) * H / r.height;
    // on a phone the board can be wider than the screen; only the visible part counts
    const s = $('boardWrap').getBoundingClientRect();
    const inside = clientX >= Math.max(r.left, s.left) && clientX <= Math.min(r.right, s.right) && clientY >= Math.max(r.top, s.top) && clientY <= Math.min(r.bottom, s.bottom);
    return { x, y, inside };
  }
  function overTrade(clientX, clientY) {
    const r = $('tradeSlot').getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }
  function onHandPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (drag) return;                                   // one card at a time, whatever the number of fingers
    const uid = +e.currentTarget.dataset.uid;
    const h = sim.hand.find(h => h.uid === uid); if (!h) return;
    drag = { uid, cardId: h.cardId, tier: h.tier || 0, sx: e.clientX, sy: e.clientY, moved: false, el: e.currentTarget, pid: e.pointerId, ghost: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    AF.audio.unlock();
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.moved) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.hypot(dx, dy) < 8) return;
      // a touch drag along the hand is the hand being scrolled, not a card being picked up
      const along = handVertical() ? Math.abs(dy) > Math.abs(dx) * 1.2 : Math.abs(dx) > Math.abs(dy) * 1.2;
      if (e.pointerType === 'touch' && along) { drag = null; return; }
      drag.moved = true;
      drag.el.classList.add('dragging');
      const g = document.createElement('div'); g.className = 'drag-ghost';
      g.appendChild(cardEl(D.CARD_BY_ID[drag.cardId]));
      document.body.appendChild(g); drag.ghost = g;
      view.placing = null;
      hideInspect();
    }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    const bp = boardPoint(e.clientX, e.clientY);
    if (bp.inside) { view.ghost = Object.assign({ cardId: drag.cardId }, sim.previewPlacement(drag.cardId, bp.x, bp.y, drag.tier)); drag.ghost.style.opacity = '0.35'; }
    else { view.ghost = null; drag.ghost.style.opacity = '1'; }
    $('tradeSlot').classList.toggle('over', overTrade(e.clientX, e.clientY));
  }
  function endDrag() {
    if (!drag) return null;
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    d.el.classList.remove('dragging');
    $('tradeSlot').classList.remove('over');
    view.ghost = null;
    return d;
  }
  function onPointerCancel(e) { if (!drag || e.pointerId !== drag.pid) return; const d = endDrag(); if (d && d.moved) clearPlacing(); }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = endDrag();
    if (!d.moved) { if (view.selectedHand === d.uid) { clearPlacing(); hideInspect(); } else selectHand(d.uid); return; }
    clearPlacing();
    if (overTrade(e.clientX, e.clientY)) { doTrade(d.uid); return; }
    const bp = boardPoint(e.clientX, e.clientY);
    if (bp.inside) placeCard(d.uid, bp.x, bp.y);
  }
  function placeCard(uid, x, y) {
    const card = D.CARD_BY_ID[(sim.hand.find(h => h.uid === uid) || {}).cardId];
    if (!card) return false;
    const r = sim.placeFromHand(uid, x, y);
    if (!r.ok) { toast(r.reason || 'CANNOT GO THERE', 'bad'); audio('deny'); return false; }
    if (r.kind === 'action') { audio('action'); if (card.rarity === 'ultra') audio('holo'); }
    clearPlacing(); hideInspect();
    if (r.uid) { const obj = sim.findPlaced(r.uid); if (obj) selectPlaced(obj); }
    app.save();
    return true;
  }
  function doTrade(uid) {
    const r = sim.tradeIn(uid);
    if (!r.ok) return;
    toast('Traded ' + r.card.name + ' for ' + gumText(r.value) + ' gum.', 'good');
    audio('pick');
    clearPlacing(); hideInspect(); app.save();
  }

  // ---------------------------------------------------------------- board input
  let boardDown = null;
  function onBoardDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (boardDown) return;
    boardDown = { x: e.clientX, y: e.clientY, pid: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}   // the release counts even off the canvas
    AF.audio.unlock();
  }
  function onBoardMove(e) {
    if (drag) return;
    const bp = boardPoint(e.clientX, e.clientY);
    if (view.placing) { if (e.pointerType === 'mouse') { const ph = sim.hand.find(h => h.uid === view.placing.uid); view.ghost = Object.assign({ cardId: view.placing.cardId }, sim.previewPlacement(view.placing.cardId, bp.x, bp.y, ph && ph.tier)); } return; }
    if (e.pointerType === 'mouse') view.hover = AF.render.hitTest(sim, bp.x, bp.y);
  }
  function onBoardUp(e) {
    if (!boardDown || e.pointerId !== boardDown.pid) return;
    const moved = Math.hypot(e.clientX - boardDown.x, e.clientY - boardDown.y) > 8;
    boardDown = null;
    if (moved) return;
    const bp = boardPoint(e.clientX, e.clientY);
    if (view.placing) { placeCard(view.placing.uid, bp.x, bp.y); return; }
    const hit = AF.render.hitTest(sim, bp.x, bp.y);
    if (hit) selectPlaced(hit); else { view.selected = null; hideInspect(); }
  }
  function onBoardLeave() { view.hover = null; if (view.placing) view.ghost = null; }

  // ---------------------------------------------------------------- inspect
  let inspectRef = null, inspectLive = null;
  function selectPlaced(obj) { view.selected = obj; view.selectedHand = null; view.placing = null; view.ghost = null; hudState.hand = ''; showInspectPlaced(obj); }
  function setInspectOpen(open) {
    $('inspect').hidden = !open; $('stage').classList.toggle('inspect-open', open);
    if (open) { const body = $('inspect').querySelector('.inspect-body'); body.scrollTop = 0; syncInspectFade(); }
  }
  // fade the bottom edge of the panel body only while there is more to scroll to
  function syncInspectFade() {
    const body = $('inspect').querySelector('.inspect-body');
    body.classList.toggle('scrolls', body.scrollHeight - body.clientHeight - body.scrollTop > 4);
  }
  function hideInspect() { setInspectOpen(false); inspectRef = null; inspectLive = null; }
  function refreshInspect() { if (!inspectRef) return; if (inspectRef.placed) { if (sim.findPlaced(inspectRef.placed.uid)) showInspectPlaced(inspectRef.placed); else hideInspect(); } else showInspectHand(inspectRef.hand); }
  // called every frame: only touches what can change while the panel is open
  function updateInspect() {
    if (!inspectLive) return;
    const { obj, upgradeBtn, givenDd } = inspectLive;
    if (upgradeBtn) { const cost = sim.upgradeCost(obj); const dis = cost == null || sim.gum < cost; if (upgradeBtn.disabled !== dis) upgradeBtn.disabled = dis; }
    if (givenDd) { const t = '$' + fmt(obj.given || 0); if (givenDd.textContent !== t) givenDd.textContent = t; }
  }

  function statRows(card, st, obj) {
    const rows = [];
    const dt = { force: 'FORCE', transaction: 'SPENDING', void: 'NOT FORCE' };
    if (card.kind === 'tower') {
      rows.push(['RANGE', st.global ? 'THE WHOLE BOARD' : st.range]);
      if (st.rate) rows.push(['RATE', st.rate.toFixed(1) + ' / S']);
      if (st.pulseEvery) rows.push(['EVERY', st.pulseEvery + ' S']);
      if (st.pct) rows.push(['HIT', Math.round(st.pct * 100) + '% (MIN $' + st.pctMin + ')']);
      else if (st.pulsePct) rows.push(['HIT', Math.round(st.pulsePct * 100) + '% OF EVERYTHING']);
      else if (st.splitShare) rows.push(['HIT', Math.round(st.splitShare * 100) + '%, THEN ' + st.splitN + ' PIECES']);
      else if (st.dmg) rows.push(['HIT', '$' + st.dmg]);
      rows.push(['TYPE', dt[st.dtype]]);
      if (st.multi > 1) rows.push(['TARGETS', st.multi + ' AT ONCE']);
      if (st.chain) rows.push(['CHAIN', 'JUMPS TO ' + st.chain]);
      if (st.slowAura) rows.push(['SLOWS', 'TO ' + Math.round(st.slowAura * 100) + '%']);
      if (st.pulseStun) rows.push(['STOPS', st.pulseStun + ' S']);
      if (st.auraRate || st.auraDmg) rows.push(['AURA', '+' + Math.round((st.auraDmg || 0) * 100) + '% ' + (st.global ? 'EVERY CARD' : st.auraAll ? 'EVERY CARD IN RANGE' : 'STRONG WOMEN')]);
      if (st.sees) rows.push(['SEES', 'CRYPTO']);
    } else if (card.kind === 'zone') {
      rows.push(['LENGTH', st.len]);
      if (st.toll) rows.push(['TOLL', '$' + st.toll + (st.tollExit ? ' IN AND OUT' : '')]);
      if (st.pct) rows.push(['CUT', Math.round(st.pct * 100) + '%']);
      if (st.slow) rows.push(['SPEED', Math.round(st.slow * 100) + '%']);
      if (st.hold) rows.push(['HOLD', st.hold + ' S']);
      if (st.dotDmg) rows.push(['INSIDE', '$' + st.dotDmg + ' / ' + st.dotEvery + ' S']);
      if (st.soggy) rows.push(['SOGGY', st.soggy + ' S']);
      if (st.strip) rows.push(['CLEANS', 'CRYPTO · STRAP · INTEREST · CHECKS']);
      rows.push(['TYPE', 'SPENDING']);
      if (st.sees) rows.push(['SEES', 'CRYPTO']);
    } else if (card.kind === 'vehicle') {
      if (st.stationary) rows.push(['COVERS', st.len]); else { rows.push(['PATROL', st.seg]); rows.push(['SPEED', st.speed]); }
      rows.push(['HIT', '$' + st.dmg + ' / ' + st.cd + ' S']);
      if (st.stun) rows.push(['STOPS', st.stun + ' S']);
      if (st.stopEvery) rows.push(['BUS STOP', 'EVERY ' + st.stopEvery + ' S, ' + st.stopDur + ' S' + (st.stopDmg ? ', $' + st.stopDmg : '')]);
      rows.push(['TYPE', 'FORCE']);
    }
    if (obj) rows.push(['GIVEN AWAY', '$' + fmt(obj.given || 0), 'given']);
    return rows;
  }
  function rowsHtml(rows) { return rows.map(r => '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' data-k="' + r[2] + '"' : '') + '>' + esc(r[1]) + '</dd>').join(''); }

  function fillInspectCommon(card, tier) {
    const box = $('inspectCard'); box.innerHTML = ''; box.appendChild(cardEl(card, { tier }));
    $('inspectName').textContent = card.name;
    $('inspectRole').textContent = card.role;
    const lane = $('inspectLane'); lane.textContent = LANES[card.cat].label; lane.style.color = LANES[card.cat].color;
    $('inspectBlurb').textContent = card.blurb;
  }
  function tiersHtml(card, tier, nextCost) {
    if (!card.tiers) return '';
    return card.tiers.map((t, i) => {
      const cls = i < tier ? 'done' : i === tier ? 'next' : '';
      const tag = i < tier ? 'OWNED' : i === tier && nextCost != null ? nextCost + ' GUM' : '';
      return '<div class="tier ' + cls + '"><span class="n">' + ['I', 'II'][i] + '</span><span class="tx"><span class="nm">' + esc(t.name) + '</span> <span class="bl">' + esc(t.blurb) + '</span></span><span class="n tag">' + tag + '</span></div>';
    }).join('');
  }

  function showInspectPlaced(obj) {
    inspectRef = { placed: obj };
    const card = D.CARD_BY_ID[obj.cardId];
    const st = AF.statsFor(card, obj.tier);
    fillInspectCommon(card, obj.tier);
    $('inspectStats').innerHTML = rowsHtml(statRows(card, st, obj));
    const tg = $('inspectTarget');
    if (card.kind === 'tower' && !st.pulseEvery) {
      tg.innerHTML = '<div class="target-row"><div class="label">TARGET</div><div class="seg">' + ['first', 'last', 'strong', 'weak'].map(m => '<button data-m="' + m + '" class="' + (obj.target === m ? 'on' : '') + '">' + m.toUpperCase() + '</button>').join('') + '</div></div>';
      tg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { sim.setTarget(obj.uid, b.dataset.m); audio('click'); showInspectPlaced(obj); app.save(); }));
    } else tg.innerHTML = '';
    const cost = sim.upgradeCost(obj);
    $('inspectTiers').innerHTML = tiersHtml(card, obj.tier, cost);
    const acts = $('inspectActions'); acts.innerHTML = '';
    let upgradeBtn = null;
    if (card.tiers) {
      const b = document.createElement('button'); b.className = 'btn btn-primary';
      if (cost == null) { b.textContent = 'FULLY UPGRADED'; b.disabled = true; }
      else { b.textContent = 'UPGRADE · ' + cost + ' GUM'; b.disabled = sim.gum < cost; upgradeBtn = b; }
      b.addEventListener('click', () => { const r = sim.upgrade(obj.uid); if (!r.ok) { toast(r.reason, 'bad'); audio('deny'); } else { showInspectPlaced(obj); app.save(); } });
      acts.appendChild(b);
    }
    const pu = document.createElement('button'); pu.className = 'btn';
    pu.textContent = 'PICK UP'; pu.disabled = sim.phase !== 'idle';
    pu.addEventListener('click', () => { const r = sim.pickUp(obj.uid); if (r.ok) { audio('pick'); view.selected = null; hideInspect(); app.save(); } else toast(r.reason, 'bad'); });
    acts.appendChild(pu);
    $('inspectNote').textContent = sim.phase === 'idle' ? '' : 'Cards can be picked up between rounds.';
    inspectLive = { obj, upgradeBtn, givenDd: $('inspectStats').querySelector('dd[data-k="given"]') };
    setInspectOpen(true);
  }

  function showInspectHand(h) {
    inspectRef = { hand: h }; inspectLive = null;
    const card = D.CARD_BY_ID[h.cardId];
    const st = AF.statsFor(card, h.tier || 0);
    fillInspectCommon(card, h.tier);
    const rows = statRows(card, st, null);
    if (card.kind === 'action') rows.push(['PLAYED', card.action.target === 'track' ? 'ON THE TRACK' : 'ANYWHERE']);
    else if (card.kind === 'zone' || card.kind === 'vehicle') rows.push(['GOES', 'ON THE TRACK']);
    else rows.push(['GOES', 'NEXT TO THE TRACK']);
    $('inspectStats').innerHTML = rowsHtml(rows);
    $('inspectTarget').innerHTML = '';
    $('inspectTiers').innerHTML = tiersHtml(card, h.tier || 0, null);
    const acts = $('inspectActions'); acts.innerHTML = '';
    const waiting = card.kind === 'action' && card.action.effect !== 'room' && sim.phase !== 'running';
    const pl = document.createElement('button'); pl.className = 'btn btn-primary';
    pl.textContent = card.kind === 'action' ? (card.action.target === 'global' ? 'PLAY IT NOW' : 'PLAY: PICK A SPOT') : 'PLACE: PICK A SPOT';
    pl.disabled = waiting;
    pl.addEventListener('click', () => {
      if (card.kind === 'action' && card.action.target === 'global') { placeCard(h.uid, W / 2, H / 2); return; }
      // get out of the way of the board; the card stays selected in the hand until it is placed
      view.placing = { uid: h.uid, cardId: h.cardId }; view.selectedHand = h.uid; hudState.hand = '';
      setInspectOpen(false); inspectRef = null;
      toast('Tap the board where it goes. Esc or tap the card again to cancel.', 'info');
    });
    acts.appendChild(pl);
    const tr = document.createElement('button'); tr.className = 'btn';
    tr.textContent = 'TRADE IN · ' + gumText(ECON.tradeValue[card.rarity] + (h.tier || 0) * ECON.tradeTier) + ' GUM';
    tr.addEventListener('click', () => doTrade(h.uid));
    acts.appendChild(tr);
    $('inspectNote').textContent = waiting ? 'Action cards are played during a round.' : '';
    setInspectOpen(true);
  }

  // ---------------------------------------------------------------- pack
  // pending: the five cards pulled but not yet taken. dealt: their faces are on screen.
  let pending = null, dealt = false, flipTimers = [];
  function clearFlipTimers() { flipTimers.forEach(clearTimeout); flipTimers = []; }
  function openPack() {
    if (!sim || sim.phase === 'won' || sim.phase === 'lost') return;
    if (pending) { showScreen('screenPack'); return; }   // a pack is already open: never discard what was pulled
    const cost = sim.packCost();
    if (sim.gum < cost) { toast('Not enough gum. The next pack costs ' + cost + ' sticks.', 'bad'); audio('deny'); return; }
    dealt = false; clearFlipTimers();
    const pack = $('packEl'); pack.classList.remove('ripping'); pack.hidden = false;
    pack.className = pack.className.replace(/\bv-pack-\S+/g, '').trim() + ' v-' + AF.meta.equipped('pack');
    $('packCards').innerHTML = ''; $('packActions').hidden = true; $('btnPackLater').hidden = false;
    $('packHint').textContent = cost === 0 ? 'YOUR FIRST PACK IS FREE. CLICK IT TO RIP IT.' : 'CLICK THE PACK TO RIP IT · ' + cost + ' GUM';
    showScreen('screenPack');
    setTimeout(() => { try { pack.focus({ preventScroll: true }); } catch (_) {} }, 0);
  }
  function rip() {
    if (pending) return;
    const r = sim.ripPack();
    if (!r.ok) { toast(r.reason, 'bad'); audio('deny'); return; }
    const cards = r.cards;
    pending = cards; dealt = false;
    app.recordPulls(cards.map(h => h.cardId));
    audio('rip');
    const pack = $('packEl'); pack.classList.add('ripping');
    $('packHint').textContent = ''; $('btnPackLater').hidden = true;
    // the site's timeline: grip and shake, the lid shears off, light pours out, the pouch drops, the cards rise
    setTimeout(() => {
      if (pending !== cards) return;
      pack.hidden = true;
      const box = $('packCards'); box.innerHTML = '';
      cards.forEach((h, i) => {
        const card = D.CARD_BY_ID[h.cardId];
        const wrap = document.createElement('div'); wrap.className = 'pulled';
        const f = flipEl(card); f.style.animationDelay = (i * 70) + 'ms';
        const tag = document.createElement('div'); tag.className = 'pulled-tag';
        wrap.appendChild(f); wrap.appendChild(tag);
        f.addEventListener('click', () => flipOne(f, card, tag));
        box.appendChild(wrap);
      });
      dealt = true;
      $('packActions').hidden = false;
      $('packHint').textContent = 'CLICK A CARD TO FLIP IT';
    }, 900);
  }
  function flipOne(f, card, tag) {
    if (f.classList.contains('flipped')) return;
    f.classList.add('flipped');
    audio('flip');
    // holo and ultra pulls celebrate the way the card shop does: 80 or 180 pieces of confetti
    if (card.rarity === 'holo' || card.rarity === 'ultra') setTimeout(() => { audio('holo'); if ($('screenPack').hidden) return; AF.juice.confettiFrom(f, card.rarity === 'ultra' ? 180 : 80); AF.juice.pulse(f, 'pop'); }, 350);
    const n = app.binder[card.id] || 0;
    tag.textContent = n <= 1 ? 'NEW!' : 'YOU HAVE ' + n;
    tag.classList.toggle('new', n <= 1);
    if (n <= 1) tag.classList.add('blink');
  }
  function flipAll() {
    if (!pending || !dealt) return;
    const cards = pending;
    clearFlipTimers();
    Array.from($('packCards').children).forEach((w, i) => {
      flipTimers.push(setTimeout(() => { if (pending !== cards) return; flipOne(w.firstChild, D.CARD_BY_ID[cards[i].cardId], w.lastChild); }, i * 110));
    });
  }
  function takeCards() {
    if (!pending || !dealt) return;
    const allFlipped = Array.from($('packCards').children).every(w => w.firstChild.classList.contains('flipped'));
    if (!allFlipped) { flipAll(); return; }
    clearFlipTimers();
    sim.takeCards(pending); pending = null; dealt = false;
    hideScreen('screenPack');
    hudState.hand = '';
    if (sim.packsOpened === 1) {
      toast('Drag a card onto the board. Strong women and guests stand next to the track; places and vehicles go on it.', 'intro');
      if (window.matchMedia && window.matchMedia('(max-width: 640px) and (orientation: portrait)').matches) toast('The board is wider than your screen: swipe it sideways, or turn the phone.', 'info');
    }
    app.save();
  }

  // ---------------------------------------------------------------- binder
  function renderBinder() {
    const grid = $('binderGrid'); grid.innerHTML = '';
    let pulled = 0;
    const lanesOrder = ['strong', 'guest', 'action', 'place', 'vehicle', 'stoinly'];
    for (const lane of lanesOrder) {
      const hd = document.createElement('div'); hd.className = 'binder-lane'; hd.textContent = LANES[lane].label; hd.style.color = LANES[lane].color; grid.appendChild(hd);
      for (const card of D.CARDS.filter(c => c.cat === lane)) {
        const n = app.binder[card.id] || 0;
        const slot = document.createElement('div'); slot.className = 'binder-slot';
        if (n > 0) { pulled++; slot.appendChild(cardEl(card)); const s = document.createElement('small'); s.textContent = n > 1 ? '×' + n : ' '; slot.appendChild(s); }
        else { const l = document.createElement('div'); l.className = 'locked'; l.innerHTML = '<b>?</b><small>#' + pad2(card.num) + '<br>NOT PULLED YET</small>'; slot.appendChild(l); }
        grid.appendChild(slot);
      }
    }
    $('binderCount').textContent = pulled + '/33 PULLED';
  }

  // ---------------------------------------------------------------- help
  function renderHelp() {
    $('rules').innerHTML = D.COPY.howto.map(r => '<li>' + esc(r) + '</li>').join('');
    const PAPER = AF.render.PAPER, CHECK = AF.render.CHECK, M = D.MONEY.mods;
    const items = [
      ['$1', PAPER.fill, PAPER.ink, '', 'SINGLES', 'Fast. Not worth much. There are a lot of them.'],
      ['$100', PAPER.fillBig, PAPER.ink, '', 'HUNDREDS', 'Slow and heavy. A hit takes some off, and what is left keeps walking, a little faster.'],
      ['$20', CHECK.fill, CHECK.ink, '', 'CHECK', M.check.blurb],
      ['$20%', PAPER.fill, PAPER.ink, '', 'ACCRUING', M.accruing.blurb],
      ['$20', 'transparent', '#fff', 'border:1.5px dashed #fff', 'CRYPTO', M.crypto.blurb],
      ['$|20', PAPER.fill, PAPER.ink, '', 'STRAPPED', M.strapped.blurb],
      ['$20', PAPER.fill, PAPER.ink, 'height:13px', 'WIRE', M.wire.blurb],
      ['$1,500', '#5b3a1e', '#fff', '', 'BRIEFCASE', 'Big money. It cannot be pinned or held, only slowed. When it is emptied, the bills inside fall out. Trucks hold briefcases.'],
    ];
    $('legend').innerHTML = items.map(it => '<div class="legend-item"><i style="background:' + it[1] + ';color:' + it[2] + ';' + it[3] + '">' + esc(it[0]) + '</i><span><b>' + it[4] + '</b>' + esc(it[5]) + '</span></div>').join('');
  }

  // ---------------------------------------------------------------- end
  const later = [];      // timers that belong to whichever result or chest screen is open
  function clearLater() { later.forEach(clearTimeout); later.length = 0; }
  function after(ms, f) { later.push(setTimeout(f, ms)); }
  function starRulesHtml(have) {
    return AF.meta.STAR_RULES.map((r, i) => '<li class="' + (i < have ? 'got' : '') + '"><span class="st">' + (i < have ? '★' : '☆') + '</span>' + esc(r.text) + '</li>').join('');
  }
  function showEnd() {
    clearLater();
    const won = sim.phase === 'won';
    const res = app.endRun() || { stars: 0, unlocks: [], cleared: won ? D.WAVES.length : sim.round - 1 };
    const panel = $('screenEnd').querySelector('.panel');
    panel.classList.toggle('won', won); panel.classList.toggle('lost', !won);
    $('endTitle').textContent = won ? D.COPY.win : D.COPY.lose;
    $('endSub').textContent = (res.daily ? 'DAILY CHALLENGE · ' + AF.meta.prettyDay(res.daily) + ' · ' : '') + (won ? D.COPY.winSub : D.COPY.loseSub + ' ROUND ' + Math.min(sim.round, D.WAVES.length) + ' OF ' + D.WAVES.length + '.');
    const badge = $('endBadge');
    badge.hidden = !(res.newBest || res.newDailyBest);
    badge.textContent = res.newDailyBest ? 'NEW DAILY BEST!' : 'NEW HIGH SCORE!';
    // stars: empty first, then filled one by one with a sting each
    const stars = $('endStars');
    stars.innerHTML = '<i class="star"></i><i class="star"></i><i class="star"></i>';
    $('endRules').innerHTML = starRulesHtml(AF.juice.calm ? res.stars : 0);
    const st = sim.stats;
    const rows = [['GIVEN AWAY', sim.given, v => '$' + fmt(v)], ['ROUNDS CLEARED', res.cleared], ['BILLS FINISHED', st.finished, fmt], ['BEST COMBO', res.combo || 0, v => '×' + v], ['GOT THROUGH', st.leakedValue, v => '$' + fmt(v)], ['PACKS RIPPED', st.packs], ['CARDS PLACED', st.placed], ['UPGRADES', st.upgrades]];
    $('endStats').innerHTML = rows.map(r => '<div class="endstat"><span class="label">' + r[0] + '</span><b>0</b></div>').join('');
    const unl = $('endUnlocks');
    unl.innerHTML = '';
    (res.unlocks || []).forEach(c => unl.appendChild(cosmeticCard(c, { owned: true, fresh: true, compact: true })));
    unl.hidden = !(res.unlocks && res.unlocks.length);
    $('endStarTotal').textContent = res.total != null ? res.total : AF.meta.state.stars;
    showScreen('screenEnd');
    Array.from($('endStats').querySelectorAll('b')).forEach((b, i) => AF.juice.countUp(b, Math.round(rows[i][1]), rows[i][2] || (v => String(v)), 900 + i * 60));
    const starEls = stars.querySelectorAll('.star');
    const fill = i => {
      starEls[i].classList.add('on');
      $('endRules').children[i].classList.add('got');
      $('endRules').children[i].querySelector('.st').textContent = '★';
    };
    if (AF.juice.calm) { for (let i = 0; i < res.stars; i++) fill(i); }
    else for (let i = 0; i < res.stars; i++) after(500 + i * 450, () => { fill(i); audio('star', i); const r = starEls[i].getBoundingClientRect(); AF.juice.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 30 + i * 20, spread: 90, startVelocity: 22, colors: ['#ffd700', '#fff4a0', '#ffffff', '#ff00ff'] }); });
    const tail = 500 + res.stars * 450;
    if (res.newBest || res.newDailyBest) after(tail, () => audio('newBest'));
    if (won) after(200, () => { AF.juice.confetti({ x: innerWidth * 0.25, y: innerHeight * 0.6, count: 180, spread: 120, angle: 60 }); AF.juice.confetti({ x: innerWidth * 0.75, y: innerHeight * 0.6, count: 180, spread: 120, angle: 120 }); });
    if (res.unlocks && res.unlocks.length) after(tail + 300, () => { audio('unlock'); AF.juice.confettiFrom(unl, 80); });
  }

  // ---------------------------------------------------------------- cosmetics
  // a small preview of a cosmetic, drawn the way it shows up in play
  function cosmeticPreview(c) {
    const box = document.createElement('div'); box.className = 'cos-preview k-' + c.kind;
    if (c.kind === 'back') { const b = backEl(c.id); b.style.setProperty('--cw', '64px'); const w = document.createElement('div'); w.className = 'cos-back'; w.appendChild(b); box.appendChild(w); }
    else if (c.kind === 'board' || c.kind === 'burst') { const cv = document.createElement('canvas'); cv.width = 192; cv.height = 108; AF.render.preview(c, cv); box.appendChild(cv); }
    else if (c.kind === 'pack') { box.innerHTML = '<div class="mini-pack v-' + c.id + '"><div class="mini-crimp"></div><b>STOINLY</b><small>SERIES 1</small><div class="mini-crimp b"></div></div>'; }
    return box;
  }
  function cosmeticCard(c, opts) {
    opts = opts || {};
    const owned = opts.owned != null ? opts.owned : AF.meta.owned(c.id);
    const el = document.createElement(opts.button ? 'button' : 'div');
    el.className = 'cos-card' + (owned ? ' owned' : ' is-locked') + (owned && c.need ? ' foil' : '') + (opts.compact ? ' compact' : '');
    if (owned) el.appendChild(cosmeticPreview(c));
    else { const l = document.createElement('div'); l.className = 'cos-preview cos-silhouette'; l.innerHTML = '<b>?</b>'; el.appendChild(l); }
    const t = document.createElement('div'); t.className = 'cos-text';
    t.innerHTML = '<div class="cos-name">' + esc(owned ? c.name : '? ? ?') + '</div><div class="cos-kind">' + AF.meta.KINDS[c.kind] + '</div>' +
      '<div class="cos-need">' + esc(owned ? c.blurb : AF.meta.needText(c.need)) + '</div>';
    el.appendChild(t);
    if (opts.fresh) { const n = document.createElement('span'); n.className = 'new-badge blink'; n.textContent = 'NEW!'; el.appendChild(n); }
    if (opts.equipped) { const e = document.createElement('span'); e.className = 'eq-badge'; e.textContent = 'EQUIPPED'; el.appendChild(e); }
    return el;
  }
  function renderCollection() {
    const grid = $('collectionGrid'); grid.innerHTML = '';
    const M = AF.meta, S = M.state;
    let have = 0;
    for (const kind of Object.keys(M.KINDS)) {
      const hd = document.createElement('div'); hd.className = 'binder-lane set-divider'; hd.textContent = M.KINDS[kind]; grid.appendChild(hd);
      for (const c of M.COSMETICS.filter(c => c.kind === kind)) {
        const owned = M.owned(c.id); if (owned) have++;
        const fresh = owned && S.unlocked[c.id] && !S.unlocked[c.id].seen;
        const el = cosmeticCard(c, { owned, fresh, equipped: M.equipped(kind) === c.id, button: owned });
        if (owned) el.addEventListener('click', () => {
          M.equip(c.id); M.markSeen(c.id); audio('bounce'); applyCosmetics(); renderCollection(); renderTitleMeta();
        });
        else el.setAttribute('aria-label', 'Locked: ' + M.needText(c.need));
        grid.appendChild(el);
      }
    }
    $('collectionCount').textContent = have + '/' + M.COSMETICS.length + ' UNLOCKED · ★ ' + S.stars + ' STARS';
    $('collectionRules').innerHTML = '<div><b>STARS</b> ONE PER MILESTONE IN EVERY RUN: ' + M.STAR_RULES.map(r => '★ ' + esc(r.text)).join(' &nbsp; ') + '</div>' +
      '<div><b>DAILY CHEST</b> ONE FREE OPEN EVERY DAY: STARS OR A CHEST-ONLY COSMETIC &nbsp;·&nbsp; <b>STREAK</b> PLAY A ROUND ON CONSECUTIVE DAYS</div>';
  }
  function openCollection() { renderCollection(); showScreen('screenCollection'); }
  // leaving the collection counts as having seen what is new
  function closeCollection() {
    for (const [id, u] of Object.entries(AF.meta.state.unlocked)) if (!u.seen) AF.meta.markSeen(id);
    hideScreen('screenCollection'); renderTitleMeta();
  }
  function applyCosmetics() {
    document.documentElement.dataset.board = AF.meta.equipped('board');
    AF.render.setTheme();
  }

  // ---------------------------------------------------------------- title meta: streak, stars, chest, daily
  function renderTitleMeta() {
    const M = AF.meta;
    const streak = M.streakNow();
    $('metaStreakN').textContent = streak;
    $('metaStreak').classList.toggle('cold', streak === 0);
    $('metaStars').textContent = M.state.stars;
    const ready = M.chestReady();
    $('btnChest').classList.toggle('ready', ready);
    $('chestLbl').innerHTML = ready ? '<b class="blink">FREE!</b> DAILY CHEST' : 'CHEST OPENED<br><small>NEXT ONE TOMORROW</small>';
    const d = M.dailyToday();
    $('dailyInfo').textContent = M.prettyDay(M.today()) + (d && d.runs ? ' · BEST: ROUND ' + d.cleared + ' · $' + fmt(d.given) : ' · NOT PLAYED YET');
    const n = M.newCount();
    const nb = $('collectionNew'); nb.hidden = !n; nb.textContent = n + ' NEW!';
    const lines = ['*** WELCOME TO ACCOUNT FULL ***', 'THE BANK SAID THE ACCOUNT IS FULL', '★ ' + M.state.stars + ' STARS COLLECTED'];
    if (streak > 0) lines.push('DAILY STREAK ' + streak + (streak >= 3 ? ' — ON FIRE' : ''));
    if (ready) lines.push('YOUR FREE DAILY CHEST IS WAITING');
    if (M.state.runs.bestCleared) lines.push('HIGH SCORE: ROUND ' + M.state.runs.bestCleared + ' · $' + fmt(M.state.runs.bestGiven) + ' GIVEN AWAY');
    lines.push('TODAY’S DAILY CHALLENGE: SAME PACKS FOR EVERYBODY');
    lines.push('GUM NOT INCLUDED');
    AF.juice.renderTicker('titleTicker', lines);
    AF.juice.renderTicker('titleTicker2', ['STOINLY TRADING CARDS · SERIES 1', 'FREE MONEY AT STOINLY DOT COMPUTER ON THE INTERNET', 'IT WAS FREE', 'THE STOINLY IS REAL']);
  }

  // ---------------------------------------------------------------- daily chest
  let chestTaps = 0, chestBusy = false;
  function openChestScreen() {
    clearLater();
    chestTaps = 0; chestBusy = false;
    const ready = AF.meta.chestReady();
    const ch = $('chestEl');
    ch.className = 'chest' + (ready ? ' idle' : ' opened');
    $('chestPrize').hidden = true; $('chestPrize').innerHTML = '';
    $('chestSub').textContent = ready ? 'ONE FREE CHEST EVERY DAY. NO MONEY, EVER.' : 'YOU OPENED TODAY’S CHEST. THERE IS A NEW ONE TOMORROW.';
    $('chestHint').textContent = ready ? 'TAP THE CHEST · 3 TAPS' : '';
    showScreen('screenChest');
    if (ready) setTimeout(() => { try { ch.focus({ preventScroll: true }); } catch (_) {} }, 0);
  }
  function tapChest() {
    if (chestBusy || !AF.meta.chestReady()) return;
    AF.audio.unlock();
    chestTaps++;
    const ch = $('chestEl');
    audio('chestShake', chestTaps);
    if (chestTaps < 3) {
      ch.classList.remove('idle');
      AF.juice.pulse(ch, 'shake' + chestTaps);
      $('chestHint').textContent = chestTaps === 1 ? 'AGAIN!' : 'ONE MORE!';
      return;
    }
    chestBusy = true;
    const prize = AF.meta.openChest();
    if (!prize) return;
    ch.classList.remove('idle', 'shake1', 'shake2'); ch.classList.add('bursting');
    $('chestHint').textContent = '';
    const reveal = () => {
      ch.classList.add('opened');
      audio('chestOpen');
      AF.juice.confettiFrom(ch, 180, 120);
      const box = $('chestPrize'); box.innerHTML = '';
      let card;
      if (prize.type === 'cosmetic') card = cosmeticCard(prize.item, { owned: true, fresh: true });
      else { card = document.createElement('div'); card.className = 'cos-card owned foil star-prize'; card.innerHTML = '<div class="big-star">★</div><div class="cos-text"><div class="cos-name">+' + prize.n + ' STAR' + (prize.n > 1 ? 'S' : '') + '</div><div class="cos-kind">' + prize.total + ' IN TOTAL</div><div class="cos-need">Stars unlock cosmetics in the collection.</div></div>'; }
      box.appendChild(card); box.hidden = false;
      AF.juice.pulse(box, 'flipin');
      $('chestSub').textContent = prize.type === 'cosmetic' ? 'YOU GOT A CHEST-ONLY ' + AF.meta.KINDS[prize.item.kind].replace(/S$/, '') + '!' : 'STARS! THEY COUNT TOWARD EVERY UNLOCK.';
      if (prize.type === 'cosmetic') after(500, () => audio('unlock'));
      announceUnlocks(prize.unlocks);
      renderTitleMeta();
    };
    if (AF.juice.calm) reveal(); else after(700, reveal);
  }

  // ---------------------------------------------------------------- per frame
  let coinsInFlight = 0;
  function coinsTo(bx, by, n) {
    const r = $('board').getBoundingClientRect();
    const x = r.left + bx * r.width / W, y = r.top + by * r.height / H;
    coinsInFlight++;
    const total = Math.min(n, 10);
    AF.juice.coins(x, y, total, i => {
      audio('coin');
      if (i === total - 1) { coinsInFlight--; if (sim) cGum.set(Math.floor(sim.gum)); AF.juice.pulse($('hudGum'), 'bump'); AF.juice.pulse($('hudGumBox'), 'bump'); }
    });
  }
  function tick(now) {
    now = now || performance.now();
    if (!sim) return;
    for (const n of sim.takeNotices()) toast(n.text, n.kind);
    for (const j of AF.render.takeJuice()) if (j.type === 'coins' && !$('app').hidden) coinsTo(j.x, j.y, j.n);
    refreshHud();
    if (cRoom) { cRoom.tick(now); cGum.tick(now); cGiven.tick(now); }
  }

  // ---------------------------------------------------------------- wiring
  function setAuto(on) { app.settings.auto = on; if (sim) sim.autostart = on; app.saveSettings(); $('chkAuto').checked = on; $('btnMenuAuto').textContent = on ? 'AUTO START ON' : 'AUTO START OFF'; }
  // whatever starts a round, the board is cleared of the inspect panel the same way
  function onRoundStart() {
    hideInspect(); view.selected = null;
    // playing a round is what counts as playing today
    const st = AF.meta.touchStreak();
    if (st.changed && st.count > 1) { toast('Day streak: ' + st.count + ' days in a row.', 'gold'); AF.juice.brag('DAILY STREAK ' + st.count); audio('streak'); }
    announceUnlocks(st.unlocks);
  }
  // a cleared round may pass a star milestone (rounds 10, 20 and 30)
  function onRoundCleared(cleared) {
    if (!sim || !app.runId) return;
    const r = AF.meta.roundCleared(app.runId, cleared);
    if (r.gained) {
      for (let i = 0; i < r.gained; i++) setTimeout(() => audio('star', r.stars - r.gained + i), 700 + i * 300);
      const rule = AF.meta.STAR_RULES[r.stars - 1];
      toast('★ Star ' + r.stars + ' of 3: ' + rule.text.toLowerCase() + '. ' + r.total + ' stars in total.', 'gold');
      AF.juice.brag('★ STAR ' + r.stars + ' EARNED');
      starBurst();
      announceUnlocks(r.unlocks);
    }
  }
  function starBurst() {
    const el = $('hudStars'); if (!el) return;
    el.textContent = '★'.repeat(AF.meta.state.run ? AF.meta.state.run.stars : 0) + '☆'.repeat(3 - (AF.meta.state.run ? AF.meta.state.run.stars : 0));
    AF.juice.pulse(el, 'bump');
    const r = el.getBoundingClientRect(); AF.juice.confetti({ x: r.left + r.width / 2, y: r.bottom, count: 40, spread: 100, angle: 270, startVelocity: 20, colors: ['#ffd700', '#fff4a0', '#ffffff'] });
  }
  function announceUnlocks(list) {
    (list || []).forEach((c, i) => setTimeout(() => { toast('Unlocked: ' + c.name + ' (' + AF.meta.KINDS[c.kind].toLowerCase() + '). See the collection.', 'gold'); AF.juice.brag('NEW! ' + c.name + ' UNLOCKED'); audio('unlock'); }, 600 + i * 500));
  }
  function toggleSpeed() { app.speed = app.speed >= 3 ? 1 : app.speed + 1; app.settings.speed = app.speed; app.saveSettings(); audio('click'); }
  // M and the speaker button are the game's own mute, on top of the STOINLY NEXUS volume. They never write the
  // shared settings (only the nexus does), so when the nexus has the sound off they say so instead.
  const NEXUS_MUTED = 'The sound is off in the STOINLY NEXUS settings (Audio). Turn it up there.';
  function toggleSound() {
    AF.audio.unlock();
    if (AF.audio.sharedSilent && !AF.audio.muted) { toast(NEXUS_MUTED, 'info'); return; }
    AF.audio.setMuted(!AF.audio.muted); app.settings.sound = !AF.audio.muted; app.saveSettings(); audio('click');
    if (!AF.audio.muted && AF.audio.sharedSilent) toast(NEXUS_MUTED, 'info');
  }

  function init(a) {
    app = a; view = app.view;
    renderHelp();
    applyCosmetics();
    const board = $('board');
    board.addEventListener('pointerdown', onBoardDown);
    board.addEventListener('pointermove', onBoardMove);
    board.addEventListener('pointerup', onBoardUp);
    board.addEventListener('pointerleave', onBoardLeave);
    board.addEventListener('pointercancel', e => { if (boardDown && e.pointerId === boardDown.pid) boardDown = null; });
    board.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    $('hand').addEventListener('scroll', syncHandFade, { passive: true });
    $('inspect').querySelector('.inspect-body').addEventListener('scroll', syncInspectFade, { passive: true });
    window.addEventListener('resize', () => { syncHandFade(); if (!$('inspect').hidden) syncInspectFade(); });

    $('btnStart').addEventListener('click', () => { AF.audio.unlock(); if (sim.startRound()) { app.save(); onRoundStart(); } });
    $('chkAuto').addEventListener('change', e => { setAuto(e.target.checked); e.target.blur(); });
    $('btnMenuAuto').addEventListener('click', () => { setAuto(!app.settings.auto); audio('click'); });
    $('btnPack').addEventListener('click', () => { AF.audio.unlock(); openPack(); });
    $('packEl').addEventListener('click', rip);
    $('packEl').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); rip(); } });
    $('btnFlipAll').addEventListener('click', flipAll);
    $('btnTake').addEventListener('click', takeCards);
    $('btnPackLater').addEventListener('click', () => { if (!pending) hideScreen('screenPack'); });
    $('inspectClose').addEventListener('click', () => { hideInspect(); view.selected = null; clearPlacing(); });
    $('btnSpeed').addEventListener('click', toggleSpeed);
    $('btnSound').addEventListener('click', toggleSound);
    // a mouse click should not leave a HUD button holding Enter and Space
    document.querySelectorAll('.hud .btn').forEach(b => b.addEventListener('click', e => { if (e.detail > 0) b.blur(); }));
    $('btnMenuSpeed').addEventListener('click', toggleSpeed);
    $('btnMenuSound').addEventListener('click', toggleSound);
    $('btnMenu').addEventListener('click', () => showScreen('screenMenu'));
    $('btnMenuHow').addEventListener('click', () => showScreen('screenHelp'));
    $('btnMenuBinder').addEventListener('click', () => { renderBinder(); showScreen('screenBinder'); });
    $('btnMenuCollection').addEventListener('click', openCollection);
    $('btnMenuTitle').addEventListener('click', () => {
      if (sim.phase === 'running' && !confirm('Leave in the middle of a round? The game is saved from before this round, so the round starts over when you come back.')) return;
      app.save(); hideAllScreens(); app.toTitle();
    });
    // back to the STOINLY NEXUS launcher, only when opened from it
    const nexus = !!(SS && SS.fromNexus());
    $('lnkNexusTitle').hidden = !nexus; $('lnkNexusMenu').hidden = !nexus;
    $('lnkNexusMenu').addEventListener('click', e => {
      // leaving from the pause menu saves the way TITLE SCREEN does
      if (sim && sim.phase === 'running' && !confirm('Leave in the middle of a round? The game is saved from before this round, so the round starts over when you come back.')) { e.preventDefault(); return; }
      app.save();
    });
    $('btnMenuAbandon').addEventListener('click', () => { if (confirm('Abandon this game? The save is deleted. The binder stays.')) { app.clearSave(); AF.meta.forgetRun(); hideAllScreens(); app.toTitle(); } });
    $('btnNew').addEventListener('click', () => {
      if (app.hasSave() && !confirm('Start a new game? The saved game is deleted. The binder stays.')) return;
      AF.audio.unlock(); app.newGame(); hideAllScreens(); openPack();
    });
    $('btnResume').addEventListener('click', () => { AF.audio.unlock(); if (app.resume()) hideAllScreens(); });
    $('btnHow').addEventListener('click', () => showScreen('screenHelp'));
    $('btnBinder').addEventListener('click', () => { renderBinder(); showScreen('screenBinder'); });
    $('btnDaily').addEventListener('click', () => {
      if (app.hasSave() && !confirm('Start today\u2019s daily challenge? The saved game is deleted. The binder stays.')) return;
      AF.audio.unlock(); app.newGame(null, { daily: true }); hideAllScreens(); openPack();
      toast('Daily challenge for ' + AF.meta.prettyDay(app.daily) + ': everybody rips the same packs today.', 'gold');
    });
    $('btnCollection').addEventListener('click', () => { AF.audio.unlock(); openCollection(); });
    $('btnCollectionClose').addEventListener('click', closeCollection);
    $('btnChest').addEventListener('click', () => { AF.audio.unlock(); openChestScreen(); });
    $('chestEl').addEventListener('click', tapChest);
    $('chestEl').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); tapChest(); } });
    $('btnChestClose').addEventListener('click', () => { clearLater(); hideScreen('screenChest'); renderTitleMeta(); });
    $('btnEndCollection').addEventListener('click', openCollection);
    // bouncy buttons get a little sound on big presses
    document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('.btn-lg'); if (b && !b.disabled) audio('bounce'); });
    $('btnEndNew').addEventListener('click', () => { clearLater(); app.newGame(); hideAllScreens(); openPack(); });
    $('btnEndBinder').addEventListener('click', () => { renderBinder(); showScreen('screenBinder'); });
    $('btnEndTitle').addEventListener('click', () => { clearLater(); hideAllScreens(); app.toTitle(); });
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => hideScreen(b.dataset.close)));

    // fullscreen (a STOINLY NEXUS display setting) can only be asked for inside a user gesture: the first one,
    // and the first one after the setting is switched on again
    let fsArmed = true, fsWas = SS ? SS.get().display.fullscreen : false;
    const fsGesture = e => { if (!fsArmed || !SS || (e.type === 'keydown' && e.key === 'Escape')) return; fsArmed = false; SS.maybeFullscreen(); };
    document.addEventListener('pointerdown', fsGesture, true);
    window.addEventListener('keydown', fsGesture, true);
    loadBinds();
    if (SS) SS.onChange(st => {
      loadBinds();
      if (st.display.fullscreen && !fsWas) fsArmed = true;
      fsWas = st.display.fullscreen;
      hudState.sound = null;          // redraw the speaker icon
      AF.render.setTheme();           // the board is redrawn at the new text size and glow
    });

    window.addEventListener('keydown', e => {
      const t = e.target;
      if (t && ((t.tagName === 'INPUT' && t.type !== 'checkbox') || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Enter and Space belong to whatever control has focus; the shortcuts only fire from the page itself
      const onControl = t instanceof Element && t !== document.body && t !== document.documentElement && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.hasAttribute('tabindex'));
      const code = e.code;
      if (bound('back', code)) {
        if (!$('screenPack').hidden) { if (pending) { if (dealt) takeCards(); } else hideScreen('screenPack'); return; }
        if (!$('screenHelp').hidden) { hideScreen('screenHelp'); return; }
        if (!$('screenBinder').hidden) { hideScreen('screenBinder'); return; }
        if (!$('screenCollection').hidden) { closeCollection(); return; }
        if (!$('screenChest').hidden) { clearLater(); hideScreen('screenChest'); renderTitleMeta(); return; }
        if (!$('screenMenu').hidden) { hideScreen('screenMenu'); return; }
        if (!$('screenTitle').hidden || !$('screenEnd').hidden) return;
        if (view.placing || view.selectedHand) { clearPlacing(); hideInspect(); return; }
        if (view.selected) { view.selected = null; hideInspect(); return; }
        showScreen('screenMenu'); return;
      }
      // PRESS START: Enter on the title presses whichever big button is lit
      if (bound('start', code) && !onControl && !$('screenTitle').hidden && SCREENS.every(id => id === 'screenTitle' || $(id).hidden)) { ($('btnResume').hidden ? $('btnNew') : $('btnResume')).click(); return; }
      if (anyScreenOpen()) return;
      if ((e.key === ' ' || e.key === 'Enter') && onControl) return;
      if (bound('speed', code)) { e.preventDefault(); toggleSpeed(); }
      else if (bound('start', code)) { $('btnStart').click(); }
      else if (bound('pack', code)) openPack();
      else if (bound('sound', code)) toggleSound();
      else if (bound('binder', code)) { renderBinder(); showScreen('screenBinder'); }
      else { for (let i = 1; i <= 9; i++) if (bound('hand' + i, code)) { const g = handGroups()[i - 1]; if (g) selectHand(g.uids[0]); break; } }
    });
  }

  function bind(s) {
    sim = s; resetHud(); hudState.hand = '';
    coinsInFlight = 0;
    $('hudDaily').hidden = !app.daily;
    const rs = AF.meta.state.run ? AF.meta.state.run.stars : 0;
    $('hudStars').textContent = '★'.repeat(rs) + '☆'.repeat(3 - rs);
    const streak = AF.meta.streakNow();
    AF.juice.resetBrags([app.daily ? 'DAILY CHALLENGE · ' + AF.meta.prettyDay(app.daily) : 'ROUND ' + Math.min(sim.round, D.WAVES.length) + ' OF 30'].concat(streak > 1 ? ['DAILY STREAK ' + streak] : []));
    pending = null; dealt = false; clearFlipTimers();
    if (drag) endDrag();
    hideInspect();
    setAuto(!!app.settings.auto);
  }

  AF.ui = { KEY_ACTIONS, binds, keyLabel, init, bind, tick, onRoundStart, onRoundCleared, toast, showScreen, hideScreen, hideAllScreens, showEnd, renderBinder, openPack, cardEl, renderTitleMeta, renderCollection, openCollection, openChestScreen, tapChest, cosmeticCard, applyCosmetics };
})(window.AF = window.AF || {});
