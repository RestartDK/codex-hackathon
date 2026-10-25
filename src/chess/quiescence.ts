import { Chess } from "chess.js";
import { evaluateForTurn, PIECE_VALUES } from "./evaluate";
import { orderMoves } from "./moveOrdering";
import type { ChessMoveVerbose } from "./moveOrdering";

const DELTA_PRUNE_MARGIN = PIECE_VALUES.p;

const MAX_QS_DEPTH = 8;

export function quiescenceSearch(
  game: Chess,
  alpha: number,
  beta: number,
  maximizingColor: "w" | "b",
  depth: number = MAX_QS_DEPTH,
): number {
  if (depth <= 0) {
    return evaluateForTurn(game, maximizingColor);
  }

  const standPat = evaluateForTurn(game, maximizingColor);

  if (standPat >= beta) return beta;

  if (standPat > alpha) {
    alpha = standPat;
  }

  if (game.isCheckmate()) {
    return game.turn() === maximizingColor
      ? -99999 + (MAX_QS_DEPTH - depth) * 100
      : 99999 - (MAX_QS_DEPTH - depth) * 100;
  }
  if (game.isDraw()) return standPat;

  const isMaximizing = game.turn() === maximizingColor;
  const allMoves = game.moves({ verbose: true });

  const tacticalMoves: ChessMoveVerbose[] = [];

  for (const move of allMoves) {
    if (move.captured || move.promotion) {
      tacticalMoves.push(move);
      continue;
    }
    if (isCheckProxy(game, move)) {
      tacticalMoves.push(move);
    }
  }

  if (tacticalMoves.length === 0) return standPat;

  const ordered = orderMoves(tacticalMoves);

  for (const move of ordered) {
    if (move.captured && !isCheckProxy(game, move)) {
      const capturedValue = PIECE_VALUES[move.captured] ?? 0;
      if (isMaximizing && standPat + capturedValue + DELTA_PRUNE_MARGIN < alpha) {
        continue;
      }
      if (!isMaximizing && standPat - capturedValue - DELTA_PRUNE_MARGIN > beta) {
        continue;
      }
    }

    const g = new Chess(game.fen());
    g.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });

    if (g.isGameOver()) {
      if (g.isCheckmate()) {
        const score =
          g.turn() === maximizingColor
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
      continue;
    }

    const score = quiescenceSearch(g, alpha, beta, maximizingColor, depth - 1);

    if (isMaximizing) {
      if (score > alpha) {
        alpha = score;
      }
    } else {
      if (score < beta) {
        beta = score;
      }
    }

    if (alpha >= beta) break;
  }

  return isMaximizing ? alpha : beta;
}

function isCheckProxy(game: Chess, move: { from: string; to: string }): boolean {
  const g = new Chess(game.fen());
  try {
    g.move({ from: move.from, to: move.to });
    return g.isCheck();
  } catch {
    return false;
  }
}
