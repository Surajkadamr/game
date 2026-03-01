'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { getSocket, getOrCreatePlayerId } from '@/lib/socket';
import { sounds } from '@/lib/sounds';
import toast from 'react-hot-toast';
import type { PlayerAction } from '@kadam/shared';

export function usePokerGame() {
  const store = useGameStore();
  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const createTablePendingRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    // ── Bootstrap player identity from localStorage ──────────────────────
    const persistentId = getOrCreatePlayerId();
    const storedName = localStorage.getItem('kadam_player_name') ?? '';
    if (persistentId && storedName) {
      store.setPlayerIdentity(persistentId, storedName);
    } else if (persistentId) {
      store.setPlayerIdentity(persistentId, '');
    }

    // ── Connection events ────────────────────────────────────────────────

    const onConnect = () => {
      store.setConnected(true);
      console.log('[Game] Connected');
    };

    const onDisconnect = () => {
      store.setConnected(false);
    };

    // ── Game state ───────────────────────────────────────────────────────

    const onGameState = (state: any) => {
      store.setGameState(state);
    };

    const onHoleCards = ({ cards }: { cards: any[] }) => {
      store.setMyHoleCards(cards);
      sounds.play('deal');
    };

    const onYourTurn = (info: any) => {
      store.setIsMyTurn(true, info);
      toast('Your turn!', {
        id: 'your-turn',
        icon: '🎯',
        duration: 4000,
        style: {
          background: 'rgba(20, 83, 45, 0.95)',
          border: '1px solid rgba(74, 222, 128, 0.4)',
          color: '#bbf7d0',
        },
      });
    };

    const onActionTaken = ({ action, playerName, newGameState }: any) => {
      const actionLabels: Record<string, string> = {
        fold:   'folded',
        check:  'checked',
        call:   `called ₹${(action.amount ?? 0) / 100}`,
        raise:  `raised to ₹${(action.amount ?? 0) / 100}`,
        all_in: 'went ALL IN!',
      };
      store.setLastAction(`${playerName} ${actionLabels[action.action] ?? action.action}`);

      switch (action.action) {
        case 'fold':   sounds.play('fold');  break;
        case 'check':  sounds.play('check'); break;
        case 'call':   sounds.play('chip');  break;
        case 'raise':  sounds.play('raise'); break;
        case 'all_in': sounds.play('allin'); break;
      }

      if (newGameState?.players && store.gameState) {
        store.setGameState({ ...store.gameState, ...newGameState });
      }
    };

    const onCommunityCards = () => {
      sounds.play('deal');
    };

    const onWinners = ({ winners, showCards }: any) => {
      store.setWinners(winners, showCards);
      sounds.play('win');
      store.clearTurn();
    };

    const onNewHand = () => {
      store.clearWinners();
      store.setMyHoleCards([]);
      store.clearTurn();
    };

    const onPlayerJoined = ({ playerName }: any) => {
      toast(`${playerName} joined the table`, { icon: '👋', duration: 2000 });
    };

    const onPlayerLeft = ({ playerName, reason }: any) => {
      const labels: Record<string, string> = {
        left: 'left the table',
        disconnected: 'disconnected',
        kicked: 'was removed',
        timeout: 'timed out',
      };
      toast(`${playerName} ${labels[reason] ?? 'left'}`, { icon: '🚪', duration: 2000 });
    };

    const onPlayerReconnected = ({ playerName }: any) => {
      toast(`${playerName} reconnected`, { icon: '🔌', duration: 2000 });
    };

    const onJoinResult = (result: any) => {
      if (result.success) {
        store.setTableId(result.tableId);
        const name = localStorage.getItem('kadam_player_name') ?? '';
        store.setPlayerIdentity(result.playerId, name);
        if (result.gameState) store.setGameState(result.gameState);
        // Clear pending create flag
        createTablePendingRef.current = false;
      } else {
        toast.error(result.message ?? 'Failed to join table', { duration: 4000 });
        createTablePendingRef.current = false;
      }
    };

    const onTableCreated = ({ tableId, config }: any) => {
      // Auto-join the table we just created
      const name = localStorage.getItem('kadam_player_name') ?? 'Player';
      socket.emit('table:join', {
        tableId,
        playerName: name,
        buyIn: config.bigBlind * 10, // default: 10× big blind
      });
    };

    const onError = ({ code, message }: any) => {
      toast.error(message, { duration: 4000 });
      console.error(`[Socket] ${code}: ${message}`);
    };

    const onPong = ({ timestamp }: any) => {
      store.setLatency(Date.now() - timestamp);
    };

    const onTableFull = () => {
      toast.error('Table is full', { icon: '🔒', duration: 3000 });
    };

    const onLobbyTables = (tables: any) => {
      store.setTables(tables);
    };

    // ── Register all listeners ───────────────────────────────────────────

    socket.on('connect',              onConnect);
    socket.on('disconnect',           onDisconnect);
    socket.on('game:state',           onGameState);
    socket.on('game:hole_cards',      onHoleCards);
    socket.on('game:your_turn',       onYourTurn);
    socket.on('game:action_taken',    onActionTaken);
    socket.on('game:community_cards', onCommunityCards);
    socket.on('game:winners',         onWinners);
    socket.on('game:new_hand',        onNewHand);
    socket.on('player:joined',        onPlayerJoined);
    socket.on('player:left',          onPlayerLeft);
    socket.on('player:reconnected',   onPlayerReconnected);
    socket.on('table:join_result',    onJoinResult);
    socket.on('table:created',        onTableCreated);
    socket.on('table:full',           onTableFull);
    socket.on('lobby:tables',         onLobbyTables);
    socket.on('error',                onError);
    socket.on('pong',                 onPong);

    if (socket.connected) store.setConnected(true);

    pingIntervalRef.current = setInterval(() => {
      if (socket.connected) socket.emit('ping', Date.now());
    }, 5000);

    return () => {
      socket.off('connect',              onConnect);
      socket.off('disconnect',           onDisconnect);
      socket.off('game:state',           onGameState);
      socket.off('game:hole_cards',      onHoleCards);
      socket.off('game:your_turn',       onYourTurn);
      socket.off('game:action_taken',    onActionTaken);
      socket.off('game:community_cards', onCommunityCards);
      socket.off('game:winners',         onWinners);
      socket.off('game:new_hand',        onNewHand);
      socket.off('player:joined',        onPlayerJoined);
      socket.off('player:left',          onPlayerLeft);
      socket.off('player:reconnected',   onPlayerReconnected);
      socket.off('table:join_result',    onJoinResult);
      socket.off('table:created',        onTableCreated);
      socket.off('table:full',           onTableFull);
      socket.off('lobby:tables',         onLobbyTables);
      socket.off('error',                onError);
      socket.off('pong',                 onPong);
      clearInterval(pingIntervalRef.current);
    };
  }, []); // eslint-disable-line

  // ── Public actions ───────────────────────────────────────────────────────

  const setPlayerNameLocal = useCallback((name: string) => {
    store.setPlayerName(name);
    localStorage.setItem('kadam_player_name', name);
    // Also update server-side identity on next join
  }, [store]);

  const joinTable = useCallback((tableId: string, playerName: string, buyIn: number) => {
    const socket = getSocket();
    setPlayerNameLocal(playerName);
    socket.emit('table:join', { tableId, playerName, buyIn });
  }, [setPlayerNameLocal]);

  const createTable = useCallback((options: {
    name: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    isPrivate: boolean;
  }) => {
    const socket = getSocket();
    createTablePendingRef.current = true;
    socket.emit('table:create', options);
  }, []);

  const leaveTable = useCallback(() => {
    const socket = getSocket();
    socket.emit('table:leave');
    store.reset();
  }, [store]);

  const sendAction = useCallback((action: Omit<PlayerAction, 'playerId'>) => {
    const socket = getSocket();
    if (!store.playerId) return;
    socket.emit('game:action', { ...action, playerId: store.playerId });
    store.clearTurn();
  }, [store]);

  const fetchLobby = useCallback(() => {
    const socket = getSocket();
    socket.emit('lobby:list');
  }, []);

  return {
    ...store,
    joinTable,
    createTable,
    leaveTable,
    sendAction,
    fetchLobby,
    setPlayerNameLocal,
  };
}
