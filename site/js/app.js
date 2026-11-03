/* STOINLY NEXUS: the launcher UI. Plain ES modules, no build step.
 *
 * Screens (hash routes, so they can be linked and screenshotted):
 *   #/                                   home: four game tiles
 *   #/welcome  #/welcome/<n>             first-run walkthrough (over the home screen)
 *   #/settings/<audio|motion|display|controls>[/<gameId>[/rebind/<actionId>/<slot>]]
 *   #/howto/<gameId>                     per-game tutorial from the manifest
 *   #/faq
 * URL params: ?fixtures=1 uses public/test-fixtures/ manifests and an in-memory demo save
 *             (with &broken=<id> or &missing=<id> to show the paperwork states).
 */
import { validateManifest, supportOf } from './manifest.js';
import { keysFor as saveKeysFor, readStats, resetGame, exportAll, previewImport, applyImport, memoryStore } from './saves.js';
import { keyName, conflicts, withKey, RESERVED } from './keys.js';
import { testBeep, testMusic, blip } from './sfx.js';
import * as C from './content.js';

const S = window.StoinlySettings;
const params = new URLSearchParams(location.search);
const FIXTURES = params.get('fixtures') === '1';
const UI_KEY = 'stoinly.nexus.ui.v1';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const overlay = $('#overlay');

// ---------------------------------------------------------------- storage
function safeLocal() {
  try { const t = '__nexus_test__'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; } catch { return memoryStore(); }
}
let store = safeLocal();
function uiPrefs() { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } }
function setUiPrefs(p) { try { localStorage.setItem(UI_KEY, JSON.stringify({ ...uiPrefs(), ...p })); } catch { /* ignore */ } }

// ---------------------------------------------------------------- games + manifests
const games = C.GAMES.map((g) => ({ ...g, status: 'loading', manifest: null, why: '', warnings: [], playable: null }));
const gameById = (id) => games.find((g) => g.id === id);
const okGames = () => games.filter((g) => g.status === 'ok');
const titleOf = (g) => (g.manifest ? g.manifest.title : g.fallbackTitle);
const baseOf = (g) => (FIXTURES ? `test-fixtures/${g.id}/` : `games/${g.id}/`);

function manifestUrl(g) {
  if (FIXTURES) {
    if (params.get('broken') === g.id) return 'test-fixtures/broken/stoinly-game.json';
    if (params.get('missing') === g.id) return 'test-fixtures/nothing-here/stoinly-game.json';
    return `test-fixtures/${g.id}/stoinly-game.json`;
  }
  return `games/${g.id}/stoinly-game.json`;
}

async function loadGame(g) {
  try {
    const r = await fetch(manifestUrl(g), { cache: 'no-store' });
    if (!r.ok) { g.status = 'bad'; g.why = `stoinly-game.json: ${r.status === 404 ? 'not found' : 'HTTP ' + r.status}`; }
    else {
      let raw;
      try { raw = JSON.parse(await r.text()); } catch { raw = undefined; g.status = 'bad'; g.why = 'stoinly-game.json is not valid JSON'; }
      if (g.status !== 'bad') {
        const v = validateManifest(raw, g.id);
        if (v.ok) { g.status = 'ok'; g.manifest = v.manifest; g.warnings = v.warnings; }
        else { g.status = 'bad'; g.why = v.errors.join(' '); }
      }
    }
  } catch (e) { g.status = 'bad'; g.why = 'could not fetch stoinly-game.json'; }
  if (g.warnings.length) console.warn(`[nexus] ${g.id} manifest warnings:`, g.warnings);
  try {
    const entry = g.manifest ? g.manifest.entry : 'index.html';
    const r = await fetch(`games/${g.id}/${entry}`, { method: 'HEAD', cache: 'no-store' });
    g.playable = r.ok;
  } catch { g.playable = false; }
}

// ---------------------------------------------------------------- settings plumbing
let selfSave = false;
let savedTimer = 0;
function saveSettings(mutator, { quiet = false } = {}) {
  const next = JSON.parse(JSON.stringify(S.get()));
  mutator(next);
  selfSave = true;
  S.save(next);
  selfSave = false;
  if (!quiet) flagSaved(C.SETTINGS.saved);
}
function flagSaved(text) {
  const el = $('#savedFlag');
  if (el) {
    el.textContent = '✓ ' + text;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (el.isConnected) el.textContent = ''; }, 2600);
  }
}
function announce(text) { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }

function applyNexusSettings() {
  const s = S.get();
  const html = document.documentElement;
  for (const m of S.CB_MODES) html.classList.toggle('cb-' + m, s.display.colorblind === m && m !== 'off');
  const mb = $('#muteBtn');
  mb.setAttribute('aria-pressed', String(s.audio.mute));
  mb.textContent = s.audio.mute ? 'SOUND OFF' : 'SOUND ON';
  mb.setAttribute('aria-label', s.audio.mute ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off');
}

S.applyDisplay(document);
S.onChange(() => {
  applyNexusSettings();
  if (!selfSave) render(); // a change from another tab, or a restore
});

// ---------------------------------------------------------------- router
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'home', args: parts.slice(1) };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

