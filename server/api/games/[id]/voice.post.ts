import { defineHandler } from "nitro";
import { z } from "zod";
import { createLiveSession, LiveVoiceProviderError } from "../../../game/live-voice.js";
import { getGameModule } from "../../../game/registry.js";
import { authorize, getGameRecord } from "../../../game/store.js";
import type { Game } from "../../../game/types.js";

const requestSchema = z.object({ sdp: z.string().min(32).max(250_000) });
const problem = (message: string, status = 400) => Response.json({ error: message }, { status });

export default defineHandler(async (event) => {
  const id = new URL(event.req.url).pathname.split("/").at(-2)!;
  const record = getGameRecord(id);
  if (!record) return problem("Game not found.", 404);
  if (!authorize(id, event.req.headers.get("x-game-session")))
    return problem("A valid game session is required.", 401);
  if (record.gameType !== "loups-garous") return problem("This game has no live voice yet.", 501);
  if (!getGameModule(record.gameType)) return problem("This game module is unavailable.", 500);
  try {
    const { sdp } = requestSchema.parse(await event.req.json());
    return Response.json(await createLiveSession(record.state as Game, "human", sdp));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not start live voice.";
    return problem(
      message,
      /OPENAI_API_KEY/u.test(message) ? 503 : cause instanceof LiveVoiceProviderError ? 502 : 400,
    );
  }
});
