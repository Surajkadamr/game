import { EventEmitter } from 'events';
import { GameEngine, InternalGameState, HandEvent } from './game-engine';
import type { TableConfig, PlayerAction } from '@kadam/shared';
// Store can be Redis-backed GameStore or MemoryGameStore — both share the same interface
import type { MemoryGameStore } from '../redis/memory-store';
type AnyStore = MemoryGameStore;

interface ManagedTable {
  engine: GameEngine;
  turnTimer: ReturnType<typeof setTimeout> | null;
  betweenHandTimer: ReturnType<typeof setTimeout> | null;
}

type TableEvent =
  | { tableId: string; event: HandEvent }
  | { tableId: string; type: 'timer'; playerId: string; timeRemainingMs: number; totalMs: number };

export class GameManager extends EventEmitter {
  private tables: Map<string, ManagedTable> = new Map();
  private readonly store: AnyStore;

  constructor(store: AnyStore) {
    super();
    this.store = store;
  }

  async createTable(config: TableConfig): Promise<GameEngine> {
    const engine = new GameEngine(config);
    this.tables.set(config.id, { engine, turnTimer: null, betweenHandTimer: null });
    await this.store.saveState(config.id, engine.getState());
    return engine;
  }

  async getTable(tableId: string): Promise<GameEngine | null> {
    // Try in-memory first
    const managed = this.tables.get(tableId);
    if (managed) return managed.engine;

    // Load from Redis
    const state = await this.store.loadState(tableId);
    if (!state) return null;

    const engine = new GameEngine(state.config, state);
    this.tables.set(tableId, { engine, turnTimer: null, betweenHandTimer: null });
    return engine;
  }

  async joinTable(
    tableId: string,
    playerId: string,
    playerName: string,
    buyIn: number,
    seatIndex?: number,
  ): Promise<{ success: boolean; message?: string; seatIndex?: number }> {
    const engine = await this.getTable(tableId);
    if (!engine) return { success: false, message: 'Table not found' };

    const state = engine.getState();
    const config = state.config;

    if (buyIn < config.minBuyIn) {
      return { success: false, message: `Minimum buy-in is ₹${config.minBuyIn / 100}` };
    }
    if (buyIn > config.maxBuyIn) {
      return { success: false, message: `Maximum buy-in is ₹${config.maxBuyIn / 100}` };
    }

    // Find available seat
    const usedSeats = new Set(state.players.map((p) => p.seatIndex));
    let seat = seatIndex ?? -1;

    if (seat === -1) {
      for (let i = 0; i < config.maxPlayers; i++) {
        if (!usedSeats.has(i)) { seat = i; break; }
      }
    }

    if (seat === -1 || usedSeats.has(seat)) {
      return { success: false, message: 'Table is full' };
    }

    const added = engine.addPlayer(playerId, playerName, buyIn, seat);
    if (!added) return { success: false, message: 'Could not join table' };

    await this.store.saveState(tableId, engine.getState());
    await this.tryStartHand(tableId);

    return { success: true, seatIndex: seat };
  }

  async leaveTable(tableId: string, playerId: string): Promise<void> {
    const engine = await this.getTable(tableId);
    if (!engine) return;

    engine.removePlayer(playerId);
    await this.store.saveState(tableId, engine.getState());
  }

  async processAction(tableId: string, action: PlayerAction): Promise<void> {
    const managed = this.tables.get(tableId);
    if (!managed) return;

    const { engine } = managed;

    // Clear current turn timer
    if (managed.turnTimer) {
      clearTimeout(managed.turnTimer);
      managed.turnTimer = null;
    }

    const { events } = engine.processAction(action);
    await this.store.saveState(tableId, engine.getState());

    await this.emitEventsStaggered(tableId, events);

    const state = engine.getState();

    // If hand ended, schedule next hand
    if (state.phase === 'winner') {
      this.scheduleNextHand(tableId, managed);
    } else if (state.phase === 'betting' && state.activePlayerSeatIndex !== null) {
      // Start turn timer for next player
      this.startTurnTimer(tableId, managed, engine);
    }
  }

