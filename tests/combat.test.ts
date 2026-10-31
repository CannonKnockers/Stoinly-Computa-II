import { describe, expect, it } from 'vitest';
import { canPlay, createCombat, endTurn, intentOf, playCard, PLAYER_MAX_HP } from '../src/engine/combat';
import { attackDamage, cardBlock } from '../src/engine/math';
import { ENCOUNTERS } from '../src/engine/enemies';
import type { Combat, Creature } from '../src/engine/types';

const creature = (statuses: Creature['statuses'] = {}): Creature => ({ name: 'X', hp: 50, maxHp: 50, block: 0, statuses, skipTick: [] });

function handOf(c: Combat, defId: string) {
  return c.hand.find((h) => h.defId === defId);
}

/** Put a specific card in hand for a test, taking it from wherever it is. */
function force(c: Combat, defId: string) {
  const existing = handOf(c, defId);
  if (existing) return existing;
  for (const p of c.houses) {
    for (const pile of [p.draw, p.discard]) {
      const i = pile.findIndex((x) => x.defId === defId);
      if (i >= 0) {
        const [card] = pile.splice(i, 1);
        c.hand.push(card);
        return card;
      }
    }
  }
  throw new Error(`no ${defId} available`);
}

describe('damage and block math', () => {
  it('adds Strength per hit before multipliers and rounds down', () => {
    expect(attackDamage(6, creature({ strength: 2 }), creature({ vulnerable: 1 }))).toBe(12);
    expect(attackDamage(6, creature({ weak: 1 }), creature())).toBe(4);
    expect(attackDamage(6, creature({ weak: 1 }), creature({ vulnerable: 1 }))).toBe(6);
    expect(attackDamage(3, creature({ strength: -5 }), creature())).toBe(0);
  });
  it('applies Dexterity and Frail only to card Block', () => {
    expect(cardBlock(5, creature({ dexterity: 1 }))).toBe(6);
    expect(cardBlock(5, creature({ frail: 1 }))).toBe(3);
  });
});

describe('setup', () => {
  it('builds every encounter in the picker', () => {
    for (const e of ENCOUNTERS) {
      const c = createCombat(e.id, 1);
      expect(c.phase).toBe('player');
      expect(c.turn).toBe(1);
    }
  });
  it('starts with 90 HP, 3 Energy, 5 cards and the 11-card deck', () => {
    const c = createCombat('meet-215', 7);
    expect(c.player.hp).toBe(PLAYER_MAX_HP);
    expect(c.player.energy).toBe(3);
    expect(c.hand.length).toBe(5);
    expect(c.hand.length + c.houses[0].draw.length).toBe(11);
    expect(c.relics).toEqual(['the-gum']);
  });
  it('is deterministic for a seed', () => {
    const a = createCombat('meet-215', 42);
    const b = createCombat('meet-215', 42);
    expect(a.hand.map((h) => h.defId)).toEqual(b.hand.map((h) => h.defId));
  });
});

describe('playing cards', () => {
  it('PURPLE POWER PRINCESS deals 6 and spends 1 Energy', () => {
    const c = createCombat('meet-215', 3);
    const card = force(c, 'purple-power-princess');
    const enemy = c.enemies[0];
    expect(playCard(c, card.uid, enemy.uid).ok).toBe(true);
    expect(enemy.hp).toBe(71 - 6);
    expect(c.player.energy).toBe(2);
    expect(c.houses[0].discard).toContain(card);
  });
  it('rejects the INVITATION, too little Energy, and a missing target', () => {
    const c = createCombat('meet-215', 3);
    const inv = force(c, 'invitation');
    expect(playCard(c, inv.uid, null)).toEqual({ ok: false, reason: 'UNPLAYABLE.' });
    const atk = force(c, 'purple-power-princess');
    expect(playCard(c, atk.uid, null)).toEqual({ ok: false, reason: 'PICK A TARGET.' });
    c.player.energy = 0;
    expect(playCard(c, atk.uid, c.enemies[0].uid)).toEqual({ ok: false, reason: 'NOT ENOUGH ENERGY.' });
  });
  it('LET ME SEE YOUR GUY makes the next attack hit for 9', () => {
    const c = createCombat('meet-215', 5);
    const guy = force(c, 'let-me-see-your-guy');
    const enemy = c.enemies[0];
    playCard(c, guy.uid, enemy.uid);
    expect(enemy.statuses.vulnerable).toBe(1);
    expect(enemy.statuses.weak).toBe(1);
    const atk = force(c, 'purple-power-princess');
    playCard(c, atk.uid, enemy.uid);
    expect(enemy.hp).toBe(71 - 9);
  });
  it('Weak on the enemy reduces its next attack and then wears off', () => {
    const c = createCombat('meet-215', 5);
    const enemy = c.enemies[0];
    expect(intentOf(c, enemy)!.parts[0]).toBe('ATTACK · 11');
    playCard(c, force(c, 'let-me-see-your-guy').uid, enemy.uid);
    expect(intentOf(c, enemy)!.parts[0]).toBe('ATTACK · 8');
    endTurn(c);
    expect(c.player.hp).toBe(90 - 8);
    expect(enemy.statuses.weak).toBeUndefined();
    expect(enemy.statuses.vulnerable).toBeUndefined();
  });
});

