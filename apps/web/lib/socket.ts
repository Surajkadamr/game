'use client';

import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@kadam/shared';

export type PokerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: PokerSocket | null = null;

/** Generate or retrieve the persistent player ID stored in localStorage. */
export function getOrCreatePlayerId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('kadam_player_id');
  if (!id || id.length !== 36) {
    // Generate a UUID v4 client-side (no crypto.randomUUID needed)
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    localStorage.setItem('kadam_player_id', id);
  }
  return id;
}

export function getSocket(): PokerSocket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
    const playerId = getOrCreatePlayerId();

    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      // Send the persistent player ID in the handshake auth payload.
      // The server reads this to maintain identity across reconnections.
      auth: { playerId },
    }) as PokerSocket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id, '| player:', playerId);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }
  return socket;
}

export function resetSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
