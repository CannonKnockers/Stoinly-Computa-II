// @vitest-environment jsdom
// Drives the real page code through clicks and key presses in jsdom.

import { beforeAll, describe, expect, it } from 'vitest';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = (el: Element | null) => {
  if (!el) throw new Error('nothing to click');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const hpText = (sel: string) => $(`${sel} .bar .text`)!.textContent!.trim();

beforeAll(async () => {
  document.body.innerHTML = '<div id="viewport"><div id="stage"></div></div>';
  window.history.replaceState(null, '', '/?seed=3');
  await import('../src/main');
});

describe('page flow', () => {
  it('shows the title screen with all 12 encounters', () => {
    expect($('.wordmark')!.textContent).toContain('STOINLY');
    expect($$('[data-enc]').length).toBe(12);
  });

  it('starts a fight against THE 215 and deals 5 cards', () => {
    click($('[data-enc="meet-215"]'));
    expect($('.room-name b')!.textContent).toBe('THE 215');
    expect($$('.hand .card').length).toBe(5);
    expect(hpText('[data-enemy]')).toBe('71 / 71');
    expect($('.intent .what')!.textContent).toBe('ATTACK · 11');
  });

  it('playing an attack on the only enemy needs no target click', () => {
    const atk = $$('.hand .card').find((c) => c.dataset.def === 'purple-power-princess');
    expect(atk).toBeTruthy();
    click(atk!);
    expect(hpText('[data-enemy]')).toBe('65 / 71');
    expect($('.energy')!.textContent).toContain('2/3');
    expect($$('.hand .card').length).toBe(4);
  });

  it('a Block card raises the Block badge', () => {
    const civic = $$('.hand .card').find((c) => c.dataset.def === 'the-civic');
    expect(civic).toBeTruthy(); // seed 3 deals two
    click(civic!);
    expect($('.player-panel .blockbadge')!.textContent).toBe('5');
  });

  it('END TURN runs the enemy turn and starts turn 2', () => {
    click($('[data-act="end"]'));
    expect($('.turn-badge b')!.textContent).toBe('2');
    expect($('.intent .move')!.textContent).toBe('CRADLE');
    expect($$('.hand .card').length).toBe(5);
  });

  it('keyboard: 1 plays the first card, E ends the turn', async () => {
    await new Promise((r) => setTimeout(r, 450)); // input lock after the enemy turn
    const before = $$('.hand .card').length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    const after = $$('.hand .card').length;
    // The first card is either played (hand shrinks) or refused with a message.
    expect(after < before || $('.hand-msg.show') !== null).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    expect($('.turn-badge b')!.textContent).toBe('3');
  });

  it('LEAVE FIGHT goes back to the list', () => {
    click($('.leave'));
    expect($$('[data-enc]').length).toBe(12);
  });
});

describe('targeting with two enemies', () => {
  it('select, then click an enemy', async () => {
    document.body.innerHTML = '<div id="viewport"><div id="stage"></div></div>';
    // Fresh module instance with a different encounter.
    window.history.replaceState(null, '', '/?seed=5&encounter=meet-captain');
    const { vi } = await import('vitest');
    vi.resetModules();
    await import('../src/main');
    const atk = $$('.hand .card').find((c) => c.dataset.def === 'purple-power-princess')!;
    click(atk);
    expect(atk.isConnected ? atk.classList.contains('selected') : $('.hand .card.selected')).toBeTruthy();
    expect($$('.enemy.targetable').length).toBe(2);
    const second = $$('[data-enemy]')[1];
    click(second.querySelector('.enemy-card'));
    expect(hpText(`[data-enemy="${second.dataset.enemy}"]`)).toBe('28 / 34');
    expect($('.hand .card.selected')).toBeNull();
  });

  it('PARENTS\' DIVORCE: the absent body cannot be targeted', async () => {
    document.body.innerHTML = '<div id="viewport"><div id="stage"></div></div>';
    window.history.replaceState(null, '', '/?seed=5&encounter=divorce');
    const { vi } = await import('vitest');
    vi.resetModules();
    await import('../src/main');
    expect($('.turn-badge b')!.textContent).toContain('AT THE HOUSE');
    expect($$('.enemy.away').length).toBe(1);
    const atk = $$('.hand .card').find((c) => c.dataset.def === 'purple-power-princess');
    expect(atk).toBeTruthy(); // seed 5 deals three
    click(atk!); // one present body: plays straight on THE HOUSE
    expect(hpText('[data-enemy]:not(.away)')).toBe('84 / 90');
    expect(hpText('.enemy.away')).toBe('80 / 80');
  });
});
