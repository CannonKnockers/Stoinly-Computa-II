import './ui/styles.css';
import { CARDS, cardDef } from './engine/cards';
import { canPlay, createCombat, endTurn, intentOf, pileCounts, playCard, targetsNow } from './engine/combat';
import { ENCOUNTERS, enemyDef } from './engine/enemies';
import type { Combat, Creature, EnemyState, StatusId } from './engine/types';
import { attachTilt, cardHtml, esc } from './ui/card';

// ---------- Stage scaling ----------
const stage = document.getElementById('stage')!;
let scale = 1;
function fit(): void {
  scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fit);
fit();

// ---------- Tooltip ----------
const tooltip = document.createElement('div');
tooltip.id = 'tooltip';
function toStage(clientX: number, clientY: number): { x: number; y: number } {
  const r = stage.getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}
stage.addEventListener('pointermove', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-tip]');
  if (!el) { tooltip.classList.remove('show'); return; }
  tooltip.innerHTML = el.dataset.tip!;
  const p = toStage(ev.clientX, ev.clientY);
  const left = Math.min(p.x + 18, 1920 - 320);
  const top = p.y > 760 ? p.y - 20 - tooltip.offsetHeight : p.y + 22;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add('show');
});
stage.addEventListener('pointerleave', () => tooltip.classList.remove('show'));

// ---------- Status text ----------
const STATUS_INFO: Record<StatusId, { name: string; rule: string; debuff: boolean }> = {
  strength: { name: 'STRENGTH', rule: 'Adds this much damage to each Attack hit.', debuff: false },
  dexterity: { name: 'DEXTERITY', rule: 'Adds this much Block to each Block card.', debuff: false },
  vulnerable: { name: 'VULNERABLE', rule: 'Takes 50% more damage from Attacks. Lasts this many rounds.', debuff: true },
  weak: { name: 'WEAK', rule: 'Deals 25% less damage with Attacks. Lasts this many rounds.', debuff: true },
  frail: { name: 'FRAIL', rule: 'Gains 25% less Block from cards. Lasts this many rounds.', debuff: true },
  platedArmor: { name: 'PLATED ARMOR', rule: 'Gains this much Block at the end of its turn. Each unblocked Attack hit removes 1.', debuff: false },
  grounded: { name: 'GROUNDED', rule: 'Cannot play VEHICLE cards. Lasts this many rounds.', debuff: true },
};

function statusesHtml(c: Creature): string {
  return Object.entries(c.statuses)
    .filter(([, v]) => v)
    .map(([id, v]) => {
      const info = STATUS_INFO[id as StatusId];
      const debuff = info.debuff || (v as number) < 0;
      return `<span class="status ${debuff ? 'debuff' : 'buff'}" data-tip="<b>${info.name} ${v}</b>${esc(info.rule)}">${info.name} ${v}</span>`;
    })
    .join('');
}

function bar(cr: Creature): string {
  const pct = Math.max(0, Math.round((cr.hp / cr.maxHp) * 100));
  return `<div class="bar${cr.block ? ' has-block' : ''}">
    <div class="fill" style="width:${pct}%"></div>
    <div class="text">${cr.hp} / ${cr.maxHp}</div>
    ${cr.block ? `<div class="blockbadge" data-tip="<b>BLOCK ${cr.block}</b>Absorbs damage. Removed at the start of the next turn.">${cr.block}</div>` : ''}
  </div>`;
}

// ---------- Screens ----------
type Screen = { kind: 'title' } | { kind: 'combat'; c: Combat } | { kind: 'credits' };
let screen: Screen = { kind: 'title' };
const root = document.createElement('div');
root.style.cssText = 'position:absolute;inset:0';
stage.append(root, tooltip);
attachTilt(stage);

function go(next: Screen): void {
  screen = next;
  selected = null;
  busy = false;
  tooltip.classList.remove('show');
  render();
}

function render(): void {
  if (screen.kind === 'title') root.innerHTML = titleHtml();
  else if (screen.kind === 'credits') root.innerHTML = creditsHtml();
  else root.innerHTML = combatHtml(screen.c);
}