describe('turn loop', () => {
  it('Block absorbs damage and is removed at the start of the next turn', () => {
    const c = createCombat('meet-215', 9);
    playCard(c, force(c, 'the-civic').uid, null);
    expect(c.player.block).toBe(5);
    endTurn(c);
    expect(c.player.hp).toBe(90 - 6);
    expect(c.player.block).toBe(0);
  });
  it('discards the hand, draws 5, and reshuffles when the draw pile runs out', () => {
    const c = createCombat('meet-103', 11);
    endTurn(c);
    expect(c.hand.length).toBe(5);
    endTurn(c);
    expect(c.hand.length).toBe(5);
    expect(c.hand.length + c.houses[0].draw.length + c.houses[0].discard.length).toBe(11);
  });
  it('a Weak an enemy applies lasts exactly one player turn', () => {
    const c = createCombat('meet-112-119', 2);
    // THE 119 starts on HALF NELSON (offset), THE 112 on TAKEDOWN.
    expect(intentOf(c, c.enemies[1])!.name).toBe('HALF NELSON');
    endTurn(c);
    expect(c.player.statuses.weak).toBe(1);
    expect(attackDamage(6, c.player, c.enemies[0])).toBe(4);
    endTurn(c);
    // THE 112's HALF NELSON lands while 1 Weak is still running: it stacks to 2.
    expect(c.player.statuses.weak).toBe(2);
  });
  it('the enemy pattern cycles in order', () => {
    const c = createCombat('meet-215', 4);
    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      names.push(intentOf(c, c.enemies[0])!.name);
      endTurn(c);
    }
    expect(names).toEqual(['HEAVY', 'CRADLE', 'WEIGH-IN', 'HEAVY']);
    expect(c.enemies[0].statuses.strength).toBe(2);
  });
  it('the player can lose', () => {
    const c = createCombat('diving-board', 4);
    for (let i = 0; i < 40 && c.phase !== 'lost'; i++) endTurn(c);
    expect(c.phase).toBe('lost');
    expect(c.player.hp).toBe(0);
  });
  it('the player can win, and nothing acts after', () => {
    const c = createCombat('pop-ups', 4);
    for (const e of c.enemies) e.hp = 1;
    for (const e of c.enemies) {
      const atk = force(c, 'purple-power-princess');
      c.player.energy = 3;
      playCard(c, atk.uid, e.uid);
    }
    expect(c.phase).toBe('won');
    endTurn(c);
    expect(c.turn).toBe(1);
  });
});

