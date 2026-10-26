import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2 } from "lucide-react";
import type { Preferences } from "../../hooks/useSettings";
import { INTERCEPT_INTRODUCTION, matchInterceptChoice } from "../../games/intercept/intercept";
import {
  createInterceptToolExecutor,
  type InterceptToolBridge,
} from "../../games/intercept/interceptTools";
import { useInterceptGame } from "../../games/intercept/useInterceptGame";
import { useLibraryVoice } from "../../voice/useLibraryVoice";
import { GuidanceTracker, parseGuidanceCommand } from "../../voice/guidance";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import LiquidOrb from "../PlayByVoice/LiquidOrb";
import "./InterceptPage.css";

const DASHBOARD =
  "The dashboard has voice controls, typed commands, the current story passage, numbered choices, a transcript, repeat, recap, undo, pause, and new story controls.";
const GUIDE =
  "Listen to each scene, then say a number such as choice two, speak the exact choice text, or use a numbered button. You can ask me to repeat the passage, list the choices, recap recent events, pause, resume, or undo your last choice. A choice you order happens immediately. If you ask me to choose for you, I will ask before committing it.";

const INTERCEPT_LOADING_ASSETS = [
  "/assets/figma/intercept-loading-base.png",
  "/assets/figma/intercept-loading-light.png",
  "/assets/figma/intercept-loading-texture.png",
  "/assets/figma/intercept-loading-overlay.png",
  "/assets/figma/intercept-loading-shape.svg",
  "/assets/figma/intercept-companion.png",
];

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
  const { voice, runGlobalCommand, setGuidanceHandler } = useLibraryVoice(executor, "intercept");
  const [typedCommand, setTypedCommand] = useState("");
  const [panel, setPanel] = useState<"audio" | "help" | null>(null);
  const [response, setResponse] = useState(
    "Ready. Start the voice companion or choose with the controls below.",
  );
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const guidanceTracker = useRef(new GuidanceTracker());

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");
    void Promise.all(
      INTERCEPT_LOADING_ASSETS.map((asset) => loadImage(asset, controller.signal)),
    ).then(
      () => {
        if (!controller.signal.aborted) setLoadState("ready");
      },
      (cause) => {
        if (controller.signal.aborted) return;
        setLoadError(cause instanceof Error ? cause.message : "The story artwork could not load.");
        setLoadState("error");
      },
    );
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    if (voice.status !== "connected") return;
    const message =
      loadState === "loading"
        ? "The Intercept selected. I am preparing the story."
        : loadState === "error"
          ? "The Intercept could not load. Choose Retry or Back."
          : game.awaitingStartChoice
            ? "Welcome back to The Intercept. There is no setup. Resume your saved story or start a new story."
            : `Welcome to The Intercept. There is no setup, so the story is ready. ${INTERCEPT_INTRODUCTION} ${game.repeat()} Say a numbered choice to continue.`;
    const guidance = guidanceTracker.current.take({
      key: `${loadState}:${game.awaitingStartChoice ? "saved" : "fresh"}`,
      message,
      location: loadState === "ready" ? "The Intercept story" : `The Intercept ${loadState}`,
      capabilities: GUIDE,
    });
    if (guidance) {
      setResponse(guidance);
      voice.announce(guidance);
    }
  }, [game.awaitingStartChoice, loadState, voice.announce, voice.status]);

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
    const guidanceCommand = parseGuidanceCommand(normalized);
    if (guidanceCommand === "repeat") return void execute("repeat_story_passage");
    if (guidanceCommand === "location") {
      const message = `You are in The Intercept, at the current story choice. ${game.repeat()}`;
      setResponse(message);
      if (voice.status === "connected") voice.announce(message);
      return;
    }
    if (guidanceCommand === "capabilities") {
      const message = `${game.choices()} You can also ask to repeat, recap, undo, pause, or go home.`;
      setResponse(message);
      if (voice.status === "connected") voice.announce(message);
      return;
    }
    if (guidanceCommand === "explain") {
      setResponse(GUIDE);
      if (voice.status === "connected") voice.announce(GUIDE);
      return;
    }
    if (guidanceCommand === "defaults" || guidanceCommand === "start") {
      const message = `The Intercept has no setup choices. The story is ready. ${game.repeat()}`;
      setResponse(message);
      if (voice.status === "connected") voice.announce(message);
      return;
    }
    const global = await runGlobalCommand(normalized);
    if (global !== null) {
      setResponse(global);
      return;
    }
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

  useEffect(() => {
    setGuidanceHandler(async (action) => {
      let message: string;
      if (action === "repeat") message = game.repeat();
      else if (action === "location")
        message = `You are in The Intercept at the current story choice. ${game.repeat()}`;
      else if (action === "capabilities")
        message = `${game.choices()} You can also repeat, recap, undo, pause, or go home.`;
      else if (action === "explain") message = `${INTERCEPT_INTRODUCTION} ${GUIDE}`;
      else if (action === "home") {
        message = "Returning to the game picker.";
        window.setTimeout(() => {
          voice.interrupt();
          onExit();
        }, 0);
      } else if (action === "back") {
        message = await execute("undo_story_choice", {}, false);
      } else message = `The Intercept has no setup choices. The story is ready. ${game.repeat()}`;
      setResponse(message);
      return { ok: true, message };
    });
    return () => setGuidanceHandler(null);
  }, [execute, game, onExit, setGuidanceHandler, voice]);

  if (loadState !== "ready") {
    return (
      <main
        className="intercept-loading"
        aria-labelledby="intercept-loading-title"
        aria-busy={loadState === "loading"}
      >
        <div className="intercept-loading-art" aria-hidden="true">
          <img src="/assets/figma/intercept-loading-base.png" alt="" />
          <img src="/assets/figma/intercept-loading-light.png" alt="" />
          <img src="/assets/figma/intercept-loading-texture.png" alt="" />
          <img src="/assets/figma/intercept-loading-overlay.png" alt="" />
        </div>
        <header className="intercept-loading-header">
          <strong>Playora</strong>
          <nav aria-label="Intercept loading options">
            <span>Audio Settings</span>
            <span>Help</span>
          </nav>
        </header>
        <div className="intercept-loading-center">
          <img src="/assets/figma/intercept-loading-shape.svg" alt="" />
          <h1 id="intercept-loading-title" tabIndex={-1}>
            {loadState === "error" ? "Intercept could not load" : "Loading"}
          </h1>
          {loadState === "error" ? (
            <div className="intercept-loading-error" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
                Retry
              </button>
              <button type="button" onClick={onExit}>
                Back
              </button>
            </div>
          ) : (
            <span className="sr-only" role="status">
              Preparing The Intercept story and artwork.
            </span>
          )}
        </div>
        <button type="button" className="intercept-loading-back" onClick={onExit}>
          Go back to main
        </button>
      </main>
    );
  }

  return (
    <div className="app intercept-app">
      <a href="#intercept-main" className="skip-link">
        Skip to story
      </a>
      <header className="figma-game-header">
        <div className="figma-game-brand">
          <strong>Playora</strong>
          <img src="/assets/figma/nav-separator.png" alt="" />
          <span>Intercept</span>
        </div>
        <nav aria-label="Intercept options">
          <button
            type="button"
            aria-expanded={panel === "audio"}
            onClick={() => setPanel((current) => (current === "audio" ? null : "audio"))}
          >
            Audio Settings
          </button>
          <button
            type="button"
            aria-expanded={panel === "help"}
            onClick={() => setPanel((current) => (current === "help" ? null : "help"))}
          >
            Help
          </button>
        </nav>
      </header>
      <main id="intercept-main" className="intercept-main">
        <div className="figma-side-actions" aria-label="Game actions">
          <button type="button" onClick={onExit} aria-label="Return to game library">
            <img src="/artwork/loups-garous/home.svg" alt="" />
          </button>
        </div>
        <section
          className="intercept-introduction figma-option-panel"
          aria-labelledby="intercept-introduction-heading"
          hidden={panel !== "help"}
        >
          <p className="voice-eyebrow">Your mission</p>
          <h2 id="intercept-introduction-heading">A mystery where your choices shape the ending</h2>
          <p>{INTERCEPT_INTRODUCTION}</p>
        </section>
        <Card
          className="voice-companion figma-option-panel"
          aria-labelledby="intercept-voice-heading"
          hidden={panel !== "audio"}
        >
          <div className="voice-heading-row">
            <div>
              <p className="voice-eyebrow">Conversational story controls</p>
              <h2 id="intercept-voice-heading">Voice companion</h2>
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
            {voice.status !== "connected" || voice.needsAudioActivation ? (
              <Button
                onClick={voice.needsAudioActivation ? voice.activateAudio : voice.start}
                disabled={
                  (voice.status === "connecting" && !voice.needsAudioActivation) ||
                  voice.status === "closing"
                }
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
            Try: “choice two,” “repeat,” “recap,” “undo,” or “list the choices.”
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
          <label className="intercept-screen-reader">
            <input
              type="checkbox"
              checked={settings.screenReaderMode}
              onChange={(event) => setScreenReaderMode(event.target.checked)}
            />{" "}
            Screen-reader narration
          </label>
        </Card>

        {game.awaitingStartChoice && panel !== "audio" && (
          <section className="figma-resume-dialog" aria-label="Saved Intercept story choice">
            <h2>Continue your story?</h2>
            <p>A saved mission is ready.</p>
            <div>
              <Button onClick={() => void execute("propose_story_control", { action: "resume" })}>
                Resume saved story
              </Button>
              <Button
                className="secondary-button"
                onClick={() =>
                  void execute("propose_story_control", { action: "new_story" }, false)
                }
              >
                New story
              </Button>
            </div>
          </section>
        )}

        <form
          className="typed-command figma-command-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void runTypedCommand();
          }}
        >
          <label htmlFor="intercept-command">Typed command</label>
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
        <p
          className="sr-announcement figma-response"
          aria-live={settings.screenReaderMode ? "polite" : "off"}
          aria-atomic="true"
        >
          <Volume2 aria-hidden="true" size={18} /> {response}
        </p>
        {pending && (
          <div
            className="pending-action figma-pending-action"
            role="group"
            aria-label="Story action confirmation"
          >
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
          The Intercept story © 2016 inkle Ltd., used under the MIT License.
        </p>
        <button
          type="button"
          className={`figma-voice-orb voice-${voice.isSpeaking ? "speaking" : voice.status === "connected" && !voice.microphoneMuted ? "listening" : voice.status}`}
          onClick={() => {
            if (voice.needsAudioActivation) void voice.activateAudio();
            else if (voice.status === "connected") voice.toggleMicrophone();
            else void voice.start();
          }}
          disabled={
            (voice.status === "connecting" && !voice.needsAudioActivation) ||
            voice.status === "closing"
          }
          aria-label={
            voice.needsAudioActivation
              ? "Start voice"
              : voice.status === "connected"
                ? voice.microphoneMuted
                  ? "Unmute voice companion"
                  : "Mute voice companion"
                : "Start voice companion"
          }
        >
          <LiquidOrb tone="red" />
          <span className="sr-only" aria-live="polite">
            {voice.isSpeaking
              ? "Companion speaking"
              : voice.status === "connected" && !voice.microphoneMuted
                ? "Listening"
                : voice.status === "connecting"
                  ? "Connecting voice"
                  : "Voice is off"}
          </span>
        </button>
      </main>
    </div>
  );
}
