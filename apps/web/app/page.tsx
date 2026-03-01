'use client';

import { useEffect, useState, useRef } from 'react';
import { LobbyPage } from '@/components/lobby/LobbyPage';
import { PokerTable } from '@/components/table/PokerTable';
import { PlayerSetup } from '@/components/lobby/PlayerSetup';
import { usePokerGame } from '@/hooks/usePokerGame';
import { useGameStore } from '@/stores/gameStore';
import { getOrCreatePlayerId, getSocket } from '@/lib/socket';

type AppScreen = 'setup' | 'lobby' | 'table';

function shortCode(uuid: string): string {
  // Show last 8 chars of UUID as the player code
  return uuid.replace(/-/g, '').slice(-8).toUpperCase();
}

export default function Home() {
  const game = usePokerGame();
  const { tableId, gameState, playerId, playerName } = useGameStore();
  const [screen, setScreen] = useState<AppScreen>('setup');
  const [persistentId, setPersistentId] = useState('');
  const [savedName, setSavedName] = useState('');
  const autoReconnectAttempted = useRef(false);

  // ── Bootstrap: load persistent identity from localStorage ────────────────
  useEffect(() => {
    const id = getOrCreatePlayerId();
    const name = localStorage.getItem('kadam_player_name') ?? '';
    setPersistentId(id);
    setSavedName(name);

    // If we have a name already, skip to lobby
    if (name.trim().length >= 2) {
      setScreen('lobby');
    }
  }, []);

  // ── Auto-reconnect: if the user had a table session, try to rejoin ────────
  useEffect(() => {
    if (screen !== 'lobby' || autoReconnectAttempted.current) return;
    const storedTable = localStorage.getItem('kadam_table_id');
    if (!storedTable) return;

    autoReconnectAttempted.current = true;
    const name = localStorage.getItem('kadam_player_name') ?? '';
    if (!name) return;

    // Give socket a moment to connect, then try sync
    const timer = setTimeout(() => {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit('game:sync', storedTable);
      } else {
        // Wait for connect event then sync
        socket.once('connect', () => {
          socket.emit('game:sync', storedTable);
        });
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [screen]);

  // ── Navigate to table when we have a joined gameState ────────────────────
  useEffect(() => {
    if (tableId && gameState) {
      setScreen('table');
    } else if (screen === 'table' && (!tableId || !gameState)) {
      setScreen('lobby');
    }
  }, [tableId, gameState, screen]);

  // ── Player setup confirmation ─────────────────────────────────────────────
  const handleSetupConfirm = (name: string) => {
    game.setPlayerNameLocal(name);
    setSavedName(name);
    setScreen('lobby');
  };

  // ── Leave table ───────────────────────────────────────────────────────────
  const handleLeave = () => {
    game.leaveTable();
    setScreen('lobby');
    autoReconnectAttempted.current = false;
  };

  // ── Create table + auto-join after creation ───────────────────────────────
  const handleCreateTable = (opts: {
    name: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    isPrivate: boolean;
  }) => {
    game.createTable(opts);
    // Auto-join after creation: handled in usePokerGame via table:created event
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (screen === 'setup' || !savedName) {
    return (
      <PlayerSetup
        existingName={savedName || undefined}
        playerCode={shortCode(persistentId || 'XXXXXXXXXXXXXXXX')}
        onConfirm={handleSetupConfirm}
      />
    );
  }

  if (screen === 'table' && tableId && gameState) {
    return (
      <PokerTable
        onAction={(action, amount) => game.sendAction({ action, amount })}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <LobbyPage
      tables={game.tables}
      playerName={savedName}
      onJoinTable={game.joinTable}
      onCreateTable={handleCreateTable}
      onRefresh={game.fetchLobby}
      onChangeName={() => setScreen('setup')}
      isConnected={game.isConnected}
    />
  );
}
