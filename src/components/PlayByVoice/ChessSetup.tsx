import { useEffect, useRef } from "react";
import { ArrowLeft, House, Monitor, Users } from "lucide-react";
import {
  CHESS_SETUP_DIFFICULTIES,
  CHESS_SETUP_STEPS,
  difficultyLabel,
  type ChessSetupCommand,
  type ChessSetupState,
} from "./chessSetup";

export type { ChessSetupSelection } from "./chessSetup";
export type { ChessSetupCommand, ChessSetupState } from "./chessSetup";

export default function ChessSetup({
  state,
  onCommand,
}: {
  state: ChessSetupState;
  onCommand: (command: ChessSetupCommand) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { draft, step, ready } = state;
  const stepIndex = CHESS_SETUP_STEPS.indexOf(step);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step, ready]);

  const goBack = () => onCommand({ kind: "back" });

  return (
    <section className="chess-setup-page" aria-labelledby="page-heading">
      <nav className="setup-rail" aria-label="Setup navigation">
        <button className="round-control" type="button" onClick={() => onCommand({ kind: "cancel" })}>
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
        <button
          type="button"
          className="pill-button primary"
          onClick={() => onCommand({ kind: "defaults" })}
        >
          Play now with defaults
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
                className={`setup-option is-dark${draft.gameMode === "computer" ? " is-selected" : ""}`}
                type="button"
                aria-pressed={draft.gameMode === "computer"}
                onClick={() => {
                  onCommand({ kind: "choose-opponent", gameMode: "computer" });
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
              {CHESS_SETUP_DIFFICULTIES.map((option, index) => (
                <button
                  className={`setup-option difficulty-option tone-${index}${draft.difficulty === option.difficulty ? " is-selected" : ""}`}
                  type="button"
                  key={option.difficulty}
                  aria-pressed={draft.difficulty === option.difficulty}
                  onClick={() => {
                    onCommand({ kind: "choose-difficulty", difficulty: option.difficulty });
                  }}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
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
                className={`setup-option color-option white${draft.color === "w" ? " is-selected is-dark" : ""}`}
                type="button"
                aria-pressed={draft.color === "w"}
                onClick={() => {
                  onCommand({ kind: "choose-color", color: "w" });
                }}
              >
                White
              </button>
              <button
                className={`setup-option color-option black${draft.color === "b" ? " is-selected is-dark" : ""}`}
                type="button"
                aria-pressed={draft.color === "b"}
                onClick={() => {
                  onCommand({ kind: "choose-color", color: "b" });
                }}
              >
                Black
              </button>
              <button
                className={`setup-option setup-option-wide${draft.color === "random" ? " is-selected" : ""}`}
                type="button"
                aria-pressed={draft.color === "random"}
                onClick={() => {
                  onCommand({ kind: "choose-color", color: "random" });
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
                className={`setup-option setup-option-wide timer-off${draft.timerMinutes === null ? " is-selected" : ""}`}
                type="button"
                aria-pressed={draft.timerMinutes === null}
                onClick={() => {
                  onCommand({ kind: "choose-timer", minutes: null });
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
                className={`setup-option rules-off${!draft.explainRules ? " is-selected" : ""}`}
                type="button"
                aria-pressed={!draft.explainRules}
                onClick={() => {
                  onCommand({ kind: "choose-rules", explainRules: false });
                }}
              >
                Off
              </button>
              <button
                className={`setup-option rules-on${draft.explainRules ? " is-selected" : ""}`}
                type="button"
                aria-pressed={draft.explainRules}
                onClick={() => {
                  onCommand({ kind: "choose-rules", explainRules: true });
                }}
              >
                On
              </button>
            </div>
          </>
        )}

        {ready && (
          <p className="setup-description">
            {difficultyLabel(draft.difficulty)} ·{" "}
            {draft.color === "random" ? "Random pieces" : draft.color === "w" ? "White" : "Black"} ·
            rules {draft.explainRules ? "on" : "off"}
          </p>
        )}
      </div>

      <div className="setup-actions">
        {ready && (
          <>
            <button
              type="button"
              className="setup-cancel"
              onClick={() => onCommand({ kind: "cancel" })}
            >
              Cancel
            </button>
            <button
              type="button"
              className="setup-start"
              onClick={() => onCommand({ kind: "start" })}
            >
              Start game
            </button>
          </>
        )}
      </div>
    </section>
  );
}
