// Primitive actions shared by cards, enemy moves and the turn loop.

import { attackDamage, cardBlock } from './math';
import { nextInt, shuffle } from './rng';
import { DURATION_STATUSES, type CardInstance, type Combat, type Creature, type EnemyState, type Pile, type StatusId } from './types';

export const HAND_LIMIT = 10;

export function log(c: Combat, line: string): void {
  c.log.push(line);
  if (c.log.length > 200) c.log.shift();
}

export function currentPile(c: Combat): Pile {
  return c.houses[c.custody || !c.divorce ? 0 : c.activeHouse];
}

export function makeCard(c: Combat, defId: string): CardInstance {
  return { uid: c.nextUid++, defId };
}

export function isPresent(c: Combat, e: EnemyState): boolean {
  if (e.dead) return false;
  if (!c.divorce || c.custody || e.house === undefined) return true;
  return e.house === c.activeHouse;
}

export function presentEnemies(c: Combat): EnemyState[] {
  return c.enemies.filter((e) => isPresent(c, e));
}

/** Damage to a creature: Block absorbs first. Returns HP actually lost. */
export function dealDamage(c: Combat, target: Creature, amount: number, isAttack: boolean): number {
  if (amount <= 0) return 0;
  const absorbed = Math.min(target.block, amount);
  target.block -= absorbed;
  const unblocked = amount - absorbed;
  target.hp = Math.max(0, target.hp - unblocked);
  if (isAttack && unblocked > 0 && (target.statuses.platedArmor ?? 0) > 0) {
    target.statuses.platedArmor = (target.statuses.platedArmor ?? 0) - 1;
  }
  if (target !== c.player && target.hp === 0) killEnemy(c, target as EnemyState);
  if (target === c.player && c.player.hp === 0) {
    c.phase = 'lost';
    log(c, 'A REAL HUMAN IS DOWN.');
  }
  return unblocked;
}

export function playerAttack(c: Combat, target: EnemyState, base: number, hits = 1): void {
  for (let i = 0; i < hits && !target.dead; i++) {
    const dmg = attackDamage(base, c.player, target);
    const lost = dealDamage(c, target, dmg, true);
    log(c, `${target.name} TAKES ${lost}${lost < dmg ? ` (${dmg - lost} BLOCKED)` : ''}.`);
  }
}

export function gainCardBlock(c: Combat, base: number): void {
  const b = cardBlock(base, c.player);
  c.player.block += b;
  log(c, `BLOCK +${b}.`);
}

export function applyStatus(c: Combat, target: Creature, id: StatusId, n: number): void {
  target.statuses[id] = (target.statuses[id] ?? 0) + n;
  // A debuff the enemy puts on the player during the enemy's turn must still be
  // there for the player's whole next turn, so it skips one tick.
  if (target === c.player && c.phase === 'enemy' && DURATION_STATUSES.includes(id) && !target.skipTick.includes(id)) {
    target.skipTick.push(id);
  }
}

export function tickDurations(target: Creature): void {
  for (const id of DURATION_STATUSES) {
    const v = target.statuses[id];
    if (!v) continue;
    const skip = target.skipTick.indexOf(id);
    if (skip >= 0) {
      target.skipTick.splice(skip, 1);
      continue;
    }
    if (v - 1 <= 0) delete target.statuses[id];
    else target.statuses[id] = v - 1;
  }
}

export function drawCards(c: Combat, n: number): number {
  const pile = currentPile(c);
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (c.hand.length >= HAND_LIMIT) break;
    if (pile.draw.length === 0) {
      if (pile.discard.length === 0) break;
      pile.draw = shuffle(c, pile.discard.splice(0));
      log(c, 'THE DISCARD IS SHUFFLED BACK IN.');
    }
    c.hand.push(pile.draw.pop()!);
    drawn++;
  }
  return drawn;
}

export function addToHand(c: Combat, defId: string): void {
  const card = makeCard(c, defId);
  if (c.hand.length >= HAND_LIMIT) currentPile(c).discard.push(card);
  else c.hand.push(card);
}

export function addToDraw(c: Combat, defId: string): void {
  const pile = currentPile(c);
  // Insert at a random position; the rest of the pile keeps its order.
  pile.draw.splice(nextInt(c, pile.draw.length + 1), 0, makeCard(c, defId));
}

function killEnemy(c: Combat, e: EnemyState): void {
  if (e.dead) return;
  e.dead = true;
  e.block = 0;
  log(c, `${e.name} IS DONE.`);
  if (c.divorce && !c.custody) {
    const survivor = c.enemies.find((x) => !x.dead);
    if (survivor) {
      c.custody = true;
      const merged: Pile = {
        draw: shuffle(c, [...c.houses[0].draw, ...c.houses[1].draw]),
        discard: [...c.houses[0].discard, ...c.houses[1].discard],
      };
      c.houses = [merged];
      c.activeHouse = 0;
      survivor.statuses.strength = (survivor.statuses.strength ?? 0) + 3;
      log(c, `FULL CUSTODY. ${survivor.name} GAINS 3 STRENGTH. THE PILES MERGE.`);
    }
  }
  if (c.enemies.every((x) => x.dead)) {
    c.phase = 'won';
    log(c, 'THE COMPUTER RECORDS A WIN.');
  }
}
