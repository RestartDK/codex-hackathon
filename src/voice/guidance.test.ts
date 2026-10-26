import { describe, expect, it } from "vite-plus/test";
import {
  GuidanceTracker,
  LiveGuidanceDelivery,
  isCurrentSetupAnswer,
  parseGuidanceCommand,
  type GuidanceSnapshot,
} from "./guidance";

const snapshot = (key: string): GuidanceSnapshot => ({
  key,
  message: `guidance ${key}`,
  location: `location ${key}`,
  capabilities: `actions ${key}`,
});

describe("live guidance delivery", () => {
  it("keeps an introduction pending until remote audio starts", () => {
    const delivery = new LiveGuidanceDelivery();
    delivery.sync("entry:mode", "Welcome to Loups-Garous");

    expect(delivery.request(1, 4)).toBe("Welcome to Loups-Garous");
    expect(delivery.request(1, 4)).toBeNull();
    expect(delivery.confirmPlayback(4)).toBe(false);
    expect(delivery.currentMessage()).toBe("Welcome to Loups-Garous");
    expect(delivery.confirmPlayback(5)).toBe(true);
    expect(delivery.currentMessage()).toBeNull();
  });

  it("reissues an undelivered introduction after reconnecting", () => {
    const delivery = new LiveGuidanceDelivery();
    delivery.sync("entry:mode", "Welcome");
    expect(delivery.request(1, 0)).toBe("Welcome");
    expect(delivery.request(2, 0)).toBe("Welcome");
    expect(delivery.confirmPlayback(1)).toBe(true);
    expect(delivery.request(3, 1)).toBeNull();
  });

  it("replaces stale guidance when the visible setup step changes", () => {
    const delivery = new LiveGuidanceDelivery();
    delivery.sync("mode", "Choose Solo");
    expect(delivery.request(1, 0)).toBe("Choose Solo");
    delivery.sync("village", "Choose a village size");
    expect(delivery.request(1, 0)).toBe("Choose a village size");
    expect(delivery.confirmPlayback(1)).toBe(true);
  });
});

describe("voice guidance lifecycle", () => {
  it("speaks a snapshot once while allowing changed and revisited steps", () => {
    const tracker = new GuidanceTracker();
    expect(tracker.take(snapshot("step-1"))).toBe("guidance step-1");
    expect(tracker.take(snapshot("step-1"))).toBeNull();
    expect(tracker.take(snapshot("step-2"))).toBe("guidance step-2");
    expect(tracker.take(snapshot("step-1"))).toBe("guidance step-1");
  });

  it("repeat returns current guidance without changing the flow", () => {
    const tracker = new GuidanceTracker();
    tracker.take(snapshot("setup"));
    expect(tracker.repeat(snapshot("setup"))).toBe("guidance setup");
    expect(tracker.take(snapshot("setup"))).toBeNull();
  });
});

describe("shared guidance commands", () => {
  it.each([
    ["What can I do?", "capabilities"],
    ["Where am I?", "location"],
    ["Repeat.", "repeat"],
    ["Explain this", "explain"],
    ["Go back", "back"],
    ["Go home", "home"],
    ["Use the defaults", "defaults"],
    ["Start the game", "start"],
  ] as Array<[string, string]>)("parses %s", (input: string, expected: string) => {
    expect(parseGuidanceCommand(input)).toBe(expected);
  });
});

describe("setup response synchronization", () => {
  it("accepts only the field belonging to the visible step", () => {
    expect(isCurrentSetupAnswer("difficulty", ["difficulty"])).toBe(true);
    expect(isCurrentSetupAnswer("difficulty", ["playerColor"])).toBe(false);
    expect(isCurrentSetupAnswer("difficulty", ["difficulty", "playerColor"])).toBe(false);
  });

  it("rejects delayed answers after setup reaches confirmation", () => {
    expect(isCurrentSetupAnswer("firstTurn", ["firstTurn"], true)).toBe(false);
  });
});
