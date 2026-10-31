// The combat loop: setup, the player's turn, the enemies' turn.

import {
  addToDraw, addToHand, applyStatus, currentPile, dealDamage, drawCards, isPresent, log, makeCard, presentEnemies, tickDurations,
} from './actions';
import { cardDef, STARTING_DECK } from './cards';
import { currentMove, enemyDef, ENCOUNTERS } from './enemies';
import { attackDamage } from './math';
import { shuffle } from './rng';
import type { CardInstance, Combat, EnemyState, MoveDef, StatusId } from './types';

export const PLAYER_MAX_HP = 90;
export const BASE_ENERGY = 3;
export const BASE_DRAW = 5;

export function createCombat(encounterId: string, seed: number): Combat {
  const enc = ENCOUNTERS.find((e) => e.id === encounterId);
  if (!enc) throw new Error(`Unknown encounter ${encounterId}`);
  const c: Combat = {
    encounterId, seed, rngState: seed | 0, turn: 0, phase: 'player',
    player: { name: 'A REAL HUMAN', hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, block: 0, statuses: {}, skipTick: [], energy: 0, maxEnergy: BASE_ENERGY },
    hand: [], houses: [{ draw: [], discard: [] }], activeHouse: 0, exhaust: [], enemies: [],
    relics: ['the-gum'], divorce: !!enc.divorce, custody: false, log: [], nextUid: 1,
  };
  const deck = shuffle(c, STARTING_DECK.map((id) => makeCard(c, id)));
  if (c.divorce) {
    // EVERY OTHER WEEKEND: deal the shuffled deck alternately into two households.
    c.houses = [{ draw: [], discard: [] }, { draw: [], discard: [] }];
    deck.forEach((card, i) => c.houses[i % 2].draw.push(card));
  } else {
    c.houses[0].draw = deck;
  }
  c.enemies = enc.enemies.map((id) => {
    const d = enemyDef(id);
    const e: EnemyState = {
      uid: c.nextUid++, defId: id, name: d.name, hp: d.hp, maxHp: d.hp, block: 0, statuses: {}, skipTick: [],
      moveIndex: 0, dead: false, house: d.house,
    };
    return e;
  });
  log(c, `THE COMPUTER HAS CREATED THIS THREAD FOR ${enc.name}. IT IS OFFICIAL. DISCUSS.`);
  for (const e of c.enemies) {
    const pre = enemyDef(e.defId).preCombat;
    if (pre) {
      c.phase = 'enemy';
      resolveMove(c, e, pre);
    }
  }
  if (c.phase !== 'lost') startPlayerTurn(c);
  return c;
}

function startPlayerTurn(c: Combat): void {
  c.turn++;
  c.phase = 'player';
  if (c.divorce && !c.custody) c.activeHouse = c.turn % 2 === 1 ? 0 : 1;
  c.player.block = 0;
  c.player.energy = c.player.maxEnergy;
  const bags = c.hand.filter((h) => h.defId === 'overnight-bag').length;
  drawCards(c, Math.max(0, BASE_DRAW - bags));
  if (c.divorce && !c.custody) log(c, `TURN ${c.turn}. YOU ARE AT ${c.activeHouse === 0 ? 'THE HOUSE' : 'THE APARTMENT'}.`);
  else log(c, `TURN ${c.turn}.`);
}

export type PlayCheck = { ok: true } | { ok: false; reason: string };

export function canPlay(c: Combat, card: CardInstance, target: EnemyState | null): PlayCheck {
  if (c.phase !== 'player') return { ok: false, reason: 'NOT YOUR TURN.' };
  if (!c.hand.includes(card)) return { ok: false, reason: 'THAT CARD IS NOT IN YOUR HAND.' };
  const d = cardDef(card.defId);
  if (d.cost === null || !d.play) return { ok: false, reason: 'UNPLAYABLE.' };
  if (d.cost > c.player.energy) return { ok: false, reason: 'NOT ENOUGH ENERGY.' };
  if (d.lane === 'vehicle' && (c.player.statuses.grounded ?? 0) > 0) return { ok: false, reason: 'GROUNDED. NO VEHICLES.' };
  if (d.target === 'enemy') {
    if (!target) return { ok: false, reason: 'PICK A TARGET.' };
    if (!isPresent(c, target)) return { ok: false, reason: 'NOT HERE THIS WEEKEND.' };
  }
  return { ok: true };
}

export function playCard(c: Combat, cardUid: number, targetUid: number | null): PlayCheck {
  const card = c.hand.find((h) => h.uid === cardUid);
  if (!card) return { ok: false, reason: 'THAT CARD IS NOT IN YOUR HAND.' };
  const target = targetUid === null ? null : c.enemies.find((e) => e.uid === targetUid) ?? null;
  const check = canPlay(c, card, target);
  if (!check.ok) return check;
  const d = cardDef(card.defId);
  c.player.energy -= d.cost!;
  c.hand.splice(c.hand.indexOf(card), 1);
  log(c, `PLAYED ${d.name}.`);
  d.play!(c, d.target === 'enemy' ? target : null);
  if (d.exhausts) c.exhaust.push(card);
  else currentPile(c).discard.push(card);
  return { ok: true };
}

