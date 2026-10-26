import { useEffect, useRef, useState } from "react";
import { ArrowUp, Keyboard, Square, X } from "lucide-react";
import type { ChessCompanion } from "../../voice/useChessCompanion";
import LiquidOrb from "./LiquidOrb";
import { usePresence } from "../../hooks/usePresence";

export default function CompanionDock({
  companion,
  green,
  screenReaderMode,
}: {
  companion: ChessCompanion;
  green: boolean;
  screenReaderMode: boolean;
}) {
  const [command, setCommand] = useState("");
  const [typing, setTyping] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const followCaption = useRef(true);
  const voice = companion.voice;
  const commandPanel = usePresence(typing);

  // Reopening during the closing animation reuses the panel, so focus the input explicitly.
  useEffect(() => {
    if (typing) commandRef.current?.focus();
  }, [typing]);

  function closeCommands() {
    setTyping(false);
    toggleRef.current?.focus();
  }

  useEffect(() => {
    const element = captionRef.current;
    if (element && followCaption.current) element.scrollTop = element.scrollHeight;
  }, [voice.caption, companion.message]);
  const active = voice.status === "connected" && !voice.needsAudioActivation;
  const activity = voice.isSpeaking
    ? "speaking"
    : active && !voice.microphoneMuted
      ? "listening"
      : voice.status;
  const waiting = voice.status === "connecting" || voice.status === "closing";
  const label = voice.needsAudioActivation
    ? "Start voice"
    : voice.status === "connecting"
      ? "Connecting voice"
      : voice.status === "closing"
        ? "Ending voice"
        : active
          ? voice.microphoneMuted
            ? "Microphone muted"
            : "Listening"
          : voice.status === "error"
            ? "Retry voice"
            : "Start voice";
  return (
    <footer
      className={`companion-dock${green ? " dock-green" : ""}${active ? " voice-connected" : ""} voice-${activity}`}
      aria-label="Voice companion"
      data-voice-activity={activity}
    >
      <div className="companion-orb-row">
        <button
          type="button"
          className="orb-button"
          aria-label={
            voice.needsAudioActivation
              ? "Start voice"
              : active
                ? voice.microphoneMuted
                  ? "Unmute microphone"
                  : "Mute microphone"
                : waiting
                  ? label
                  : "Start voice companion"
          }
          disabled={waiting && !voice.needsAudioActivation}
          onClick={() => {
            if (voice.needsAudioActivation) void voice.activateAudio();
            else if (active) voice.toggleMicrophone();
            else void voice.start();
          }}
        >
          <LiquidOrb green={green} />
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {label}
          </span>
        </button>
        <button
          className={`dock-icon typed-toggle${typing ? " is-active" : ""}`}
          ref={toggleRef}
          onClick={() => {
            if (typing) closeCommands();
            else setTyping(true);
          }}
          aria-label={typing ? "Close typed commands" : "Type a command"}
          aria-expanded={typing}
          aria-controls="command-panel"
        >
          <Keyboard size={20} aria-hidden="true" />
        </button>
        {(active || voice.status === "connecting" || voice.needsAudioActivation) && (
          <button
            className="dock-icon end-voice"
            aria-label="End voice"
            onClick={() => {
              void voice.stop();
            }}
          >
            <Square size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {voice.error && (
        <div className="voice-error" role="alert">
          <p>{voice.error}</p>
          {voice.needsAudioActivation ? (
            <button type="button" onClick={() => void voice.activateAudio()}>
              Start voice
            </button>
          ) : voice.status === "error" ? (
            <button type="button" onClick={() => void voice.start()}>
              Retry voice
            </button>
          ) : null}
        </div>
      )}
      <p
        ref={captionRef}
        className="companion-caption"
        onScroll={(event) => {
          const element = event.currentTarget;
          followCaption.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 16;
        }}
        aria-live={screenReaderMode ? "polite" : "off"}
        aria-atomic="true"
      >
        {voice.caption || companion.message}
      </p>
      {commandPanel.mounted && (
        <form
          id="command-panel"
          className={`command-panel${commandPanel.closing ? " is-closing" : ""}`}
          inert={commandPanel.closing || undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeCommands();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (command.trim()) {
              void companion.runCommand(command);
              setCommand("");
            }
          }}
        >
          <div className="command-panel-heading">
            <label htmlFor="typed-command">Type to your companion</label>
            <button
              type="button"
              className="text-icon"
              aria-label="Close typed commands"
              onClick={closeCommands}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="command-input-row">
            <input
              id="typed-command"
              ref={commandRef}
              autoFocus
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Try e2 to e4, hint, or help"
              autoComplete="off"
              maxLength={300}
            />
            <button
              className="send-command"
              type="submit"
              disabled={companion.busy || !command.trim()}
              aria-label="Send command"
            >
              <ArrowUp size={20} aria-hidden="true" />
            </button>
          </div>
          <p>No microphone needed. Typed commands run immediately.</p>
        </form>
      )}
    </footer>
  );
}
