import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Mic, MicOff, Square, Volume2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import type { Preferences } from "../../hooks/useSettings";
import { useLibraryVoice } from "../../voice/useLibraryVoice";
import { useTicTacToeGame } from "../../games/tic-tac-toe/useTicTacToeGame";
import {
  parseTicTacToePosition,
  POSITION_NAMES,
  type TicTacToeDifficulty,
} from "../../games/tic-tac-toe/ticTacToe";
import {
  createTicTacToeToolExecutor,
  type TicTacToeToolBridge,
} from "../../games/tic-tac-toe/ticTacToeTools";
import "./TicTacToePage.css";

const INTRODUCTION =
  "Tic-Tac-Toe is a three by three strategy game. You are X and move first. Make three X marks in a row, column, or diagonal before the computer makes three O marks. If all nine squares fill without a line, the round is a draw. Name squares by position, from top left to bottom right, or as square one through nine.";
const GUIDE =
  "Say play center, top left, or square nine. You can also ask describe the board, available squares, what is in a square, move history, whose turn, suggest a move, undo, pause, or new round. Direct moves play immediately. A move selected by the companion asks for confirmation.";
const DASHBOARD =
  "The dashboard has voice controls and a typed-command fallback, a three by three board, turn and difficulty status, the wins, losses, and draws scoreboard, move history, and undo, pause, new round, and reset match controls.";

function localIntent(
  command: string,
): { name: string; args: Record<string, unknown>; announce?: boolean } | null {
  const value = command
    .trim()
    .toLowerCase()
    .replace(/[,.!?]/g, "")
    .replace(/\s+/g, " ");
  if (/^(yes|confirm|do it|play it)$/.test(value))
    return { name: "confirm_tic_tac_toe_action", args: {} };
  if (/^(no|cancel|never mind|nevermind)$/.test(value))
    return { name: "cancel_tic_tac_toe_action", args: {}, announce: true };
  if (
    /^(board|describe (?:the )?board|board position|position|status|whose turn|what is happening)$/.test(
      value,
    )
  )
    return { name: "get_tic_tac_toe_state", args: {}, announce: true };
  if (/^(available|available squares|legal moves|what can i play|where can i play)$/.test(value))
    return { name: "get_available_tic_tac_toe_moves", args: {}, announce: true };
  if (/^(history|move history|what was played|what did the computer play)$/.test(value))
    return { name: "get_tic_tac_toe_history", args: {}, announce: true };
  if (/^(suggest|suggest a move|choose for me|play for me|help me move)$/.test(value))
    return { name: "suggest_tic_tac_toe_move", args: {} };
  if (/^(undo|undo turn|take that back)$/.test(value))
    return { name: "undo_tic_tac_toe_turn", args: {}, announce: true };
  if (/^(pause|pause game)$/.test(value))
    return { name: "propose_tic_tac_toe_control", args: { action: "pause" }, announce: true };
  if (/^(resume|resume game|resume saved round)$/.test(value))
    return { name: "propose_tic_tac_toe_control", args: { action: "resume" }, announce: true };
  if (/^(new round|start a new round|new game)$/.test(value))
    return { name: "propose_tic_tac_toe_control", args: { action: "new_round" } };
  if (/^(reset match|reset score|clear score|clear scoreboard)$/.test(value))
    return { name: "propose_tic_tac_toe_control", args: { action: "reset_match" } };
  const difficulty = value.match(/^(?:set |change (?:to )?)?(easy|medium|hard)(?: difficulty)?$/);
  if (difficulty)
    return { name: "set_tic_tac_toe_difficulty", args: { difficulty: difficulty[1] } };
  const inspect = value.match(/^(?:what is|whats|inspect|check) (?:in |at |on )?(.+)$/);
  if (inspect && parseTicTacToePosition(inspect[1]) !== null)
    return { name: "inspect_tic_tac_toe_cell", args: { position: inspect[1] }, announce: true };
  const position = parseTicTacToePosition(value);
  if (
    position !== null &&
    (/\b(play|place|put|move|mark|choose|select)\b/.test(value) ||
      value === POSITION_NAMES[position] ||
      /^(?:square )?(?:[1-9]|one|two|three|four|five|six|seven|eight|nine)$/.test(value))
  ) {
    return { name: "place_tic_tac_toe_mark", args: { position: POSITION_NAMES[position] } };
  }
  return null;
}

