import { describe, expect, it } from "vite-plus/test";
import {
  clampVillageCount,
  describeWerewolfSetup,
  MAX_VILLAGE,
  MIN_VILLAGE,
  parseWerewolfSetupCommand,
} from "./setupCommands";
import { looksLikeControlCommand } from "./voiceRouting";

describe("Loups-Garous setup voice commands", () => {
  it("clamps the village size to the playable range", () => {
    expect(clampVillageCount(2)).toBe(MIN_VILLAGE);
    expect(clampVillageCount(40)).toBe(MAX_VILLAGE);
    expect(clampVillageCount(Number.NaN)).toBe(MIN_VILLAGE);
    expect(clampVillageCount(6.4)).toBe(6);
  });

  it("opens solo setup and adjusts the village count", () => {
    expect(parseWerewolfSetupCommand("solo", 8)).toEqual({ kind: "open-village" });
    expect(parseWerewolfSetupCommand("set up the game", 8)).toEqual({ kind: "open-mode" });
    expect(parseWerewolfSetupCommand("set it to 6 players", 8)).toEqual({
      kind: "set-count",
      count: 6,
    });
    expect(parseWerewolfSetupCommand("twelve villagers", 8)).toEqual({
      kind: "set-count",
      count: MAX_VILLAGE,
    });
    expect(parseWerewolfSetupCommand("more players", 11)).toEqual({
      kind: "set-count",
      count: 12,
    });
    expect(parseWerewolfSetupCommand("fewer players", 4)).toEqual({
      kind: "set-count",
      count: 4,
    });
  });

  it("toggles explanations, reads the setup, and starts explicitly", () => {
    expect(parseWerewolfSetupCommand("turn explanations off", 8)).toEqual({
      kind: "explain",
      enabled: false,
    });
    expect(parseWerewolfSetupCommand("explain the game as we play on", 8)).toEqual({
      kind: "explain",
      enabled: true,
    });
    expect(parseWerewolfSetupCommand("read the setup", 8)).toEqual({ kind: "read" });
    expect(parseWerewolfSetupCommand("start with the defaults", 8)).toEqual({ kind: "defaults" });
    expect(parseWerewolfSetupCommand("start a quick test", 8)).toEqual({
      kind: "start",
      quickTest: true,
    });
    expect(parseWerewolfSetupCommand("back", 8)).toEqual({ kind: "back" });
    expect(parseWerewolfSetupCommand("cancel", 8)).toEqual({ kind: "cancel" });
    expect(parseWerewolfSetupCommand("what a strange night", 8)).toBeNull();
  });

  it("describes the current setup options and chosen size", () => {
    const village = describeWerewolfSetup({
      stage: "village",
      count: 6,
      explainGame: true,
      roles: [
        { role: "Werewolf", total: 1 },
        { role: "Villager", total: 2 },
      ],
    });
    expect(village).toContain("6 players");
    expect(village).toContain("1 Werewolf, 2 Villagers");
    expect(village).toContain("Explain the game as we play is on");
    expect(describeWerewolfSetup({ stage: "mode", count: 8, explainGame: false, roles: [] })).toContain(
      "With Friends is coming soon",
    );
  });
});

describe("Loups-Garous public speech routing", () => {
  it("treats control-shaped sentences as commands, not village messages", () => {
    expect(looksLikeControlCommand("set volume to 60")).toBe(true);
    expect(looksLikeControlCommand("cancel")).toBe(true);
    expect(looksLikeControlCommand("undo")).toBe(true);
    expect(looksLikeControlCommand("pause game")).toBe(true);
    expect(looksLikeControlCommand("set audio balance for Emma to the left")).toBe(true);
  });

  it("keeps ordinary day speech public", () => {
    expect(looksLikeControlCommand("I think Lucas is suspicious")).toBe(false);
    expect(looksLikeControlCommand("Emma, who do you suspect?")).toBe(false);
    expect(looksLikeControlCommand("tell the village I trust Lucas")).toBe(false);
    expect(looksLikeControlCommand("Stop being so suspicious")).toBe(false);
    expect(looksLikeControlCommand("Read the room")).toBe(false);
    expect(looksLikeControlCommand("Go ahead, Emma")).toBe(false);
    expect(looksLikeControlCommand("save Noah and poison Emma")).toBe(false);
    expect(looksLikeControlCommand("use both potions")).toBe(false);
  });
});