export function endTurn(c: Combat): void {
  if (c.phase !== 'player') return;
  const pile = currentPile(c);
  const kept: CardInstance[] = [];
  for (const card of c.hand) {
    const d = cardDef(card.defId);
    if (d.ethereal) c.exhaust.push(card);
    else if (d.retain) kept.push(card);
    else pile.discard.push(card);
  }
  c.hand = kept;

  c.phase = 'enemy';
  for (const e of c.enemies) {
    if (!isPresent(c, e)) continue;
    e.block = 0;
    resolveMove(c, e, currentMove(e));
    if ((c.phase as string) === 'lost') return;
    if (e.dead) continue;
    const plated = e.statuses.platedArmor ?? 0;
    if (plated > 0) e.block += plated;
    tickDurations(e);
    e.moveIndex++;
  }
  // End of round: the player's duration statuses tick after the enemies act.
  // Ones an enemy applied this round skip this tick (see applyStatus).
  tickDurations(c.player);
  if ((c.phase as string) === 'enemy') startPlayerTurn(c);
}

function resolveMove(c: Combat, e: EnemyState, move: MoveDef): void {
  const fx = move.effect;
  log(c, `${e.name}: ${move.name}.`);
  if (fx.damage !== undefined) {
    for (let i = 0; i < (fx.hits ?? 1); i++) {
      const dmg = attackDamage(fx.damage, e, c.player);
      const lost = dealDamage(c, c.player, dmg, true);
      log(c, `YOU TAKE ${lost}${lost < dmg ? ` (${dmg - lost} BLOCKED)` : ''}.`);
      if (c.phase === 'lost') return;
    }
  }
  if (fx.block) e.block += fx.block;
  if (fx.strength) e.statuses.strength = (e.statuses.strength ?? 0) + fx.strength;
  if (fx.allyStrength) {
    for (const ally of c.enemies) if (!ally.dead) ally.statuses.strength = (ally.statuses.strength ?? 0) + fx.allyStrength;
  }
  if (fx.setPlatedArmor !== undefined) e.statuses.platedArmor = fx.setPlatedArmor;
  if (fx.applyToPlayer) {
    for (const [id, amt] of Object.entries(fx.applyToPlayer) as [StatusId, number][]) applyStatus(c, c.player, id, amt);
  }
  if (fx.addToDraw) addToDraw(c, fx.addToDraw);
  if (fx.addToHand) addToHand(c, fx.addToHand);
  if (fx.exhaustTopOfDraw) {
    const top = currentPile(c).draw.pop();
    if (top) {
      c.exhaust.push(top);
      log(c, `${cardDef(top.defId).name} IS SKIMMED.`);
    }
  }
}

export interface IntentView {
  name: string;
  /** For example "ATTACK · 12", "ATTACK · 7x2", "DEFEND", "BUFF", "DEBUFF". */
  parts: string[];
  danger: boolean;
}

/** What the enemy will do, computed from the same move data it executes. */
export function intentOf(c: Combat, e: EnemyState): IntentView | null {
  if (e.dead) return null;
  if (!isPresent(c, e)) return { name: 'AWAY THIS WEEKEND', parts: [], danger: false };
  const move = currentMove(e);
  const fx = move.effect;
  const parts: string[] = [];
  if (fx.damage !== undefined) {
    const per = attackDamage(fx.damage, e, c.player);
    parts.push(`ATTACK · ${per}${(fx.hits ?? 1) > 1 ? `×${fx.hits}` : ''}`);
  }
  if (fx.block) parts.push('DEFEND');
  if (fx.strength || fx.allyStrength || fx.setPlatedArmor !== undefined) parts.push('BUFF');
  if (fx.applyToPlayer || fx.addToDraw || fx.addToHand || fx.exhaustTopOfDraw) parts.push('DEBUFF');
  return { name: move.name, parts, danger: fx.damage !== undefined };
}

export function targetsNow(c: Combat): EnemyState[] {
  return presentEnemies(c);
}

export function pileCounts(c: Combat): { draw: number; discard: number; exhaust: number; otherDraw?: number } {
  const p = currentPile(c);
  const out: { draw: number; discard: number; exhaust: number; otherDraw?: number } = { draw: p.draw.length, discard: p.discard.length, exhaust: c.exhaust.length };
  if (c.divorce && !c.custody) out.otherDraw = c.houses[c.activeHouse === 0 ? 1 : 0].draw.length + c.houses[c.activeHouse === 0 ? 1 : 0].discard.length;
  return out;
}
