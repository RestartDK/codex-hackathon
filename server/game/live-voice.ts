import { z } from "zod";
import { guideConfig, guideContext, guideInstructions } from "./assistant.js";
import type { Game, GameView } from "./types.js";

const timedFetch = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export class LiveVoiceProviderError extends Error {}

async function liveProviderError(response: Response) {
  const raw = await response.text().catch(() => "");
  let detail = "";
  try {
    const body = JSON.parse(raw) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") detail = body.error.message;
  } catch {
    // Provider error bodies are optional and may not be JSON.
  }
  const safeDetail = detail.replace(/\bsk-[\w-]+\b/gu, "[redacted]");
  const suffix = safeDetail ? `: ${safeDetail.slice(0, 300)}` : "";
  return new LiveVoiceProviderError(
    `Live voice provider rejected the session (${response.status})${suffix}`,
  );
}

/** Instructions for the one player-facing, real-time voice companion. */
export function liveInstructions(context: GameView) {
  return [
    "You are the spoken companion for one Loups-Garous player.",
    "Keep replies short and natural. Explain the current phase and rules.",
    "The app independently validates spoken game commands and narrates every official change. For a game or interface request, including role actions, public messages, reading updates, describing the screen, audio settings, or pausing, stay quiet while the app checks it and reads the authoritative result. Never invent an outcome or choose an action yourself.",
    "Never reveal or infer hidden roles. Use only this player-scoped view:",
    JSON.stringify(context),
  ].join("\n\n");
}

/**
 * Server-only WebRTC session exchange. The browser sends only an SDP offer; this
 * function keeps the provider key and player-scoped game context on the server.
 */
export async function createLiveSession(game: Game, actorId: string, sdp: string) {
  const { key, voiceModel, delegationModel, voice } = guideConfig();
  if (!key) throw new Error("Live voice needs OPENAI_API_KEY in the server environment.");
  const context = guideContext(game, actorId);
  const response = await timedFetch("https://api.openai.com/v1/live/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        model: voiceModel,
        instructions: liveInstructions(context),
        // GPT-Live negotiates microphone media through WebRTC. Unlike the
        // Realtime API, its create-session payload accepts output audio here,
        // while input transcript deltas arrive over the data channel.
        audio: { output: { voice } },
        delegation: {
          type: "responses",
          responses: {
            model: delegationModel,
            reasoning: { effort: "low" },
            instructions: guideInstructions(context),
          },
        },
      },
      transport: { type: "webrtc", sdp },
    }),
  });
  if (!response.ok) throw await liveProviderError(response);
  const payload = z
    .object({
      session: z.object({ id: z.string() }),
      transport: z.object({ type: z.literal("webrtc"), sdp: z.string().min(1) }),
    })
    .parse(await response.json());
  return { sessionId: payload.session.id, sdp: payload.transport.sdp };
}
