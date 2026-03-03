import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';

export function isLiveKitConfigured(): boolean {
  return !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);
}

export function getLiveKitUrl(): string {
  return LIVEKIT_URL;
}

/**
 * Generate a LiveKit JWT token for a player to join a voice room.
 * Room name = tableId so only players at the same table hear each other.
 */
export async function generateLiveKitToken(
  tableId: string,
  playerId: string,
  playerName: string,
): Promise<string> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: playerId,
    name: playerName,
    ttl: '6h',
  });

  token.addGrant({
    room: tableId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return await token.toJwt();
}
