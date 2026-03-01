'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticleBackground } from '@/components/table/ParticleBackground';
import { formatRupees } from '@/lib/utils';
import type { TableSummary } from '@kadam/shared';

interface LobbyPageProps {
  tables: TableSummary[];
  playerName: string;
  onJoinTable: (tableId: string, playerName: string, buyIn: number) => void;
  onCreateTable: (options: {
    name: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    isPrivate: boolean;
  }) => void;
  onRefresh: () => void;
  onChangeName: () => void;
  isConnected: boolean;
}

export function LobbyPage({ tables, playerName: propPlayerName, onJoinTable, onCreateTable, onRefresh, onChangeName, isConnected }: LobbyPageProps) {
  const [showJoinModal, setShowJoinModal] = useState<TableSummary | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [playerName, setPlayerName] = useState(propPlayerName);
  const [buyIn, setBuyIn] = useState(10000); // ₹100 default
  const [savedName, setSavedName] = useState(propPlayerName);

  useEffect(() => {
    if (isConnected) onRefresh();
  }, [isConnected]); // eslint-disable-line

  const handleJoin = () => {
    if (!showJoinModal || !playerName.trim()) return;
    localStorage.setItem('kadam_player_name', playerName.trim());
    onJoinTable(showJoinModal.id, playerName.trim(), buyIn);
    setShowJoinModal(null);
  };

  const phaseLabel: Record<string, string> = {
    waiting: 'Open',
    starting: 'Starting',
    dealing: 'In Progress',
    betting: 'In Progress',
    showdown: 'In Progress',
    winner: 'In Progress',
    between_hands: 'Between Hands',
  };

  const phaseColor: Record<string, string> = {
    waiting: '#38a169',
    between_hands: '#d97706',
    starting: '#d97706',
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      <ParticleBackground />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between px-8 py-5 glass-dark"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-5xl">♠</span>
          <div>
            <h1 className="font-display text-3xl font-bold text-gold">KADAM POKER</h1>
            <p className="text-xs text-white/30 uppercase tracking-widest">Premium No-Limit Texas Hold'em</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: isConnected ? '#38a169' : '#ef4444' }}
            />
            <span className="text-xs text-white/40">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          <button
            onClick={onChangeName}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 glass hover:glass-gold transition-all"
          >
            ✎ {savedName}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider btn-raise"
          >
            + Create Table
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 px-8 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Active Tables</h2>
              <p className="text-sm text-white/30 mt-0.5">{tables.length} tables available</p>
            </div>
            <button
              onClick={onRefresh}
              className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 glass hover:glass-gold transition-all"
            >
              ↺ Refresh
            </button>
          </div>

          {/* Table Grid */}
          <AnimatePresence>
            {tables.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <div className="text-6xl mb-4 opacity-20">♣</div>
                <p className="text-white/30 font-semibold">No tables yet</p>
                <p className="text-white/20 text-sm mt-1">Create one to start playing</p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tables.map((table, i) => (
                  <motion.div
                    key={table.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass rounded-2xl p-5 hover:glass-gold transition-all cursor-pointer group"
                    onClick={() => setShowJoinModal(table)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-white group-hover:text-gold transition-colors">
                          {table.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: phaseColor[table.phase] ?? '#6b7280' }}
                          />
                          <span className="text-xs text-white/40">
                            {phaseLabel[table.phase] ?? table.phase}
                          </span>
                        </div>
                      </div>
                      {table.isPrivate && (
                        <span className="text-xs px-2 py-1 rounded-full glass-dark text-white/40">
                          🔒 Private
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/40">Players</span>
                        <span className="text-white font-semibold">
                          {table.playerCount}/{table.maxPlayers}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/40">Blinds</span>
                        <span className="text-gold font-semibold">
                          {formatRupees(table.smallBlind)}/{formatRupees(table.bigBlind)}
                        </span>
                      </div>
                    </div>

                    {/* Player count bar */}
                    <div className="mt-4 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(table.playerCount / table.maxPlayers) * 100}%`,
                          background: table.playerCount >= table.maxPlayers ? '#ef4444' : '#c9a84c',
                        }}
                      />
                    </div>

                    <button
                      className={`mt-4 w-full py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                        table.playerCount >= table.maxPlayers
                          ? 'bg-white/5 text-white/20 cursor-not-allowed'
                          : 'btn-raise group-hover:opacity-100'
                      }`}
                      disabled={table.playerCount >= table.maxPlayers}
                    >
                      {table.playerCount >= table.maxPlayers ? 'Table Full' : 'Join Table →'}
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Join Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <Modal onClose={() => setShowJoinModal(null)}>
            <h2 className="font-display text-2xl font-bold text-white mb-1">
              Join {showJoinModal.name}
            </h2>
            <p className="text-sm text-white/40 mb-6">
              Blinds: {formatRupees(showJoinModal.smallBlind)}/{formatRupees(showJoinModal.bigBlind)}
            </p>

            <div className="space-y-4">
              <FormField label="Your Name">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={20}
                  className="casino-input"
                  autoFocus
                />
              </FormField>

              <FormField label={`Buy-in Amount (₹${buyIn / 100})`}>
                <input
                  type="range"
                  min={showJoinModal.bigBlind * 10}
                  max={showJoinModal.bigBlind * 100}
                  step={showJoinModal.bigBlind}
                  value={buyIn}
                  onChange={(e) => setBuyIn(Number(e.target.value))}
                  className="raise-slider w-full"
                  style={{
                    background: `linear-gradient(to right, #c9a84c ${
                      ((buyIn - showJoinModal.bigBlind * 10) / (showJoinModal.bigBlind * 90)) * 100
                    }%, rgba(255,255,255,0.1) ${
                      ((buyIn - showJoinModal.bigBlind * 10) / (showJoinModal.bigBlind * 90)) * 100
                    }%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-white/30 mt-1">
                  <span>Min: {formatRupees(showJoinModal.bigBlind * 10)}</span>
                  <span className="text-gold font-bold text-base">
                    {formatRupees(buyIn)}
                  </span>
                  <span>Max: {formatRupees(showJoinModal.bigBlind * 100)}</span>
                </div>
              </FormField>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowJoinModal(null)}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white/40 glass hover:glass-dark transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleJoin}
                disabled={!playerName.trim()}
                className="flex-2 flex-grow py-3 rounded-xl font-bold text-sm btn-raise disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
              >
                Join for {formatRupees(buyIn)} →
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Create Table Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateTableModal
            playerName={savedName}
            onClose={() => setShowCreateModal(false)}
            onCreate={(opts, name, buyInAmount) => {
              if (name) {
                localStorage.setItem('kadam_player_name', name);
                setPlayerName(name);
              }
              onCreateTable(opts);
              setShowCreateModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-md mx-4"
        style={{ border: '1px solid rgba(201,168,76,0.2)' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-white/40 font-semibold mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function CreateTableModal({
  playerName: savedName,
  onClose,
  onCreate,
}: {
  playerName: string;
  onClose: () => void;
  onCreate: (opts: any, name: string, buyIn: number) => void;
}) {
  const [name, setName] = useState('');
  const [playerName, setPlayerName] = useState(savedName);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [blindsPreset, setBlindsPreset] = useState<'5/10' | '10/20' | '25/50' | '50/100'>('5/10');

  const blindsMap = {
    '5/10': { small: 500, big: 1000 },
    '10/20': { small: 1000, big: 2000 },
    '25/50': { small: 2500, big: 5000 },
    '50/100': { small: 5000, big: 10000 },
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    const blinds = blindsMap[blindsPreset];
    onCreate(
      {
        name: name.trim(),
        maxPlayers,
        smallBlind: blinds.small,
        bigBlind: blinds.big,
        isPrivate: false,
      },
      playerName.trim(),
      blinds.big * 10,
    );
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-2xl font-bold text-white mb-6">Create New Table</h2>

      <div className="space-y-4">
        <FormField label="Table Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="High Roller Room"
            maxLength={30}
            className="casino-input"
            autoFocus
          />
        </FormField>

        <FormField label="Your Name">
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="casino-input"
          />
        </FormField>

        <FormField label="Blinds">
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(blindsMap) as (keyof typeof blindsMap)[]).map((preset) => (
              <button
                key={preset}
                onClick={() => setBlindsPreset(preset)}
                className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                  blindsPreset === preset
                    ? 'bg-gold/20 border border-gold/40 text-gold'
                    : 'glass text-white/50 hover:text-white/80'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label={`Max Players (${maxPlayers})`}>
          <input
            type="range"
            min={2}
            max={6}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="raise-slider w-full"
            style={{
              background: `linear-gradient(to right, #c9a84c ${((maxPlayers - 2) / 4) * 100}%, rgba(255,255,255,0.1) ${((maxPlayers - 2) / 4) * 100}%)`,
            }}
          />
          <div className="flex justify-between text-xs text-white/30 mt-1">
            <span>2</span>
            <span>6</span>
          </div>
        </FormField>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-xl font-bold text-sm text-white/40 glass hover:glass-dark transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || !playerName.trim()}
          className="flex-grow py-3 rounded-xl font-bold text-sm btn-raise disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
        >
          Create Table →
        </button>
      </div>
    </Modal>
  );
}
