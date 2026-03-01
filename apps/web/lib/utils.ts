import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format paise to rupee display (e.g. 500 → "₹5", 100000 → "₹1,000") */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** Format large amounts (e.g. 100000 paise → "₹1,000") */
export function formatAmount(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10_00_000) {
    return `₹${(rupees / 100_000).toFixed(1)}L`;
  }
  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}K`;
  }
  return `₹${rupees.toLocaleString('en-IN')}`;
}

/** Get initials from player name */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Generate consistent color from player ID */
export function getAvatarGradient(id: string): string {
  const gradients = [
    'from-purple-600 to-purple-900',
    'from-blue-600 to-blue-900',
    'from-emerald-600 to-emerald-900',
    'from-rose-600 to-rose-900',
    'from-amber-600 to-amber-900',
    'from-cyan-600 to-cyan-900',
  ];
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

/** Calculate seat positions around an oval table.
 *  Visual position 0 is always bottom-center (the local player's seat).
 *  Other seats go counter-clockwise: left-bottom → left-top → top → right-top → right-bottom.
 */
export function getSeatPositions(
  maxPlayers: number,
  opts?: { cx?: number; cy?: number; rx?: number; ry?: number },
): { x: number; y: number }[] {
  const rx = opts?.rx ?? 42; // % of container width
  const ry = opts?.ry ?? 36; // % of container height
  const cx = opts?.cx ?? 50;
  const cy = opts?.cy ?? 50;

  const positions: { x: number; y: number }[] = [];

  // -π/2 = -90° puts seat 0 at bottom-center in CSS coordinates (y increases downward)
  const startAngle = -Math.PI / 2;

  for (let i = 0; i < maxPlayers; i++) {
    const angle = startAngle - (2 * Math.PI * i) / maxPlayers;
    const x = cx + rx * Math.cos(angle);
    const y = cy - ry * Math.sin(angle);
    positions.push({ x, y });
  }

  return positions;
}

/** Snap value to nearest multiple of step */
export function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Format time remaining */
export function formatTimeRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${seconds}s`;
}

/** Suit symbol */
export const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const SUIT_COLORS: Record<string, string> = {
  hearts: '#dc2626',
  diamonds: '#dc2626',
  clubs: '#111111',
  spades: '#111111',
};
