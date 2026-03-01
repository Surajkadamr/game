import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@kadam/shared';
import { MemoryGameStore } from './redis/memory-store';
import { GameManager } from './game/game-manager';
import { registerHandlers } from './socket/handlers';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
const USE_REDIS = !!process.env.REDIS_URL;

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // ─── Express Setup ────────────────────────────────────────────────────

  app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: USE_REDIS ? 'redis' : 'memory' });
  });

  // ─── Store (Redis or In-Memory) ───────────────────────────────────────

  let store: MemoryGameStore;

  if (USE_REDIS) {
    // Lazy-load Redis only when needed
    const { getRedisClient } = await import('./redis/client');
    const { GameStore } = await import('./redis/game-store');
    const redis = getRedisClient();
    store = new GameStore(redis) as any;
    console.log('[Store] Using Redis:', process.env.REDIS_URL);
  } else {
    store = new MemoryGameStore();
    console.log('[Store] Using in-memory store (no Redis)');
  }

  app.get('/tables', async (_req, res) => {
    try {
      const tables = await store.getTableSummaries();
      res.json(tables);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch tables' });
    }
  });

  const manager = new GameManager(store as any);

  // ─── Socket.IO Setup ──────────────────────────────────────────────────

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 30000,
      pingInterval: 10000,
    },
  );

  registerHandlers(io, manager, store as any);

  // ─── Start Server ─────────────────────────────────────────────────────

  httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   ♠  KADAM POKER — Socket Server         ║
║   Port : ${PORT}                             ║
║   Store: ${USE_REDIS ? 'Redis          ' : 'In-Memory      '}           ║
║   CORS : ${CORS_ORIGIN.substring(0, 28).padEnd(28)}  ║
╚═══════════════════════════════════════════╝
    `);
  });

  // ─── Graceful Shutdown ────────────────────────────────────────────────

  const shutdown = async (signal: string) => {
    console.log(`\n[Server] ${signal} received — shutting down...`);
    io.close();
    httpServer.close();
    if (USE_REDIS) {
      const { closeRedis } = await import('./redis/client');
      await closeRedis();
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
