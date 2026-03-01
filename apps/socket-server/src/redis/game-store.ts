import type Redis from 'ioredis';
import type { InternalGameState } from '../game/game-engine';
import type { TableConfig, TableSummary } from '@kadam/shared';

const TABLE_KEY = (id: string) => `kadam:table:${id}`;
const TABLE_CONFIG_KEY = (id: string) => `kadam:table:config:${id}`;
const TABLES_SET_KEY = 'kadam:tables';
const TABLE_TTL = 60 * 60 * 24; // 24 hours

export class GameStore {
  constructor(private redis: Redis) {}

  async saveState(tableId: string, state: InternalGameState): Promise<void> {
    // Convert Map to array for serialization
    const serializable = {
      ...state,
      roundBets: Array.from(state.roundBets.entries()),
    };

    await this.redis.setex(TABLE_KEY(tableId), TABLE_TTL, JSON.stringify(serializable));
    await this.redis.sadd(TABLES_SET_KEY, tableId);
  }

  async loadState(tableId: string): Promise<InternalGameState | null> {
    const raw = await this.redis.get(TABLE_KEY(tableId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    // Restore Map from array
    parsed.roundBets = new Map(parsed.roundBets ?? []);
    return parsed as InternalGameState;
  }

  async deleteState(tableId: string): Promise<void> {
    await this.redis.del(TABLE_KEY(tableId));
    await this.redis.srem(TABLES_SET_KEY, tableId);
  }

  async listTables(): Promise<string[]> {
    return this.redis.smembers(TABLES_SET_KEY);
  }

  async saveTableConfig(config: TableConfig): Promise<void> {
    await this.redis.setex(TABLE_CONFIG_KEY(config.id), TABLE_TTL, JSON.stringify(config));
  }

  async getTableSummaries(): Promise<TableSummary[]> {
    const tableIds = await this.listTables();
    const summaries: TableSummary[] = [];

    for (const id of tableIds) {
      const state = await this.loadState(id);
      if (!state) continue;
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

  /** Track player → table mapping for reconnection */
  async setPlayerTable(playerId: string, tableId: string): Promise<void> {
    await this.redis.setex(`kadam:player:${playerId}:table`, TABLE_TTL, tableId);
  }

  async getPlayerTable(playerId: string): Promise<string | null> {
    return this.redis.get(`kadam:player:${playerId}:table`);
  }

  async removePlayerTable(playerId: string): Promise<void> {
    await this.redis.del(`kadam:player:${playerId}:table`);
  }
}
