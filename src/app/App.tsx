import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useChessGame, type GameResult } from "../hooks/useChessGame";
import type { Preferences } from "../hooks/useSettings";
import { useChessCompanion } from "../voice/useChessCompanion";
import { PLAYABLE_GAMES_LABEL, type AvailableDestination } from "../voice/navigation";
import GamePicker from "../components/PlayByVoice/GamePicker";
import ChessView from "../components/PlayByVoice/ChessView";
import ChessSetup from "../components/PlayByVoice/ChessSetup";
import {
  chessSetupSelection,
  defaultChessSetup,
  describeChessSetup,
  reduceChessSetup,
  type ChessSetupCommand,
  type ChessSetupSelection,
  type ChessSetupState,
} from "../components/PlayByVoice/chessSetup";
import type { AppControlAction } from "../voice/chessCommands";
import AudioSettings from "../components/PlayByVoice/AudioSettings";
import Help from "../components/PlayByVoice/Help";
import CompanionDock from "../components/PlayByVoice/CompanionDock";
import PromotionDialog from "../components/PromotionDialog/PromotionDialog";
import GameEndModal from "../components/GameEndModal/GameEndModal";
import "./main.css";
import "./App.css";

type View =
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "chess-setup" }
  | { kind: "chess" }
  | { kind: "audio" | "help"; returnTo: "home" | "loading" | "chess-setup" | "chess" };

