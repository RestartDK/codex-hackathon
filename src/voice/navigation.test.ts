import { describe, expect, it } from "vite-plus/test";
import {
  AVAILABLE_DESTINATIONS,
  navigationTool,
  parseDestination,
  PLAYABLE_GAMES,
  PLAYABLE_GAMES_LABEL,
} from "./navigation";

describe("playable game registry", () => {
  it("advertises Loups-Garous beside chess and keeps Tic-Tac-Toe unplayable", () => {
    expect(PLAYABLE_GAMES).toEqual(["chess", "loups-garous"]);
    expect(AVAILABLE_DESTINATIONS).toEqual(["home", "audio", "help", "chess", "loups-garous"]);
    expect(PLAYABLE_GAMES_LABEL).toBe("Chess and Loups-Garous");
  });

  it("gives the voice provider the same destinations the app can open", () => {
    const advertised = navigationTool.parameters.properties.destination.enum;
    expect(advertised).toEqual(AVAILABLE_DESTINATIONS);
    expect(advertised).not.toContain("tic-tac-toe");
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
