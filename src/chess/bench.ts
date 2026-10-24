/**
 * Chess engine benchmark utility.
 *
 * Measures nodes searched, search depth, and time per move
 * across multiple test positions and difficulty levels.
 *
 * Usage (development only — run in Node):
 *   npx tsx src/chess/bench.ts [casual|club|expert]
 *
 * The benchmarks use the async getComputerMove function and
 * test across multiple positions at the requested difficulty.
 */

import { Chess } from 'chess.js';
import type { Difficulty } from './difficulty';

export interface BenchmarkResult {
  position: string;
  label: string;
  difficulty: string;
  bestMove: string;
  timeMs: number;
  status: 'ok' | 'timeout' | 'error';
}

const TEST_POSITIONS: { fen: string; label: string }[] = [
  {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    label: 'Starting position',
  },
  {
    fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
    label: 'Scholar\'s mate (black to move)',
  },
  {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 4',
    label: 'Italian Game position',
  },
  {
    fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 0 7',
    label: 'Giuoco Piano (castled)',
  },
  {
    fen: '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1',
    label: 'Rook check (single piece)',
  },
  {
    fen: '8/3k4/8/3P4/3K4/8/8/8 w - - 0 1',
    label: 'King and pawn endgame',
  },
];

/**
 * Run benchmarks for all test positions at a given difficulty.
 */
export async function runBenchmark(
  difficulty: Difficulty,
  positions: { fen: string; label: string }[] = TEST_POSITIONS
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const timeoutMs = difficulty === 'expert' ? 5000 : difficulty === 'club' ? 3000 : 1000;

  for (const { fen, label } of positions) {
    const game = new Chess(fen);
    const { getComputerMove } = await import('./computer');

    const start = performance.now();
    let status: BenchmarkResult['status'] = 'ok';

    let bestMove: string;
    try {
      const result = await Promise.race([
        (async () => {
          const move = await getComputerMove(game, difficulty);
          return `${move.from}${move.to}${move.promotion ?? ''}`;
        })(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Search timeout')), timeoutMs)
        ),
      ]);
      bestMove = result;
    } catch (err) {
      status = err instanceof Error && err.message === 'Search timeout' ? 'timeout' : 'error';
      bestMove = err instanceof Error ? err.message : 'unknown error';
    }

    const elapsed = performance.now() - start;

    results.push({
      position: fen,
      label,
      difficulty,
      bestMove,
      timeMs: Math.round(elapsed),
      status,
    });

    // Brief pause between positions to let GC breathe
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

/**
 * Print benchmark results as a formatted table.
 */
export function printBenchmarkResults(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('  CHESS ENGINE BENCHMARK');
  console.log('='.repeat(80));

  if (results.length === 0) {
    console.log('\n  No results to display.\n');
    return;
  }

  // Group by difficulty
  const grouped = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (!grouped.has(r.difficulty)) grouped.set(r.difficulty, []);
    grouped.get(r.difficulty)!.push(r);
  }

  for (const [difficulty, group] of grouped) {
    console.log(`\n  ┌─ ${difficulty.toUpperCase()} ─────────────────────────────────────────────┐`);
    for (const r of group) {
      const statusIcon = r.status === 'ok' ? '✓' : r.status === 'timeout' ? '⚠' : '✗';
      const paddedLabel = r.label.padEnd(40).slice(0, 40);
      console.log(`  │ ${statusIcon} ${paddedLabel} ${r.bestMove.slice(0, 8).padEnd(8)} ${r.timeMs}ms`);
    }
    const items = group.filter(r => r.status === 'ok');
    const avg = items.length > 0 ? items.reduce((s, r) => s + r.timeMs, 0) / items.length : 0;
    console.log(`  │`);
    console.log(`  │ Average (ok): ${Math.round(avg)}ms`);
    console.log(`  └${'─'.repeat(56)}┘`);
  }

  // Summary
  const totalOk = results.filter(r => r.status === 'ok').length;
  const totalTimeout = results.filter(r => r.status === 'timeout').length;
  const totalError = results.filter(r => r.status === 'error').length;
  const totalTime = results.reduce((s, r) => s + (r.status === 'ok' ? r.timeMs : 0), 0);

  console.log('\n  ── Summary ─────────────────────────────────────────────────');
  console.log(`  Total positions:  ${results.length}`);
  console.log(`  Completed:        ${totalOk}`);
  console.log(`  Timeouts:         ${totalTimeout}`);
  console.log(`  Errors:           ${totalError}`);
  console.log(`  Total time (ok):  ${totalTime}ms`);
  console.log('='.repeat(80));
}

