import type { Card, GameState, PlayerAction, TableConfig, TableSummary, WinnerInfo, BuyInTrackerState } from './game';

// ─── Client → Server Events ────────────────────────────────────────────────

export interface ClientToServerEvents {
  /** Join a table with buy-in amount (paise) */
  'table:join': (payload: { tableId: string; playerName: string; buyIn: number }) => void;

  /** Leave the current table */
  'table:leave': () => void;

  /** Create a new table */
  'table:create': (payload: {
    name: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    isPrivate: boolean;
    password?: string;
    buyInTrackerEnabled?: boolean;
  }) => void;

  /** Request buy-in (rebuy / top-up) */
  'buyin:request': (payload: { amount: number }) => void;

  /** Player action during betting */
  'game:action': (action: PlayerAction) => void;

  /** Request to see lobby list */
  'lobby:list': () => void;

  /** Request current game state (reconnect) */
  'game:sync': (tableId: string) => void;

  /** Admin: start game manually */
  'admin:start': (payload: { tableId: string; token: string }) => void;

  /** Admin: kick player */
  'admin:kick': (payload: { tableId: string; playerId: string; token: string }) => void;

  /** Ping for latency measurement */
  'ping': (timestamp: number) => void;

  /** Request a fresh LiveKit voice token for the current table */
  'voice:token': (payload: { tableId: string }) => void;
}

// ─── Server → Client Events ────────────────────────────────────────────────

export interface ServerToClientEvents {
  /** Full game state sync */
  'game:state': (state: GameState) => void;

  /** Player's private hole cards */
  'game:hole_cards': (payload: { cards: Card[] }) => void;

  /** A player took an action */
  'game:action_taken': (payload: {
    playerId: string;
    playerName: string;
    action: PlayerAction;
    newGameState: Partial<GameState>;
  }) => void;

  /** New community cards revealed */
  'game:community_cards': (payload: {
    cards: Card[];
    round: string;
  }) => void;

  /** Hand is complete, winners announced */
  'game:winners': (payload: {
    winners: WinnerInfo[];
    showCards: { playerId: string; cards: Card[] }[];
  }) => void;

  /** New hand starting */
  'game:new_hand': (payload: {
    handNumber: number;
    dealerSeatIndex: number;
  }) => void;

  /** It is your turn */
  'game:your_turn': (payload: {
    timeoutAt: number;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
    canCheck: boolean;
  }) => void;

  /** Player timer updated */
  'game:timer': (payload: {
    playerId: string;
    timeRemainingMs: number;
    totalMs: number;
  }) => void;

  /** Chips moved to pot animation trigger */
  'game:chips_to_pot': (payload: {
    playerId: string;
    amount: number;
    potAmount: number;
  }) => void;

  /** A player joined the table */
  'player:joined': (payload: {
    playerId: string;
    playerName: string;
    seatIndex: number;
    chips: number;
  }) => void;

  /** A player left the table */
  'player:left': (payload: {
    playerId: string;
    playerName: string;
    reason: 'left' | 'disconnected' | 'kicked' | 'timeout';
  }) => void;

  /** A player reconnected */
  'player:reconnected': (payload: {
    playerId: string;
    playerName: string;
  }) => void;

  /** Lobby table list */
  'lobby:tables': (tables: TableSummary[]) => void;

  /** Table created successfully */
  'table:created': (payload: { tableId: string; config: TableConfig }) => void;

  /** Error message */
  'error': (payload: { code: string; message: string }) => void;

  /** Join result */
  'table:join_result': (payload: {
    success: boolean;
    tableId?: string;
    playerId?: string;
    message?: string;
    gameState?: GameState;
    voiceToken?: string;
    livekitUrl?: string;
  }) => void;

  /** Pong response */
  'pong': (payload: { timestamp: number; serverTime: number }) => void;

  /** Table is full */
  'table:full': (payload: { tableId: string }) => void;

  /** Chat message */
  'chat:message': (payload: {
    playerId: string;
    playerName: string;
    message: string;
    timestamp: number;
  }) => void;

  /** LiveKit voice token (response to voice:token request) */
  'voice:token': (payload: { voiceToken: string; livekitUrl: string }) => void;

  /** Buy-in request result */
  'buyin:result': (payload: { success: boolean; message?: string; pendingAmount?: number }) => void;

  /** Buy-in tracker state update */
  'buyin:tracker_update': (payload: BuyInTrackerState) => void;
}

// ─── Inter-Server Events ───────────────────────────────────────────────────

export interface InterServerEvents {
  ping: () => void;
}

// ─── Socket Data ───────────────────────────────────────────────────────────

export interface SocketData {
  playerId: string;
  playerName: string;
  tableId?: string;
  isAdmin: boolean;
}
