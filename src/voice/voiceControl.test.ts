import { describe, expect, it } from "vite-plus/test";
import {
  applyVoiceControl,
  parseVoiceControlAction,
  pausedCommandMessage,
  recoveryDelay,
  voiceControlAllowedWhilePaused,
  VOICE_CONTROL_ACTIONS,
  VOICE_RECOVERY_DELAYS_MS,
  voiceControlTool,
} from "./voiceControl";

const connected = { connected: true, commandsPaused: false, microphoneMuted: false };

describe("voice lifecycle control", () => {
  it("advertises the same actions the transport handles", () => {
    expect(voiceControlTool.parameters.properties.action.enum).toEqual(VOICE_CONTROL_ACTIONS);
    expect(parseVoiceControlAction('{"action":"pause_commands"}')).toBe("pause_commands");
    expect(parseVoiceControlAction('{"action":"shout"}')).toBeNull();
    expect(parseVoiceControlAction("not json")).toBeNull();
  });

  it("pauses game actions without closing the microphone, and allows resume or navigation", () => {
    const paused = applyVoiceControl(connected, "pause_commands");
    expect(paused.effect).toBe("pause");
    expect(paused.state.commandsPaused).toBe(true);
    expect(paused.message).toContain("microphone stays open");
    expect(voiceControlAllowedWhilePaused("voice_control")).toBe(true);
    expect(voiceControlAllowedWhilePaused("navigate_app")).toBe(true);
    expect(voiceControlAllowedWhilePaused("app_control")).toBe(true);
    expect(voiceControlAllowedWhilePaused("propose_token_move")).toBe(false);
    expect(voiceControlAllowedWhilePaused("make_move")).toBe(false);
    expect(pausedCommandMessage(paused.state)).toContain("resume voice commands");
    const resumed = applyVoiceControl(paused.state, "resume_commands");
    expect(resumed.state.commandsPaused).toBe(false);
  });

  it("describes a mute and an end honestly about what the microphone can still hear", () => {
    const muted = applyVoiceControl(connected, "mute_microphone");
    expect(muted.effect).toBe("mute");
    expect(muted.state.microphoneMuted).toBe(true);
    expect(muted.message).toContain("cannot hear you");
    const ended = applyVoiceControl(connected, "end_voice");
    expect(ended.effect).toBe("end");
    expect(ended.state.connected).toBe(false);
    expect(ended.message).toContain("Start voice companion");
    expect(ended.message).toContain("cannot hear a voice command");
  });

  it("reports pause and mute state accurately", () => {
    const state = applyVoiceControl(
      { ...connected, commandsPaused: true, microphoneMuted: true },
      "read_state",
    ).message;
    expect(state).toBe("Voice is connected; commands paused; microphone muted.");
  });

  it("does not claim disconnected capture is listening or mutate its controls", () => {
    const off = { ...connected, connected: false };
    expect(applyVoiceControl(off, "read_state").message).toContain("not connected");
    const unmute = applyVoiceControl(off, "unmute_microphone");
    expect(unmute.effect).toBe("none");
    expect(unmute.state).toBe(off);
    expect(unmute.message).not.toContain("listening again");
    expect(voiceControlAllowedWhilePaused("get_preferences")).toBe(true);
    expect(voiceControlAllowedWhilePaused("set_preference")).toBe(true);
    expect(voiceControlAllowedWhilePaused("submit_player_command")).toBe(true);
  });

  it("bounds automatic recovery attempts", () => {
    const delays = VOICE_RECOVERY_DELAYS_MS.map((_, attempt) => recoveryDelay(attempt));
    expect(delays).toEqual([...VOICE_RECOVERY_DELAYS_MS]);
    expect(recoveryDelay(VOICE_RECOVERY_DELAYS_MS.length)).toBeNull();
  });
});
