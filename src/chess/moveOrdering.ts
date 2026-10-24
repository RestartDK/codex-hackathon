import { Chess } from 'chess.js';
import { PIECE_VALUES } from './evaluate';

/** A verbose move as returned by chess.js */
export interface ChessMoveVerbose {
  from: string;
  to: string;
  promotion?: string;
  captured?: string;
  piece: string;
  color: string;
  san: string;
}

/**
 * MVV-LVA (Most Valuable Victim - Least Valuable Attacker) scoring.
 * Higher score = better move to search first.
 *
 * Base score = captured_piece_value * 10 - attacker_piece_value
 * Promotions get an additional bonus based on promotion piece value.
 */
export function mvvLvaScore(move: ChessMoveVerbose): number {
  let score = 0;

  if (move.captured) {
    const capturedValue = PIECE_VALUES[move.captured] ?? 0;
    const attackerValue = PIECE_VALUES[move.piece] ?? 0;
    score = capturedValue * 10 - attackerValue;
  }

  // Promotion bonus
  if (move.promotion) {
    const promoValue = PIECE_VALUES[move.promotion] ?? 0;
    score += promoValue;
  }

  return score;
}

/**
 * Determine if a move gives check by making the move on a cloned board.
 * This is accurate but involves creating a new Chess object, so it should
 * only be called for the top ~8 moves in the ordering (captures + promotions + TT best).
 */
function givesCheck(game: Chess, from: string, to: string, promotion?: string): boolean {
  try {
    const g = new Chess(game.fen());
    g.move({ from, to, promotion });
    return g.isCheck();
  } catch {
    return false;
  }
}

/**
 * Sort moves by MVV-LVA score (descending) for better alpha-beta pruning.
 * The best captures are searched first.
 * For the top ~8 moves, we also check if the move gives check (accurate).
 */
export function orderMoves(
  moves: ChessMoveVerbose[],
  bestMove?: ChessMoveVerbose | null
): ChessMoveVerbose[] {
  // First, separate captures/promotions from quiet moves
  const tactical = moves.filter(m => m.captured || m.promotion);
  const quiet = moves.filter(m => !m.captured && !m.promotion);

  // Sort tactical by MVV-LVA
  tactical.sort((a, b) => mvvLvaScore(b) - mvvLvaScore(a));

  // Sort quiet by piece-square table + piece value (simple heuristic)
  quiet.sort((a, b) => {
    const aScore = PIECE_VALUES[a.piece] ?? 0;
    const bScore = PIECE_VALUES[b.piece] ?? 0;
    return bScore - aScore; // Develop high-value pieces later
  });

  // Combine: tactical first (best captures), then quiet moves
  const ordered = [...tactical, ...quiet];

  // If we have a TT best move, promote it to the front
  if (bestMove) {
    const idx = ordered.findIndex(
      m => m.from === bestMove.from && m.to === bestMove.to && (m.promotion ?? null) === (bestMove.promotion ?? null)
    );
    if (idx > 0) {
      const [ttMove] = ordered.splice(idx, 1);
      ordered.unshift(ttMove);
    }
  }

  return ordered;
}

/**
 * Get ordered verbose moves from a chess.js game.
 * For Expert, optionally pass a best move from the transposition table.
 */
export function getOrderedMoves(
  game: Chess,
  bestMove?: { from: string; to: string; promotion?: string } | null
): ChessMoveVerbose[] {
  const rawMoves = game.moves({ verbose: true }) as unknown as ChessMoveVerbose[];

  let ttBest: ChessMoveVerbose | null = null;
  if (bestMove) {
    ttBest = rawMoves.find(
      (m) =>
        m.from === bestMove.from &&
        m.to === bestMove.to &&
        (m.promotion ?? null) === (bestMove.promotion ?? null)
    ) ?? null;
  }

  const ordered = orderMoves(rawMoves, ttBest);

  // For the top 5-8 moves, insert check detection as a secondary ordering factor.
  // This is expensive (clone per move) so we limit to the most promising moves.
  const checkDetectionLimit = Math.min(8, ordered.length);

  // Score check-giving moves higher among quiet moves
  // (captures already get MVV-LVA priority)
  for (let i = 0; i < checkDetectionLimit; i++) {
    const m = ordered[i];
    if (!m.captured && !m.promotion) {
      // Only check quiet moves — captures are already ordered by MVV-LVA
      const moveGivesCheck = givesCheck(game, m.from, m.to, m.promotion);
      if (moveGivesCheck) {
        // Move it ahead of non-checking moves
        // Find the right spot: just after all captures and check-giving quiet moves
        let insertPos = 0;
        for (let j = 0; j < i; j++) {
          const candidate = ordered[j];
          if (candidate.captured || candidate.promotion || candidate.san === m.san) {
            insertPos = j + 1;
          }
        }
        if (insertPos < i) {
          ordered.splice(i, 1);
          ordered.splice(insertPos, 0, m);
        }
      }
    }
  }

  return ordered;
}

