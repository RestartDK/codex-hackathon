import { Chess } from 'chess.js';
import type { Square as ChessSquare, Move as ChessMove } from 'chess.js';
import type { Difficulty } from './difficulty';
import { DIFFICULTIES } from './difficulty';
import { evaluateForTurn } from './evaluate';
import { getTable, mirrorRows } from './pieceSquareTables';
import { quiescenceSearch } from './quiescence';
import { getOrderedMoves } from './moveOrdering';
import { TranspositionTable, NodeType } from './transpositionTable';
import { openingBook } from './openingBook';
import {
  recordDebug,
  clearDebug,
  isDebugEnabled,
} from './engineDebug';
import type { StockfishEngine, StockfishAnalysis } from './stockfish';

/** A move result with source and destination squares */
export interface SquareMove {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

/** Delay before computer moves (in ms) — gives natural feel */
export const COMPUTER_DELAY_MS = 500;

// ── Stockfish-backed computer move ─────────────────────────────────

/**
 * Get a computer move for the given difficulty.
 * Uses Stockfish if available, falls back to the custom engine.
 */
export async function getComputerMove(
  game: Chess,
  difficulty: Difficulty,
  stockfishEngine?: StockfishEngine | null
): Promise<SquareMove> {
  // Try Stockfish first
  if (stockfishEngine?.isReady) {
    const sfMove = await getStockfishComputerMove(game, difficulty, stockfishEngine);
    if (sfMove) return sfMove;
  }

  // Fallback: custom engine
  return fallbackComputerMove(game, difficulty);
}

/**
 * Get a Stockfish move for the current position with proper skill/time configuration.
 * Returns null if Stockfish produces no move.
 */
export async function getStockfishComputerMove(
  game: Chess,
  difficulty: Difficulty,
  engine: StockfishEngine
): Promise<SquareMove | null> {
  // Check opening book first (except Beginner)
  if (difficulty !== 'beginner') {
    const bookMove = getBookMove(game, difficulty);
    if (bookMove) return bookMove;
  }

  // Configure Stockfish for this difficulty
  const config = DIFFICULTIES[difficulty];
  if (config.stockfishSkillLevel !== undefined) {
    engine.setSkillLevel(config.stockfishSkillLevel);
  }
  const thinkTime = config.stockfishThinkTimeMs ?? 2000;

  // Use promisified analysis — depth derived from think time
  const analysis = await getStockfishBestMove(game.fen(), engine, thinkTime);
  if (analysis) return analysis;

  return null;
}

/**
 * Promisified Stockfish analysis: send `go depth N` and resolve with best move.
 * StockfishEngine.analyze() already returns a Promise<StockfishAnalysis>.
 */
export async function getStockfishBestMove(
  fen: string,
  engine: StockfishEngine,
  thinkTimeMs: number
): Promise<SquareMove | null> {
  // Map think time to a reasonable depth: ~150ms per ply
  const depth = Math.max(6, Math.min(18, Math.round(thinkTimeMs / 150)));

  try {
    const analysis: StockfishAnalysis = await engine.analyze(fen, depth);
    if (!analysis.bestMove) return null;

    const uci = analysis.bestMove;
    const from = uci.substring(0, 2) as ChessSquare;
    const to = uci.substring(2, 4) as ChessSquare;
    const promotion = uci.length > 4
      ? (uci[4] as 'q' | 'r' | 'b' | 'n')
      : undefined;

    return { from, to, promotion };
  } catch {
    return null;
  }
}

// ── Move Feedback Computation ────────────────────────────────────

/**
 * Compute move quality feedback by comparing Stockfish evaluations
 * before and after a human's move.
 */
export async function computeMoveFeedback(
  fenBefore: string,
  fenAfter: string,
  playerColor: 'w' | 'b',
  engine: StockfishEngine,
  isBook: boolean
): Promise<{
  tag: 'book' | 'perfect' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
  centipawnLoss: number;
  evalBefore: number;
  evalAfter: number;
} | null> {
  // Book moves get an automatic tag
  if (isBook) {
    return { tag: 'book', centipawnLoss: 0, evalBefore: 0, evalAfter: 0 };
  }

  if (!engine?.isReady) return null;

  try {
    // Evaluate position before the move (depth 12 is fast and accurate enough)
    const before = await engine.analyze(fenBefore, 12);
    const after = await engine.analyze(fenAfter, 12);

    // Stockfish scores from the side-to-move's perspective.
    // We want scores from the *mover's* perspective (positive = good for them).
    let evalBefore = before.score;
    let evalAfter = after.score;

    if (playerColor === 'w') {
      // before: white to move, eval is from white's perspective ✓
      // after: black to move, eval is from black's perspective — negate for white
      evalAfter = -evalAfter;
    } else {
      // before: black to move, eval is from black's perspective
      // but our convention is positive = good for the mover, so ✓
      evalBefore = -evalBefore; // positive = good for mover (black)
      // after: white to move, eval is from white's perspective — negate for black
      evalAfter = -evalAfter;
    }

    // Centipawn loss: how much the evaluation worsened from the mover's perspective
    const centipawnLoss = Math.max(0, evalBefore - evalAfter);

    // Handle mate scores — dramatic swings are blunders
    if (Math.abs(before.score) >= 90000 || Math.abs(after.score) >= 90000) {
      if (centipawnLoss > 100) {
        return { tag: 'blunder', centipawnLoss, evalBefore, evalAfter };
      }
    }

    // Classify using threshold table
    let tag: 'perfect' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
    if (centipawnLoss <= 10) {
      tag = 'perfect';
    } else if (centipawnLoss <= 35) {
      tag = 'excellent';
    } else if (centipawnLoss <= 80) {
      tag = 'good';
    } else if (centipawnLoss <= 150) {
      tag = 'inaccuracy';
    } else if (centipawnLoss <= 300) {
      tag = 'mistake';
    } else {
      tag = 'blunder';
    }

    return { tag, centipawnLoss, evalBefore, evalAfter };
  } catch {
    return null;
  }
}

// ── Fallback: custom engine (used when Stockfish is unavailable) ───

/**
 * Fallback computer move using the handcrafted engine.
 */
export async function fallbackComputerMove(
  game: Chess,
  difficulty: Difficulty
): Promise<SquareMove> {
  await delay(300 + Math.random() * 500);

  const moves = game.moves({ verbose: true });
  if (moves.length === 0) {
    throw new Error('No legal moves available');
  }

  if (isDebugEnabled()) clearDebug();

  // Opening book
  if (difficulty !== 'beginner') {
    const bookMove = getBookMove(game, difficulty);
    if (bookMove) {
      if (isDebugEnabled()) recordDebug({ difficulty, fen: game.fen(), openingBookHit: true });
      return bookMove;
    }
  }

  let selected: SquareMove;

  switch (difficulty) {
    case 'beginner': selected = beginnerMove(game, moves); break;
    case 'casual':   selected = casualMove(game, moves); break;
    case 'club':     selected = clubMove(game); break;
    case 'expert':   selected = expertMove(game); break;
    default:         selected = beginnerMove(game, moves);
  }

  return selected;
}

// ── Opening Book ─────────────────────────────────────────────────

function getBookMove(game: Chess, difficulty: Difficulty): SquareMove | null {
  const history = game.history({ verbose: true });
  const uciHistory = history.map(m => m.from + m.to);

  let bookPlyLimit: number;
  switch (difficulty) {
    case 'casual': bookPlyLimit = 4; break;
    case 'club':   bookPlyLimit = 6; break;
    case 'expert': bookPlyLimit = 10; break;
    default: return null;
  }

  if (uciHistory.length >= bookPlyLimit) return null;

  const move = openingBook.getBookMove(uciHistory);
  if (!move) return null;

  return {
    from: move.slice(0, 2) as ChessSquare,
    to: move.slice(2, 4) as ChessSquare,
    promotion: move.length === 5 ? move[4] as 'q' | 'r' | 'b' | 'n' : undefined,
  };
}

// ── Fallback Engine Constants ────────────────────────────────────

const CLUB_MAX_NODES = 150000;
const EXPERT_NODES_PER_ITERATION = 200000;

let nodeCount = 0;
function resetNodeCount(): void { nodeCount = 0; }
function checkNodeBudget(maxNodes: number): boolean {
  nodeCount++;
  return nodeCount <= maxNodes;
}

// ── Beginner: weighted random ────────────────────────────────────

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

function beginnerMove(game: Chess, moves: ChessMove[]): SquareMove {
  if (Math.random() < 0.2) return pickRandom(moves);

  const scored = moves.map((m) => {
    let score = 0;
    if (m.captured) score += (PIECE_VALUES[m.captured] ?? 0) * 0.5;
    if (['d', 'e'].includes(m.to[0]) && ['4', '5'].includes(m.to[1])) score += 15;
    const piece = game.get(m.from);
    if (piece) {
      const pst = getTable(piece.type);
      const rank = 8 - parseInt(m.to[1]);
      const file = m.to.charCodeAt(0) - 97;
      if (piece.color === 'w') {
        score += pst[rank]?.[file] ?? 0;
      } else {
        score += mirrorRows(pst)[rank]?.[file] ?? 0;
      }
    }
    if (m.promotion === 'q') score += 800;
    return { move: m, score: Math.max(0, score + 50) };
  });

  return weightedRandom(scored);
}

// ── Casual: 1-ply ───────────────────────────────────────────────

function casualMove(game: Chess, moves: ChessMove[]): SquareMove {
  const ef = { mobility: true, pawnStructure: false, development: true, space: false, kingSafety: true };
  let bestMove: ChessMove | null = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const g = new Chess(game.fen());
    g.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
    const score = evaluateForTurn(g, game.turn() as 'w' | 'b', ef);
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }

