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
  position: { x: number; y: number }; // percentage positions relative to table oval
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
  const avatarSize = compact ? 48 : 56;
  const TIMER_RADIUS = (avatarSize / 2) + 3;
  const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
  const initials = getInitials(player.name);
  const avatarGradient = getAvatarGradient(player.id);
  const isEliminated = player.status === 'eliminated';
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';

  const timerProgress = useMemo(() => {
    if (!isActive || timeRemainingMs === undefined) return 1;
    return Math.max(0, Math.min(1, timeRemainingMs / totalTimeMs));
  }, [isActive, timeRemainingMs, totalTimeMs]);

  const timerDashOffset = TIMER_CIRCUMFERENCE * (1 - timerProgress);
  const isTimerWarning = timerProgress < 0.35;

  const displayCards = isMe ? myHoleCards : player.holeCards;

  // Position the seat: top half → cards below avatar, bottom half → cards above
  const isTopHalf = position.y < 40;

  return (
    <div
      className={cn(
        'absolute flex flex-col items-center no-select',
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
      {/* Hole cards — above avatar if bottom half, below if top half */}
      {!isTopHalf && (
        <SeatCards
          player={player}
          displayCards={displayCards}
          isMe={isMe}
          compact={compact}
        />
      )}

      {/* Avatar with timer ring */}
      <div className="relative">
        {/* Speaking glow */}
        {isSpeaking && !isActive && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: '0 0 0 2px #16a34a, 0 0 10px rgba(22,163,74,0.55)',
              borderRadius: '50%',
              animation: 'pulse-ring 1.2s ease-in-out infinite',
            }}
          />
        )}

        {/* Active pulse */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow: isTimerWarning
                  ? '0 0 0 2px #ef4444, 0 0 14px rgba(239,68,68,0.5)'
                  : '0 0 0 2px #38a169, 0 0 14px rgba(56,161,105,0.5)',
                borderRadius: '50%',
                animation: 'pulse-ring 1.5s ease-in-out infinite',
              }}
            />
          )}
        </AnimatePresence>

        {/* SVG Timer Ring */}
        {isActive && (
          <svg
            className="absolute"
            style={{
              top: -4, left: -4,
              width: avatarSize + 8,
              height: avatarSize + 8,
              transform: 'rotate(-90deg)',
            }}
          >
            <circle
              cx={(avatarSize + 8) / 2}
              cy={(avatarSize + 8) / 2}
              r={TIMER_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="2.5"
            />
            <circle
              className="timer-ring"
              cx={(avatarSize + 8) / 2}
              cy={(avatarSize + 8) / 2}
              r={TIMER_RADIUS}
              fill="none"
              stroke={isTimerWarning ? '#ef4444' : '#38a169'}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={TIMER_CIRCUMFERENCE}
              strokeDashoffset={timerDashOffset}
            />
          </svg>
        )}

        {/* Avatar circle */}
        <div
          className={cn(
            'relative rounded-full flex items-center justify-center font-bold text-white',
            `bg-gradient-to-br ${avatarGradient}`,
          )}
          style={{
            width: avatarSize,
            height: avatarSize,
            fontSize: compact ? 13 : 16,
            border: isMe
              ? '3px solid #d4af37'
              : '2px solid rgba(212,175,55,0.3)',
            boxShadow: isEliminated
              ? 'none'
              : isMe
              ? '0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.2)'
              : '0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <span className="font-display">{initials}</span>

          {/* ALL IN badge */}
          {isAllIn && (
            <div
              className="absolute -top-1 -right-1 px-1 py-0.5 rounded text-[7px] font-bold uppercase"
              style={{ background: '#c9a84c', color: '#000' }}
            >
              ALL IN
            </div>
          )}

          {/* BUST overlay */}
          {isEliminated && (
            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/60">
              <span className="text-[9px] font-bold text-red-400 tracking-widest">BUST</span>
            </div>
          )}
        </div>

        {/* Position Badge (D / SB / BB) */}
        {player.badge && (
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shadow-lg',
              player.badge === 'D' && 'badge-dealer',
              player.badge === 'SB' && 'badge-sb',
              player.badge === 'BB' && 'badge-bb',
            )}
          >
            {player.badge}
          </div>
        )}
      </div>

      {/* Name + chips pill */}
      <div
        className="px-2 py-0.5 rounded-full flex flex-col items-center mt-0.5"
        style={{
          background: isMe ? 'rgba(212,175,55,0.9)' : 'rgba(5, 8, 16, 0.85)',
          border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
          maxWidth: compact ? 80 : 110,
        }}
      >
        <span
          className="text-[9px] sm:text-[11px] font-semibold truncate leading-tight"
          style={{
            color: isMe ? '#121212' : '#f8f4e8',
            maxWidth: compact ? 64 : 90,
            fontWeight: isMe ? 700 : 600,
          }}
          title={player.name}
        >
          {player.name}
        </span>
        <span
          className="text-[9px] sm:text-[10px] font-bold leading-tight"
          style={{ color: isMe ? '#121212' : player.chips > 0 ? '#e8c875' : '#6b7280' }}
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
            className="text-[9px] font-semibold mt-0.5"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {formatRupees(player.currentBet)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hole cards — below avatar if top half */}
      {isTopHalf && (
        <SeatCards
          player={player}
          displayCards={displayCards}
          isMe={isMe}
          compact={compact}
        />
      )}

      {/* Folded indicator */}
      <AnimatePresence>
        {isFolded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[8px] uppercase tracking-widest text-white/30 font-semibold"
          >
            FOLD
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Hole cards sub-component ─────────────────────────────────────────────────

function SeatCards({
  player,
  displayCards,
  isMe,
  compact,
}: {
  player: PublicPlayer;
  displayCards?: CardType[] | null;
  isMe: boolean;
  compact: boolean;
}) {
  if (!player.hasHoleCards) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="flex mb-0.5"
      >
        {displayCards && displayCards.length > 0 ? (
          displayCards.map((card, i) => (
            <div key={i} style={{ marginLeft: i > 0 ? -6 : 0 }}>
              <Card
                card={card}
                size={compact ? 'sm' : 'sm'}
                fanned
                fanIndex={i}
                isHoverable={isMe}
                className={cn(isMe && 'cursor-pointer')}
              />
            </div>
          ))
        ) : (
          [0, 1].map((i) => (
            <div key={i} style={{ marginLeft: i > 0 ? -6 : 0 }}>
              <Card
                isBack
                size={compact ? 'sm' : 'sm'}
                fanned
                fanIndex={i}
              />
            </div>
          ))
        )}
      </motion.div>
    </AnimatePresence>
  );
}
