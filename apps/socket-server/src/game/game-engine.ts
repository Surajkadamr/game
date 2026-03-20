import { v4 as uuidv4 } from 'uuid';
import type {
  Card, GameState, Player, PublicPlayer, Pot, BettingRound,
  GamePhase, PlayerAction, ActionType, WinnerInfo, TableConfig,
  BuyInRecord, BuyInTrackerEntry, BuyInTrackerState,
} from '@kadam/shared';
import { freshDeck } from './deck';
import { evaluateHand, compareHands } from './hand-evaluator';
import { calculatePots, distributePots, totalPot } from './pot-calculator';

// ─── Internal State ────────────────────────────────────────────────────────

export interface InternalPlayer extends Player {
  holeCards: Card[];
  totalBetThisHand: number;
  seatIndex: number;
}

export interface InternalBuyInEntry {
  playerName: string;
  nameKey: string;
  totalBuyIns: number;
  currentChips: number;
  cashedOut: number;
  isSeated: boolean;
  buyInHistory: BuyInRecord[];
  pendingBuyIn: number;
  lastPlayerId: string;
}

export interface InternalGameState {
  tableId: string;
  config: TableConfig;
  phase: GamePhase;
  round: BettingRound | null;
  handNumber: number;
  players: InternalPlayer[];
  deck: Card[];
  communityCards: Card[];
  pots: Pot[];
  currentBet: number;
  minRaise: number;
  dealerSeatIndex: number;
  activePlayerSeatIndex: number | null;
  actionStartTime: number | null;
  lastAction?: PlayerAction;
  roundBets: Map<string, number>; // bets this betting round
  lastRaiseAmount: number;        // size of last raise for min-raise rule
  deadContributions: { playerId: string; amount: number }[]; // bets from players removed mid-hand
  buyInTracker: Map<string, InternalBuyInEntry>;  // keyed by lowercase name
  pendingBuyIns: Map<string, number>;             // playerId → amount
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function seatsInOrder(state: InternalGameState, startSeat: number): InternalPlayer[] {
  const { players } = state;
  const maxSeat = state.config.maxPlayers;
  const result: InternalPlayer[] = [];

  for (let i = 0; i < maxSeat; i++) {
    const seat = (startSeat + i) % maxSeat;
    const player = players.find((p) => p.seatIndex === seat);
    if (player) result.push(player);
  }
  return result;
}

function activePlayers(state: InternalGameState): InternalPlayer[] {
  return state.players.filter((p) => p.status === 'active' || p.status === 'all_in');
}

function bettingPlayers(state: InternalGameState): InternalPlayer[] {
  return state.players.filter((p) => p.status === 'active');
}

function nextActiveSeat(state: InternalGameState, afterSeat: number): number | null {
  const { maxPlayers } = state.config;
  for (let i = 1; i <= maxPlayers; i++) {
    const seat = (afterSeat + i) % maxPlayers;
    const player = state.players.find((p) => p.seatIndex === seat);
    if (player && (player.status === 'active')) return seat;
  }
  return null;
}

export function toPublicPlayer(p: InternalPlayer, showCards = false): PublicPlayer {
  return {
    id: p.id,
    name: p.name,
    chips: p.chips,
    seatIndex: p.seatIndex,
    status: p.status,
    currentBet: p.currentBet,
    totalBetThisHand: p.totalBetThisHand,
    isConnected: p.isConnected,
    badge: p.badge,
    hasActed: p.hasActed,
    hasHoleCards: p.holeCards.length > 0,
    holeCards: showCards ? p.holeCards : undefined,
  };
}

export function toPublicState(state: InternalGameState, showCards = false): GameState {
  // Compute buy-in tracker if enabled
  let buyInTracker: BuyInTrackerState | undefined;
  if (state.config.buyInTrackerEnabled && state.buyInTracker.size > 0) {
    // During dealing/betting, player.chips doesn't include chips bet into the pot.
    // Include totalBetThisHand so P&L reflects the player's true position.
    const handActive = state.phase === 'dealing' || state.phase === 'betting';
    const entries: BuyInTrackerEntry[] = [];
    for (const entry of state.buyInTracker.values()) {
      let currentChips = entry.currentChips;
      if (entry.isSeated) {
        const player = state.players.find((p) => p.id === entry.lastPlayerId);
        if (player) {
          currentChips = player.chips + (handActive ? player.totalBetThisHand : 0);
        }
      }
      const cashedOut = entry.cashedOut ?? 0;
      entries.push({
        playerName: entry.playerName,
        nameKey: entry.nameKey,
        totalBuyIns: entry.totalBuyIns,
        currentChips,
        cashedOut,
        profitLoss: (currentChips + cashedOut) - entry.totalBuyIns,
        isSeated: entry.isSeated,
        buyInHistory: entry.buyInHistory,
        pendingBuyIn: entry.pendingBuyIn,
        lastPlayerId: entry.lastPlayerId,
      });
    }
    buyInTracker = { enabled: true, entries };
  }

  return {
    tableId: state.tableId,
    config: state.config,
    phase: state.phase,
    round: state.round,
    handNumber: state.handNumber,
    players: state.players.map((p) => toPublicPlayer(p, showCards)),
    communityCards: state.communityCards,
    pots: state.pots,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    dealerSeatIndex: state.dealerSeatIndex,
    activePlayerSeatIndex: state.activePlayerSeatIndex,
    actionStartTime: state.actionStartTime,
    lastAction: state.lastAction,
    buyInTracker,
  };
}

// ─── Game Engine ───────────────────────────────────────────────────────────

export class GameEngine {
  private state: InternalGameState;

