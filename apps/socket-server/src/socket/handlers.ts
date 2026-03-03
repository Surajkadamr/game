import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  TableConfig,
} from '@kadam/shared';
import { GameManager } from '../game/game-manager';
import type { MemoryGameStore } from '../redis/memory-store';
import { HandEvent } from '../game/game-engine';
import { verifyAdminToken } from '../middleware/auth';
import { isLiveKitConfigured, generateLiveKitToken, getLiveKitUrl } from '../voice/voiceService';

type PokerSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type PokerServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerHandlers(io: PokerServer, manager: GameManager, store: MemoryGameStore): void {
  if (isLiveKitConfigured()) {
    console.log('[Voice] LiveKit configured — voice tokens will be issued on table join');
  } else {
    console.log('[Voice] LiveKit NOT configured — voice chat disabled (set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL)');
  }

  /** Helper: generate voice token payload if LiveKit is configured */
  async function getVoicePayload(tableId: string, playerId: string, playerName: string) {
    if (!isLiveKitConfigured()) return {};
    try {
      const voiceToken = await generateLiveKitToken(tableId, playerId, playerName);
      return { voiceToken, livekitUrl: getLiveKitUrl() };
    } catch (err) {
      console.error('[Voice] Failed to generate LiveKit token:', err);
      return {};
    }
  }

  // ─── Game Manager Events → Socket.IO ───────────────────────────────────

  manager.on('table_event', async (payload: any) => {
    const { tableId } = payload;
    const room = `table:${tableId}`;

    if (payload.type === 'timer') {
      io.to(room).emit('game:timer', {
        playerId: payload.playerId,
        timeRemainingMs: payload.timeRemainingMs,
        totalMs: payload.totalMs,
      });
      return;
    }

    const event: HandEvent = payload.event;
    const engine = await manager.getTable(tableId);
    if (!engine) return;

    const state = engine.getState();

    switch (event.type) {
      case 'hand_started': {
        io.to(room).emit('game:new_hand', {
          handNumber: event.handNumber,
          dealerSeatIndex: event.dealerSeatIndex,
        });

        // Send private hole cards to each player
        for (const player of state.players) {
          if (player.holeCards?.length === 2) {
            const socket = findSocket(io, player.id);
            socket?.emit('game:hole_cards', { cards: player.holeCards });
          }
        }

        io.to(room).emit('game:state', engine.getPublicState());
        break;
      }

      case 'action': {
        io.to(room).emit('game:action_taken', {
          playerId: event.action.playerId,
          playerName: state.players.find((p) => p.id === event.action.playerId)?.name ?? '',
          action: event.action,
          newGameState: {
            players: engine.getPublicState().players,
            pots: state.pots,
            currentBet: state.currentBet,
          },
        });
        break;
      }

      case 'turn_changed': {
        io.to(room).emit('game:state', engine.getPublicState());

        if (event.activePlayerSeatIndex !== null) {
          const activePlayer = state.players.find((p) => p.seatIndex === event.activePlayerSeatIndex);
          if (activePlayer) {
            const playerBet = state.roundBets.get(activePlayer.id) ?? 0;
            const callAmount = Math.max(0, state.currentBet - playerBet);
            const maxRaise = activePlayer.chips + playerBet;
            const canCheck = state.currentBet <= playerBet;

            const socket = findSocket(io, activePlayer.id);
            socket?.emit('game:your_turn', {
              timeoutAt: Date.now() + state.config.turnTimeoutMs,
              callAmount,
              minRaise: state.currentBet + state.minRaise,
              maxRaise,
              canCheck,
            });
          }
        }
        break;
      }

      case 'community_cards': {
        io.to(room).emit('game:community_cards', { cards: event.cards, round: event.round });
        io.to(room).emit('game:state', engine.getPublicState());
        break;
      }

      case 'chips_to_pot': {
        io.to(room).emit('game:chips_to_pot', {
          playerId: event.playerId,
          amount: event.amount,
          potAmount: state.pots.reduce((s, p) => s + p.amount, 0),
        });
        break;
      }

      case 'hand_ended': {
        io.to(room).emit('game:winners', {
          winners: event.winners,
          showCards: event.showCards,
        });
        io.to(room).emit('game:state', engine.getPublicState(true));
        break;
      }

      case 'pots_updated': {
        io.to(room).emit('game:state', engine.getPublicState());
        break;
      }
    }
  });

  // ─── Socket Connection ──────────────────────────────────────────────────

  io.on('connection', (socket: PokerSocket) => {
    // ── Persistent player identity ────────────────────────────────────────
    // Client sends their stored UUID in socket auth. Fall back to a new UUID
    // only if the client hasn't set one yet (first-ever connection).
    const authId = (socket.handshake.auth as any)?.playerId as string | undefined;
    socket.data.playerId = (authId && authId.length === 36) ? authId : uuidv4();
    socket.data.isAdmin = false;

    console.log(`[Socket] Connected: ${socket.id} → player: ${socket.data.playerId}`);

    // ── Auto-reconnect: if this player was in a table, re-join the room ──
    // (They may have refreshed the page while mid-game)
    store.getPlayerTable(socket.data.playerId).then(async (savedTableId) => {
      if (!savedTableId) return;

      const engine = await manager.getTable(savedTableId);
      if (!engine) return;

      const internalState = engine.getState();
      const existingPlayer = internalState.players.find((p) => p.id === socket.data.playerId);
      if (!existingPlayer) return;

      // Re-join socket room silently
      socket.data.tableId = savedTableId;
      await socket.join(`table:${savedTableId}`);
      engine.setPlayerConnected(socket.data.playerId, true);
      await store.saveState(savedTableId, engine.getState());

      // Generate voice token for reconnecting player
      const voicePayload = await getVoicePayload(savedTableId, socket.data.playerId, existingPlayer.name);

      // Notify the player they've been reconnected
      socket.emit('table:join_result', {
        success: true,
        tableId: savedTableId,
        playerId: socket.data.playerId,
        gameState: engine.getPublicState(),
        ...voicePayload,
      });

      // Send hole cards if they have them
      if (existingPlayer.holeCards?.length === 2) {
        socket.emit('game:hole_cards', { cards: existingPlayer.holeCards });
      }

      // Notify table
      socket.to(`table:${savedTableId}`).emit('player:reconnected', {
        playerId: socket.data.playerId,
        playerName: existingPlayer.name,
      });

      console.log(`[Socket] Auto-reconnected ${existingPlayer.name} to table ${savedTableId}`);
    }).catch((err) => {
      console.error('[Socket] Auto-reconnect error:', err);
    });

    // ─── Ping/Pong ────────────────────────────────────────────────────────

    socket.on('ping', (timestamp) => {
      socket.emit('pong', { timestamp, serverTime: Date.now() });
    });

    // ─── Lobby ───────────────────────────────────────────────────────────

    socket.on('lobby:list', async () => {
      try {
        const tables = await store.getTableSummaries();
        socket.emit('lobby:tables', tables);
      } catch (err) {
        console.error('[Socket] lobby:list error:', err);
        socket.emit('error', { code: 'LOBBY_ERROR', message: 'Failed to fetch tables' });
      }
    });

    // ─── Create Table ────────────────────────────────────────────────────

    socket.on('table:create', async (payload) => {
      try {
        const config: TableConfig = {
          id: uuidv4(),
          name: payload.name,
          maxPlayers: Math.min(6, Math.max(2, payload.maxPlayers)) as 2 | 3 | 4 | 5 | 6,
          smallBlind: payload.smallBlind,
          bigBlind: payload.bigBlind,
          minBuyIn: payload.bigBlind * 10,
          maxBuyIn: payload.bigBlind * 100,
          turnTimeoutMs: 30000, // 30-second timer
          isPrivate: payload.isPrivate,
          password: payload.password,
        };

        await manager.createTable(config);
        await store.saveTableConfig(config);

        socket.emit('table:created', { tableId: config.id, config });
        console.log(`[Socket] Table created: ${config.id} "${config.name}"`);
      } catch (err) {
        console.error('[Socket] table:create error:', err);
        socket.emit('error', { code: 'CREATE_ERROR', message: 'Failed to create table' });
      }
    });

    // ─── Join Table ──────────────────────────────────────────────────────

    socket.on('table:join', async ({ tableId, playerName, buyIn }) => {
      try {
        socket.data.playerName = playerName;

        // ── Check if this player is ALREADY seated at this table ──────────
        const engine = await manager.getTable(tableId);
        if (engine) {
          const internalState = engine.getState();
          const existingPlayer = internalState.players.find((p) => p.id === socket.data.playerId);

          if (existingPlayer) {
            // Reconnect: update connection status, join room, return state
            engine.setPlayerConnected(socket.data.playerId, true);
            await store.saveState(tableId, engine.getState());

            if (socket.data.tableId !== tableId) {
              if (socket.data.tableId) socket.leave(`table:${socket.data.tableId}`);
              socket.data.tableId = tableId;
              await socket.join(`table:${tableId}`);
              await store.setPlayerTable(socket.data.playerId, tableId);
            }

            const voicePayload = await getVoicePayload(tableId, socket.data.playerId, existingPlayer.name);

            socket.emit('table:join_result', {
              success: true,
              tableId,
              playerId: socket.data.playerId,
              gameState: engine.getPublicState(),
              ...voicePayload,
            });

            if (existingPlayer.holeCards?.length === 2) {
              socket.emit('game:hole_cards', { cards: existingPlayer.holeCards });
            }

            socket.to(`table:${tableId}`).emit('player:reconnected', {
              playerId: socket.data.playerId,
              playerName: existingPlayer.name,
            });

            console.log(`[Socket] ${playerName} reconnected to table ${tableId}`);
            return;
          }
        }

        // ── New player joining ────────────────────────────────────────────
        const result = await manager.joinTable(tableId, socket.data.playerId, playerName, buyIn);

        if (!result.success) {
          socket.emit('table:join_result', { success: false, message: result.message });
          return;
        }

        if (socket.data.tableId) socket.leave(`table:${socket.data.tableId}`);
        socket.data.tableId = tableId;
        await socket.join(`table:${tableId}`);
        await store.setPlayerTable(socket.data.playerId, tableId);

        const freshEngine = await manager.getTable(tableId);
        const voicePayload = await getVoicePayload(tableId, socket.data.playerId, playerName);

        socket.emit('table:join_result', {
          success: true,
          tableId,
          playerId: socket.data.playerId,
          gameState: freshEngine?.getPublicState(),
          ...voicePayload,
        });

        socket.to(`table:${tableId}`).emit('player:joined', {
          playerId: socket.data.playerId,
          playerName,
          seatIndex: result.seatIndex!,
          chips: buyIn,
        });

        console.log(`[Socket] ${playerName} joined table ${tableId} (seat ${result.seatIndex})`);
      } catch (err) {
        console.error('[Socket] table:join error:', err);
        socket.emit('error', { code: 'JOIN_ERROR', message: 'Failed to join table' });
      }
    });

    // ─── Leave Table ─────────────────────────────────────────────────────

    socket.on('table:leave', async () => {
      const tableId = socket.data.tableId;
      if (!tableId) return;
      await manager.leaveTable(tableId, socket.data.playerId);
      await store.removePlayerTable(socket.data.playerId);
      socket.leave(`table:${tableId}`);
      socket.data.tableId = undefined;
      io.to(`table:${tableId}`).emit('player:left', {
        playerId: socket.data.playerId,
        playerName: socket.data.playerName ?? 'Player',
        reason: 'left',
      });
    });

    // ─── Game Action ─────────────────────────────────────────────────────

    socket.on('game:action', async (action) => {
      try {
        const tableId = socket.data.tableId;
        if (!tableId) {
          socket.emit('error', { code: 'NOT_IN_TABLE', message: 'Not in a table' });
          return;
        }
        // Override playerId from socket auth — don't trust client-supplied ID
        const validatedAction = { ...action, playerId: socket.data.playerId };
        await manager.processAction(tableId, validatedAction);
      } catch (err) {
        console.error('[Socket] game:action error:', err);
        socket.emit('error', { code: 'ACTION_ERROR', message: 'Invalid action' });
      }
    });

    // ─── Game Sync (manual reconnect request) ────────────────────────────

    socket.on('game:sync', async (tableId) => {
      try {
        const engine = await manager.getTable(tableId);
        if (!engine) {
          socket.emit('error', { code: 'TABLE_NOT_FOUND', message: 'Table not found' });
          return;
        }

        // Re-join socket room
        await socket.join(`table:${tableId}`);
        socket.data.tableId = tableId;

        // Mark player as connected
        engine.setPlayerConnected(socket.data.playerId, true);
        await store.saveState(tableId, engine.getState());
        await store.setPlayerTable(socket.data.playerId, tableId);

        socket.emit('game:state', engine.getPublicState());

        // Send hole cards if applicable
        const internalState = engine.getState();
        const player = internalState.players.find((p) => p.id === socket.data.playerId);
        if (player?.holeCards?.length === 2) {
          socket.emit('game:hole_cards', { cards: player.holeCards });
        }
      } catch (err) {
        console.error('[Socket] game:sync error:', err);
      }
    });

    // ─── Admin ───────────────────────────────────────────────────────────

    socket.on('admin:start', async ({ tableId, token }) => {
      if (!verifyAdminToken(token)) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Invalid admin token' });
        return;
      }
    });

    socket.on('admin:kick', async ({ tableId, playerId, token }) => {
      if (!verifyAdminToken(token)) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Invalid admin token' });
        return;
      }
      await manager.leaveTable(tableId, playerId);
      io.to(`table:${tableId}`).emit('player:left', { playerId, playerName: '', reason: 'kicked' });
    });

    // ─── Voice Chat (LiveKit token refresh) ───────────────────────────────

    socket.on('voice:token', async ({ tableId }) => {
      if (tableId !== socket.data.tableId) return;
      const payload = await getVoicePayload(tableId, socket.data.playerId, socket.data.playerName ?? 'Player');
      if (payload.voiceToken) {
        socket.emit('voice:token', { voiceToken: payload.voiceToken, livekitUrl: payload.livekitUrl! });
      }
    });

    // ─── Disconnect ──────────────────────────────────────────────────────

    socket.on('disconnect', async (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
      const tableId = socket.data.tableId;
      if (!tableId) return;

      const engine = await manager.getTable(tableId);
      if (engine) {
        engine.setPlayerConnected(socket.data.playerId, false);
        await store.saveState(tableId, engine.getState());
      }

      socket.leave(`table:${tableId}`);

      io.to(`table:${tableId}`).emit('player:left', {
        playerId: socket.data.playerId,
        playerName: socket.data.playerName ?? 'Player',
        reason: 'disconnected',
      });

      // Give 90 seconds to reconnect before removing from table
      setTimeout(async () => {
        // Check if still disconnected (no socket found with this playerId)
        const stillConnected = findSocket(io, socket.data.playerId);
        if (!stillConnected) {
          console.log(`[Socket] Player ${socket.data.playerId} did not reconnect — removing from table`);
          await manager.leaveTable(tableId, socket.data.playerId);
          await store.removePlayerTable(socket.data.playerId);
        }
      }, 90_000);
    });
  });
}

/** Find an active socket by player ID */
function findSocket(io: PokerServer, playerId: string): PokerSocket | undefined {
  for (const [, socket] of io.sockets.sockets) {
    if ((socket as PokerSocket).data.playerId === playerId) return socket as PokerSocket;
  }
  return undefined;
}
