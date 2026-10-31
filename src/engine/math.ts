// Damage and Block arithmetic, following the Slay the Spire 1 rules recorded in
// docs/research/slay-the-spire-reference.md: Strength is added per hit before
// multipliers, Weak is x0.75, Vulnerable is x1.5, Frail is x0.75 on card Block,
// and the result rounds down.

import type { Creature } from './types';

export function stat(c: Creature, id: keyof Creature['statuses']): number {
  return c.statuses[id] ?? 0;
}

export function attackDamage(base: number, attacker: Creature, defender: Creature | null): number {
  let d = base + stat(attacker, 'strength');
  if (d < 0) d = 0;
  if (stat(attacker, 'weak') > 0) d *= 0.75;
  if (defender && stat(defender, 'vulnerable') > 0) d *= 1.5;
  return Math.floor(d);
}

export function cardBlock(base: number, player: Creature): number {
  let b = base + stat(player, 'dexterity');
  if (b < 0) b = 0;
  if (stat(player, 'frail') > 0) b *= 0.75;
  return Math.floor(b);
}
