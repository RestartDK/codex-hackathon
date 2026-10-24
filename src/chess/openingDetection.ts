/**
 * Opening detection module for Chess by Sparsh.
 *
 * Identifies common chess openings from UCI move history.
 * Returns the opening name or null if not recognized.
 */

/**
 * Known opening signatures.
 * Each entry: [openingName, uciMove1, uciMove2, ...]
 * The engine matches the longest possible prefix.
 */
const OPENINGS: [string, ...string[]][] = [
  // ── Sicilian Defense ──────────────────────────────────────
  ['Sicilian Defense', 'e2e4', 'c7c5'],

  // ── French Defense ────────────────────────────────────────
  ['French Defense', 'e2e4', 'e7e6'],

  // ── Caro-Kann Defense ─────────────────────────────────────
  ['Caro-Kann Defense', 'e2e4', 'c7c6'],

  // ── Queen's Gambit ────────────────────────────────────────
  ['Queen\'s Gambit', 'd2d4', 'd7d5', 'c2c4'],

  // ── London System ─────────────────────────────────────────
  // White plays d2d4, Ng1f3, Bc1f4 in first 3 moves (any order for white's moves)
  ['London System', 'd2d4', 'g1f3', 'c1f4'],

  // ── King's Indian Defense ─────────────────────────────────
  ['King\'s Indian Defense', 'd2d4', 'g8f6', 'c2c4', 'g7g6'],

  // ── Italian Game ──────────────────────────────────────────
  ['Italian Game', 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],

  // ── Ruy Lopez ─────────────────────────────────────────────
  ['Ruy Lopez', 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'],

  // ── Scotch Game ───────────────────────────────────────────
  ['Scotch Game', 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4'],

  // ── Petrov Defense ────────────────────────────────────────
  ['Petrov Defense', 'e2e4', 'e7e5', 'g1f3', 'g8f6'],
];

/**
 * Detect the opening being played from UCI move history.
 *
 * The London System is a special case: white plays d2d4, g1f3, c1f4
 * in any order within the first 3 white moves. Black's responses don't matter.
 *
 * For all other openings, the first N UCI moves must match exactly.
 *
 * @param history - Array of UCI move strings (e.g. ['e2e4', 'e7e5', 'g1f3', ...])
 * @returns The opening name, or null if no known opening is detected
 */
export function detectOpening(history: string[]): string | null {
  if (history.length < 2) return null;

  // Check London System specially (white's moves in any order in first 3 plies)
  const londonResult = detectLondonSystem(history);
  if (londonResult) return londonResult;

  // For all other openings, check exact prefix matches, longest first
  let bestMatch: string | null = null;
  let bestLength = 0;

  for (const [name, ...moves] of OPENINGS) {
    // Skip London System — handled above
    if (name === 'London System') continue;

    const prefix = moves.slice(0, history.length);
    if (prefix.length >= 2 && prefix.length > bestLength) {
      const matches = moves.every((m, i) => i < history.length && m === history[i]);
      if (matches && prefix.length > bestLength) {
        bestMatch = name;
        bestLength = prefix.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Special handling for the London System.
 *
 * London System is defined as: white plays d2d4, Ng1f3, Bc1f4 in the first 3
 * white moves (which are history indices 0, 2, 4). Black's responses don't matter.
 * We check if within the first 5 plies (up to 3 white moves), all 3 London
 * System white moves appear.
 */
function detectLondonSystem(history: string[]): string | null {
  if (history.length < 5) return null;

  // White moves are at even indices in history: 0, 2, 4
  const whiteMoves: string[] = [];
  for (let i = 0; i < history.length && i < 5; i += 2) {
    whiteMoves.push(history[i]);
  }

  if (whiteMoves.length < 3) return null;

  const needs = new Set(['d2d4', 'g1f3', 'c1f4']);
  const has = new Set(whiteMoves);

  // Check if all three London System moves are present
  let allPresent = true;
  for (const m of needs) {
    if (!has.has(m)) {
      allPresent = false;
      break;
    }
  }

  return allPresent ? 'London System' : null;
}

