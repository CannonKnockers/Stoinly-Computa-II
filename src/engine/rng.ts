// Seeded random numbers (mulberry32). The state lives on the Combat object,
// so a fight replays exactly from its seed.

import type { Combat } from './types';

export function nextFloat(c: Combat): number {
  c.rngState = (c.rngState + 0x6d2b79f5) | 0;
  let t = c.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(c: Combat, maxExclusive: number): number {
  return Math.floor(nextFloat(c) * maxExclusive);
}

/** Fisher-Yates shuffle in place. */
export function shuffle<T>(c: Combat, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(c, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
