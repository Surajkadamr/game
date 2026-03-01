import type { Card, HandRank, HandResult } from '@kadam/shared';

// ─── Helpers ───────────────────────────────────────────────────────────────

function sortDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.value - a.value);
}

function groupByRank(cards: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const card of cards) {
    const group = map.get(card.value) ?? [];
    group.push(card);
    map.set(card.value, group);
  }
  return map;
}

function groupBySuit(cards: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const card of cards) {
    const group = map.get(card.suit) ?? [];
    group.push(card);
    map.set(card.suit, group);
  }
  return map;
}

/** Get all combinations of k cards from a set */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// ─── Hand Checkers ─────────────────────────────────────────────────────────

function checkRoyalFlush(sorted: Card[]): Card[] | null {
  const sf = checkStraightFlush(sorted);
  if (sf && sf[0].value === 14) return sf;
  return null;
}

function checkStraightFlush(sorted: Card[]): Card[] | null {
  const bySuit = groupBySuit(sorted);
  for (const [, suitCards] of bySuit) {
    if (suitCards.length >= 5) {
      const straight = checkStraight(sortDesc(suitCards));
      if (straight) return straight;
    }
  }
  return null;
}

function checkFourOfAKind(sorted: Card[]): Card[] | null {
  const byRank = groupByRank(sorted);
  for (const [, group] of byRank) {
    if (group.length === 4) {
      const quad = group;
      const kicker = sorted.filter((c) => c.value !== quad[0].value)[0];
      return [...quad, kicker];
    }
  }
  return null;
}

function checkFullHouse(sorted: Card[]): Card[] | null {
  const byRank = groupByRank(sorted);
  const trips = [...byRank.values()].filter((g) => g.length >= 3).sort((a, b) => b[0].value - a[0].value);
  const pairs = [...byRank.values()].filter((g) => g.length >= 2).sort((a, b) => b[0].value - a[0].value);

  if (trips.length === 0) return null;

  const tripCards = trips[0].slice(0, 3);
  const pairCandidates = pairs.filter((p) => p[0].value !== tripCards[0].value);
  if (pairCandidates.length === 0) return null;

  const pairCards = pairCandidates[0].slice(0, 2);
  return [...tripCards, ...pairCards];
}

function checkFlush(sorted: Card[]): Card[] | null {
  const bySuit = groupBySuit(sorted);
  for (const [, suitCards] of bySuit) {
    if (suitCards.length >= 5) {
      return sortDesc(suitCards).slice(0, 5);
    }
  }
  return null;
}

function checkStraight(sorted: Card[]): Card[] | null {
  const unique = [...new Map(sorted.map((c) => [c.value, c])).values()];
  const desc = sortDesc(unique);

  // Check A-2-3-4-5 (wheel)
  const values = desc.map((c) => c.value);
  const wheelValues = [14, 2, 3, 4, 5];
  if (wheelValues.every((v) => values.includes(v))) {
    const wheel = wheelValues.map((v) => desc.find((c) => c.value === v)!);
    // Ace acts as 1, so 5 is high
    return [wheel[1], wheel[2], wheel[3], wheel[4], wheel[0]]; // 5,4,3,2,A
  }

  for (let i = 0; i <= desc.length - 5; i++) {
    const slice = desc.slice(i, i + 5);
    if (slice[0].value - slice[4].value === 4 &&
      new Set(slice.map((c) => c.value)).size === 5) {
      return slice;
    }
  }
  return null;
}

function checkThreeOfAKind(sorted: Card[]): Card[] | null {
  const byRank = groupByRank(sorted);
  const trips = [...byRank.values()].filter((g) => g.length >= 3).sort((a, b) => b[0].value - a[0].value);
  if (trips.length === 0) return null;
  const tripCards = trips[0].slice(0, 3);
  const kickers = sorted.filter((c) => c.value !== tripCards[0].value).slice(0, 2);
  return [...tripCards, ...kickers];
}

function checkTwoPair(sorted: Card[]): Card[] | null {
  const byRank = groupByRank(sorted);
  const pairs = [...byRank.values()].filter((g) => g.length >= 2).sort((a, b) => b[0].value - a[0].value);
  if (pairs.length < 2) return null;
  const pair1 = pairs[0].slice(0, 2);
  const pair2 = pairs[1].slice(0, 2);
  const kicker = sorted.filter((c) => c.value !== pair1[0].value && c.value !== pair2[0].value)[0];
  return [...pair1, ...pair2, kicker];
}

