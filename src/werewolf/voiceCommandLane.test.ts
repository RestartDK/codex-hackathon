import { describe, expect, it } from "vite-plus/test";
import { VoiceCommandLane, voiceOrbAction } from "./voiceCommandLane";

describe("Loups-Garous voice command delivery", () => {
  it("runs the next queued command against the new screen, not the captured old screen", async () => {
    const lane = new VoiceCommandLane();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const seen: string[] = [];
    let handler = async (text: string) => {
      seen.push(`setup:${text}`);
      await pending;
    };
    const first = lane.enqueue("confirm", () => handler);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = lane.enqueue("continue", () => handler);
    handler = async (text) => {
      seen.push(`village:${text}`);
    };
    finish();
    await Promise.all([first, second]);
    expect(seen).toEqual(["setup:confirm", "village:continue"]);
  });

  it("does not discard intentional repeats or the same command on the next screen", async () => {
    const lane = new VoiceCommandLane();
    const seen: string[] = [];
    const handler = async (text: string) => {
      seen.push(text);
    };
    await lane.enqueue("continue", () => handler);
    await lane.enqueue("continue", () => handler);
    await lane.enqueue("repeat my role", () => handler);
    await lane.enqueue("repeat my role", () => handler);
    expect(seen).toHaveLength(4);
  });

  it("deduplicates only the tool counterpart of a direct setup confirmation", () => {
    const lane = new VoiceCommandLane();
    lane.confirmedDirectly("Confirm.");
    expect(lane.consumeDirectConfirmation("CONFIRM")).toBe(true);
    expect(lane.consumeDirectConfirmation("confirm")).toBe(false);
    expect(lane.consumeDirectConfirmation("continue")).toBe(false);
  });

  it("drops queued commands after leaving the game", async () => {
    const lane = new VoiceCommandLane();
    const seen: string[] = [];
    const queued = lane.enqueue("vote for Emma", () => async (text) => {
      seen.push(text);
    });
    lane.reset();
    await queued;
    expect(seen).toEqual([]);
  });

  it("recovers the persisted muted microphone before toggling command pause", () => {
    const state = {
      connected: true,
      busy: false,
      needsAudioActivation: false,
      microphoneMuted: true,
      commandsPaused: false,
    };
    expect(voiceOrbAction(state)).toBe("unmute");
    expect(voiceOrbAction({ ...state, commandsPaused: true })).toBe("unmute");
    expect(voiceOrbAction({ ...state, microphoneMuted: false })).toBe("pause");
    expect(voiceOrbAction({ ...state, microphoneMuted: false, commandsPaused: true })).toBe(
      "resume",
    );
    expect(voiceOrbAction({ ...state, needsAudioActivation: true })).toBe("activate");
  });
});
