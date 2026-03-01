/**
 * In-memory fallback that implements the same interface as GameStore (Redis-backed).
 * Used when REDIS_URL is not set or Redis is unavailable.
 */
import type { InternalGameState } from '../game/game-engine';
import type { TableConfig, TableSummary } from '@kadam/shared';

export class MemoryGameStore {
  private states = new Map<string, InternalGameState>();
  private configs = new Map<string, TableConfig>();
  private playerTables = new Map<string, string>();

  async saveState(tableId: string, state: InternalGameState): Promise<void> {
    // Deep-clone the Map so mutations don't affect stored copy
    const clone = { ...state, roundBets: new Map(state.roundBets) };
    this.states.set(tableId, clone);
  }

  async loadState(tableId: string): Promise<InternalGameState | null> {
    const s = this.states.get(tableId);
    if (!s) return null;
    return { ...s, roundBets: new Map(s.roundBets) };
  }

  async deleteState(tableId: string): Promise<void> {
    this.states.delete(tableId);
    this.configs.delete(tableId);
  }

  async listTables(): Promise<string[]> {
    return Array.from(this.states.keys());
  }

  async saveTableConfig(config: TableConfig): Promise<void> {
    this.configs.set(config.id, config);
  }

  async getTableSummaries(): Promise<TableSummary[]> {
    const summaries: TableSummary[] = [];
    for (const [id, state] of this.states) {
      summaries.push({
        id: state.tableId,
        name: state.config.name,
        playerCount: state.players.filter((p) => p.status !== 'eliminated' && p.isConnected).length,
        maxPlayers: state.config.maxPlayers,
        smallBlind: state.config.smallBlind,
        bigBlind: state.config.bigBlind,
        phase: state.phase,
        isPrivate: state.config.isPrivate,
      });
    }
    return summaries;
  }

  async setPlayerTable(playerId: string, tableId: string): Promise<void> {
    this.playerTables.set(playerId, tableId);
  }

  async getPlayerTable(playerId: string): Promise<string | null> {
    return this.playerTables.get(playerId) ?? null;
  }

  async removePlayerTable(playerId: string): Promise<void> {
    this.playerTables.delete(playerId);
  }
}
