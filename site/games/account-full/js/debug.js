/* ACCOUNT FULL — scripted scenarios for headless testing
   Loaded only with ?test=<scenario>. Drives the real game through its own
   API and the real DOM, logs TEST_OK / TEST_ERROR lines to the console, and
   leaves the page in a state worth screenshotting. Not part of play. */
(function (AF) {
  'use strict';
  const D = AF.DATA, P = AF.PATH, app = AF.app, $ = id => document.getElementById(id);
  const q = Object.fromEntries(new URLSearchParams(location.search));
  const name = q.test;
  const log = (...a) => console.log('TEST', ...a);
  window.addEventListener('error', e => console.log('TEST_ERROR', e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', e => console.log('TEST_ERROR', 'rejection', String(e.reason)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // headless screenshots freeze mid-animation; test runs skip animations so end states are what gets captured
  if (!q.anim) document.documentElement.classList.add('notransitions');

  function spots() {
    const out = [];
    for (let y = 60; y < 700; y += 34) for (let x = 60; x < 1240; x += 34) {
      const n = P.nearest(x, y);
      if (n.d > 52 && n.d < 95) out.push({ x, y, s: n.s });
    }
    return out.sort((a, b) => a.s - b.s);
  }
  function placeAll(sim) {
    const SP = spots();
    let placed = 0;
    for (const h of sim.hand.slice()) {
      const card = D.CARD_BY_ID[h.cardId];
      if (card.kind === 'action') continue;
      if (card.kind === 'tower') { for (const sp of SP) { if (sim.placeFromHand(h.uid, sp.x, sp.y).ok) { placed++; break; } } }
      else { for (let s = 120; s < P.length - 120; s += 30) { const p = P.posAt(s); if (sim.placeFromHand(h.uid, p.x, p.y).ok) { placed++; break; } } }
    }
    return placed;
  }
  function ripN(sim, n) {
    for (let i = 0; i < n; i++) { sim.gum = Math.max(sim.gum, sim.packCost()); const r = sim.ripPack(); if (!r.ok) throw new Error('rip failed ' + r.reason); app.recordPulls(r.cards.map(h => h.cardId)); sim.takeCards(r.cards); }
  }
  async function runRoundFor(sim, seconds) {
    sim.startRound();
    const t0 = sim.time;
    while (sim.phase === 'running' && sim.time - t0 < seconds) sim.step(1 / 60);
  }

  // a real key press is aimed at the focused element, or at the body when nothing has focus; it carries both
  // e.key and e.code (the shortcuts read e.code, through the STOINLY NEXUS bindings)
  const CODE_OF = { Escape: 'Escape', Enter: 'Enter', ' ': 'Space' };
  const keyCode = k => CODE_OF[k] || (/^[a-z]$/i.test(k) ? 'Key' + k.toUpperCase() : /^[0-9]$/.test(k) ? 'Digit' + k : k);
  const key = (k, target, code) => (target || document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code || keyCode(k), bubbles: true }));

  // ---- STOINLY NEXUS settings helpers. Each headless run starts with empty storage, so these leave nothing behind.
  const SS = window.StoinlySettings;
  const merge = (a, b) => { const o = JSON.parse(JSON.stringify(a)); for (const k of Object.keys(b)) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(o[k] || {}, b[k]) : b[k]; return o; };
  const setS = patch => SS.save(merge(SS.get(), patch));
  // a change made in another tab arrives as a storage event; this is the same path
  const setFromOtherTab = patch => { localStorage.setItem(SS.KEY, JSON.stringify(merge(SS.get(), patch))); window.dispatchEvent(new StorageEvent('storage', { key: SS.KEY })); };
  const check = (ok, what) => { if (!ok) throw new Error('check failed: ' + what); return ok; };
  // fire a crit hit, an emptied truck and a leak on a fresh board, run one frame, and count what the renderer made
  function effectsProbe(seed) {
    app.newGame(seed || 3); AF.ui.hideAllScreens();
    const sim = app.sim; sim.round = 12; sim.startRound(); sim.spawns = [];
    AF.render.reset();
    const L = P.length, b = sim.spawn('bill', 20, [], L * 0.3), p3 = P.posAt(L * 0.78);
    app.manualFrames = true;
    let t = performance.now();
    const run = n => { for (let i = 0; i < n; i++) { t += 1000 / 60; app.debugFrame(t); } };
    run(1);
    const hs0 = AF.render.hitStopUntil;
    sim.fx({ type: 'hit', x: b.x, y: b.y, amt: 250, dtype: 'force' });
    sim.fx({ type: 'burst', x: p3.x, y: p3.y, kind: 'truck' });
    sim.fx({ type: 'leak', value: 35 });
    run(1);
    const r = { particles: AF.render.particleCount, flashes: AF.render.flashCount, hitStop: AF.render.hitStopUntil > hs0, shake: +AF.render.shakeAmp.toFixed(2) };
    run(5);
    app.paused = true; app.manualFrames = false; AF.ui.tick();
    return r;
  }
  // computed animation of an element with the test page's animation freeze lifted for a moment
  function liveAnimation(el) {
    const h = document.documentElement, had = h.classList.contains('notransitions');
    h.classList.remove('notransitions'); const name = getComputedStyle(el).animationName; if (had) h.classList.add('notransitions');
    return name;
  }

  const scenarios = {
    // ---------------- STOINLY NEXUS settings
    // sfx volume and mute from the shared settings, live, including from another tab; the M key on top of it
    async volume() {
      app.newGame(4); AF.ui.hideAllScreens(); AF.audio.unlock(); AF.ui.tick();
      const g0 = AF.audio.gain;
      setS({ audio: { master: 0.5, sfx: 0.6, mute: false } });
      const g1 = AF.audio.gain;
      setFromOtherTab({ audio: { mute: true } }); AF.ui.tick();
      const g2 = AF.audio.gain, icon = $('btnSound').getAttribute('aria-label');
      key('m'); await sleep(30);
      const localAfterM = AF.audio.muted, toastSaid = $('toasts').textContent.includes('STOINLY NEXUS');
      setFromOtherTab({ audio: { mute: false } }); AF.ui.tick();
      const g3 = AF.audio.gain, icon2 = $('btnSound').getAttribute('aria-label');
      key('m'); AF.ui.tick();
      const g4 = AF.audio.gain, local4 = AF.audio.muted;
      key('m'); AF.ui.tick();
      log('gain default', g0, 'master .5 x sfx .6', +g1.toFixed(4), 'nexus mute (other tab)', g2, 'icon', icon, 'M while nexus-muted keeps local', localAfterM, 'toast', toastSaid,
        'unmuted', +g3.toFixed(4), 'icon', icon2, 'M mutes locally', g4, local4, 'M again', +AF.audio.gain.toFixed(4));
      check(g0 === 0.5 && Math.abs(g1 - 0.15) < 1e-6 && g2 === 0 && icon === 'Sound off' && localAfterM === false && toastSaid && Math.abs(g3 - 0.15) < 1e-6 && icon2 === 'Sound on' && g4 === 0 && local4 === true && Math.abs(AF.audio.gain - 0.15) < 1e-6, 'volume');
    },
    // reduced motion: no shake, no hit-stop, a quarter of the particles, no flashes, no blinking; switched on live
    async reduced() {
      const before = effectsProbe(3);
      const blinkBefore = liveAnimation(document.querySelector('.tagline.blink'));
      setFromOtherTab({ motion: { reduce: true } });
      const after = effectsProbe(3);
      const h = document.documentElement;
      const blinkAfter = liveAnimation(document.querySelector('.tagline.blink'));
      log('defaults', JSON.stringify(before), 'reduced', JSON.stringify(after), 'J.reduced', AF.juice.reduced, 'flashes', AF.juice.flashes,
        'classes', h.classList.contains('stoinly-reduced-motion'), h.classList.contains('stoinly-no-flash'), 'blink', blinkBefore, '->', blinkAfter);
      check(before.particles === 48 && before.flashes === 2 && before.hitStop && before.shake > 0, 'defaults unchanged');
      check(after.particles === 12 && after.flashes === 0 && !after.hitStop && after.shake === 0 && blinkBefore === 'blinker' && blinkAfter === 'none', 'reduced');
    },
    // flashes off alone: shake and hit-stop stay, flashes and blinking go
    async noflash() {
      setS({ motion: { flashes: false, shake: 0.5, particles: 0.5 } });
      const r = effectsProbe(3);
      log('flashes off, shake .5, particles .5', JSON.stringify(r), 'blink', liveAnimation(document.querySelector('.tagline.blink')));
      check(r.flashes === 0 && r.hitStop && r.particles === 24 && Math.abs(r.shake - 3.5) < 0.01 && liveAnimation(document.querySelector('.tagline.blink')) === 'none', 'noflash');
    },
    // text size 1.3: DOM text through --stoinly-text-scale, canvas text times textScale
    async textscale() {
      setS({ display: { textScale: 1.3 } });
      const px = sel => { const el = document.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : 0; };
      const v = getComputedStyle(document.documentElement).getPropertyValue('--stoinly-text-scale').trim();
      if (q.view === 'game') { scenarios.__board(); await sleep(60); }
      else if (q.view === 'menu') { scenarios.__board(); AF.ui.showScreen('screenMenu'); }
      else app.toTitle();
      log('--stoinly-text-scale', v, 'btn-lg', px('.btn-lg'), 'body', px('body'), 'label token', px('.label'), 'card name unscaled', px('.tcard-name') || 'n/a', 'J.textScale', AF.juice.textScale);
      check(v === '1.3' && Math.abs(px('.btn-lg') - 19 * 1.3) < 0.05 && Math.abs(px('body') - 14 * 1.3) < 0.05 && Math.abs(px('.label') - 11 * 1.3) < 0.05 && AF.juice.textScale === 1.3, 'text scale');
    },
    // colour-blind filter on the whole page via applyDisplay; switched live from another tab
    async colorblind() {
      setFromOtherTab({ display: { colorblind: q.mode || 'deuteranopia' } });
      if (q.view === 'game') { scenarios.__board(); await sleep(60); } else app.toTitle();
      const f = document.body.style.filter, svg = !!document.getElementById('stoinly-cb-filters');
      log('body filter', f, 'svg filters', svg, 'board canvas own filter (the body filter covers it)', JSON.stringify(getComputedStyle($('board')).filter));
      check(f === 'url("#stoinly-cb-' + (q.mode || 'deuteranopia') + '")' && svg, 'colour-blind');
      setFromOtherTab({ display: { colorblind: 'off' } }); const off = document.body.style.filter;
      setFromOtherTab({ display: { colorblind: q.mode || 'deuteranopia' } });
      log('switched off then on again: off filter', JSON.stringify(off));
      check(off === '', 'colour-blind off');
    },
    // performance mode: half the particles, no glow (canvas shadowBlur, CSS filters and box shadows), plainer starfield
    async perf() {
      const before = effectsProbe(3);
      setS({ display: { performance: true } });
      const after = effectsProbe(3);
      const moon = getComputedStyle(document.querySelector('.moon')).filter, sf = getComputedStyle(document.body).backgroundImage.split('radial-gradient').length - 1;
      // the canvas glow: draw the cached board at full glow and in performance mode and compare a pixel just outside the track edge
      log('defaults', JSON.stringify(before), 'perf', JSON.stringify(after), 'J.perf', AF.juice.perf, 'class', document.documentElement.classList.contains('stoinly-perf'), 'moon filter', moon, 'starfield gradients', sf);
      check(after.particles === 24 && after.flashes === 2 && AF.juice.perf && moon === 'none' && sf === 2, 'performance');
      if (q.view === 'title') app.toTitle(); else { scenarios.__board(); await sleep(60); }
    },
    // a rebound key: P moved to O through the nexus, live; the old key does nothing; the menu shows the new key
    async keys() {
      app.newGame(4); AF.ui.hideAllScreens(); ripN(app.sim, 1); AF.ui.tick();
      app.sim.gum = 99;
      const defaults = AF.ui.KEY_ACTIONS.map(a => a.id + '=' + a.defaults.join('+')).join(' ');
      key(' '); const speedBySpace = app.speed; key(' '); key(' ');
      SS.setKeys('account-full', 'pack', ['KeyO']);
      key('p'); await sleep(30); const byP = !$('screenPack').hidden;
      key('o'); await sleep(30); const byO = !$('screenPack').hidden;
      AF.ui.hideAllScreens();
      setFromOtherTab({ controls: { 'account-full': { pack: ['KeyO'], hand1: ['KeyQ'] } } });
      key('q'); const hand1 = !!app.view.selectedHand;
      key('Escape'); key('1'); const digit1 = !!app.view.selectedHand;
      AF.ui.showScreen('screenMenu');
      const hint = $('menuKeys').textContent;
      log('defaults', defaults, '| Space -> speed', speedBySpace, '| P opens pack', byP, 'O opens pack', byO, '| Q picks card 1', hand1, '1 picks card 1', digit1, '| menu hint', hint, '| nexus link hidden (not from nexus)', $('lnkNexusMenu').hidden);
      check(speedBySpace === 2 && !byP && byO && hand1 && !digit1 && hint.includes('O rip a pack') && $('lnkNexusMenu').hidden, 'keys');
    },
    // opened from the nexus: the title and the pause menu get a "◄ NEXUS" link to /
    async nexus() {
      app.toTitle();
      const t = $('lnkNexusTitle'), m = $('lnkNexusMenu');
      log('fromNexus', SS.fromNexus(), 'title link shown', !t.hidden, 'href', t.getAttribute('href'), 'text', t.textContent, 'menu link shown', !m.hidden);
      check(SS.fromNexus() && !t.hidden && !m.hidden && t.getAttribute('href') === '../../index.html' && t.textContent.trim() === '\u25c4 NEXUS', 'nexus link');
      if (q.view === 'menu') { scenarios.__board(); AF.ui.showScreen('screenMenu'); }
    },
    // fullscreen is asked for once, on the first gesture, when the setting is on (headless cannot show it)
    async fullscreen() {
      let calls = 0; const real = SS.maybeFullscreen; SS.maybeFullscreen = d => { calls++; return real(d); };
      setS({ display: { fullscreen: true } });
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const first = calls;
      setS({ display: { fullscreen: false } }); setS({ display: { fullscreen: true } });
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      SS.maybeFullscreen = real;
      log('maybeFullscreen calls after two gestures', first, 'after switching the setting off and on and one more gesture', calls, 'fullscreenElement', String(document.fullscreenElement));
      check(first === 1 && calls === 2, 'fullscreen');
    },
    // a board mid-round for screenshots with a setting on
    __board() {
      app.newGame(3); AF.ui.hideAllScreens();
      ripN(app.sim, 4); placeAll(app.sim);
      app.sim.round = 8; app.sim.startRound(); AF.ui.onRoundStart();
      app.manualFrames = true;
      let t = performance.now();
      for (let i = 0; i < 60 * 6; i++) { t += 1000 / 60; app.debugFrame(t); }
      app.paused = true; app.manualFrames = false; AF.ui.tick();
    },
    async title() {
      // a returning player: a three-day streak, some stars, the chest waiting, two unseen unlocks
      const t = AF.meta.today();
      AF.meta._replace({ stars: 7, streak: { last: AF.meta.addDays(t, -1), count: 3, best: 3 }, chest: { last: AF.meta.addDays(t, -1), opened: 2 },
        unlocked: { 'burst-gum': { at: t, seen: true }, 'board-grid': { at: t, seen: false }, 'back-gold': { at: t, seen: false }, 'pack-gold': { at: t, seen: true }, 'burst-sparkle': { at: t, seen: true }, 'back-lime': { at: t, seen: true }, 'pack-black': { at: t, seen: true } },
        runs: { started: 9, finished: 8, won: 1, bestCleared: 30, bestGiven: 412345, bestStars: 3, bestCombo: 41 },
        daily: { [t]: { cleared: 17, given: 23456, stars: 1, runs: 2 } } });
      app.toTitle();
      log('title shown', !$('screenTitle').hidden, 'new game is primary', $('btnNew').classList.contains('btn-primary'), 'app inert', $('app').inert,
        'streak', $('metaStreakN').textContent, 'stars', $('metaStars').textContent, 'chest ready', $('btnChest').classList.contains('ready'), 'new badge', $('collectionNew').textContent, 'daily', $('dailyInfo').textContent);
    },
    // the daily chest: three taps, then the prize
    async chest() {
      AF.meta._replace({ stars: 2, chest: { last: null, opened: 0 } });
      app.toTitle(); AF.ui.openChestScreen(); await sleep(50);
      $('chestEl').click(); await sleep(30); $('chestEl').click(); await sleep(30); $('chestEl').click();
      await sleep(q.anim ? 1400 : 100);
      log('chest ready after', AF.meta.chestReady(), 'prize shown', !$('chestPrize').hidden, 'prize', $('chestPrize').textContent.slice(0, 60));
      // a second open the same day is refused
      AF.ui.openChestScreen(); await sleep(30); $('chestEl').click(); $('chestEl').click(); $('chestEl').click(); await sleep(50);
      log('second open refused', $('chestPrize').hidden, 'sub', $('chestSub').textContent);
      // a fresh chest again, left open on its prize for the screenshot
      AF.meta._replace(Object.assign({}, AF.meta.state, { chest: { last: null, opened: 0 } }));
      AF.ui.openChestScreen(); await sleep(30); $('chestEl').click(); $('chestEl').click(); $('chestEl').click(); await sleep(q.anim ? 1400 : 100);
    },
    async chestdone() {
      AF.meta._replace({ stars: 2, chest: { last: AF.meta.today(), opened: 1 } });
      app.toTitle(); AF.ui.openChestScreen(); await sleep(50);
      log('chest opened state', $('chestEl').className, 'sub', $('chestSub').textContent);
    },
    async collection() {
      const t = AF.meta.today();
      AF.meta._replace({ stars: 6, unlocked: { 'burst-gum': { at: t, seen: true }, 'board-grid': { at: t, seen: false }, 'back-gold': { at: t, seen: true }, 'pack-gold': { at: t, seen: true }, 'burst-sparkle': { at: t, seen: false }, 'back-lime': { at: t, seen: true }, 'back-moon': { at: t, seen: false } },
        equipped: { back: 'back-gold', board: 'board-grid', burst: 'burst-confetti', pack: 'pack-foil' } });
      app.toTitle(); AF.ui.openCollection(); await sleep(60);
      const cards = $('collectionGrid').querySelectorAll('.cos-card');
      log('collection cards', cards.length, 'owned', $('collectionGrid').querySelectorAll('.cos-card.owned').length, 'new badges', $('collectionGrid').querySelectorAll('.new-badge').length, 'equipped', $('collectionGrid').querySelectorAll('.eq-badge').length);
      if (q.equip) { const b = Array.from(cards).find(c => c.textContent.includes(q.equip)); if (b) b.click(); await sleep(30); log('equipped now', JSON.stringify(AF.meta.state.equipped)); }
    },
    // the result screen after a run that reached round 21: two stars, one new unlock
    async stars() {
      AF.meta._replace({ stars: 0 });
      app.newGame(2); AF.ui.hideAllScreens();
      app.sim.round = 22; app.sim.given = 54321; app.sim.stats.finished = 612; app.sim.stats.packs = 7; app.sim.stats.placed = 11; app.sim.stats.upgrades = 6; app.sim.stats.leakedValue = 500;
      AF.juice.combo.best = 23;
      app.sim.phase = 'lost';
      AF.ui.showEnd();
      await sleep(q.anim ? 2500 : 100);
      log('stars on', $('endStars').querySelectorAll('.star.on').length, 'rules got', $('endRules').querySelectorAll('.got').length, 'unlocks', $('endUnlocks').children.length, 'badge', $('endBadge').hidden ? 'hidden' : $('endBadge').textContent, 'total', AF.meta.state.stars);
    },
    // today's daily challenge: the seed comes from the local date, so two starts deal the same first pack
    async daily() {
      const pull = () => { app.newGame(null, { daily: true }); AF.ui.hideAllScreens(); const r = app.sim.ripPack(); return r.cards.map(h => h.cardId).join(','); };
      const a = pull(), b = pull();
      log('daily', app.daily, 'seed', app.sim.seed, 'same packs', a === b, 'hud tag shown', !$('hudDaily').hidden);
      app.sim.takeCards([]); ripN(app.sim, 2); placeAll(app.sim); AF.ui.tick();
    },
    // a run saved by the version before the meta file existed: no runId, no daily flag
    async oldsave() {
      const sim = new AF.Sim(77); ripN(sim, 2); placeAll(sim); sim.round = 6;
      const j = sim.toJSON(); delete j.runId; delete j.daily;
      localStorage.setItem('account-full.save.v1', JSON.stringify(j));
      const ok = app.resume(); AF.ui.hideAllScreens();
      const after = JSON.parse(localStorage.getItem('account-full.save.v1'));
      log('old save resumed', ok, 'round', app.sim.round, 'towers', app.sim.towers.length, 'runId adopted', !!app.runId, 'save now has runId', after.runId === app.runId, 'still v', after.v);
    },
    // a corrupt meta value must not break the title, and is kept aside
    async corrupt() {
      localStorage.setItem(AF.meta.KEY, '{"v":1,"stars":');
      AF.meta.reload(); app.toTitle();
      log('corrupt meta -> stars', AF.meta.state.stars, 'kept aside', localStorage.getItem(AF.meta.KEY + '.corrupt'), 'title shown', !$('screenTitle').hidden);
    },
    // a real round 10 through the frame loop pays the first star once
    async milestone() {
      AF.meta._replace({ stars: 0 });
      app.newGame(3); AF.ui.hideAllScreens();
      ripN(app.sim, 5); placeAll(app.sim);
      for (const o of app.sim.towers) { app.sim.gum = 99; app.sim.upgrade(o.uid); app.sim.upgrade(o.uid); }
      app.sim.round = 10; app.save();
      app.manualFrames = true;
      $('btnStart').click();
      let t = performance.now(), n = 0;
      while (app.sim.phase === 'running' && n++ < 60 * 300) { t += 1000 / 60; app.debugFrame(t); if (n % 60 === 0) await sleep(0); }
      for (let i = 0; i < 5; i++) { t += 1000 / 60; app.debugFrame(t); }
      app.manualFrames = false; await sleep(100);
      log('after round 10: phase', app.sim.phase, 'round', app.sim.round, 'run stars', AF.meta.state.run && AF.meta.state.run.stars, 'total', AF.meta.state.stars, 'hud', $('hudStars').textContent, 'streak', AF.meta.streakNow(), 'unlocked gum bubbles', AF.meta.owned('burst-gum'));
      // a reload of the save from after round 10 does not pay again
      app.resume(); const r = AF.meta.roundCleared(app.runId, 10);
      log('replayed milestone pays', r.gained);
    },
    // every board effect fired once at a known spot, a few frames in: pop-ups, particles, rings, a combo
    async fx() {
      app.newGame(3); AF.ui.hideAllScreens();
      const sim = app.sim; sim.round = 12; sim.startRound(); sim.spawns = [];
      const L = P.length;
      const b1 = sim.spawn('bill', 20, [], L * 0.30), b2 = sim.spawn('bill', 50, [], L * 0.45), b3 = sim.spawn('case', 1500, [], L * 0.62);
      app.manualFrames = true;
      let t = performance.now();
      const run = n => { for (let i = 0; i < n; i++) { t += 1000 / 60; app.debugFrame(t); } };
      run(2);
      for (let i = 0; i < 12; i++) AF.juice.comboHit(sim.time + i * 0.1);
      sim.fx({ type: 'hit', x: b1.x, y: b1.y, amt: 4, dtype: 'force' });
      sim.fx({ type: 'hit', x: b2.x, y: b2.y, amt: 12, dtype: 'transaction' });
      sim.fx({ type: 'hit', x: b3.x, y: b3.y, amt: 250, dtype: 'force' });
      const p1 = P.posAt(L * 0.2), p2 = P.posAt(L * 0.52), p3 = P.posAt(L * 0.78);
      sim.fx({ type: 'finish', x: p1.x, y: p1.y, value: 20 });
      sim.fx({ type: 'finish', x: p2.x, y: p2.y, value: 100 });
      sim.fx({ type: 'burst', x: p3.x, y: p3.y, kind: 'truck' });
      sim.fx({ type: 'upgrade', x: 980, y: 140 });
      sim.fx({ type: 'leak', value: 35 });
      sim.gum += 1;
      run(+(q.n || 9));
      sim.bills.forEach(b => { b.stunUntil = 0; });
      app.paused = true; app.manualFrames = false; AF.ui.tick(); await sleep(60);
      log('fx frame', 'combo', AF.juice.combo.n, 'bills', sim.bills.length, 'reduced motion', AF.juice.reduced);
    },
    // the board mid-round with the flashy layer showing: pop-ups, particles, a combo
    async juice() {
      app.newGame(3); AF.ui.hideAllScreens();
      ripN(app.sim, +(q.packs || 5)); placeAll(app.sim);
      for (const o of app.sim.towers) { app.sim.gum = 99; app.sim.upgrade(o.uid); }
      app.sim.round = +(q.round || 9); app.sim.gum = 6;
      app.sim.startRound(); AF.ui.onRoundStart();
      // drive the real frame function at 60 fps for a while, then freeze it
      app.manualFrames = true;
      let t = performance.now();
      const frames = Math.round((+(q.ms || 9000)) / 1000 * 60);
      for (let i = 0; i < frames; i++) { t += 1000 / 60; app.debugFrame(t); if (i % 30 === 0) await sleep(0); }
      app.paused = true; app.manualFrames = false; AF.ui.tick(); await sleep(60);
      log('combo', AF.juice.combo.n, 'best', AF.juice.combo.best, 'bills', app.sim.bills.length, 'given', Math.round(app.sim.given), 'phase', app.sim.phase, 'time', app.sim.time.toFixed(1), 'round', app.sim.round, 'paused', app.paused, 'towers', app.sim.towers.length);
    },
    async help() { AF.ui.hideAllScreens(); AF.ui.showScreen('screenHelp'); },
    async menu() {
      app.newGame(4); AF.ui.hideAllScreens(); ripN(app.sim, 1); AF.ui.tick();
      AF.ui.showScreen('screenMenu');
      log('menu open, app inert', $('app').inert, 'paused', app.paused);
    },
    async binder() {
      for (const c of D.CARDS.slice(0, 20)) app.binder[c.id] = (c.num % 3) + 1;
      AF.ui.hideAllScreens(); AF.ui.renderBinder(); AF.ui.showScreen('screenBinder');
    },
    // the two pack-screen crashes the review reported: Esc during the rip, and Esc/flip-all mashing
    async packstress() {
      const errors = [];
      window.addEventListener('error', e => errors.push(e.message));
      app.newGame(9); AF.ui.hideAllScreens();
      AF.ui.openPack(); await sleep(50);
      $('packEl').click(); await sleep(100);
      key('Escape'); await sleep(50);                       // during the 480 ms deal: must do nothing
      const handDuringDeal = app.sim.hand.length;
      await sleep(600);
      key('Escape'); await sleep(150); key('Escape'); await sleep(150);   // mash while flipping
      $('btnFlipAll').click(); $('btnFlipAll').click(); await sleep(140);
      key('Escape'); await sleep(900);
      key('Escape'); await sleep(300);
      log('hand during deal', handDuringDeal, 'hand after', app.sim.hand.length, 'pack screen open', !$('screenPack').hidden, 'errors', errors.length ? errors.join(' | ') : 'none');
      // Enter on a focused hand card must select it, not start the round
      AF.ui.tick(); await sleep(30);
      const el = $('hand').querySelector('.tcard'); el.focus(); key('Enter', el); await sleep(30);
      log('after Enter on a card: phase', app.sim.phase, 'inspect open', !$('inspect').hidden);
      // actions refuse to be played between rounds, with a reason on the ghost
      const act = D.CARDS.find(c => c.id === 'white-monster');
      log('monster between rounds', JSON.stringify(app.sim.previewPlacement(act.id, 600, 360)));
    },
    async pack() {
      app.newGame(7); AF.ui.hideAllScreens(); AF.ui.openPack();
      await sleep(100); $('packEl').click();
      await sleep(1100); $('btnFlipAll').click();
      await sleep(1200);
      const cards = Array.from($('packCards').querySelectorAll('.flip'));
      log('pack cards', cards.length, 'flipped', cards.filter(c => c.classList.contains('flipped')).length, 'opacity', cards.map(c => getComputedStyle(c).opacity).join(','));
    },
    // every kind of money on the board at once, frozen mid-walk, for judging how money reads
    async money() {
      app.newGame(17); AF.ui.hideAllScreens();
      ripN(app.sim, 3); placeAll(app.sim);
      app.sim.round = 22; app.sim.startRound(); app.sim.spawns = []; app.sim.bills = [];
      const L = P.length, put = (kind, v, mods, f) => app.sim.spawn(kind, v, mods, f * L);
      put('bill', 1, [], 0.04); put('bill', 5, [], 0.08); put('bill', 10, [], 0.12); put('bill', 20, [], 0.16); put('bill', 50, [], 0.20); put('bill', 100, [], 0.24);
      put('bill', 20, ['check'], 0.30); put('bill', 20, ['crypto'], 0.34); put('bill', 50, ['strapped'], 0.38); put('bill', 20, ['wire'], 0.42); put('bill', 50, ['accruing'], 0.46);
      put('case', 1500, [], 0.53); put('case', 1500, ['strapped'], 0.58); put('truck', 5000, [], 0.66); put('case', 1500, ['check'], 0.72); put('bailout', 15000, [], 0.84);
      for (let i = 0; i < 12; i++) put('bill', [1, 5, 10, 20][i % 4], [], 0.05 + i * 0.012);
      app.sim.step(1 / 60);
      app.paused = true; AF.ui.tick(); await sleep(60);
      log('money on board', app.sim.bills.length);
    },
    async hand() {
      app.newGame(11); AF.ui.hideAllScreens();
      ripN(app.sim, 2);
      app.sim.gum = 9;
      AF.ui.tick();
      await sleep(50);
      log('hand', app.sim.hand.length);
    },
    async game() {
      app.newGame(3); AF.ui.hideAllScreens();
      ripN(app.sim, 4); placeAll(app.sim);
      app.sim.round = 8;
      await runRoundFor(app.sim, 14);
      app.paused = true;
      const t = app.sim.towers[0]; if (t) { app.view.selected = t; }
      AF.ui.tick();
      await sleep(50);
      if (t) { const r = $('board').getBoundingClientRect(); const x = r.left + t.x * r.width / 1280, y = r.top + t.y * r.height / 720; $('board').dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0 })); $('board').dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0 })); }
      await sleep(50);
      log('bills on board', app.sim.bills.length, 'towers', app.sim.towers.length, 'zones', app.sim.zones.length, 'vehicles', app.sim.vehicles.length, 'inspect open', !$('inspect').hidden);
    },
    async late() {
      app.newGame(5); AF.ui.hideAllScreens();
      ripN(app.sim, 9); placeAll(app.sim);
      app.sim.gum = 200;
      for (const o of [...app.sim.towers, ...app.sim.zones, ...app.sim.vehicles]) { app.sim.upgrade(o.uid); app.sim.upgrade(o.uid); }
      app.sim.round = 25;
      await runRoundFor(app.sim, 22);
      app.paused = true; AF.ui.tick(); await sleep(50);
      log('late bills', app.sim.bills.length, 'room', app.sim.room, 'given', Math.round(app.sim.given));
    },
    async lost() {
      app.newGame(2); AF.ui.hideAllScreens();
      app.sim.round = 20; app.sim.startRound();
      let n = 0; while (app.sim.phase === 'running' && n++ < 60 * 400) app.sim.step(1 / 60);
      log('phase', app.sim.phase, 'room', app.sim.room);
      AF.ui.showEnd();
    },
    async won() {
      app.newGame(2); AF.ui.hideAllScreens();
      app.sim.round = 31; app.sim.phase = 'won'; app.sim.given = 123456; app.sim.stats.finished = 1480;
      AF.ui.showEnd();
    },
    async inspecthand() {
      app.newGame(13); AF.ui.hideAllScreens();
      ripN(app.sim, 1); AF.ui.tick(); await sleep(50);
      const el = $('hand').querySelector('.tcard');
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: 100, clientY: 700 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0, clientX: 100, clientY: 700 }));
      await sleep(50);
      log('inspect open', !$('inspect').hidden, 'placing', !!app.view.placing);
    },
    async drag() {
      // drag the first placeable card from the hand onto a valid spot via real pointer events
      app.newGame(21); AF.ui.hideAllScreens();
      ripN(app.sim, 2); AF.ui.tick(); await sleep(50);
      const h = app.sim.hand.find(h => D.CARD_BY_ID[h.cardId].kind === 'tower');
      if (!h) { log('no tower in hand'); return; }
      const el = $('hand').querySelector('[data-uid="' + h.uid + '"]');
      const er = el.getBoundingClientRect();
      const br = $('board').getBoundingClientRect();
      const sp = spots()[40];
      const tx = br.left + sp.x * br.width / 1280, ty = br.top + sp.y * br.height / 720;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: er.left + 10, clientY: er.top + 10 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: er.left + 40, clientY: er.top - 40 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: tx, clientY: ty }));
      await sleep(30);
      log('ghost', JSON.stringify(app.view.ghost && { ok: app.view.ghost.ok, kind: app.view.ghost.kind, reason: app.view.ghost.reason }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: tx, clientY: ty }));
      await sleep(30);
      log('placed towers', app.sim.towers.length, 'hand', app.sim.hand.length);
    },
    async save() {
      app.newGame(31); AF.ui.hideAllScreens();
      ripN(app.sim, 3); placeAll(app.sim);
      await runRoundFor(app.sim, 999);
      const before = { round: app.sim.round, towers: app.sim.towers.length, gum: app.sim.gum, hand: app.sim.hand.length };
      app.save();
      const ok = app.resume();
      log('resumed', ok, JSON.stringify(before), JSON.stringify({ round: app.sim.round, towers: app.sim.towers.length, gum: app.sim.gum, hand: app.sim.hand.length }));
      await runRoundFor(app.sim, 999);
      log('after resume round', app.sim.round, 'phase', app.sim.phase, 'room', app.sim.room);
    },
  };

  (async () => {
    await sleep(300);
    try { if (!scenarios[name]) throw new Error('unknown scenario ' + name); await scenarios[name](); log('TEST_OK', name); }
    catch (e) { console.log('TEST_ERROR', name, e.message, e.stack); }
  })();
})(window.AF);
