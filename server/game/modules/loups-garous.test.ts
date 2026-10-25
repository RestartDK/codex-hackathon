import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createGame, startGame, view } from "../engine.js";
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

  it("resolves a spoken Witch save and poison as one validated night action", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 5, {
      fixedRoles: ["witch", "werewolf", "villager", "seer", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 1, hunter: 0, cupid: 0 },
      controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot", "npc-4": "bot" },
    });
    startGame(game);
    await prepareGame(game);
    const victim = game.players.find((candidate) => candidate.id === "npc-2")!;
    const poisonTarget = game.players.find((candidate) => candidate.id === "npc-4")!;
    for (const wolf of game.players.filter((candidate) => candidate.role === "werewolf"))
      wolf.nightAction = { kind: "wolf", targetId: victim.id };
    game.wolfVictimId = victim.id;

    const command = `save ${victim.name} and poison ${poisonTarget.name}`;
    expect(await loupsGarous.parseCommand!(command, game, "human")).toEqual({
      type: "night",
      save: victim.id,
      poison: poisonTarget.id,
    });

    await loupsGarous.applyAction(game, "human", {
      type: "night",
      save: victim.id,
      poison: poisonTarget.id,
    });

    expect(victim.alive).toBe(true);
    expect(poisonTarget.alive).toBe(false);
    expect(game.witchHealAvailable).toBe(false);
    expect(game.witchPoisonAvailable).toBe(false);
    expect(game.phase).not.toBe("night");
    expect(
      game.feed.some(
        (entry) => entry.kind === "event" && entry.text.includes(poisonTarget.name),
      ),
    ).toBe(true);
    expect(
      game.feed.some((entry) => entry.kind === "event" && entry.text.includes(victim.name)),
    ).toBe(false);
  });

  it("rejects an illegal combined potion action without spending either potion", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 5, {
      fixedRoles: ["witch", "werewolf", "villager", "seer", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 1, hunter: 0, cupid: 0 },
      controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot", "npc-4": "bot" },
    });
    startGame(game);
    await prepareGame(game);
    const victim = game.players.find((candidate) => candidate.id === "npc-2")!;
    for (const wolf of game.players.filter((candidate) => candidate.role === "werewolf"))
      wolf.nightAction = { kind: "wolf", targetId: victim.id };
    game.wolfVictimId = victim.id;

    await expect(
      loupsGarous.applyAction(game, "human", {
        type: "night",
        save: victim.id,
        poison: victim.id,
      }),
    ).rejects.toThrow(/valid poison target/u);
    expect(game.witchHealAvailable).toBe(true);
    expect(game.witchPoisonAvailable).toBe(true);
    expect(game.phase).toBe("night");
    expect(victim.alive).toBe(true);
    expect(() => loupsGarous.parseCommand!("use both potions", game, "human")).toThrow(
      /player to save/u,
    );
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
