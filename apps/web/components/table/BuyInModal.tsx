'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatRupees } from '@/lib/utils';

interface BuyInModalProps {
  minBuyIn: number;
  maxBuyIn: number;
  bigBlind: number;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}

export function BuyInModal({ minBuyIn, maxBuyIn, bigBlind, onConfirm, onClose }: BuyInModalProps) {
  const [amount, setAmount] = useState(minBuyIn);

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
        className="glass rounded-2xl p-6 w-full max-w-sm mx-4"
        style={{ border: '1px solid rgba(201,168,76,0.2)' }}
      >
        <h2 className="font-display text-xl font-bold text-white mb-1">Buy More Chips</h2>
        <p className="text-xs text-white/40 mb-5">
          Chips will be added at the start of the next hand
        </p>

        <div className="mb-4">
          <label className="block text-xs uppercase tracking-wider text-white/40 font-semibold mb-2">
            Amount ({formatRupees(amount)})
          </label>
          <input
            type="range"
            min={minBuyIn}
            max={maxBuyIn}
            step={bigBlind}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="raise-slider w-full"
            style={{
              background: `linear-gradient(to right, #c9a84c ${
                ((amount - minBuyIn) / (maxBuyIn - minBuyIn)) * 100
              }%, rgba(255,255,255,0.1) ${
                ((amount - minBuyIn) / (maxBuyIn - minBuyIn)) * 100
              }%)`,
            }}
          />
          <div className="flex justify-between text-xs text-white/30 mt-1">
            <span>Min: {formatRupees(minBuyIn)}</span>
            <span className="text-gold font-bold text-base">{formatRupees(amount)}</span>
            <span>Max: {formatRupees(maxBuyIn)}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white/40 glass hover:glass-dark transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount)}
            className="flex-grow py-2.5 rounded-xl font-bold text-sm btn-raise uppercase tracking-wider"
          >
            Buy {formatRupees(amount)}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
