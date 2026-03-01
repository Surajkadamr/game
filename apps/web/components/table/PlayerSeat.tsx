'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './Card';
import { cn, getInitials, getAvatarGradient, formatRupees } from '@/lib/utils';
import type { PublicPlayer, Card as CardType } from '@kadam/shared';

interface PlayerSeatProps {
  player: PublicPlayer;
  isMe: boolean;
  isActive: boolean;
  myHoleCards?: CardType[] | null;
  timeRemainingMs?: number;
  totalTimeMs?: number;
  position: { x: number; y: number }; // percentage positions
  compact?: boolean;
  isSpeaking?: boolean;
}

export function PlayerSeat({
  player,
  isMe,
  isActive,
  myHoleCards,
  timeRemainingMs,
  totalTimeMs = 15000,
  position,
  compact = false,
  isSpeaking = false,
}: PlayerSeatProps) {
  const TIMER_RADIUS = compact ? 28 : 38;
  const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
  const avatarSize = compact ? 60 : 80;
  const initials = getInitials(player.name);
  const avatarGradient = getAvatarGradient(player.id);
  const isEliminated = player.status === 'eliminated';
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';

  // Timer ring progress
  const timerProgress = useMemo(() => {
    if (!isActive || timeRemainingMs === undefined) return 1;
    return Math.max(0, Math.min(1, timeRemainingMs / totalTimeMs));
  }, [isActive, timeRemainingMs, totalTimeMs]);

  const timerDashOffset = TIMER_CIRCUMFERENCE * (1 - timerProgress);
  const isTimerWarning = timerProgress < 0.35;

  const holeCards = isMe ? myHoleCards : player.hasHoleCards ? [] : null;
  const showHoleCards = isMe ? myHoleCards && myHoleCards.length > 0 : player.holeCards && player.holeCards.length > 0;
  const displayCards = isMe ? myHoleCards : player.holeCards;

  return (
    <div
      className={cn(
        'absolute flex flex-col items-center gap-1.5 no-select',
        isEliminated && 'player-eliminated',
        isFolded && 'player-folded',
      )}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isActive ? 20 : 10,
      }}
    >
      {/* Hole Cards (above avatar for top seats, below for bottom) */}
      <AnimatePresence>
        {player.hasHoleCards && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex gap-[-8px] mb-1"
          >
            {displayCards && displayCards.length > 0 ? (
              displayCards.map((card, i) => (
                <div key={i} style={{ marginLeft: i > 0 ? -8 : 0 }}>
                  <Card
                    card={card}
                    size={compact ? 'sm' : 'md'}
                    fanned
                    fanIndex={i}
                    isHoverable={isMe}
                    className={cn(isMe && 'cursor-pointer')}
                  />
                </div>
              ))
            ) : (
              [0, 1].map((i) => (
                <div key={i} style={{ marginLeft: i > 0 ? -8 : 0 }}>
                  <Card
                    isBack
                    size={compact ? 'sm' : 'md'}
                    fanned
                    fanIndex={i}
                  />
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar with Timer Ring */}
      <div className="relative">
        {/* Speaking ring */}
        {isSpeaking && !isActive && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: '0 0 0 3px #16a34a, 0 0 14px rgba(22,163,74,0.55)',
              borderRadius: '50%',
              animation: 'pulse-ring 1.2s ease-in-out infinite',
            }}
          />
        )}

        {/* Active pulse ring */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow: isTimerWarning
                  ? '0 0 0 3px #ef4444, 0 0 20px rgba(239,68,68,0.5)'
                  : '0 0 0 3px #38a169, 0 0 20px rgba(56,161,105,0.5)',
                borderRadius: '50%',
                animation: 'pulse-ring 1.5s ease-in-out infinite',
              }}
            />
          )}
        </AnimatePresence>

        {/* SVG Timer Ring */}
        {isActive && (
          <svg
            className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)]"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx="50%"
              cy="50%"
              r={TIMER_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="3"
            />
            <circle
              className="timer-ring"
              cx="50%"
              cy="50%"
              r={TIMER_RADIUS}
              fill="none"
              stroke={isTimerWarning ? '#ef4444' : '#38a169'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={TIMER_CIRCUMFERENCE}
              strokeDashoffset={timerDashOffset}
              style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s ease' }}
            />
          </svg>
        )}

        {/* Avatar Circle */}
        <div
          className={cn(
            'relative rounded-full flex items-center justify-center font-bold text-white text-sm',
            `bg-gradient-to-br ${avatarGradient}`,
            isMe && 'ring-2 ring-gold/40',
          )}
          style={{
            width: avatarSize,
            height: avatarSize,
            boxShadow: isEliminated
              ? 'none'
              : '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <span className="font-display text-lg">{initials}</span>

          {/* ALL IN badge */}
          {isAllIn && (
            <div
              className="absolute -top-1 -right-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
              style={{ background: '#c9a84c', color: '#000' }}
            >
              ALL IN
            </div>
          )}

          {/* BUST badge */}
          {isEliminated && (
            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/60">
              <span className="text-xs font-bold text-red-400 tracking-widest">BUST</span>
            </div>
          )}
        </div>

        {/* Position Badge */}
        {player.badge && (
          <div
            className={cn(
              'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg',
              player.badge === 'D' && 'badge-dealer',
              player.badge === 'SB' && 'badge-sb',
              player.badge === 'BB' && 'badge-bb',
            )}
          >
            {player.badge}
          </div>
        )}
      </div>

      {/* Name Tag */}
      <div
        className="px-3 py-1 rounded-full flex flex-col items-center gap-0.5"
        style={{
          background: 'rgba(5, 8, 16, 0.75)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)',
          maxWidth: 120,
        }}
      >
        <span
          className="text-[10px] sm:text-xs font-semibold truncate"
          style={{ color: isMe ? '#c9a84c' : '#f8f4e8', maxWidth: compact ? 72 : 100 }}
          title={player.name}
        >
          {player.name}
          {isMe && <span className="text-gold/60 ml-1 text-[10px]">(you)</span>}
        </span>

        {/* Chip Count */}
        <div className="flex items-center gap-1">
          <div
            className="w-3 h-3 rounded-full poker-chip"
            style={{ background: '#c9a84c', minWidth: 12, minHeight: 12 }}
          />
          <span
            className="text-xs font-bold"
            style={{ color: player.chips > 0 ? '#e8c875' : '#6b7280' }}
          >
            {formatRupees(player.chips)}
          </span>
        </div>

        {/* Current bet */}
        <AnimatePresence>
          {player.currentBet > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="text-[10px] text-white/50"
            >
              Bet: {formatRupees(player.currentBet)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Folded indicator */}
      <AnimatePresence>
        {isFolded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[10px] uppercase tracking-widest text-white/30 font-semibold"
          >
            FOLDED
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