let cleanup = [];
let lastRouteKey = '';
function render() {
  cleanup.forEach((f) => { try { f(); } catch { /* ignore */ } }); cleanup = [];
  const r = route();
  const focusId = document.activeElement && document.activeElement.id;
  const routeKey = r.name + '/' + (r.args[0] || '') + '/' + (r.args[1] || '');
  const changedScreen = routeKey !== lastRouteKey;
  lastRouteKey = routeKey;

  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === (r.name === 'howto' ? '' : r.name);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#wordmark').innerHTML = (r.name === 'home' || r.name === 'welcome') ? wordmarkHtml() : '';
  $('#newHereSign').hidden = !(r.name === 'home');

  closeOverlay(false);
  if (r.name === 'home') renderHome();
  else if (r.name === 'welcome') { renderHome(); openWelcome(Math.max(0, Math.min(C.WELCOME.length - 1, (Number(r.args[0]) || 1) - 1))); }
  else if (r.name === 'settings') renderSettings(r.args);
  else if (r.name === 'howto') renderHowto(r.args[0]);
  else if (r.name === 'faq') renderFaq();
  else renderLost();

  if (focusId && !changedScreen) { const el = document.getElementById(focusId); if (el && overlay.hidden) el.focus({ preventScroll: true }); }
  else if (changedScreen && r.name !== 'welcome' && !(r.name === 'settings' && r.args[2] === 'rebind')) {
    const h = main.querySelector('h1, h2');
    if (h && document.activeElement !== document.body) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  if (FIXTURES) main.insertAdjacentHTML('afterbegin', '<div class="construction-bar fixture-bar">TEST FIXTURES MODE: THE GAME INFO AND SAVES ON THIS PAGE ARE FAKE. NOTHING HERE TOUCHES YOUR REAL SAVES.</div>');
}
window.addEventListener('hashchange', render);

// ---------------------------------------------------------------- shared bits
function wordmarkHtml() {
  return `<header class="wordmark"><h1 class="stoinly" aria-label="STOINLY NEXUS">STOINLY</h1><p class="computer" aria-hidden="true">NEXUS</p>
    <p class="tagline blink d2">${esc(C.HOME.tagline)}</p></header>`;
}
function renderFrame() {
  $('#tickerTop').innerHTML = `<span>${esc(C.TICKER_TOP)}</span><span>${esc(C.TICKER_TOP)}</span>`;
  $('#tickerBottom').innerHTML = `<span>${esc(C.TICKER_BOTTOM)}</span><span>${esc(C.TICKER_BOTTOM)}</span>`;
  $('#foot').innerHTML = `<p class="stoinly" aria-hidden="true">STOINLY</p><p class="computer" aria-hidden="true">NEXUS</p>
    <p class="smallprint">${esc(C.HOME.footer)}<br>${esc(C.HOME.footer2)}</p>`;
}
const pct = (x) => Math.round(x * 100) + '%';

// ---------------------------------------------------------------- home
function statsHtml(g) {
  if (g.status !== 'ok') return '';
  const st = readStats(store, g.manifest);
  if (!st.found) return `<div class="tile-stats"><span class="stat stat-none">${esc(C.TILE.noSave)}</span></div>`;
  const bits = [];
  if (st.stars !== null) bits.push(`<span class="stat stat-stars"><span aria-hidden="true">★</span><b>${st.stars}</b> STAR${st.stars === 1 ? '' : 'S'}</span>`);
  if (st.streak !== null) bits.push(`<span class="stat stat-streak"><span class="flame" aria-hidden="true"></span><b>${st.streak}</b> DAY STREAK</span>`);
  for (const b of st.bests) bits.push(`<span class="stat stat-best">${esc(b.label)} <b>${esc(b.value)}</b></span>`);
  if (!bits.length) bits.push(`<span class="stat stat-none">SAVED, BUT NO STARS OR SCORES THE NEXUS CAN READ YET.</span>`);
  return `<div class="tile-stats" aria-label="Progress">${bits.join('')}</div>`;
}

function tileHtml(g) {
  const m = g.manifest;
  const accent = m ? m.accent : '#ff0033';
  const href = `games/${encodeURIComponent(g.id)}/${m ? m.entry : 'index.html'}?from=nexus`;
  const cover = m && m.cover
    ? `<img src="${esc(baseOf(g) + m.cover)}" alt="" data-stoinly-cb loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'nocover',textContent:${esc(JSON.stringify(titleOf(g)))}}))">`
    : `<div class="nocover">${esc(titleOf(g))}</div>`;
  const badge = g.status === 'loading' ? '<span class="tile-badge ok">LOADING…</span>'
    : g.status === 'bad' ? '<span class="tile-badge blink d1">PAPERWORK MISSING</span>'
    : `<span class="tile-badge ok">${esc(m.genre || 'GAME')}</span>`;
  let body;
  if (g.status === 'loading') body = `<p class="tile-tagline">The computer is reading the paperwork…</p>`;
  else if (g.status === 'bad') {
    body = `<div class="tile-paper" role="note"><strong>${esc(C.TILE.paperworkHead)}</strong>${esc(C.TILE.paperworkBody)}<div class="why">(${esc(g.why)})</div></div>`;
    if (g.playable === false) body += `<div class="tile-paper" role="note"><strong>${esc(C.TILE.notHere)}</strong>${esc(g.id === 'stoinly-exe' ? C.TILE.notBuilt : C.TILE.notHereBody)}</div>`;
  } else {
    body = `<p class="tile-tagline">${esc(m.tagline)}</p>${statsHtml(g)}`;
    if (g.playable === false) body += `<div class="tile-paper" role="note"><strong>${esc(C.TILE.notHere)}</strong>${esc(g.id === 'stoinly-exe' ? C.TILE.notBuilt : C.TILE.notHereBody)}</div>`;
  }
  const canPlay = g.playable !== false && g.status !== 'loading';
  const playLabel = g.status === 'bad' ? 'PLAY ANYWAY' : 'PLAY';
  const play = canPlay
    ? `<a class="btn btn-play" href="${esc(href)}" aria-label="${esc(playLabel + ' ' + titleOf(g))}">▶ ${playLabel}</a>`
    : `<span class="btn btn-play" aria-disabled="true" role="link" aria-label="${esc(titleOf(g))} is not available">▶ PLAY</span>`;
  const more = g.status === 'ok'
    ? `<a class="btn btn-small" href="#/howto/${encodeURIComponent(g.id)}">HOW TO PLAY</a><a class="btn btn-small" href="#/settings/controls/${encodeURIComponent(g.id)}">KEYS & SAVES</a>`
    : '';
  return `<article class="tile" style="--accent:${esc(accent)}" aria-labelledby="t-${esc(g.id)}">
    <div class="tile-cover">${cover}<div class="scanlines"></div>${badge}</div>
    <div class="tile-body"><h2 class="tile-title" id="t-${esc(g.id)}">${esc(titleOf(g))}</h2>${body}
      <div class="tile-actions">${play}${more}</div></div></article>`;
}

function renderHome() {
  main.innerHTML = `
    <div class="construction-bar"><span aria-hidden="true">⚠</span> ${esc(C.HOME.construction)} <span aria-hidden="true">⚠</span></div>
    <h2 class="sr-only">Games</h2>
    <section class="tiles" aria-label="Games">${games.map(tileHtml).join('')}</section>
    <section class="two-col">
      <div class="panel"><h2 class="panel-title">✉ WHAT PEOPLE ARE SAYING</h2>
        <ul class="testimonials">${C.HOME.testimonials.map(([q, w]) => `<li>“${esc(q)}” — <b>${esc(w)}</b></li>`).join('')}</ul></div>
      <div class="panel" style="display:flex;align-items:center"><div class="bn-frame">
        <div class="bn-head">${esc(C.HOME.noticeHead)}</div><p class="bn-body">${esc(C.HOME.noticeBody)}</p>
        <div class="bn-sign">${esc(C.HOME.noticeSign)}</div>
        <p class="btn-row" style="justify-content:center;margin:10px 0 0"><a class="btn btn-small btn-gold" href="#/settings/audio">OPEN SETTINGS</a><a class="btn btn-small" href="#/welcome">NEW HERE?</a></p>
      </div></div>
    </section>`;
}

// ---------------------------------------------------------------- walkthrough
function overlayOpen(html, label) {
  overlay.innerHTML = html;
  overlay.hidden = false;
  overlay.setAttribute('role', 'presentation');
  const box = overlay.querySelector('.win95-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', label);
  document.body.style.overflow = 'hidden';
}
let overlayKeyHandler = null;
let overlayReturnFocus = null;
function closeOverlay(restoreFocus = true) {
  if (overlay.hidden) return;
  overlay.hidden = true;
  overlay.innerHTML = '';
  document.body.style.overflow = '';
  if (overlayKeyHandler) { window.removeEventListener('keydown', overlayKeyHandler, true); overlayKeyHandler = null; }
  if (restoreFocus && overlayReturnFocus && overlayReturnFocus.isConnected) overlayReturnFocus.focus();
  overlayReturnFocus = null;
}
function trapTab(e) {
  if (e.key !== 'Tab') return false;
  const f = [...overlay.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
  if (!f.length) return false;
  const i = f.indexOf(document.activeElement);
  const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
  f[next].focus(); e.preventDefault();
  return true;
}

function openWelcome(step) {
  const w = C.WELCOME[step];
  const last = step === C.WELCOME.length - 1;
  overlayOpen(`<div class="win95-box">
    <div class="win95-titlebar"><span>NEW HERE? — STEP ${step + 1} OF ${C.WELCOME.length}</span><button class="win95-x" data-wt="close" aria-label="Skip the walkthrough">✕</button></div>
    <div class="win95-body"><h2 id="wtTitle">${esc(w.title)}</h2><p>${esc(w.body)}</p><p class="win95-quip">${esc(w.quip)}</p>
      ${last ? `<label class="wt-check"><input type="checkbox" id="wtAgain"> Show this walkthrough again next time</label>` : ''}</div>
    <div class="dots" aria-hidden="true">${C.WELCOME.map((_, i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('')}</div>
    <div class="win95-actions">
      ${step > 0 ? '<button class="win95-btn" data-wt="back">◄ BACK</button>' : '<button class="win95-btn" data-wt="close">SKIP</button>'}
      ${last ? '<button class="win95-btn primary" data-wt="done">LET’S GO</button>' : '<button class="win95-btn primary" data-wt="next">NEXT ►</button>'}
    </div></div>`, 'New here? Walkthrough');
  overlay.querySelector('.primary').focus();
  const finish = () => {
    const again = $('#wtAgain');
    setUiPrefs({ welcomed: again ? !again.checked : true });
    closeOverlay(false);
    go('#/');
  };
  overlay.onclick = (e) => {
    const b = e.target.closest('[data-wt]');
    if (!b) return;
    const a = b.dataset.wt;
    if (a === 'next') go(`#/welcome/${step + 2}`);
    else if (a === 'back') go(`#/welcome/${step}`);
    else finish();
  };
  overlayKeyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    else if (e.key === 'ArrowRight' && !last) go(`#/welcome/${step + 2}`);
    else if (e.key === 'ArrowLeft' && step > 0) go(`#/welcome/${step}`);
    else trapTab(e);
  };
  window.addEventListener('keydown', overlayKeyHandler, true);
}

// ---------------------------------------------------------------- settings
const TAB_IDS = ['audio', 'motion', 'display', 'controls'];

function ignoredChips(key) {
  const no = []; const part = [];
  for (const g of okGames()) {
    const s = supportOf(g.manifest, key);
    if (s === 'no') no.push(titleOf(g)); else if (s === 'partial') part.push(titleOf(g));
  }
  if (!no.length && !part.length) return '';
  return `<div class="ignored">${no.map((t) => `<span class="chip chip-no">${esc(t)} IGNORES THIS</span>`).join('')}${part.map((t) => `<span class="chip chip-partial">${esc(t)}: PARTLY</span>`).join('')}</div>`;
}

function settingRow({ id, label, help, quip, control, support }) {
  return `<div class="setting"><div><h3 class="setting-label" id="${id}-label">${esc(label)}</h3><p class="setting-help" id="${id}-help">${help}</p>
    ${quip ? `<p class="setting-quip">${esc(quip)}</p>` : ''}${support ? ignoredChips(support) : ''}</div>
    <div class="setting-control">${control}</div></div>`;
}
function rangeCtl(id, value, min, max, step, fmt) {
  return `<div class="range-row"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" aria-labelledby="${id}-label" aria-describedby="${id}-help" aria-valuetext="${esc(fmt(value))}"><output for="${id}" id="${id}-out">${esc(fmt(value))}</output></div>`;
}
function switchCtl(id, on) {
  return `<button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-labelledby="${id}-label" aria-describedby="${id}-help"><span class="knob" aria-hidden="true"></span><span class="state-on">ON</span><span class="state-off">OFF</span></button>`;
}

function renderSettings(args) {
  const tab = TAB_IDS.includes(args[0]) ? args[0] : 'audio';
  const tabs = TAB_IDS.map((t) => `<button type="button" class="tab" role="tab" id="tab-${t}" aria-selected="${t === tab}" aria-controls="panel" tabindex="${t === tab ? 0 : -1}" data-tab="${t}">${esc(C.SETTINGS.tabs[t])}</button>`).join('');
  let body = '';
  if (tab === 'audio') body = audioTab();
  else if (tab === 'motion') body = motionTab();
  else if (tab === 'display') body = displayTab();
  else body = controlsTab(args[1]);
  main.innerHTML = `<div class="page-head"><h1 class="page-title">SETTINGS</h1><p class="page-sub">${esc(C.SETTINGS.sub)}</p></div>
    <div class="tabs" role="tablist" aria-label="Settings groups">${tabs}</div>
    <section class="tabpanel" role="tabpanel" id="panel" aria-labelledby="tab-${tab}">${body}</section>
    <div class="settings-foot"><span class="saved-flag" id="savedFlag" role="status" aria-live="polite"></span>
      <button type="button" class="btn btn-small btn-danger" id="restoreBtn">${esc(C.SETTINGS.restore)}</button></div>`;
  bindSettings(tab, args);
}

function audioTab() {
  const a = S.get().audio;
  return [
    settingRow({ id: 'master', label: 'MASTER VOLUME', help: 'Everything, in every game.', quip: C.SETTINGS.quips.master, control: rangeCtl('master', Math.round(a.master * 100), 0, 100, 1, (v) => v + '%'), support: 'audio' }),
    settingRow({ id: 'music', label: 'MUSIC', help: 'Background music, in the games that have music.', control: rangeCtl('music', Math.round(a.music * 100), 0, 100, 1, (v) => v + '%') + '<button type="button" class="btn btn-small" id="testMusic">▶ TEST MUSIC</button>', support: 'music' }),
    settingRow({ id: 'sfx', label: 'SOUND EFFECTS', help: 'Hits, coins, explosions, menus.', control: rangeCtl('sfx', Math.round(a.sfx * 100), 0, 100, 1, (v) => v + '%') + '<button type="button" class="btn btn-small" id="testBeep">▶ TEST BEEP</button><p class="msg ok" id="beepMsg" role="status"></p>', support: 'audio' }),
    settingRow({ id: 'mute', label: 'MUTE EVERYTHING', help: 'Silences all games. The sliders keep their places for when you turn it back off.', quip: C.SETTINGS.quips.mute, control: switchCtl('mute', a.mute), support: 'audio' }),
  ].join('');
}

function motionTab() {
  const m = S.get().motion;
  const os = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  return [
    settingRow({ id: 'reduce', label: 'REDUCE MOTION', help: 'Turns off screen shake and hit-stop, cuts particles to a quarter at most, and stops flashes and blinking.' + (os ? ' <strong class="warn">Your computer already asks for reduced motion, so this is on in every game either way.</strong>' : ''), quip: C.SETTINGS.quips.reduce,
      control: switchCtl('reduce', m.reduce) + `<div class="preview" aria-hidden="true"><span class="preview-label">LIVE PREVIEW</span><div class="pv-thing pv-bob">S</div><span class="preview-note" id="pvReduceNote"></span></div>` }),
    settingRow({ id: 'shake', label: 'SCREEN SHAKE', help: 'How hard the screen shakes on big hits. 0% means no shake.', control: rangeCtl('shake', Math.round(m.shake * 100), 0, 100, 5, (v) => v + '%') +
      `<div class="preview" aria-hidden="true"><span class="preview-label">LIVE PREVIEW</span><div class="pv-thing" id="pvShake">!</div><span class="preview-note" id="pvShakeNote"></span></div>`, support: 'shake' }),
    settingRow({ id: 'flashes', label: 'FLASHES', help: 'White hit flashes, strobes and blinking text. Turn off if flashing light bothers you.', quip: C.SETTINGS.quips.flashes, control: switchCtl('flashes', m.flashes) +
      `<div class="preview" aria-hidden="true"><span class="preview-label">LIVE PREVIEW</span><div class="pv-thing" id="pvFlashThing">★</div><div class="pv-flash" id="pvFlash"></div><span class="preview-note" id="pvFlashNote"></span></div>`, support: 'flashes' }),
    settingRow({ id: 'particles', label: 'PARTICLE AMOUNT', help: 'How many sparks, coins and bits of confetti fly around.', quip: C.SETTINGS.quips.particles, control: rangeCtl('particles', Math.round(m.particles * 100), 0, 100, 5, (v) => v + '%') +
      `<div class="preview" aria-hidden="true"><span class="preview-label">LIVE PREVIEW</span><canvas id="pvParticles" width="340" height="92"></canvas><span class="preview-note" id="pvPartNote"></span></div>`, support: 'particles' }),
  ].join('');
}

const CB_LABELS = { off: ['OFF', 'normal colours'], protanopia: ['PROTANOPIA', 'red-weak'], deuteranopia: ['DEUTERANOPIA', 'green-weak'], tritanopia: ['TRITANOPIA', 'blue-weak'] };
const RAINBOW = ['#ff0000', '#ff8800', '#ffee00', '#00ff00', '#00ffff', '#0088ff', '#ff00ff', '#ffffff'];
function displayTab() {
  const d = S.get().display;
  return [
    settingRow({ id: 'fullscreen', label: 'FULLSCREEN ON LAUNCH', help: 'Games switch to fullscreen on your first click or key press after they open. Esc leaves fullscreen. The nexus itself stays in a window.', quip: C.SETTINGS.quips.fullscreen, control: switchCtl('fullscreen', d.fullscreen) }),
    settingRow({ id: 'textScale', label: 'TEXT SIZE', help: 'Makes text bigger in the nexus and in the games that support it.', quip: C.SETTINGS.quips.textScale, control: rangeCtl('textScale', Math.round(d.textScale * 100), 80, 160, 10, (v) => v + '%') +
      `<div class="text-preview" aria-hidden="true"><p class="tp-big">FREE MONEY</p><p>The bank said my account is full.</p></div>`, support: 'textScale' }),
    settingRow({ id: 'cb', label: 'COLOUR-BLIND MODE', help: 'An approximate colour filter over game screens, to pull apart colours that are hard to tell apart. Compare the two strips below.',
      control: `<div class="seg" role="radiogroup" aria-labelledby="cb-label">${S.CB_MODES.map((mode) => `<button type="button" role="radio" id="cb-${mode}" aria-checked="${d.colorblind === mode}" data-cb="${mode}" tabindex="${d.colorblind === mode ? 0 : -1}">${CB_LABELS[mode][0]}<small>${CB_LABELS[mode][1]}</small></button>`).join('')}</div>
        <div class="cb-pair"><span>WITHOUT</span><span>WITH YOUR FILTER</span></div>
        <div class="cb-pair" aria-hidden="true"><div class="cb-swatch">${RAINBOW.map((c) => `<span style="background:${c}"></span>`).join('')}</div><div class="cb-swatch" data-stoinly-cb>${RAINBOW.map((c) => `<span style="background:${c}"></span>`).join('')}</div></div>`, support: 'colorblind' }),
    settingRow({ id: 'perf', label: 'PERFORMANCE MODE', help: 'Fewer particles, no glow or blur, cheaper backgrounds. Try it if a game stutters.', quip: C.SETTINGS.quips.perf, control: switchCtl('perf', d.performance), support: 'performance' }),
  ].join('');
}

// --- controls & data
function bindingsFor(g) {
  const out = {};
  for (const a of g.manifest.actions) out[a.id] = S.keysFor(g.id, a.id, a.defaults);
  return out;
}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
function supportSummary(g) {
  const names = { audio: 'sound', music: 'music', shake: 'screen shake', flashes: 'flashes', particles: 'particle amount', textScale: 'text size', colorblind: 'colour-blind mode', performance: 'performance mode', rebinding: 'key rebinding' };
  const no = Object.keys(names).filter((k) => supportOf(g.manifest, k) === 'no').map((k) => names[k]);
  const part = Object.keys(names).filter((k) => supportOf(g.manifest, k) === 'partial').map((k) => names[k]);
  const unk = Object.keys(names).filter((k) => supportOf(g.manifest, k) === 'unknown').map((k) => names[k]);
  const bits = [];
  if (no.length) bits.push(`<strong class="warn">Ignores:</strong> ${esc(no.join(', '))}.`);
  if (part.length) bits.push(`<strong>Partly supports:</strong> ${esc(part.join(', '))}.`);
  if (unk.length) bits.push(`<strong>Didn’t say about:</strong> ${esc(unk.join(', '))}.`);
  if (!bits.length) bits.push('Listens to every nexus setting.');
  return `<p class="keys-note">${bits.join(' ')}</p>`;
}

function controlsTab(gameArg) {
  const list = okGames();
  const picker = `<div class="seg game-picker" role="group" aria-label="Pick a game">${games.map((g) => `<button type="button" data-game="${esc(g.id)}" aria-pressed="${g.id === gameArg || (!gameArg && list[0] && g.id === list[0].id)}" ${g.status !== 'ok' ? 'disabled title="No paperwork from this game"' : ''}>${esc(titleOf(g))}${g.status !== 'ok' ? '<small>NO PAPERWORK</small>' : ''}</button>`).join('')}</div>`;
  const g = gameById(gameArg) && gameById(gameArg).status === 'ok' ? gameById(gameArg) : list[0];
  let gameHtml = '';
  if (!g) gameHtml = `<p class="keys-note">No game sent its paperwork, so there are no keys or saves to show. The computer is embarrassed.</p>`;
  else {
    const m = g.manifest;
    const b = bindingsFor(g);
    const canRebind = supportOf(m, 'rebinding') !== 'no';
    let keys;
    if (!m.actions.length) keys = `<p class="keys-note">${esc(C.KEYS.none)}</p>`;
    else {
      keys = (canRebind ? '' : `<p class="keys-note warn">${esc(C.KEYS.noRebind)}</p>`) +
        `<table class="keys-table"><caption class="sr-only">Keys for ${esc(m.title)}</caption><thead><tr><th scope="col">ACTION</th><th scope="col">KEYS (CLICK ONE TO CHANGE IT)</th><th scope="col"><span class="sr-only">Reset</span></th></tr></thead><tbody>` +
        m.actions.map((a) => {
          const cur = b[a.id];
          const changed = !sameList(cur, a.defaults);
          const caps = cur.map((c, i) => canRebind
            ? `<button type="button" class="keycap ${a.defaults.includes(c) ? '' : 'changed'}" id="k-${esc(a.id)}-${i}" data-rebind="${esc(a.id)}" data-slot="${i}" aria-label="${esc(a.label)}: ${esc(keyName(c))}. Change this key">${esc(keyName(c))}</button>`
            : `<span class="keycap">${esc(keyName(c))}</span>`).join('');
          const add = canRebind && cur.length < 3 ? `<button type="button" class="keycap add" id="k-${esc(a.id)}-add" data-rebind="${esc(a.id)}" data-slot="${cur.length}" aria-label="Add a key for ${esc(a.label)}">+</button>` : '';
          const reset = canRebind ? `<button type="button" class="btn btn-small" id="r-${esc(a.id)}" data-reset-action="${esc(a.id)}" ${changed ? '' : 'disabled'} aria-label="Reset ${esc(a.label)} to its default keys" title="Back to default">↺</button>` : '';
          return `<tr><td class="act">${esc(a.label)}</td><td>${caps || '<span class="warn">NO KEY</span>'}${add}</td><td>${reset}</td></tr>`;
        }).join('') + '</tbody></table>' +
        (canRebind ? `<p class="btn-row" style="margin-top:10px"><button type="button" class="btn btn-small" id="resetGameKeys" data-reset-game="${esc(g.id)}">${esc(C.KEYS.resetGame)}</button></p>` : '');
    }
    const keysList = saveKeysFor(store, m);
    const saves = keysList.length
      ? `<ul class="save-list">${keysList.map((k) => `<li><span>${esc(k)}</span><span class="sz">${(store.getItem(k) || '').length.toLocaleString()} chars</span></li>`).join('')}</ul>
         <button type="button" class="btn btn-small btn-danger" id="resetSaveBtn" data-reset-save="${esc(g.id)}">${esc(C.DATA.resetBtn)}</button><div id="resetSaveBox"></div>`
      : `<p class="keys-note">${esc(C.DATA.none)}</p>`;
    gameHtml = `<div class="game-card" style="--accent:${esc(m.accent)}"><h3>${esc(m.title)}: KEYS</h3>${supportSummary(g)}${keys}</div>
      <div class="game-card" style="--accent:${esc(m.accent)}"><h3>${esc(m.title)}: ${esc(C.DATA.head)}</h3>
        <p class="keys-note">Looked for: ${[...m.saveKeys.map((k) => `<code>${esc(k)}</code>`), ...m.savePrefixes.map((p) => `<code>${esc(p)}…</code>`)].join(' ') || 'nothing (this game listed no save keys)'}</p>${saves}<p class="msg ok" id="saveMsg" role="status"></p></div>`;
  }
  const io = `<div class="game-card"><h3>${esc(C.DATA.exportHead)}</h3><p class="keys-note">${esc(C.DATA.exportHelp)}</p>
    <div class="btn-row"><button type="button" class="btn btn-small btn-gold" id="exportBtn">${esc(C.DATA.exportBtn)}</button>
    <label class="btn btn-small" for="importFile" id="importLabel" tabindex="0" role="button">${esc(C.DATA.importBtn)}</label><input type="file" id="importFile" accept="application/json,.json" class="sr-only" tabindex="-1"></div>
    <div id="importBox"></div></div>`;
  return picker + gameHtml + io;
}

function bindSettings(tab, args) {
  const panel = $('#panel');
  // tabs: click + arrow keys
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => { blip(); go('#/settings/' + t.dataset.tab); };
    t.onkeydown = (e) => {
      const i = TAB_IDS.indexOf(t.dataset.tab);
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % TAB_IDS.length;
      else if (e.key === 'ArrowLeft') j = (i + TAB_IDS.length - 1) % TAB_IDS.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = TAB_IDS.length - 1;
      if (j !== null) { e.preventDefault(); go('#/settings/' + TAB_IDS[j]); setTimeout(() => { const n = $('#tab-' + TAB_IDS[j]); if (n) n.focus(); }, 0); }
    };
  });
  // restore defaults: two-step
  const rb = $('#restoreBtn');
  let armed = false;
  rb.onclick = () => {
    if (!armed) { armed = true; rb.textContent = C.SETTINGS.restoreConfirm; setTimeout(() => { if (rb.isConnected) { armed = false; rb.textContent = C.SETTINGS.restore; } }, 4000); return; }
    S.save(JSON.parse(JSON.stringify(S.DEFAULTS)));
    setTimeout(() => flagSaved(C.SETTINGS.restored), 0);
    announce(C.SETTINGS.restored);
  };

  // ranges
  const ranges = {
    master: (s, v) => { s.audio.master = v / 100; }, music: (s, v) => { s.audio.music = v / 100; }, sfx: (s, v) => { s.audio.sfx = v / 100; },
    shake: (s, v) => { s.motion.shake = v / 100; }, particles: (s, v) => { s.motion.particles = v / 100; }, textScale: (s, v) => { s.display.textScale = v / 100; },
  };
  for (const [id, set] of Object.entries(ranges)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      const v = Number(el.value);
      const out = document.getElementById(id + '-out');
      out.textContent = v + '%';
      el.setAttribute('aria-valuetext', v + '%');
      saveSettings((s) => set(s, v));
    });
  }
  // switches
  const switches = {
    mute: (s) => { s.audio.mute = !s.audio.mute; }, reduce: (s) => { s.motion.reduce = !s.motion.reduce; }, flashes: (s) => { s.motion.flashes = !s.motion.flashes; },
    fullscreen: (s) => { s.display.fullscreen = !s.display.fullscreen; }, perf: (s) => { s.display.performance = !s.display.performance; },
  };
  for (const [id, flip] of Object.entries(switches)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.onclick = () => { saveSettings(flip); el.setAttribute('aria-checked', String(el.getAttribute('aria-checked') !== 'true')); blip(el.getAttribute('aria-checked') === 'true'); };
  }
  // colour-blind radios
  panel.querySelectorAll('[data-cb]').forEach((b) => {
    b.onclick = () => { saveSettings((s) => { s.display.colorblind = b.dataset.cb; }); render(); const n = $('#cb-' + b.dataset.cb); if (n) n.focus(); };
    b.onkeydown = (e) => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const i = S.CB_MODES.indexOf(b.dataset.cb);
      const j = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : S.CB_MODES.length - 1)) % S.CB_MODES.length;
      saveSettings((s) => { s.display.colorblind = S.CB_MODES[j]; }); render(); const n = $('#cb-' + S.CB_MODES[j]); if (n) n.focus();
    };
  });
  // audio tests
  const tb = $('#testBeep');
  if (tb) tb.onclick = () => { const v = testBeep(); const msg = $('#beepMsg'); msg.textContent = v > 0 ? `${C.SETTINGS.beepOk} (${pct(v)})` : C.SETTINGS.beepMuted; };
  const tm = $('#testMusic');
  if (tm) tm.onclick = () => { const v = testMusic(); const msg = $('#beepMsg'); msg.textContent = v > 0 ? `${C.SETTINGS.musicOk} (${pct(v)})` : C.SETTINGS.beepMuted; };

  if (tab === 'motion') startMotionPreviews();
  if (tab === 'controls') bindControls(args);
}

