import { describe, expect, it } from "vite-plus/test";
import {
  AVAILABLE_DESTINATIONS,
  navigationTool,
  parseDestination,
  PLAYABLE_GAMES,
  PLAYABLE_GAMES_LABEL,
  shouldCarryVoiceOnNavigation,
} from "./navigation";

describe("playable game registry", () => {
  it("advertises every game the shell can open", () => {
    expect(PLAYABLE_GAMES).toEqual(["chess", "loups-garous", "ludo", "intercept", "tic-tac-toe"]);
    expect(AVAILABLE_DESTINATIONS).toEqual([
      "home",
      "audio",
      "help",
      "chess",
      "loups-garous",
      "ludo",
      "intercept",
      "tic-tac-toe",
    ]);
    expect(PLAYABLE_GAMES_LABEL).toBe("Chess, Loups-Garous, Ludo, The Intercept, and Tic-Tac-Toe");
  });

  it("gives the voice provider the same destinations the app can open", () => {
    const advertised = navigationTool.parameters.properties.destination.enum;
    expect(advertised).toEqual(AVAILABLE_DESTINATIONS);
    expect(advertised).toContain("tic-tac-toe");
  });

  it("parses every advertised destination and rejects the rest", () => {
    expect(parseDestination("loups-garous")).toBe("loups-garous");
    expect(parseDestination("tic-tac-toe")).toBe("tic-tac-toe");
    expect(parseDestination("werewolf")).toBeNull();
    expect(parseDestination("")).toBeNull();
    expect(parseDestination(undefined)).toBeNull();
    expect(parseDestination(7)).toBeNull();
  });
});

describe("voice navigation handoff", () => {
  it("carries an in-progress connection into a newly mounted game", () => {
    expect(shouldCarryVoiceOnNavigation("connecting", false)).toBe(true);
  });

  it("carries a connected or enabled voice session but respects an explicit opt-out", () => {
    expect(shouldCarryVoiceOnNavigation("connected", false)).toBe(true);
    expect(shouldCarryVoiceOnNavigation("idle", true)).toBe(true);
    expect(shouldCarryVoiceOnNavigation("idle", false)).toBe(false);
    expect(shouldCarryVoiceOnNavigation("error", false)).toBe(false);
  });
});
