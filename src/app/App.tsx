import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { useChessGame, type GameResult } from "../hooks/useChessGame";
import type { Preferences } from "../hooks/useSettings";
import { useChessCompanion } from "../voice/useChessCompanion";
import { PLAYABLE_GAMES_LABEL, type AvailableDestination } from "../voice/navigation";
import GamePicker from "../components/PlayByVoice/GamePicker";
import ChessView from "../components/PlayByVoice/ChessView";
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
  | { kind: "chess" }
  | { kind: "audio" | "help"; returnTo: "home" | "chess" };

export default function PlayByVoiceApp({
  preferences,
  onPlayLoupsGarous,
}: {
  preferences: Preferences;
  onPlayLoupsGarous: () => void;
}) {
  const { settings } = preferences;
  const session = useChessGame({ settings });
  const [view, setView] = useState<View>({ kind: "home" });
  const [flipped, setFlipped] = useState(false);
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
        onPlayLoupsGarous();
        return "Loups-Garous is open. Say start the game. Use Games to return to the game picker.";
      case "home":
        setView({ kind: "home" });
        return `You are back at the game picker. ${session.history.length > 0 ? "Your chess position is saved. Say play chess to return." : "Say play chess to begin."} ${PLAYABLE_GAMES_LABEL} are ready to play. Tic-Tac-Toe is coming soon.`;
      case "audio":
      case "help": {
        const returnTo =
          view.kind === "chess" || view.kind === "loading"
            ? "chess"
            : view.kind === "home"
              ? "home"
              : view.returnTo;
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
      getHint: session.getHint,
      newGame: () => {
        session.newGame();
        setView({ kind: "chess" });
      },
      resumeGame: session.resumeGame,
      pauseGame: session.pauseGame,
      undoMove: session.undoMove,
      resign: session.resign,
    },
    settings.screenReaderMode,
    settings.voiceVolume,
    resultMessage,
  );

  useEffect(() => {
    if (view.kind !== "loading") return;
    if (
      settings.gameMode === "computer" &&
      (session.stockfishStatus === "loading" || session.stockfishStatus === "unloaded")
    )
      return;
    const frame = requestAnimationFrame(() => setView({ kind: "chess" }));
    return () => cancelAnimationFrame(frame);
  }, [view.kind, session.stockfishStatus, settings.gameMode]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("page-heading")?.focus({ preventScroll: true });
  }, [view.kind]);

  const showResult =
    view.kind === "chess" && result && result !== dismissedResult && !session.reviewMode;
  const hasDialog = Boolean((view.kind === "chess" && session.pendingPromotion) || showResult);
  const chessVisible = view.kind === "chess";

  useEffect(() => {
    if (!hasDialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [hasDialog]);

  return (
    <>
      <div
        className={`pbv-shell page-${view.kind}${chessVisible ? " theme-green" : ""}`}
        inert={hasDialog || undefined}
      >
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <header className="site-header">
          <button
            className="brand"
            onClick={() => {
              void companion.navigate("home");
            }}
            aria-label="Play by Voice, game picker"
          >
            Play by Voice
          </button>
          {(chessVisible || view.kind === "loading") && (
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
        <main id="main-content" className="main-content">
          {view.kind === "home" && <GamePicker companion={companion} />}
          {view.kind === "loading" && (
            <section className="loading-page" aria-labelledby="page-heading">
              <div className="loading-center" role="status">
                <span className="game-shape triangle rotating-shape" aria-hidden="true" />
                <h1 id="page-heading" tabIndex={-1}>
                  Loading
                </h1>
                <p>Getting your chessboard ready.</p>
              </div>
              <button
                className="loading-back"
                onClick={() => {
                  void companion.navigate("home");
                }}
              >
                Go back to main
              </button>
            </section>
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
                void companion.navigate(view.returnTo);
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
                void companion.navigate(view.returnTo);
              }}
            />
          )}
        </main>
        <CompanionDock
          companion={companion}
          green={chessVisible}
          screenReaderMode={settings.screenReaderMode}
        />
      </div>
      {view.kind === "chess" && session.pendingPromotion && (
        <PromotionDialog
          color={session.game.turn()}
          onPromote={session.promote}
          onCancel={session.cancelPromotion}
        />
      )}
      {showResult && (
        <GameEndModal
          result={result}
          onNewGame={() => {
            companion.cancelRequests();
            session.newGame();
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