const POOL_LABEL: Record<string, string> = { easy: 'EASY', normal: 'NORMAL', elite: 'ELITE', special: 'OPEN CRIB', boss: 'BOSS' };

function titleHtml(): string {
  const rooms = ['WRESTLING MEET', 'THE SWAMP', 'OPEN CRIB', 'BOSS'] as const;
  const groups = rooms.map((room) => {
    const rows = ENCOUNTERS.filter((e) => e.room === room).map((e) => {
      const hp = e.enemies.map((id) => enemyDef(id).hp).join(' + ');
      return `<button class="enc" data-enc="${e.id}"><span class="enc-name">${esc(e.name)}</span><span class="enc-hp">${hp} HP</span><span class="tag ${e.pool}">${POOL_LABEL[e.pool]}</span></button>`;
    }).join('');
    return `<div class="room-group"><span class="label">${room === 'BOSS' ? 'ACT 1 BOSS' : room}</span>${rows}</div>`;
  }).join('');
  return `<div class="title-screen">
    <div class="title-left">
      <h1 class="wordmark">STOINLY<span class="dot">.</span>EXE</h1>
      <div class="subtitle">SERIES 1 · ONE COMBAT · BUILD 0.1</div>
      <p class="premise">You are <b>A REAL HUMAN</b>. You have ripped 41 packs and still have no Stoinly. "THE PACK SAYS THE ODDS ARE 1 IN 6. EXPLAIN." Nobody explained. So you went into THE COMPUTER to pull it by hand.</p>
      <div class="title-cards">
        ${cardHtml(CARDS['purple-power-princess'], { combat: null })}
        ${cardHtml(CARDS['invitation'], { combat: null })}
        ${cardHtml(CARDS['the-civic'], { combat: null })}
      </div>
    </div>
    <div class="picker">
      <h2>PICK A FIGHT</h2>
      <div class="hint">Starting deck, 90 HP, 3 Energy. Every Act 1 encounter from the design document.</div>
      ${groups}
    </div>
  </div>
  <div class="title-foot"><span>BUILT FROM THE SERIES 1 TRADING CARDS ON STOINLY.COMPUTER</span><button class="linkish" data-act="credits">PHOTO AND FONT CREDITS</button></div>`;
}

function creditsHtml(): string {
  const art = new Map<string, string>();
  for (const d of Object.values(CARDS)) if (d.art) art.set(d.name, d.art.credit);
  for (const id of ['the-103', 'the-diving-board', 'the-house']) {
    const d = enemyDef(id);
    if (d.art) art.set(id === 'the-103' ? 'WRESTLING MEET (enemy art)' : id === 'the-house' ? "PARENTS' DIVORCE (enemy art)" : 'THE SWAMP (enemy art)', d.art.credit);
  }
  const rows = [...art.entries()].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  return `<div class="credits">
    <h2>CREDITS</h2>
    <p>Card set, card frame and card names from the SERIES 1 trading cards on stoinly.computer. Photographs as credited on each card, from Wikimedia Commons; licenses as printed there. Fonts: Anton by Vernon Adams and Courier Prime by Alan Dague-Greene, both under the SIL Open Font License 1.1 (license files in /fonts).</p>
    <table><tr><th>CARD</th><th>PHOTO CREDIT AND LICENSE</th></tr>${rows}</table>
    <button class="btn back" data-act="title">BACK</button>
  </div>`;
}

let selected: number | null = null;
let busy = false;
let message = '';
let messageTimer = 0;

function flash(msg: string): void {
  message = msg;
  window.clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => { message = ''; const m = root.querySelector('.hand-msg'); m?.classList.remove('show'); }, 1400);
  const m = root.querySelector('.hand-msg');
  if (m) { m.textContent = msg; m.classList.add('show'); }
}

