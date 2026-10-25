import { Chess } from "chess.js";
import { getTable, mirrorRows } from "./pieceSquareTables";
import type { EvalFeatures } from "./difficulty";

export const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export const PROMO_VALUE: Record<string, number> = {
  q: 900,
  r: 500,
  b: 330,
  n: 320,
};

const MOBILITY_WEIGHT = 3;

const PASSED_PAWN_BASE = 20;
const PASSED_PAWN_PER_RANK = 15;

const DOUBLED_PAWN_PENALTY = 20;

const ISOLATED_PAWN_PENALTY = 25;

const CENTRALIZED_DEV_BONUS = 20;
const BACK_RANK_DEV_PENALTY = 20;
const DEV_PER_PIECE_BONUS = 10;

const CASTLED_BONUS = 30;
const PAWN_SHIELD_MAX = 15;
const CLOSE_FILE_PENALTY = 20;
const KING_CENTER_PENALTY_MULTIPLIER = 5;

const CENTER_CONTROL_SCORE = 8;

const ENDGAME_MATERIAL_THRESHOLD = 1800;
const MIDDLEGAME_MATERIAL_THRESHOLD = 1400;

export function evaluate(game: Chess, features: EvalFeatures): number {
  const board = game.board();
  let score = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (!piece) continue;

      const value = PIECE_VALUES[piece.type] ?? 0;
      const pst = getTable(piece.type);
      const isWhite = piece.color === "w";
      const pstScore = isWhite ? pst[rank][file] : mirrorRows(pst)[rank][file];

      if (piece.color === "w") {
        score += value + pstScore;
      } else {
        score -= value + pstScore;
      }
    }
  }

  const totalNonKingMaterial = countNonKingMaterial(board);

  if (features.kingSafety) {
    if (totalNonKingMaterial > MIDDLEGAME_MATERIAL_THRESHOLD) {
      score += kingSafetyScore(board, "w");
      score -= kingSafetyScore(board, "b");
    }
  }

  if (features.mobility) {
    const whiteMobility = getMobility(game, "w");
    const blackMobility = getMobility(game, "b");
    score += (whiteMobility - blackMobility) * MOBILITY_WEIGHT;
  }

  if (features.pawnStructure) {
    score += pawnStructureScore(board, "w");
    score -= pawnStructureScore(board, "b");
  }

  if (features.development) {
    if (totalNonKingMaterial > 2000) {
      score += developmentScore(board, "w");
      score -= developmentScore(board, "b");
    }
  }

  if (features.space) {
    score += spaceScore(board, "w");
    score -= spaceScore(board, "b");
  }

  if (features.pawnStructure && features.kingSafety) {
    if (totalNonKingMaterial < ENDGAME_MATERIAL_THRESHOLD) {
      score += endgameScore(board, game, "w");
      score -= endgameScore(board, game, "b");
    }
  }

  return score;
}

export function evaluateForTurn(game: Chess, forColor: "w" | "b", features?: EvalFeatures): number {
  const ef = features ?? {
    mobility: false,
    pawnStructure: false,
    development: false,
    space: false,
    kingSafety: false,
  };
  const score = evaluate(game, ef);
  return forColor === "w" ? score : -score;
}

export function materialCount(game: Chess): { w: number; b: number } {
  const board = game.board();
  let w = 0;
  let b = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (!piece) continue;
      const val = PIECE_VALUES[piece.type] ?? 0;
      if (piece.color === "w") w += val;
      else b += val;
    }
  }

  return { w, b };
}

function getMobility(game: Chess, color: "w" | "b"): number {
  if (game.turn() === color) {
    return game.moves().length;
  }
  return countAttackedSquares(game, color);
}

function countAttackedSquares(game: Chess, color: "w" | "b"): number {
  const board = game.board();
  let count = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r]?.[f];
      if (!piece || piece.color !== color) continue;

      switch (piece.type) {
        case "n":
          count += countKnightAttacks(r, f);
          break;
        case "b":
          count += countSlidingAttacks(r, f, board, color, [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]);
          break;
        case "r":
          count += countSlidingAttacks(r, f, board, color, [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]);
          break;
        case "q":
          count += countSlidingAttacks(r, f, board, color, [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]);
          count += countSlidingAttacks(r, f, board, color, [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]);
          break;
        case "k":
          for (let dr = -1; dr <= 1; dr++) {
            for (let df = -1; df <= 1; df++) {
              if (dr === 0 && df === 0) continue;
              const nr = r + dr;
              const nf = f + df;
              if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
                count++;
              }
            }
          }
          break;
        case "p": {
          if (color === "w") {
            if (r > 0) {
              if (f > 0) count++;
              if (f < 7) count++;
            }
          } else {
            if (r < 7) {
              if (f > 0) count++;
              if (f < 7) count++;
            }
          }
          break;
        }
      }
    }
  }

  return count;
}

function countKnightAttacks(r: number, f: number): number {
  const moves = [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ];
  let count = 0;
  for (const [dr, df] of moves) {
    const nr = r + dr;
    const nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) count++;
  }
  return count;
}

