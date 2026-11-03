/* Wreck Riders - game flow: title -> character select -> level select -> play, plus collection and daily challenge.
 * Meta progression (stars, coins, cosmetics, daily, streak, chest) lives in src/meta.js and is saved in localStorage under
 * 'stoinly.wreckriders.meta.v1'. Juice (tricks, coins, pop-ups, hit-stop) lives in src/juice.js and only reads the sim. */
(function () {
  const WR = window.WR;
  const U = WR.util;
  const M = WR.meta;
  // Any runtime error is kept so the renderer can show it (headless screenshots then reveal it too).
  window.addEventListener('error', (e) => { WR.lastError = (e.message || 'error') + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno; });
  // An error in a frame or at start-up must not end the loop: the error is kept in WR.lastError and drawn on screen in red.
  const keepError = (e) => { WR.lastError = String((e && e.message) || e) + ' @ ' + String((e && e.stack) || '').split('\n')[1]; if (window.console) console.error(e); };
  const q = new URLSearchParams(location.search);
  // STOINLY NEXUS shared settings (src/stoinly-settings.js; src/prefs.js turns them into WR.prefs). They change drawing,
  // sound, key mapping and UI only. Reduced motion (the OS setting or the nexus one) turns off shake, blink, bobbing and
  // hit-stop and cuts particles; ?rm=1 still forces it for testing.
  const S = window.StoinlySettings || null;
  const rmOverride = q.get('rm') === '1';
  const P = WR.Prefs.update(S, { rm: rmOverride });
  const canvas = document.getElementById('game');
  const render = new WR.Render(canvas);
  const audio = new WR.Audio();
  const input = new WR.Input(window, WR.Prefs.inputBindings());
  const juice = new WR.Juice({ reduced: P.reduced, particleScale: P.particles, shakeScale: P.shake });
  const CHARS = WR.vehicles.CHARACTERS;
  const LEVELS = WR.LEVELS;
  const STEP = 1 / 60;
  // ?demo=1 shows a sample save (stars, coins, unlocks) for screenshots and never writes to storage;
  // ?date=YYYY-MM-DD pretends today is that local date (daily challenge, streak, chest)
  const demo = q.has('demo');
  let storage = null;
  try { storage = demo ? null : window.localStorage; } catch (e) { storage = null; }
  const today = () => (/^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : M.dateKey());

  const game = {
    state: 'title',        // 'title' | 'select' | 'levels' | 'play' | 'collection' | 'daily'
    charIndex: 0,
    levelIndex: 0,
    sim: null,
    meta: M.load(storage),
    muted: false,
    input,
    render,
    audio,
    juice,
    chars: CHARS,
    levels: LEVELS,
    unlocked: true,        // every level is open; this is a toy, not a grind
    lastResult: null,
    lastReport: null,      // {sim, rep} from WR.meta.recordRun for the finished run
    titleFocus: 0,
    colTab: 'skin', colCursor: 0,
    toasts: [],
    runDaily: null,        // the daily challenge object while a daily run is live
    hitStop: 0,
    fromNexus: !!(S && S.fromNexus()),   // opened from the STOINLY NEXUS launcher: show "◄ NEXUS" on the title and pause screens
  };
  if (demo) fillDemo(game.meta);
  game.best = game.meta.best;   // best[levelId][charId] = seconds (shared with the meta save)
  game.today = today();
  game.dailyInfo = M.dailyFor(game.today, LEVELS, CHARS);
  juice.onSting = (name, n) => audio.sting(name, n);
  /** Re-read the shared settings (at start, and on every change, including changes made in another tab). */
  function applyPrefs() {
    WR.Prefs.update(S, { rm: rmOverride });
    input.setBindings(WR.Prefs.inputBindings(), [].concat(P.keys.tabNext, P.keys.confirm));
    juice.particleScale = P.particles; juice.shakeScale = P.shake;
    if (!(P.shake > 0)) juice.shake = 0;
    audio.setVolume(P.sfx);
    game.muted = P.muted;
  }
  applyPrefs();
  if (S) {
    S.onChange(() => { try { applyPrefs(); } catch (e) { keepError(e); } });
    try { S.applyDisplay(); } catch (e) { keepError(e); }   // text-scale variable, classes and the colour-blind filter on the canvas
  }
  // fullscreen (if the nexus setting asks for it) needs a user gesture: try once, on the first key or click
  let gestured = false;
  const firstGesture = () => { if (gestured) return; gestured = true; if (S) S.maybeFullscreen(); };
  window.addEventListener('keydown', firstGesture, true);
  window.addEventListener('mousedown', firstGesture, true);
  window.addEventListener('touchstart', firstGesture, true);
  /** M (or its rebinding) toggles the SHARED mute, so the nexus and the other games see it too. */
  function toggleMute() {
    if (!S) { game.muted = !game.muted; audio.setMuted(game.muted); return; }
    const cur = S.get();
    S.save(Object.assign({}, cur, { audio: Object.assign({}, cur.audio, { mute: !cur.audio.mute }) }));   // fires onChange -> applyPrefs
  }
  // Browsers only let audio start inside a user gesture, so unlock from within the key handler itself.
  input.onKey(() => audio.unlock());
  function saveMeta() { if (!demo) M.save(storage, game.meta); }
  function toast(text, sub, color, foil) { game.toasts.push({ text, sub, color, foil, t: 0 }); if (game.toasts.length > 3) game.toasts.shift(); }
  function announceUnlocks(ids) {
    for (const id of ids) { const c = M.BY_ID[id]; if (c) toast(`UNLOCKED: ${c.name.toUpperCase()}`, `new ${c.kind} in the collection`, '#ffd700', true); }
  }

  // Losing focus pauses a live run, and always silences looping sounds: after a death or finish the run is not
  // paused, but a hidden tab gets no frames, so a loop (rocket, saw whir) would otherwise keep its last volume.
  window.addEventListener('blur', () => { setPaused(true); audio.silenceLoops(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { setPaused(true); audio.silenceLoops(); } });

  /** Start a run. opts.daily = the daily challenge (fixed course, rider, sim seed and modifier). */
  function startLevel(li, ci, opts) {
    const daily = opts && opts.daily;
    game.levelIndex = U.clamp(li, 0, LEVELS.length - 1);
    game.charIndex = U.clamp(ci, 0, CHARS.length - 1);
    const so = { level: LEVELS[game.levelIndex], character: CHARS[game.charIndex] };
    if (daily) so.seed = daily.seed;   // the existing WR.Sim seed option: same hazard randomness for everyone today
    game.sim = new WR.Sim(so);
    game.runDaily = daily || null;
    game.lastResult = null;
    game.lastReport = null;
    game.endHandled = false;
    game.userPaused = false;
    game.hitStop = 0;
    // Action keys held when the run starts (the Space that confirmed the course or the retry) stay masked until
    // released, so they do not fire the rocket, squash the pogo or hop on the first frame. Arrows are not masked.
    game.heldMask = ['space', 'shift', 'z'].filter((k) => input.state[k]);
    audio.attach(game.sim);
    juice.attach(game.sim, { modifier: daily ? daily.modifier : null });
    if (render.onLevelStart) render.onLevelStart(game.sim);
    game.state = 'play';
    // the day streak counts any run started today
    game.today = today();
    const before = game.meta.streak.count, mk = M.markPlayed(game.meta, game.today);
    if (mk.extended && mk.count > 1) toast(`DAY STREAK ${mk.count}!`, 'come back tomorrow to keep it going', '#ff8800');
    else if (mk.extended && before > 1 && mk.reset) toast('NEW STREAK: DAY 1', 'the old streak ended after a missed day', '#ff8800');
    announceUnlocks(M.refreshUnlocks(game.meta));
    saveMeta();
  }
  game.startLevel = startLevel;
  function startDaily() {
    const D = game.dailyInfo = M.dailyFor(today(), LEVELS, CHARS);
    if (!game.runDaily) game.ownPick = { charIndex: game.charIndex, levelIndex: game.levelIndex };   // the daily must not change your own pick
    audio.ui('select'); startLevel(D.levelIndex, D.charIndex, { daily: D });
  }

  /** Leave the running level for a menu: looping sounds (rocket, hum) must not keep playing there. */
  function leavePlay(to) {
    game.userPaused = false; audio.silenceLoops(); game.state = to;
    if (game.runDaily && game.ownPick) { game.charIndex = game.ownPick.charIndex; game.levelIndex = game.ownPick.levelIndex; game.ownPick = null; }
    game.runDaily = null;
  }
  function setPaused(p) {
    if (game.state !== 'play' || !game.sim || game.sim.status !== 'playing') p = false;
    if (p && !game.userPaused) audio.silenceLoops();
    game.userPaused = p;
  }
  game.setPaused = setPaused;

  /** Bank a finished or crashed run into the meta save (stars, best time, coins, unlocks, daily score). */
  function onEnd(sim) {
    if (game.endHandled) return;
    game.endHandled = true;
    const L = LEVELS[game.levelIndex];
    const lid = L.id || String(game.levelIndex);
    const cid = CHARS[game.charIndex].id;
    const won = sim.status === 'won';
    const run = { levelId: lid, charId: cid, won, time: won ? sim.winTime : sim.time, style: juice.style, coins: juice.coins, progress: sim.progress, severs: juice.severs, flips: juice.flips };
    if (game.runDaily) { run.daily = game.runDaily; run.dateKey = game.runDaily.date; }
    const rep = M.recordRun(game.meta, run, LEVELS);
    game.lastReport = { sim, rep };
    if (won) game.lastResult = { time: sim.winTime, best: rep.bestTime, prev: rep.prevTime };
    saveMeta();
  }

  /* ---------- collection actions ---------- */
  function markTabSeen(kind) { for (const c of M.COSMETICS) if (c.kind === kind && game.meta.owned[c.id]) game.meta.seen[c.id] = 1; saveMeta(); }
  function setTab(kind) { if (game.colTab !== kind) { markTabSeen(game.colTab); game.colTab = kind; game.colCursor = 0; audio.ui('move'); } }
  function useItem(id) {
    const c = M.BY_ID[id];
    if (!c) return;
    const m = game.meta;
    if (m.owned[id]) { M.equip(m, id); audio.ui('select'); saveMeta(); return; }
    if (c.unlock.coins && m.coins >= c.unlock.coins) {
      M.buy(m, id); M.equip(m, id); audio.sting('buy', 1); toast(`BOUGHT: ${c.name.toUpperCase()}`, `-${c.unlock.coins} coins`, '#ffd700', true);
      saveMeta(); return;
    }
    game.nope = { id, t: 0 }; audio.sting('nope', 1);
  }
  function openChest() {
    if (game.chestAnim || !M.chestReady(game.meta, today())) return;
    const prize = M.openChest(game.meta, today());
    if (!prize) return;
    game.chestAnim = { t: 0, prize };
    saveMeta();
  }
  function goto(to) {
    if (game.state === 'collection' && to !== 'collection') markTabSeen(game.colTab);
    if (to === 'daily') { game.today = today(); game.dailyInfo = M.dailyFor(game.today, LEVELS, CHARS); game.chestAnim = null; }
    game.state = to;
  }

  /* ---------- fixed-step update ---------- */
  function step() {
    const s = game.state;
    // every key goes through an action id (WR.Prefs.ACTIONS); its keys are the nexus rebinding or the original defaults
    const act = (id) => input.anyJustPressed(P.keys[id]);
    if (input.anyPressed) audio.unlock();
    if (act('mute')) toggleMute();
    if (s === 'title') {
      if (act('menuUp')) { game.titleFocus = (game.titleFocus + 2) % 3; audio.ui('move'); }
      if (act('menuDown')) { game.titleFocus = (game.titleFocus + 1) % 3; audio.ui('move'); }
      if (act('confirm')) { goto(['select', 'daily', 'collection'][game.titleFocus]); audio.ui('select'); }
      if (act('daily')) { goto('daily'); audio.ui('select'); }
      if (act('collection')) { goto('collection'); audio.ui('select'); }
    } else if (s === 'select') {
      if (act('menuLeft')) { game.charIndex = (game.charIndex + CHARS.length - 1) % CHARS.length; audio.ui('move'); }
      if (act('menuRight')) { game.charIndex = (game.charIndex + 1) % CHARS.length; audio.ui('move'); }
      if (act('confirm')) { game.state = 'levels'; audio.ui('select'); }
      if (act('back')) { game.state = 'title'; audio.ui('back'); }
    } else if (s === 'levels') {
      if (act('menuUp') || act('menuLeft')) { game.levelIndex = (game.levelIndex + LEVELS.length - 1) % LEVELS.length; audio.ui('move'); }
      if (act('menuDown') || act('menuRight')) { game.levelIndex = (game.levelIndex + 1) % LEVELS.length; audio.ui('move'); }
      if (act('confirm')) { audio.ui('select'); startLevel(game.levelIndex, game.charIndex); }
      if (act('back')) { game.state = 'select'; audio.ui('back'); }
    } else if (s === 'collection') {
      const tabs = ['skin', 'hat', 'trail'];
      const ti = tabs.indexOf(game.colTab);
      if (act('tabNext')) setTab(tabs[(ti + 1) % 3]);
      if (act('tabPrev')) setTab(tabs[(ti + 2) % 3]);
      const n = M.COSMETICS.filter((c) => c.kind === game.colTab).length;
      const mv = (d) => { game.colCursor = (game.colCursor + d + n) % n; audio.ui('move'); };
      if (act('menuLeft')) mv(-1);
      if (act('menuRight')) mv(1);
      if (act('menuUp')) mv(-4 % n);
      if (act('menuDown')) mv(4 % n);
      if (act('confirm')) { const c = M.COSMETICS.filter((x) => x.kind === game.colTab)[game.colCursor]; if (c) useItem(c.id); }
      if (act('back')) { goto('title'); audio.ui('back'); }
    } else if (s === 'daily') {
      if (act('confirm')) startDaily();
      if (act('chest')) openChest();
      if (act('back')) { goto('title'); audio.ui('back'); }
    } else if (s === 'play') {
      const sim = game.sim;
      if (act('pause')) setPaused(!game.userPaused);
      if (!game.userPaused) {
        if (game.hitStop > 0) {
          game.hitStop -= STEP;   // hit-stop: the sim holds still for a few frames after a big impact (no sim time passes)
        } else {
          let inp = input.state;
          if (game.heldMask && game.heldMask.length) {
            game.heldMask = game.heldMask.filter((k) => input.state[k]);
            inp = Object.assign({}, input.state);
            for (const k of game.heldMask) inp[k] = false;
          }
          sim.update(STEP, inp);
          juice.update(sim, STEP);
          audio.update(sim, STEP);
          const hs = juice.takeHitStop();
          if (P.hitStop) game.hitStop += hs;   // no hit-stop under reduced motion (nexus contract)
        }
      }
      if (sim.status !== 'playing' && !game.endHandled) onEnd(sim);   // bank the run once, however it ended
      if (act('restart')) startLevel(game.levelIndex, game.charIndex, game.runDaily ? { daily: game.runDaily } : null);
      if (act('back')) { leavePlay(game.runDaily ? 'daily' : 'levels'); audio.ui('back'); }
      if (sim.status === 'won' && act('confirm') && sim.afterTime > 0.8) nextAfterWin();
      if (sim.status === 'dead' && act('confirm') && sim.afterTime > 0.8) startLevel(game.levelIndex, game.charIndex, game.runDaily ? { daily: game.runDaily } : null);
    }
    game.clicked = false;
    input.consume();
  }
  function nextAfterWin() {
    if (game.runDaily) { leavePlay('daily'); return; }
    if (game.levelIndex + 1 < LEVELS.length) startLevel(game.levelIndex + 1, game.charIndex);
    else leavePlay('levels');
  }

  /* ---------- mouse: buttons squash on press and act on release ---------- */
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('mousedown', (e) => { audio.unlock(); const p = pos(e); render.pressAt(p.x, p.y); });
  canvas.addEventListener('mouseup', (e) => {
    const p = pos(e);
    const hit = render.releaseAt(p.x, p.y);
    if (!hit) return;
    try { onClick(hit); } catch (err) { keepError(err); }
  });
  function onClick(hit) {
    switch (hit.type) {
      case 'goto': audio.ui(hit.to === 'title' ? 'back' : 'select'); goto(hit.to); break;
      case 'char': game.charIndex = hit.index; audio.ui('move'); if (hit.confirm) game.state = 'levels'; break;
      case 'level': game.levelIndex = hit.index; audio.ui('select'); startLevel(hit.index, game.charIndex); break;
      case 'start': audio.ui('select'); game.state = 'levels'; break;
      case 'restart': startLevel(game.levelIndex, game.charIndex, game.runDaily ? { daily: game.runDaily } : null); break;
      case 'next': nextAfterWin(); break;
      case 'menu': leavePlay(game.runDaily ? 'daily' : 'levels'); break;
      case 'resume': setPaused(false); break;
      case 'dailyPlay': startDaily(); break;
      case 'chest': openChest(); break;
      case 'tab': setTab(hit.kind); break;
      case 'item': game.colCursor = hit.index; useItem(hit.id); break;
      case 'nexus': audio.silenceLoops(); location.href = '../../index.html'; break;   // the launcher is two levels up (games/<id>/), relative so it also works under a subpath
      default: break;
    }
  }
  canvas.addEventListener('mousemove', (e) => { game.mouse = pos(e); });

  /** A plausible mid-game save for ?demo=1 screenshots (memory only). */
  function fillDemo(m) {
    m.best = { 'ward-nine': { wheelchair: 16.3, bike: 20.7, scooter: 17.4 }, 'harpoon-alley': { bike: 38.4 }, 'minefield-meadow': { scooter: 21.3 } };
    m.stars = { 'ward-nine': { finish: true, par: true, style: true }, 'harpoon-alley': { finish: true, par: true, style: false }, 'minefield-meadow': { finish: true, par: true, style: true } };
    m.style = { 'ward-nine': 1240, 'harpoon-alley': 620, 'minefield-meadow': 2280 };
    m.coins = 85; m.coinsTotal = 240;
    m.owned['hat:cone'] = 1; m.owned['hat:propeller'] = 1;
    m.streak = { count: 3, last: today(), best: 3 };
    M.refreshUnlocks(m);
    m.seen = { 'skin:classic': 1, 'trail:none': 1, 'hat:none': 1, 'hat:party': 1, 'hat:cone': 1, 'skin:vapor': 1 };
    m.equip = { skin: 'skin:vapor', trail: 'trail:rainbow', hat: 'hat:party' };
  }

  /* ---------- debug / test entry points via URL ---------- */
  window.WR_GAME = game;
  try {
    if (q.has('level') || q.has('daily')) {
      if (q.has('daily')) startLevel(game.dailyInfo.levelIndex, game.dailyInfo.charIndex, { daily: game.dailyInfo });
      else {
        const li = Math.max(0, parseInt(q.get('level'), 10) - 1 || 0);
        const cid = q.get('char') || 'wheelchair';
        const ci = Math.max(0, CHARS.findIndex((c) => c.id === cid));
        startLevel(li, ci);
      }
      const n = parseInt(q.get('tick') || '0', 10);
      if (n > 0) {
        const keys = (q.get('keys') || '').split(',').filter(Boolean);
        const inp = Object.assign({}, WR.vehicles.NO_INPUT);
        for (const k of keys) inp[k] = true;
        // &lean=1 holds Left in the air (to show flips in a screenshot)
        for (let i = 0; i < n; i++) {
          const ii = q.has('lean') && juice.air ? Object.assign({}, inp, { left: true }) : inp;
          game.sim.update(STEP, ii); juice.update(game.sim, STEP); juice.takeHitStop();
          if (i < n - 40) juice.tick(STEP);   // let the last pop-ups stay on screen
          if (game.sim.status !== 'playing') onEnd(game.sim);
        }
        juice.pickups.length = 0;   // no coin flyers for coins taken before the first frame
        if (render.onLevelStart) render.onLevelStart(game.sim);
      }
      // screenshot helpers: &force=dead|won ends the pre-simulated run, then &after=N frames (default 90) play out so the overlay shows
      if (q.has('force')) {
        const sim = game.sim;
        if (sim.status === 'playing') {
          if (q.get('force') === 'dead') sim.rider.kill('decapitated');
          else if (q.get('force') === 'won') sim.win();
          onEnd(sim);
        }
        const after = parseInt(q.get('after') || '90', 10);
        for (let i = 0; i < after; i++) { game.sim.update(STEP, WR.vehicles.NO_INPUT); juice.update(game.sim, STEP); }
      }
      if (q.has('bench')) {
        const nb = parseInt(q.get('bench'), 10) || 300;
        const inp = Object.assign({}, WR.vehicles.NO_INPUT, { up: true, space: true });
        render.resize();
        let tSim = 0, tDraw = 0;
        for (let i = 0; i < nb; i++) {
          const a = performance.now(); game.sim.update(STEP, inp); juice.update(game.sim, STEP); const b = performance.now();
          render.drawGame(game.sim, game, STEP); const c = performance.now();
          tSim += b - a; tDraw += c - b;
        }
        WR.debugText = `bench ${nb} frames: sim ${(tSim / nb).toFixed(2)} ms, draw ${(tDraw / nb).toFixed(2)} ms per frame; ${game.sim.gore.particles.length} drops, ${game.sim.gore.stains.length} stains`;
      }
      if (q.has('paused')) game.paused = true;
    }
    if (q.has('state') && ['title', 'select', 'levels', 'collection', 'daily'].includes(q.get('state'))) {
      goto(q.get('state'));
      if (q.has('char')) game.charIndex = Math.max(0, CHARS.findIndex((c) => c.id === q.get('char')));
      if (q.has('sel')) game.levelIndex = Math.max(0, parseInt(q.get('sel'), 10) - 1 || 0);
      if (q.has('tab')) game.colTab = ['skin', 'hat', 'trail'].includes(q.get('tab')) ? q.get('tab') : 'skin';
      // &chest=open opens today's chest (with ?demo=1 nothing is saved) and &chestt=S jumps S seconds into the reveal
      if (q.get('chest') === 'open') { openChest(); if (game.chestAnim) game.chestAnim.t = parseFloat(q.get('chestt') || '0') || 0; }
    }
    if (q.has('toast')) toast('DAY STREAK 3!', 'come back tomorrow to keep it going', '#ff8800');
  } catch (e) { keepError(e); }

  /* ---------- main loop ---------- */
  let last = performance.now(), acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!(dt > 0)) dt = 0;   // a rAF timestamp can be older than the performance.now() of the first, synchronous frame
    try {
      if (!game.paused) {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 4) { step(); acc -= STEP; n++; }
        if (n === 4) acc = 0;
      }
    } catch (e) { keepError(e); acc = 0; input.consume(); }
    try {
      render.resize();
      if (game.state === 'play') { if (!game.paused && !game.userPaused) juice.tick(dt); render.drawGame(game.sim, game, dt); }
      else if (game.state === 'title') render.drawTitle(game, dt);
      else if (game.state === 'select') render.drawSelect(game, dt);
      else if (game.state === 'collection') render.drawCollection(game, dt);
      else if (game.state === 'daily') render.drawDaily(game, dt);
      else render.drawLevels(game, dt);
    } catch (e) {
      keepError(e);
      try { render.screenTransform(); if (render.drawError) render.drawError(); } catch (e2) { /* nothing more to do */ }
    }
    requestAnimationFrame(frame);
  }
  // draw the first frame right away (before the load event), then keep going on animation frames
  frame(performance.now());
})();
