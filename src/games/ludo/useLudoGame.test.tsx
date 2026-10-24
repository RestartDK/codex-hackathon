import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLudoState, serializeLudo } from './ludo';
import { LUDO_PACING, ludoSaveKey, useLudoGame } from './useLudoGame';

async function tick(milliseconds: number = LUDO_PACING.roll + LUDO_PACING.move + 100) {
  // Flush each transition separately, as the browser does between timers.
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 20) {
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
  }
}

describe('Ludo computer turn controller', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('rolls after mounting on the computer turn under React StrictMode', async () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    await tick();
    expect(result.current.state.lastRoll).toEqual({ player: 'computer', value: 1 });
    expect(result.current.state.activePlayer).toBe('human');
  });

  it('finishes a saved computer token selection without requiring a new roll', async () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.phase = 'awaiting-token';
    state.currentRoll = 2;
    state.tokens.computer[0].progress = 0;
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    await tick();
    expect(result.current.state.tokens.computer[0].progress).toBe(2);
    expect(result.current.state.activePlayer).toBe('human');
    expect(result.current.state.history).toHaveLength(1);
  });

  it('cancels a paused turn and resumes it exactly once', async () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.tokens.computer[0].progress = 0;
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    act(() => { result.current.pauseGame(); });
    await tick();
    expect(result.current.state.lastRoll).toBeNull();
    act(() => { result.current.resumeGame(); });
    await tick();
    expect(result.current.state.history).toHaveLength(1);
    expect(result.current.state.tokens.computer[0].progress).toBe(1);
  });

  it('takes ten consecutive computer turns after human moves', async () => {
    const state = createLudoState();
    state.tokens.human[0].progress = 0;
    state.tokens.computer[0].progress = 0;
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    for (let turn = 1; turn <= 10; turn += 1) {
      act(() => {
        expect(result.current.rollDice().ok).toBe(true);
        expect(result.current.proposeToken(1).ok).toBe(true);
        expect(result.current.confirmToken().ok).toBe(true);
      });
      await tick(LUDO_PACING.handoff + LUDO_PACING.roll + LUDO_PACING.move + 100);
      expect(result.current.state.activePlayer).toBe('human');
      expect(result.current.state.tokens.computer[0].progress).toBe(turn);
    }
    expect(result.current.state.history.filter((move) => move.player === 'computer')).toHaveLength(10);
  });

  it('handles bonus rolls and hands over after a third six', async () => {
    vi.mocked(Math.random).mockReturnValue(0.999);
    const state = createLudoState();
    state.activePlayer = 'computer';
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    await tick(3 * LUDO_PACING.roll + 2 * LUDO_PACING.move + 100);
    expect(result.current.state.history).toHaveLength(2);
    expect(result.current.state.history.every((move) => move.player === 'computer' && move.roll === 6)).toBe(true);
    expect(result.current.state.activePlayer).toBe('human');
    expect(result.current.state.sixStreak).toBe(0);
  });

  it('reschedules when a six has no legal move and leaves the phase unchanged', async () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.999).mockReturnValue(0);
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.tokens.computer.forEach((token) => { token.progress = 56; });
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    await tick(5 * LUDO_PACING.roll + 4 * LUDO_PACING.move + 100);
    expect(result.current.state.result).toBe('computer');
    expect(result.current.state.history).toHaveLength(4);
  });

  it('discards old computer work when a new game starts', async () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    await tick(60);
    act(() => { result.current.newGame(); });
    await tick();
    expect(result.current.state).toEqual(createLudoState());
  });

  it('rejects human voice commands while the computer owns the die and tokens', () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.phase = 'awaiting-token';
    state.currentRoll = 6;
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    act(() => {
      expect(result.current.rollDice().ok).toBe(false);
      expect(result.current.proposeToken(1).ok).toBe(false);
    });
    expect(result.current.state.history).toHaveLength(0);
  });

  it('waits for narration before rolling and holds the die result before moving', async () => {
    const state = createLudoState();
    state.activePlayer = 'computer';
    state.tokens.computer[0].progress = 0;
    localStorage.setItem(ludoSaveKey(), serializeLudo(state));
    const { result } = renderHook(useLudoGame, { wrapper: StrictMode });
    act(() => { result.current.setNarrationBusy(true); });
    await tick(10_000);
    expect(result.current.state.lastRoll).toBeNull();
    act(() => { result.current.setNarrationBusy(false); });
    await tick(LUDO_PACING.roll);
    expect(result.current.state.currentRoll).toBe(1);
    expect(result.current.state.tokens.computer[0].progress).toBe(0);
    expect(result.current.status).toBe('The computer rolled 1. Moving token 1.');
    act(() => { result.current.setNarrationBusy(true); });
    await tick(10_000);
    expect(result.current.state.tokens.computer[0].progress).toBe(0);
    act(() => { result.current.setNarrationBusy(false); });
    await tick(LUDO_PACING.move);
    expect(result.current.state.tokens.computer[0].progress).toBe(1);
    expect(result.current.status).toContain('Your turn.');
  });
});