function enemyHtml(c: Combat, e: EnemyState, targetable: boolean): string {
  const d = enemyDef(e.defId);
  const intent = intentOf(c, e);
  const away = intent?.name === 'AWAY THIS WEEKEND';
  const intentBox = !intent ? '<div class="intent away"></div>' : away
    ? '<div class="intent away"><span class="move">AWAY THIS WEEKEND</span><span class="what"></span></div>'
    : `<div class="intent${intent.danger ? ' danger' : ''}"><span class="move">${esc(intent.name)}</span><span class="what">${intent.parts.join(' + ') || '...'}</span>${d.counter ? `<span class="counter">${d.counter(e)}</span>` : ''}</div>`;
  let body: string;
  if (d.kind === 'popup') {
    body = `<div class="popup-bar"><span>STOINLY.EXE</span><span>x</span></div><div class="popup-body"><div><b>FREE MONEY</b><small>CLICK HERE!!!</small></div></div>`;
  } else if (d.kind === 'forum') {
    body = `<div class="frame"><div class="forum-post"><div class="fp-head"><span>${esc(d.name)}</span><span>1995</span></div><div class="fp-body">${esc(d.quote ?? '')}</div></div>
      <div class="plate"><span class="name">${esc(d.name)}</span><span class="role">MESSAGE BOARD</span></div><div style="height:10px"></div></div>`;
  } else {
    const role = d.kind === 'wrestler' ? 'WRESTLING MEET · ALL DAY SATURDAY' : d.kind === 'swamp' ? 'THE SWAMP · FORMERLY A POOL' : "??? · EVERY OTHER WEEKEND";
    body = `<div class="frame">${d.art ? `<div class="art"><img src="${esc(d.art.src)}" alt="" style="object-position:${esc(d.art.pos)}" draggable="false"></div>` : ''}
      <div class="plate"><span class="name">${esc(d.name)}</span><span class="role">${role}</span></div>
      <div class="flavor">${d.art ? esc(d.art.credit) : ''}</div></div>`;
  }
  const cls = ['enemy', `kind-${d.kind}`, e.dead ? 'dead' : '', away ? 'away' : '', targetable ? 'targetable' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-enemy="${e.uid}">${intentBox}<div class="enemy-card">${body}</div>${bar(e)}<div class="statuses">${statusesHtml(e)}</div></div>`;
}

function handHtml(c: Combat): string {
  const n = c.hand.length;
  const spacing = n <= 1 ? 0 : Math.min(228, 1000 / (n - 1));
  return c.hand.map((h, i) => {
    const d = cardDef(h.defId);
    const off = i - (n - 1) / 2;
    const playable = canPlay(c, h, d.target === 'enemy' ? targetsNow(c)[0] ?? null : null).ok;
    const short = d.cost !== null && d.cost > c.player.energy;
    const cls = [playable ? '' : 'unplayable', selected === h.uid ? 'selected' : ''].filter(Boolean).join(' ');
    const style = `--tx:${off * spacing}px;--ty:${Math.abs(off) ** 2 * 4}px;--rot:${off * 1.5}deg;z-index:${i + 1}`;
    const tip = d.flavor ? ` data-tip="<b>${esc(d.name)}</b>${esc(d.flavor)}"` : '';
    return cardHtml(d, { combat: c, uid: h.uid, short, extraClass: cls }).replace('<div class="card ', `<div style="${style}"${tip} class="card `);
  }).join('');
}

function tickerHtml(c: Combat): string {
  const recent = c.log.slice(-9).reverse();
  return `<div class="ticker"><span class="tick-tag">LIVE</span>${recent.map((l) => `<span class="entry">${esc(l)}</span>`).join('<span class="sep">***</span>')}</div>`;
}

