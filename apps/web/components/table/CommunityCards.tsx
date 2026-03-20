'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CommunityCardSlot } from './Card';
import { formatRupees } from '@/lib/utils';
import type { Card, Pot } from '@kadam/shared';

interface CommunityCardsProps {
  cards: Card[];
  pots: Pot[];
  round: string | null;
  compact?: boolean;
}

export function CommunityCards({ cards, pots, round, compact = false }: CommunityCardsProps) {
  const totalPot = pots.reduce((sum, p) => sum + p.amount, 0);
  const mainPot = pots.find((p) => p.isMain);
  const sidePots = pots.filter((p) => !p.isMain);

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-3 pointer-events-none">
      {/* Pot Display */}
      <AnimatePresence>
        {totalPot > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            className="flex flex-col items-center gap-0.5"
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              {!compact && <ChipStack amount={totalPot} />}
              <div className="flex flex-col items-center sm:items-start">
                <span
                  className="text-[9px] sm:text-xs uppercase tracking-[0.2em] font-semibold"
                  style={{ color: 'rgba(201, 168, 76, 0.6)' }}
                >
                  {compact ? 'Total Pot' : 'POT'}
                </span>
                <motion.span
                  key={totalPot}
                  initial={{ scale: 1.1, color: '#e8c875' }}
                  animate={{ scale: 1, color: compact ? 'rgba(255,255,255,0.9)' : '#c9a84c' }}
                  className="font-display font-bold text-sm sm:text-xl text-shadow-gold"
                  style={{ color: compact ? 'rgba(255,255,255,0.9)' : '#c9a84c' }}
                >
                  {formatRupees(totalPot)}
                </motion.span>
              </div>
            </div>

            {/* Side pots */}
            {sidePots.map((pot, i) => (
              <div key={i} className="text-[10px] sm:text-xs text-white/40 font-medium">
                Side Pot {i + 1}: {formatRupees(pot.amount)}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Community Cards Row */}
      <div className="flex items-center gap-0.5 sm:gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <CommunityCardSlot
            key={i}
            card={cards[i]}
            index={i}
            revealed={!!cards[i]}
            compact={compact}
          />
        ))}
      </div>

      {/* Round Label */}
      <AnimatePresence mode="wait">
        {round && round !== 'showdown' && (
          <motion.div
            key={round}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-xs uppercase tracking-[0.25em] font-semibold"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            {round.replace('_', ' ')}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Chip Stack Visual ──────────────────────────────────────────────────────

function ChipStack({ amount }: { amount: number }) {
  const numChips = Math.min(8, Math.max(1, Math.floor(amount / 100000)));

  return (
    <div className="relative" style={{ width: 28, height: 28 + numChips * 4 }}>
      {Array.from({ length: numChips }).map((_, i) => (
        <div
          key={i}
          className="absolute left-0 rounded-full poker-chip"
          style={{
            width: 28,
            height: 28,
            bottom: i * 3,
            background: i % 3 === 0 ? '#c9a84c' : i % 3 === 1 ? '#1a5276' : '#1e8449',
            zIndex: i,
          }}
        />
      ))}
    </div>
  );
}
