import { useEffect, useState } from "react";
import type { Color } from "chess.js";
import type { GameMode } from "../types";
import { useChessGame, type GameResult } from "../hooks/useChessGame";
import type { Preferences } from "../hooks/useSettings";
import { useChessCompanion } from "../voice/useChessCompanion";
import { PLAYABLE_GAMES_LABEL, type AvailableDestination } from "../voice/navigation";
import GamePicker from "../components/PlayByVoice/GamePicker";
import ChessView from "../components/PlayByVoice/ChessView";
import ChessSetup, { type ChessSetupSelection } from "../components/PlayByVoice/ChessSetup";
import AudioSettings from "../components/PlayByVoice/AudioSettings";
import Help from "../components/PlayByVoice/Help";
import CompanionDock from "../components/PlayByVoice/CompanionDock";
import ConfirmDialog from "../components/ConfirmDialog/ConfirmDialog";
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
type PreferenceChange = { kind: "color"; value: Color } | { kind: "mode"; value: GameMode };

function defaultChessSetup(): ChessSetupSelection {
  return {
    gameMode: "computer",
    difficulty: "beginner",
    playerColor: "w",
    timerMinutes: null,
    explainRules: false,
  };
}

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
        return view.kind === "chess"
          ? "Chess is already open. You can make a move, ask for a hint, or start a new game."
          : "Chess is loading. Setup will open when the chess engine is ready.";
      case "loups-garous":
        onPlayLoupsGarous();
        return "Loups-Garous is open. Say start the game. Use Games to return to the game picker.";
      case "home":
        if (view.kind === "loading") session.cancelStockfishPreparation();
        setView({ kind: "home" });
        return `You are back at the game picker. ${session.history.length > 0 ? "Your chess position is saved. Say play chess to return." : "Say play chess to begin."} ${PLAYABLE_GAMES_LABEL} are ready to play. Tic-Tac-Toe is coming soon.`;
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
      confirmMoves: settings.confirmMoves,
      makeMove: session.makeMove,
      getHint: session.getHint,
      newGame: () => {
        setView({ kind: "chess-setup" });
      },
      startDefaultGame: () => {
        if (view.kind === "chess-setup") startChess(defaultChessSetup());
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

  function startChess(selection: ChessSetupSelection) {
    const applied = {
      gameMode: selection.gameMode,
      difficulty: selection.difficulty,
      playerColor: selection.playerColor,
    };
    preferences.applyChessSetup(applied);
    session.startConfiguredGame(applied);
    setDismissedResult(null);
    setView({ kind: "chess" });
    const color = selection.playerColor === "w" ? "White" : "Black";
    const turn = selection.playerColor === "b" ? "White" : color;
    companion.announce(
      `You play ${color}. ${turn} to move.${selection.explainRules ? " Use the board or say a move such as e2 to e4. You can ask for a hint, board description, undo, pause, or help." : ""}`,
    );
  }

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
      announce("Chess setup is ready. Choose each preference, or say start with the defaults.");
      setView({ kind: "chess-setup" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view.kind, stockfishStatus, prepareStockfish, announce]);

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

  return (
    <>
      <div
        className={`pbv-shell page-${view.kind}${view.kind === "chess-setup" || chessVisible ? " theme-green" : ""}`}
        inert={hasDialog || undefined}
      >
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <header className="site-header">
          <button
            className="brand"
            onClick={() => {
              if (view.kind === "loading" || view.kind === "chess-setup") {
                if (view.kind === "loading") session.cancelStockfishPreparation();
                companion.cancelPending();
                setView({ kind: "home" });
              } else {
                void companion.navigate("home");
              }
            }}
            aria-label="Play by Voice, game picker"
          >
            Play by Voice
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
        <main id="main-content" className="main-content">
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
                        companion.cancelPending();
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
                    companion.cancelPending();
                    setView({ kind: "home" });
                  }}
                >
                  Go back to main
                </button>
              )}
            </section>
          )}
          {view.kind === "chess-setup" && (
            <ChessSetup
              onCancel={() => {
                companion.cancelPending();
                setView({ kind: "home" });
              }}
              onStart={startChess}
            />
          )}
          {view.kind === "chess" && (
            <ChessView session={session} settings={settings} companion={companion} />
          )}
          {view.kind === "audio" && (
            <AudioSettings
              preferences={preferences}
              onBack={() => {
                setView({ kind: view.returnTo });
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
                setView({ kind: view.returnTo });
              }}
            />
          )}
        </main>
        <CompanionDock
          companion={companion}
          green={view.kind === "chess-setup" || chessVisible}
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
