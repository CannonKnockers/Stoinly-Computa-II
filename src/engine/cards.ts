// Card definitions for the starting deck and the status cards enemies create.
// Text and numbers come from docs/design/game-design-document.md, sections 4, 6 and 7.

import { applyStatus, drawCards, gainCardBlock, playerAttack } from './actions';
import { attackDamage, cardBlock } from './math';
import type { CardDef } from './types';

/** Show a number, wrapped in [[ ]] when a status has changed it from the base. */
function n(base: number, actual: number): string {
  return actual === base ? String(base) : `[[${actual}]]`;
}

export const CARDS: Record<string, CardDef> = {
  'purple-power-princess': {
    id: 'purple-power-princess',
    num: 4,
    name: 'PURPLE POWER PRINCESS',
    role: 'ROYALTY DIVISION',
    lane: 'strong',
    rarity: 'common',
    cost: 1,
    type: 'Attack',
    target: 'enemy',
    art: { src: 'art/g6_purple_power.jpg', pos: '20% 30%', credit: 'PHOTO: istolethetv / CC BY 2.0 / WIKIMEDIA COMMONS' },
    text: (c) => `Deal ${c ? n(6, attackDamage(6, c.player, null)) : '6'} damage.`,
    play: (c, t) => playerAttack(c, t!, 6),
  },
  'the-civic': {
    id: 'the-civic',
    num: 29,
    name: 'THE CIVIC',
    role: 'VEHICLE · FIRST CAR',
    lane: 'vehicle',
    rarity: 'common',
    cost: 1,
    type: 'Skill',
    target: 'none',
    art: { src: 'art/c39_civic.jpg', pos: '50% 50%', credit: 'PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS' },
    text: (c) => `Gain ${c ? n(5, cardBlock(5, c.player)) : '5'} Block.`,
    play: (c) => gainCardBlock(c, 5),
  },
  'let-me-see-your-guy': {
    id: 'let-me-see-your-guy',
    num: 14,
    name: 'LET ME SEE YOUR GUY',
    role: 'ACTION CARD · VAPE DIPLOMACY',
    lane: 'action',
    rarity: 'common',
    cost: 1,
    type: 'Skill',
    target: 'enemy',
    art: { src: 'art/c17_guy.jpg', pos: '45% 50%', credit: 'PHOTO: Lindsay Fox, ecigarettereviewed.com / CC BY 3.0 / WIKIMEDIA COMMONS' },
    text: () => 'Apply 1 Vulnerable and 1 Weak. Draw 1 card.',
    play: (c, t) => {
      applyStatus(c, t!, 'vulnerable', 1);
      applyStatus(c, t!, 'weak', 1);
      drawCards(c, 1);
    },
  },
  invitation: {
    id: 'invitation',
    num: 7,
    name: 'TIMOTHY DONALD COOK',
    role: 'INVITED GUEST · CUPERTINO, CALIFORNIA',
    lane: 'guest',
    rarity: 'holo',
    cost: null,
    type: 'Quest',
    target: 'none',
    art: { src: 'art/c13_tim.jpg', pos: '50% 10%', credit: 'PHOTO: Valery Marchive / CC BY-SA 2.0 / WIKIMEDIA COMMONS (2009)' },
    text: () => 'INVITATION. Unplayable. QUEST: end a combat with exactly 250 FREE MONEY.',
    flavor: '"TIM YOU ARE WELCOME ANY TIME. BRING THE COMPUTER."',
  },
  'six-hours': {
    id: 'six-hours',
    name: 'SIX HOURS',
    role: 'STATUS',
    lane: 'status',
    rarity: 'status',
    cost: null,
    type: 'Status',
    target: 'none',
    ethereal: true,
    text: () => 'Unplayable. Ethereal.',
    flavor: '"I have no memory of the last 6 hours." SATISFIED USER',
  },
  'overnight-bag': {
    id: 'overnight-bag',
    name: 'OVERNIGHT BAG',
    role: 'STATUS',
    lane: 'status',
    rarity: 'status',
    cost: null,
    type: 'Status',
    target: 'none',
    retain: true,
    text: () => 'Unplayable. Retain. While this is in your hand, draw 1 fewer card at the start of your turn.',
  },
};

/** The 11-card starting deck (design section 4). */
export const STARTING_DECK: string[] = [
  ...Array(5).fill('purple-power-princess'),
  ...Array(4).fill('the-civic'),
  'let-me-see-your-guy',
  'invitation',
];

export function cardDef(id: string): CardDef {
  const d = CARDS[id];
  if (!d) throw new Error(`Unknown card ${id}`);
  return d;
}
