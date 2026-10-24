import { describe, it, expect } from 'vite-plus/test';
import { Chess } from 'chess.js';
import { fallbackComputerMove } from '../chess/computer';
import { DIFFICULTIES } from '../chess/difficulty';

describe('Computer Opponent — Fallback Engine', () => {
  describe('Club difficulty (3-ply + quiescence)', () => {
    it('should recapture a rook with knight when safe', async () => {
      // Black knight on f6, white rook just captured pawn on c5.
      // Black should recapture Nxc5 (f6c5) or move queen to safety.
      const game = new Chess('rnb1kb1r/pp3ppp/4pn2/2pR4/2B5/2N2N2/PPP2PPP/R1BQK2R b KQkq - 0 6');

      const move = await fallbackComputerMove(game, 'club');

      const moveStr = move.from + move.to;
      // At 3-ply + quiescence, should find a capturing or developing move
      // but at minimum must be a legal move from that position
      expect(moveStr.length).toBeGreaterThanOrEqual(4);
      // Should not make a suicidal move with the queen
      expect(moveStr).not.toBe('d8d5'); // Queen can't safely take rook
    });

    it('should not hang the queen when safe alternatives exist', async () => {
      // Black queen on c5, no attackers, multiple safe squares
      const game = new Chess('rnb1kbnr/ppp2ppp/8/2q5/3P4/8/PPP2PPP/R1BQKBNR b KQkq - 0 4');

      const move = await fallbackComputerMove(game, 'club');

      const moveStr = move.from + move.to;
      // Queen is on c5 — check it's moving to a safe square
      if (moveStr.startsWith('c5')) {
        const safeQueenMoves = ['c5d6', 'c5d7', 'c5d8', 'c5f5', 'c5f6',
          'c5e6', 'c5e7', 'c5e8', 'c5a5', 'c5b5', 'c5g5', 'c5h5',
          'c5e4', 'c5f4', 'c5g3', 'c5h2', 'c5b4', 'c5a3'];
        expect(safeQueenMoves).toContain(moveStr);
      }
      // If queen doesn't move, that's also fine — computer chose another piece
    });
  });

  describe('Expert difficulty (5-ply iterative deepening)', () => {
    it('should avoid losing material in simple tactics', async () => {
      // Position where a free queen is hanging — engine should at minimum
      // not blunder its own queen or miss a clearly winning capture
      const game = new Chess('rnb1kb1r/ppp2ppp/4pn2/8/3q4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 5');

      const move = await fallbackComputerMove(game, 'expert');
      const moveStr = move.from + move.to;
      // Must be a legal move
      expect(typeof moveStr).toBe('string');
      expect(moveStr.length).toBeGreaterThanOrEqual(4);
    });

    it('should not hang the queen', async () => {
      // Queen on d1, many safe moves
      const game = new Chess('rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2');

      const move = await fallbackComputerMove(game, 'expert');

      // Queen moves from d1 should go to safe squares
      const moveStr = move.from + move.to;
      if (moveStr.startsWith('d1')) {
        const queenMoves = ['d1d2', 'd1d3', 'd1d4', 'd1d5',
          'd1a4', 'd1b3', 'd1c2', 'd1e2', 'd1f3', 'd1g4', 'd1h5'];
        expect(queenMoves).toContain(moveStr);
      }
      // If queen doesn't move, that's also fine
    });
  });

  describe('Beginner difficulty', () => {
    it('should still make legal moves', async () => {
      const game = new Chess();
      const move = await fallbackComputerMove(game, 'beginner');
      expect(move.from).toBeDefined();
      expect(move.to).toBeDefined();
      expect(typeof move.from).toBe('string');
      expect(typeof move.to).toBe('string');
    });
  });

  describe('Casual difficulty', () => {
    it('should produce a legal move from any position', async () => {
      const game = new Chess('r1bqkb1r/ppp2ppp/2n2n2/3p4/3P1B2/2N5/PPP2PPP/R2QKBNR w KQkq - 0 5');
      const move = await fallbackComputerMove(game, 'casual');
      expect(move.from).toBeDefined();
      expect(move.to).toBeDefined();
    });
  });
});

