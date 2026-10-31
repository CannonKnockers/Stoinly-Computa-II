// Act 1 enemies and encounters, from docs/design/game-design-document.md sections 8 and 9.
// WRESTLING MEET HP is the weight class divided by 3, rounded down.

import type { Art, EncounterDef, EnemyDef, EnemyState, MoveDef } from './types';

const MEET: Art = { src: 'art/c31_wrestling.jpg', pos: '50% 55%', credit: 'PHOTO: PUBLIC DOMAIN / WIKIMEDIA COMMONS (2005)' };
const SWAMP: Art = { src: 'art/c28_swamp.jpg', pos: '50% 55%', credit: 'PHOTO: Ursus sapien / CC BY-SA 3.0 / WIKIMEDIA COMMONS' };
const DIVORCE: Art = { src: 'art/c41_divorce.jpg', pos: '45% 55%', credit: 'PHOTO: Artaxerxes / CC BY-SA 4.0 / WIKIMEDIA COMMONS' };

const m = (name: string, effect: MoveDef['effect']): MoveDef => ({ name, effect });

const SCROLLS = 6;

export const ENEMIES: Record<string, EnemyDef> = {
  'the-103': {
    id: 'the-103', name: 'THE 103', hp: 34, kind: 'wrestler', art: MEET,
    loop: [m('SHOOT', { damage: 6 }), m('SPRAWL', { block: 6 })],
  },
  'the-112': {
    id: 'the-112', name: 'THE 112', hp: 37, kind: 'wrestler', art: MEET,
    loop: [m('TAKEDOWN', { damage: 5 }), m('HALF NELSON', { applyToPlayer: { weak: 1 } })],
  },
  'the-119': {
    id: 'the-119', name: 'THE 119', hp: 39, kind: 'wrestler', art: MEET, loopOffset: 1,
    loop: [m('TAKEDOWN', { damage: 5 }), m('HALF NELSON', { applyToPlayer: { weak: 1 } })],
  },
  'the-145': {
    id: 'the-145', name: 'THE 145', hp: 48, kind: 'wrestler', art: MEET,
    loop: [m('DOUBLE LEG', { damage: 9 }), m('CUT WEIGHT', { strength: 1 })],
  },
  'the-152': {
    id: 'the-152', name: 'THE 152', hp: 50, kind: 'wrestler', art: MEET,
    loop: [m('SINGLE LEG', { damage: 6, block: 5 })],
  },
  'the-215': {
    id: 'the-215', name: 'THE 215', hp: 71, kind: 'wrestler', art: MEET,
    loop: [m('HEAVY', { damage: 11 }), m('CRADLE', { damage: 7, applyToPlayer: { weak: 1 } }), m('WEIGH-IN', { strength: 2 })],
  },
  'the-160-captain': {
    id: 'the-160-captain', name: 'THE 160 CAPTAIN', hp: 53, kind: 'wrestler', art: MEET,
    opening: [m('CAPTAIN', { allyStrength: 2 })],
    loop: [m('LEAD BY EXAMPLE', { damage: 8 })],
  },
  'dave-ohio': {
    id: 'dave-ohio', name: 'DAVE, OHIO', hp: 38, kind: 'forum', quote: '"FIRST"',
    preCombat: m('FIRST', { damage: 8 }),
    loop: [m('REPLY', { damage: 7 })],
  },
  'satisfied-user': {
    id: 'satisfied-user', name: 'SATISFIED USER', hp: 40, kind: 'forum',
    quote: '"I have no memory of the last 6 hours."',
    loop: [...Array(SCROLLS).fill(m('SCROLLING', { damage: 5, addToDraw: 'six-hours' })), m('LOST TIME', { damage: 30 })],
    counter: (e: EnemyState) => {
      const pos = e.moveIndex % (SCROLLS + 1);
      return pos === SCROLLS ? 'COUNTER 0' : `COUNTER ${SCROLLS - pos}`;
    },
  },
  'pop-up': {
    id: 'pop-up', name: 'POP-UP', hp: 12, kind: 'popup',
    loop: [m('CLICK HERE!!!', { damage: 4 })],
  },
  'the-diving-board': {
    id: 'the-diving-board', name: 'THE DIVING BOARD', hp: 82, kind: 'swamp', art: SWAMP,
    loop: [m('BOUNCE', { damage: 6 }), m('BOUNCE', { damage: 9 }), m('BOUNCE', { damage: 12 }), m('CANNONBALL', { damage: 24 })],
  },
  'the-skimmer': {
    id: 'the-skimmer', name: 'THE SKIMMER', hp: 70, kind: 'swamp', art: SWAMP,
    loop: [
      m('SKIM', { damage: 8, exhaustTopOfDraw: true }),
      m('NET', { applyToPlayer: { weak: 2 } }),
      m('SKIM', { damage: 8, exhaustTopOfDraw: true }),
      m('POLE', { damage: 12 }),
    ],
  },
  'the-deep-end': {
    id: 'the-deep-end', name: 'THE DEEP END', hp: 110, kind: 'swamp', art: SWAMP,
    loop: [
      m('TREAD WATER', { setPlatedArmor: 6 }),
      m('UNDERTOW', { damage: 10, applyToPlayer: { grounded: 1 } }),
      m('DROWNING', { damage: 18 }),
    ],
  },
  'the-house': {
    id: 'the-house', name: 'THE HOUSE', hp: 90, kind: 'divorce', art: DIVORCE, house: 0,
    loop: [
      m('WE NEED TO TALK', { applyToPlayer: { vulnerable: 2 } }),
      m('MORTGAGE', { damage: 14 }),
      m("IT'S NOT YOUR FAULT", { block: 12, applyToPlayer: { frail: 1 } }),
    ],
  },
  'the-apartment': {
    id: 'the-apartment', name: 'THE APARTMENT', hp: 80, kind: 'divorce', art: DIVORCE, house: 1,
    loop: [
      m('PICKUP AT 6', { damage: 9, addToHand: 'overnight-bag' }),
      m('NEW FURNITURE', { damage: 7, hits: 2 }),
      m('PIZZA AGAIN', { strength: 2 }),
    ],
  },
};

