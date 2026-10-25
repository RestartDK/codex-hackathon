export const VOICE_CONTROL_ACTIONS = [
  "pause_commands",
  "resume_commands",
  "mute_microphone",
  "unmute_microphone",
  "read_state",
  "end_voice",
] as const;

export type VoiceControlAction = (typeof VOICE_CONTROL_ACTIONS)[number];

export const voiceControlTool = {
  type: "function",
  name: "voice_control",
  description:
    "Control the voice session itself. pause_commands keeps the microphone open but ignores game actions until resume_commands; mute_microphone and unmute_microphone switch voice input off and on; read_state reports listening, pause, and mute; end_voice closes the session, after which only the on-screen Start voice companion control can reopen the microphone.",
  parameters: {
    type: "object",
    properties: { action: { type: "string", enum: VOICE_CONTROL_ACTIONS } },
    required: ["action"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export type VoiceControlState = {
  connected: boolean;
  commandsPaused: boolean;
  microphoneMuted: boolean;
};

export type VoiceControlEffect = "none" | "pause" | "resume" | "mute" | "unmute" | "end";

export type VoiceControlResult = {
  message: string;
  effect: VoiceControlEffect;
  state: VoiceControlState;
};

export const VOICE_RECOVERY_DELAYS_MS = [1_200, 4_000] as const;

export function recoveryDelay(attempt: number): number | null {
  return VOICE_RECOVERY_DELAYS_MS[attempt] ?? null;
}

export function parseVoiceControlValue(value: unknown): VoiceControlAction | null {
  return VOICE_CONTROL_ACTIONS.find((candidate) => candidate === value) ?? null;
}

export function parseVoiceControlAction(rawArguments: string): VoiceControlAction | null {
  let parsed: unknown;
  try {
    parsed = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parseVoiceControlValue((parsed as { action?: unknown }).action);
}

export function voiceControlAllowedWhilePaused(toolName: string): boolean {
  return (
    toolName === voiceControlTool.name || toolName === "navigate_app" || toolName === "app_control"
  );
}

export function pausedCommandMessage(state: VoiceControlState): string {
  return state.commandsPaused
    ? "Voice commands are paused. Say resume voice commands before playing."
    : "Voice commands are active.";
}

export function describeVoiceControlState(state: VoiceControlState): string {
  const connection = state.connected ? "Voice is connected" : "Voice is not connected";
  const commands = state.commandsPaused ? "commands paused" : "commands active";
  const microphone = state.microphoneMuted ? "microphone muted" : "microphone on";
  return `${connection}; ${commands}; ${microphone}.`;
}

export function applyVoiceControl(
  state: VoiceControlState,
  action: VoiceControlAction,
): VoiceControlResult {
  switch (action) {
    case "pause_commands": {
      const next = { ...state, commandsPaused: true };
      return {
        message:
          "Voice commands are paused. The microphone stays open, so say resume voice commands when you are ready.",
        effect: "pause",
        state: next,
      };
    }
    case "resume_commands": {
      const next = { ...state, commandsPaused: false };
      return {
        message: "Voice commands are active again.",
        effect: "resume",
        state: next,
      };
    }
    case "mute_microphone": {
      const next = { ...state, microphoneMuted: true };
      return {
        message:
          "Microphone muted. Voice input is off until you unmute it with the on-screen microphone control, because a muted microphone cannot hear you.",
        effect: "mute",
        state: next,
      };
    }
    case "unmute_microphone": {
      const next = { ...state, microphoneMuted: false };
      return {
        message: "Microphone unmuted. Voice commands are listening again.",
        effect: "unmute",
        state: next,
      };
    }
    case "read_state":
      return {
        message: describeVoiceControlState(state),
        effect: "none",
        state,
      };
    case "end_voice":
      return {
        message:
          "Ending voice. The microphone switches off now; to start again, use the on-screen Start voice companion control, because a stopped microphone cannot hear a voice command.",
        effect: "end",
        state: { ...state, connected: false },
      };
  }
}