  return bestMove ? moveToSquareMove(bestMove) : pickRandom(moves);
}

// ── Club: 3-ply + quiescence ─────────────────────────────────────

function clubMove(game: Chess): SquareMove {
  const depth = 3;
  const maximizingColor = game.turn() as 'w' | 'b';
  resetNodeCount();
  const orderedMoves = getOrderedMoves(game);
  let bestMove: { from: string; to: string; promotion?: string } | null = null;
  let bestScore = -Infinity;

  for (const move of orderedMoves) {
    game.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
    const score = minimaxWithQs(game, depth - 1, -Infinity, Infinity, maximizingColor, depth - 1, CLUB_MAX_NODES);
    game.undo();
    if (score > bestScore) { bestScore = score; bestMove = { from: move.from, to: move.to, promotion: move.promotion }; }
  }

  if (!bestMove) return pickRandom(game.moves({ verbose: true }));
  return { from: bestMove.from as ChessSquare, to: bestMove.to as ChessSquare, promotion: bestMove.promotion as 'q' | 'r' | 'b' | 'n' | undefined };
}

// ── Expert: iterative deepening + TT ──────────────────────────────

const expertTT = new TranspositionTable();

function expertMove(game: Chess): SquareMove {
  const maximizingColor = game.turn() as 'w' | 'b';
  expertTT.clear();
  resetNodeCount();
  const startTime = Date.now();
  const maxTime = 2500;
  const maxDepth = 5;

  let bestMove: { from: string; to: string; promotion?: string } | null = null;

  for (let currentDepth = 1; currentDepth <= maxDepth; currentDepth++) {
    expertTT.newIteration();
    resetNodeCount();
    const result = searchRoot(game, currentDepth, maximizingColor, startTime, maxTime, EXPERT_NODES_PER_ITERATION);
    if (result.timedOut || result.nodeBudgetExceeded) break;
    bestMove = result.bestMove;
    if (Date.now() - startTime > maxTime * 0.8) break;
  }

  if (!bestMove) return pickRandom(game.moves({ verbose: true }));
  return { from: bestMove.from as ChessSquare, to: bestMove.to as ChessSquare, promotion: bestMove.promotion as 'q' | 'r' | 'b' | 'n' | undefined };
}