  async handleTimeout(tableId: string, playerId: string): Promise<void> {
    const managed = this.tables.get(tableId);
    if (!managed) return;

    const { engine } = managed;
    const state = engine.getState();
    const activePlayer = state.players.find((p) => p.seatIndex === state.activePlayerSeatIndex);

    if (!activePlayer || activePlayer.id !== playerId) return;

    const { events } = engine.handleTimeout(playerId);
    await this.store.saveState(tableId, engine.getState());

    await this.emitEventsStaggered(tableId, events);

    if (engine.getState().phase === 'winner') {
      this.scheduleNextHand(tableId, managed);
    } else if (engine.getState().activePlayerSeatIndex !== null) {
      this.startTurnTimer(tableId, managed, engine);
    }
  }

  private async tryStartHand(tableId: string): Promise<void> {
    const managed = this.tables.get(tableId);
    if (!managed) return;

    const { engine } = managed;
    const state = engine.getState();

    if (state.phase !== 'waiting' && state.phase !== 'between_hands' && state.phase !== 'winner') return;

    // Always call startNewHand — it marks broke players as 'eliminated' internally
    // and returns empty events + sets phase='waiting' when not enough players remain.
    const { events } = engine.startNewHand();
    await this.store.saveState(tableId, engine.getState());

    await this.emitEventsStaggered(tableId, events);

    const newState = engine.getState();

    // If startNewHand couldn't start (e.g. one player busted), broadcast the updated
    // state so clients see eliminated players and the waiting phase.
    if (newState.phase === 'waiting' && events.length === 0) {
      this.emit('table_event', { tableId, event: { type: 'pots_updated', pots: [] } });
    }

    if (newState.activePlayerSeatIndex !== null) {
      this.startTurnTimer(tableId, managed, engine);
    }
  }

  private async emitEventsStaggered(tableId: string, events: HandEvent[]): Promise<void> {
    for (const event of events) {
      this.emit('table_event', { tableId, event });
      if (event.type === 'community_cards') {
        await new Promise<void>((r) => setTimeout(r, 1500));
      }
    }
  }

  private scheduleNextHand(tableId: string, managed: ManagedTable): void {
    if (managed.betweenHandTimer) clearTimeout(managed.betweenHandTimer);

    managed.betweenHandTimer = setTimeout(async () => {
      managed.betweenHandTimer = null;
      await this.tryStartHand(tableId);
    }, 10000); // 10 seconds between hands
  }

  private startTurnTimer(tableId: string, managed: ManagedTable, engine: GameEngine): void {
    if (managed.turnTimer) clearTimeout(managed.turnTimer);

    const state = engine.getState();
    const timeoutMs = state.config.turnTimeoutMs;
    const activePlayer = state.players.find((p) => p.seatIndex === state.activePlayerSeatIndex);

    if (!activePlayer) return;

    const playerId = activePlayer.id;

    // Emit timer ticks every 500ms
    let elapsed = 0;
    const tickInterval = setInterval(() => {
      elapsed += 500;
      const remaining = timeoutMs - elapsed;
      this.emit('table_event', {
        tableId,
        type: 'timer',
        playerId,
        timeRemainingMs: remaining,
        totalMs: timeoutMs,
      });
      if (remaining <= 0) clearInterval(tickInterval);
    }, 500);

    managed.turnTimer = setTimeout(async () => {
      clearInterval(tickInterval);
      managed.turnTimer = null;
      await this.handleTimeout(tableId, playerId);
    }, timeoutMs);
  }

  async getTableList(): Promise<string[]> {
    return this.store.listTables();
  }

  async deleteTable(tableId: string): Promise<void> {
    const managed = this.tables.get(tableId);
    if (managed) {
      if (managed.turnTimer) clearTimeout(managed.turnTimer);
      if (managed.betweenHandTimer) clearTimeout(managed.betweenHandTimer);
      this.tables.delete(tableId);
    }
    await this.store.deleteState(tableId);
  }
}