  constructor(config: TableConfig, existingState?: InternalGameState) {
    if (existingState) {
      this.state = existingState;
    } else {
      this.state = {
        tableId: config.id,
        config,
        phase: 'waiting',
        round: null,
        handNumber: 0,
        players: [],
        deck: [],
        communityCards: [],
        pots: [],
        currentBet: 0,
        minRaise: config.bigBlind,
        dealerSeatIndex: 0,
        activePlayerSeatIndex: null,
        actionStartTime: null,
        roundBets: new Map(),
        lastRaiseAmount: config.bigBlind,
        deadContributions: [],
        buyInTracker: new Map(),
        pendingBuyIns: new Map(),
      };
    }
  }

  getState(): InternalGameState {
    return this.state;
  }

  getPublicState(showCards = false): GameState {
    return toPublicState(this.state, showCards);
  }

  // ─── Player Management ─────────────────────────────────────────────────

  addPlayer(id: string, name: string, chips: number, seatIndex: number): boolean {
    if (this.state.players.find((p) => p.seatIndex === seatIndex)) return false;
    if (this.state.players.find((p) => p.id === id)) return false;
    if (this.state.players.length >= this.state.config.maxPlayers) return false;

    this.state.players.push({
      id,
      name,
      chips,
      seatIndex,
      status: 'sitting_out',
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
      isConnected: true,
      badge: null,
      hasActed: false,
    });

    // Buy-in tracker
    if (this.state.config.buyInTrackerEnabled) {
      const nameKey = name.trim().toLowerCase();
      const existing = this.state.buyInTracker.get(nameKey);
      if (existing) {
        // Preserve cashed-out chips from previous sessions for accurate P&L
        if (!existing.isSeated) {
          existing.cashedOut += existing.currentChips;
        }
        existing.totalBuyIns += chips;
        existing.currentChips = chips;
        existing.isSeated = true;
        existing.lastPlayerId = id;
        existing.pendingBuyIn = 0;
        existing.buyInHistory.push({ amount: chips, timestamp: Date.now(), type: 'rebuy' });
      } else {
        this.state.buyInTracker.set(nameKey, {
          playerName: name,
          nameKey,
          totalBuyIns: chips,
          currentChips: chips,
          cashedOut: 0,
          isSeated: true,
          buyInHistory: [{ amount: chips, timestamp: Date.now(), type: 'initial' }],
          pendingBuyIn: 0,
          lastPlayerId: id,
        });
      }
    }

    return true;
  }

