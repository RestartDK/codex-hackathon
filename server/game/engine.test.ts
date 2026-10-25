import { describe, expect, it } from "vite-plus/test";
import {
  beginVote,
  checkVictory,
  chooseLovers,
  createGame,
  hunterShot,
  introduceStory,
  resolveNight,
  resolveVote,
  speak,
  startGame,
  submitNightAction,
  submitVote,
  view,
} from "./engine.js";
import { defaultRoleCounts, validateRoleCounts } from "./rules.js";
import { authorize, createSession, saveGame } from "./store.js";

function gameAs(
  role: "werewolf" | "seer" | "witch" | "hunter" | "cupid" | "villager" = "villager",
  count = 8,
) {
  const counts = defaultRoleCounts(count);
  if (counts[role] === 0) {
    counts[role]++;
    counts.villager--;
  }
  const game = createGame("Ada", count, { roleCounts: counts });
  const me = game.players[0]!;
  const swap = game.players.find((p) => p.role === role)!;
  [me.role, swap.role] = [swap.role, me.role];
  return game;
}

describe("Loups-Garous rules engine", () => {
  it("validates role mixes and player counts", () => {
    expect(() => validateRoleCounts(4, defaultRoleCounts(4))).not.toThrow();
    expect(() => validateRoleCounts(5, { ...defaultRoleCounts(5), werewolf: 0 })).toThrow(
      /at least one/u,
    );
    expect(() => defaultRoleCounts(13)).toThrow();
  });
  it("starts a game and keeps roles private until the end", () => {
    const game = gameAs("seer");
    startGame(game);
    const result = view(game, "human");
    expect(result.phase).toBe("night");
    expect(result.me.role).toBe("seer");
    expect(result.players.every((p) => p.revealedRole === undefined)).toBe(true);
  });
  it("introduces the village with public character voices before the first night", () => {
    const game = gameAs("villager", 6);
    introduceStory(game);
    expect(game.phase).toBe("prologue");
    expect(game.feed.some((entry) => entry.speaker === "Narrator")).toBe(true);
    expect(
      game.feed.filter((entry) => entry.kind === "speech").map((entry) => entry.speaker),
    ).toEqual(
      game.players
        .filter((candidate) => candidate.controller !== "human")
        .map((candidate) => candidate.name),
    );
    const safeView = view(game, "human");
    expect(safeView.players.every((candidate) => candidate.profile.archetype)).toBe(true);
    expect(safeView.players.every((candidate) => candidate.profile.speakingStyle)).toBe(true);
    expect(JSON.stringify(safeView)).not.toContain("werewolf");
    startGame(game);
    expect(game.phase).toBe("night");
  });
  it("keeps public conversation and voting observations in NPC memory", () => {
    const game = gameAs("villager", 6);
    startGame(game);
    game.phase = "day";
    const speaker = game.players[1]!;
    const target = game.players[2]!;
    speak(game, speaker.id, `${target.name}, your story does not add up.`);
    const observer = game.players[3]!;
    expect(observer.memory.notes.at(-1)).toContain(speaker.name);
    expect(observer.memory.suspicion[target.id]).toBeGreaterThan(0);
    beginVote(game);
    for (const candidate of game.players.filter((player) => player.alive)) {
      const voteTarget = game.players.find(
        (targetCandidate) => targetCandidate.alive && targetCandidate.id !== candidate.id,
      )!;
      submitVote(game, candidate.id, voteTarget.id);
    }
    resolveVote(game, () => 0);
    expect(observer.memory.notes.some((note) => note.includes("voted for"))).toBe(true);
  });
  it("builds a predictable four-player Seer test game with bot-controlled villagers", () => {
    const roles = ["seer", "werewolf", "villager", "villager"] as const;
    const game = createGame("Ada", 4, {
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, cupid: 0 },
      fixedRoles: [...roles],
      controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot" },
      testMode: true,
    });
    expect(game.players[0]?.role).toBe("seer");
    expect(game.players.slice(1).every((player) => player.controller === "bot")).toBe(true);
    expect(game.players.find((player) => player.role === "werewolf")?.memory.suspicion.human).toBe(
      -1,
    );
    expect(view(game, "human").testMode).toBe(true);
    expect(() => createGame("Ada", 4, { fixedRoles: ["seer"] })).toThrow(/fixed role list/u);
  });
  it("rejects unauthorized sessions and accepts only the game token", () => {
    const game = gameAs();
    const token = createSession(game.id);
    saveGame(game);
    expect(authorize(game.id, token)).toBe(true);
    expect(authorize(game.id, "wrong")).toBe(false);
    expect(authorize(game.id, null)).toBe(false);
  });
  it("lets Cupid choose distinct living lovers and links their fates", () => {
    const game = gameAs("cupid", 9);
    startGame(game);
    const ids = game.players.slice(1, 3).map((p) => p.id);
    expect(() => chooseLovers(game, "human", ids[0]!, ids[0]!)).toThrow();
    chooseLovers(game, "human", ids[0]!, ids[1]!);
    expect(game.lovers).toEqual(ids);
  });
  it("records private Seer results without exposing them to others", () => {
    const game = gameAs("seer");
    startGame(game);
    const target = game.players.find((p) => p.id !== "human")!;
    submitNightAction(game, "human", { kind: "seer", targetId: target.id });
    expect(view(game, "human").me.investigations).toHaveLength(1);
    expect(view(game, target.id).feed.some((e) => e.kind === "private")).toBe(false);
    expect(view(game, "human").players.every((p) => p.revealedRole === undefined)).toBe(true);
  });
  it("uses a Witch potion once and prevents invalid or self poison", () => {
    const game = gameAs("witch");
    startGame(game);
    game.wolfVictimId = game.players.find((p) => p.role !== "werewolf")!.id;
    submitNightAction(game, "human", { kind: "witch", heal: true });
    expect(game.witchHealAvailable).toBe(false);
    expect(() => submitNightAction(game, "human", { kind: "witch", heal: true })).toThrow();
  });
  it("requires a shared wolf target and applies the night kill", () => {
    const game = gameAs("werewolf");
    startGame(game);
    const wolf = game.players.find((p) => p.role === "werewolf")!;
    const target = game.players.find((p) => p.role !== "werewolf")!;
    submitNightAction(game, wolf.id, { kind: "wolf", targetId: target.id });
    expect(() => resolveNight(game)).toThrow(/shared target/u);
    for (const p of game.players.filter((p) => p.role === "werewolf" && p.id !== wolf.id))
      p.nightAction = { kind: "wolf", targetId: target.id };
    resolveNight(game);
    expect(target.alive).toBe(false);
    expect(game.phase).toBe(target.role === "hunter" ? "hunter" : "day");
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
  it("applies both death sources on a night and ties lover fate", () => {
    const game = gameAs("werewolf");
    startGame(game);
    const wolf = game.players.find((p) => p.role === "werewolf")!;
    const target = game.players.find((p) => p.role !== "werewolf" && p.id !== "human")!;
    const lover = game.players.find((p) => p.id !== target.id && p.id !== wolf.id)!;
    target.loverId = lover.id;
    lover.loverId = target.id;
    game.lovers = [target.id, lover.id];
    for (const packmate of game.players.filter((p) => p.role === "werewolf"))
      packmate.nightAction = { kind: "wolf", targetId: target.id };
    resolveNight(game);
    expect(target.alive).toBe(false);
    expect(lover.alive).toBe(false);
  });
  it("validates day speech and votes; tie rule avoids exile", () => {
    const game = gameAs();
    startGame(game);
    game.phase = "day";
    speak(game, "human", "I noticed a contradiction.");
    beginVote(game);
    const others = game.players.filter((p) => p.alive && p.id !== "human");
    submitVote(game, "human", others[0]!.id);
    expect(() => submitVote(game, "human", others[1]!.id)).toThrow();
    for (let i = 0; i < others.length; i++)
      others[i]!.voteId = i % 2 ? others[0]!.id : others[1]!.id;
    resolveVote(game, () => 0.1);
    expect(game.phase).toBe("night");
  });
  it("rejects self votes and invalid speech", () => {
    const game = gameAs();
    startGame(game);
    game.phase = "day";
    beginVote(game);
    expect(() => submitVote(game, "human", "human")).toThrow();
    game.phase = "day";
    expect(() => speak(game, "human", " ")).toThrow();
  });
  it("gives an eliminated Hunter a shot and checks victory after it", () => {
    const game = gameAs("hunter", 6);
    startGame(game);
    game.phase = "hunter";
    game.pendingHunters = ["human"];
    game.resumeAfterHunter = "day";
    const target = game.players.find((p) => p.role === "werewolf")!;
    hunterShot(game, "human", target.id);
    expect(target.alive).toBe(false);
    expect(game.phase).toBe("over");
    expect(game.winner).toBe("village");
    expect(checkVictory(game)).toBe("village");
  });
});
