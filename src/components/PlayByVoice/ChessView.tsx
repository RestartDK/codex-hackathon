import { Chess } from "chess.js";
import { RotateCw, House, Undo2, Flag, Pause, Play, FlipVertical2 } from "lucide-react";
import Board from "../Board/Board";
import type { ChessSession } from "../../hooks/useChessGame";
import type { AppSettings } from "../../types";
import type { ChessCompanion } from "../../voice/useChessCompanion";

export default function ChessView({
  session,
  settings,
  companion,
  flipped,
}: {
  session: ChessSession;
  settings: AppSettings;
  companion: ChessCompanion;
  flipped: boolean;
}) {
  const moves = session.game.history({ verbose: true });
  const last = session.reviewMode ? moves[session.reviewIndex] : moves.at(-1);
  const position = session.displayFen ? new Chess(session.displayFen) : session.game;
  const king = position.isCheck()
    ? position
        .board()
        .flat()
        .find((piece) => piece?.type === "k" && piece.color === position.turn())
    : null;
  const controlsDisabled = session.awaitingStartChoice || Boolean(session.gameResult);
  return (
    <section className="chess-page" aria-labelledby="page-heading">
      <h1 id="page-heading" className="sr-only" tabIndex={-1}>
        Chess
      </h1>
      <nav className="game-rail" aria-label="Game navigation">
        <button
          className="round-control"
          aria-label="Start a new game"
          title="Start a new game"
          onClick={() => {
            void companion.runTool("game_control", { action: "new_game" });
          }}
        >
          <RotateCw size={23} aria-hidden="true" />
        </button>
        <button
          className="round-control"
          aria-label="Return to game picker"
          title="Return to game picker"
          onClick={() => {
            void companion.navigate("home");
          }}
        >
          <House size={22} aria-hidden="true" />
        </button>
      </nav>
      <div className="chess-layout">
        <div className="chess-board-column">
          {session.awaitingStartChoice && (
            <div className="game-notice">
              <p>A saved game is waiting.</p>
              <div>
                <button
                  className="pill-button primary"
                  onClick={() => {
                    void companion.runCommand("resume");
                  }}
                >
                  Resume game
                </button>
                <button
                  className="pill-button"
                  onClick={() => {
                    void companion.runCommand("new game");
                  }}
                >
                  New game
                </button>
              </div>
            </div>
          )}
          <Board
            game={session.game}
            selectedSquare={session.selectedSquare}
            legalMoves={session.legalMoves}
            onSquareClick={session.selectSquare}
            boardOrientation={settings.boardOrientation}
            boardTheme={settings.boardTheme}
            pieceSet={settings.pieceSet}
            isComputerThinking={session.isComputerThinking}
            lastMove={last ? { from: last.from, to: last.to } : null}
            kingInCheck={king ? { square: king.square, color: king.color } : null}
            displayFen={session.displayFen}
            manualFlip={flipped}
          />
          <div className="board-status" role="status">
            <span className={`status-dot${session.isComputerThinking ? " is-thinking" : ""}`} />
            <span>
              {session.isPaused
                ? "Game paused"
                : session.isComputerThinking
                  ? "Computer is thinking"
                  : session.status}
            </span>
            <span className="playing-as">
              {settings.gameMode === "local"
                ? "Local two-player"
                : `You play ${settings.playerColor === "w" ? "White" : "Black"}`}
            </span>
          </div>
          <div className="board-actions" aria-label="Chess controls">
            <button
              disabled={controlsDisabled || session.history.length === 0 || companion.busy}
              onClick={() => {
                void companion.runCommand("undo");
              }}
            >
              <Undo2 size={16} aria-hidden="true" /> Undo
            </button>
            <button
              disabled={controlsDisabled}
              onClick={() => {
                void companion.runCommand(session.isPaused ? "resume" : "pause");
              }}
            >
              {session.isPaused ? (
                <Play size={15} aria-hidden="true" />
              ) : (
                <Pause size={15} aria-hidden="true" />
              )}{" "}
              {session.isPaused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => {
                void companion.runTool("game_control", { action: "flip_board" });
              }}
            >
              <FlipVertical2 size={15} aria-hidden="true" /> Flip
            </button>
            <button
              disabled={controlsDisabled || session.history.length === 0}
              onClick={() => {
                void companion.runCommand("resign");
              }}
            >
              <Flag size={15} aria-hidden="true" /> Resign
            </button>
          </div>
          {session.stockfishStatus === "error" && (
            <div className="engine-notice" role="alert">
              <p>
                The local engine could not load. Computer turns and hints need Stockfish. Retry the
                engine, or choose Local two-player in Audio Settings.
              </p>
              <button className="pill-button" onClick={session.retryStockfish}>
                Retry engine
              </button>
            </div>
          )}
          {session.reviewMode && (
            <div className="review-controls">
              <span>
                Reviewing move {session.reviewIndex + 1} of {moves.length}
              </span>
              <button className="pill-button" onClick={session.exitReviewMode}>
                Back to live board
              </button>
            </div>
          )}
        </div>
        <div className="chess-side-column">
          <section className="surface move-history" aria-labelledby="history-heading">
            <h2 id="history-heading">Move history</h2>
            <ol className="move-list" aria-label="Played moves">
              {moves.map((move, index) => (
                <li key={`${index}-${move.lan}`}>
                  <button
                    className={
                      (
                        session.reviewMode
                          ? session.reviewIndex === index
                          : index === moves.length - 1
                      )
                        ? "current-move"
                        : ""
                    }
                    aria-label={`Move ${index + 1}, ${move.color === "w" ? "White" : "Black"}, ${move.san}, ${move.from} to ${move.to}`}
                    aria-current={
                      (
                        session.reviewMode
                          ? session.reviewIndex === index
                          : index === moves.length - 1
                      )
                        ? "step"
                        : undefined
                    }
                    onClick={() => {
                      void companion.runTool("review_move", { move: index + 1 });
                    }}
                  >
                    <span>
                      {move.piece === "p" ? "" : move.piece.toUpperCase()}
                      {move.from} <span aria-hidden="true">→</span> {move.to}
                      {move.promotion ? ` = ${move.promotion.toUpperCase()}` : ""}
                    </span>
                    <span className="move-number">{index + 1}</span>
                  </button>
                </li>
              ))}
            </ol>
            {moves.length === 0 && (
              <p className="empty-history">
                Your story starts with the first move.
                <br />
                <span>Try "e2 to e4" with your companion.</span>
              </p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
