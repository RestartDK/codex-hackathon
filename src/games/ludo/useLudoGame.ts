import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseComputerToken,
  chooseToken,
  continueTurn,
  correctLastMove,
  createLudoState,
  deserializeLudo,
  legalTokenIds,
  roll,
  serializeLudo,
  type LudoRandom,
  type LudoState,
} from "./ludo";

const SAVE_KEY = "voice-game-companion-ludo-save";
export const LUDO_PACING = { roll: 1400, move: 1800, handoff: 1600 } as const;

function loadSavedLudo(): LudoState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserializeLudo(raw) : null;
  } catch {
    return null;
  }
}

export interface LudoActionResult {
  ok: boolean;
  message: string;
}

export function useLudoGame() {
  const [state, setState] = useState<LudoState>(() => loadSavedLudo() ?? createLudoState());
  const [paused, setPaused] = useState(false);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [awaitingStartChoice, setAwaitingStartChoice] = useState(() => {
    const saved = loadSavedLudo();
    return Boolean(saved && saved.history.length > 0 && !saved.result);
  });
  const [pendingToken, setPendingToken] = useState<number | null>(null);
  const pendingTokenRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const randomRef = useRef<LudoRandom>({ nextDie: () => Math.floor(Math.random() * 6) + 1 });
  const interactionBlockedRef = useRef(paused || awaitingStartChoice);
  interactionBlockedRef.current = paused || awaitingStartChoice;

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, serializeLudo(state));
    } catch {
      /* continue in memory */
    }
  }, [state]);

  const rollDice = useCallback((): LudoActionResult => {
    if (awaitingStartChoice) return { ok: false, message: "Choose Resume or New Game first." };
    if (paused) return { ok: false, message: "The game is paused. Resume it before rolling." };
    if (stateRef.current.activePlayer !== "human")
      return {
        ok: false,
        message: "The computer is taking its turn. Your roll will be available next.",
      };
    const next = structuredClone(stateRef.current);
    const result = roll(next, randomRef.current);
    if (!result.ok) return result;
    stateRef.current = next;
    setState(next);
    return { ok: true, message: result.message };
  }, [awaitingStartChoice, paused]);

  const proposeToken = useCallback(
    (tokenId: number): LudoActionResult => {
      const current = stateRef.current;
      if (awaitingStartChoice) return { ok: false, message: "Choose Resume or New Game first." };
      if (paused)
        return { ok: false, message: "The game is paused. Resume it before choosing a token." };
      if (current.activePlayer !== "human")
        return { ok: false, message: "Wait for your turn before choosing a token." };
      const probe = structuredClone(current);
      const result = chooseToken(probe, tokenId);
      if (!result.ok) return result;
      pendingTokenRef.current = tokenId;
      setPendingToken(tokenId);
      return { ok: true, message: `Move your token ${tokenId}: ${result.message} Confirm?` };
    },
    [awaitingStartChoice, paused],
  );

  const confirmToken = useCallback((): LudoActionResult => {
    if (interactionBlockedRef.current || stateRef.current.activePlayer !== "human")
      return { ok: false, message: "Resume the game and wait for your turn before confirming." };
    const token = pendingTokenRef.current;
    if (token == null) return { ok: false, message: "No token is waiting for confirmation." };
    const next = structuredClone(stateRef.current);
    const result = chooseToken(next, token);
    if (!result.ok) {
      pendingTokenRef.current = null;
      setPendingToken(null);
      return result;
    }
    stateRef.current = next;
    setState(next);
    pendingTokenRef.current = null;
    setPendingToken(null);
    return { ok: true, message: result.message };
  }, []);

  const cancelToken = useCallback(() => {
    pendingTokenRef.current = null;
    setPendingToken(null);
    return { ok: true, message: "Token choice cancelled." };
  }, []);

  const correct = useCallback((): LudoActionResult => {
    if (interactionBlockedRef.current)
      return { ok: false, message: "Resume the game before correcting a move." };
    const next = structuredClone(stateRef.current);
    const outcome = correctLastMove(next);
    if (outcome.ok) {
      stateRef.current = next;
      setState(next);
    }
    pendingTokenRef.current = null;
    setPendingToken(null);
    return outcome;
  }, []);

  const continueGame = useCallback((): LudoActionResult => {
    if (interactionBlockedRef.current)
      return { ok: false, message: "Resume the game before continuing." };
    const next = structuredClone(stateRef.current);
    const outcome = continueTurn(next);
    if (outcome.ok) {
      stateRef.current = next;
      setState(next);
    }
    return outcome;
  }, []);

  const newGame = useCallback(() => {
    pendingTokenRef.current = null;
    setPendingToken(null);
    setPaused(false);
    interactionBlockedRef.current = false;
    setAwaitingStartChoice(false);
    const fresh = createLudoState();
    stateRef.current = fresh;
    setState(fresh);
  }, []);

  const pauseGame = useCallback((): LudoActionResult => {
    interactionBlockedRef.current = true;
    setPaused(true);
    return { ok: true, message: "Ludo is paused. Your position is saved." };
  }, []);

  const resumeGame = useCallback((): LudoActionResult => {
    setAwaitingStartChoice(false);
    interactionBlockedRef.current = false;
    setPaused(false);
    return { ok: true, message: "Ludo is resumed." };
  }, []);

  useEffect(() => {
    if (
      paused ||
      awaitingStartChoice ||
      narrationBusy ||
      state.result ||
      state.activePlayer !== "computer"
    )
      return;
    if (!["computer-turn", "awaiting-roll", "awaiting-token"].includes(state.phase)) return;
    // One timer performs exactly one transition. React cleanup cancels it;
    // setup always schedules a replacement, including StrictMode and resume.
    // Depend on the entire state so a bonus roll in the same phase schedules
    // another step. Identity checks discard work for corrected/reset positions.
    const expected = state;
    const timer = window.setTimeout(
      () => {
        if (interactionBlockedRef.current || stateRef.current !== expected) return;
        const next = structuredClone(expected);
        if (next.phase === "awaiting-token") {
          const token = chooseComputerToken(next);
          if (token == null) return;
          if (!chooseToken(next, token).ok) return;
        } else if (!roll(next, randomRef.current).ok) return;
        stateRef.current = next;
        setState(next);
      },
      state.phase === "awaiting-token" ? LUDO_PACING.move : LUDO_PACING.roll,
    );
    return () => window.clearTimeout(timer);
  }, [awaitingStartChoice, narrationBusy, paused, state]);

  useEffect(() => {
    if (paused || awaitingStartChoice || narrationBusy || state.phase !== "awaiting-continue")
      return;
    const expected = state;
    const timer = window.setTimeout(() => {
      if (interactionBlockedRef.current || stateRef.current !== expected) return;
      const next = structuredClone(stateRef.current);
      const outcome = continueTurn(next);
      if (outcome.ok) {
        stateRef.current = next;
        setState(next);
      }
    }, LUDO_PACING.handoff);
    return () => window.clearTimeout(timer);
  }, [awaitingStartChoice, narrationBusy, paused, state]);

  const latestMove = state.history.at(-1);
  const lastRoll = state.lastRoll;
  const rollText = lastRoll
    ? `${lastRoll.player === "human" ? "You" : "The computer"} rolled ${lastRoll.value}. `
    : "";
  const computerMoveText =
    latestMove?.player === "computer" && state.lastMoveRevision === state.revision
      ? `The computer moved token ${latestMove.tokenId}${latestMove.captured.length ? ` and captured your token ${latestMove.captured.join(" and token ")}` : ""}${latestMove.finished ? " home" : ""}. `
      : "";
  const humanMoveText =
    latestMove?.player === "human" && state.lastMoveRevision === state.revision
      ? `Your token ${latestMove.tokenId}${latestMove.finished ? " reached home" : " moved"}${latestMove.captured.length ? `, capturing computer token ${latestMove.captured.join(" and ")}` : ""}. `
      : "";
  const status = state.result
    ? `${state.result === "human" ? "You" : "The computer"} won.`
    : awaitingStartChoice
      ? "Choose Resume or New Game first."
      : paused
        ? "Paused."
        : state.phase === "awaiting-token"
          ? state.activePlayer === "human"
            ? `${rollText}Choose token ${legalTokenIds(state).join(", ")}.`
            : `${rollText}Moving token ${chooseComputerToken(state)}.`
          : state.phase === "awaiting-confirmation"
            ? "Your turn: confirm the token move."
            : state.phase === "awaiting-continue"
              ? `${humanMoveText}Computer's turn next.`
              : state.activePlayer === "computer"
                ? `${computerMoveText}Computer's turn: rolling next.`
                : lastRoll?.player === "computer"
                  ? `${computerMoveText || `${rollText}No move.`} Your turn.`
                  : latestMove?.player === "human" && latestMove.roll === lastRoll?.value
                    ? `${humanMoveText}Roll again.`
                    : "Your turn. Say roll.";

  return {
    state,
    paused,
    awaitingStartChoice,
    pendingToken,
    lastRoll: state.lastRoll,
    status,
    rollDice,
    proposeToken,
    confirmToken,
    cancelToken,
    correct,
    continueGame,
    newGame,
    pauseGame,
    resumeGame,
    setNarrationBusy,
  };
}

export function ludoSaveKey() {
  return SAVE_KEY;
}

