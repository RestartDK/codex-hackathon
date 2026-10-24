import { useEffect, useState } from "react";
import type { Color } from "chess.js";
import type { GameMode } from "../types";
import { useChessGame, type GameResult } from "../hooks/useChessGame";
import { useSettings } from "../hooks/useSettings";
import { useChessCompanion } from "../voice/useChessCompanion";
import type { AvailableDestination } from "../voice/navigation";
import GamePicker from "../components/PlayByVoice/GamePicker";
import ChessView from "../components/PlayByVoice/ChessView";
import AudioSettings from "../components/PlayByVoice/AudioSettings";
import Help from "../components/PlayByVoice/Help";
import CompanionDock from "../components/PlayByVoice/CompanionDock";
import ConfirmDialog from "../components/ConfirmDialog/ConfirmDialog";
import PromotionDialog from "../components/PromotionDialog/PromotionDialog";
import GameEndModal from "../components/GameEndModal/GameEndModal";
import "./App.css";

type View =
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "chess" }
  | { kind: "audio" | "help"; returnTo: "home" | "chess" };
type PreferenceChange = { kind: "color"; value: Color } | { kind: "mode"; value: GameMode };

export default function App() {
  const preferences = useSettings();
  const { settings } = preferences;
  const session = useChessGame({ settings });
  const [view, setView] = useState<View>({ kind: "home" });
  const [preferenceChange, setPreferenceChange] = useState<PreferenceChange | null>(null);
  const [dismissedResult, setDismissedResult] = useState<GameResult>(null);
  const result = session.gameResult;
  const resultMessage = result
    ? result.winner
      ? `${result.winner === "w" ? "White" : "Black"} wins by ${result.reason === "resign" ? "resignation" : result.reason}. The game is over.`
      : "The game is a draw."
    : null;

  function navigate(destination: AvailableDestination): string {
    setPreferenceChange(null);
    switch (destination) {
      case "chess":
        if (view.kind !== "chess") setView({ kind: "loading" });
        if (session.awaitingStartChoice)
          return `Chess is open. A saved game with ${session.history.length} moves is waiting. Would you like to resume or start a new game?`;
        if (session.isPaused)
          return "Chess is open. Your position is saved. Say resume to continue.";
        if (resultMessage)
          return `Chess is open. ${resultMessage} You can review the moves or request a new game.`;
        return `Chess is ready. ${settings.gameMode === "local" ? "This is a local two-player game." : `You play ${settings.playerColor === "w" ? "White" : "Black"}.`} ${session.history.length > 0 ? "Ask about the current board or request your next move." : "Would you like a quick spoken guide, or do you already know the rules?"}`;
      case "home":
        setView({ kind: "home" });
        return `You are back at the game picker. ${session.history.length > 0 ? "Your chess position is saved. Say play chess to return." : "Say play chess to begin."} Loups-Garous and Tic-Tac-Toe are coming soon.`;
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
      confirmMoves: settings.confirmMoves,
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

  const pendingDialog =
    companion.pending && companion.pending.kind !== "move" ? companion.pending : null;
  const showResult =
    view.kind === "chess" &&
    result &&
    result !== dismissedResult &&
    !session.reviewMode &&
    !pendingDialog &&
    !preferenceChange;
  const hasDialog = Boolean(
    pendingDialog ||
    preferenceChange ||
    (view.kind === "chess" && session.pendingPromotion) ||
    showResult,
  );
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
        className={`app-shell page-${view.kind}${chessVisible ? " theme-green" : ""}`}
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
            <ChessView session={session} settings={settings} companion={companion} />
          )}
          {view.kind === "audio" && (
            <AudioSettings
              preferences={preferences}
              onBack={() => {
                void companion.navigate(view.returnTo);
              }}
              onColorChange={(value) => {
                if (value !== settings.playerColor) setPreferenceChange({ kind: "color", value });
              }}
              onModeChange={(value) => {
                if (value !== settings.gameMode) setPreferenceChange({ kind: "mode", value });
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
      {pendingDialog && (
        <ConfirmDialog
          title={pendingDialog.kind === "navigation" ? "Leave the game?" : "Confirm your action"}
          message={
            pendingDialog.kind === "navigation"
              ? "Your current game will be saved. You can resume it when you return."
              : pendingDialog.description + "."
          }
          confirmLabel={pendingDialog.kind === "navigation" ? "Leave game" : "Confirm"}
          cancelLabel={pendingDialog.kind === "navigation" ? "Stay in game" : "Cancel"}
          onConfirm={() => {
            void companion.runCommand("yes");
          }}
          onCancel={() => {
            void companion.runCommand("cancel");
          }}
        />
      )}
      {preferenceChange && (
        <ConfirmDialog
          title="Start a new game?"
          message={`Changing ${preferenceChange.kind === "color" ? "your side" : "your opponent"} clears the current position. Your other preferences will stay the same.`}
          confirmLabel="Change and start again"
          onConfirm={() => {
            companion.cancelPending();
            if (preferenceChange.kind === "color")
              preferences.setPlayerColor(preferenceChange.value);
            else preferences.setGameMode(preferenceChange.value);
            setPreferenceChange(null);
          }}
          onCancel={() => setPreferenceChange(null)}
        />
      )}
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
            companion.cancelPending();
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
