import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Preferences } from "../hooks/useSettings";
import { localIntent } from "./commands";
import { parseDestination, type AvailableDestination } from "./navigation";
import { useVoiceCompanion, type VoiceToolExecutor } from "./useVoiceCompanion";

export const LibraryVoiceContext = createContext<{
  preferences: Preferences;
  navigate: (destination: AvailableDestination, autoVoice?: boolean) => void;
  autoVoice?: boolean;
} | null>(null);

export function useLibraryVoice(executor: VoiceToolExecutor, gameId: string) {
  const context = useContext(LibraryVoiceContext);
  if (!context) throw new Error("The game must be opened from the game library.");
  const current = useRef({ context, executor });
  const voiceActive = useRef(false);
  const guidanceHandler = useRef<
    | ((
        action:
          | "capabilities"
          | "location"
          | "repeat"
          | "explain"
          | "back"
          | "home"
          | "defaults"
          | "start",
      ) => { ok: boolean; message: string } | Promise<{ ok: boolean; message: string }>)
    | null
  >(null);
  current.current = { context, executor };
  const [shared] = useState<VoiceToolExecutor>(() => ({
    invalidatePending: () => current.current.executor.invalidatePending?.(),
    execute: async (name, raw) => {
      const { context: bridge, executor: game } = current.current;
      let args: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        args = parsed as Record<string, unknown>;
      } catch {
        return JSON.stringify({
          status: "error",
          message: "The command arguments must be an object.",
        });
      }
      if (name === "navigate_app") {
        const destination = parseDestination(args.destination);
        if (!destination)
          return JSON.stringify({ status: "error", message: "Choose a game from the library." });
        game.invalidatePending?.();
        voiceControl.current?.interrupt();
        // Deliver the tool reply before unmounting the current voice connection.
        window.setTimeout(() => bridge.navigate(destination, voiceActive.current), 0);
        return JSON.stringify({
          status: "completed",
          message: `Opening ${destination}. Your progress is saved.`,
        });
      }
      if (name === "control_voice_guidance") {
        const action = args.action;
        if (
          typeof action !== "string" ||
          ![
            "capabilities",
            "location",
            "repeat",
            "explain",
            "back",
            "home",
            "defaults",
            "start",
          ].includes(action)
        )
          return JSON.stringify({ status: "error", message: "Unknown guidance command." });
        const handler = guidanceHandler.current;
        if (!handler)
          return JSON.stringify({
            status: "error",
            message: "Guidance is not ready on this screen.",
          });
        const result = await handler(action as Parameters<NonNullable<typeof handler>>[0]);
        return JSON.stringify({
          status: result.ok ? "completed" : "error",
          message: result.message,
        });
      }
      if (name === "get_preferences") {
        const s = bridge.preferences.settings;
        return JSON.stringify({
          status: "ok",
          message: `Narrator volume ${s.voiceVolume} percent. Screen-reader mode ${s.screenReaderMode ? "on" : "off"}.`,
          preferences: s,
        });
      }
      if (name === "set_preference") {
        if (
          args.preference === "voiceVolume" &&
          typeof args.value === "number" &&
          Number.isFinite(args.value) &&
          args.value >= 0 &&
          args.value <= 100
        )
          bridge.preferences.setVoiceVolume(args.value);
        else if (args.preference === "screenReaderMode" && typeof args.value === "boolean")
          bridge.preferences.setScreenReaderMode(args.value);
        else
          return JSON.stringify({
            status: "error",
            message: "Choose narrator volume from 0 to 100, or screen-reader mode on or off.",
          });
        return JSON.stringify({
          status: "completed",
          message: `${args.preference} set to ${args.value}.`,
        });
      }
      return game.execute(name, raw);
    },
  }));
  const voice = useVoiceCompanion(
    shared,
    context.preferences.settings.screenReaderMode,
    gameId,
    "home",
    context.preferences.settings.voiceVolume,
  );
  const voiceControl = useRef<typeof voice | null>(null);
  voiceControl.current = voice;
  voiceActive.current = voice.status === "connected";
  const startVoice = useRef(voice.start);
  startVoice.current = voice.start;
  useEffect(() => {
    if (context.autoVoice) void startVoice.current();
  }, [context.autoVoice, gameId]);
  const setGuidanceHandler = useCallback((handler: typeof guidanceHandler.current) => {
    guidanceHandler.current = handler;
  }, []);
  async function runGlobalCommand(command: string): Promise<string | null> {
    if (/^help$/i.test(command.trim())) return null;
    const intent = localIntent(command);
    if (!intent || !["navigate_app", "get_preferences", "set_preference"].includes(intent.name))
      return null;
    const result = JSON.parse(await shared.execute(intent.name, JSON.stringify(intent.args))) as {
      message: string;
    };
    if (voice.status === "connected") voice.announce(result.message);
    return result.message;
  }
  return { voice, runGlobalCommand, setGuidanceHandler };
}
