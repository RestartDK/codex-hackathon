import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowLeft, House, Monitor, Users } from "lucide-react";
import type { Difficulty } from "../../chess/difficulty";
import type { GameMode } from "../../types";
import { isCurrentSetupAnswer } from "../../voice/guidance";

export type ChessSetupSelection = {
  gameMode: GameMode;
  difficulty: Difficulty;
  playerColor: "w" | "b";
  timerMinutes: 5 | 10 | null;
  explainRules: boolean;
};

type ColorChoice = "w" | "b" | "random";
type SetupStep = "opponent" | "difficulty" | "color" | "timer" | "rules";

const STEPS: SetupStep[] = ["opponent", "difficulty", "color", "timer", "rules"];

export type ChessSetupCommand = {
  action?: "back" | "defaults" | "start" | "repeat" | "explain";
  difficulty?: Difficulty;
  color?: ColorChoice;
  timer?: "off";
  rules?: boolean;
};

export type ChessSetupHandle = {
  execute: (command: ChessSetupCommand) => { ok: boolean; message: string };
};

export type ChessSetupGuidance = { key: string; message: string };

const ChessSetup = forwardRef<
  ChessSetupHandle,
  {
    onCancel: () => void;
    onStart: (selection: ChessSetupSelection) => void;
    onGuidanceChange: (guidance: ChessSetupGuidance) => void;
    onSpeak: (message: string) => void;
  }
