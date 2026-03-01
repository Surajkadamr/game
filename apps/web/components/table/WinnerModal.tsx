'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Card } from './Card';
import { formatRupees } from '@/lib/utils';
import type { WinnerInfo, Card as CardType } from '@kadam/shared';

interface WinnerModalProps {
  isVisible: boolean;
  winners: WinnerInfo[];
  showCards: { playerId: string; cards: CardType[] }[];
  onDismiss: () => void;
}

export function WinnerModal({ isVisible, winners, showCards, onDismiss }: WinnerModalProps) {
  const confettiFiredRef = useRef(false);

  useEffect(() => {
    if (isVisible && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      fireConfetti();

      const timer = setTimeout(() => {
        onDismiss();
        confettiFiredRef.current = false;
      }, 4500);

      return () => clearTimeout(timer);
    }
    if (!isVisible) {
      confettiFiredRef.current = false;
    }
  }, [isVisible, onDismiss]);

  const mainWinner = winners[0];
  const winnerShowCards = mainWinner
    ? showCards.find((s) => s.playerId === mainWinner.playerId)
    : null;

  return (
    <AnimatePresence>
      {isVisible && mainWinner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-50 winner-overlay flex items-center justify-center cursor-pointer"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-6 text-center"
          >
            {/* Trophy */}
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="text-6xl sm:text-8xl"
              style={{ filter: 'drop-shadow(0 0 20px rgba(201,168,76,0.5))' }}
            >
              🏆
            </motion.div>

            {/* Winner Text */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-sm uppercase tracking-[0.4em] text-gold/70 font-semibold mb-2"
              >
                WINNER
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="font-display text-3xl sm:text-5xl font-bold text-shadow-gold"
                style={{ color: '#c9a84c' }}
              >
                {mainWinner.playerName}
              </motion.h2>
            </div>

            {/* Amount */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
              className="font-display text-2xl sm:text-4xl font-bold text-white"
              style={{ textShadow: '0 0 30px rgba(255,255,255,0.3)' }}
            >
              {formatRupees(mainWinner.amount)}
            </motion.div>

            {/* Hand Name */}
            {mainWinner.handResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="px-4 py-2 rounded-full glass-gold"
              >
                <span className="text-gold font-semibold text-sm">
                  {mainWinner.handResult.description}
                </span>
              </motion.div>
            )}

            {/* Winner's Cards */}
            {winnerShowCards && winnerShowCards.cards.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex gap-3"
              >
                {winnerShowCards.cards.map((card, i) => (
                  <motion.div
                    key={i}
                    initial={{ rotateY: 180, scale: 0.8 }}
                    animate={{ rotateY: 0, scale: 1 }}
                    transition={{ delay: 0.7 + i * 0.15, duration: 0.4 }}
                  >
                    <Card card={card} size="md" revealed />
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Multiple winners */}
            {winners.length > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="flex flex-col gap-1"
              >
                {winners.slice(1).map((w, i) => (
                  <div key={i} className="text-sm text-white/50">
                    {w.playerName} also wins {formatRupees(w.amount)}
                  </div>
                ))}
              </motion.div>
            )}

            {/* Dismiss hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ delay: 2 }}
              className="text-xs text-white/40"
            >
              Click anywhere to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function fireConfetti() {
  const colors = ['#c9a84c', '#e8c875', '#38a169', '#ffffff', '#ffd700'];

  // Center burst
  confetti({
    particleCount: 150,
    spread: 80,
    origin: { x: 0.5, y: 0.4 },
    colors,
    gravity: 1.2,
    scalar: 1.1,
    zIndex: 9999,
  });

  // Left burst
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors,
      zIndex: 9999,
    });
  }, 300);

  // Right burst
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors,
      zIndex: 9999,
    });
  }, 300);

  // Slow gold drift
  setTimeout(() => {
    confetti({
      particleCount: 30,
      spread: 120,
      origin: { x: 0.5, y: 0 },
      colors: ['#c9a84c', '#e8c875'],
      gravity: 0.4,
      scalar: 1.5,
      zIndex: 9999,
    });
  }, 600);
}
