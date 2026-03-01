'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ParticleBackground } from '@/components/table/ParticleBackground';

interface PlayerSetupProps {
  existingName?: string;
  playerCode: string; // short version of player ID shown to user
  onConfirm: (name: string) => void;
}

export function PlayerSetup({ existingName, playerCode, onConfirm }: PlayerSetupProps) {
  const [name, setName] = useState(existingName ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter a name'); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters'); return; }
    if (trimmed.length > 20) { setError('Name must be 20 characters or less'); return; }
    onConfirm(trimmed);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <ParticleBackground />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-7xl mb-3"
            style={{ filter: 'drop-shadow(0 0 20px rgba(201,168,76,0.4))' }}
          >
            ♠
          </motion.div>
          <h1
            className="font-display text-4xl font-bold"
            style={{ color: '#c9a84c', textShadow: '0 0 30px rgba(201,168,76,0.3)' }}
          >
            KADAM POKER
          </h1>
          <p className="text-white/30 text-sm mt-1 uppercase tracking-widest">
            No-Limit Texas Hold'em
          </p>
        </div>

        {/* Card */}
        <div
          className="glass rounded-2xl p-6"
          style={{ border: '1px solid rgba(201,168,76,0.2)' }}
        >
          <h2 className="font-display text-xl font-bold text-white mb-1">
            {existingName ? 'Welcome back' : 'Set up your profile'}
          </h2>
          <p className="text-sm text-white/40 mb-5">
            {existingName
              ? 'Confirm your name to continue'
              : 'Your name is shown to other players at the table'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 font-semibold mb-2">
                Player Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="Enter your name"
                maxLength={20}
                className="casino-input"
                autoFocus
                autoComplete="nickname"
              />
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-xs mt-1.5"
                >
                  {error}
                </motion.p>
              )}
            </div>

            {/* Player Code */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 font-semibold mb-2">
                Your Player Code
              </label>
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{
                  background: 'rgba(201,168,76,0.05)',
                  border: '1px solid rgba(201,168,76,0.2)',
                }}
              >
                <span className="font-mono text-base font-bold text-gold tracking-widest">
                  {playerCode}
                </span>
                <span className="text-white/20 text-xs ml-auto">
                  saves your seat on refresh
                </span>
              </div>
              <p className="text-white/20 text-xs mt-1.5">
                This code is stored in your browser and identifies you if you refresh the page.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider btn-raise mt-2"
            >
              Enter the Room →
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-white/15 text-xs mt-6">
          ♠ ♥ ♦ ♣  · Premium multiplayer poker
        </p>
      </motion.div>
    </div>
  );
}
