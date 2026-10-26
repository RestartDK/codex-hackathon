import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { handleLibraryVoiceSession } from "./library-voice.js";

type ProviderPayload = {
  session: {
    instructions: string;
    delegation: { responses: { tools: { name: string }[]; tool_choice: string } };
  };
};

function offerRequest(gameId: string) {
  return new Request("http://localhost:3000/api/voice/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ sdp: "v=0 offer", gameId }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("library voice sessions", () => {
  it("routes Loups-Garous speech through submit_player_command", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-only-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ transport: { type: "webrtc", sdp: "v=0 answer" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleLibraryVoiceSession(offerRequest("loups-garous"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ transport: { sdp: "v=0 answer" } });

    const body = fetchMock.mock.calls[0]![1]!.body as string;
    const payload = JSON.parse(body) as ProviderPayload;
    const toolNames = payload.session.delegation.responses.tools.map((tool) => tool.name);
    expect(toolNames).toContain("submit_player_command");
    expect(toolNames).not.toContain("navigate_app");
    expect(toolNames).not.toContain("get_preferences");
    expect(payload.session.instructions).toMatch(/submit_player_command/u);
    expect(body).toMatch(/Single-word confirmations such as \\"confirm\\"/u);
    expect(payload.session.delegation.responses.tool_choice).toBe("auto");
    expect(payload.session.instructions).toMatch(
      /Application commentary is authoritative screen guidance/u,
    );
    expect(payload.session.instructions).toMatch(/speak that supplied text verbatim and in full/u);
    expect(body).not.toContain("sk-test-only-key");
  });

  it("rejects a game id outside the library set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-only-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleLibraryVoiceSession(offerRequest("unknown"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delegates shared guidance commands to application state", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-only-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ transport: { type: "webrtc", sdp: "v=0 answer" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleLibraryVoiceSession(offerRequest("tic-tac-toe"));
    expect(response.status).toBe(200);
    const body = fetchMock.mock.calls[0]![1]!.body as string;
    const payload = JSON.parse(body) as ProviderPayload;
    const toolNames = payload.session.delegation.responses.tools.map((tool) => tool.name);
    expect(toolNames).toContain("control_voice_guidance");
    expect(payload.session.instructions).toMatch(/current game fact and game action/u);
  });

  it("preserves a sanitized upstream status instead of returning an opaque 502", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-only-key");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              message: "Your API key sk-test-only-key has been invalidated.",
              code: "invalid_api_key",
            },
          },
          { status: 401 },
        ),
      ),
    );

    const response = await handleLibraryVoiceSession(offerRequest("loups-garous"));
    const problem = (await response.json()) as {
      error: string;
      providerStatus: number;
      providerCode: string;
    };
    expect(response.status).toBe(502);
    expect(problem.providerStatus).toBe(401);
    expect(problem.providerCode).toBe("invalid_api_key");
    expect(problem.error).toContain("server credential (401)");
    expect(JSON.stringify(problem)).not.toContain("sk-test-only-key");
    expect(warning.mock.calls.flat().join(" ")).not.toContain("sk-test-only-key");
    warning.mockRestore();
  });
});