export default function TicTacToePage({
  onExit,
  preferences,
}: {
  onExit: () => void;
  preferences: Preferences;
}) {
  const game = useTicTacToeGame();
  const { settings, setScreenReaderMode } = preferences;
  const [, refreshPending] = useState(0);
  const [typedCommand, setTypedCommand] = useState("");
  const [response, setResponse] = useState("Ready. You are X. Choose any square.");
  const [focusedCell, setFocusedCell] = useState(0);
  const bridgeRef = useRef<TicTacToeToolBridge>(game);
  bridgeRef.current = game;
  const executorRef = useRef<ReturnType<typeof createTicTacToeToolExecutor> | null>(null);
  if (!executorRef.current)
    executorRef.current = createTicTacToeToolExecutor(
      () => bridgeRef.current,
      () => refreshPending((value) => value + 1),
    );
  const executor = executorRef.current;
  const { voice, runGlobalCommand } = useLibraryVoice(executor, "tic-tac-toe");
  const previousVoiceStatus = useRef(voice.status);
  const lastAnnouncedRevision = useRef(game.state.revision);
  const cellsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    game.setNarrationBusy(voice.status === "connected" && voice.isSpeaking);
  }, [game.setNarrationBusy, voice.isSpeaking, voice.status]);

  useEffect(() => {
    if (voice.status === "connected" && previousVoiceStatus.current !== "connected") {
      const welcome = game.awaitingStartChoice
        ? "Welcome back to Tic-Tac-Toe. Resume your saved round or start a new round?"
        : `Welcome to Tic-Tac-Toe. ${INTRODUCTION} Say help for the controls.`;
      setResponse(welcome);
      voice.announce(welcome);
    }
    previousVoiceStatus.current = voice.status;
  }, [game.awaitingStartChoice, voice.announce, voice.status]);

  useEffect(() => {
    if (game.state.revision === lastAnnouncedRevision.current) return;
    lastAnnouncedRevision.current = game.state.revision;
    setResponse(game.status);
    if (voice.status === "connected") voice.announce(game.status);
  }, [game.state.revision, game.status, voice.announce, voice.status]);

  async function execute(name: string, args: Record<string, unknown> = {}, announce = false) {
    const parsed = JSON.parse(await executor.execute(name, JSON.stringify(args))) as {
      message?: string;
      description?: string;
    };
    const message = parsed.message ?? parsed.description ?? "Done.";
    setResponse(message);
    if (announce && voice.status === "connected") voice.announce(message);
    return parsed;
  }

  async function runTypedCommand() {
    const value = typedCommand.trim();
    setTypedCommand("");
    if (!value) return;
    const global = await runGlobalCommand(value);
    if (global !== null) {
      setResponse(global);
      return;
    }
    const normalized = value
      .toLowerCase()
      .replace(/[,.!?]/g, "")
      .replace(/\s+/g, " ");
    if (
      /^(introduction|what is this game|what is tic tac toe|rules|how do i win|how do i lose)$/.test(
        normalized,
      )
    ) {
      setResponse(INTRODUCTION);
      if (voice.status === "connected") voice.announce(INTRODUCTION);
      return;
    }
    if (/^(guide|tutorial|how to play|help)$/.test(normalized)) {
      setResponse(GUIDE);
      if (voice.status === "connected") voice.announce(GUIDE);
      return;
    }
    if (/^(dashboard|describe dashboard|what is on the screen)$/.test(normalized)) {
      setResponse(DASHBOARD);
      if (voice.status === "connected") voice.announce(DASHBOARD);
      return;
    }
    const intent = localIntent(value);
    if (!intent) {
      setResponse(
        "I did not understand. Try play center, describe the board, available squares, suggest a move, or help.",
      );
      return;
    }
    await execute(intent.name, intent.args, intent.announce);
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = Math.floor(index / 3);
    const column = index % 3;
    let next = index;
    if (event.key === "ArrowRight") next = row * 3 + ((column + 1) % 3);
    else if (event.key === "ArrowLeft") next = row * 3 + ((column + 2) % 3);
    else if (event.key === "ArrowDown") next = ((row + 1) % 3) * 3 + column;
    else if (event.key === "ArrowUp") next = ((row + 2) % 3) * 3 + column;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 8;
    else return;
    event.preventDefault();
    setFocusedCell(next);
    cellsRef.current[next]?.focus();
  }

  const pending = executor.getPending();
  const boardDisabled =
    game.awaitingStartChoice ||
    game.paused ||
    game.state.status !== "playing" ||
    game.state.turn !== "X";

  return (
    <div className="app tic-tac-toe-app">
      <a href="#tic-tac-toe-main" className="skip-link">
        Skip to game
      </a>
      <header className="app-header">
        <button className="library-link" onClick={onExit}>
          Game library
        </button>
        <h1>Voice Tic-Tac-Toe</h1>
        <span className="game-badge">You are X</span>
      </header>
      <main id="tic-tac-toe-main" className="tic-tac-toe-main">
        <section
          className="tic-tac-toe-introduction"
          aria-labelledby="tic-tac-toe-introduction-heading"
        >
          <p className="voice-eyebrow">Three in a row</p>
          <h2 id="tic-tac-toe-introduction-heading">Beat the computer using voice alone</h2>
          <p>{INTRODUCTION}</p>
        </section>

        <Card className="voice-companion" aria-labelledby="tic-tac-toe-voice-heading">
          <div className="voice-heading-row">
            <div>
              <p className="voice-eyebrow">Conversational game controls</p>
              <h2 id="tic-tac-toe-voice-heading">Voice companion</h2>
              <p className="voice-status">
                {voice.status === "connected"
                  ? "Listening"
                  : voice.status === "connecting"
                    ? "Connecting…"
                    : voice.status === "closing"
                      ? "Ending voice…"
                      : voice.status === "error"
                        ? "Voice unavailable"
                        : "Voice is off"}
              </p>
            </div>
            {voice.status !== "connected" ? (
              <Button
                onClick={voice.start}
                disabled={voice.status === "connecting" || voice.status === "closing"}
                autoFocus
              >
                <Mic aria-hidden="true" size={20} /> Start voice companion
              </Button>
            ) : (
              <div className="voice-actions">
                <Button onClick={voice.toggleMicrophone} className="secondary-button">
                  {voice.microphoneMuted ? (
                    <MicOff aria-hidden="true" size={20} />
                  ) : (
                    <Mic aria-hidden="true" size={20} />
                  )}
                  {voice.microphoneMuted ? "Unmute" : "Mute"} microphone
                </Button>
                <Button onClick={voice.stop} className="danger-button">
                  <Square aria-hidden="true" size={18} /> End voice
                </Button>
              </div>
            )}
          </div>
          <p className="voice-help">
            Try: “play center,” “top left,” “describe the board,” “available squares,” or “suggest a
            move.”
          </p>
          <p className="dashboard-overview">{DASHBOARD}</p>
          {game.awaitingStartChoice && (
            <div className="resume-choice" role="group" aria-label="Saved Tic-Tac-Toe round choice">
              <p>A saved round is loaded. Resume it or start a new round?</p>
              <Button
                onClick={() =>
                  void execute("propose_tic_tac_toe_control", { action: "resume" }, true)
                }
              >
                Resume saved round
              </Button>
              <Button
                className="secondary-button"
                onClick={() => void execute("propose_tic_tac_toe_control", { action: "new_round" })}
              >
                Start a new round
              </Button>
            </div>
          )}
          <div className="voice-onboarding" role="group" aria-label="Tic-Tac-Toe introduction">
            <p>Need the rules or controls?</p>
            <Button
              onClick={() => {
                setResponse(INTRODUCTION);
                if (voice.status === "connected") voice.announce(INTRODUCTION);
              }}
            >
              Hear game introduction
            </Button>
            <Button
              className="secondary-button"
              onClick={() => {
                setResponse(GUIDE);
                if (voice.status === "connected") voice.announce(GUIDE);
              }}
            >
              Hear the quick guide
            </Button>
          </div>
          {voice.error && (
            <p role="alert" className="voice-error">
              {voice.error}
            </p>
          )}
          {voice.caption && (
            <p className="voice-caption">
              <strong>Caption:</strong> {voice.caption}
            </p>
          )}
          <form
            className="typed-command"
            onSubmit={(event) => {
              event.preventDefault();
              void runTypedCommand();
            }}
          >
            <label htmlFor="tic-tac-toe-command">Typed command fallback</label>
            <div>
              <input
                id="tic-tac-toe-command"
                value={typedCommand}
                onChange={(event) => setTypedCommand(event.target.value)}
                placeholder="play center"
              />
              <Button type="submit">Run command</Button>
            </div>
          </form>
          {pending && (
            <div
              className="pending-action"
              role="group"
              aria-label="Tic-Tac-Toe action confirmation"
            >
              <p>{pending.description}. Confirm?</p>
              <Button onClick={() => void execute("confirm_tic_tac_toe_action")}>Confirm</Button>
              <Button
                className="secondary-button"
                onClick={() => void execute("cancel_tic_tac_toe_action", {}, true)}
              >
                Cancel
              </Button>
            </div>
          )}
          <label className="tic-tac-toe-screen-reader">
            <input
              type="checkbox"
              checked={settings.screenReaderMode}
              onChange={(event) => setScreenReaderMode(event.target.checked)}
            />{" "}
            Screen-reader narration
          </label>
          <p
            className="sr-announcement"
            aria-live={settings.screenReaderMode ? "polite" : "off"}
            aria-atomic="true"
          >
            <Volume2 aria-hidden="true" size={18} /> {response}
          </p>
        </Card>

        <div className="tic-tac-toe-layout">
          <section className="tic-tac-toe-board-panel" aria-labelledby="tic-tac-toe-board-heading">
            <div className="tic-tac-toe-section-heading">
              <div>
                <p className="voice-eyebrow">Current round</p>
                <h2 id="tic-tac-toe-board-heading">Tic-Tac-Toe board</h2>
              </div>
              <span
                className={`tic-tac-toe-turn turn-${game.state.turn.toLowerCase()}`}
                role="status"
              >
                {game.status}
              </span>
            </div>
            <div
              className="tic-tac-toe-board"
              role="grid"
              aria-label="Tic-Tac-Toe board"
              aria-rowcount={3}
              aria-colcount={3}
            >
              {game.state.board.map((mark, index) => {
                const winning = game.state.winningLine?.includes(index);
                return (
                  <button
                    key={index}
                    ref={(node) => {
                      cellsRef.current[index] = node;
                    }}
                    type="button"
                    role="gridcell"
                    aria-label={`${POSITION_NAMES[index]}, ${mark === "X" ? "your X" : mark === "O" ? "computer O" : "empty"}`}
                    aria-disabled={boardDisabled || mark !== null}
                    tabIndex={focusedCell === index ? 0 : -1}
                    data-position={index + 1}
                    className={`tic-tac-toe-cell${mark ? ` cell-${mark.toLowerCase()}` : ""}${winning ? " winning-cell" : ""}`}
                    onFocus={() => setFocusedCell(index)}
                    onKeyDown={(event) => onCellKeyDown(event, index)}
                    onClick={() => {
                      if (!boardDisabled && mark === null) {
                        const result = game.playHumanMove(index);
                        setResponse(result.message);
                      }
                    }}
                  >
                    <span aria-hidden="true">{mark ?? index + 1}</span>
                    <span className="tic-tac-toe-cell-name" aria-hidden="true">
                      {POSITION_NAMES[index]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="tic-tac-toe-board-help">
              Squares 1–9 run left to right, top to bottom. Arrow keys move focus; Enter or Space
              selects.
            </p>
          </section>

          <aside className="tic-tac-toe-sidebar" aria-label="Round information and controls">
            <Card>
              <h2>Scoreboard</h2>
              <dl className="tic-tac-toe-score">
                <div>
                  <dt>Wins</dt>
                  <dd>{game.state.score.wins}</dd>
                </div>
                <div>
                  <dt>Losses</dt>
                  <dd>{game.state.score.losses}</dd>
                </div>
                <div>
                  <dt>Draws</dt>
                  <dd>{game.state.score.draws}</dd>
                </div>
              </dl>
            </Card>
            <Card>
              <h2>Computer</h2>
              <label htmlFor="tic-tac-toe-difficulty">Difficulty</label>
              <select
                id="tic-tac-toe-difficulty"
                value={game.state.difficulty}
                onChange={(event) => {
                  void execute("set_tic_tac_toe_difficulty", {
                    difficulty: event.target.value as TicTacToeDifficulty,
                  });
                }}
              >
                <option value="easy">Easy — random</option>
                <option value="medium">Medium — tactical</option>
                <option value="hard">Hard — unbeatable</option>
              </select>
            </Card>
            <Card>
              <h2>Move history</h2>
              {game.state.moves.length ? (
                <ol className="tic-tac-toe-history">
                  {game.state.moves.map((move, index) => (
                    <li key={`${index}-${move.index}`}>
                      {move.mark === "X" ? "You: X" : "Computer: O"} — {POSITION_NAMES[move.index]}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No moves yet.</p>
              )}
            </Card>
            <Card className="tic-tac-toe-controls">
              <h2>Controls</h2>
              <Button
                className="secondary-button"
                onClick={() => {
                  const result = game.undo();
                  setResponse(result.message);
                }}
                disabled={game.awaitingStartChoice || !game.state.moves.length}
              >
                Undo full turn
              </Button>
              <Button
                className="secondary-button"
                onClick={() => {
                  const result = game.paused ? game.resume() : game.pause();
                  setResponse(result.message);
                }}
                disabled={game.awaitingStartChoice || game.state.status !== "playing"}
              >
                {game.paused ? "Resume round" : "Pause round"}
              </Button>
              <Button
                onClick={() => void execute("propose_tic_tac_toe_control", { action: "new_round" })}
              >
                New round
              </Button>
              <Button
                className="danger-button"
                onClick={() =>
                  void execute("propose_tic_tac_toe_control", { action: "reset_match" })
                }
              >
                Reset match
              </Button>
            </Card>
          </aside>
        </div>

        {game.state.status !== "playing" && (
          <section
            className="tic-tac-toe-result"
            role="dialog"
            aria-modal="false"
            aria-labelledby="tic-tac-toe-result-heading"
          >
            <h2 id="tic-tac-toe-result-heading">
              {game.state.status === "draw"
                ? "Round drawn"
                : game.state.winner === "X"
                  ? "You win!"
                  : "Computer wins"}
            </h2>
            <p>{game.status}</p>
            <Button
              onClick={() => {
                const result = game.newRound();
                setResponse(result.message);
              }}
            >
              Play another round
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
