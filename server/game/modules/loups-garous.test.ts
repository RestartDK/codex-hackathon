import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createGame, startGame } from "../engine.js";
import { prepareGame } from "../prepare.js";
import { loupsGarous } from "./loups-garous.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Loups-Garous voice-command actions", () => {
  it("maps spoken accusations, pause, and resume to validated game actions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 4, {
      fixedRoles: ["seer", "werewolf", "villager", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, cupid: 0 },
      controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot" },
      testMode: true,
    });
    startGame(game);
    game.phase = "day";

    expect(await loupsGarous.parseCommand!("I accuse Camille", game, "human")).toEqual({
      type: "speak",
      message: "I accuse Camille",
    });
    await loupsGarous.applyAction(game, "human", { type: "pause" });
    expect(game.paused).toBe(true);
    expect(await loupsGarous.parseCommand!("resume game", game, "human")).toEqual({
      type: "resume",
    });
    await loupsGarous.applyAction(game, "human", { type: "resume" });
    expect(game.paused).toBe(false);
  });

  it("opens day discussion with autonomous NPC lines after a voice-valid night action", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 4, {
      fixedRoles: ["seer", "werewolf", "villager", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, cupid: 0 },
      controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot" },
      testMode: true,
    });
    startGame(game);
    await prepareGame(game);
    const target = game.players.find((candidate) => candidate.id !== "human")!;

    await loupsGarous.applyAction(game, "human", { type: "night", target: target.id });

    expect(["day", "over", "hunter"]).toContain(game.phase);
    if (game.phase === "day")
      expect(game.feed.some((entry) => entry.kind === "speech" && entry.speaker !== "Ada")).toBe(
        true,
      );
  });

  it("confirms a human Werewolf target privately and records the dawn death", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 4, {
      fixedRoles: ["werewolf", "seer", "villager", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, cupid: 0 },
      controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot" },
      testMode: true,
    });
    startGame(game);
    await prepareGame(game);
    const target = game.players.find((candidate) => candidate.id !== "human")!;

    await loupsGarous.applyAction(game, "human", { type: "night", target: target.id });

    expect(
      game.feed.some(
        (entry) =>
          entry.kind === "private" &&
          entry.recipientId === "human" &&
          entry.text.includes("You chose") &&
          entry.text.includes(target.name),
      ),
    ).toBe(true);
    expect(
      game.feed.some(
        (entry) =>
          entry.kind === "event" &&
          entry.text.includes(target.name) &&
          entry.text.includes("taken by the Werewolves"),
      ),
    ).toBe(true);
    expect(
      game.feed.some(
        (entry) =>
          entry.kind === "event" &&
          entry.text.includes("Dawn breaks") &&
          entry.text.includes(target.name),
      ),
    ).toBe(true);
  });
});