function combatHtml(c: Combat): string {
  const enc = ENCOUNTERS.find((e) => e.id === c.encounterId)!;
  const targets = selected !== null ? targetsNow(c) : [];
  const piles = pileCounts(c);
  const where = c.divorce && !c.custody ? (c.activeHouse === 0 ? 'AT THE HOUSE' : 'AT THE APARTMENT') : null;
  const over = c.phase === 'won' || c.phase === 'lost';
  return `
  ${tickerHtml(c)}
  <div class="room-name">${esc(enc.room)}<b>${esc(enc.name)}</b></div>
  <div class="turn-badge">TURN<b class="${where ? 'house-banner' : ''}">${c.turn}${where ? ` · ${where}` : ''}</b></div>
  <div class="player-panel">
    <div class="player-name">A REAL HUMAN</div>
    <div class="player-sub">FORUM MEMBER SINCE 1995</div>
    ${bar(c.player)}
    <div class="statuses">${statusesHtml(c.player)}</div>
    <div class="on-stage" data-tip="<b>ON STAGE</b>SPECIAL GUESTS perform here. None in the starting deck.">NOBODY ON STAGE</div>
    <div class="relics"><span class="relic" data-tip="<b>THE GUM</b>Does nothing. + 1 STICK OF GUM (GUM NOT INCLUDED).">THE GUM</span></div>
  </div>
  <div class="enemies">${c.enemies.map((e) => enemyHtml(c, e, targets.includes(e))).join('')}</div>
  <div class="energy${c.player.energy === 0 ? ' empty' : ''}" data-tip="<b>ENERGY</b>Spent to play cards. Refills to ${c.player.maxEnergy} at the start of your turn.">${c.player.energy}/${c.player.maxEnergy}<small>ENERGY</small></div>
  <div class="pile draw" data-tip="<b>DRAW PILE</b>${where ? `Your ${where === 'AT THE HOUSE' ? 'HOUSE' : 'APARTMENT'} pile. ` : ''}Shuffled from the discard when empty."><div class="graphic"><div class="g-pack"><span>${piles.draw}</span></div></div><div class="plabel">DRAW</div></div>
  ${piles.otherDraw !== undefined ? `<div class="other-house" data-tip="<b>THE OTHER HOUSEHOLD</b>Cards waiting at the other place. You can see how many, not which.">${where === 'AT THE HOUSE' ? 'AT THE APARTMENT' : 'AT THE HOUSE'}<b>${piles.otherDraw} CARDS</b></div>` : ''}
  <div class="pile discard" data-tip="<b>DISCARD</b>Played and discarded cards."><div class="graphic"><div class="g-wrapper"><span>${piles.discard}</span></div></div><div class="plabel">DISCARD</div></div>
  <div class="pile exhaust" data-tip="<b>EXHAUSTED</b>Removed for the rest of the fight."><div class="graphic"><div class="g-slip"><b>${piles.exhaust}</b><i>DELETED FOR FREE</i></div></div><div class="plabel">EXHAUST</div></div>
  <button class="btn primary end-turn" data-act="end"${c.phase !== 'player' || busy ? ' disabled' : ''}>END TURN</button>
  <div class="keys">1-9 PLAY · E END TURN · ESC CANCEL</div>
  <button class="linkish leave" data-act="title">LEAVE FIGHT</button>
  <div class="hand">${handHtml(c)}</div>
  <div class="hand-msg${message ? ' show' : ''}">${esc(message)}</div>
  ${over ? resultHtml(c) : ''}`;
}

function resultHtml(c: Combat): string {
  const won = c.phase === 'won';
  return `<div class="overlay"><div class="result ${won ? 'won' : 'lost'}">
    <div class="label">${won ? 'THE COMPUTER RECORDS A WIN' : 'THE COMPUTER RECORDS A LOSS'}</div>
    <h1>${won ? 'YOU GOT THROUGH IT.' : 'A REAL HUMAN IS DOWN.'}</h1>
    <p>${won ? `Turn ${c.turn}. ${c.player.hp} of ${c.player.maxHp} HP left.` : `Turn ${c.turn}. It happens. It happened.`}</p>
    <div class="row"><button class="btn primary" data-act="again">FIGHT AGAIN</button><button class="btn" data-act="title">PICK ANOTHER FIGHT</button></div>
  </div></div>`;
}

// ---------- Floating numbers ----------
function snapshot(c: Combat): Map<string, { hp: number; block: number }> {
  const m = new Map<string, { hp: number; block: number }>();
  m.set('player', { hp: c.player.hp, block: c.player.block });
  for (const e of c.enemies) m.set(String(e.uid), { hp: e.hp, block: e.block });
  return m;
}

