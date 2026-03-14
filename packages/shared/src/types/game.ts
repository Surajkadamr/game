// ─── Card Types ────────────────────────────────────────────────────────────

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  /** Numeric value: 2-14 (Ace=14) */
  value: number;
}

// ─── Hand Evaluation ───────────────────────────────────────────────────────

export type HandRank =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'one_pair'
  | 'high_card';

export interface HandResult {
  rank: HandRank;
  score: number;         // numeric score for comparison
  cards: Card[];         // best 5 cards
  description: string;   // e.g. "Full House — Aces over Kings"
}

// ─── Player ────────────────────────────────────────────────────────────────

export type PlayerStatus = 'active' | 'folded' | 'all_in' | 'sitting_out' | 'eliminated';
export type PositionBadge = 'D' | 'SB' | 'BB' | 'UTG' | null;

export interface Player {
  id: string;
  name: string;
  avatar?: string;
  chips: number;         // in paise
  seatIndex: number;     // 0-5
  status: PlayerStatus;
  holeCards?: Card[];    // only visible to the player themselves
  currentBet: number;    // current bet this round (paise)
  totalBetThisHand: number;
  isConnected: boolean;
  badge?: PositionBadge;
  /** Whether player has acted this round */
  hasActed: boolean;
}

export interface PublicPlayer extends Omit<Player, 'holeCards'> {
  hasHoleCards: boolean; // true when player has cards but they're hidden
  holeCards?: Card[];    // only populated at showdown or for the player themselves
}

// ─── Pot ───────────────────────────────────────────────────────────────────

export interface Pot {
  amount: number;        // paise
  eligiblePlayers: string[]; // player IDs eligible for this pot
  isMain: boolean;
}

// ─── Betting Round ─────────────────────────────────────────────────────────

export type BettingRound = 'pre_flop' | 'flop' | 'turn' | 'river' | 'showdown';

// ─── Game Phase ────────────────────────────────────────────────────────────

export type GamePhase =
  | 'waiting'      // waiting for players
  | 'starting'     // countdown before hand
  | 'dealing'      // cards being animated
  | 'betting'      // active betting round
  | 'showdown'     // revealing cards
  | 'winner'       // winner shown
  | 'between_hands'; // brief pause before next hand

// ─── Action ────────────────────────────────────────────────────────────────

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export interface PlayerAction {
  playerId: string;
  action: ActionType;
  amount?: number; // paise — required for raise/call
}

// ─── Buy-In Tracker ───────────────────────────────────────────────────

export interface BuyInRecord {
  amount: number;       // paise
  timestamp: number;
  type: 'initial' | 'rebuy' | 'top_up';
}

export interface BuyInTrackerEntry {
  playerName: string;
  nameKey: string;              // lowercase for matching
  totalBuyIns: number;          // sum of all buy-ins (paise)
  currentChips: number;         // live chips or final chips if left
  profitLoss: number;           // currentChips - totalBuyIns
  isSeated: boolean;            // still at table?
  buyInHistory: BuyInRecord[];
  pendingBuyIn: number;         // queued mid-game buy-in
  lastPlayerId: string;         // most recent player ID
}

export interface BuyInTrackerState {
  enabled: boolean;
  entries: BuyInTrackerEntry[];
}

// ─── Table Config ──────────────────────────────────────────────────────────

export interface TableConfig {
  id: string;
  name: string;
  maxPlayers: 2 | 3 | 4 | 5 | 6;
  smallBlind: number;   // paise — default 500 (₹5)
  bigBlind: number;     // paise — default 1000 (₹10)
  minBuyIn: number;     // paise — default 10000 (₹100)
  maxBuyIn: number;     // paise — default 100000 (₹1000)
  turnTimeoutMs: number; // default 15000
  isPrivate: boolean;
  password?: string;
  buyInTrackerEnabled?: boolean;
}

// ─── Game State ────────────────────────────────────────────────────────────

export interface GameState {
  tableId: string;
  config: TableConfig;
  phase: GamePhase;
  round: BettingRound | null;
  handNumber: number;
  players: PublicPlayer[];
  communityCards: Card[];
  pots: Pot[];
  currentBet: number;        // highest bet this round (paise)
  minRaise: number;          // minimum raise amount (paise)
  dealerSeatIndex: number;
  activePlayerSeatIndex: number | null;
  actionStartTime: number | null; // timestamp for timer
  lastAction?: PlayerAction;
  winners?: WinnerInfo[];
  buyInTracker?: BuyInTrackerState;
}

// ─── Winner Info ───────────────────────────────────────────────────────────

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number; // paise
  handResult?: HandResult;
  potIndex: number;
}

// ─── Seat ──────────────────────────────────────────────────────────────────

export interface SeatInfo {
  seatIndex: number;
  playerId: string | null;
  playerName: string | null;
  chips: number | null;
  status: PlayerStatus | null;
}

// ─── Lobby ─────────────────────────────────────────────────────────────────

export interface TableSummary {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  phase: GamePhase;
  isPrivate: boolean;
}
