import { Chess, type Move } from "chess.js";
import { PIECE_VALUES } from "./evaluate";

export type ChessMoveVerbose = Pick<
  Move,
  "from" | "to" | "promotion" | "captured" | "piece" | "color" | "san"
>;

export function mvvLvaScore(move: ChessMoveVerbose): number {
  let score = 0;

  if (move.captured) {
    const capturedValue = PIECE_VALUES[move.captured] ?? 0;
    const attackerValue = PIECE_VALUES[move.piece] ?? 0;
    score = capturedValue * 10 - attackerValue;
  }

  if (move.promotion) {
    const promoValue = PIECE_VALUES[move.promotion] ?? 0;
    score += promoValue;
  }

  return score;
}

function givesCheck(game: Chess, from: string, to: string, promotion?: string): boolean {
  try {
    const g = new Chess(game.fen());
    g.move({ from, to, promotion });
    return g.isCheck();
  } catch {
    return false;
  }
}

export function orderMoves(
  moves: ChessMoveVerbose[],
  bestMove?: ChessMoveVerbose | null,
): ChessMoveVerbose[] {
  const tactical = moves.filter((m) => m.captured || m.promotion);
  const quiet = moves.filter((m) => !m.captured && !m.promotion);

  tactical.sort((a, b) => mvvLvaScore(b) - mvvLvaScore(a));

  quiet.sort((a, b) => {
    const aScore = PIECE_VALUES[a.piece] ?? 0;
    const bScore = PIECE_VALUES[b.piece] ?? 0;
    return bScore - aScore;
  });

  const ordered = [...tactical, ...quiet];

  if (bestMove) {
    const idx = ordered.findIndex(
      (m) =>
        m.from === bestMove.from &&
        m.to === bestMove.to &&
        (m.promotion ?? null) === (bestMove.promotion ?? null),
    );
    if (idx > 0) {
      const [ttMove] = ordered.splice(idx, 1);
      ordered.unshift(ttMove);
    }
  }

  return ordered;
}

export function getOrderedMoves(
  game: Chess,
  bestMove?: { from: string; to: string; promotion?: string } | null,
): ChessMoveVerbose[] {
  const rawMoves = game.moves({ verbose: true });

  let ttBest: ChessMoveVerbose | null = null;
  if (bestMove) {
    ttBest =
      rawMoves.find(
        (m) =>
          m.from === bestMove.from &&
          m.to === bestMove.to &&
          (m.promotion ?? null) === (bestMove.promotion ?? null),
      ) ?? null;
  }

  const ordered = orderMoves(rawMoves, ttBest);

  const checkDetectionLimit = Math.min(8, ordered.length);

  for (let i = 0; i < checkDetectionLimit; i++) {
    const m = ordered[i];
    if (!m.captured && !m.promotion) {
      const moveGivesCheck = givesCheck(game, m.from, m.to, m.promotion);
      if (moveGivesCheck) {
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
