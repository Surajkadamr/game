import type { Pot, Player } from '@kadam/shared';

interface PotContribution {
  playerId: string;
  amount: number;
}

/**
 * Calculate main pot and side pots from player contributions.
 * Handles all-in situations correctly.
 *
 * Only active/all-in players' contributions create pot tiers (side pots).
 * Dead money (from folded/removed players) is added to the main pot.
 */
export function calculatePots(contributions: PotContribution[], deadMoney: number = 0): Pot[] {
  // Filter out players with 0 contribution
  const active = contributions.filter((c) => c.amount > 0);

  if (active.length === 0) {
    // Only dead money, no live players with bets
    if (deadMoney > 0) {
      return [{ amount: deadMoney, eligiblePlayers: [], isMain: true }];
    }
    return [];
  }

  const pots: Pot[] = [];
  const remaining = active.map((c) => ({ ...c }));

  while (remaining.some((c) => c.amount > 0)) {
    // Find minimum contribution among players who still have chips in
    const withChips = remaining.filter((c) => c.amount > 0);
    const minAmount = Math.min(...withChips.map((c) => c.amount));

    // Eligible = players who contributed to THIS pot tier (have remaining > 0)
    const eligiblePlayers = withChips.map((c) => c.playerId);

    // Everyone contributes up to minAmount
    let potAmount = 0;
    for (const c of remaining) {
      const contrib = Math.min(c.amount, minAmount);
      c.amount -= contrib;
      potAmount += contrib;
    }

    if (pots.length === 0) {
      // Add dead money to the main pot
      pots.push({ amount: potAmount + deadMoney, eligiblePlayers, isMain: true });
    } else {
      // Merge into existing if same eligible set (use sorted copies, never mutate originals)
      const sortedEligible = [...eligiblePlayers].sort();
      const existing = pots.find(
        (p) => JSON.stringify([...p.eligiblePlayers].sort()) === JSON.stringify(sortedEligible)
      );
      if (existing) {
        existing.amount += potAmount;
      } else {
        pots.push({ amount: potAmount, eligiblePlayers, isMain: false });
      }
    }
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
