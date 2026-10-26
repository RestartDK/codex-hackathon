import { ArrowLeft, ArrowUp, Check, Keyboard, Square, X as CloseIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Preferences } from "../../hooks/useSettings";
import {
  DEFAULT_TIC_TAC_TOE_SETUP,
  parseTicTacToePosition,
  POSITION_NAMES,
  type TicTacToeFirstTurn,
  type TicTacToeMark,
  type TicTacToeOpponent,
  type TicTacToeSetup,
} from "../../games/tic-tac-toe/ticTacToe";
import { useTicTacToeGame } from "../../games/tic-tac-toe/useTicTacToeGame";
import {
  createTicTacToeToolExecutor,
  type TicTacToeToolBridge,
} from "../../games/tic-tac-toe/ticTacToeTools";
import { useLibraryVoice } from "../../voice/useLibraryVoice";
import { GuidanceTracker, isCurrentSetupAnswer, parseGuidanceCommand } from "../../voice/guidance";
import LiquidOrb from "../PlayByVoice/LiquidOrb";
import "./TicTacToePage.css";

type PagePhase = "loading" | "setup" | "game";
type SetupStep = "opponent" | "difficulty" | "mark" | "firstTurn";
type SetupSelection = Omit<TicTacToeSetup, "playerMark"> & {
  playerMark: TicTacToeMark | "random";
};

const SETUP_STEPS: SetupStep[] = ["opponent", "difficulty", "mark", "firstTurn"];
const LOADING_ASSETS = [
  "/assets/figma/ttt-loading-base.png",
  "/assets/figma/ttt-loading-light.png",
  "/assets/figma/ttt-loading-texture.png",
  "/assets/figma/ttt-loading-diamond.svg",
  "/assets/figma/mark-x.png",
  "/assets/figma/mark-o.png",
  "/assets/figma/ttt-companion.png",
];

const INTRODUCTION =
  "Tic-Tac-Toe is played on a three by three board. Make three marks in a row, column, or diagonal before your opponent. You can name a cell from top left to bottom right, or use positions one through nine.";
const GUIDE =
  "Say or type play center, top left, or square nine. You can also ask to describe the board, list available squares, undo, pause, or start a new round.";

function setupGuidance(
  step: SetupStep,
  setup: SetupSelection,
  ready: boolean,
  confirmation = "",
): string {
  const prefix = confirmation ? `${confirmation} ` : "";
  if (ready)
    return `${prefix}Your settings are ${setup.opponent}, ${setup.difficulty} difficulty, ${setup.playerMark}, with ${setup.firstTurn === "player" ? "you" : "your opponent"} moving first. Say Start the game or choose Start game to confirm.`;
  if (step === "opponent")
    return `${prefix}Welcome to Tic-Tac-Toe. Setup has four short steps. First, choose your opponent. ${setup.opponent === "computer" ? "Computer" : "Friend"} is selected. Available choices are Computer or Friend. Computer is the default. Say a choice or select it to continue.`;
  if (step === "difficulty")
    return `${prefix}Choose a difficulty. ${setup.difficulty} is selected. Available choices are Easy, Medium, or Hard. Easy is the default.`;
  if (step === "mark")
    return `${prefix}Choose your mark. ${setup.playerMark} is selected. Available choices are X, O, or Random. X is the default.`;
  return `${prefix}Choose who moves first. ${setup.firstTurn === "player" ? "You move" : "Your opponent moves"} first is selected. Available choices are You or Opponent. You is the default. Say a choice or select it to continue.`;
}

function loadImage(src: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const abort = () => {
      image.src = "";
      reject(new DOMException("Loading cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    image.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error(`Could not load ${src}`));
    };
    image.src = src;
  });
}