// ── Utility ──────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom(moves: ChessMove[]): SquareMove {
  return moveToSquareMove(moves[Math.floor(Math.random() * moves.length)]);
}

function weightedRandom(scored: { move: ChessMove; score: number }[]): SquareMove {
  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  let rand = Math.random() * totalScore;
  for (const { move, score } of scored) {
    rand -= score;
    if (rand <= 0) return moveToSquareMove(move);
  }
  return moveToSquareMove(scored[scored.length - 1].move);
}

function moveToSquareMove(move: ChessMove): SquareMove {
  return {
    from: move.from as ChessSquare,
    to: move.to as ChessSquare,
    promotion: move.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
  };
}

// ── Core Search Functions (fallback engine) ───────────────────────

function minimaxWithQs(
  game: Chess, depth: number, alpha: number, beta: number,
  maximizingColor: 'w' | 'b', qsDepth: number, maxNodes: number
): number {
  if (!checkNodeBudget(maxNodes)) return evaluateForTurn(game, maximizingColor);
  const isMaximizing = game.turn() === maximizingColor;
  if (game.isCheckmate()) return isMaximizing ? -99999 + (10 - depth) * 100 : 99999 - (10 - depth) * 100;
  if (game.isDraw()) return 0;
  if (depth <= 0) return quiescenceSearch(game, alpha, beta, maximizingColor);

  const moves = getOrderedMoves(game);
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
      const score = minimaxWithQs(game, depth - 1, alpha, beta, maximizingColor, qsDepth, maxNodes);
      maxEval = Math.max(maxEval, score);
      alpha = Math.max(alpha, score);
      game.undo();
      if (beta <= alpha) break;
    }
    return maxEval === -Infinity ? quiescenceSearch(game, alpha, beta, maximizingColor) : maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
      const score = minimaxWithQs(game, depth - 1, alpha, beta, maximizingColor, qsDepth, maxNodes);
      minEval = Math.min(minEval, score);
      beta = Math.min(beta, score);
      game.undo();
      if (beta <= alpha) break;
    }
    return minEval === Infinity ? quiescenceSearch(game, alpha, beta, maximizingColor) : minEval;
  }
}