>(function ChessSetup({ onCancel, onStart, onGuidanceChange, onSpeak }, ref) {
  const [stepIndex, setStepIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [color, setColor] = useState<ColorChoice>("w");
  const [timerMinutes, setTimerMinutes] = useState<5 | 10 | null>(null);
  const [explainRules, setExplainRules] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const startingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = STEPS[stepIndex];

  function guidanceText(prefix = confirmation) {
    const lead = prefix ? `${prefix} ` : "";
    const colorName = color === "w" ? "White" : color === "b" ? "Black" : "Random";
    if (ready)
      return `${lead}Your settings are Computer, ${difficulty}, ${colorName} pieces, timer off, and rules explanation ${explainRules ? "on" : "off"}. Say confirm or choose Start game to begin.`;
    const prompts: Record<SetupStep, string> = {
      opponent:
        "Welcome to Chess. Setup has five short steps. First, choose your opponent. Computer is selected and is the default. Player mode is unavailable. Say Computer or choose it to continue.",
      difficulty: `Choose a difficulty. The current choice is ${difficulty}. Available choices are Beginner, Intermediate, and Advanced. Beginner is the default.`,
      color: `Choose your pieces. The current choice is ${colorName}. Available choices are White, Black, or Random. White is the default.`,
      timer: "Choose a timer. Timer off is selected and is currently the only available choice.",
      rules: `Choose whether to hear a rules explanation. It is currently ${explainRules ? "on" : "off"}, and off is the default.`,
    };
    return lead + prompts[step];
  }

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step, ready]);

  useEffect(() => {
    onGuidanceChange({
      key: `${ready ? "summary" : step}:${difficulty}:${color}:${timerMinutes ?? "off"}:${explainRules}:${confirmation}`,
      message: guidanceText(),
    });
  }, [color, confirmation, difficulty, explainRules, onGuidanceChange, ready, step, timerMinutes]);

  function advance() {
    if (stepIndex < STEPS.length - 1) setStepIndex((value) => value + 1);
    else setReady(true);
  }

  function goBack() {
    if (ready) setReady(false);
    else if (stepIndex > 0) setStepIndex((value) => value - 1);
    else onCancel();
  }

  function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    const playerColor = color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;
    onStart({
      gameMode: "computer",
      difficulty,
      playerColor,
      timerMinutes,
      explainRules,
    });
  }

  function applyDefaults() {
    setDifficulty("beginner");
    setColor("w");
    setTimerMinutes(null);
    setExplainRules(false);
    setConfirmation("Defaults selected.");
    setReady(true);
  }

  useImperativeHandle(ref, () => ({
    execute(command) {
      if (command.action === "repeat") {
        onSpeak(guidanceText(""));
        return { ok: true, message: "Repeated the current setup step." };
      }
      if (command.action === "explain") {
        onSpeak(
          `Chess setup changes the opponent strength, your piece color, and optional guidance. ${guidanceText("")}`,
        );
        return { ok: true, message: "Explained the current setup step." };
      }
      if (command.action === "back") {
        goBack();
        return { ok: true, message: "Returned to the previous setup step." };
      }
      if (command.action === "defaults") {
        applyDefaults();
        return { ok: true, message: "Defaults selected. Review the summary and confirm." };
      }
      if (command.action === "start") {
        if (!ready) {
          setReady(true);
          return { ok: true, message: "Review the settings and confirm to start." };
        }
        start();
        return { ok: true, message: "Starting Chess." };
      }
      if (command.difficulty) {
        if (!isCurrentSetupAnswer(step, ["difficulty"], ready))
          return { ok: false, message: `That answer does not apply here. ${guidanceText("")}` };
        setDifficulty(command.difficulty);
        setConfirmation(`${command.difficulty} selected.`);
        setStepIndex(2);
        return { ok: true, message: `${command.difficulty} selected.` };
      }
      if (command.color) {
        if (!isCurrentSetupAnswer(step, ["color"], ready))
          return { ok: false, message: `That answer does not apply here. ${guidanceText("")}` };
        setColor(command.color);
        setConfirmation(
          `${command.color === "w" ? "White" : command.color === "b" ? "Black" : "Random"} selected.`,
        );
        setStepIndex(3);
        return { ok: true, message: "Piece color selected." };
      }
      if (command.timer === "off") {
        if (!isCurrentSetupAnswer(step, ["timer"], ready))
          return { ok: false, message: `That answer does not apply here. ${guidanceText("")}` };
        setTimerMinutes(null);
        setConfirmation("Timer off selected.");
        setStepIndex(4);
        return { ok: true, message: "Timer off selected." };
      }
      if (typeof command.rules === "boolean") {
        if (!isCurrentSetupAnswer(step, ["rules"], ready))
          return { ok: false, message: `That answer does not apply here. ${guidanceText("")}` };
        setExplainRules(command.rules);
        setConfirmation(`Rules explanation ${command.rules ? "on" : "off"} selected.`);
        setReady(true);
        return { ok: true, message: "Rules preference selected. Review the summary and confirm." };
      }
      if (!ready && step === "opponent") {
        setConfirmation("Computer selected.");
        setStepIndex(1);
        return { ok: true, message: "Computer selected." };
      }
      return { ok: false, message: `That answer does not apply here. ${guidanceText("")}` };
    },
  }));

  return (
    <section className="chess-setup-page" aria-labelledby="page-heading">
      <nav className="setup-rail" aria-label="Setup navigation">
        <button className="round-control" type="button" onClick={onCancel}>
          <House size={22} aria-hidden="true" />
          <span className="sr-only">Return to game picker</span>
        </button>
        <button className="round-control" type="button" onClick={goBack}>
          <ArrowLeft size={22} aria-hidden="true" />
          <span className="sr-only">
            {ready || stepIndex > 0 ? "Back to the previous setup step" : "Back to game picker"}
          </span>
        </button>
      </nav>

      <div className="setup-intro">
        <h1 id="page-heading" tabIndex={-1}>
          Set up your game
        </h1>
        <p>Choose your preferences, or say “Start with the defaults.”</p>
        <button type="button" className="pill-button primary" onClick={applyDefaults}>
          Use defaults
        </button>
      </div>

      <div className="setup-panel" aria-live="polite">
        {step === "opponent" && (
          <>
            <h2 ref={headingRef} tabIndex={-1}>
              Choose your opponent
            </h2>
            <div className="setup-option-grid setup-opponents">
              <button
                className="setup-option is-selected is-dark"
                type="button"
                onClick={() => {
                  setConfirmation("Computer selected.");
                  advance();
                }}
              >
                <Monitor size={26} aria-hidden="true" />
                <span>Computer</span>
              </button>
              <button className="setup-option" type="button" disabled>
                <Users size={26} aria-hidden="true" />
                <span>Player</span>
                <small>Coming soon</small>
              </button>
            </div>
          </>
        )}

        {step === "difficulty" && (
          <>
            <h2 ref={headingRef} tabIndex={-1}>
              Choose your difficulty
            </h2>
            <div className="setup-option-list">
              {[
                ["beginner", "Beginner", "A gentle pace while you learn the board."],
                ["casual", "Intermediate", "A balanced opponent with tactical awareness."],
                ["club", "Advanced", "A stronger opponent with more thinking time."],
              ].map(([value, label, description], index) => (
                <button
                  className={`setup-option difficulty-option tone-${index}${difficulty === value ? " is-selected" : ""}`}
                  type="button"
                  key={value}
                  onClick={() => {
                    setDifficulty(value as Difficulty);
                    setConfirmation(`${label} selected.`);
                    advance();
                  }}
                >
                  <span>{label}</span>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "color" && (
          <>
            <h2 ref={headingRef} tabIndex={-1}>
              Choose your pieces
            </h2>
            <div className="setup-option-grid">
              <button
                className={`setup-option color-option white${color === "w" ? " is-selected is-dark" : ""}`}
                type="button"
                onClick={() => {
                  setColor("w");
                  setConfirmation("White selected.");
                  advance();
                }}
              >
                White
              </button>
              <button
                className={`setup-option color-option black${color === "b" ? " is-selected is-dark" : ""}`}
                type="button"
                onClick={() => {
                  setColor("b");
                  setConfirmation("Black selected.");
                  advance();
                }}
              >
                Black
              </button>
              <button
                className={`setup-option setup-option-wide${color === "random" ? " is-selected" : ""}`}
                type="button"
                onClick={() => {
                  setColor("random");
                  setConfirmation("Random selected.");
                  advance();
                }}
              >
                Random
              </button>
            </div>
          </>
        )}

        {step === "timer" && (
          <>
            <h2 ref={headingRef} tabIndex={-1}>
              Set a timer
            </h2>
            <div className="setup-option-grid">
              <button className="setup-option" type="button" disabled>
                5 minutes
                <small>Coming soon</small>
              </button>
              <button className="setup-option" type="button" disabled>
                10 minutes
                <small>Coming soon</small>
              </button>
              <button
                className={`setup-option setup-option-wide timer-off${timerMinutes === null ? " is-selected" : ""}`}
                type="button"
                onClick={() => {
                  setTimerMinutes(null);
                  setConfirmation("Timer off selected.");
                  advance();
                }}
              >
                Turn Off
              </button>
            </div>
          </>
        )}

        {step === "rules" && (
          <>
            <h2 ref={headingRef} tabIndex={-1}>
              Explain the rules
              <br />
              before starting
            </h2>
            <p className="setup-description">
              Get a short voice introduction to chess controls and available commands.
            </p>
            <div className="setup-option-grid rules-options">
              <button
                className={`setup-option rules-off${!explainRules ? " is-selected" : ""}`}
                type="button"
                aria-pressed={!explainRules}
                onClick={() => {
                  setExplainRules(false);
                  setConfirmation("Rules explanation off selected.");
                  setReady(true);
                }}
              >
                Off
              </button>
              <button
                className={`setup-option rules-on${explainRules ? " is-selected" : ""}`}
                type="button"
                aria-pressed={explainRules}
                onClick={() => {
                  setExplainRules(true);
                  setConfirmation("Rules explanation on selected.");
                  setReady(true);
                }}
              >
                On
              </button>
            </div>
          </>
        )}
      </div>

      <div className="setup-actions">
        {ready && (
          <>
            <p role="status" className="setup-summary">
              Your settings are Computer, {difficulty},{" "}
              {color === "w" ? "White" : color === "b" ? "Black" : "Random"} pieces, timer off, and
              rules explanation {explainRules ? "on" : "off"}.
            </p>
            <button type="button" className="setup-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="setup-start" onClick={start}>
              Start game
            </button>
          </>
        )}
      </div>
    </section>
  );
});

export default ChessSetup;