export default function PlayByVoiceApp({
  preferences,
  initialDestination = "home",
  autoVoice = false,
  onPlayLoupsGarous,
  onPlayLudo,
  onPlayIntercept,
  onPlayTicTacToe,
}: {
  preferences: Preferences;
  initialDestination?: AvailableDestination;
  autoVoice?: boolean;
  onPlayLoupsGarous: (autoVoice?: boolean) => void;
  onPlayLudo: (autoVoice?: boolean) => void;
  onPlayIntercept: (autoVoice?: boolean) => void;
  onPlayTicTacToe: (autoVoice?: boolean) => void;
}) {
  const { settings } = preferences;
  const [view, setView] = useState<View>(() =>
    initialDestination === "chess"
      ? { kind: "loading" }
      : initialDestination === "audio" || initialDestination === "help"
        ? { kind: initialDestination, returnTo: "home" }
        : { kind: "home" },
  );
  const [setup, setSetup] = useState<ChessSetupState>(defaultChessSetup);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const session = useChessGame({ settings, active: view.kind === "chess" });
  const [flipped, setFlipped] = useState(settings.playerColor === "b");
  const [dismissedResult, setDismissedResult] = useState<GameResult>(null);
  const result = session.gameResult;
  const resultMessage = result
    ? result.winner
      ? `${result.winner === "w" ? "White" : "Black"} wins by ${result.reason === "resign" ? "resignation" : result.reason}. The game is over.`
      : "The game is a draw."
    : null;

  function navigate(destination: AvailableDestination): string {
    switch (destination) {
      case "chess":
        if (view.kind !== "chess") setView({ kind: "loading" });
        if (view.kind !== "chess")
          return "Opening the chessboard. Your saved position will resume. Say new game to change the setup.";
        if ((session.awaitingStartChoice || session.isPaused) && !resultMessage) {
          const resumed = session.resumeGame();
          return resumed.ok
            ? `Chess is resumed. ${session.game.turn() === "w" ? "White" : "Black"} to move. Say your move to play it.`
            : resumed.message;
        }
        if (resultMessage)
          return `Chess is open. ${resultMessage} You can review the moves or request a new game.`;
        return `Chess is ready. ${settings.gameMode === "local" ? "This is a local two-player game." : `You play ${settings.playerColor === "w" ? "White" : "Black"}.`} ${session.history.length > 0 ? "Ask about the current board or request your next move." : "Say a move to play it immediately, or say quick guide to hear the rules."}`;
      case "loups-garous":
        onPlayLoupsGarous(companion.voice.status === "connected");
        return "Loups-Garous is open. Say start the game. Use Games to return to the game picker.";
      case "ludo":
        onPlayLudo(companion.voice.status === "connected");
        return "Ludo is open. Say roll to begin, or ask for the rules or board configuration.";
      case "intercept":
        onPlayIntercept(companion.voice.status === "connected");
        return "The Intercept is open. Listen to the scene, then speak a numbered choice.";
      case "tic-tac-toe":
        onPlayTicTacToe(companion.voice.status === "connected");
        return "Tic-Tac-Toe is open. You are X. Say a square such as center or top left.";
      case "home":
        if (view.kind === "loading") session.cancelStockfishPreparation();
        setView({ kind: "home" });
        return `You are back at the game picker. ${session.history.length > 0 ? "Your chess position is saved. Say play chess to return." : "Say play chess to begin."} ${PLAYABLE_GAMES_LABEL} are ready to play.`;
      case "audio":
      case "help": {
        const returnTo = view.kind === "audio" || view.kind === "help" ? view.returnTo : view.kind;
        setView({ kind: destination, returnTo });
        return destination === "audio"
          ? "Audio settings are open. Adjust narrator volume, game sounds, or chess preferences. Say play chess to return to the board."
          : "Help is open. Ask about chess rules or commands, or say play chess to begin.";
      }
    }
  }

  const companion = useChessCompanion(
    {
      game: session.game,
      history: session.history,
      playerColor: settings.gameMode === "local" ? session.game.turn() : settings.playerColor,
      view: view.kind,
      navigate,
      awaitingStartChoice: session.awaitingStartChoice,
      isTerminated: Boolean(result),
      isPaused: session.isPaused,
      settings,
      updateSettings: preferences.updateSettings,
      review: session.displayFen
        ? { game: new Chess(session.displayFen), move: session.reviewIndex + 1 }
        : null,
      reviewMove: (move) => {
        if (move > session.history.length)
          return { ok: false, message: "That move has not been played." };
        if (session.history.length === 0)
          return { ok: false, message: "No moves have been played yet." };
        session.enterReviewMode();
        session.goToMove(move - 1);
        return {
          ok: true,
          message:
            move === 0
              ? "Reviewing the starting position."
              : `Reviewing move ${move}: ${session.history[move - 1]}.`,
        };
      },
      returnToLive: session.exitReviewMode,
      flipBoard: () => setFlipped((value) => !value),
      retryEngine: session.retryStockfish,
      makeMove: session.makeMove,
      pendingPromotion: session.pendingPromotion,
      promote: session.promote,
      cancelPromotion: session.cancelPromotion,
      getHint: session.getHint,
      newGame: () => {
        session.pauseGame();
        setView({ kind: "chess-setup" });
      },
      setup,
      setupCommand: applySetupCommand,
      appControl,
      resumeGame: () => {
        if (view.kind !== "chess") {
          setView({ kind: "loading" });
          return { ok: true, message: "Opening the saved chessboard." };
        }
        return session.resumeGame();
      },
      pauseGame: session.pauseGame,
      undoMove: session.undoMove,
      resign: session.resign,
    },
    settings.screenReaderMode,
    settings.voiceVolume,
    resultMessage,
  );

  function startChess(selection: ChessSetupSelection): string {
    const applied = {
      gameMode: selection.gameMode,
      difficulty: selection.difficulty,
      playerColor: selection.playerColor,
    };
    preferences.applyChessSetup(applied);
    session.startConfiguredGame(applied);
    session.prepareStockfish();
    // Playing Black against the computer starts with Black at the bottom.
    setFlipped(applied.gameMode === "computer" && applied.playerColor === "b");
    setDismissedResult(null);
    setView({ kind: "chess" });
    const color = selection.playerColor === "w" ? "White" : "Black";
    const turn = selection.playerColor === "b" ? "White" : color;
    const announcement = `You play ${color}. ${turn} to move.${selection.explainRules ? " Use the board or say a move such as e2 to e4. You can ask for a hint, board description, undo, pause, or help." : ""}`;
    companion.announce(announcement);
    return `Chess has started. ${announcement}`;
  }

  function applySetupCommand(command: ChessSetupCommand): string {
    const outcome = reduceChessSetup(setupRef.current, command);
    setupRef.current = outcome.state;
    setSetup(outcome.state);
    if (outcome.effect === "cancel") {
      companion.cancelRequests();
      setView({ kind: "home" });
      return "Chess setup is closed. You are back at the game picker.";
    }
    if (outcome.effect === "start") return startChess(chessSetupSelection(outcome.state));
    return describeChessSetup(outcome.state);
  }

  function closeResult(): string {
    setDismissedResult(result);
    return "The game result is closed. You can review the moves or start a new game.";
  }

  function goBack(): { ok: boolean; message: string } {
    if (view.kind === "chess-setup")
      return { ok: true, message: applySetupCommand({ kind: "back" }) };
    if (view.kind === "audio" || view.kind === "help") {
      setView({ kind: view.returnTo });
      return {
        ok: true,
        message:
          view.returnTo === "chess-setup"
            ? `Closed ${view.kind === "audio" ? "audio settings" : "help"}. ${describeChessSetup(setupRef.current)}`
            : `Closed ${view.kind === "audio" ? "audio settings" : "help"}.`,
      };
    }
    if (view.kind === "loading") {
      session.cancelStockfishPreparation();
      companion.cancelRequests();
      setView({ kind: "home" });
      return { ok: true, message: "Chess loading stopped. You are back at the game picker." };
    }
    if (view.kind === "chess") {
      if (session.pendingPromotion) {
        session.cancelPromotion();
        return { ok: true, message: "Promotion cancelled. Choose a move or name the piece." };
      }
      if (result && result !== dismissedResult) return { ok: true, message: closeResult() };
      if (session.reviewMode) {
        session.exitReviewMode();
        return { ok: true, message: "Back at the live board." };
      }
      session.pauseGame();
      companion.cancelRequests();
      setView({ kind: "home" });
      return {
        ok: true,
        message:
          "You are back at the game picker. Your chess position is saved. Say play chess to return.",
      };
    }
    return { ok: false, message: "You are already at the game picker." };
  }

  function appControl(action: AppControlAction): { ok: boolean; message: string } {
    switch (action) {
      case "back":
        return goBack();
      case "close":
        if (view.kind === "audio" || view.kind === "help") return goBack();
        if (view.kind === "chess" && session.pendingPromotion) {
          session.cancelPromotion();
          return { ok: true, message: "Promotion cancelled. Choose a move or name the piece." };
        }
        if (view.kind === "chess" && result && result !== dismissedResult)
          return { ok: true, message: closeResult() };
        return { ok: false, message: "There is no dialog to close." };
      case "dismiss_result":
        if (!result) return { ok: false, message: "No finished game result is open." };
        return { ok: true, message: closeResult() };
      case "review_result":
        if (!result) return { ok: false, message: "No finished game result is open." };
        setDismissedResult(result);
        session.enterReviewMode();
        return {
          ok: true,
          message: "Reviewing the finished game. Say live board when you want to return.",
        };
    }
  }

  const startVoice = useRef(companion.voice.start);
  startVoice.current = companion.voice.start;
  useEffect(() => {
    if (autoVoice) void startVoice.current();
  }, [autoVoice]);

  const stockfishStatus = session.stockfishStatus;
  const prepareStockfish = session.prepareStockfish;
  const announce = companion.announce;

  useEffect(() => {
    if (view.kind !== "loading") return;
    if (stockfishStatus === "unloaded") {
      prepareStockfish();
      return;
    }
    if (stockfishStatus === "loading" || stockfishStatus === "error") return;
    const frame = requestAnimationFrame(() => {
      if (session.awaitingStartChoice || session.isPaused) session.resumeGame();
      announce(
        `Chess is ready. You play ${settings.playerColor === "w" ? "White" : "Black"}. ${session.game.turn() === "w" ? "White" : "Black"} to move. Say your move, or new game to change the setup.`,
      );
      setView({ kind: "chess" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view.kind, stockfishStatus, prepareStockfish, announce]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("page-heading")?.focus({ preventScroll: true });
  }, [view.kind]);

  const showResult =
    view.kind === "chess" && result && result !== dismissedResult && !session.reviewMode;
  const hasDialog = Boolean((view.kind === "chess" && session.pendingPromotion) || showResult);
  const chessVisible = view.kind === "chess";
  const chessContextVisible =
    view.kind === "loading" || view.kind === "chess-setup" || view.kind === "chess";

  useEffect(() => {
    if (!hasDialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [hasDialog]);

  const commandControls = (
    <CompanionDock
      companion={companion}
      green={view.kind === "chess-setup" || chessVisible}
      screenReaderMode={settings.screenReaderMode}
    />
  );

  return (
    <>
      <div
        className={`pbv-shell page-${view.kind}${view.kind === "chess-setup" || chessVisible ? " theme-green" : ""}`}
      >
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <header className="site-header" inert={hasDialog || undefined}>
          <button
            className="brand"
            onClick={() => {
              if (view.kind === "loading" || view.kind === "chess-setup") {
                if (view.kind === "loading") session.cancelStockfishPreparation();
                companion.cancelRequests();
                setView({ kind: "home" });
              } else {
                void companion.navigate("home");
              }
            }}
            aria-label="Playora, game picker"
          >
            Playora
          </button>
          {chessContextVisible && (
            <span className="header-game">
              <span aria-hidden="true">•</span> Chess
            </span>
          )}
          <nav aria-label="Main navigation">
            <button
              aria-current={view.kind === "audio" ? "page" : undefined}
              onClick={() => {
                void companion.navigate("audio");
              }}
            >
              Audio Settings
            </button>
            <button
              aria-current={view.kind === "help" ? "page" : undefined}
              onClick={() => {
                void companion.navigate("help");
              }}
            >
              Help
            </button>
          </nav>
        </header>
        <main id="main-content" className="main-content" inert={hasDialog || undefined}>
          {view.kind === "home" && <GamePicker companion={companion} />}
          {view.kind === "loading" && (
            <section className="loading-page" aria-labelledby="page-heading">
              {session.stockfishStatus === "error" ? (
                <div className="loading-error" role="alert">
                  <h1 id="page-heading" tabIndex={-1}>
                    Chess could not load
                  </h1>
                  <p>{session.stockfishError ?? "The chess engine could not be initialized."}</p>
                  <div>
                    <button type="button" onClick={session.retryStockfish}>
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        session.cancelStockfishPreparation();
                        companion.cancelRequests();
                        setView({ kind: "home" });
                      }}
                    >
                      Back to games
                    </button>
                  </div>
                </div>
              ) : (
                <div className="loading-center" role="status" aria-live="polite">
                  <div className="loading-visual" aria-hidden="true">
                    <span className="loading-triangle" />
                    <h1 id="page-heading" tabIndex={-1}>
                      Loading
                    </h1>
                  </div>
                  <span className="sr-only">Preparing the chess engine and board.</span>
                </div>
              )}
              {session.stockfishStatus !== "error" && (
                <button
                  className="loading-back"
                  onClick={() => {
                    session.cancelStockfishPreparation();
                    companion.cancelRequests();
                    setView({ kind: "home" });
                  }}
                >
                  Go back to main
                </button>
              )}
            </section>
          )}
          {view.kind === "chess-setup" && (
            <ChessSetup state={setup} onCommand={applySetupCommand} />
          )}
          {view.kind === "chess" && (
            <ChessView
              session={session}
              settings={settings}
              companion={companion}
              flipped={flipped}
            />
          )}
          {view.kind === "audio" && (
            <AudioSettings
              preferences={preferences}
              onBack={() => {
                setView({ kind: view.returnTo });
              }}
              onColorChange={(color) => {
                companion.cancelRequests();
                preferences.setPlayerColor(color);
              }}
              onModeChange={(mode) => {
                companion.cancelRequests();
                preferences.setGameMode(mode);
              }}
            />
          )}
          {view.kind === "help" && (
            <Help
              companion={companion}
              onBack={() => {
                setView({ kind: view.returnTo });
              }}
            />
          )}
        </main>
        {!hasDialog && commandControls}
      </div>
      {view.kind === "chess" && session.pendingPromotion && (
        <PromotionDialog
          color={session.game.turn()}
          onPromote={session.promote}
          onCancel={session.cancelPromotion}
          commandControls={commandControls}
        />
      )}
      {showResult && (
        <GameEndModal
          commandControls={commandControls}
          result={result}
          onNewGame={() => {
            companion.cancelRequests();
            setView({ kind: "chess-setup" });
          }}
          onEnterReview={() => {
            setDismissedResult(result);
            session.enterReviewMode();
          }}
        />
      )}
    </>
  );
}
