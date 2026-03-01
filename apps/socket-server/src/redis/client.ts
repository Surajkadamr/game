import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      enableReadyCheck: true,
    });

    redisClient.on('connect', () => console.log('[Redis] Connected'));
    redisClient.on('error', (err) => console.error('[Redis] Error:', err));
    redisClient.on('reconnecting', () => console.log('[Redis] Reconnecting...'));
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
