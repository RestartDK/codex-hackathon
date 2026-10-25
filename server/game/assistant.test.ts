import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { answerGuide, guideContext } from "./assistant.js";
import { createGame, startGame } from "./engine.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("player guide boundary", () => {
  it("has a useful local guide without a provider key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 4, {
      fixedRoles: ["seer", "werewolf", "villager", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, cupid: 0 },
    });
    startGame(game);
    const answer = await answerGuide(game, "human", "What is my role?");
    expect(answer.mode).toBe("local");
    expect(answer.reply).toMatch(/Seer/u);
  });

  it("sends only a player-scoped view to the guide model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_DELEGATION_MODEL", "gpt-6-luna");
    const game = createGame("Ada", 4, {
      fixedRoles: ["villager", "werewolf", "seer", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, cupid: 0 },
    });
    startGame(game);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "Ask who changed their story first." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const answer = await answerGuide(game, "human", "Who should I suspect?");
    expect(answer).toEqual({ reply: "Ask who changed their story first.", mode: "model" });
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(request.model).toBe("gpt-6-luna");
    expect(request.instructions).not.toContain('"role":"werewolf"');
    expect(request.instructions).not.toContain('"role":"seer"');
    expect(request.instructions).toContain('"role":"villager"');
  });

  it("exposes no unrevealed roles in the player-scoped context", () => {
    const game = createGame("Ada", 4, {
      fixedRoles: ["villager", "werewolf", "seer", "villager"],
      roleCounts: { werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, cupid: 0 },
    });
    startGame(game);
    const context = JSON.stringify(guideContext(game, "human"));
    expect(context).not.toContain("werewolf");
    expect(context).not.toContain("seer");
  });
});
