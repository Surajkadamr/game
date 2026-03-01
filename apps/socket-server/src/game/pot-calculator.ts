import type { Pot, Player } from '@kadam/shared';

interface PotContribution {
  playerId: string;
  amount: number;
}

/**
 * Calculate main pot and side pots from player contributions.
 * Handles all-in situations correctly.
 */
export function calculatePots(contributions: PotContribution[]): Pot[] {
  if (contributions.length === 0) return [];

  // Filter out players with 0 contribution
  const active = contributions.filter((c) => c.amount > 0);
  if (active.length === 0) return [];

  const pots: Pot[] = [];
  const remaining = active.map((c) => ({ ...c }));

  while (remaining.some((c) => c.amount > 0)) {
    // Find minimum contribution among players still in
    const minAmount = Math.min(...remaining.filter((c) => c.amount > 0).map((c) => c.amount));

    // Everyone contributes up to minAmount
    const potAmount = remaining.reduce((sum, c) => {
      const contrib = Math.min(c.amount, minAmount);
      c.amount -= contrib;
      return sum + contrib;
    }, 0);

    // Eligible players are those who contributed to this pot
    const eligiblePlayers = active
      .filter((c) => contributions.find((o) => o.playerId === c.playerId)!.amount >= minAmount)
      .map((c) => c.playerId);

    if (pots.length === 0) {
      pots.push({ amount: potAmount, eligiblePlayers, isMain: true });
    } else {
      // Merge into existing if same eligible set
      const existing = pots.find(
        (p) => JSON.stringify(p.eligiblePlayers.sort()) === JSON.stringify(eligiblePlayers.sort())
      );
      if (existing) {
        existing.amount += potAmount;
      } else {
        pots.push({ amount: potAmount, eligiblePlayers, isMain: false });
      }
    }

    // Remove players who have been fully matched
    remaining.forEach((c) => {
      if (c.amount === 0) {
        // Keep in remaining but skip
      }
    });

    // Remove players with 0 from further consideration if they went all-in
    // (they stay eligible for pots they contributed to but can't win new pots)
  }

  return pots;
}

/**
 * Distribute pots to winners.
 * Returns a map of playerId → amount won.
 */
export function distributePots(
  pots: Pot[],
  handResults: { playerId: string; score: number }[],
  dealerSeatFirstLeft: string[], // clockwise order from left of dealer, for odd chip tiebreaking
): Map<string, number> {
  const winnings = new Map<string, number>();

  for (const pot of pots) {
    // Only players eligible for this pot
    const eligible = handResults.filter((r) => pot.eligiblePlayers.includes(r.playerId));
    if (eligible.length === 0) continue;

    // Find highest score among eligible
    const maxScore = Math.max(...eligible.map((r) => r.score));
    const winners = eligible.filter((r) => r.score === maxScore);

    const splitAmount = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - splitAmount * winners.length;

    for (const winner of winners) {
      winnings.set(winner.playerId, (winnings.get(winner.playerId) ?? 0) + splitAmount);
    }

    // Odd chip goes to first winner in dealer-left order
    if (remainder > 0) {
      const firstWinner = dealerSeatFirstLeft.find((id) => winners.some((w) => w.playerId === id));
      if (firstWinner) {
        winnings.set(firstWinner, (winnings.get(firstWinner) ?? 0) + remainder);
      }
    }
  }

  return winnings;
}

/** Total of all pots */
export function totalPot(pots: Pot[]): number {
  return pots.reduce((sum, p) => sum + p.amount, 0);
}