  removePlayer(id: string): boolean {
    const idx = this.state.players.findIndex((p) => p.id === id);
    if (idx === -1) return false;

    const player = this.state.players[idx];

    // If a hand is in progress and this player has bet, preserve their contributions
    // so collectBetsToPot doesn't lose their chips from the pot
    const handInProgress = this.state.phase !== 'waiting' && this.state.phase !== 'between_hands';
    if (handInProgress && player.totalBetThisHand > 0) {
      this.state.deadContributions.push({
        playerId: player.id,
        amount: player.totalBetThisHand,
      });
    }

    // Buy-in tracker: freeze entry with current chip count
    if (this.state.config.buyInTrackerEnabled) {
      const nameKey = player.name.trim().toLowerCase();
      const entry = this.state.buyInTracker.get(nameKey);
      if (entry) {
        entry.isSeated = false;
        entry.currentChips = player.chips;
        // Note: cashedOut is updated when the player rejoins (addPlayer),
        // so the frozen currentChips value is preserved until then.
      }
    }

    this.state.players.splice(idx, 1);

    if (this.state.players.filter((p) => p.isConnected).length < 2) {
      this.state.phase = 'waiting';
    }
    return true;
  }

  setPlayerConnected(id: string, connected: boolean): void {
    const player = this.state.players.find((p) => p.id === id);
    if (player) player.isConnected = connected;
  }

  canStart(): boolean {
    return this.state.players.filter((p) => p.isConnected && p.chips > 0).length >= 2;
  }

  // ─── Hand Setup ────────────────────────────────────────────────────────

  startNewHand(): { events: HandEvent[] } {
    const events: HandEvent[] = [];
    const s = this.state;

    // Process pending buy-ins
    if (s.pendingBuyIns.size > 0) {
      for (const [playerId, amount] of s.pendingBuyIns) {
        const player = s.players.find((p) => p.id === playerId);
        if (player) {
          player.chips += amount;
          // Re-activate eliminated players who now have chips
          if (player.status === 'eliminated') {
            player.status = 'sitting_out';
          }
          if (s.config.buyInTrackerEnabled) {
            const nameKey = player.name.trim().toLowerCase();
            const entry = s.buyInTracker.get(nameKey);
            if (entry) {
              entry.totalBuyIns += amount;
              entry.pendingBuyIn = 0;
              entry.buyInHistory.push({ amount, timestamp: Date.now(), type: 'top_up' });
            }
          }
        }
      }
      s.pendingBuyIns.clear();
    }

    // Eliminate broke players
    for (const p of s.players) {
      if (p.chips <= 0) p.status = 'eliminated';
    }

    const eligible = s.players.filter((p) => p.status !== 'eliminated' && p.isConnected);
    if (eligible.length < 2) {
      s.phase = 'waiting';
      return { events };
    }

    // Advance dealer button
    const seats = eligible.map((p) => p.seatIndex).sort((a, b) => a - b);
    const currentDealerIdx = seats.indexOf(s.dealerSeatIndex);
    s.dealerSeatIndex = seats[(currentDealerIdx + 1) % seats.length];

    s.handNumber++;
    s.phase = 'dealing';
    s.round = 'pre_flop';
    s.deck = freshDeck();
    s.communityCards = [];
    s.pots = [];
    s.currentBet = s.config.bigBlind;
    s.minRaise = s.config.bigBlind;
    s.lastRaiseAmount = s.config.bigBlind;
    s.roundBets = new Map();
    s.deadContributions = [];

    // Reset players
    for (const p of s.players) {
      if (p.status !== 'eliminated') {
        p.status = 'active';
        p.holeCards = [];
        p.currentBet = 0;
        p.totalBetThisHand = 0;
        p.hasActed = false;
        p.badge = null;
      }
    }

    // Assign position badges
    const dealerPlayer = eligible.find((p) => p.seatIndex === s.dealerSeatIndex);
    if (dealerPlayer) dealerPlayer.badge = 'D';

    const headsUp = eligible.length === 2;

    // SB and BB assignment
    const sbPlayer = seatsInOrder(s, s.dealerSeatIndex).filter(p => p.status === 'active')[headsUp ? 0 : 1];
    const bbPlayer = seatsInOrder(s, s.dealerSeatIndex).filter(p => p.status === 'active')[headsUp ? 1 : 2];

    if (sbPlayer) sbPlayer.badge = 'SB';
    if (bbPlayer) bbPlayer.badge = 'BB';

    // Post blinds
    if (sbPlayer) {
      const sbAmount = Math.min(sbPlayer.chips, s.config.smallBlind);
      sbPlayer.chips -= sbAmount;
      sbPlayer.currentBet = sbAmount;
      sbPlayer.totalBetThisHand = sbAmount;
      s.roundBets.set(sbPlayer.id, sbAmount);
      if (sbPlayer.chips === 0) sbPlayer.status = 'all_in';
      events.push({ type: 'blind_posted', playerId: sbPlayer.id, amount: sbAmount, blindType: 'small' });
    }

    if (bbPlayer) {
      const bbAmount = Math.min(bbPlayer.chips, s.config.bigBlind);
      bbPlayer.chips -= bbAmount;
      bbPlayer.currentBet = bbAmount;
      bbPlayer.totalBetThisHand = bbAmount;
      s.roundBets.set(bbPlayer.id, bbAmount);
      if (bbPlayer.chips === 0) bbPlayer.status = 'all_in';
      events.push({ type: 'blind_posted', playerId: bbPlayer.id, amount: bbAmount, blindType: 'big' });
    }

    // Deal hole cards
    for (let round = 0; round < 2; round++) {
      for (const p of seatsInOrder(s, s.dealerSeatIndex).filter(pl => pl.status === 'active' || pl.status === 'all_in')) {
        const card = s.deck.pop()!;
        p.holeCards.push(card);
      }
    }

    // UTG acts first pre-flop (after BB), or dealer in heads-up
    const utg = seatsInOrder(s, bbPlayer?.seatIndex ?? s.dealerSeatIndex)
      .filter((p) => p.status === 'active')[headsUp ? 0 : 1];

    s.activePlayerSeatIndex = utg?.seatIndex ?? null;
    s.actionStartTime = Date.now();
    s.phase = 'betting';

    events.push({ type: 'hand_started', handNumber: s.handNumber, dealerSeatIndex: s.dealerSeatIndex });
    events.push({ type: 'turn_changed', activePlayerSeatIndex: s.activePlayerSeatIndex });

    return { events };
  }

