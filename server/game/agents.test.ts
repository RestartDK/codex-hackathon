import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { chooseTarget, generateSpeech } from "./agents.js";
import { createGame } from "./engine.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI Agent boundary and fallback", () => {
  it("uses a legal local fallback when no provider key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const game = createGame("Ada", 6, { controllers: { "npc-1": "agent" } });
    const actor = game.players.find((p) => p.id === "npc-1")!;
    const candidates = game.players.filter((p) => p.alive && p.id !== actor.id);
    const target = await chooseTarget(game, actor, candidates, "vote");
    expect(candidates).toContain(target);
    expect(actor.agentMode).toBe("fallback");
  });

  it("accepts a valid, legal model target without sending other roles", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const game = createGame("Ada", 6, { controllers: { "npc-1": "agent" } });
    const actor = game.players.find((p) => p.id === "npc-1")!;
    const candidates = game.players.filter((p) => p.alive && p.id !== actor.id);
    const chosen = candidates[0]!;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ target: chosen.id }) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await chooseTarget(game, actor, candidates, "vote")).toEqual(chosen);
    expect(actor.agentMode).toBe("llm");
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const sentContext = JSON.parse(request.input);
    expect(
      sentContext.candidates.every(
        (entry: object) => Object.keys(entry).sort().join(",") === "id,name",
      ),
    ).toBe(true);
  });

  it("falls back after an invented model target and provides playable dialogue", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const game = createGame("Ada", 6, { controllers: { "npc-1": "agent" } });
    const actor = game.players.find((p) => p.id === "npc-1")!;
    const candidates = game.players.filter((p) => p.alive && p.id !== actor.id);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"target":"unknown"}' } }] }),
      }),
    );
    expect(candidates).toContain(await chooseTarget(game, actor, candidates, "vote"));
    expect(actor.agentMode).toBe("fallback");
    const line = await generateSpeech(game, actor);
    expect(line.length).toBeGreaterThan(0);
    expect(line.length).toBeLessThanOrEqual(400);
  });
});