export const ENCOUNTERS: EncounterDef[] = [
  { id: 'meet-103', name: 'THE 103', room: 'WRESTLING MEET', pool: 'easy', enemies: ['the-103'] },
  { id: 'meet-112-119', name: 'THE 112 AND THE 119', room: 'WRESTLING MEET', pool: 'easy', enemies: ['the-112', 'the-119'] },
  { id: 'dave', name: 'DAVE, OHIO', room: 'WRESTLING MEET', pool: 'easy', enemies: ['dave-ohio'] },
  { id: 'meet-145-152', name: 'THE 145 AND THE 152', room: 'WRESTLING MEET', pool: 'normal', enemies: ['the-145', 'the-152'] },
  { id: 'meet-215', name: 'THE 215', room: 'WRESTLING MEET', pool: 'normal', enemies: ['the-215'] },
  { id: 'meet-captain', name: 'THE 160 CAPTAIN AND THE 103', room: 'WRESTLING MEET', pool: 'normal', enemies: ['the-160-captain', 'the-103'] },
  { id: 'satisfied-user', name: 'SATISFIED USER', room: 'WRESTLING MEET', pool: 'normal', enemies: ['satisfied-user'] },
  { id: 'pop-ups', name: 'THE PARTY GOT OUT OF HAND', room: 'OPEN CRIB', pool: 'special', enemies: ['pop-up', 'pop-up', 'pop-up'] },
  { id: 'diving-board', name: 'THE DIVING BOARD', room: 'THE SWAMP', pool: 'elite', enemies: ['the-diving-board'] },
  { id: 'skimmer', name: 'THE SKIMMER', room: 'THE SWAMP', pool: 'elite', enemies: ['the-skimmer'] },
  { id: 'deep-end', name: 'THE DEEP END', room: 'THE SWAMP', pool: 'elite', enemies: ['the-deep-end'] },
  { id: 'divorce', name: "PARENTS' DIVORCE", room: 'BOSS', pool: 'boss', enemies: ['the-house', 'the-apartment'], divorce: true },
];

export function enemyDef(id: string): EnemyDef {
  const d = ENEMIES[id];
  if (!d) throw new Error(`Unknown enemy ${id}`);
  return d;
}

export function currentMove(e: EnemyState): MoveDef {
  const d = enemyDef(e.defId);
  const opening = d.opening ?? [];
  if (e.moveIndex < opening.length) return opening[e.moveIndex];
  return d.loop[(e.moveIndex - opening.length + (d.loopOffset ?? 0)) % d.loop.length];
}