  // ─── Action Processing ─────────────────────────────────────────────────

  processAction(action: PlayerAction): { events: HandEvent[]; error?: string } {
    const events: HandEvent[] = [];
    const s = this.state;

    const player = s.players.find((p) => p.id === action.playerId);
    if (!player) return { events, error: 'Player not found' };
    if (player.seatIndex !== s.activePlayerSeatIndex) return { events, error: 'Not your turn' };
    if (player.status !== 'active') return { events, error: 'Cannot act' };

    player.hasActed = true;
    s.lastAction = action;

    switch (action.action) {
      case 'fold':
        player.status = 'folded';
        events.push({ type: 'action', action });
        break;

      case 'check':
        if (s.currentBet > (s.roundBets.get(player.id) ?? 0)) {
          return { events, error: 'Cannot check — there is a bet' };
        }
        events.push({ type: 'action', action });
        break;

      case 'call': {
        const owed = s.currentBet - (s.roundBets.get(player.id) ?? 0);
        const callAmount = Math.min(owed, player.chips);
        player.chips -= callAmount;
        player.currentBet += callAmount;
        player.totalBetThisHand += callAmount;
        s.roundBets.set(player.id, (s.roundBets.get(player.id) ?? 0) + callAmount);
        if (player.chips === 0) player.status = 'all_in';
        events.push({ type: 'action', action: { ...action, amount: callAmount } });
        events.push({ type: 'chips_to_pot', playerId: player.id, amount: callAmount });
        break;
      }

      case 'raise':
      case 'all_in': {
        const raiseTotal = action.amount!; // total bet this round
        if (action.action === 'raise' && raiseTotal < s.currentBet + s.minRaise &&
          raiseTotal < player.chips + (s.roundBets.get(player.id) ?? 0)) {
          return { events, error: `Minimum raise is ₹${(s.currentBet + s.minRaise) / 100}` };
        }

        const currentContrib = s.roundBets.get(player.id) ?? 0;
        const additionalBet = Math.min(raiseTotal - currentContrib, player.chips);
        const actualTotal = currentContrib + additionalBet;

        player.chips -= additionalBet;
        player.currentBet = actualTotal;
        player.totalBetThisHand += additionalBet;
        s.roundBets.set(player.id, actualTotal);

        if (player.chips === 0) player.status = 'all_in';

        if (actualTotal > s.currentBet) {
          s.lastRaiseAmount = actualTotal - s.currentBet;
          s.minRaise = s.lastRaiseAmount;
          s.currentBet = actualTotal;

          // Reset hasActed for other active players (they can re-raise)
          for (const p of s.players) {
            if (p.id !== player.id && p.status === 'active') {
              p.hasActed = false;
            }
          }
        }

        events.push({ type: 'action', action: { ...action, amount: additionalBet } });
        events.push({ type: 'chips_to_pot', playerId: player.id, amount: additionalBet });
        break;
      }
    }

    // Check if hand is over (everyone else folded — one player remains)
    const stillActive = s.players.filter((p) => p.status === 'active' || p.status === 'all_in');

    if (stillActive.length === 1) {
      // Only one player left — immediate win, no board runout needed
      const endResult = this.concludeHand(true);
      return { events: [...events, ...endResult.events] };
    }

    // Check if betting round is complete.
    // When all remaining players are all-in, isBettingRoundComplete() returns true
    // (vacuously — no active players left to act), which flows into advanceRound()
    // → runOutBoard() to deal remaining community cards before showdown.
    if (this.isBettingRoundComplete()) {
      const advResult = this.advanceRound();
      return { events: [...events, ...advResult.events] };
    }

    // Advance to next player
    const next = this.getNextPlayer();
    s.activePlayerSeatIndex = next;
    s.actionStartTime = Date.now();
    events.push({ type: 'turn_changed', activePlayerSeatIndex: next });

    return { events };
  }