function checkOnePair(sorted: Card[]): Card[] | null {
  const byRank = groupByRank(sorted);
  const pairs = [...byRank.values()].filter((g) => g.length >= 2).sort((a, b) => b[0].value - a[0].value);
  if (pairs.length === 0) return null;
  const pairCards = pairs[0].slice(0, 2);
  const kickers = sorted.filter((c) => c.value !== pairCards[0].value).slice(0, 3);
  return [...pairCards, ...kickers];
}

function highCard(sorted: Card[]): Card[] {
  return sorted.slice(0, 5);
}

// ─── Score Calculation ─────────────────────────────────────────────────────

const HAND_RANK_SCORES: Record<HandRank, number> = {
  royal_flush:     9_000_000_000,
  straight_flush:  8_000_000_000,
  four_of_a_kind:  7_000_000_000,
  full_house:      6_000_000_000,
  flush:           5_000_000_000,
  straight:        4_000_000_000,
  three_of_a_kind: 3_000_000_000,
  two_pair:        2_000_000_000,
  one_pair:        1_000_000_000,
  high_card:       0,
};

function cardScore(cards: Card[]): number {
  // Cards already sorted by importance
  return cards.reduce((score, card, i) => score + card.value * Math.pow(15, 4 - i), 0);
}

// ─── Description Builders ──────────────────────────────────────────────────

function rankName(value: number): string {
  const names: Record<number, string> = {
    14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks',
    10: 'Tens', 9: 'Nines', 8: 'Eights', 7: 'Sevens',
    6: 'Sixes', 5: 'Fives', 4: 'Fours', 3: 'Threes', 2: 'Twos',
  };
  return names[value] ?? `${value}s`;
}

function rankNameSingle(value: number): string {
  const names: Record<number, string> = {
    14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack',
    10: 'Ten', 9: 'Nine', 8: 'Eight', 7: 'Seven',
    6: 'Six', 5: 'Five', 4: 'Four', 3: 'Three', 2: 'Two',
  };
  return names[value] ?? `${value}`;
}

function buildDescription(rank: HandRank, cards: Card[]): string {
  switch (rank) {
    case 'royal_flush':     return 'Royal Flush';
    case 'straight_flush':  return `Straight Flush — ${rankNameSingle(cards[0].value)} High`;
    case 'four_of_a_kind':  return `Four of a Kind — ${rankName(cards[0].value)}`;
    case 'full_house':      return `Full House — ${rankName(cards[0].value)} over ${rankName(cards[3].value)}`;
    case 'flush':           return `Flush — ${rankNameSingle(cards[0].value)} High`;
    case 'straight':        return `Straight — ${rankNameSingle(cards[0].value)} High`;
    case 'three_of_a_kind': return `Three of a Kind — ${rankName(cards[0].value)}`;
    case 'two_pair':        return `Two Pair — ${rankName(cards[0].value)} and ${rankName(cards[2].value)}`;
    case 'one_pair':        return `One Pair — ${rankName(cards[0].value)}`;
    case 'high_card':       return `High Card — ${rankNameSingle(cards[0].value)}`;
  }
}

// ─── Main Evaluator ────────────────────────────────────────────────────────

export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];

  // Try all C(7,5) = 21 combinations
  const fiveCardCombos = combinations(allCards, 5);
  let best: HandResult | null = null;

  for (const combo of fiveCardCombos) {
    const result = evaluate5Cards(combo);
    if (!best || result.score > best.score) {
      best = result;
    }
  }

  return best!;
}

function evaluate5Cards(cards: Card[]): HandResult {
  const sorted = sortDesc(cards);

  const checks: [HandRank, Card[] | null][] = [
    ['royal_flush',     checkRoyalFlush(sorted)],
    ['straight_flush',  checkStraightFlush(sorted)],
    ['four_of_a_kind',  checkFourOfAKind(sorted)],
    ['full_house',      checkFullHouse(sorted)],
    ['flush',           checkFlush(sorted)],
    ['straight',        checkStraight(sorted)],
    ['three_of_a_kind', checkThreeOfAKind(sorted)],
    ['two_pair',        checkTwoPair(sorted)],
    ['one_pair',        checkOnePair(sorted)],
  ];

  for (const [rank, result] of checks) {
    if (result) {
      const score = HAND_RANK_SCORES[rank] + cardScore(result);
      return { rank, score, cards: result, description: buildDescription(rank, result) };
    }
  }

  const hc = highCard(sorted);
  const score = HAND_RANK_SCORES['high_card'] + cardScore(hc);
  return { rank: 'high_card', score, cards: hc, description: buildDescription('high_card', hc) };
}

/** Compare two hand results. Returns positive if a wins, negative if b wins, 0 for tie */
export function compareHands(a: HandResult, b: HandResult): number {
  return a.score - b.score;
}