// --- motion previews: driven by the same helpers the games use
function startMotionPreviews() {
  const shakeEl = $('#pvShake');
  const flashEl = $('#pvFlash');
  const cv = $('#pvParticles');
  const cx = cv.getContext('2d');
  const parts = [];
  let raf = 0;
  let t0 = performance.now();
  let lastBurst = -1;
  const COLORS = ['#ff00ff', '#00ffff', '#00ff00', '#ffd700', '#ff0033', '#ffffff'];
  function frame(now) {
    const t = (now - t0) / 1000;
    const cycle = t % 1.6;
    const ss = S.shakeScale();
    const amp = cycle < 0.45 ? 12 * ss * (1 - cycle / 0.45) : 0;
    shakeEl.style.transform = `translate(${(Math.random() * 2 - 1) * amp}px, ${(Math.random() * 2 - 1) * amp}px)`;
    $('#pvShakeNote').textContent = ss > 0 ? `SHAKE ${pct(ss)}` : 'NO SHAKE';
    const fl = S.flashesAllowed();
    flashEl.style.opacity = fl && cycle < 0.18 ? String(0.85 * (1 - cycle / 0.18)) : '0';
    $('#pvFlashNote').textContent = fl ? 'FLASHING' : 'FLASH SKIPPED';
    $('#pvReduceNote').textContent = S.reducedMotion() ? 'HOLDING STILL' : 'BOBBING';
    const burst = Math.floor(t / 1.2);
    const ps = S.particleScale();
    if (burst !== lastBurst) {
      lastBurst = burst;
      const n = Math.round(60 * ps);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2; const sp = 40 + Math.random() * 120;
        parts.push({ x: cv.width / 2, y: cv.height / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 1, c: COLORS[i % COLORS.length] });
      }
    }
    $('#pvPartNote').textContent = `${Math.round(60 * ps)} PARTICLES PER BURST`;
    cx.clearRect(0, 0, cv.width, cv.height);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx / 60; p.y += p.vy / 60; p.vy += 140 / 60; p.life -= 1 / 60;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      cx.globalAlpha = Math.max(0, p.life); cx.fillStyle = p.c; cx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    cx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  frame(performance.now()); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); // draw once now, for headless screenshots
  cleanup.push(() => cancelAnimationFrame(raf));
}

