'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn, SUIT_SYMBOLS, SUIT_COLORS } from '@/lib/utils';
import type { Card as CardType } from '@kadam/shared';

interface CardProps {
  card?: CardType;
  isBack?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
  fanned?: boolean;
  fanIndex?: number;
  revealed?: boolean;
  delay?: number;
  isHoverable?: boolean;
}

const SIZE_MAP = {
  xs: { width: 38, height: 54, rankSize: 9, suitSize: 20 },
  sm: { width: 52, height: 74, rankSize: 12, suitSize: 28 },
  md: { width: 66, height: 94, rankSize: 15, suitSize: 36 },
  lg: { width: 84, height: 118, rankSize: 19, suitSize: 48 },
};

export function Card({
  card,
  isBack = false,
  size = 'md',
  className,
  fanned = false,
  fanIndex = 0,
  revealed = false,
  delay = 0,
  isHoverable = false,
}: CardProps) {
  const { width, height, rankSize, suitSize } = SIZE_MAP[size];
  const showBack = isBack || !card;
  const color = card ? SUIT_COLORS[card.suit] : '#111';
  const symbol = card ? SUIT_SYMBOLS[card.suit] : '';
  const rotation = fanned ? (fanIndex - 0.5) * 10 : 0;

  if (showBack) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
        style={{ width, height, transform: `rotate(${rotation}deg)` }}
        className={cn(
          'card-back playing-card rounded-lg flex-shrink-0 no-select',
          className,
        )}
      />
    );
  }

  return (
    <motion.div
      initial={revealed ? { rotateY: 90 } : { opacity: 0, y: -20 }}
      animate={revealed ? { rotateY: 0 } : { opacity: 1, y: 0 }}
      transition={
        revealed
          ? { delay, duration: 0.35, ease: 'easeOut' }
          : { delay, type: 'spring', stiffness: 300, damping: 25 }
      }
      style={{ width, height, transform: `rotate(${rotation}deg)` }}
      className={cn(
        'playing-card rounded-lg flex-shrink-0 no-select relative',
        isHoverable && 'cursor-pointer',
        className,
      )}
    >
      {/* Top-left rank + suit */}
      <div
        className="absolute top-1 left-1.5 flex flex-col items-center leading-none"
        style={{ color, fontSize: rankSize }}
      >
        <span className="font-bold font-display">{card!.rank}</span>
        <span style={{ fontSize: rankSize - 2 }}>{symbol}</span>
      </div>

      {/* Center suit */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ color, fontSize: suitSize, lineHeight: 1 }}
      >
        {symbol}
      </div>

      {/* Bottom-right rank + suit (inverted) */}
      <div
        className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180"
        style={{ color, fontSize: rankSize }}
      >
        <span className="font-bold font-display">{card!.rank}</span>
        <span style={{ fontSize: rankSize - 2 }}>{symbol}</span>
      </div>
    </motion.div>
  );
}

// ─── Community Card Slot ────────────────────────────────────────────────────

interface CommunityCardSlotProps {
  card?: CardType;
  index: number;
  revealed?: boolean;
  compact?: boolean;
}

export function CommunityCardSlot({ card, index, revealed = false, compact = false }: CommunityCardSlotProps) {
  const size = compact ? 'xs' : 'lg';
  const { width, height } = SIZE_MAP[size];

  if (!card) {
    return (
      <div
        className="rounded-lg border border-dashed flex-shrink-0"
        style={{
          width,
          height,
          borderColor: 'rgba(201, 168, 76, 0.2)',
          background: 'rgba(201, 168, 76, 0.03)',
          boxShadow: 'inset 0 0 10px rgba(201, 168, 76, 0.05)',
        }}
      />
    );
  }

  return (
    <Card
      card={card}
      size={size}
      revealed={revealed}
      delay={index * 0.15}
    />
  );
}
