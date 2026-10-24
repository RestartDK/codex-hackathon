import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyTicTacToeMove,
  chooseComputerMove,
  createTicTacToeState,
  deserializeTicTacToe,
  POSITION_NAMES,
  serializeTicTacToe,
  TIC_TAC_TOE_SAVE_KEY,
  undoTicTacToeTurn,
  type TicTacToeActionResult,
  type TicTacToeDifficulty,
  type TicTacToeState,
} from './ticTacToe';

export const TIC_TAC_TOE_COMPUTER_DELAY = 650;

function loadSavedGame(): TicTacToeState | null {
  try {
    const raw = localStorage.getItem(TIC_TAC_TOE_SAVE_KEY);
    return raw ? deserializeTicTacToe(raw) : null;
  } catch {
    return null;
  }
}

export function useTicTacToeGame() {
  const [state, setState] = useState<TicTacToeState>(() => loadSavedGame() ?? createTicTacToeState());
  const [paused, setPaused] = useState(false);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [awaitingStartChoice, setAwaitingStartChoice] = useState(() => {
    const saved = loadSavedGame();
    return Boolean(saved && saved.status === 'playing' && saved.moves.length > 0);
  });
  const stateRef = useRef(state);
  const blockedRef = useRef(paused || awaitingStartChoice);
  stateRef.current = state;
  blockedRef.current = paused || awaitingStartChoice;

  const commit = useCallback((next: TicTacToeState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(TIC_TAC_TOE_SAVE_KEY, serializeTicTacToe(state)); } catch { /* Continue in memory. */ }
  }, [state]);

  const playHumanMove = useCallback((index: number): TicTacToeActionResult => {
    if (awaitingStartChoice) return { ok: false, message: 'Choose Resume or New Round first.' };
    if (paused) return { ok: false, message: 'The game is paused. Resume it before moving.' };
    if (stateRef.current.status !== 'playing') return { ok: false, message: 'This round is over. Start a new round to play again.' };
    if (stateRef.current.turn !== 'X') return { ok: false, message: 'Please wait for the computer to move.' };
    const next = structuredClone(stateRef.current);
    const result = applyTicTacToeMove(next, index);
    if (result.ok) commit(next);
    return result;
  }, [awaitingStartChoice, commit, paused]);

  const undo = useCallback((): TicTacToeActionResult => {
    if (blockedRef.current) return { ok: false, message: 'Resume the game before undoing a turn.' };
    const next = structuredClone(stateRef.current);
    const result = undoTicTacToeTurn(next);
    if (result.ok) commit(next);
    return result;
  }, [commit]);

  const newRound = useCallback((): TicTacToeActionResult => {
    setAwaitingStartChoice(false);
    setPaused(false);
    const next = createTicTacToeState(stateRef.current.difficulty, stateRef.current.score);
    commit(next);
    return { ok: true, message: 'New round started. You are X and move first.' };
  }, [commit]);

  const resetMatch = useCallback((): TicTacToeActionResult => {
    setAwaitingStartChoice(false);
    setPaused(false);
    commit(createTicTacToeState(stateRef.current.difficulty));
    return { ok: true, message: 'The match and scoreboard were reset. You are X and move first.' };
  }, [commit]);

  const resume = useCallback((): TicTacToeActionResult => {
    setAwaitingStartChoice(false);
    setPaused(false);
    return { ok: true, message: `Saved round resumed. ${stateRef.current.turn === 'X' ? 'Your turn.' : "Computer's turn."}` };
  }, []);

  const pause = useCallback((): TicTacToeActionResult => {
    setPaused(true);
    return { ok: true, message: 'Tic-Tac-Toe is paused. Your round is saved.' };
  }, []);

  const changeDifficulty = useCallback((difficulty: TicTacToeDifficulty): TicTacToeActionResult => {
    if (difficulty === stateRef.current.difficulty) return { ok: true, message: `${difficulty} difficulty is already selected.` };
    const next = createTicTacToeState(difficulty, stateRef.current.score);
    setAwaitingStartChoice(false);
    setPaused(false);
    commit(next);
    return { ok: true, message: `${difficulty} difficulty selected. A new round has started.` };
  }, [commit]);

  useEffect(() => {
    if (paused || awaitingStartChoice || narrationBusy || state.status !== 'playing' || state.turn !== 'O') return;
    const expected = state;
    const timer = window.setTimeout(() => {
      if (blockedRef.current || stateRef.current !== expected) return;
      const index = chooseComputerMove(expected);
      if (index === null) return;
      const next = structuredClone(expected);
      const result = applyTicTacToeMove(next, index);
      if (result.ok) commit(next);
    }, TIC_TAC_TOE_COMPUTER_DELAY);
    return () => window.clearTimeout(timer);
  }, [awaitingStartChoice, commit, narrationBusy, paused, state]);

  const latest = state.moves.at(-1);
  const status = awaitingStartChoice
    ? 'Choose Resume Saved Round or New Round first.'
    : paused
      ? 'Paused. Your round is saved.'
      : state.status === 'won'
        ? state.winner === 'X'
          ? `You win with ${state.winningLine?.map((index) => POSITION_NAMES[index]).join(', ')}.`
          : `The computer wins with ${state.winningLine?.map((index) => POSITION_NAMES[index]).join(', ')}.`
        : state.status === 'draw'
          ? 'The board is full. This round is a draw.'
          : latest
            ? `${latest.mark === 'X' ? 'You placed X' : 'The computer placed O'} in ${POSITION_NAMES[latest.index]}. ${state.turn === 'X' ? 'Your turn.' : 'Computer thinking.'}`
            : 'Your turn. Choose any square from one to nine.';

  return {
    state,
    paused,
    awaitingStartChoice,
    narrationBusy,
    status,
    playHumanMove,
    undo,
    newRound,
    resetMatch,
    resume,
    pause,
    changeDifficulty,
    setNarrationBusy,
  };
}
