// Renders a card in the site's frame: cream frame, ink border, lane-colored
// skewed nameplate, photo, rarity chip, credit line, foil by rarity.

import type { CardDef, Combat } from '../engine/types';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const RARITY_LABEL: Record<string, string> = {
  basic: 'COMMON', common: 'COMMON', rare: 'RARE', holo: 'HOLO', ultra: 'ULTRA HOLO', status: 'STATUS',
};

/** Rules text with [[n]] markers turned into highlighted numbers. */
export function rulesHtml(text: string, base?: string): string {
  return esc(text).replace(/\[\[(\d+)\]\]/g, (_, n: string) => {
    const baseNum = base ? Number(base) : NaN;
    const cls = !Number.isNaN(baseNum) && Number(n) < baseNum ? 'num-down' : 'num-up';
    return `<span class="${cls}">${n}</span>`;
  });
}

function baseNumber(d: CardDef): string | undefined {
  return d.text(null).match(/\d+/)?.[0];
}

export interface CardRenderOpts {
  combat: Combat | null;
  uid?: number;
  short?: boolean; // cannot afford
  extraClass?: string;
}

export function cardHtml(d: CardDef, o: CardRenderOpts): string {
  const cost = d.cost === null
    ? '<span class="cost none"></span>'
    : `<span class="cost${o.short ? ' short' : ''}">${d.cost}</span>`;
  const series = d.num ? `SERIES 1 · #${String(d.num).padStart(2, '0')}/33` : 'STATUS';
  const art = d.art
    ? `<div class="art"><img src="${esc(d.art.src)}" alt="" style="object-position:${esc(d.art.pos)}" draggable="false"><span class="chip">${RARITY_LABEL[d.rarity]}</span></div>`
    : `<div class="art blank"><span>${d.type === 'Status' ? 'STATUS' : ''}</span><span class="chip">${RARITY_LABEL[d.rarity]}</span></div>`;
  const nameCls = d.name.length > 18 ? 'name long' : 'name';
  return `
  <div class="card lane-${d.lane} rarity-${d.rarity}${o.extraClass ? ' ' + o.extraClass : ''}" ${o.uid !== undefined ? `data-uid="${o.uid}"` : ''} data-def="${d.id}">
    <div class="card-inner">
      <div class="frame">
        <div class="topbar">${cost}<span class="series">${series}</span></div>
        ${art}
        <div class="plate"><span class="${nameCls}">${esc(d.name)}</span><span class="role">${esc(d.role)}</span></div>
        <div class="rules"><span>${rulesHtml(d.text(o.combat), baseNumber(d))}</span></div>
        <span class="typeline">${d.type.toUpperCase()}</span>
        <div class="credit">${d.art ? esc(d.art.credit) : ''}</div>
      </div>
      <div class="foil"></div><div class="glare"></div>
    </div>
  </div>`;
}

/** Pointer tilt and glare, at most 6 degrees, 60 ms (design section 13). */
export function attachTilt(root: HTMLElement): void {
  root.addEventListener('pointermove', (ev) => {
    const card = (ev.target as HTMLElement).closest<HTMLElement>('.card');
    if (!card || !root.contains(card)) return;
    const r = card.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width;
    const y = (ev.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
    card.style.setProperty('--rx', `${(0.5 - y) * 12}deg`);
    card.style.setProperty('--px', `${x * 100}%`);
    card.style.setProperty('--py', `${y * 100}%`);
    card.classList.add('tilting');
  });
  root.addEventListener('pointerout', (ev) => {
    const card = (ev.target as HTMLElement).closest<HTMLElement>('.card');
    if (!card) return;
    const to = ev.relatedTarget as Node | null;
    if (to && card.contains(to)) return;
    card.classList.remove('tilting');
    for (const p of ['--rx', '--ry']) card.style.setProperty(p, '0deg');
    card.style.setProperty('--px', '50%');
    card.style.setProperty('--py', '50%');
  });
}
