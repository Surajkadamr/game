'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatRupees, snapToStep } from '@/lib/utils';
import type { ActionType } from '@kadam/shared';

interface ActionPanelProps {
  isVisible: boolean;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
  canCheck: boolean;
  potSize: number;
  timeoutAt: number;
  onAction: (action: ActionType, amount?: number) => void;
}

const TOTAL_TIMER_MS = 30_000; // must match server turnTimeoutMs

export function ActionPanel({
  isVisible,
  callAmount,
  minRaise,
  maxRaise,
  canCheck,
  potSize,
  timeoutAt,
  onAction,
}: ActionPanelProps) {
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(minRaise);
  const [timeRemainingFrac, setTimeRemainingFrac] = useState(1); // 0..1
  const actionSentRef = useRef(false); // prevent double-action on timeout

  // ── Reset state when panel appears for a new turn ────────────────────────
  useEffect(() => {
    if (isVisible) {
      setShowRaise(false);
      setRaiseAmount(Math.max(minRaise, 0));
      setTimeRemainingFrac(1);
      actionSentRef.current = false;
    }
  }, [isVisible, minRaise]);

  // ── When panel hides (turn taken elsewhere / timer expired) ──────────────
  useEffect(() => {
    if (!isVisible) {
      setShowRaise(false);
    }
  }, [isVisible]);

  // ── Client-side countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;

    const tick = () => {
      const remaining = timeoutAt - Date.now();
      const frac = Math.max(0, Math.min(1, remaining / TOTAL_TIMER_MS));
      setTimeRemainingFrac(frac);

      if (remaining <= 0 && !actionSentRef.current) {
        actionSentRef.current = true;
        onAction(canCheck ? 'check' : 'fold');
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [isVisible, timeoutAt, canCheck, onAction]);

  const handleAction = useCallback((action: ActionType, amount?: number) => {
    if (actionSentRef.current) return;
    actionSentRef.current = true;
    onAction(action, amount);
  }, [onAction]);

  const handleFold  = () => handleAction('fold');
  const handleCheck = () => handleAction('check');
  const handleCall  = () => handleAction('call', callAmount);
  const handleRaise = () => {
    if (raiseAmount >= maxRaise) {
      handleAction('all_in', maxRaise);
    } else {
      handleAction('raise', raiseAmount);
    }
  };

  const isAllIn = raiseAmount >= maxRaise;

  const timerColor =
    timeRemainingFrac > 0.5  ? '#38a169' :
    timeRemainingFrac > 0.25 ? '#d97706' :
                                '#ef4444';

  const presetBets = [
    { label: 'Min',    amount: minRaise },
    { label: '½ Pot',  amount: Math.max(minRaise, Math.floor(potSize / 2 / 500) * 500) },
    { label: 'Pot',    amount: Math.max(minRaise, potSize) },
    { label: '2× Pot', amount: Math.min(maxRaise, Math.max(minRaise, potSize * 2)) },
  ];

  const handleSliderChange = useCallback((value: number) => {
    const snapped = snapToStep(value, 500);
    setRaiseAmount(Math.min(maxRaise, Math.max(minRaise, snapped)));
  }, [minRaise, maxRaise]);

  const sliderPercent = maxRaise > minRaise
    ? ((raiseAmount - minRaise) / (maxRaise - minRaise)) * 100
    : 100;

  const timeRemainingSeconds = Math.ceil(timeRemainingFrac * TOTAL_TIMER_MS / 1000);

  return (
    <AnimatePresence>
      {isVisible && (
        // Use left-0 right-0 instead of left-1/2 -translate-x-1/2 to avoid
        // framer-motion's y-animation overriding the x-translation on mobile.
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 35 }}
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Inner wrapper — centered + max-width on larger screens */}
          <div className="w-full sm:max-w-xl sm:mx-auto">
            {/* Timer Bar */}
            <div className="w-full h-1.5 bg-white/10 rounded-t-xl overflow-hidden">
              <motion.div
                className="h-full"
                style={{
                  width: `${timeRemainingFrac * 100}%`,
                  background: timerColor,
                  transition: 'background 0.3s ease',
                }}
                animate={{ width: `${timeRemainingFrac * 100}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
            </div>

            <div
              className="glass-dark rounded-t-2xl p-3 sm:p-4 border-t border-x border-white/10"
              style={{ background: 'rgba(5, 8, 16, 0.96)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-green-400"
                  />
                  <span className="text-xs font-semibold uppercase tracking-widest text-green-400">
                    YOUR TURN
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  {callAmount > 0 && (
                    <span className="text-xs text-white/40">
                      Call: {formatRupees(callAmount)}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-xs font-bold tabular-nums',
                      timeRemainingFrac < 0.25 ? 'text-red-400 animate-timer-warn' : 'text-white/40',
                    )}
                  >
                    {timeRemainingSeconds}s
                  </span>
                </div>
              </div>

              {/* Raise Expansion */}
              <AnimatePresence>
                {showRaise && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mb-2 sm:mb-3"
                  >
                    <div className="space-y-2 sm:space-y-3 pt-1">
                      {/* Amount Display */}
                      <div className="text-center">
                        <motion.div
                          key={raiseAmount}
                          initial={{ scale: 1.08 }}
                          animate={{ scale: 1 }}
                          className={cn(
                            'text-2xl sm:text-3xl font-display font-bold',
                            isAllIn ? 'text-gold' : 'text-white',
                          )}
                          style={{
                            textShadow: isAllIn
                              ? '0 0 20px rgba(201,168,76,0.5)'
                              : '0 0 10px rgba(255,255,255,0.1)',
                          }}
                        >
                          {isAllIn ? '🔥 ALL IN' : formatRupees(raiseAmount)}
                        </motion.div>
                        {isAllIn && (
                          <div className="text-gold/60 text-xs mt-1">{formatRupees(maxRaise)}</div>
                        )}
                      </div>

                      {/* Preset Buttons */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {presetBets.map((preset) => {
                          const clamped = Math.min(maxRaise, preset.amount);
                          const isActive = raiseAmount === clamped;
                          return (
                            <button
                              key={preset.label}
                              onClick={() => setRaiseAmount(clamped)}
                              className={cn(
                                'py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-all',
                                isActive
                                  ? 'bg-gold/20 border border-gold/40 text-gold'
                                  : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10',
                              )}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Slider */}
                      <div className="relative">
                        <input
                          type="range"
                          min={minRaise}
                          max={maxRaise}
                          step={500}
                          value={raiseAmount}
                          onChange={(e) => handleSliderChange(Number(e.target.value))}
                          className="raise-slider w-full"
                          style={{
                            background: `linear-gradient(to right, #c9a84c ${sliderPercent}%, rgba(255,255,255,0.1) ${sliderPercent}%)`,
                          }}
                        />
                        <div className="flex justify-between text-[10px] text-white/30 mt-1">
                          <span>{formatRupees(minRaise)}</span>
                          <span>ALL IN {formatRupees(maxRaise)}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              {!showRaise ? (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleFold}
                    className="btn-fold py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider"
                  >
                    ✕ Fold
                  </button>

                  <button
                    onClick={canCheck ? handleCheck : handleCall}
                    className="btn-check py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider"
                  >
                    {canCheck ? '✓ Check' : `✓ Call`}
                    {!canCheck && (
                      <span className="block text-[10px] font-normal opacity-80 normal-case tracking-normal">
                        {formatRupees(callAmount)}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setShowRaise(true)}
                    className="btn-raise py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider"
                    disabled={maxRaise <= 0}
                  >
                    ↑ Raise
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleFold}
                    className="btn-fold py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider"
                  >
                    ✕ Fold
                  </button>
                  <button
                    onClick={() => setShowRaise(false)}
                    className="py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm text-white/40 glass hover:glass-dark transition-all uppercase tracking-wider"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleRaise}
                    className={cn(
                      'py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider',
                      isAllIn ? 'btn-allin' : 'btn-raise',
                    )}
                  >
                    {isAllIn ? '🔥 All In' : 'Raise'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