  private isBettingRoundComplete(): boolean {
    const s = this.state;
    const active = s.players.filter((p) => p.status === 'active');

    // All active players have acted
    if (!active.every((p) => p.hasActed)) return false;

    // All active players have matched the current bet
    return active.every((p) => (s.roundBets.get(p.id) ?? 0) >= s.currentBet);
  }

  private getNextPlayer(): number | null {
    const s = this.state;
    const active = s.players.filter((p) => p.status === 'active');
    if (active.length === 0) return null;

    const currentSeat = s.activePlayerSeatIndex ?? 0;
    return nextActiveSeat(s, currentSeat);
  }

  private advanceRound(): { events: HandEvent[] } {
    const events: HandEvent[] = [];
    const s = this.state;

    // Collect bets into pots
    this.collectBetsToPot();
    events.push({ type: 'pots_updated', pots: s.pots });

    // Reset round betting state
    s.roundBets = new Map();
    s.currentBet = 0;
    s.minRaise = s.config.bigBlind;
    s.lastRaiseAmount = s.config.bigBlind;
    for (const p of s.players) {
      p.currentBet = 0;
      p.hasActed = false;
    }

    const allInOrActive = s.players.filter((p) => p.status === 'active' || p.status === 'all_in');
    const canStillBet = s.players.filter((p) => p.status === 'active');

    // If only one or zero players can bet, run out the board
    if (canStillBet.length <= 1 && s.round !== 'river') {
      return this.runOutBoard(events);
    }

    switch (s.round) {
      case 'pre_flop':
        s.round = 'flop';
        // Burn one card, deal flop
        s.deck.pop(); // burn
        s.communityCards.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!);
        events.push({ type: 'community_cards', cards: s.communityCards, round: 'flop' });
        break;

      case 'flop':
        s.round = 'turn';
        s.deck.pop(); // burn
        s.communityCards.push(s.deck.pop()!);
        events.push({ type: 'community_cards', cards: s.communityCards, round: 'turn' });
        break;

      case 'turn':
        s.round = 'river';
        s.deck.pop(); // burn
        s.communityCards.push(s.deck.pop()!);
        events.push({ type: 'community_cards', cards: s.communityCards, round: 'river' });
        break;

      case 'river':
        return this.concludeHand(false, events);
    }

    // Set first to act (left of dealer)
    const firstToAct = seatsInOrder(s, s.dealerSeatIndex)
      .filter((p) => p.status === 'active')[0];
    s.activePlayerSeatIndex = firstToAct?.seatIndex ?? null;
    s.actionStartTime = Date.now();
    s.phase = 'betting';