function countSlidingAttacks(
  r: number,
  f: number,
  board: ReturnType<Chess["board"]>,
  color: "w" | "b",
  directions: number[][],
): number {
  let count = 0;
  for (const [dr, df] of directions) {
    let nr = r + dr;
    let nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const target = board[nr]?.[nf];
      if (!target) {
        count++;
      } else {
        if (target.color !== color) count++;
        break;
      }
      nr += dr;
      nf += df;
    }
  }
  return count;
}

function kingSafetyScore(board: ReturnType<Chess["board"]>, color: "w" | "b"): number {
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (p && p.type === "k" && p.color === color) {
        const kr = r;
        const kf = f;

        const pawnDir = color === "w" ? -1 : 1;
        for (let df = -2; df <= 2; df++) {
          const pf = f + df;
          const pr1 = r + pawnDir;
          const pr2 = r + pawnDir * 2;
          if (pf >= 0 && pf < 8 && pr1 >= 0 && pr1 < 8) {
            const pawn1 = board[pr1]?.[pf];
            if (pawn1 && pawn1.type === "p" && pawn1.color === color) {
              score += PAWN_SHIELD_MAX - Math.abs(df) * 2;
            }
          }
          if (pf >= 0 && pf < 8 && pr2 >= 0 && pr2 < 8) {
            const pawn2 = board[pr2]?.[pf];
            if (pawn2 && pawn2.type === "p" && pawn2.color === color) {
              score += PAWN_SHIELD_MAX - Math.abs(df) * 3 - 5;
            }
          }
        }

        const isCornerKing = kf <= 1 || kf >= 6;
        const hasFrontPawns =
          r + pawnDir >= 0 &&
          r + pawnDir < 8 &&
          board[r + pawnDir]?.[kf]?.type === "p" &&
          board[r + pawnDir]?.[kf]?.color === color;
        if (isCornerKing && hasFrontPawns) {
          score += CASTLED_BONUS;
        }

        for (let df = -1; df <= 1; df++) {
          const checkF = kf + df;
          if (checkF >= 0 && checkF < 8) {
            for (let rr = 0; rr < 8; rr++) {
              const p2 = board[rr]?.[checkF];
              if (p2 && (p2.type === "r" || p2.type === "q") && p2.color !== color) {
                score -= CLOSE_FILE_PENALTY;
                break;
              }
              if (p2 && p2.type === "k" && p2.color === color) {
                break;
              }
            }
          }
        }

        const centerDist = Math.abs(kf - 3.5) + Math.abs(kr - 3.5);
        score -= centerDist * KING_CENTER_PENALTY_MULTIPLIER;

        break;
      }
    }
  }

  return Math.max(score, -200);
}

function pawnStructureScore(board: ReturnType<Chess["board"]>, color: "w" | "b"): number {
  let score = 0;
  const pawnFiles: number[] = [];
  const pawnRanks: number[] = [];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (p && p.type === "p" && p.color === color) {
        pawnFiles.push(f);
        pawnRanks.push(color === "w" ? r : 7 - r);
      }
    }
  }

  const fileCounts = new Map<number, number>();
  for (const f of pawnFiles) {
    fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
  }
  for (const count of fileCounts.values()) {
    if (count > 1) {
      score -= DOUBLED_PAWN_PENALTY * (count - 1);
    }
  }

  for (const f of pawnFiles) {
    const hasAdjacent = fileCounts.has(f - 1) || fileCounts.has(f + 1);
    if (!hasAdjacent) {
      score -= ISOLATED_PAWN_PENALTY;
    }
  }

  for (let i = 0; i < pawnFiles.length; i++) {
    const f = pawnFiles[i];
    const rank = pawnRanks[i];

    const hasEnemyPawn = hasEnemyPawnOnFiles(board, color, f, rank);

    if (!hasEnemyPawn) {
      if (rank >= 3) {
        score += PASSED_PAWN_BASE + (rank - 3) * PASSED_PAWN_PER_RANK;
      }
    }
  }

  return score;
}

function hasEnemyPawnOnFiles(
  board: ReturnType<Chess["board"]>,
  color: "w" | "b",
  file: number,
  rank: number,
): boolean {
  const enemyColor = color === "w" ? "b" : "w";
  const startRank = color === "w" ? 0 : rank + 1;
  const endRank = color === "w" ? rank : 7;

  for (let f = file - 1; f <= file + 1; f++) {
    if (f < 0 || f >= 8) continue;
    for (let r = startRank; r <= endRank; r++) {
      const p = board[r]?.[f];
      if (p && p.type === "p" && p.color === enemyColor) {
        return true;
      }
    }
  }
  return false;
}

