import { describe, expect, it } from "vite-plus/test";
import {
  AVAILABLE_DESTINATIONS,
  navigationTool,
  parseDestination,
  PLAYABLE_GAMES,
  PLAYABLE_GAMES_LABEL,
} from "./navigation";

describe("playable game registry", () => {
  it("advertises every playable experience", () => {
    expect(PLAYABLE_GAMES).toEqual([
      "chess",
      "loups-garous",
      "ludo",
      "intercept",
      "tic-tac-toe",
    ]);
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
    expect(PLAYABLE_GAMES_LABEL).toBe(
      "Chess, Loups-Garous, Ludo, The Intercept, and Tic-Tac-Toe",
    );
  });

  it("gives the voice provider the same destinations the app can open", () => {
    const advertised = navigationTool.parameters.properties.destination.enum;
    expect(advertised).toEqual(AVAILABLE_DESTINATIONS);
    expect(advertised).toContain("tic-tac-toe");
  });

  it("parses every advertised destination and rejects the rest", () => {
    for (const destination of AVAILABLE_DESTINATIONS)
      expect(parseDestination(destination)).toBe(destination);
    expect(parseDestination("werewolf")).toBeNull();
    expect(parseDestination("")).toBeNull();
    expect(parseDestination(undefined)).toBeNull();
    expect(parseDestination(7)).toBeNull();
  });
});