    events.push({ type: 'turn_changed', activePlayerSeatIndex: s.activePlayerSeatIndex });
    return { events };
  }

  private runOutBoard(events: HandEvent[]): { events: HandEvent[] } {
    const s = this.state;

    if (s.round === 'pre_flop') {
      s.deck.pop(); // burn
      s.communityCards.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!);
      events.push({ type: 'community_cards', cards: [...s.communityCards], round: 'flop' });
      s.round = 'flop';
    }
    if (s.round === 'flop') {
      s.deck.pop(); // burn
      s.communityCards.push(s.deck.pop()!);
      events.push({ type: 'community_cards', cards: [...s.communityCards], round: 'turn' });
      s.round = 'turn';
    }
    if (s.round === 'turn') {
      s.deck.pop(); // burn
      s.communityCards.push(s.deck.pop()!);
      events.push({ type: 'community_cards', cards: [...s.communityCards], round: 'river' });
      s.round = 'river';
    }

    return this.concludeHand(false, events);
  }

  private collectBetsToPot(): void {
    const s = this.state;
    const contributions: { playerId: string; amount: number }[] = [];
    let deadMoney = 0;

    for (const p of s.players) {
      if (p.totalBetThisHand > 0) {
        if (p.status === 'active' || p.status === 'all_in') {
          // Only active/all-in players create pot tiers (side pots)
          contributions.push({ playerId: p.id, amount: p.totalBetThisHand });
        } else {
          // Folded/eliminated players' bets are dead money in the main pot
          deadMoney += p.totalBetThisHand;
        }
      }
    }

    // Include contributions from players who were removed mid-hand as dead money
    for (const dead of s.deadContributions) {
      deadMoney += dead.amount;
    }

    s.pots = calculatePots(contributions, deadMoney);
  }

  private concludeHand(noShowdown: boolean, existingEvents: HandEvent[] = []): { events: HandEvent[] } {
    const events = existingEvents;
    const s = this.state;

    this.collectBetsToPot();

    s.phase = 'showdown';
    s.round = 'showdown';
    s.activePlayerSeatIndex = null;

    const stillAlive = s.players.filter((p) => p.status === 'active' || p.status === 'all_in');

    if (noShowdown && stillAlive.length === 1) {
      // One winner, no cards shown
      const winner = stillAlive[0];
      const potAmount = totalPot(s.pots);
      winner.chips += potAmount;
      s.pots = [];

      const winnerInfo: WinnerInfo[] = [{
        playerId: winner.id,
        playerName: winner.name,
        amount: potAmount,
        potIndex: 0,
      }];

      s.phase = 'winner';
      events.push({ type: 'hand_ended', winners: winnerInfo, showCards: [] });
      return { events };
    }

    // Evaluate hands
    const handResults = stillAlive.map((p) => ({
      playerId: p.id,
      score: p.holeCards.length >= 2
        ? evaluateHand(p.holeCards, s.communityCards).score
        : -1,
      handResult: p.holeCards.length >= 2
        ? evaluateHand(p.holeCards, s.communityCards)
        : undefined,
    }));

    // Order for odd chip tiebreaking (clockwise from left of dealer)
    const dealerLeftOrder = seatsInOrder(s, s.dealerSeatIndex)
      .filter((p) => p.status === 'active' || p.status === 'all_in')
      .map((p) => p.id);

    const winnings = distributePots(s.pots, handResults, dealerLeftOrder);

    const showCards: { playerId: string; cards: Card[] }[] = [];
    const winnerInfos: WinnerInfo[] = [];

    for (const [playerId, amount] of winnings) {
      const player = s.players.find((p) => p.id === playerId)!;
      player.chips += amount;
      const handResult = handResults.find((r) => r.playerId === playerId)?.handResult;

      winnerInfos.push({
        playerId,
        playerName: player.name,
        amount,
        handResult,
        potIndex: 0,
      });
    }

    // Show cards for all remaining players
    for (const p of stillAlive) {
      if (p.holeCards.length > 0) {
        showCards.push({ playerId: p.id, cards: p.holeCards });
      }
    }

    s.pots = [];
    s.phase = 'winner';
    events.push({ type: 'hand_ended', winners: winnerInfos, showCards });

    return { events };
  }

  // ─── Buy-In ──────────────────────────────────────────────────────────

  requestBuyIn(playerId: string, amount: number): { success: boolean; message?: string; pendingAmount?: number } {
    const s = this.state;
    if (!s.config.buyInTrackerEnabled) return { success: false, message: 'Buy-in tracker not enabled' };

    const player = s.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    if (amount < s.config.bigBlind) return { success: false, message: 'Amount too small' };

    const nameKey = player.name.trim().toLowerCase();

    if (s.phase === 'waiting' || s.phase === 'between_hands' || s.phase === 'winner') {
      // Credit immediately during non-active phases
      player.chips += amount;
      // Re-activate eliminated players who now have chips
      if (player.status === 'eliminated') {
        player.status = 'sitting_out';
      }
      const entry = s.buyInTracker.get(nameKey);
      if (entry) {
        entry.totalBuyIns += amount;
        entry.currentChips = player.chips;
        entry.buyInHistory.push({ amount, timestamp: Date.now(), type: 'top_up' });
      }
      return { success: true, message: 'Chips added' };
    }

    // Queue for next hand (during dealing/betting/showdown)
    const existing = s.pendingBuyIns.get(playerId) ?? 0;
    s.pendingBuyIns.set(playerId, existing + amount);

    const entry = s.buyInTracker.get(nameKey);
    if (entry) {
      entry.pendingBuyIn = existing + amount;
    }

    return { success: true, message: 'Chips will be added at the start of the next hand', pendingAmount: existing + amount };
  }

  getBuyInTrackerState(): BuyInTrackerState | undefined {
    if (!this.state.config.buyInTrackerEnabled) return undefined;

    const handActive = this.state.phase === 'dealing' || this.state.phase === 'betting';
    const entries: BuyInTrackerEntry[] = [];
    for (const entry of this.state.buyInTracker.values()) {
      // Update live chip count for seated players
      let currentChips = entry.currentChips;
      if (entry.isSeated) {
        const player = this.state.players.find((p) => p.id === entry.lastPlayerId);
        if (player) {
          currentChips = player.chips + (handActive ? player.totalBetThisHand : 0);
        }
      }
      const cashedOut = entry.cashedOut ?? 0;
      entries.push({
        playerName: entry.playerName,
        nameKey: entry.nameKey,
        totalBuyIns: entry.totalBuyIns,
        currentChips,
        cashedOut,
        profitLoss: (currentChips + cashedOut) - entry.totalBuyIns,
        isSeated: entry.isSeated,
        buyInHistory: entry.buyInHistory,
        pendingBuyIn: entry.pendingBuyIn,
        lastPlayerId: entry.lastPlayerId,
      });
    }

    return { enabled: true, entries };
  }

  // ─── Timeout Handling ──────────────────────────────────────────────────

  handleTimeout(playerId: string): { events: HandEvent[] } {
    const s = this.state;
    const player = s.players.find((p) => p.id === playerId);
    if (!player || player.seatIndex !== s.activePlayerSeatIndex) return { events: [] };

    // Auto-check if possible, otherwise fold
    const canCheck = s.currentBet <= (s.roundBets.get(player.id) ?? 0);
    const action: PlayerAction = canCheck
      ? { playerId, action: 'check' }
      : { playerId, action: 'fold' };

    return this.processAction(action);
  }
}

// ─── Events ────────────────────────────────────────────────────────────────

export type HandEvent =
  | { type: 'hand_started'; handNumber: number; dealerSeatIndex: number }
  | { type: 'blind_posted'; playerId: string; amount: number; blindType: 'small' | 'big' }
  | { type: 'action'; action: PlayerAction }
  | { type: 'turn_changed'; activePlayerSeatIndex: number | null }
  | { type: 'community_cards'; cards: Card[]; round: string }
  | { type: 'pots_updated'; pots: Pot[] }
  | { type: 'chips_to_pot'; playerId: string; amount: number }
  | { type: 'hand_ended'; winners: WinnerInfo[]; showCards: { playerId: string; cards: Card[] }[] };
