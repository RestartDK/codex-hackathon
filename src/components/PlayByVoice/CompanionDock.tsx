import { useEffect, useRef } from "react";
import { Square } from "lucide-react";
import type { ChessCompanion } from "../../voice/useChessCompanion";
import LiquidOrb from "./LiquidOrb";

export default function CompanionDock({
  companion,
  green,
  screenReaderMode,
}: {
  companion: ChessCompanion;
  green: boolean;
  screenReaderMode: boolean;
}) {
  const captionRef = useRef<HTMLParagraphElement>(null);
  const followCaption = useRef(true);
  const voice = companion.voice;

  useEffect(() => {
    const element = captionRef.current;
    if (element && followCaption.current) element.scrollTop = element.scrollHeight;
  }, [voice.caption, companion.message]);
  const active = voice.status === "connected";
  const waiting = voice.status === "connecting" || voice.status === "closing";
  const label =
    voice.status === "connecting"
      ? "Connecting voice"
      : voice.status === "closing"
        ? "Ending voice"
        : active
          ? voice.microphoneMuted
            ? "Microphone muted"
            : voice.commandsPaused
              ? "Listening, commands paused"
              : "Listening"
          : voice.status === "error"
            ? "Retry voice"
            : "Start voice";
  return (
    <footer
      className={`companion-dock${green ? " dock-green" : ""}${active ? " voice-connected" : ""}`}
      aria-label="Voice companion"
    >
      <div className="companion-orb-row">
        <button
          type="button"
          className="orb-button"
          aria-label={
            active
              ? voice.microphoneMuted
                ? "Unmute microphone"
                : "Mute microphone"
              : waiting
                ? label
                : "Start voice companion"
          }
          disabled={waiting}
          onClick={() => {
            if (active) voice.toggleMicrophone();
            else void voice.start();
          }}
        >
          <LiquidOrb green={green} />
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {label}
          </span>
        </button>
        {(active || voice.status === "connecting") && (
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
        <p className="voice-error" role="alert">
          {voice.error}
        </p>
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
    </footer>
  );
}