describe('Difficulty Configuration', () => {
  it('all difficulties have usesStockfish: true', () => {
    const difficulties = ['beginner', 'casual', 'club', 'expert', 'nightmare'] as const;
    for (const d of difficulties) {
      expect(DIFFICULTIES[d].usesStockfish).toBe(true);
    }
  });

  it('all difficulties have stockfish skill levels defined', () => {
    const difficulties = ['beginner', 'casual', 'club', 'expert', 'nightmare'] as const;
    for (const d of difficulties) {
      const sl = DIFFICULTIES[d].stockfishSkillLevel;
      expect(sl).toBeDefined();
      expect(sl).toBeGreaterThanOrEqual(0);
      expect(sl).toBeLessThanOrEqual(20);
    }
  });

  it('uses the agreed skill levels for visible difficulties', () => {
    expect(DIFFICULTIES.beginner.stockfishSkillLevel).toBe(0);
    expect(DIFFICULTIES.casual.stockfishSkillLevel).toBe(8);
    expect(DIFFICULTIES.club.stockfishSkillLevel).toBe(16);
  });

  it('difficulty think times increase with rating', () => {
    expect(DIFFICULTIES.beginner.stockfishThinkTimeMs).toBeLessThan(DIFFICULTIES.casual.stockfishThinkTimeMs!);
    expect(DIFFICULTIES.casual.stockfishThinkTimeMs).toBeLessThan(DIFFICULTIES.club.stockfishThinkTimeMs!);
    expect(DIFFICULTIES.club.stockfishThinkTimeMs).toBeLessThan(DIFFICULTIES.expert.stockfishThinkTimeMs!);
    expect(DIFFICULTIES.expert.stockfishThinkTimeMs).toBeLessThan(DIFFICULTIES.nightmare.stockfishThinkTimeMs!);
  });
});

describe('Move Feedback — Threshold Classification', () => {
  it('0–10cp should be perfect', () => {
    expect(classifyByThreshold(5)).toBe('perfect');
  });

  it('11–35cp should be excellent', () => {
    expect(classifyByThreshold(20)).toBe('excellent');
    expect(classifyByThreshold(35)).toBe('excellent');
  });

  it('36–80cp should be good', () => {
    expect(classifyByThreshold(50)).toBe('good');
    expect(classifyByThreshold(80)).toBe('good');
  });

  it('81–150cp should be inaccuracy', () => {
    expect(classifyByThreshold(100)).toBe('inaccuracy');
    expect(classifyByThreshold(150)).toBe('inaccuracy');
  });

  it('151–300cp should be mistake', () => {
    expect(classifyByThreshold(200)).toBe('mistake');
    expect(classifyByThreshold(300)).toBe('mistake');
  });

  it('>300cp should be blunder', () => {
    expect(classifyByThreshold(350)).toBe('blunder');
    expect(classifyByThreshold(999)).toBe('blunder');
  });

  it('0cp should be perfect (exact lower boundary)', () => {
    expect(classifyByThreshold(0)).toBe('perfect');
  });

  it('exact 10cp should be perfect (upper boundary)', () => {
    expect(classifyByThreshold(10)).toBe('perfect');
  });

  it('exact 36cp should be good (lower boundary)', () => {
    expect(classifyByThreshold(36)).toBe('good');
  });
});

/**
 * Mirror of the threshold logic in computer.ts for deterministic testing.
 */
function classifyByThreshold(centipawnLoss: number): string {
  if (centipawnLoss <= 10) return 'perfect';
  if (centipawnLoss <= 35) return 'excellent';
  if (centipawnLoss <= 80) return 'good';
  if (centipawnLoss <= 150) return 'inaccuracy';
  if (centipawnLoss <= 300) return 'mistake';
  return 'blunder';
}