function developmentScore(board: ReturnType<Chess["board"]>, color: "w" | "b"): number {
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (!p || p.color !== color) continue;

      if (p.type === "n" || p.type === "b") {
        const isCentralized =
          f >= 2 && f <= 5 && r >= (color === "w" ? 2 : 4) && r <= (color === "w" ? 5 : 2);
        if (isCentralized) {
          score += CENTRALIZED_DEV_BONUS;
        }

        const backRank = color === "w" ? 7 : 0;
        if (r === backRank) {
          score -= BACK_RANK_DEV_PENALTY;
        }
      }
    }
  }

  const backRank = color === "w" ? 7 : 0;
  let piecesOnBackRank = 0;
  let totalPieces = 0;
  for (let f = 0; f < 8; f++) {
    const p = board[backRank]?.[f];
    if (
      p &&
      p.color === color &&
      (p.type === "n" || p.type === "b" || p.type === "r" || p.type === "q")
    ) {
      totalPieces++;
      piecesOnBackRank++;
    }
  }

  const developed = totalPieces - piecesOnBackRank;
  score += developed * DEV_PER_PIECE_BONUS;

  return score;
}

function spaceScore(board: ReturnType<Chess["board"]>, color: "w" | "b"): number {
  let score = 0;

  const centerSquares: [number, number][] = [
    [3, 4],
    [4, 4],
    [3, 3],
    [4, 3],
    [2, 4],
    [5, 4],
    [2, 3],
    [5, 3], // extended center
  ];

  for (const [r, f] of centerSquares) {
    const p = board[r]?.[f];
    if (p) {
      if (p.color === color) {
        score += CENTER_CONTROL_SCORE;
      } else {
        score -= CENTER_CONTROL_SCORE;
      }
    }
    // Empty center squares are neutral — no bonus for attack potential
  }

  return score;
}

function endgameScore(board: ReturnType<Chess["board"]>, _game: Chess, color: "w" | "b"): number {
  let score = 0;

  score += endgameKingCentralization(board, color);

  score += rookOpenFileBonus(board, color);

  score += oppositeBishopAdjustment(board);

  score += extraPassedPawnEndgame(board, color);

  return score;
}

function endgameKingCentralization(board: ReturnType<Chess["board"]>, color: "w" | "b"): number {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (p && p.type === "k" && p.color === color) {
        const distFromCenter = Math.abs(f - 3.5) + Math.abs(r - 3.5);
        return Math.round((4.5 - distFromCenter) * 7);
      }
    }
  }
  return 0;
}

function rookOpenFileBonus(board: ReturnType<Chess["board"]>, color: "w" | "b"): number {
  let bonus = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (p && p.type === "r" && p.color === color) {
        let hasOwnPawn = false;
        let hasEnemyPawn = false;
        for (let rr = 0; rr < 8; rr++) {
          const sq = board[rr]?.[f];
          if (sq?.type === "p") {
            if (sq.color === color) hasOwnPawn = true;
            else hasEnemyPawn = true;
          }
        }
        if (!hasOwnPawn && !hasEnemyPawn) {
          bonus += 15;
        } else if (!hasOwnPawn) {
          bonus += 10;
        }
      }
    }
  }

  return bonus;
}

function oppositeBishopAdjustment(board: ReturnType<Chess["board"]>): number {
  const bishopColors: { w: string[]; b: string[] } = { w: [], b: [] };
  let bishopCount = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (p && p.type === "b") {
        const squareColor = (r + f) % 2 === 0 ? "light" : "dark";
        bishopColors[p.color].push(squareColor);
        bishopCount++;
      }
    }
  }

  if (bishopCount >= 2 && bishopColors.w.length > 0 && bishopColors.b.length > 0) {
    const allWhiteSame = bishopColors.w.every((c) => c === bishopColors.w[0]);
    const allBlackSame = bishopColors.b.every((c) => c === bishopColors.b[0]);
    const differentColor = allWhiteSame && allBlackSame && bishopColors.w[0] !== bishopColors.b[0];

    if (differentColor) {
      let nonPawnMaterial = 0;
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const p = board[r]?.[f];
          if (p && p.type !== "p" && p.type !== "k" && p.type !== "b") {
            nonPawnMaterial += PIECE_VALUES[p.type] ?? 0;
          }
        }
      }

      if (nonPawnMaterial < 200) {
        return -50;
      }
    }
  }

  return 0;
}

function extraPassedPawnEndgame(board: ReturnType<Chess["board"]>, color: "w" | "b"): number {
  let bonus = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (p && p.type === "p" && p.color === color) {
        const rank = color === "w" ? r : 7 - r;
        const enemyColor = color === "w" ? "b" : "w";
        let blocked = false;
        let enemyPawnInPath = false;

        for (let ff = f - 1; ff <= f + 1; ff++) {
          if (ff < 0 || ff >= 8) continue;
          const start = color === "w" ? 0 : rank + 1;
          const end = color === "w" ? rank : 7;
          for (let rr = start; rr <= end; rr++) {
            const sq = board[rr]?.[ff];
            if (sq && sq.type === "p" && sq.color === enemyColor) {
              blocked = true;
              enemyPawnInPath = true;
              break;
            }
          }
          if (enemyPawnInPath) break;
        }

        if (!blocked && rank >= 3) {
          bonus += (rank - 2) * 10;
        }
      }
    }
  }

  return bonus;
}

function countNonKingMaterial(board: ReturnType<Chess["board"]>): number {
  let total = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r]?.[f];
      if (p && p.type !== "k") {
        total += PIECE_VALUES[p.type] ?? 0;
      }
    }
  }
  return total;
}
