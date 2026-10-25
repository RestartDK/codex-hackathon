import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2 } from "lucide-react";
import type { Preferences } from "../../hooks/useSettings";
import { INTERCEPT_INTRODUCTION, matchInterceptChoice } from "../../games/intercept/intercept";
import {
  createInterceptToolExecutor,
  type InterceptToolBridge,
} from "../../games/intercept/interceptTools";
import { useInterceptGame } from "../../games/intercept/useInterceptGame";
import { useVoiceCompanion } from "../../voice/useVoiceCompanion";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const DASHBOARD =
  "The dashboard has voice controls, typed commands, the current story passage, numbered choices, a transcript, repeat, recap, undo, pause, and new story controls.";
const GUIDE =
  "Listen to each scene, then say a number such as choice two, speak the exact choice text, or use a numbered button. You can ask me to repeat the passage, list the choices, recap recent events, pause, resume, or undo your last choice. A choice you order happens immediately. If you ask me to choose for you, I will ask before committing it.";

function responseMessage(raw: string): string {
  try {
    const value = JSON.parse(raw) as { message?: string; description?: string };
    return value.message ?? value.description ?? "Done.";
  } catch {
    return "The command could not be completed.";
  }
}

export default function InterceptPage({
  onExit,
  preferences,
}: {
  onExit: () => void;
  preferences: Preferences;
}) {
  const game = useInterceptGame();
  const { settings, setScreenReaderMode } = preferences;
  const [, refreshPending] = useState(0);
  const bridgeRef = useRef<InterceptToolBridge>(game);
  bridgeRef.current = game;
  const executorRef = useRef<ReturnType<typeof createInterceptToolExecutor> | null>(null);
  if (!executorRef.current) {
    executorRef.current = createInterceptToolExecutor(
      () => bridgeRef.current,
      () => refreshPending((value) => value + 1),
    );
  }
  const executor = executorRef.current;
  const voice = useVoiceCompanion(executor, settings.screenReaderMode, "intercept");
  const [typedCommand, setTypedCommand] = useState("");
  const [response, setResponse] = useState(
    "Ready. Start the voice companion or choose with the controls below.",
  );
  const previousVoiceStatus = useRef(voice.status);

  useEffect(() => {
    if (voice.status === "connected" && previousVoiceStatus.current !== "connected") {
      const welcome = game.awaitingStartChoice
        ? "Welcome back to The Intercept. Resume your saved story or start a new story? You can ask what the game is about at any time."
        : `Welcome to The Intercept. ${INTERCEPT_INTRODUCTION} ${DASHBOARD} ${game.repeat()}`;
      setResponse(welcome);
      voice.announce(welcome);
    }
    previousVoiceStatus.current = voice.status;
  }, [game, voice.announce, voice.status]);

  async function execute(name: string, args: object = {}, narrate = true) {
    const raw = await executor.execute(name, JSON.stringify(args));
    const message = responseMessage(raw);
    setResponse(message);
    if (narrate && voice.status === "connected") voice.announce(message);
    return message;
  }

  function choose(choiceId: string) {
    executor.invalidatePending();
    const result = game.choose(choiceId);
    setResponse(result.message);
    if (voice.status === "connected") voice.announce(result.message);
  }

  async function runTypedCommand() {
    const normalized = typedCommand
      .trim()
      .toLowerCase()
      .replace(/[,.!?]/g, "")
      .replace(/\s+/g, " ");
    setTypedCommand("");
    if (!normalized) return;
    if (/^(guide|tutorial|how to play|help)$/.test(normalized)) {
      setResponse(GUIDE);
      if (voice.status === "connected") voice.announce(GUIDE);
      return;
    }
    if (
      /^(introduction|game introduction|what is this game|what is this game about|what is the goal|what are the goals|how do i win|how do i lose|winning and losing)$/.test(
        normalized,
      )
    )
      return void execute("get_game_introduction");
    if (/^(dashboard|describe dashboard|what is on the screen)$/.test(normalized)) {
      setResponse(DASHBOARD);
      if (voice.status === "connected") voice.announce(DASHBOARD);
      return;
    }
    const choice = matchInterceptChoice(normalized, game.state.choices);
    if (choice) {
      choose(choice.id);
      return;
    }
    if (/^(repeat|repeat passage|what did you say)$/.test(normalized))
      return void execute("repeat_story_passage");
    if (/^(choices|options|list choices|what can i do)$/.test(normalized)) {
      const message = game.choices();
      setResponse(message);
      if (voice.status === "connected") voice.announce(message);
      return;
    }
    if (/^(recap|story recap|what happened)$/.test(normalized))
      return void execute("get_story_recap");
    if (/^(undo|undo choice|go back)$/.test(normalized)) return void execute("undo_story_choice");
    if (/^(pause|pause story)$/.test(normalized))
      return void execute("propose_story_control", { action: "pause" });
    if (/^(resume|resume story|resume saved story)$/.test(normalized))
      return void execute("propose_story_control", { action: "resume" });
    if (/^(new story|restart|start over)$/.test(normalized))
      return void execute("propose_story_control", { action: "new_story" }, false);
    if (/^(choose for me|suggest a choice|what should i choose)$/.test(normalized))
      return void execute("suggest_story_option", {}, false);
    if (/^(yes|confirm|do it)$/.test(normalized)) return void execute("confirm_action");
    if (/^(no|cancel|never mind|nevermind)$/.test(normalized))
      return void execute("cancel_action", {}, false);
    setResponse(`I did not understand that command. ${game.choices()}`);
  }

  const pending = executor.getPending();
  const disabled = game.awaitingStartChoice || game.state.status !== "playing";

  return (
    <div className="app intercept-app">
      <a href="#intercept-main" className="skip-link">
        Skip to story
      </a>
      <header className="app-header">
        <button className="library-link" onClick={onExit}>
          Game library
        </button>
        <h1>The Intercept</h1>
        <span className="game-badge">Interactive mystery</span>
      </header>
      <main id="intercept-main" className="intercept-main">
        <section
          className="intercept-introduction"
          aria-labelledby="intercept-introduction-heading"
        >
          <p className="voice-eyebrow">Your mission</p>
          <h2 id="intercept-introduction-heading">A mystery where your choices shape the ending</h2>
          <p>{INTERCEPT_INTRODUCTION}</p>
        </section>
        <Card className="voice-companion" aria-labelledby="intercept-voice-heading">
          <div className="voice-heading-row">
            <div>
              <p className="voice-eyebrow">Conversational story controls</p>
              <h2 id="intercept-voice-heading">Voice companion</h2>
              <p className="voice-status">
                {voice.status === "connected"
                  ? "Listening"
                  : voice.status === "connecting"
                    ? "ConnectingÃ¢â‚¬Â¦"
                    : voice.status === "closing"
                      ? "Ending voiceÃ¢â‚¬Â¦"
                      : voice.status === "error"
                        ? "Voice unavailable"
                        : "Voice is off"}
              </p>
            </div>
            {voice.status !== "connected" ? (
              <Button
                onClick={voice.start}
                disabled={voice.status === "connecting" || voice.status === "closing"}
                aria-describedby="intercept-dashboard"
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
            Try: Ã¢â‚¬Å“choice two,Ã¢â‚¬Â Ã¢â‚¬Å“repeat,Ã¢â‚¬Â Ã¢â‚¬Å“recap,Ã¢â‚¬Â Ã¢â‚¬Å“undo,Ã¢â‚¬Â or Ã¢â‚¬Å“list the choices.Ã¢â‚¬Â
          </p>
          <p id="intercept-dashboard" className="dashboard-overview">
            {DASHBOARD}
          </p>
          {game.awaitingStartChoice && (
            <div className="resume-choice" role="group" aria-label="Saved Intercept story choice">
              <p>A saved story is loaded. Resume it or begin again?</p>
              <Button onClick={() => void execute("propose_story_control", { action: "resume" })}>
                Resume saved story
              </Button>
              <Button
                className="secondary-button"
                onClick={() =>
                  void execute("propose_story_control", { action: "new_story" }, false)
                }
              >
                Start a new story
              </Button>
            </div>
          )}
          <div className="voice-onboarding" role="group" aria-label="Intercept introduction">
            <p>Need the premise or controls?</p>
            <Button
              onClick={() => {
                setResponse(INTERCEPT_INTRODUCTION);
                if (voice.status === "connected") voice.announce(INTERCEPT_INTRODUCTION);
              }}
            >
              Hear game introduction
            </Button>
            <Button
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
            <label htmlFor="intercept-command">Typed command fallback</label>
            <div>
              <input
                id="intercept-command"
                value={typedCommand}
                onChange={(event) => setTypedCommand(event.target.value)}
                placeholder="choice 1"
              />
              <Button type="submit">Run command</Button>
            </div>
          </form>
          {pending && (
            <div className="pending-action" role="group" aria-label="Story action confirmation">
              <p>{pending.description}. Confirm?</p>
              <Button onClick={() => void execute("confirm_action")}>Confirm</Button>
              <Button
                className="secondary-button"
                onClick={() => void execute("cancel_action", {}, false)}
              >
                Cancel
              </Button>
            </div>
          )}
          <label className="intercept-screen-reader">
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

        <section className="intercept-story" aria-labelledby="story-heading">
          <div className="intercept-story-heading">
            <div>
              <p className="voice-eyebrow">Bletchley Park, 1942</p>
              <h2 id="story-heading" tabIndex={-1}>
                Current scene
              </h2>
            </div>
            <span className={`story-state story-${game.state.status}`}>{game.state.status}</span>
          </div>
          <div className="intercept-passage" aria-live="polite" aria-atomic="true">
            {game.state.passage.map((paragraph, index) => (
              <p key={`${game.state.revision}-${index}`}>{paragraph}</p>
            ))}
            {game.state.status === "finished" && (
              <p className="story-ended">
                <strong>The story has ended.</strong> You can review the transcript or begin again.
              </p>
            )}
          </div>
          {game.state.choices.length > 0 && (
            <div className="intercept-choices" role="group" aria-label="Story choices">
              <h3>What do you do?</h3>
              {game.state.choices.map((choice) => (
                <Button
                  key={choice.id}
                  onClick={() => choose(choice.id)}
                  disabled={disabled}
                  className="intercept-choice"
                >
                  <span>{choice.number}</span>
                  {choice.text}
                </Button>
              ))}
            </div>
          )}
          <div className="intercept-actions">
            <Button
              className="secondary-button"
              onClick={() => {
                const message = game.repeat();
                setResponse(message);
                if (voice.status === "connected") voice.announce(message);
              }}
            >
              Repeat scene
            </Button>
            <Button
              className="secondary-button"
              onClick={() => {
                const message = game.recap();
                setResponse(message);
                if (voice.status === "connected") voice.announce(message);
              }}
            >
              Recap
            </Button>
            <Button
              className="secondary-button"
              onClick={() => void execute("undo_story_choice")}
              disabled={!game.canUndo}
            >
              Undo last choice
            </Button>
            <Button
              className="secondary-button"
              onClick={() =>
                void execute("propose_story_control", {
                  action: game.state.status === "paused" ? "resume" : "pause",
                })
              }
              disabled={game.awaitingStartChoice || game.state.status === "finished"}
            >
              {game.state.status === "paused" ? "Resume story" : "Pause story"}
            </Button>
            <Button
              className="danger-button"
              onClick={() => void execute("propose_story_control", { action: "new_story" }, false)}
            >
              New story
            </Button>
          </div>
        </section>

        <details className="intercept-transcript">
          <summary>Story transcript ({game.state.transcript.length} entries)</summary>
          <ol>
            {game.state.transcript.map((entry, index) => (
              <li key={`${index}-${entry.kind}`} className={`transcript-${entry.kind}`}>
                {entry.kind === "choice" && <strong>You chose: </strong>}
                {entry.text}
              </li>
            ))}
          </ol>
        </details>
        <p className="intercept-credit">
          The Intercept story Ã‚Â© 2016 inkle Ltd., used under the MIT License.
        </p>
      </main>
    </div>
  );
}

