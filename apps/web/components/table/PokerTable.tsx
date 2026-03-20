'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { PlayerSeat } from './PlayerSeat';
import { CommunityCards } from './CommunityCards';
import { Card } from './Card';
import { ActionPanel } from './ActionPanel';
import { ParticleBackground } from './ParticleBackground';
import { VoicePanel } from './VoicePanel';
import { BuyInTrackerSidebar } from './BuyInTrackerSidebar';
import { useGameStore, selectTotalPot, selectBuyInTracker, selectIsBuyInTrackerEnabled } from '@/stores/gameStore';
import { useTableVoice } from '@/hooks/useTableVoice';
import { getSeatPositions, formatRupees } from '@/lib/utils';
import type { ActionType } from '@kadam/shared';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

interface PokerTableProps {
  onAction: (action: ActionType, amount?: number) => void;
  onLeave: () => void;
  onRequestBuyIn: (amount: number) => void;
}

interface TimerState {
  playerId: string;
  timeRemainingMs: number;
  totalMs: number;
}

const NEXT_HAND_DELAY_S = 10;

export function PokerTable({ onAction, onLeave, onRequestBuyIn }: PokerTableProps) {
  const {
    gameState,
    playerId,
    myHoleCards,
    isMyTurn,
    turnInfo,
    winners,
    winnerShowCards,
    pendingBuyIn,
  } = useGameStore();

  const isMobile = useIsMobile();

  const { isInVoice, isMuted, micError, voicePeers, speakingPeers, isSpeaking, joinVoice, leaveVoice, toggleMute, isVoiceAvailable } =
    useTableVoice();

  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [lastActionText, setLastActionText] = useState<string | null>(null);
  const [showWinnerCards, setShowWinnerCards] = useState(false);
  const [countdown, setCountdown] = useState(NEXT_HAND_DELAY_S);
  const confettiFiredRef = useRef(false);

  const totalPot = useGameStore(selectTotalPot);
  const buyInTracker = useGameStore(selectBuyInTracker);
  const isBuyInTrackerEnabled = useGameStore(selectIsBuyInTrackerEnabled);

  // Countdown + confetti when winners appear
  useEffect(() => {
    if (!winners || winners.length === 0) {
      setShowWinnerCards(false);
      setCountdown(NEXT_HAND_DELAY_S);
      confettiFiredRef.current = false;
      return;
    }

    // Fire confetti once
    if (!confettiFiredRef.current) {
      confettiFiredRef.current = true;
      const colors = ['#c9a84c', '#e8c875', '#38a169', '#ffffff', '#ffd700'];
      confetti({ particleCount: 120, spread: 80, origin: { x: 0.5, y: 0.45 }, colors, gravity: 1.2, zIndex: 9999 });
      setTimeout(() => {
        confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.65 }, colors, zIndex: 9999 });
        confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors, zIndex: 9999 });
      }, 300);
    }

    // Countdown timer
    setCountdown(NEXT_HAND_DELAY_S);
    const interval = setInterval(() => {
      setCountdown((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [winners]);

  // Socket listeners for timer + action text
  useEffect(() => {
    const { getSocket } = require('@/lib/socket');
    const socket = getSocket();

    const onTimer = ({ playerId: pid, timeRemainingMs, totalMs }: any) => {
      setTimerState({ playerId: pid, timeRemainingMs, totalMs });
    };

    const onActionTaken = ({ playerName, action }: any) => {
      const labels: Record<string, string> = {
        fold: 'folded',
        check: 'checked',
        call: `called ₹${(action.amount ?? 0) / 100}`,
        raise: `raised to ₹${(action.amount ?? 0) / 100}`,
        all_in: 'went ALL IN!',
      };
      setLastActionText(`${playerName} ${labels[action.action] ?? action.action}`);
      setTimeout(() => setLastActionText(null), 3000);
    };

    socket.on('game:timer', onTimer);
    socket.on('game:action_taken', onActionTaken);
    return () => {
      socket.off('game:timer', onTimer);
      socket.off('game:action_taken', onActionTaken);
    };
  }, []);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="text-4xl"
          >
            ♠
          </motion.div>
          <p className="text-white/50 font-semibold">Connecting to table...</p>
        </div>
      </div>
    );
  }

  const { players, communityCards, pots, config, phase, activePlayerSeatIndex } = gameState;

  // Seats are positioned as % of the table oval container.
  // Seat 0 (local player) = bottom-center; others go counter-clockwise.
  // rx/ry ≈ 50 places seats right on the oval edge.
  const seatPositions = getSeatPositions(
    config.maxPlayers,
    isMobile
      ? { cx: 50, cy: 50, rx: 46, ry: 46 }
      : { cx: 50, cy: 50, rx: 48, ry: 47 },
  );

  // Rotate visual positions so the local player always appears at seat slot 0 (bottom-center).
  const mySeatIndex = players.find((p) => p.id === playerId)?.seatIndex ?? null;
  const getVisualPos = (seatIndex: number) => {
    if (mySeatIndex === null) return seatPositions[seatIndex] ?? seatPositions[0];
    const visualIdx = (seatIndex - mySeatIndex + config.maxPlayers) % config.maxPlayers;
    return seatPositions[visualIdx] ?? seatPositions[0];
  };

  const activePlayer = players.find((p) => p.seatIndex === activePlayerSeatIndex);
  const timerForActive =
    timerState && activePlayer && timerState.playerId === activePlayer.id
      ? timerState
      : null;

  const isWaiting = phase === 'waiting' || phase === 'between_hands';

  // Winner data
  const mainWinner = winners?.[0] ?? null;
  const hasWinners = !!mainWinner;
  const isSplitPot = winners && winners.length > 1;
  const allWinnerNames = winners?.map((w) => w.playerName) ?? [];
  const totalWinAmount = winners?.reduce((sum, w) => sum + w.amount, 0) ?? 0;

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Particle Background */}
      <ParticleBackground />

      {/* Main Layout — table fills available space between header and action panel */}
      <div className="relative w-full h-full flex items-center justify-center" style={{ zIndex: 1, paddingTop: isMobile ? 50 : 44, paddingBottom: isMobile ? 80 : 0 }}>
        {/* ─── Poker Table Oval ─────────────────────────────────────────── */}
        {/* The table is the positioning parent for seats — they sit on its edge */}
        <div
          className="relative poker-table"
          style={{
            width: isMobile ? 'min(78vw, 340px)' : 'min(80vw, 950px)',
            height: isMobile ? 'min(65vh, 520px)' : 'min(55vh, 540px)',
            borderRadius: '50%',
            border: 'none',
            boxShadow: isMobile
              ? `
                0 0 0 6px #1a1a1a,
                0 0 0 8px rgba(212,175,55,0.12),
                inset 0 0 50px rgba(0,0,0,0.6),
                0 10px 30px rgba(0,0,0,0.5)
              `
              : `
                0 0 0 8px #1a0f08,
                0 0 0 10px #2c1810,
                0 0 0 12px rgba(201,168,76,0.15),
                0 0 0 14px #1a0f08,
                inset 0 0 60px rgba(0,0,0,0.5),
                inset 0 0 20px rgba(201,168,76,0.05),
                0 20px 80px rgba(0,0,0,0.8)
              `,
          }}
        >
          {/* Table content — community cards centered */}
          <div className="absolute inset-0 flex items-center justify-center">
            <CommunityCards
              cards={communityCards}
              pots={pots}
              round={gameState.round}
              compact={isMobile}
            />
          </div>

          {/* ─── Winner Display (inline, replaces waiting overlay) ─── */}
          <AnimatePresence>
            {hasWinners && mainWinner && (
              <motion.div
                key="winner-display"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center rounded-full"
                style={{ background: 'rgba(0,0,0,0.75)', zIndex: 15 }}
              >
                <div className="flex flex-col items-center gap-1.5 px-6 text-center">
                  {/* Trophy + Winner name */}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="text-3xl sm:text-4xl"
                    style={{ filter: 'drop-shadow(0 0 12px rgba(201,168,76,0.6))' }}
                  >
                    🏆
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="font-display font-bold text-gold text-lg sm:text-2xl max-w-[220px] sm:max-w-[300px] text-center"
                    style={{ textShadow: '0 0 20px rgba(201,168,76,0.5)' }}
                  >
                    {isSplitPot
                      ? allWinnerNames.join(' & ')
                      : mainWinner.playerName}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="text-white font-bold text-base sm:text-xl"
                  >
                    {isSplitPot
                      ? `split pot ${formatRupees(totalWinAmount)}`
                      : `wins ${formatRupees(mainWinner.amount)}`}
                  </motion.div>

                  {/* Per-player winnings for split pot */}
                  {isSplitPot && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-white/50 text-xs"
                    >
                      {formatRupees(mainWinner.amount)} each
                    </motion.div>
                  )}

                  {/* Hand rank */}
                  {mainWinner.handResult && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35 }}
                      className="px-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold"
                      style={{
                        background: 'rgba(201,168,76,0.15)',
                        border: '1px solid rgba(201,168,76,0.3)',
                        color: '#c9a84c',
                      }}
                    >
                      {mainWinner.handResult.description}
                    </motion.div>
                  )}

                  {/* Show/hide cards toggle */}
                  {winnerShowCards && winnerShowCards.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.45 }}
                      className="flex flex-col items-center gap-2 mt-1"
                    >
                      <button
                        onClick={() => setShowWinnerCards((v) => !v)}
                        className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                        style={{
                          background: showWinnerCards
                            ? 'rgba(201,168,76,0.2)'
                            : 'rgba(255,255,255,0.07)',
                          border: '1px solid rgba(201,168,76,0.3)',
                          color: showWinnerCards ? '#c9a84c' : 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {showWinnerCards ? '▲ Hide Cards' : '▼ Show Cards'}
                      </button>

                      <AnimatePresence>
                        {showWinnerCards && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex flex-wrap justify-center gap-3"
                          >
                            {winnerShowCards.map((sc) => {
                              const w = winners?.find((wi) => wi.playerId === sc.playerId);
                              return (
                                <div key={sc.playerId} className="flex flex-col items-center gap-1">
                                  {isSplitPot && (
                                    <span className="text-[10px] text-white/40">{w?.playerName}</span>
                                  )}
                                  <div className="flex gap-1">
                                    {sc.cards.map((card, i) => (
                                      <Card
                                        key={i}
                                        card={card}
                                        size={isMobile ? 'md' : 'md'}
                                        revealed
                                        delay={i * 0.12}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Countdown */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-[10px] sm:text-xs mt-1"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    Next hand in {countdown}s
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Waiting overlay */}
          <AnimatePresence>
            {isWaiting && !hasWinners && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center rounded-full"
                style={{ background: 'rgba(0,0,0,0.3)' }}
              >
                <div className="text-center">
                  <div className="text-white/40 text-sm font-semibold uppercase tracking-widest">
                    {players.filter((p) => p.isConnected).length < 2
                      ? 'Waiting for players...'
                      : phase === 'between_hands'
                      ? 'Next hand starting...'
                      : 'Game starting...'}
                  </div>
                  {players.filter((p) => p.isConnected).length < 2 && (
                    <div className="text-white/20 text-xs mt-1">
                      Need at least 2 players
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Player Seats (positioned on the oval edge) ────────────── */}
          {players.map((player) => {
            const pos = getVisualPos(player.seatIndex);
            const isMe = player.id === playerId;
            const isActive = player.seatIndex === activePlayerSeatIndex;

            return (
              <PlayerSeat
                key={player.id}
                player={player}
                isMe={isMe}
                isActive={isActive}
                myHoleCards={isMe ? myHoleCards : undefined}
                timeRemainingMs={isActive && timerForActive ? timerForActive.timeRemainingMs : undefined}
                totalTimeMs={isActive && timerForActive ? timerForActive.totalMs : 15000}
                position={{ x: pos.x, y: pos.y }}
                compact={isMobile}
                isSpeaking={
                  isMe
                    ? isSpeaking && isInVoice
                    : isInVoice && speakingPeers.has(player.id)
                }
              />
            );
          })}
        </div>

        {/* ─── Last Action Text ──────────────────────────────────────────── */}
        <AnimatePresence>
          {lastActionText && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full glass text-sm font-semibold text-white/70"
              style={{ zIndex: 30 }}
            >
              {lastActionText}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Header Bar ──────────────────────────────────────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 flex items-center px-3 sm:px-4 justify-between"
        style={{
          zIndex: 40,
          height: 44,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Left: brand + table name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className="font-display font-medium text-[13px] sm:text-lg uppercase flex-shrink-0"
            style={{
              letterSpacing: '0.25em',
              background: 'linear-gradient(180deg, #f9e195 0%, #d4af37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Kadam Poker
          </span>
          <div className="hidden sm:block h-3 w-px flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }} />
          <span className="hidden sm:inline text-white/40 text-xs truncate">{gameState.config.name}</span>
        </div>

        {/* Center: blinds (desktop only) */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-white/30 flex-shrink-0 mx-4">
          <span>₹{config.smallBlind / 100}/₹{config.bigBlind / 100}</span>
          <span>#{gameState.handNumber}</span>
        </div>

        {/* Right: voice + leave — always visible, compact */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <VoicePanel
            isInVoice={isInVoice}
            isMuted={isMuted}
            micError={micError}
            voicePeers={voicePeers}
            speakingPeers={speakingPeers}
            isSpeaking={isSpeaking}
            isVoiceAvailable={isVoiceAvailable}
            onJoin={joinVoice}
            onLeave={leaveVoice}
            onToggleMute={toggleMute}
          />
          {/* Mobile: icon-only leave button; desktop: text */}
          <button
            onClick={onLeave}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-all"
            title="Leave Table"
          >
            <span className="sm:hidden">✕</span>
            <span className="hidden sm:inline">Leave Table</span>
          </button>
        </div>
      </div>

      {/* ─── Buy-In Tracker Sidebar ──────────────────────────────────────── */}
      {isBuyInTrackerEnabled && buyInTracker && gameState && (
        <BuyInTrackerSidebar
          tracker={buyInTracker}
          config={gameState.config}
          pendingBuyIn={pendingBuyIn}
          isMobile={isMobile}
          onRequestBuyIn={onRequestBuyIn}
        />
      )}

      {/* ─── Action Panel ─────────────────────────────────────────────────── */}
      <ActionPanel
        isVisible={isMyTurn && !!turnInfo}
        callAmount={turnInfo?.callAmount ?? 0}
        minRaise={turnInfo?.minRaise ?? 0}
        maxRaise={turnInfo?.maxRaise ?? 0}
        canCheck={turnInfo?.canCheck ?? false}
        potSize={totalPot}
        timeoutAt={turnInfo?.timeoutAt ?? Date.now() + 15000}
        onAction={onAction}
      />
    </div>
  );
}
