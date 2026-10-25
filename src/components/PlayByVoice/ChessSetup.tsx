import { useEffect, useRef, useState } from "react";
import { ArrowLeft, House, Monitor, Users } from "lucide-react";
import type { Difficulty } from "../../chess/difficulty";
import type { GameMode } from "../../types";

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

export default function ChessSetup({
  onCancel,
  onStart,
}: {
  onCancel: () => void;
  onStart: (selection: ChessSetupSelection) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [color, setColor] = useState<ColorChoice>("w");
  const [timerMinutes, setTimerMinutes] = useState<5 | 10 | null>(null);
  const [explainRules, setExplainRules] = useState(false);
  const [ready, setReady] = useState(false);
  const startingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = STEPS[stepIndex];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step, ready]);

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
      </div>

      <div className="setup-panel" aria-live="polite">
        {step === "opponent" && (
          <>
            <h2 ref={headingRef} tabIndex={-1}>
              Choose your opponent
            </h2>
            <div className="setup-option-grid setup-opponents">
              <button className="setup-option is-selected is-dark" type="button" onClick={advance}>
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
}
