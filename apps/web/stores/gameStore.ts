'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { GameState, Card, WinnerInfo, TableSummary, PublicPlayer } from '@kadam/shared';

interface TurnInfo {
  timeoutAt: number;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
  canCheck: boolean;
}

interface GameStore {
  isConnected: boolean;
  latency: number;

  playerId: string | null;
  playerName: string | null;

  tableId: string | null;
  gameState: GameState | null;

  myHoleCards: Card[] | null;

  isMyTurn: boolean;
  turnInfo: TurnInfo | null;

  winners: WinnerInfo[] | null;
  winnerShowCards: { playerId: string; cards: Card[] }[] | null;

  tables: TableSummary[];
  lastAction: string | null;

  voiceToken: string | null;
  livekitUrl: string | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setLatency: (latency: number) => void;
  setPlayerIdentity: (id: string, name: string) => void;
  setPlayerName: (name: string) => void;
  setTableId: (id: string | null) => void;
  setVoiceCredentials: (token: string, url: string) => void;
  setGameState: (state: GameState) => void;
  setMyHoleCards: (cards: Card[]) => void;
  setIsMyTurn: (isMy: boolean, info?: TurnInfo) => void;
  clearTurn: () => void;
  setWinners: (winners: WinnerInfo[], showCards: { playerId: string; cards: Card[] }[]) => void;
  clearWinners: () => void;
  setTables: (tables: TableSummary[]) => void;
  setLastAction: (action: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    isConnected: false,
    latency: 0,
    playerId: null,
    playerName: null,
    tableId: null,
    gameState: null,
    myHoleCards: null,
    isMyTurn: false,
    turnInfo: null,
    winners: null,
    winnerShowCards: null,
    tables: [],
    lastAction: null,
    voiceToken: null,
    livekitUrl: null,

    setConnected: (connected) => set({ isConnected: connected }),
    setLatency: (latency) => set({ latency }),
    setVoiceCredentials: (token, url) => set({ voiceToken: token, livekitUrl: url }),

    setPlayerIdentity: (id, name) => {
      set({ playerId: id, playerName: name });
      // Persist to localStorage for reconnection
      if (typeof window !== 'undefined') {
        localStorage.setItem('kadam_player_id', id);
        if (name) localStorage.setItem('kadam_player_name', name);
      }
    },

    setPlayerName: (name) => {
      set({ playerName: name });
      if (typeof window !== 'undefined') {
        localStorage.setItem('kadam_player_name', name);
      }
    },

    setTableId: (id) => {
      set({ tableId: id });
      if (typeof window !== 'undefined') {
        if (id) {
          localStorage.setItem('kadam_table_id', id);
        } else {
          localStorage.removeItem('kadam_table_id');
        }
      }
    },

    setGameState: (state) =>
      set((prev) => {
        const myPlayer = state.players.find((p) => p.id === prev.playerId);
        const isStillMyTurn =
          prev.isMyTurn &&
          state.activePlayerSeatIndex !== null &&
          myPlayer?.seatIndex === state.activePlayerSeatIndex;

        return {
          gameState: state,
          isMyTurn: isStillMyTurn ? prev.isMyTurn : false,
          turnInfo: isStillMyTurn ? prev.turnInfo : null,
        };
      }),

    setMyHoleCards: (cards) => set({ myHoleCards: cards }),

    setIsMyTurn: (isMy, info) => set({ isMyTurn: isMy, turnInfo: info ?? null }),

    clearTurn: () => set({ isMyTurn: false, turnInfo: null }),

    setWinners: (winners, showCards) => set({ winners, winnerShowCards: showCards }),

    clearWinners: () => set({ winners: null, winnerShowCards: null }),

    setTables: (tables) => set({ tables }),

    setLastAction: (action) => set({ lastAction: action }),

    reset: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('kadam_table_id');
      }
      set({
        tableId: null,
        gameState: null,
        myHoleCards: null,
        isMyTurn: false,
        turnInfo: null,
        winners: null,
        winnerShowCards: null,
        lastAction: null,
        voiceToken: null,
        livekitUrl: null,
      });
    },
  })),
);

// ─── Selectors ──────────────────────────────────────────────────────────────

export const selectMyPlayer = (state: GameStore): PublicPlayer | null => {
  if (!state.gameState || !state.playerId) return null;
  return state.gameState.players.find((p) => p.id === state.playerId) ?? null;
};

export const selectActiveSeatPlayer = (state: GameStore): PublicPlayer | null => {
  if (!state.gameState) return null;
  const { activePlayerSeatIndex, players } = state.gameState;
  if (activePlayerSeatIndex === null) return null;
  return players.find((p) => p.seatIndex === activePlayerSeatIndex) ?? null;
};

export const selectTotalPot = (state: GameStore): number => {
  if (!state.gameState) return 0;
  return state.gameState.pots.reduce((sum, p) => sum + p.amount, 0);
};