// --- controls binding, rebind dialog, saves
function bindControls(args) {
  const panel = $('#panel');
  const g = (gameById(args[1]) && gameById(args[1]).status === 'ok') ? gameById(args[1]) : okGames()[0];
  panel.querySelectorAll('[data-game]').forEach((b) => { b.onclick = () => go(`#/settings/controls/${b.dataset.game}`); });
  panel.querySelectorAll('[data-rebind]').forEach((b) => {
    b.onclick = () => openRebind(g, b.dataset.rebind, Number(b.dataset.slot), b);
  });
  panel.querySelectorAll('[data-reset-action]').forEach((b) => {
    b.onclick = () => { S.setKeys(g.id, b.dataset.resetAction, []); flagSaved('KEYS RESET. FACTORY STOINLY.'); };
  });
  const rg = $('#resetGameKeys');
  if (rg) rg.onclick = () => {
    const s = JSON.parse(JSON.stringify(S.get())); delete s.controls[g.id]; S.save(s);
    flagSaved(`ALL ${titleOf(g)} KEYS ARE BACK TO DEFAULT.`);
  };
  // save reset: typed confirm
  const rs = $('#resetSaveBtn');
  if (rs) rs.onclick = () => {
    const n = saveKeysFor(store, g.manifest).length;
    $('#resetSaveBox').innerHTML = `<div class="confirm-box" role="group" aria-label="Confirm save reset"><p>${esc(C.DATA.resetAsk(n, titleOf(g)))}</p>
      <div class="btn-row"><label class="sr-only" for="resetWord">Type DELETE</label><input type="text" id="resetWord" autocomplete="off" spellcheck="false" placeholder="DELETE">
      <button type="button" class="btn btn-small btn-danger" id="resetGo" disabled>DELETE IT</button><button type="button" class="btn btn-small" id="resetCancel">CANCEL</button></div></div>`;
    const word = $('#resetWord'); const goBtn = $('#resetGo');
    word.focus();
    word.oninput = () => { goBtn.disabled = word.value.trim().toUpperCase() !== 'DELETE'; };
    word.onkeydown = (e) => { if (e.key === 'Enter' && !goBtn.disabled) goBtn.click(); if (e.key === 'Escape') $('#resetCancel').click(); };
    $('#resetCancel').onclick = () => { $('#resetSaveBox').innerHTML = ''; rs.focus(); };
    goBtn.onclick = () => {
      const gone = resetGame(store, g.manifest);
      render();
      const msg = $('#saveMsg'); if (msg) msg.textContent = `${C.DATA.resetDone} (${gone.length} item${gone.length === 1 ? '' : 's'} removed)`;
      announce(C.DATA.resetDone);
    };
  };
  // export
  $('#exportBtn').onclick = () => {
    const data = exportAll(store, okGames().map((x) => x.manifest));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `stoinly-nexus-saves-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flagSaved('EXPORTED. KEEP IT SOMEWHERE SAFE. NOT THE BANK.');
  };
  // import
  const file = $('#importFile');
  const lbl = $('#importLabel');
  lbl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  file.onchange = async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const text = await f.text();
    file.value = '';
    showImportPreview(text, f.name);
  };
}

function showImportPreview(text, name) {
  const box = $('#importBox');
  const pv = previewImport(text, store, okGames().map((x) => x.manifest));
  if (!pv.ok) { box.innerHTML = `<p class="msg bad" role="alert">${esc(pv.error)} (${esc(name)})</p>`; return; }
  const changing = pv.rows.filter((r) => r.status !== 'same').length + (pv.settings && pv.settings !== 'same' ? 1 : 0);
  const label = { new: 'NEW', replace: 'REPLACES WHAT IS HERE', same: 'ALREADY THE SAME' };
  const rows = pv.rows.map((r) => `<tr><td>${esc(titleOf(gameById(r.gameId)))}</td><td>${esc(r.key)}</td><td class="st-${r.status}">${label[r.status]}</td></tr>`).join('') +
    (pv.settings ? `<tr><td>NEXUS</td><td>settings and keys</td><td class="st-${pv.settings}">${label[pv.settings]}</td></tr>` : '') +
    pv.skipped.map((s) => `<tr><td>${esc(gameById(s.gameId) ? titleOf(gameById(s.gameId)) : s.gameId)}</td><td>${esc(s.key)}</td><td class="st-skip">SKIPPED: ${esc(s.why)}</td></tr>`).join('');
  box.innerHTML = `<div class="confirm-box" role="group" aria-label="Import preview"><p><strong>${esc(name)}</strong>. Here is what importing it would do. Nothing has changed yet.</p>
    <table class="import-table"><thead><tr><th>GAME</th><th>ITEM</th><th>WHAT HAPPENS</th></tr></thead><tbody>${rows || '<tr><td colspan="3">The file is empty.</td></tr>'}</tbody></table>
    ${changing ? `<div class="btn-row"><button type="button" class="btn btn-small btn-gold" id="importGo">${esc(C.DATA.importConfirm(changing))}</button><button type="button" class="btn btn-small" id="importCancel">CANCEL</button></div>`
      : `<p>${esc(C.DATA.nothingToImport)}</p><button type="button" class="btn btn-small" id="importCancel">OK</button>`}</div>`;
  const cancel = $('#importCancel');
  cancel.onclick = () => { box.innerHTML = ''; $('#importLabel').focus(); };
  const goBtn = $('#importGo');
  if (goBtn) {
    goBtn.focus();
    goBtn.onclick = () => {
      const n = applyImport(pv, store);
      if (pv.settings && pv.settings !== 'same') { S.save(S.sanitize(JSON.parse(pv.settingsValue || 'null'))); }
      render();
      const msg = $('#saveMsg') || $('#savedFlag'); if (msg) msg.textContent = C.DATA.imported(n);
      announce(C.DATA.imported(n));
    };
  } else cancel.focus();
}

function openRebind(g, actionId, slot, returnTo) {
  const a = g.manifest.actions.find((x) => x.id === actionId);
  if (!a) return;
  overlayReturnFocus = returnTo || document.activeElement;
  let state = { phase: 'listen', code: null, hits: [] };
  const cur = () => S.keysFor(g.id, a.id, a.defaults);
  function apply(code, takeFrom) {
    let next = withKey(cur(), slot, code);
    if (sameList(next, a.defaults)) next = [];
    S.setKeys(g.id, a.id, next);
    if (takeFrom) for (const h of takeFrom) {
      const other = g.manifest.actions.find((x) => x.id === h.id);
      const rest = S.keysFor(g.id, other.id, other.defaults).filter((c) => c !== code);
      S.setKeys(g.id, other.id, sameList(rest, other.defaults) ? [] : rest);
    }
    const msg = C.KEYS.bound(keyName(code), a.label);
    closeOverlay(false);
    go(`#/settings/controls/${g.id}`);
    render();
    flagSaved(msg); announce(msg);
    const back = document.getElementById(`k-${a.id}-${Math.min(slot, S.keysFor(g.id, a.id, a.defaults).length - 1)}`);
    if (back) back.focus();
  }
  function draw() {
    const existing = cur()[slot];
    const b = bindingsFor(g);
    let inner;
    if (state.phase === 'listen') {
      inner = `<p>${existing ? `Replacing <strong>${esc(keyName(existing))}</strong> for “${esc(a.label)}”.` : `Adding a key for “${esc(a.label)}”.`}</p>
        <div class="listening" aria-live="assertive">${esc(state.note || C.KEYS.listen)}</div><p class="win95-quip">${esc(C.KEYS.listenSub)}</p>`;
    } else {
      const names = state.hits.map((h) => `“${esc(h.label)}”`).join(' and ');
      const canTake = state.hits.every((h) => {
        const other = g.manifest.actions.find((x) => x.id === h.id);
        return (b[other.id] || []).filter((c) => c !== state.code).length > 0;
      });
      inner = `<div class="conflict" role="alert">⚠ ${esc(keyName(state.code))} ALREADY DOES ${names}. ${esc(C.KEYS.conflictTail)}</div>
        <p>What should happen?</p>`;
      state.canTake = canTake;
    }
    const buttons = state.phase === 'listen'
      ? `${existing && cur().length > 1 ? '<button class="win95-btn" data-rb="remove">REMOVE THIS KEY</button>' : ''}<button class="win95-btn primary" data-rb="cancel">CANCEL (ESC)</button>`
      : `<button class="win95-btn primary" data-rb="both">USE IT FOR BOTH</button>${state.canTake ? `<button class="win95-btn" data-rb="take">MOVE IT HERE</button>` : ''}<button class="win95-btn" data-rb="again">PICK ANOTHER KEY</button><button class="win95-btn" data-rb="cancel">CANCEL</button>`;
    overlayOpen(`<div class="win95-box"><div class="win95-titlebar"><span>REBIND — ${esc(titleOf(g))}</span><button class="win95-x" data-rb="cancel" aria-label="Cancel">✕</button></div>
      <div class="win95-body"><h2>${esc(a.label)}</h2>${inner}</div><div class="win95-actions">${buttons}</div></div>`, `Rebind ${a.label}`);
    if (state.phase === 'conflict') overlay.querySelector('.primary').focus();
    else overlay.querySelector('.win95-box').setAttribute('tabindex', '-1'), overlay.querySelector('.win95-box').focus();
  }
  overlay.onclick = (e) => {
    const btn = e.target.closest('[data-rb]');
    if (!btn) return;
    const act = btn.dataset.rb;
    if (act === 'cancel') { closeOverlay(); go(`#/settings/controls/${g.id}`); }
    else if (act === 'again') { state = { phase: 'listen', code: null, hits: [] }; draw(); }
    else if (act === 'both') apply(state.code);
    else if (act === 'take') apply(state.code, state.hits);
    else if (act === 'remove') {
      const next = cur().filter((_, i) => i !== slot);
      S.setKeys(g.id, a.id, sameList(next, a.defaults) ? [] : next);
      closeOverlay(false); go(`#/settings/controls/${g.id}`); render(); flagSaved('KEY REMOVED.');
    }
  };
  overlayKeyHandler = (e) => {
    if (e.key === 'Escape' || e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); closeOverlay(); go(`#/settings/controls/${g.id}`); return; }
    if (state.phase !== 'listen') { trapTab(e); return; }
    e.preventDefault(); e.stopPropagation();
    if (!e.code || e.repeat) return;
    if (RESERVED.includes(e.code)) { state.note = C.KEYS.reserved; draw(); return; }
    const hits = conflicts(g.manifest.actions, bindingsFor(g), a.id, e.code);
    if (cur().includes(e.code) && cur()[slot] !== e.code) { state.note = `${keyName(e.code)} ALREADY DOES THIS. PICK ANOTHER KEY.`; draw(); return; }
    if (hits.length) { state = { phase: 'conflict', code: e.code, hits }; draw(); return; }
    apply(e.code);
  };
  window.addEventListener('keydown', overlayKeyHandler, true);
  draw();
}