function Header({
  panel,
  setPanel,
}: {
  panel: "audio" | "help" | null;
  setPanel: (panel: "audio" | "help" | null) => void;
}) {
  return (
    <header className="ttt-header">
      <div className="ttt-brand">
        <strong>Playora</strong>
        <img src="/assets/figma/nav-separator.png" alt="" />
        <span>Tic-Tac-Toe</span>
      </div>
      <nav aria-label="Tic-Tac-Toe options">
        <button
          type="button"
          aria-expanded={panel === "audio"}
          onClick={() => setPanel(panel === "audio" ? null : "audio")}
        >
          Audio Settings
        </button>
        <button
          type="button"
          aria-expanded={panel === "help"}
          onClick={() => setPanel(panel === "help" ? null : "help")}
        >
          Help
        </button>
      </nav>
    </header>
  );
}

function LoadingScreen({
  error,
  onRetry,
  onBack,
}: {
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <main className="ttt-loading" aria-busy={!error} aria-labelledby="ttt-loading-title">
      <div className="ttt-loading-brand" aria-label="Playora, Tic-Tac-Toe">
        <strong>Playora</strong>
        <span aria-hidden="true">•</span>
        <span>Tic-Tac-Toe</span>
      </div>
      <div className="ttt-loading-art" aria-hidden="true">
        <img className="ttt-loading-base" src="/assets/figma/ttt-loading-base.png" alt="" />
        <img className="ttt-loading-light" src="/assets/figma/ttt-loading-light.png" alt="" />
        <img className="ttt-loading-texture" src="/assets/figma/ttt-loading-texture.png" alt="" />
      </div>
      <div className="ttt-loading-content">
        <img src="/assets/figma/ttt-loading-diamond.svg" alt="" />
        <h1 id="ttt-loading-title">{error ? "Tic-Tac-Toe could not load" : "Loading"}</h1>
        {error ? (
          <div className="ttt-loading-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
            <button type="button" onClick={onBack}>
              Back
            </button>
          </div>
        ) : (
          <span className="sr-only" role="status">
            Preparing the Tic-Tac-Toe board and artwork.
          </span>
        )}
      </div>
      <button type="button" className="ttt-loading-back" onClick={onBack}>
        <ArrowLeft size={20} aria-hidden="true" /> Go back to main
      </button>
    </main>
  );
}

type Option = { value: string; title: string; detail?: string; dot?: string };

