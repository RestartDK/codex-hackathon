import { useState, useCallback, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import type {
  PromotionChoice,
  AppSettings,
  GameMode,
  StockfishStatus,
  MoveFeedback,
} from "../types";
import { DIFFICULTIES } from "../chess/difficulty";
import { computeMoveFeedback } from "../chess/computer";
import { StockfishEngine } from "../chess/stockfish";
import type { StockfishMove, StockfishEngineState } from "../chess/stockfish";
import { saveGame, loadGame, clearGame } from "../lib/storage";
import {
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playCheckmateSound,
  playPromotionSound,
} from "../lib/sounds";

interface UseChessGameOptions {
  settings: AppSettings;
}

export type GameResult = {
  winner: "w" | "b" | null;
  reason: "checkmate" | "resign" | "draw";
} | null;

const PIECE_VALUE: Record<string, number> = {
  q: 9,
  r: 5,
  b: 3,
  n: 3,
  p: 1,
  k: 0,
};

function rebuildMoveFens(history: string[]): string[] {
  const fens: string[] = [new Chess().fen()];
  for (let i = 0; i < history.length; i++) {
    const g2 = new Chess();
    const moves = history.slice(0, i + 1);
    for (const m of moves) {
      g2.move(m);
    }
    fens.push(g2.fen());
  }
  return fens;
}

function rebuildFensFromHistory(history: string[]): string[] {
  return rebuildMoveFens(history);
}

export function useChessGame({ settings }: UseChessGameOptions) {
  const [game] = useState(() => {
    const g = new Chess();
    return g;
  });
  const [fen, setFen] = useState(game.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PromotionChoice | null>(null);
  const [status, setStatus] = useState<string>("White to move");
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [awaitingStartChoice, setAwaitingStartChoice] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [stockfishStatus, setStockfishStatus] = useState<StockfishStatus>("unloaded");
  const [stockfishError, setStockfishError] = useState<string | null>(null);
  const [stockfishProgress, setStockfishProgress] = useState<{
    depth: number;
    score: number;
  } | null>(null);

  const [moveFens, setMoveFens] = useState<string[]>([game.fen()]);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(-1);
  const [displayFen, setDisplayFen] = useState<string | null>(null);

  const [moveFeedback, setMoveFeedback] = useState<Map<number, MoveFeedback>>(new Map());

  const prevModeRef = useRef<GameMode>(settings.gameMode);
  const prevPlayerColorRef = useRef<"w" | "b">(settings.playerColor);
  const settingsRef = useRef(settings);
  const gameRef = useRef(game);
  const computerMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stockfishEngineRef = useRef<StockfishEngine | null>(null);
  const analysisEngineRef = useRef<StockfishEngine | null>(null);
  const analysisQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const stockfishStateRef = useRef<StockfishEngineState>("idle");
  const liveFenRef = useRef<string>(game.fen());
  const computerMoveActiveRef = useRef(false);
  const computerSearchFenRef = useRef<string | null>(null);
  const pausedRef = useRef(false);
  const initialBlackMoveScheduledRef = useRef(false);

  const preMoveFenRef = useRef<string | null>(null);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  const updateState = useCallback(() => {
    const newFen = game.fen();
    const newHistory = game.history();
    const newMoveFens = rebuildFensFromHistory(newHistory);
    setFen(newFen);
    setHistory(newHistory);
    setMoveFens(newMoveFens);
    const turn = game.turn() === "w" ? "White" : "Black";
    let msg = `${turn} to move`;
    let nextResult: GameResult = null;

    if (game.isCheckmate()) {
      msg = `Checkmate! ${turn === "White" ? "Black" : "White"} wins!`;
      const winner = game.turn() === "w" ? "b" : "w";
      nextResult = { winner, reason: "checkmate" };
    } else if (game.isStalemate()) {
      msg = "Stalemate! The game is a draw.";
      nextResult = { winner: null, reason: "draw" };
    } else if (game.isDraw()) {
      if (game.isInsufficientMaterial()) {
        msg = "Draw due to insufficient material.";
      } else if (game.isThreefoldRepetition()) {
        msg = "Draw due to threefold repetition.";
      } else {
        msg = "Draw!";
      }
      nextResult = { winner: null, reason: "draw" };
    } else if (game.isCheck()) {
      msg = `${turn} is in check`;
    }

    setGameResult(nextResult);
    saveGame(newFen, newHistory, nextResult);
    setStatus(msg);
  }, [game]);

  const initStockfish = useCallback(() => {
    if (stockfishEngineRef.current) return;

    setStockfishStatus("loading");
    setStockfishError(null);
    setStockfishProgress(null);

    const engine = new StockfishEngine();
    stockfishEngineRef.current = engine;

    engine
      .init({
        onStateChange: (state: StockfishEngineState) => {
          stockfishStateRef.current = state;
          if (state === "ready") {
            setStockfishStatus("ready");
          } else if (state === "error") {
            setStockfishStatus("error");
          }
        },
        onBestMove: (move: StockfishMove) => {
          const g = gameRef.current;
          if (!computerMoveActiveRef.current) {
            setStockfishProgress(null);
            setIsComputerThinking(false);
            return;
          }
          computerMoveActiveRef.current = false;

          if (
            pausedRef.current ||
            g.fen() !== computerSearchFenRef.current ||
            g.turn() === settingsRef.current.playerColor ||
            g.isGameOver()
          ) {
            setStockfishProgress(null);
            return;
          }

          try {
            g.move({
              from: move.from as Square,
              to: move.to as Square,
              promotion: move.promotion as "q" | "r" | "b" | "n" | undefined,
            });
            setSelectedSquare(null);
            setLegalMoves([]);
            setStockfishProgress(null);
            updateState();

            const s = settingsRef.current;
            if (s.soundEnabled) {
              const hist = g.history({ verbose: true });
              if (hist.length > 0) {
                const last = hist[hist.length - 1];
                if (last.captured) playCaptureSound();
                else playMoveSound();
              }
            }
          } catch {
            console.warn("Stockfish returned unusable move (stale result)");
          } finally {
            setIsComputerThinking(false);
          }
        },
        onError: (error: string) => {
          setStockfishError(error);
          setStockfishStatus("error");
          setIsComputerThinking(false);
        },
        onProgress: (info: { depth: number; score: number }) => {
          setStockfishProgress({ depth: info.depth, score: info.score });
        },
      })
      .catch((err: unknown) => {
        setStockfishStatus("error");
        setStockfishError(
          `Failed to initialize Stockfish: ${err instanceof Error ? err.message : String(err)}`,
        );
        setIsComputerThinking(false);
      });

    const analysisEngine = new StockfishEngine();
    analysisEngineRef.current = analysisEngine;
    void analysisEngine
      .init({
        onStateChange: () => undefined,
        onBestMove: () => undefined,
        onError: () => undefined,
      })
      .then(() => analysisEngine.setSkillLevel(20));
  }, [updateState]);

  const terminateStockfish = useCallback(() => {
    if (stockfishEngineRef.current) {
      stockfishEngineRef.current.terminate();
      stockfishEngineRef.current = null;
    }
    analysisEngineRef.current?.terminate();
    analysisEngineRef.current = null;
    stockfishStateRef.current = "idle";
    setStockfishStatus("unloaded");
    setStockfishError(null);
    setStockfishProgress(null);
  }, []);

  const retryStockfish = useCallback(() => {
    terminateStockfish();
    initStockfish();
  }, [initStockfish, terminateStockfish]);

  const scheduleComputerMoveViaStockfish = useCallback(async () => {
    if (pausedRef.current) return;
    setIsComputerThinking(true);
    computerMoveActiveRef.current = true;

    try {
      const g = gameRef.current;
      const engine = stockfishEngineRef.current;
      const difficulty = settingsRef.current.difficulty;

      if (!engine?.isReady) {
        for (let attempt = 0; attempt < 40 && !engine?.isReady; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }
        if (!engine?.isReady) {
          throw new Error("The Stockfish opponent did not become ready. Use Retry engine.");
        }
        const config = DIFFICULTIES[difficulty];
        if (config.stockfishSkillLevel !== undefined)
          engine.setSkillLevel(config.stockfishSkillLevel);
        const thinkTime = config.stockfishThinkTimeMs ?? 2000;
        engine.setThinkTime(thinkTime);
        computerSearchFenRef.current = g.fen();
        engine.search(g.fen(), thinkTime);
      } else {
        const config = DIFFICULTIES[difficulty];
        if (config.stockfishSkillLevel !== undefined) {
          engine.setSkillLevel(config.stockfishSkillLevel);
        }
        const thinkTime = config.stockfishThinkTimeMs ?? 2000;
        engine.setThinkTime(thinkTime);
        computerSearchFenRef.current = g.fen();
        engine.search(g.fen(), thinkTime);
      }
      if (pausedRef.current) {
        setIsComputerThinking(false);
        computerMoveActiveRef.current = false;
        return;
      }
    } catch (err) {
      console.error("Computer move failed:", err);
      setStockfishStatus("error");
      setStockfishError(err instanceof Error ? err.message : "The computer engine failed.");
      setIsComputerThinking(false);
      computerMoveActiveRef.current = false;
    }
    // Note: setIsComputerThinking(false) is handled by the onBestMove callback
  }, [updateState]);

  const scheduleComputerMove = useCallback(() => {
    if (pausedRef.current) return;
    if (computerMoveTimeoutRef.current) {
      clearTimeout(computerMoveTimeoutRef.current);
    }

    setIsComputerThinking(true);

    const thinkTime = 300 + Math.random() * 400;

    computerMoveTimeoutRef.current = setTimeout(() => {
      scheduleComputerMoveViaStockfish();
      computerMoveTimeoutRef.current = null;
    }, thinkTime);
  }, [scheduleComputerMoveViaStockfish]);

  const computeFeedback = useCallback(
    async (moveIndex: number, fenBefore: string, fenAfter: string, playerColor: "w" | "b") => {
      const engine = analysisEngineRef.current;
      if (!engine?.isReady) return;

      const task = analysisQueueRef.current.then(() =>
        computeMoveFeedback(fenBefore, fenAfter, playerColor, engine, false),
      );
      analysisQueueRef.current = task.catch(() => undefined);
      const feedback = await task;
      if (feedback) {
        setMoveFeedback((prev) => {
          const next = new Map(prev);
          next.set(moveIndex, {
            moveIndex,
            tag: feedback.tag,
            centipawnLoss: feedback.centipawnLoss,
            evalBefore: Math.round(feedback.evalBefore / 100),
            evalAfter: Math.round(feedback.evalAfter / 100),
            isBook: false,
          });
          return next;
        });
      }
    },
    [],
  );

  const handleNewGame = useCallback(() => {
    if (computerMoveTimeoutRef.current) {
      clearTimeout(computerMoveTimeoutRef.current);
      computerMoveTimeoutRef.current = null;
    }

    if (stockfishEngineRef.current) {
      stockfishEngineRef.current.stop();
    }

    computerMoveActiveRef.current = false;

    game.reset();
    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
    setIsComputerThinking(false);
    setGameResult(null);
    setReviewMode(false);
    setReviewIndex(-1);
    setDisplayFen(null);
    setStockfishProgress(null);
    setMoveFeedback(new Map());
    setAwaitingStartChoice(false);
    setIsPaused(false);
    pausedRef.current = false;
    clearGame();
    updateState();
  }, [game, updateState]);

  const afterUserMove = useCallback(
    (wasPromotion: boolean = false, fenBefore?: string) => {
      const s = settingsRef.current;
      const g = gameRef.current;

      if (s.soundEnabled) {
        if (g.isCheckmate()) {
          playCheckmateSound();
        } else if (g.isCheck()) {
          playCheckSound();
        } else {
          const hist = g.history({ verbose: true });
          if (hist.length > 0) {
            const last = hist[hist.length - 1];
            if (last.captured) {
              playCaptureSound();
            } else if (wasPromotion) {
              playPromotionSound();
            } else {
              playMoveSound();
            }
          } else {
            playMoveSound();
          }
        }
      }

      const engine = analysisEngineRef.current;
      if (engine?.isReady && fenBefore) {
        const hist = g.history({ verbose: true });
        if (hist.length > 0) {
          const lastMove = hist[hist.length - 1];
          const moveIndex = hist.length - 1;
          computeFeedback(moveIndex, fenBefore, g.fen(), lastMove.color as "w" | "b");
        }
      }

      const isComputerTurn =
        settingsRef.current.gameMode === "computer" &&
        g.turn() !== settingsRef.current.playerColor &&
        !g.isGameOver();
      if (pausedRef.current) return;
      if (isComputerTurn) {
        scheduleComputerMove();
      }
    },
    [game, scheduleComputerMove, computeFeedback],
  );

  const enterReviewMode = useCallback(() => {
    if (history.length === 0) return;
    liveFenRef.current = game.fen();
    setReviewMode(true);
    setReviewIndex(history.length - 1);
    setDisplayFen(moveFens[history.length] ?? game.fen());
  }, [history.length, moveFens, game]);

  const exitReviewMode = useCallback(() => {
    setReviewMode(false);
    setReviewIndex(-1);
    setDisplayFen(null);
  }, []);

  const goToMove = useCallback(
    (index: number) => {
      if (index < -1 || index >= moveFens.length - 1) return;
      setReviewIndex(index);
      const targetFen = index === -1 ? moveFens[0] : moveFens[index + 1];
      setDisplayFen(targetFen);
    },
    [moveFens],
  );

  const selectSquare = useCallback(
    (square: Square) => {
      if (awaitingStartChoice || gameResult || isPaused) return;
      if (isComputerThinking) return;
      if (settings.gameMode === "computer" && game.turn() !== settings.playerColor) return;
      if (game.isGameOver()) return;

      if (reviewMode) {
        exitReviewMode();
      }

      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setLegalMoves(moves.map((m) => m.to as Square));
        return;
      }

      if (selectedSquare) {
        const moves = game.moves({ square: selectedSquare, verbose: true });
        const targetMove = moves.find((m) => m.to === square);

        if (targetMove) {
          if (targetMove.promotion) {
            setPendingPromotion({ from: selectedSquare, to: square });
            setSelectedSquare(null);
            setLegalMoves([]);
            return;
          }

          preMoveFenRef.current = game.fen();

          game.move({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          setLegalMoves([]);
          updateState();
          afterUserMove(false, preMoveFenRef.current);
          return;
        }

        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          const newMoves = game.moves({ square, verbose: true });
          setLegalMoves(newMoves.map((m) => m.to as Square));
          return;
        }

        setSelectedSquare(null);
        setLegalMoves([]);
      }
    },
    [
      game,
      selectedSquare,
      updateState,
      afterUserMove,
      isComputerThinking,
      settings.gameMode,
      settings.playerColor,
      reviewMode,
      exitReviewMode,
      awaitingStartChoice,
      gameResult,
      isPaused,
    ],
  );

  const makeMove = useCallback(
    (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => {
      if (awaitingStartChoice) return { ok: false, message: "Choose Resume or New Game first." };
      if (isPaused) return { ok: false, message: "The game is paused. Say resume game first." };
      if (isComputerThinking) return { ok: false, message: "The computer is still thinking." };
      if (gameResult || game.isGameOver())
        return { ok: false, message: "The game is already over." };
      if (
        settingsRef.current.gameMode === "computer" &&
        game.turn() !== settingsRef.current.playerColor
      ) {
        return { ok: false, message: "It is the computer’s turn." };
      }
      const legal = game
        .moves({ square: from, verbose: true })
        .find(
          (move) => move.to === to && (!move.promotion || (promotion ?? "q") === move.promotion),
        );
      if (!legal) return { ok: false, message: `The move from ${from} to ${to} is not legal.` };
      const fenBefore = game.fen();
      const played = game.move({
        from,
        to,
        promotion: legal.promotion ? (promotion ?? "q") : undefined,
      });
      exitReviewMode();
      setPendingPromotion(null);
      setSelectedSquare(null);
      setLegalMoves([]);
      updateState();
      afterUserMove(Boolean(played.promotion), fenBefore);
      return { ok: true, message: played.san, move: played };
    },
    [
      game,
      isComputerThinking,
      updateState,
      afterUserMove,
      awaitingStartChoice,
      gameResult,
      isPaused,
      exitReviewMode,
    ],
  );

  const getHint = useCallback(async () => {
    if (awaitingStartChoice)
      return { ok: false as const, message: "Choose Resume or New Game first." };
    if (gameResult || game.isGameOver())
      return { ok: false as const, message: "The game is already over." };
    if (
      settingsRef.current.gameMode === "computer" &&
      game.turn() !== settingsRef.current.playerColor
    ) {
      return { ok: false as const, message: "Wait for the computer to finish its move." };
    }
    const engine = analysisEngineRef.current;
    if (!engine?.isReady) {
      return { ok: false as const, message: "The analysis engine is not ready yet." };
    }
    const startingFen = game.fen();
    const task = analysisQueueRef.current.then(() => engine.analyze(startingFen, 16));
    analysisQueueRef.current = task.catch(() => undefined);
    const analysis = await task;
    if (game.fen() !== startingFen) {
      return { ok: false as const, message: "The position changed before the hint was ready." };
    }
    if (!analysis.bestMove) return { ok: false as const, message: "No hint is available." };
    const uci = analysis.bestMove;
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;
    const clone = new Chess(startingFen);
    try {
      const move = clone.move({ from, to, promotion });
      return { ok: true as const, from, to, promotion, san: move.san };
    } catch {
      return { ok: false as const, message: "The engine returned a stale move." };
    }
  }, [game, awaitingStartChoice, gameResult]);

  const promote = useCallback(
    (piece: "q" | "r" | "b" | "n") => {
      if (!pendingPromotion || awaitingStartChoice || gameResult || isPaused) return;
      preMoveFenRef.current = game.fen();
      game.move({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
      setPendingPromotion(null);
      setSelectedSquare(null);
      setLegalMoves([]);
      updateState();
      afterUserMove(true, preMoveFenRef.current);
    },
    [game, pendingPromotion, updateState, afterUserMove, awaitingStartChoice, gameResult, isPaused],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
  }, []);

  const newGame = useCallback(() => {
    handleNewGame();
    if (settingsRef.current.gameMode === "computer" && settingsRef.current.playerColor === "b") {
      scheduleComputerMove();
    }
  }, [handleNewGame, scheduleComputerMove]);

  const resumeGame = useCallback(() => {
    if (gameResult || gameRef.current.isGameOver())
      return {
        ok: false,
        message: "The game is already over. You can review the moves or start a new game.",
      };
    if (!awaitingStartChoice && !isPaused) {
      if (!reviewMode) return { ok: false, message: "The game is already active." };
      exitReviewMode();
      return { ok: true, message: "Back at the live board." };
    }
    exitReviewMode();
    const current = gameRef.current;
    setAwaitingStartChoice(false);
    setIsPaused(false);
    pausedRef.current = false;
    if (
      settingsRef.current.gameMode === "computer" &&
      current.turn() !== settingsRef.current.playerColor &&
      !current.isGameOver() &&
      !isComputerThinking
    ) {
      scheduleComputerMove();
    }
    return {
      ok: true,
      message: awaitingStartChoice ? "The saved game is resumed." : "The game is resumed.",
    };
  }, [
    awaitingStartChoice,
    isComputerThinking,
    isPaused,
    scheduleComputerMove,
    reviewMode,
    exitReviewMode,
    gameResult,
  ]);

  const pauseGame = useCallback(() => {
    if (awaitingStartChoice) return { ok: false, message: "Choose Resume or New Game first." };
    if (gameResult) return { ok: false, message: "The game is already over." };
    if (pausedRef.current) return { ok: false, message: "The game is already paused." };
    pausedRef.current = true;
    setIsPaused(true);
    if (computerMoveTimeoutRef.current) {
      clearTimeout(computerMoveTimeoutRef.current);
      computerMoveTimeoutRef.current = null;
    }
    stockfishEngineRef.current?.stop();
    computerMoveActiveRef.current = false;
    setIsComputerThinking(false);
    return { ok: true, message: "The game is paused. Position questions still work." };
  }, [awaitingStartChoice, gameResult]);

  const exportFen = useCallback(() => {
    return game.fen();
  }, [game]);

  const importFen = useCallback(
    (fenStr: string) => {
      try {
        game.load(fenStr);
        setSelectedSquare(null);
        setLegalMoves([]);
        setPendingPromotion(null);
        setGameResult(null);
        setReviewMode(false);
        setReviewIndex(-1);
        setDisplayFen(null);
        setMoveFeedback(new Map());
        updateState();
        afterUserMove(false);
        return true;
      } catch {
        return false;
      }
    },
    [game, updateState, afterUserMove],
  );

  const undoMove = useCallback(() => {
    if (awaitingStartChoice) return { ok: false, message: "Choose Resume or New Game first." };
    if (history.length === 0) return { ok: false, message: "There is no player move to undo." };
    if (computerMoveTimeoutRef.current) {
      clearTimeout(computerMoveTimeoutRef.current);
      computerMoveTimeoutRef.current = null;
    }
    stockfishEngineRef.current?.stop();
    computerMoveActiveRef.current = false;
    setIsComputerThinking(false);
    if (game.isGameOver() && gameResult) {
      setGameResult(null);
    }

    let undoCount = 1;
    if (settingsRef.current.gameMode === "computer") {
      const verbose = game.history({ verbose: true });
      let latestPlayerIndex = -1;
      for (let index = verbose.length - 1; index >= 0; index--) {
        if (verbose[index].color === settingsRef.current.playerColor) {
          latestPlayerIndex = index;
          break;
        }
      }
      if (latestPlayerIndex < 0) {
        updateState();
        return { ok: false, message: "There is no player move to undo." };
      }
      undoCount = verbose.length - latestPlayerIndex;
    }

    setMoveFeedback((prev) => {
      const next = new Map(prev);
      for (let i = 0; i < undoCount; i++) {
        next.delete(history.length - 1 - i);
      }
      return next;
    });

    for (let i = 0; i < undoCount; i++) {
      game.undo();
    }
    setMoveFens(rebuildFensFromHistory(game.history()));
    setReviewMode(false);
    setReviewIndex(-1);
    setDisplayFen(null);
    updateState();
    return { ok: true, message: "Your latest turn was undone." };
  }, [game, history.length, updateState, gameResult, awaitingStartChoice]);

  const resign = useCallback(() => {
    if (awaitingStartChoice) return { ok: false, message: "Choose Resume or New Game first." };
    if (gameResult) return { ok: false, message: "The game is already over." };
    if (game.history().length === 0)
      return { ok: false, message: "Play at least one move before resigning." };
    if (computerMoveTimeoutRef.current) {
      clearTimeout(computerMoveTimeoutRef.current);
      computerMoveTimeoutRef.current = null;
    }
    stockfishEngineRef.current?.stop();
    computerMoveActiveRef.current = false;
    setIsComputerThinking(false);
    const winner =
      settingsRef.current.gameMode === "computer"
        ? settingsRef.current.playerColor === "w"
          ? "b"
          : "w"
        : game.turn() === "w"
          ? "b"
          : "w";
    const result: NonNullable<GameResult> = { winner, reason: "resign" };
    setGameResult(result);
    saveGame(game.fen(), game.history(), result);
    const winnerName = winner === "w" ? "White" : "Black";
    const loserName = winner === "w" ? "Black" : "White";
    setStatus(`${loserName} resigned — ${winnerName} wins!`);

    if (settingsRef.current.soundEnabled) {
      playCheckmateSound();
    }
    return { ok: true, message: "You resigned the game." };
  }, [game, gameResult, awaitingStartChoice]);

  const exportPgn = useCallback(() => {
    return game.pgn();
  }, [game]);

  const capturedPieces = useCallback(() => {
    const whiteCaptured: string[] = [];
    const blackCaptured: string[] = [];

    const verboseHistory = game.history({ verbose: true });
    for (const move of verboseHistory) {
      if (move.captured) {
        if (move.color === "w") {
          whiteCaptured.push(move.captured);
        } else {
          blackCaptured.push(move.captured);
        }
      }
    }

    const sortPieces = (pieces: string[]) =>
      pieces.sort((a, b) => (PIECE_VALUE[b] ?? 0) - (PIECE_VALUE[a] ?? 0));

    return {
      white: sortPieces(whiteCaptured),
      black: sortPieces(blackCaptured),
    };
  }, [game]);

  useEffect(() => {
    const saved = loadGame();
    if (saved) {
      try {
        game.reset();
        for (const move of saved.history) game.move(move);
        if (game.fen() !== saved.fen)
          throw new Error("Saved history does not match saved position.");
        setFen(saved.fen);
        setHistory(saved.history);
        const fens = rebuildFensFromHistory(game.history());
        setMoveFens(fens);
        setGameResult(saved.result);
        setAwaitingStartChoice(saved.history.length > 0 && !saved.result);
        if (saved.result?.reason === "resign") {
          const winner = saved.result.winner === "w" ? "White" : "Black";
          setStatus(`Game over by resignation. ${winner} won.`);
        } else {
          updateState();
        }
      } catch {
        game.reset();
        clearGame();
        updateState();
      }
    }
  }, []);

  useEffect(() => {
    if (initialBlackMoveScheduledRef.current) return;
    initialBlackMoveScheduledRef.current = true;
    if (
      settings.gameMode === "computer" &&
      settings.playerColor === "b" &&
      game.turn() === "w" &&
      game.history().length === 0 &&
      !game.isGameOver()
    ) {
      scheduleComputerMove();
    }
  }, [game, scheduleComputerMove, settings.gameMode, settings.playerColor]);

  useEffect(() => {
    const isComputerMode = settings.gameMode === "computer";

    if (isComputerMode && stockfishStatus === "unloaded") {
      initStockfish();
    }

    if (!isComputerMode && stockfishStatus !== "unloaded") {
      terminateStockfish();
    }
  }, [settings.gameMode, stockfishStatus]);

  useEffect(() => {
    if (
      prevModeRef.current !== settings.gameMode ||
      prevPlayerColorRef.current !== settings.playerColor
    ) {
      prevModeRef.current = settings.gameMode;
      prevPlayerColorRef.current = settings.playerColor;
      handleNewGame();
      if (settings.gameMode === "computer" && settings.playerColor === "b") {
        scheduleComputerMove();
      }
    }
  }, [settings.gameMode, settings.playerColor, handleNewGame, scheduleComputerMove]);

  useEffect(() => {
    return () => {
      if (computerMoveTimeoutRef.current) {
        clearTimeout(computerMoveTimeoutRef.current);
      }
      if (stockfishEngineRef.current) {
        stockfishEngineRef.current.terminate();
        stockfishEngineRef.current = null;
      }
      analysisEngineRef.current?.terminate();
      analysisEngineRef.current = null;
    };
  }, []);

  return {
    game,
    fen,
    history,
    status,
    selectedSquare,
    legalMoves,
    pendingPromotion,
    isComputerThinking,
    gameResult,
    awaitingStartChoice,
    isPaused,
    reviewMode,
    reviewIndex,
    moveFens,
    stockfishStatus,
    stockfishError,
    stockfishProgress,
    retryStockfish,
    moveFeedback,
    selectSquare,
    makeMove,
    getHint,
    promote,
    cancelPromotion,
    newGame,
    resumeGame,
    pauseGame,
    exportFen,
    importFen,
    undoMove,
    resign,
    exportPgn,
    capturedPieces,
    enterReviewMode,
    exitReviewMode,
    goToMove,
    displayFen,
  };
}

export type ChessSession = ReturnType<typeof useChessGame>;