function floats(c: Combat, before: Map<string, { hp: number; block: number }>): void {
  const after = snapshot(c);
  for (const [key, a] of after) {
    const b = before.get(key);
    if (!b) continue;
    const el = key === 'player' ? root.querySelector<HTMLElement>('.player-panel .bar') : root.querySelector<HTMLElement>(`[data-enemy="${key}"] .enemy-card`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const p = toStage(r.left + r.width / 2, r.top + (key === 'player' ? 0 : r.height * 0.4));
    const spawn = (text: string, cls: string, dy: number) => {
      const f = document.createElement('div');
      f.className = `float ${cls}`;
      f.textContent = text;
      f.style.left = `${p.x}px`;
      f.style.top = `${p.y + dy}px`;
      stage.append(f);
      window.setTimeout(() => f.remove(), 950);
    };
    if (a.hp < b.hp) {
      spawn(`-${b.hp - a.hp}`, 'dmg', 0);
      if (key !== 'player') root.querySelector(`[data-enemy="${key}"]`)?.classList.add('hit');
    }
    if (a.block > b.block) spawn(`+${a.block - b.block} BLOCK`, 'blk', 40);
  }
}

// ---------- Input ----------
function act(fn: (c: Combat) => void): void {
  if (screen.kind !== 'combat') return;
  const c = screen.c;
  const before = snapshot(c);
  fn(c);
  render();
  floats(c, before);
}

function tryPlay(c: Combat, uid: number, targetUid: number | null): void {
  act((cc) => {
    const r = playCard(cc, uid, targetUid);
    if (!r.ok) flash(r.reason);
    selected = null;
  });
  void c;
}

function clickCard(uid: number): void {
  if (screen.kind !== 'combat' || busy) return;
  const c = screen.c;
  const card = c.hand.find((h) => h.uid === uid);
  if (!card) return;
  const d = cardDef(card.defId);
  if (selected === uid) { selected = null; render(); return; }
  const targets = targetsNow(c);
  const check = canPlay(c, card, d.target === 'enemy' ? targets[0] ?? null : null);
  if (!check.ok) { flash(check.reason); return; }
  if (d.target === 'none') return tryPlay(c, uid, null);
  if (targets.length === 1) return tryPlay(c, uid, targets[0].uid);
  selected = uid;
  render();
}

function doEndTurn(): void {
  if (screen.kind !== 'combat' || busy || screen.c.phase !== 'player') return;
  selected = null;
  busy = true;
  act((c) => endTurn(c));
  window.setTimeout(() => { busy = false; render(); }, 420);
}

function startEncounter(id: string): void {
  const params = new URLSearchParams(location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : (Date.now() ^ 0x5f3759df) | 0;
  go({ kind: 'combat', c: createCombat(id, seed) });
}

stage.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement;
  const actBtn = t.closest<HTMLElement>('[data-act]');
  if (actBtn) {
    const a = actBtn.dataset.act;
    if (a === 'end') doEndTurn();
    else if (a === 'title') go({ kind: 'title' });
    else if (a === 'credits') go({ kind: 'credits' });
    else if (a === 'again' && screen.kind === 'combat') startEncounter(screen.c.encounterId);
    return;
  }
  const enc = t.closest<HTMLElement>('[data-enc]');
  if (enc) return startEncounter(enc.dataset.enc!);
  if (screen.kind !== 'combat') return;
  const cardEl = t.closest<HTMLElement>('.hand .card');
  if (cardEl) return clickCard(Number(cardEl.dataset.uid));
  const enemyEl = t.closest<HTMLElement>('[data-enemy]');
  if (enemyEl && selected !== null) return tryPlay(screen.c, selected, Number(enemyEl.dataset.enemy));
  if (selected !== null) { selected = null; render(); }
});

stage.addEventListener('contextmenu', (ev) => {
  if (selected !== null) { ev.preventDefault(); selected = null; render(); }
});

window.addEventListener('keydown', (ev) => {
  if (screen.kind !== 'combat') return;
  const c = screen.c;
  if (ev.key === 'Escape') { selected = null; render(); return; }
  if (ev.key === 'e' || ev.key === 'E') { doEndTurn(); return; }
  if (/^[0-9]$/.test(ev.key)) {
    const i = ev.key === '0' ? 9 : Number(ev.key) - 1;
    const h = c.hand[i];
    if (h) clickCard(h.uid);
  }
});

// ---------- Boot ----------
const params = new URLSearchParams(location.search);
const direct = params.get('encounter');
if (direct && ENCOUNTERS.some((e) => e.id === direct)) startEncounter(direct);
else if (params.get('screen') === 'credits') go({ kind: 'credits' });
else render();