interface RootSearchResult {
  bestMove: { from: string; to: string; promotion?: string } | null;
  score: number;
  timedOut: boolean;
  nodeBudgetExceeded: boolean;
}

function searchRoot(
  game: Chess, depth: number, maximizingColor: 'w' | 'b',
  startTime: number, maxTime: number, maxNodes: number
): RootSearchResult {
  const ttBest = expertTT.getBestMove(game.fen());
  const orderedMoves = getOrderedMoves(game, ttBest);
  let bestMove: { from: string; to: string; promotion?: string } | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of orderedMoves) {
    if (Date.now() - startTime > maxTime) return { bestMove, score: bestScore, timedOut: true, nodeBudgetExceeded: false };
    game.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
    const score = alphaBetaWithTT(game, depth - 1, alpha, beta, maximizingColor, depth - 1, expertTT, startTime, maxTime, maxNodes);
    game.undo();
    if (score > bestScore) { bestScore = score; bestMove = { from: move.from, to: move.to, promotion: move.promotion }; }
    alpha = Math.max(alpha, score);
  }

  if (bestMove) expertTT.store(game.fen(), depth, bestScore, NodeType.Exact, bestMove);
  return { bestMove, score: bestScore, timedOut: false, nodeBudgetExceeded: false };
}

function alphaBetaWithTT(
  game: Chess, depth: number, alpha: number, beta: number,
  maximizingColor: 'w' | 'b', qsDepth: number,
  tt: TranspositionTable, startTime: number, maxTime: number, maxNodes: number
): number {
  if (!checkNodeBudget(maxNodes)) return evaluateForTurn(game, maximizingColor);
  const isMaximizing = game.turn() === maximizingColor;
  if (game.isCheckmate()) return isMaximizing ? -99999 + (10 - depth) * 100 : 99999 - (10 - depth) * 100;
  if (game.isDraw()) return 0;
  if (depth <= 0) return quiescenceSearch(game, alpha, beta, maximizingColor);

  const ttEntry = tt.probe(game.fen(), 0);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.nodeType === NodeType.Exact) return ttEntry.score;
    if (ttEntry.nodeType === NodeType.LowerBound) alpha = Math.max(alpha, ttEntry.score);
    if (ttEntry.nodeType === NodeType.UpperBound) beta = Math.min(beta, ttEntry.score);
    if (alpha >= beta) return ttEntry.score;
  }

  const moves = getOrderedMoves(game, ttEntry ? { from: ttEntry.bestFrom ?? '', to: ttEntry.bestTo ?? '', promotion: ttEntry.bestPromotion } : undefined);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      if (Date.now() - startTime > maxTime) return maxEval === -Infinity ? 0 : maxEval;
      game.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
      const score = alphaBetaWithTT(game, depth - 1, alpha, beta, maximizingColor, qsDepth, tt, startTime, maxTime, maxNodes);
      maxEval = Math.max(maxEval, score);
      alpha = Math.max(alpha, score);
      game.undo();
      if (beta <= alpha) break;
    }
    if (maxEval === -Infinity) return quiescenceSearch(game, alpha, beta, maximizingColor);
    const nodeType: import('./transpositionTable').NodeType =
      maxEval <= alpha ? NodeType.UpperBound :
      maxEval >= beta  ? NodeType.LowerBound :
      NodeType.Exact;
    tt.store(game.fen(), depth, maxEval, nodeType);
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      if (Date.now() - startTime > maxTime) return minEval === Infinity ? 0 : minEval;
      game.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
      const score = alphaBetaWithTT(game, depth - 1, alpha, beta, maximizingColor, qsDepth, tt, startTime, maxTime, maxNodes);
      minEval = Math.min(minEval, score);
      beta = Math.min(beta, score);
      game.undo();
      if (beta <= alpha) break;
    }
    if (minEval === Infinity) return quiescenceSearch(game, alpha, beta, maximizingColor);
    const nodeType: import('./transpositionTable').NodeType =
      minEval <= alpha ? NodeType.UpperBound :
      minEval >= beta  ? NodeType.LowerBound :
      NodeType.Exact;
    tt.store(game.fen(), depth, minEval, nodeType);
    return minEval;
  }
}

