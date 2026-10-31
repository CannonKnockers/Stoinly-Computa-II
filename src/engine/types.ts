// Core data types for one combat. The engine is pure TypeScript with no DOM,
// so every rule can be tested without a browser.

export type Lane = 'strong' | 'guest' | 'action' | 'place' | 'vehicle' | 'stoinly' | 'status';
export type Rarity = 'basic' | 'common' | 'rare' | 'holo' | 'ultra' | 'status';
export type CardType = 'Attack' | 'Skill' | 'Status' | 'Quest';

/** Statuses used in this combat. Duration statuses tick down; the others do not. */
export type StatusId = 'strength' | 'dexterity' | 'vulnerable' | 'weak' | 'frail' | 'platedArmor' | 'grounded';
export const DURATION_STATUSES: readonly StatusId[] = ['vulnerable', 'weak', 'frail', 'grounded'];

export interface Creature {
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Partial<Record<StatusId, number>>;
  /** Duration statuses applied during the other side's turn skip their next tick. */
  skipTick: StatusId[];
}

export interface PlayerState extends Creature {
  energy: number;
  maxEnergy: number;
}

export interface Art {
  src: string;
  /** CSS object-position: the focal point the site uses for this photo. */
  pos: string;
  credit: string;
}

export interface CardInstance {
  uid: number;
  defId: string;
}

export interface Pile {
  draw: CardInstance[];
  discard: CardInstance[];
}

export interface EnemyState extends Creature {
  uid: number;
  defId: string;
  /** Position in the enemy's move sequence (opening moves, then the loop). */
  moveIndex: number;
  /** PARENTS' DIVORCE only: which household this body belongs to. */
  house?: 0 | 1;
  dead: boolean;
}

export type Phase = 'player' | 'enemy' | 'won' | 'lost';

export interface Combat {
  encounterId: string;
  seed: number;
  rngState: number;
  turn: number;
  phase: Phase;
  player: PlayerState;
  hand: CardInstance[];
  /** One pile normally. Two during PARENTS' DIVORCE: THE HOUSE (0) and THE APARTMENT (1). */
  houses: Pile[];
  activeHouse: 0 | 1;
  exhaust: CardInstance[];
  enemies: EnemyState[];
  relics: string[];
  divorce: boolean;
  custody: boolean;
  log: string[];
  nextUid: number;
}

/** What a move does. The intent shown on screen is derived from this, so it can never lie. */
export interface MoveEffect {
  damage?: number;
  hits?: number;
  block?: number;
  /** Strength gained by this enemy. */
  strength?: number;
  /** Strength gained by every living enemy, this one included. */
  allyStrength?: number;
  applyToPlayer?: Partial<Record<StatusId, number>>;
  /** Sets Plated Armor to this value instead of adding to it. */
  setPlatedArmor?: number;
  addToDraw?: string;
  addToHand?: string;
  exhaustTopOfDraw?: boolean;
}

export interface MoveDef {
  name: string;
  effect: MoveEffect;
}

export type EnemyKind = 'wrestler' | 'forum' | 'popup' | 'swamp' | 'divorce';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  kind: EnemyKind;
  /** A line from the site, shown on forum-poster enemies. */
  quote?: string;
  art?: Art;
  opening?: MoveDef[];
  loop: MoveDef[];
  /** Start this many moves into the loop, to offset paired enemies. */
  loopOffset?: number;
  /** Resolved once before the player's first turn. */
  preCombat?: MoveDef;
  /** Extra line under the intent, such as SATISFIED USER's counter. */
  counter?: (enemy: EnemyState) => string;
  house?: 0 | 1;
}

export interface EncounterDef {
  id: string;
  name: string;
  room: 'WRESTLING MEET' | 'THE SWAMP' | 'OPEN CRIB' | 'BOSS';
  pool: 'easy' | 'normal' | 'elite' | 'special' | 'boss';
  enemies: string[];
  divorce?: boolean;
}

export interface CardDef {
  id: string;
  /** Number in the site's SERIES 1 set, when the card is one of the 33. */
  num?: number;
  name: string;
  role: string;
  lane: Lane;
  rarity: Rarity;
  /** null means Unplayable. */
  cost: number | null;
  type: CardType;
  target: 'enemy' | 'none';
  ethereal?: boolean;
  retain?: boolean;
  exhausts?: boolean;
  art?: Art;
  /** Rules text. Numbers wrapped in [[ ]] were changed by statuses and are highlighted. */
  text: (c: Combat | null) => string;
  /** A line from the site, shown in the card's tooltip. */
  flavor?: string;
  play?: (c: Combat, target: EnemyState | null) => void;
}
