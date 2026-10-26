import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createGame, introduceStory, startGame, view } from "../engine.js";
import { prepareGame } from "../prepare.js";
import { loupsGarous } from "./loups-garous.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Loups-Garous voice-command actions", () => {
  const wolfGame = () =>
    createGame("You", 6, {
      fixedRoles: ["werewolf", "villager", "seer", "witch", "hunter", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 1, hunter: 1, cupid: 0 },
    });
  it("rejects Werewolf hunts outside night and after death without mutating the game", async () => {
    for (const phase of ["prologue", "day", "vote", "over"] as const) {
      const game = wolfGame();
      game.phase = phase;
      const before = structuredClone(game);
      await expect(
        loupsGarous.applyAction(game, "human", { type: "night", target: "npc-1" }),
      ).rejects.toThrow("not night");
      expect(game).toEqual(before);
    }
    const game = wolfGame();
    startGame(game);
    game.players[0]!.alive = false;
    await expect(
      loupsGarous.applyAction(game, "human", { type: "night", target: "npc-1" }),
    ).rejects.toThrow("living player");
  });
  it("waits for the human pack choice, then applies the NPC Witch before dawn", async () => {
    const game = wolfGame();
    introduceStory(game);
    await loupsGarous.applyAction(game, "human", { type: "begin-story" });
    expect(game.phase).toBe("night");
    expect(game.wolfVictimId).toBeUndefined();
    expect(game.players.find((p) => p.role === "witch")!.nightAction).toBeUndefined();
    await loupsGarous.applyAction(game, "human", { type: "night", target: "npc-1" });
    expect(game.players[1]!.alive).toBe(true);
    expect(game.witchHealAvailable).toBe(false);
    expect(game.feed.some((e) => e.text === "Dawn breaks. No one died last night.")).toBe(true);
  });
  it("advances NPC-only nights but waits for living human private abilities", async () => {
    const game = wolfGame();
    [game.players[0]!.role, game.players[1]!.role] = ["villager", "werewolf"];
    introduceStory(game);
    await loupsGarous.applyAction(game, "human", { type: "begin-story" });
    expect(game.phase).toBe("day");
    expect(game.feed.some((e) => e.kind === "speech")).toBe(true);
  });
  it("parses Cupid self-pairing, precise combined potions and negative commands safely", async () => {
    const game = createGame("You", 6, {
      fixedRoles: ["cupid", "werewolf", "witch", "seer", "hunter", "villager"],
      roleCounts: { werewolf: 1, villager: 1, seer: 1, witch: 1, hunter: 1, cupid: 1 },
    });
    startGame(game);
    expect(loupsGarous.parseCommand!("pair me and Emma", game, "human")).toEqual({
      type: "lovers",
      first: "human",
      second: "npc-1",
    });
    game.phase = "night";
    game.players[0]!.role = "witch";
    game.wolfVictimId = "npc-1";
    expect(loupsGarous.parseCommand!("save Emma and poison Lucas", game, "human")).toEqual({
      type: "night",
      save: "npc-1",
      poison: "npc-2",
    });
    expect(loupsGarous.parseCommand!("use my poison potion on Lucas", game, "human")).toEqual({
      type: "night",
      poison: "npc-2",
    });
    expect(loupsGarous.parseCommand!("poison Emma", game, "human")).toEqual({
      type: "night",
      poison: "npc-1",
    });
    expect(() => loupsGarous.parseCommand!("don't poison Lucas", game, "human")).toThrow(
      "No action",
    );
    expect(() => loupsGarous.parseCommand!("save and poison me", game, "human")).toThrow(
      "cannot poison yourself",
    );
    expect(loupsGarous.parseCommand!("save me and poison Lucas", game, "human")).toEqual({
      type: "night",
      save: "human",
      poison: "npc-2",
    });
    const invalidSave = await loupsGarous.parseCommand!(
      "save Sofia and poison Lucas",
      game,
      "human",
    );
    const before = structuredClone(game);
    await expect(loupsGarous.applyAction(game, "human", invalidSave)).rejects.toThrow("only save");
    expect(game).toEqual(before);
  });
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

    expect(await loupsGarous.parseCommand!("I accuse Emma", game, "human")).toEqual({
      type: "speak",
      message: "I accuse Emma",
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

  it("lets a human Witch save herself through the victim card or by voice", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 4, {
      fixedRoles: ["witch", "werewolf", "villager", "seer"],
      roleCounts: { werewolf: 1, villager: 1, seer: 1, witch: 1, hunter: 0, cupid: 0 },
      controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot" },
    });
    startGame(game);
    await prepareGame(game);
    for (const wolf of game.players.filter((candidate) => candidate.role === "werewolf"))
      wolf.nightAction = { kind: "wolf", targetId: "human" };
    game.wolfVictimId = "human";

    expect(view(game, "human").me.wolfVictim).toBe("Ada");
    expect(await loupsGarous.parseCommand!("save me", game, "human")).toEqual({
      type: "night",
      save: "human",
    });
    const other = game.players.find((candidate) => candidate.id !== "human")!;
    await expect(
      loupsGarous.applyAction(game, "human", { type: "night", save: other.id }),
    ).rejects.toThrow(/only save the player the Werewolves chose/u);
    expect(game.witchHealAvailable).toBe(true);

    await loupsGarous.applyAction(game, "human", { type: "night", save: "human" });
    expect(game.witchHealAvailable).toBe(false);
    expect(game.players.find((candidate) => candidate.id === "human")!.alive).toBe(true);
    expect(game.phase).not.toBe("night");
  });

  it("shows current-round votes received during voting and resets them each round", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 6, {
      fixedRoles: ["villager", "werewolf", "villager", "villager", "seer", "witch"],
      roleCounts: { werewolf: 1, villager: 3, seer: 1, witch: 1, hunter: 0, cupid: 0 },
      controllers: Object.fromEntries(
        Array.from({ length: 5 }, (_, index) => [`npc-${index + 1}`, "bot" as const]),
      ),
    });
    startGame(game);
    game.phase = "day";
    game.discussionDay = game.day;
    expect(view(game, "human").voteTally).toBeUndefined();

    await loupsGarous.applyAction(game, "human", { type: "begin-vote" });
    const tally = view(game, "human").voteTally!;
    const living = game.players.filter((candidate) => candidate.alive);
    expect(Object.keys(tally).sort()).toEqual(living.map((candidate) => candidate.id).sort());
    // Every NPC ballot is counted once for its target; the human has not voted yet.
    expect(Object.values(tally).reduce((sum, count) => sum + count, 0)).toBe(living.length - 1);
    for (const candidate of living)
      expect(tally[candidate.id]).toBe(
        living.filter((voter) => voter.voteId === candidate.id).length,
      );

    const target = living.find((candidate) => candidate.id !== "human")!;
    await loupsGarous.applyAction(game, "human", { type: "vote", target: target.id });
    expect(view(game, "human").voteTally).toBeUndefined();
    expect(game.players.every((candidate) => candidate.voteId === undefined)).toBe(true);
  });
});