describe('enemy specifics', () => {
  it('DAVE, OHIO hits first, before turn 1', () => {
    const c = createCombat('dave', 1);
    expect(c.player.hp).toBe(90 - 8);
  });
  it('THE 160 CAPTAIN gives every ally 2 Strength on its first turn', () => {
    const c = createCombat('meet-captain', 1);
    endTurn(c);
    expect(c.enemies.map((e) => e.statuses.strength)).toEqual([2, 2]);
  });
  it('SATISFIED USER counts down and adds SIX HOURS, which exhausts from hand', () => {
    const c = createCombat('satisfied-user', 1);
    endTurn(c);
    const all = [...c.hand, ...c.houses[0].draw, ...c.houses[0].discard, ...c.exhaust];
    expect(all.filter((x) => x.defId === 'six-hours').length).toBe(1);
    for (let i = 0; i < 5; i++) endTurn(c);
    expect(intentOf(c, c.enemies[0])!.name).toBe('LOST TIME');
    expect(intentOf(c, c.enemies[0])!.parts[0]).toBe('ATTACK · 30');
  });
  it('THE DEEP END sets Plated Armor to 6, not +6, and GROUNDED blocks vehicles', () => {
    const c = createCombat('deep-end', 1);
    endTurn(c); // TREAD WATER
    expect(c.enemies[0].statuses.platedArmor).toBe(6);
    expect(c.enemies[0].block).toBe(6);
    endTurn(c); // UNDERTOW applies GROUNDED during the enemy turn
    expect(c.player.statuses.grounded).toBe(1);
    const civic = force(c, 'the-civic');
    expect(canPlay(c, civic, null)).toEqual({ ok: false, reason: 'GROUNDED. NO VEHICLES.' });
    endTurn(c); // DROWNING; GROUNDED wears off at end of round
    endTurn(c); // TREAD WATER again
    expect(c.enemies[0].statuses.platedArmor).toBe(6);
  });
  it('unblocked attack damage takes 1 Plated Armor off', () => {
    const c = createCombat('deep-end', 1);
    endTurn(c);
    const e = c.enemies[0];
    e.block = 0;
    c.player.energy = 3;
    playCard(c, force(c, 'purple-power-princess').uid, e.uid);
    expect(e.statuses.platedArmor).toBe(5);
  });
  it('THE SKIMMER exhausts the top card of the draw pile', () => {
    const c = createCombat('skimmer', 1);
    const top = c.houses[0].draw[c.houses[0].draw.length - 1];
    endTurn(c);
    expect(c.exhaust).toContain(top);
  });
});

describe("PARENTS' DIVORCE", () => {
  it('deals the deck into two households and alternates', () => {
    const c = createCombat('divorce', 3);
    expect(c.houses.length).toBe(2);
    expect(c.activeHouse).toBe(0);
    const total = c.hand.length + c.houses.reduce((n, p) => n + p.draw.length + p.discard.length, 0);
    expect(total).toBe(11);
    expect(c.hand.length).toBe(5);
    endTurn(c);
    expect(c.activeHouse).toBe(1);
  });
  it('only the body you are at can be targeted or acts', () => {
    const c = createCombat('divorce', 3);
    const [house, apt] = c.enemies;
    const atk = force(c, 'purple-power-princess');
    expect(canPlay(c, atk, apt)).toEqual({ ok: false, reason: 'NOT HERE THIS WEEKEND.' });
    expect(intentOf(c, apt)!.name).toBe('AWAY THIS WEEKEND');
    endTurn(c); // THE HOUSE acts: WE NEED TO TALK
    expect(c.player.statuses.vulnerable).toBe(2);
    expect(apt.moveIndex).toBe(0);
    expect(house.moveIndex).toBe(1);
  });
  it('statuses on the absent body do not tick down', () => {
    const c = createCombat('divorce', 3);
    const house = c.enemies[0];
    house.statuses.weak = 1;
    endTurn(c); // house acts and ticks: weak gone
    expect(house.statuses.weak).toBeUndefined();
    house.statuses.weak = 1;
    endTurn(c); // apartment's turn: house is away, no tick
    expect(house.statuses.weak).toBe(1);
  });
  it('FULL CUSTODY: killing one merges the piles and buffs the survivor', () => {
    const c = createCombat('divorce', 3);
    c.enemies[0].hp = 1;
    playCard(c, force(c, 'purple-power-princess').uid, c.enemies[0].uid);
    expect(c.custody).toBe(true);
    expect(c.houses.length).toBe(1);
    expect(c.enemies[1].statuses.strength).toBe(3);
    expect(intentOf(c, c.enemies[1])!.name).toBe('PICKUP AT 6');
  });
  it('OVERNIGHT BAG stays in hand and costs a draw', () => {
    const c = createCombat('divorce', 3);
    endTurn(c); // house
    endTurn(c); // apartment: PICKUP AT 6 adds a bag
    expect(c.hand.filter((h) => h.defId === 'overnight-bag').length).toBe(1);
    expect(c.hand.length).toBe(1 + 4);
  });
});