// ---------------------------------------------------------------- tutorial
function renderHowto(id) {
  const g = gameById(id);
  if (!g) return renderLost();
  if (g.status !== 'ok') {
    main.innerHTML = `<div class="page-head"><h1 class="page-title">${esc(titleOf(g))}</h1><p class="page-sub">HOW TO PLAY</p></div>
      <div class="bn-frame"><div class="bn-head">⚠ ${esc(C.TILE.paperworkHead)} ⚠</div><p class="bn-body">${esc(C.TILE.paperworkBody)}</p><div class="bn-sign">(${esc(g.why || 'still loading')})</div></div>
      <p class="btn-row" style="justify-content:center;margin-top:20px"><a class="btn" href="#/">◄ BACK</a></p>`;
    return;
  }
  const m = g.manifest;
  const b = bindingsFor(g);
  const sup = { audio: 'Sound volume', music: 'Music volume', shake: 'Screen shake', flashes: 'Flashes', particles: 'Particle amount', textScale: 'Text size', colorblind: 'Colour-blind mode', performance: 'Performance mode', rebinding: 'Key rebinding' };
  const supWord = { yes: 'YES', no: 'IGNORES', partial: 'PARTLY', unknown: 'DIDN’T SAY' };
  main.innerHTML = `<div style="--accent:${esc(m.accent)}">
    <div class="howto-hero"><div class="tile-cover">${m.cover ? `<img src="${esc(baseOf(g) + m.cover)}" alt="" data-stoinly-cb>` : `<div class="nocover">${esc(m.title)}</div>`}<div class="scanlines"></div><span class="tile-badge ok">${esc(m.genre || 'GAME')}</span></div>
      <div><h1 class="page-title" style="text-align:left">${esc(m.title)}</h1><p class="tile-tagline" style="margin-top:8px">${esc(m.tagline)}</p>
        <p class="setting-quip">${esc(C.HOWTO.head)}</p><p class="setting-quip">${esc(g.quip)}</p>
        <div class="btn-row" style="margin-top:12px"><a class="btn btn-play" href="games/${encodeURIComponent(g.id)}/${esc(m.entry)}?from=nexus">▶ PLAY</a><a class="btn btn-small" href="#/">◄ ALL GAMES</a></div></div></div>
    <section class="section"><h2>HOW TO PLAY</h2><p class="quip">${esc(C.HOWTO.rulesQuip)}</p>
      ${m.howToPlay.length ? `<ol class="steps">${m.howToPlay.map((h) => `<li><h3>${esc(h.title)}</h3><p>${esc(h.body)}</p></li>`).join('')}</ol>` : `<p>${esc(C.HOWTO.noRules)}</p>`}</section>
    <section class="section"><h2>KEYS</h2><p class="quip">${esc(C.HOWTO.keysQuip)}</p>
      ${m.actions.length ? `<table class="keys-table"><thead><tr><th scope="col">ACTION</th><th scope="col">YOUR KEYS RIGHT NOW</th></tr></thead><tbody>${m.actions.map((a) => `<tr><td class="act">${esc(a.label)}</td><td>${b[a.id].map((c) => `<span class="keycap ${a.defaults.includes(c) ? '' : 'changed'}">${esc(keyName(c))}</span>`).join('') || '<span class="warn">NO KEY</span>'}</td></tr>`).join('')}</tbody></table>
        <p class="btn-row" style="margin-top:10px"><a class="btn btn-small" href="#/settings/controls/${encodeURIComponent(g.id)}">CHANGE KEYS</a></p>` : `<p>${esc(C.KEYS.none)}</p>`}</section>
    <div class="two-col"><section class="section" style="flex:1 1 300px;margin:0"><h2>MOUSE</h2><p class="quip">${esc(C.HOWTO.mouseQuip)}</p>
      ${m.mouse.length ? `<ul class="plain-list">${m.mouse.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${esc(C.HOWTO.noMouse)}</p>`}</section>
      <section class="section" style="flex:1 1 300px;margin:0"><h2>TOUCH</h2><p class="quip">${esc(C.HOWTO.touchQuip)}</p>
      ${m.touch.length ? `<ul class="plain-list">${m.touch.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${esc(C.HOWTO.noTouch)}</p>`}</section></div>
    <section class="section"><h2>SETTINGS IT LISTENS TO</h2><p class="quip">${esc(C.HOWTO.supportQuip)}</p>
      <div class="support-grid">${Object.keys(sup).map((k) => { const s = supportOf(m, k); return `<div><span>${esc(sup[k])}</span><b class="sup-${s}">${supWord[s]}</b></div>`; }).join('')}</div></section>
  </div>`;
}

// ---------------------------------------------------------------- FAQ + lost
function renderFaq() {
  main.innerHTML = `<div class="page-head"><h1 class="page-title">FAQ</h1><p class="page-sub">FREQUENTLY ASKED QUESTIONS. THE COMPUTER ASKED MOST OF THEM.</p></div>
    <section class="faq">${C.FAQ.map(([q, a], i) => `<details id="faq-${i}" ${i < 2 ? 'open' : ''}><summary>${esc(q)}</summary><div class="ans">${a.map((p) => `<p>${esc(p)}</p>`).join('')}</div></details>`).join('')}</section>
    <p class="btn-row" style="justify-content:center;margin-top:16px"><button type="button" class="btn btn-small" id="faqWelcome">SHOW THE NEW-HERE WALKTHROUGH AGAIN</button></p>`;
  $('#faqWelcome').onclick = () => { setUiPrefs({ welcomed: false }); go('#/welcome'); };
}
function renderLost() {
  main.innerHTML = `<div class="nf-main"><h1 class="stoinly nf-code">404</h1><div class="bn-frame"><div class="bn-head">⚠ OFFICIAL NOTICE ⚠</div>
    <p class="bn-body">THIS SCREEN DOES NOT EXIST.<br>IT HAS PROBABLY BEEN DELETED FOR FREE.</p><div class="bn-sign">— THE STOINLY</div></div>
    <p><a class="btn btn-play" href="#/">◄ BACK TO THE NEXUS</a></p></div>`;
}

// ---------------------------------------------------------------- boot
$('#muteBtn').onclick = () => { saveSettings((s) => { s.audio.mute = !s.audio.mute; }, { quiet: true }); blip(!S.get().audio.mute); };
$('#newHereSign').onclick = () => go('#/welcome');

async function boot() {
  renderFrame();
  applyNexusSettings();
  if (FIXTURES) {
    try { store = memoryStore(await (await fetch('test-fixtures/demo-saves.json', { cache: 'no-store' })).json()); } catch { store = memoryStore(); }
  }
  if (!location.hash && !FIXTURES && !uiPrefs().welcomed) { history.replaceState(null, '', '#/welcome'); }
  render();
  await Promise.all(games.map(loadGame));
  render();
  document.documentElement.dataset.ready = '1';
  setTimeout(() => { document.documentElement.dataset.popped = '1'; }, 800);
  // A route that opens the rebind dialog directly: #/settings/controls/<game>/rebind/<action>/<slot>
  const r = route();
  if (r.name === 'settings' && r.args[0] === 'controls' && r.args[2] === 'rebind') {
    const g = gameById(r.args[1]);
    if (g && g.status === 'ok') openRebind(g, r.args[3], Number(r.args[4]) || 0);
  }
}
boot();
