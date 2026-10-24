import { describe, expect, it } from 'vitest';
import {
  chooseComputerToken,
  chooseStrategicToken,
  chooseToken,
  continueTurn,
  correctLastMove,
  createLudoState,
  deserializeLudo,
  isSafeSquare,
  isTokenThreatened,
  legalTokenIds,
  rankStrategicMoves,
  roll,
  serializeLudo,
} from './ludo';

function dice(...values: number[]) {
  let index = 0;
  return { nextDie: () => values[index++] ?? 1 };
}

describe('Ludo rules engine', () => {
  it('requires a six to leave base and records an exact token move', () => {
    const state = createLudoState();
    expect(roll(state, dice(6))).toMatchObject({ ok: true, roll: 6 });
    expect(state.lastRoll).toEqual({ player: 'human', value: 6 });
    expect(legalTokenIds(state)).toEqual([1, 2, 3, 4]);
    const result = chooseToken(state, 2);
    expect(result.ok).toBe(true);
    expect(state.tokens.human[1].progress).toBe(0);
    expect(state.history[0]).toMatchObject({ tokenId: 2, entered: true, roll: 6 });
  });

  it('supports correction with the same die and clears it on continue', () => {
    const state = createLudoState();
    roll(state, dice(6));
    chooseToken(state, 1);
    expect(state.phase).toBe('awaiting-roll');
    // A six grants a bonus roll; correct remains available until that roll.
    expect(correctLastMove(state)).toMatchObject({ ok: true });
    expect(state.tokens.human[0].progress).toBe(-1);
    expect(state.currentRoll).toBe(6);
    chooseToken(state, 2);
    expect(state.phase).toBe('awaiting-roll');
    expect(state.correction).not.toBeNull();
    expect(continueTurn(state).ok).toBe(false);
  });

  it('captures every opposing token on an unsafe square and grants a bonus', () => {
    const state = createLudoState();
    state.tokens.human[0].progress = 4;
    state.tokens.computer[0].progress = 32;
    state.tokens.computer[1].progress = 32;
    roll(state, dice(2));
    const result = chooseToken(state, 1);
    expect(result.ok).toBe(true);
    expect(result.ok && result.move.captured).toEqual([1, 2]);
    expect(state.tokens.computer.slice(0, 2).every((token) => token.progress === -1)).toBe(true);
    expect(state.phase).toBe('awaiting-roll');
  });

  it('does not capture on safe squares and exact finish is required', () => {
    expect(isSafeSquare(0)).toBe(true);
    const state = createLudoState();
    state.tokens.human[0].progress = 55;
    state.tokens.human[1].progress = 54;
    state.tokens.human[2].progress = 54;
    state.tokens.human[3].progress = 54;
    state.tokens.computer[0].progress = 3;
    roll(state, dice(6));
    expect(state.phase).toBe('awaiting-roll');
    roll(state, dice(2));
    expect(chooseToken(state, 1).ok).toBe(true);
    expect(state.tokens.computer[0].progress).toBe(3);
    expect(state.tokens.human[0].progress).toBe(57);
    expect(state.phase).toBe('awaiting-roll');
  });

  it('ends the turn on a third consecutive six without moving', () => {
    const state = createLudoState();
    roll(state, dice(6)); chooseToken(state, 1);
    roll(state, dice(6)); chooseToken(state, 2);
    expect(roll(state, dice(6))).toMatchObject({ ok: true, roll: 6 });
    expect(state.activePlayer).toBe('computer');
    expect(state.phase).toBe('awaiting-roll');
    expect(state.tokens.human.every((token) => token.progress <= 0)).toBe(true);
  });

  it('chooses legal computer moves and round-trips a save', () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.phase = 'awaiting-token';
    state.currentRoll = 6;
    expect(chooseComputerToken(state)).toBe(1);
    const restored = deserializeLudo(serializeLudo(state));
    expect(restored).toEqual(state);
  });

  it('records the computer die result atomically when its roll passes the turn', () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    expect(roll(state, dice(2))).toMatchObject({ ok: true, roll: 2 });
    expect(state.activePlayer).toBe('human');
    expect(state.lastRoll).toEqual({ player: 'computer', value: 2 });
  });

  it('keeps control with the computer after the human correction window closes', () => {
    const state = createLudoState();
    state.tokens.human[0].progress = 0;
    roll(state, dice(1));
    chooseToken(state, 1);
    expect(state.activePlayer).toBe('computer');
    expect(state.phase).toBe('awaiting-continue');
    continueTurn(state);
    expect(state.activePlayer).toBe('computer');
    expect(state.phase).toBe('computer-turn');
    expect(roll(state, dice(6))).toMatchObject({ ok: true, roll: 6 });
    expect(state.phase).toBe('awaiting-token');
    expect(legalTokenIds(state, 'computer')).toEqual([1, 2, 3, 4]);
  });

  it('prioritizes a computer capture over an ordinary advance', () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.phase = 'awaiting-token';
    state.currentRoll = 2;
    state.tokens.computer[0].progress = 4;
    state.tokens.computer[1].progress = 20;
    state.tokens.human[0].progress = 32;
    expect(rankStrategicMoves(state, 'computer')[0]).toMatchObject({ tokenId: 1, reason: 'capture' });
    expect(chooseComputerToken(state)).toBe(1);
  });

  it('moves a threatened computer token to safety when no capture is available', () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.phase = 'awaiting-token';
    state.currentRoll = 3;
    state.tokens.computer[0].progress = 10;
    state.tokens.computer[1].progress = 20;
    state.tokens.human[0].progress = 32;
    expect(isTokenThreatened(state, 'computer', 10)).toBe(true);
    expect(rankStrategicMoves(state, 'computer')[0]).toMatchObject({ tokenId: 1, reason: 'escape' });
  });

  it('finishes a token exactly before choosing lower-value moves', () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.phase = 'awaiting-token';
    state.currentRoll = 2;
    state.tokens.computer[0].progress = 55;
    state.tokens.computer[1].progress = 10;
    expect(rankStrategicMoves(state, 'computer')[0]).toMatchObject({ tokenId: 1, reason: 'finish' });
  });

  it('plays complete deterministic matches without stalling or making illegal moves', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      let value = seed;
      const random = { nextDie: () => {
        value = (value * 1_664_525 + 1_013_904_223) >>> 0;
        return value % 6 + 1;
      } };
      const state = createLudoState();
      let actions = 0;
      while (!state.result && actions < 20_000) {
        if (state.phase === 'awaiting-continue') {
          expect(continueTurn(state).ok).toBe(true);
        } else if (state.phase === 'awaiting-roll' || state.phase === 'computer-turn') {
          expect(roll(state, random).ok).toBe(true);
        } else if (state.phase === 'awaiting-token') {
          const token = chooseStrategicToken(state);
          expect(token).not.toBeNull();
          expect(chooseToken(state, token!).ok).toBe(true);
        } else {
          throw new Error(`Unexpected unfinished phase: ${state.phase}`);
        }
        for (const player of ['human', 'computer'] as const) {
          for (const token of state.tokens[player]) expect(token.progress).toBeGreaterThanOrEqual(-1);
          for (const token of state.tokens[player]) expect(token.progress).toBeLessThanOrEqual(57);
        }
        actions += 1;
      }
      expect(state.result, `seed ${seed} stalled after ${actions} actions`).not.toBeNull();
      expect(state.tokens[state.result!].every((token) => token.progress === 57)).toBe(true);
    }
  });
});
