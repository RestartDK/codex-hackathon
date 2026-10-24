import { Chess } from 'chess.js';
import { evaluateForTurn, PIECE_VALUES } from './evaluate';
import { orderMoves } from './moveOrdering';
import type { ChessMoveVerbose } from './moveOrdering';

/** Delta prune margin for quiet captures (no check) */
const DELTA_PRUNE_MARGIN = PIECE_VALUES.p; // 100cp margin

/** Maximum quiescence depth to prevent infinite chains */
const MAX_QS_DEPTH = 8;

/**
 * Quiescence search: at leaf nodes of the main search,
 * search all tactical moves (captures, promotions, checks)
 * until a quiet position is reached.
 *
 * This solves the "horizon effect" — tactics that would change
 * the evaluation just beyond the search depth are fully resolved.
 *
 * @param game - current position
 * @param alpha - alpha bound
 * @param beta - beta bound
 * @param maximizingColor - the color we're maximizing for
 * @param depth - remaining quiescence depth (prevents infinite loops)
 * @returns score from maximizingColor's perspective
 */
export function quiescenceSearch(
  game: Chess,
  alpha: number,
  beta: number,
  maximizingColor: 'w' | 'b',
  depth: number = MAX_QS_DEPTH
): number {
  // Depth limit reached — evaluate statically
  if (depth <= 0) {
    return evaluateForTurn(game, maximizingColor);
  }

  // Stand-pat evaluation: evaluate the current position
  const standPat = evaluateForTurn(game, maximizingColor);

  // If stand-pat already exceeds beta, prune (beta cutoff)
  if (standPat >= beta) return beta;

  // Update alpha if stand-pat is better
  if (standPat > alpha) {
    alpha = standPat;
  }

  // Check terminal conditions
  if (game.isCheckmate()) {
    // The side to move is checkmated
    return game.turn() === maximizingColor
      ? -99999 + (MAX_QS_DEPTH - depth) * 100
      : 99999 - (MAX_QS_DEPTH - depth) * 100;
  }
  if (game.isDraw()) return standPat;

  const isMaximizing = game.turn() === maximizingColor;
  const allMoves = game.moves({ verbose: true }) as unknown as ChessMoveVerbose[];

  // Collect tactical moves: captures, promotions, and checking moves
  const tacticalMoves: ChessMoveVerbose[] = [];

  for (const move of allMoves) {
    if (move.captured || move.promotion) {
      tacticalMoves.push(move);
      continue;
    }
    // For non-capture non-promotion moves, only include if they give check.
    // We approximate check detection here: if the move could attack the enemy king.
    // Full check detection is done inside the search loop for checked positions.
    if (isCheckProxy(game, move)) {
      tacticalMoves.push(move);
    }
  }

  // No tactical moves — position is quiet
  if (tacticalMoves.length === 0) return standPat;

  // Order tactical moves by MVV-LVA for better pruning
  const ordered = orderMoves(tacticalMoves);

  for (const move of ordered) {
    // Delta pruning: skip quiet captures that can't possibly improve alpha/beta.
    // Only applies when the move does NOT give check (checked positions must be searched).
    if (move.captured && !isCheckProxy(game, move)) {
      const capturedValue = PIECE_VALUES[move.captured] ?? 0;
      if (isMaximizing && standPat + capturedValue + DELTA_PRUNE_MARGIN < alpha) {
        continue; // Can't raise alpha
      }
      if (!isMaximizing && standPat - capturedValue - DELTA_PRUNE_MARGIN > beta) {
        continue; // Can't lower beta
      }
    }

    const g = new Chess(game.fen());
    g.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });

    // Check for game over after the move
    if (g.isGameOver()) {
      if (g.isCheckmate()) {
        // The side that just moved delivered checkmate
        const score = g.turn() === maximizingColor
          ? -99999 + (MAX_QS_DEPTH - depth) * 100
          : 99999 - (MAX_QS_DEPTH - depth) * 100;
        if (isMaximizing) {
          if (score > alpha) alpha = score;
        } else {
          if (score < beta) beta = score;
        }
        if (alpha >= beta) break;
        continue;
      }
      // Draw — stand-pat evaluation
      continue;
    }

    // Recurse: if the move gives check, search deeper; 
    // otherwise use a one-level shallower depth (already resolved captures)
    const givesCheck = g.isCheck();
    const nextDepth = givesCheck ? depth - 1 : depth - 1;
    const score = quiescenceSearch(g, alpha, beta, maximizingColor, nextDepth);

    if (isMaximizing) {
      if (score > alpha) {
        alpha = score;
      }
    } else {
      if (score < beta) {
        beta = score;
      }
    }

    if (alpha >= beta) break; // alpha-beta cutoff
  }

  return isMaximizing ? alpha : beta;
}

/**
 * Quick proxy to estimate whether a move gives check.
 * Used in QS to decide if we need to search a non-capture move further.
 * Full check detection via clone+move+isCheck is used after making the move.
 */
function isCheckProxy(game: Chess, move: { from: string; to: string }): boolean {
  // Fast heuristic: moving a piece to attack the enemy king's vicinity
  // We approximate by doing a quick clone-and-check
  const g = new Chess(game.fen());
  try {
    g.move({ from: move.from, to: move.to });
    return g.isCheck();
  } catch {
    return false;
  }
}

