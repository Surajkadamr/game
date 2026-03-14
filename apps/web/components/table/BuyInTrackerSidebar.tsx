'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BuyInModal } from './BuyInModal';
import { formatRupees } from '@/lib/utils';
import type { BuyInTrackerState, TableConfig } from '@kadam/shared';

interface BuyInTrackerSidebarProps {
  tracker: BuyInTrackerState;
  config: TableConfig;
  pendingBuyIn: number | null;
  isMobile: boolean;
  onRequestBuyIn: (amount: number) => void;
}

export function BuyInTrackerSidebar({
  tracker,
  config,
  pendingBuyIn,
  isMobile,
  onRequestBuyIn,
}: BuyInTrackerSidebarProps) {
  const [isOpen, setIsOpen] = useState(!isMobile);
  const [showBuyInModal, setShowBuyInModal] = useState(false);

  const sorted = [...tracker.entries].sort((a, b) => {
    // Seated first, then by P&L descending
    if (a.isSeated !== b.isSeated) return a.isSeated ? -1 : 1;
    return b.profitLoss - a.profitLoss;
  });

  const handleBuyIn = (amount: number) => {
    onRequestBuyIn(amount);
    setShowBuyInModal(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="font-display font-bold text-gold text-sm">Buy-In Tracker</h3>
        {isMobile && (
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/40 hover:text-white/70 text-lg transition-colors"
          >
            &times;
          </button>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-1 px-4 py-2 text-[10px] uppercase tracking-wider text-white/30 font-semibold"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span>Player</span>
        <span className="text-right w-16">Buy-ins</span>
        <span className="text-right w-16">P&L</span>
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sorted.map((entry) => (
          <div
            key={entry.nameKey}
            className="grid grid-cols-[1fr_auto_auto] gap-1 items-center px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
          >
            {/* Name + status */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: entry.isSeated ? '#38a169' : '#6b7280' }}
              />
              <span className={`text-sm truncate ${entry.isSeated ? 'text-white/80' : 'text-white/40'}`}>
                {entry.playerName}
              </span>
              {!entry.isSeated && (
                <span className="text-[10px] text-white/25 flex-shrink-0">(left)</span>
              )}
              {entry.pendingBuyIn > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/20 text-gold flex-shrink-0">
                  +{formatRupees(entry.pendingBuyIn)}
                </span>
              )}
            </div>

            {/* Total buy-ins */}
            <span className="text-xs text-white/50 text-right w-16 tabular-nums">
              {formatRupees(entry.totalBuyIns)}
            </span>

            {/* P&L */}
            <span
              className="text-xs font-semibold text-right w-16 tabular-nums"
              style={{
                color: entry.profitLoss > 0
                  ? '#4ade80'
                  : entry.profitLoss < 0
                  ? '#f87171'
                  : 'rgba(255,255,255,0.4)',
              }}
            >
              {entry.profitLoss > 0 ? '+' : ''}{formatRupees(entry.profitLoss)}
            </span>
          </div>
        ))}

        {sorted.length === 0 && (
          <div className="text-center py-8 text-white/20 text-xs">
            No players yet
          </div>
        )}
      </div>

      {/* Bottom: Buy more chips button */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {pendingBuyIn ? (
          <div className="text-center text-xs text-gold/70">
            {formatRupees(pendingBuyIn)} pending next hand
          </div>
        ) : (
          <button
            onClick={() => setShowBuyInModal(true)}
            className="w-full py-2 rounded-lg text-xs font-semibold btn-raise"
          >
            + Buy More Chips
          </button>
        )}
      </div>
    </div>
  );

  // Desktop: fixed sidebar
  if (!isMobile) {
    return (
      <>
        <div
          className="fixed top-[44px] right-0 bottom-0 glass-dark flex flex-col"
          style={{ width: 280, zIndex: 30, borderLeft: '1px solid rgba(255,255,255,0.06)' }}
        >
          {sidebarContent}
        </div>

        <AnimatePresence>
          {showBuyInModal && (
            <BuyInModal
              minBuyIn={config.minBuyIn}
              maxBuyIn={config.maxBuyIn}
              bigBlind={config.bigBlind}
              onConfirm={handleBuyIn}
              onClose={() => setShowBuyInModal(false)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  // Mobile: slide-out drawer + tab
  return (
    <>
      {/* Tab button on right edge */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-1/2 -translate-y-1/2 right-0 glass-dark rounded-l-lg px-1.5 py-3 text-gold/60 hover:text-gold transition-colors"
          style={{ zIndex: 35, borderRight: 'none' }}
        >
          <span className="text-[10px] font-bold" style={{ writingMode: 'vertical-rl' }}>
            P&L
          </span>
        </button>
      )}

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0"
              style={{ zIndex: 38, background: 'rgba(0,0,0,0.4)' }}
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-[44px] right-0 bottom-0 glass-dark flex flex-col"
              style={{ width: 260, zIndex: 39, borderLeft: '1px solid rgba(255,255,255,0.06)' }}
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBuyInModal && (
          <BuyInModal
            minBuyIn={config.minBuyIn}
            maxBuyIn={config.maxBuyIn}
            bigBlind={config.bigBlind}
            onConfirm={handleBuyIn}
            onClose={() => setShowBuyInModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
