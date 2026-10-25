import { describe, expect, it } from "vite-plus/test";
import {
  chessVoiceSettings,
  createChessVoiceTransport,
  handleChessVoiceSession,
  type ChessVoiceSettings,
} from "./chess-voice.js";

const settings: ChessVoiceSettings = {
  apiKey: "sk-test-only-key",
  voiceModel: "gpt-live-1",
  delegationModel: "gpt-6-luna",
  voice: "marin",
  allowedOrigins: ["http://localhost:5173"],
};

function offerRequest(origin = "http://localhost:5173", body: unknown = { sdp: "v=0 offer" }) {
  return new Request("http://localhost:3000/api/voice/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function recordingTransport(response: () => Promise<Response>) {
  const transport = createChessVoiceTransport();
  const requests: { url: string; body: string; headers: Headers }[] = [];
  return {
    requests,
    transport: {
      ...transport,
      fetch: async (url: string, init: RequestInit) => {
        requests.push({
          url,
          body: typeof init.body === "string" ? init.body : "",
          headers: new Headers(init.headers),
        });
        return response();
      },
    },
  };
}

const acceptedSession = async () =>
  Response.json({ transport: { type: "webrtc", sdp: "v=0 answer" } });

type ProviderTool = {
  name: string;
  parameters: { properties: { destination?: { enum: string[] } } };
};

type ProviderPayload = {
  transport: { type: string; sdp: string };
  session: {
    model: string;
    audio: { output: { voice: string } };
    instructions: string;
    delegation: {
      responses: {
        model: string;
        reasoning: { effort: string };
        tools: ProviderTool[];
        tool_choice: string;
        instructions: string;
      };
    };
  };
};

describe("chess voice session endpoint", () => {
  it("refuses an origin outside the allowlist without contacting the provider", async () => {
    const recorder = recordingTransport(acceptedSession);
    const response = await handleChessVoiceSession(
      offerRequest("http://evil.example"),
      settings,
      recorder.transport,
    );
    expect(response.status).toBe(403);
    expect(recorder.requests).toHaveLength(0);
  });

  it("creates one WebRTC session with the current provider payload conventions", async () => {
    const recorder = recordingTransport(acceptedSession);
    const response = await handleChessVoiceSession(offerRequest(), settings, recorder.transport);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ transport: { sdp: "v=0 answer" } });

    const request = recorder.requests[0];
    expect(request.url).toBe("https://api.openai.com/v1/live/sessions");
    expect(request.headers.get("authorization")).toBe(`Bearer ${settings.apiKey}`);
    const payload: ProviderPayload = JSON.parse(request.body);
    expect(payload.transport).toEqual({ type: "webrtc", sdp: "v=0 offer" });
    expect(payload.session.model).toBe("gpt-live-1");
    expect(payload.session.audio).toEqual({ output: { voice: "marin" } });
    expect(payload.session.delegation.responses.model).toBe("gpt-6-luna");
    expect(payload.session.delegation.responses.reasoning).toEqual({ effort: "low" });
    const navigation = payload.session.delegation.responses.tools.find(
      (tool) => tool.name === "navigate_app",
    );
    expect(navigation?.parameters.properties.destination?.enum).toEqual([
      "home",
      "audio",
      "help",
      "chess",
      "loups-garous",
      "ludo",
      "intercept",
      "tic-tac-toe",
    ]);
    const names = payload.session.delegation.responses.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "navigate_app",
        "chess_setup",
        "app_control",
        "voice_control",
        "game_control",
      ]),
    );
    expect(request.body).not.toContain("sk-test-only-key");
  });

  it("creates a public lobby session with no game tools or game context", async () => {
    const recorder = recordingTransport(acceptedSession);
    expect(
      (
        await handleChessVoiceSession(
          offerRequest("http://evil.example"),
          settings,
          recorder.transport,
          "lobby",
        )
      ).status,
    ).toBe(403);
    const response = await handleChessVoiceSession(
      offerRequest(),
      settings,
      recorder.transport,
      "lobby",
    );
    expect(response.status).toBe(200);
    const payload: ProviderPayload = JSON.parse(recorder.requests[0]!.body);
    expect(payload.session.delegation.responses.tools).toEqual([]);
    expect(payload.session.delegation.responses.tool_choice).toBe("none");
    expect(payload.session.instructions).toContain("transcription only");
    expect(payload.session.instructions).not.toContain("saved chess game");
    expect(payload.session.delegation.responses.instructions).not.toContain("navigate_app");
    expect(recorder.requests[0]!.body).not.toContain("sk-test-only-key");
  });

  it("reports a provider rejection without echoing the provider key", async () => {
    const recorder = recordingTransport(async () =>
      Response.json(
        { error: { message: "Incorrect API key provided: sk-test-only-key" } },
        { status: 401 },
      ),
    );
    const response = await handleChessVoiceSession(offerRequest(), settings, recorder.transport);
    const body = await response.text();
    expect(response.status).toBe(502);
    expect(body).toContain("rejected");
    expect(body).toContain("[redacted]");
    expect(body).not.toContain("sk-test-only-key");
  });

  it("reports an unreachable provider with a stable error code", async () => {
    const recorder = recordingTransport(async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ENOTFOUND" },
      });
    });
    const response = await handleChessVoiceSession(offerRequest(), settings, recorder.transport);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The voice provider could not be reached (ENOTFOUND).",
    });
  });

  it("rejects a body without an SDP offer and a server without a key", async () => {
    const recorder = recordingTransport(acceptedSession);
    const invalid = await handleChessVoiceSession(
      offerRequest("http://localhost:5173", {}),
      settings,
      recorder.transport,
    );
    expect(invalid.status).toBe(400);
    const unavailable = await handleChessVoiceSession(
      offerRequest(),
      { ...settings, apiKey: undefined },
      recorder.transport,
    );
    expect(unavailable.status).toBe(503);
    expect(recorder.requests).toHaveLength(0);
  });

  it("limits each client to five voice sessions a minute", async () => {
    const recorder = recordingTransport(acceptedSession);
    const clock = { now: 1_000 };
    const transport = { ...recorder.transport, now: () => clock.now };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const allowed = await handleChessVoiceSession(offerRequest(), settings, transport);
      expect(allowed.status).toBe(200);
      clock.now += 1_000;
    }
    const limited = await handleChessVoiceSession(offerRequest(), settings, transport);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    clock.now += 60_000;
    const recovered = await handleChessVoiceSession(offerRequest(), settings, transport);
    expect(recovered.status).toBe(200);
  });

  it("bounds retained clients even when forwarded addresses keep changing", async () => {
    const recorder = recordingTransport(acceptedSession);
    for (let client = 0; client < 1_000; client += 1)
      recorder.transport.attempts.set(`client-${client}`, [Date.now()]);
    const response = await handleChessVoiceSession(offerRequest(), settings, recorder.transport);
    expect(response.status).toBe(200);
    expect(recorder.transport.attempts.size).toBe(1_000);
    expect(recorder.transport.attempts.has("client-0")).toBe(false);
    expect(recorder.transport.attempts.has("local")).toBe(true);
  });

  it("does not retain extra timestamps for rejected attempts", async () => {
    const recorder = recordingTransport(acceptedSession);
    recorder.transport.attempts.set(
      "local",
      Array.from({ length: 5 }, () => Date.now()),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await handleChessVoiceSession(offerRequest(), settings, recorder.transport);
      expect(response.status).toBe(429);
    }
    expect(recorder.transport.attempts.get("local")).toHaveLength(5);
    expect(recorder.requests).toHaveLength(0);
  });

  it("defaults provider settings from the environment without exposing the key", () => {
    const defaults = chessVoiceSettings({ OPENAI_API_KEY: "sk-test-only-key" });
    expect(defaults.voiceModel).toBe("gpt-live-1");
    expect(defaults.delegationModel).toBe("gpt-6-luna");
    expect(defaults.voice).toBe("marin");
    expect(defaults.allowedOrigins).toContain("http://localhost:5173");
  });
});