function SetupCard({
  title,
  description,
  options,
  value,
  onSelect,
  footer,
}: {
  title: string;
  description: string;
  options: Option[];
  value: string;
  onSelect: (value: string) => void;
  footer?: React.ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [title]);
  return (
    <section className="ttt-setup-card" aria-labelledby="ttt-setup-title">
      <h1 id="ttt-setup-title" ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      <p>{description}</p>
      <div className="ttt-option-list" role="radiogroup" aria-label={title}>
        {options.map((option) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? "is-selected" : ""}
            key={option.value}
            onClick={() => onSelect(option.value)}
          >
            {option.dot && <span className={`ttt-option-dot ${option.dot}`} aria-hidden="true" />}
            <span>
              <strong>{option.title}</strong>
              {option.detail && <small>{option.detail}</small>}
            </span>
            {value === option.value && <Check size={20} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {footer}
    </section>
  );
}

function CompanionControls({
  voice,
  screenReaderMode,
  response,
  command,
  setCommand,
  onCommand,
}: {
  voice: ReturnType<typeof useLibraryVoice>["voice"];
  screenReaderMode: boolean;
  response: string;
  command: string;
  setCommand: (value: string) => void;
  onCommand: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);
  const active = voice.status === "connected" && !voice.needsAudioActivation;
  const waiting = voice.status === "connecting" || voice.status === "closing";
  const activity = voice.isSpeaking
    ? "speaking"
    : active && !voice.microphoneMuted
      ? "listening"
      : voice.status;
  return (
    <footer
      className={`ttt-companion${active ? " is-active" : ""} voice-${activity}`}
      aria-label="Voice companion"
      data-voice-activity={activity}
    >
      <div className="ttt-companion-row">
        <button
          type="button"
          className="ttt-orb-button"
          disabled={waiting}
          aria-label={
            voice.needsAudioActivation
              ? "Start voice"
              : active
                ? voice.microphoneMuted
                  ? "Unmute microphone"
                  : "Mute microphone"
                : "Start voice companion"
          }
          onClick={() =>
            voice.needsAudioActivation
              ? void voice.activateAudio()
              : active
                ? voice.toggleMicrophone()
                : void voice.start()
          }
        >
          <LiquidOrb tone="violet" />
        </button>
        <button
          type="button"
          className="ttt-dock-button ttt-keyboard-button"
          aria-label={typing ? "Close typed commands" : "Type a command"}
          aria-expanded={typing}
          onClick={() => setTyping((open) => !open)}
        >
          {typing ? (
            <CloseIcon size={20} aria-hidden="true" />
          ) : (
            <Keyboard size={20} aria-hidden="true" />
          )}
        </button>
        {active && (
          <button
            type="button"
            className="ttt-dock-button ttt-end-voice"
            aria-label="End voice"
            onClick={() => void voice.stop()}
          >
            <Square size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="sr-only" aria-live={screenReaderMode ? "polite" : "off"} aria-atomic="true">
        {voice.caption || response}
      </p>
      {voice.error && (
        <div className="ttt-voice-error" role="alert">
          <p>{voice.error}</p>
          <button type="button" onClick={() => void voice.start()}>
            Retry voice
          </button>
        </div>
      )}
      {typing && (
        <form
          className="ttt-command-panel"
          onSubmit={(event) => {
            event.preventDefault();
            onCommand();
          }}
        >
          <label htmlFor="ttt-command">Type to your companion</label>
          <div>
            <input
              ref={inputRef}
              id="ttt-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Try ‘play center’"
              autoComplete="off"
            />
            <button type="submit" aria-label="Send command" disabled={!command.trim()}>
              <ArrowUp size={20} />
            </button>
          </div>
        </form>
      )}
    </footer>
  );
}

export default function TicTacToePage({
  onExit,
  preferences,
}: {
  onExit: () => void;
  preferences: Preferences;
}) {
  const game = useTicTacToeGame();
  const [phase, setPhase] = useState<PagePhase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [setupReady, setSetupReady] = useState(false);
  const [setup, setSetup] = useState<SetupSelection>(DEFAULT_TIC_TAC_TOE_SETUP);
  const [panel, setPanel] = useState<"audio" | "help" | null>(null);
  const [response, setResponse] = useState("Preparing Tic-Tac-Toe.");
  const [command, setCommand] = useState("");
  const [focusedCell, setFocusedCell] = useState(0);
  const startingRef = useRef(false);
  const cellsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const lastRevision = useRef(game.state.revision);
  const guidanceTracker = useRef(new GuidanceTracker());
  const setupConfirmation = useRef("");
  const bridgeRef = useRef<TicTacToeToolBridge>(game);
  bridgeRef.current = game;
  const executor = useMemo(() => createTicTacToeToolExecutor(() => bridgeRef.current), []);
  const { voice, runGlobalCommand, setGuidanceHandler } = useLibraryVoice(executor, "tic-tac-toe");

  const beginLoading = useCallback(() => {
    setLoadError(null);
    setPhase("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(LOADING_ASSETS.map((src) => loadImage(src, controller.signal)))
      .then(() => {
        if (!controller.signal.aborted) {
          setPhase("setup");
          setResponse("Tic-Tac-Toe is ready. Choose who you want to play against.");
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error ? error.message : "The game assets could not be prepared.",
          );
      });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    game.setNarrationBusy(voice.status === "connected" && voice.isSpeaking);
  }, [game.setNarrationBusy, voice.isSpeaking, voice.status]);

  useEffect(() => {
    if (voice.status !== "connected") return;
    const key = `${phase}:${step}:${setupReady}:${JSON.stringify(setup)}:${setupConfirmation.current}`;
    const candidate =
      phase === "loading"
        ? "Tic-Tac-Toe selected. I am preparing the board and setup choices."
        : phase === "setup"
          ? setupGuidance(SETUP_STEPS[step], setup, setupReady, setupConfirmation.current)
          : `Tic-Tac-Toe is ready. You are ${game.state.playerMark}. ${game.state.firstTurn === "player" ? "It is your turn" : `Your ${game.state.opponent} moves first`}. For example, say play center or square five.`;
    const message = candidate
      ? guidanceTracker.current.take({
          key,
          message: candidate,
          location: phase,
          capabilities: "Ask what can I do for available actions.",
        })
      : null;
    setupConfirmation.current = "";
    if (message) {
      setResponse(message);
      voice.announce(message);
    }
  }, [
    game.state.firstTurn,
    game.state.opponent,
    game.state.playerMark,
    phase,
    setup,
    setupReady,
    step,
    voice.announce,
    voice.status,
  ]);

  useEffect(() => {
    if (phase !== "game" || lastRevision.current === game.state.revision) return;
    lastRevision.current = game.state.revision;
    setResponse(game.status);
    if (voice.status === "connected") voice.announce(game.status);
  }, [game.state.revision, game.status, phase, voice]);

  const updateSetup = useCallback(
    (patch: Partial<SetupSelection>, advance = true) => {
      const expected = SETUP_STEPS[step];
      const expectedKey = expected === "mark" ? "playerMark" : expected;
      const keys = Object.keys(patch);
      if (!isCurrentSetupAnswer(expectedKey, keys, setupReady)) {
        setResponse(
          `That answer does not apply to the current step. ${setupGuidance(expected, setup, setupReady)}`,
        );
        return false;
      }
      const selected = Object.values(patch)[0];
      setupConfirmation.current = selected ? `${String(selected)} selected.` : "";
      setSetup((current) => ({ ...current, ...patch }));
      if (SETUP_STEPS[step] === "firstTurn") setSetupReady(true);
      else if (advance) setStep((current) => Math.min(SETUP_STEPS.length - 1, current + 1));
      return true;
    },
    [setup, setupReady, step],
  );

  const startMatch = useCallback(() => {
    if (startingRef.current) return;
    startingRef.current = true;
    const resolved = {
      ...setup,
      playerMark:
        setup.playerMark === "random" ? (Math.random() < 0.5 ? "X" : "O") : setup.playerMark,
    } as TicTacToeSetup;
    const result = game.startGame(resolved);
    setResponse(result.message);
    setPhase("game");
    setPanel(null);
    queueMicrotask(() => {
      startingRef.current = false;
    });
  }, [game, setup]);

  const leave = useCallback(() => {
    voice.interrupt();
    onExit();
  }, [onExit, voice]);

  bridgeRef.current = {
    ...game,
    phase,
    setup,
    configureSetup: (patch) => {
      const expected = SETUP_STEPS[step];
      const keys = Object.keys(patch) as SetupStep[];
      const expectedKey = expected === "mark" ? "playerMark" : expected;
      if (!isCurrentSetupAnswer(expectedKey, keys, setupReady))
        return {
          ok: false,
          message: `That answer does not apply to the current step. ${setupGuidance(expected, setup, setupReady)}`,
        };
      if (!updateSetup(patch))
        return {
          ok: false,
          message: `That answer does not apply to the current step. ${setupGuidance(expected, setup, setupReady)}`,
        };
      return { ok: true, message: `${String(Object.values(patch)[0])} selected.` };
    },
    setupBack: () => {
      if (step > 0) {
        setSetupReady(false);
        setStep((current) => current - 1);
        return { ok: true, message: "Returned to the previous setup step." };
      }
      leave();
      return { ok: true, message: "Returned to the game picker." };
    },
    startConfiguredGame: () => {
      if (!setupReady) {
        if (step < SETUP_STEPS.length - 1) setStep(SETUP_STEPS.length - 1);
        return { ok: true, message: "Review the settings, then say confirm to start." };
      }
      startMatch();
      return { ok: true, message: "Starting the configured match." };
    },
    cancelSetup: () => {
      leave();
      return { ok: true, message: "Setup cancelled." };
    },
    controlSetup: (action) => {
      if (action === "defaults") {
        setupConfirmation.current = "Defaults selected.";
        setSetup(DEFAULT_TIC_TAC_TOE_SETUP);
        setStep(SETUP_STEPS.length - 1);
        setSetupReady(true);
        return { ok: true, message: "Defaults selected. Review the summary and confirm." };
      }
      const message =
        action === "explain"
          ? `${INTRODUCTION} ${setupGuidance(SETUP_STEPS[step], setup, setupReady)}`
          : setupGuidance(SETUP_STEPS[step], setup, setupReady);
      setResponse(message);
      voice.announce(message);
      return {
        ok: true,
        message: `The application ${action === "repeat" ? "repeated" : "explained"} the current step.`,
      };
    },
  };

  useEffect(() => {
    setGuidanceHandler((action) => {
      let message: string;
      if (action === "repeat")
        message =
          phase === "setup" ? setupGuidance(SETUP_STEPS[step], setup, setupReady) : response;
      else if (action === "location")
        message =
          phase === "setup"
            ? `You are in Tic-Tac-Toe setup. ${setupGuidance(SETUP_STEPS[step], setup, setupReady)}`
            : `You are playing Tic-Tac-Toe. ${game.status}`;
      else if (action === "capabilities")
        message =
          phase === "setup"
            ? `${setupGuidance(SETUP_STEPS[step], setup, setupReady)} You can also go back, use defaults, or start the game.`
            : `${GUIDE} ${game.status}`;
      else if (action === "explain")
        message =
          phase === "setup"
            ? `${INTRODUCTION} ${setupGuidance(SETUP_STEPS[step], setup, setupReady)}`
            : `${INTRODUCTION} ${GUIDE}`;
      else if (action === "home") {
        message = "Returning to the game picker.";
        window.setTimeout(leave, 0);
      } else if (action === "back") {
        if (phase !== "setup")
          return {
            ok: false,
            message: "A live round cannot return to setup. Say go home or finish the round.",
          };
        if (setupReady) setSetupReady(false);
        else if (step > 0) setStep((current) => current - 1);
        else window.setTimeout(leave, 0);
        message =
          step > 0 || setupReady
            ? "Returned to the previous Tic-Tac-Toe setup step."
            : "Returning to the game picker.";
      } else if (action === "defaults") {
        if (phase !== "setup")
          return {
            ok: false,
            message: "The round is already active. Start a new match to change setup.",
          };
        setupConfirmation.current = "Defaults selected.";
        setSetup(DEFAULT_TIC_TAC_TOE_SETUP);
        setStep(SETUP_STEPS.length - 1);
        setSetupReady(true);
        message = "Defaults selected. Review the summary and say Start the game to confirm.";
      } else {
        if (phase !== "setup")
          return { ok: false, message: `The round is already active. ${game.status}` };
        if (!setupReady) {
          if (step < SETUP_STEPS.length - 1) setStep(SETUP_STEPS.length - 1);
          else setSetupReady(true);
          message =
            "Setup is not complete. Review the current choices, then say Start the game again to confirm.";
        } else {
          startMatch();
          message = "Starting the configured Tic-Tac-Toe match.";
        }
      }
      setResponse(message);
      return { ok: true, message };
    });
    return () => setGuidanceHandler(null);
  }, [
    game.status,
    leave,
    phase,
    response,
    setGuidanceHandler,
    setup,
    setupReady,
    startMatch,
    step,
  ]);

  async function executeTool(name: string, args: Record<string, unknown> = {}) {
    const parsed = JSON.parse(await executor.execute(name, JSON.stringify(args))) as {
      message?: string;
      description?: string;
    };
    const message = parsed.message ?? parsed.description ?? "Done.";
    setResponse(message);
    if (voice.status === "connected") voice.announce(message);
  }

  async function runCommand() {
    const raw = command.trim();
    setCommand("");
    if (!raw) return;
    const value = raw
      .toLowerCase()
      .replace(/[,.!?]/g, "")
      .replace(/\s+/g, " ");
    const global = await runGlobalCommand(raw);
    if (global !== null) {
      setResponse(global);
      return;
    }
    if (phase === "setup") {
      const guidanceCommand = parseGuidanceCommand(value);
      if (guidanceCommand === "repeat") {
        const message = setupGuidance(SETUP_STEPS[step], setup, setupReady);
        setResponse(message);
        if (voice.status === "connected") voice.announce(message);
      } else if (guidanceCommand === "explain" || value === "help") {
        const message = `${INTRODUCTION} ${setupGuidance(SETUP_STEPS[step], setup, setupReady)}`;
        setResponse(message);
        if (voice.status === "connected") voice.announce(message);
      } else if (guidanceCommand === "capabilities") {
        const message = `${setupGuidance(SETUP_STEPS[step], setup, setupReady)} You can also say go back, use the defaults, or start the game.`;
        setResponse(message);
        if (voice.status === "connected") voice.announce(message);
      } else if (guidanceCommand === "location") {
        const message = `You are in Tic-Tac-Toe setup. ${setupGuidance(SETUP_STEPS[step], setup, setupReady)}`;
        setResponse(message);
        if (voice.status === "connected") voice.announce(message);
      } else if (guidanceCommand === "defaults") {
        setupConfirmation.current = "Defaults selected.";
        setSetup(DEFAULT_TIC_TAC_TOE_SETUP);
        setStep(SETUP_STEPS.length - 1);
        setSetupReady(true);
      } else if (/computer|bot/.test(value)) updateSetup({ opponent: "computer" });
      else if (/friend|player two|two player/.test(value)) updateSetup({ opponent: "friend" });
      else if (/\beasy\b/.test(value)) updateSetup({ difficulty: "easy" });
      else if (/\bmedium\b/.test(value)) updateSetup({ difficulty: "medium" });
      else if (/\bhard\b/.test(value)) updateSetup({ difficulty: "hard" });
      else if (/random mark|random symbol/.test(value)) updateSetup({ playerMark: "random" });
      else if (/\b(?:choose|play as|mark) x\b|\bx mark\b/.test(value))
        updateSetup({ playerMark: "X" });
      else if (/\b(?:choose|play as|mark) o\b|\bo mark\b/.test(value))
        updateSetup({ playerMark: "O" });
      else if (/computer first|opponent first|player two first/.test(value))
        updateSetup({ firstTurn: "opponent" });
      else if (/i go first|me first|my turn first|you first/.test(value))
        updateSetup({ firstTurn: "player" });
      else if (guidanceCommand === "start" || value === "yes") {
        if (setupReady) startMatch();
        else if (step < SETUP_STEPS.length - 1) setStep(SETUP_STEPS.length - 1);
        else setSetupReady(true);
      } else if (guidanceCommand === "back") {
        if (setupReady) setSetupReady(false);
        else setStep((current) => Math.max(0, current - 1));
      } else setResponse("Choose an opponent, difficulty, mark, or who moves first.");
      return;
    }
    if (/^(help|guide|how to play)$/.test(value)) {
      setResponse(GUIDE);
      return;
    }
    if (/^(describe the board|board|status|whose turn)$/.test(value))
      return void executeTool("get_tic_tac_toe_state");
    if (/^(available|available squares|legal moves)$/.test(value))
      return void executeTool("get_available_tic_tac_toe_moves");
    if (/^(undo|undo turn)$/.test(value)) return void executeTool("undo_tic_tac_toe_turn");
    if (/^(new round|play again|restart)$/.test(value))
      return void executeTool("propose_tic_tac_toe_control", { action: "new_round" });
    const index = parseTicTacToePosition(value);
    if (index !== null)
      return void executeTool("place_tic_tac_toe_mark", { position: POSITION_NAMES[index] });
    setResponse("I did not understand. Try play center, describe the board, or help.");
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

  if (phase === "loading")
    return <LoadingScreen error={loadError} onRetry={beginLoading} onBack={leave} />;

  const stepName = SETUP_STEPS[step];
  const setupProps =
    stepName === "opponent"
      ? {
          title: "Who do you want to play against?",
          description: "Choose your opponent",
          value: setup.opponent,
          options: [
            { value: "computer", title: "Computer" },
            { value: "friend", title: "Friend", detail: "Play locally on this device" },
          ],
          onSelect: (value: string) => updateSetup({ opponent: value as TicTacToeOpponent }),
        }
      : stepName === "difficulty"
        ? {
            title: "Choose your difficulty",
            description: "You can change this before each match",
            value: setup.difficulty,
            options: [
              { value: "easy", title: "Easy", dot: "green" },
              { value: "medium", title: "Medium", dot: "yellow" },
              { value: "hard", title: "Hard", dot: "red" },
            ],
            onSelect: (value: string) =>
              updateSetup({ difficulty: value as TicTacToeSetup["difficulty"] }),
          }
        : stepName === "mark"
          ? {
              title: "Choose your mark",
              description: "Select the symbol you want to play",
              value: setup.playerMark,
              options: [
                { value: "X", title: "X" },
                { value: "O", title: "O" },
                { value: "random", title: "Random" },
              ],
              onSelect: (value: string) =>
                updateSetup({ playerMark: value as SetupSelection["playerMark"] }),
            }
          : {
              title: "Who should go first?",
              description: "Choose the opening turn",
              value: setup.firstTurn,
              options: [
                { value: "opponent", title: setup.opponent === "computer" ? "Computer" : "Friend" },
                { value: "player", title: "You" },
              ],
              onSelect: (value: string) =>
                updateSetup({ firstTurn: value as TicTacToeFirstTurn }, false),
            };

  const boardDisabled =
    game.paused ||
    game.state.status !== "playing" ||
    (game.state.opponent === "computer" && game.state.turn !== game.state.playerMark);

  return (
    <div
      className={`ttt-app${game.state.status !== "playing" ? " is-finished" : ""}${game.state.status === "won" ? " is-won" : ""}`}
    >
      <a href="#ttt-main" className="skip-link">
        Skip to game
      </a>
      <Header panel={panel} setPanel={setPanel} />
      <main id="ttt-main" className="ttt-main">
        <div className="ttt-side-actions" aria-label="Game navigation">
          <button type="button" onClick={leave} aria-label="Return home">
            <img src="/artwork/loups-garous/home.svg" alt="" />
          </button>
          {phase === "setup" && step > 0 && (
            <button
              type="button"
              onClick={() => setStep((current) => current - 1)}
              aria-label="Previous setup step"
            >
              <ArrowLeft />
            </button>
          )}
          {phase === "game" && (
            <button
              type="button"
              onClick={() => {
                const result = game.newRound();
                setResponse(result.message);
              }}
              aria-label="Play again"
            >
              <img src="/assets/figma/restart.png" alt="" />
            </button>
          )}
        </div>

        {panel && (
          <aside className="ttt-popover" aria-label={panel === "help" ? "Help" : "Audio settings"}>
            <button
              type="button"
              className="ttt-popover-close"
              onClick={() => setPanel(null)}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
            <h2>{panel === "help" ? "How to play" : "Audio settings"}</h2>
            {panel === "help" ? (
              <>
                <p>{INTRODUCTION}</p>
                <p>{GUIDE}</p>
              </>
            ) : (
              <>
                <p>
                  {voice.status === "connected"
                    ? "Voice companion is connected."
                    : "Start the companion with the orb."}
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.settings.screenReaderMode}
                    onChange={(event) => preferences.setScreenReaderMode(event.target.checked)}
                  />{" "}
                  Screen-reader narration
                </label>
              </>
            )}
          </aside>
        )}

        {phase === "setup" ? (
          <div className="ttt-setup-layout">
            <div className="ttt-setup-intro">
              <h2>Let’s set up your game</h2>
              <p>Pick your preferences. You can go back at any time.</p>
            </div>
            <SetupCard
              {...setupProps}
              footer={
                stepName === "firstTurn" ? (
                  <div className="ttt-setup-footer">
                    {setupReady && (
                      <p role="status">
                        {setup.opponent}, {setup.difficulty}, {setup.playerMark},{" "}
                        {setup.firstTurn === "player" ? "you move first" : "opponent moves first"}.
                      </p>
                    )}
                    <button type="button" onClick={leave}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => (setupReady ? startMatch() : setSetupReady(true))}
                    >
                      {setupReady ? "Start game" : "Review settings"}
                    </button>
                  </div>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="ttt-game-layout">
            {game.state.status !== "playing" && (
              <section className="ttt-result" aria-labelledby="ttt-result-title">
                <h1 id="ttt-result-title">
                  {game.state.status === "draw"
                    ? "It’s a draw"
                    : game.state.winner === game.state.playerMark
                      ? "You win!"
                      : game.state.opponent === "computer"
                        ? "Computer wins"
                        : "Player two wins"}
                </h1>
                <p>{game.status}</p>
                <div>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      const result = game.newRound();
                      setResponse(result.message);
                    }}
                  >
                    Play again
                  </button>
                  <button type="button" onClick={leave}>
                    Return home
                  </button>
                </div>
              </section>
            )}
            <section className="ttt-board-panel" aria-labelledby="ttt-board-title">
              <h1 id="ttt-board-title" className="sr-only">
                Tic-Tac-Toe board
              </h1>
              <span className="ttt-turn" role="status">
                {game.status}
              </span>
              <div
                className="ttt-board"
                role="grid"
                aria-label="Tic-Tac-Toe board"
                aria-rowcount={3}
                aria-colcount={3}
              >
                {game.state.board.map((mark, index) => (
                  <button
                    key={index}
                    ref={(node) => {
                      cellsRef.current[index] = node;
                    }}
                    type="button"
                    role="gridcell"
                    className={`ttt-cell${game.state.winningLine?.includes(index) ? " winning" : ""}`}
                    aria-label={`${POSITION_NAMES[index]}, ${mark === null ? "empty" : mark === game.state.playerMark ? `your ${mark}` : `${game.state.opponent === "computer" ? "computer" : "player two"} ${mark}`}`}
                    aria-disabled={boardDisabled || mark !== null}
                    tabIndex={focusedCell === index ? 0 : -1}
                    onFocus={() => setFocusedCell(index)}
                    onKeyDown={(event) => onCellKeyDown(event, index)}
                    onClick={() => {
                      if (!boardDisabled && mark === null) {
                        const result = game.playHumanMove(index);
                        setResponse(result.message);
                      }
                    }}
                  >
                    {mark && (
                      <img
                        src={mark === "X" ? "/assets/figma/mark-x.png" : "/assets/figma/mark-o.png"}
                        alt=""
                      />
                    )}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        <CompanionControls
          voice={voice}
          screenReaderMode={preferences.settings.screenReaderMode}
          response={response}
          command={command}
          setCommand={setCommand}
          onCommand={() => void runCommand()}
        />
      </main>
    </div>
  );
}
