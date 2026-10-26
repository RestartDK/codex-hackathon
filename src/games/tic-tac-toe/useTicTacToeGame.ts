import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyTicTacToeMove,
  chooseComputerMove,
  createTicTacToeState,
  POSITION_NAMES,
  serializeTicTacToe,
  TIC_TAC_TOE_SAVE_KEY,
  undoTicTacToeTurn,
  type TicTacToeActionResult,
  type TicTacToeDifficulty,
  type TicTacToeSetup,
  type TicTacToeState,
} from "./ticTacToe";

export const TIC_TAC_TOE_COMPUTER_DELAY = 650;

function setupFromState(state: TicTacToeState): TicTacToeSetup {
  return {
    opponent: state.opponent,
    difficulty: state.difficulty,
    playerMark: state.playerMark,
    firstTurn: state.firstTurn,
  };
}

export function useTicTacToeGame() {
  const [state, setState] = useState<TicTacToeState>(() => createTicTacToeState());
  const [paused, setPaused] = useState(false);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const stateRef = useRef(state);
  const blockedRef = useRef(paused);
  const computerTurnRef = useRef(0);
  stateRef.current = state;
  blockedRef.current = paused;

  const commit = useCallback((next: TicTacToeState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TIC_TAC_TOE_SAVE_KEY, serializeTicTacToe(state));
    } catch {
      /* Continue in memory when storage is unavailable. */
    }
  }, [state]);

  const startGame = useCallback(
    (setup: TicTacToeSetup): TicTacToeActionResult => {
      setPaused(false);
      commit(createTicTacToeState(setup.difficulty, stateRef.current.score, setup));
      const other = setup.opponent === "computer" ? "The computer" : "Player two";
      const first = setup.firstTurn === "player" ? "You move first." : `${other} moves first.`;
      return {
        ok: true,
        message: `Match started. You are ${setup.playerMark}. ${first}`,
      };
    },
    [commit],
  );

  const playHumanMove = useCallback(
    (index: number): TicTacToeActionResult => {
      const current = stateRef.current;
      if (paused) return { ok: false, message: "The game is paused. Resume it before moving." };
      if (current.status !== "playing")
        return { ok: false, message: "This round is over. Start a new round to play again." };
      if (current.opponent === "computer" && current.turn !== current.playerMark)
        return { ok: false, message: "Please wait for the computer to move." };
      const next = structuredClone(current);
      const result = applyTicTacToeMove(next, index);
      if (result.ok) commit(next);
      return result;
    },
    [commit, paused],
  );

  const undo = useCallback((): TicTacToeActionResult => {
    if (blockedRef.current) return { ok: false, message: "Resume the game before undoing a turn." };
    const next = structuredClone(stateRef.current);
    const result = undoTicTacToeTurn(next);
    if (result.ok) commit(next);
    return result;
  }, [commit]);

  const newRound = useCallback((): TicTacToeActionResult => {
    setPaused(false);
    const current = stateRef.current;
    const next = createTicTacToeState(current.difficulty, current.score, setupFromState(current));
    commit(next);
    return {
      ok: true,
      message: `New round started. You are ${next.playerMark}. ${next.turn === next.playerMark ? "Your turn." : next.opponent === "computer" ? "Computer thinking." : "Player two's turn."}`,
    };
  }, [commit]);

  const resetMatch = useCallback((): TicTacToeActionResult => {
    setPaused(false);
    const current = stateRef.current;
    commit(createTicTacToeState(current.difficulty, undefined, setupFromState(current)));
    return { ok: true, message: "The match and scoreboard were reset." };
  }, [commit]);

  const resume = useCallback((): TicTacToeActionResult => {
    setPaused(false);
    return { ok: true, message: "Tic-Tac-Toe resumed." };
  }, []);

  const pause = useCallback((): TicTacToeActionResult => {
    setPaused(true);
    return { ok: true, message: "Tic-Tac-Toe is paused." };
  }, []);

  const changeDifficulty = useCallback(
    (difficulty: TicTacToeDifficulty): TicTacToeActionResult => {
      const current = stateRef.current;
      if (difficulty === current.difficulty)
        return { ok: true, message: `${difficulty} difficulty is already selected.` };
      const setup = { ...setupFromState(current), difficulty };
      setPaused(false);
      commit(createTicTacToeState(difficulty, current.score, setup));
      return { ok: true, message: `${difficulty} difficulty selected. A new round has started.` };
    },
    [commit],
  );

  useEffect(() => {
    const computerMark = state.playerMark === "X" ? "O" : "X";
    const turnId = ++computerTurnRef.current;
    if (
      paused ||
      narrationBusy ||
      state.opponent !== "computer" ||
      state.status !== "playing" ||
      state.turn !== computerMark
    )
      return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (
        computerTurnRef.current !== turnId ||
        blockedRef.current ||
        current.opponent !== "computer" ||
        current.status !== "playing" ||
        current.turn !== computerMark
      )
        return;
      const index = chooseComputerMove(current, Math.random, computerMark);
      if (index === null) return;
      const next = structuredClone(current);
      const result = applyTicTacToeMove(next, index);
      if (result.ok) commit(next);
    }, TIC_TAC_TOE_COMPUTER_DELAY);
    return () => {
      window.clearTimeout(timer);
      if (computerTurnRef.current === turnId) computerTurnRef.current += 1;
    };
  }, [commit, narrationBusy, paused, state]);

  const latest = state.moves.at(-1);
  const other = state.opponent === "computer" ? "The computer" : "Player two";
  const status = paused
    ? "Paused."
    : state.status === "won"
      ? state.winner === state.playerMark
        ? `You win with ${state.winningLine?.map((index) => POSITION_NAMES[index]).join(", ")}.`
        : `${other} wins with ${state.winningLine?.map((index) => POSITION_NAMES[index]).join(", ")}.`
      : state.status === "draw"
        ? "The board is full. This round is a draw."
        : latest
          ? `${latest.mark === state.playerMark ? `You placed ${latest.mark}` : `${other} placed ${latest.mark}`} in ${POSITION_NAMES[latest.index]}. ${state.turn === state.playerMark ? "Your turn." : state.opponent === "computer" ? "Computer thinking." : "Player two's turn."}`
          : `${state.turn === state.playerMark ? "Your turn." : state.opponent === "computer" ? "Computer thinking." : "Player two's turn."}`;

  return {
    state,
    paused,
    awaitingStartChoice: false,
    narrationBusy,
    status,
    playHumanMove,
    startGame,
    undo,
    newRound,
    resetMatch,
    resume,
    pause,
    changeDifficulty,
    setNarrationBusy,
  };
}
