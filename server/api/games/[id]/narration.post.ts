import { defineHandler } from "nitro";
import { z } from "zod";
import { authorize, getGameRecord } from "../../../game/store.js";

const requestSchema = z.object({ text: z.string().trim().min(1).max(2_000) });
const problem = (message: string, status = 400) => Response.json({ error: message }, { status });

export default defineHandler(async (event) => {
  const id = new URL(event.req.url).pathname.split("/").at(-2)!;
  const record = getGameRecord(id);
  if (!record) return problem("Game not found.", 404);
  if (!authorize(id, event.req.headers.get("x-game-session")))
    return problem("A valid game session is required.", 401);

  try {
    const { text } = requestSchema.parse(await event.req.json());
    const key = process.env.OPENAI_API_KEY;
    if (!key) return problem("OpenAI narration is not configured.", 503);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
          voice: process.env.OPENAI_TTS_VOICE || "marin",
          input: text,
          instructions:
            "Speak as a warm, calm game guide. Use smooth, conversational pacing with short natural pauses. Do not rush.",
          response_format: "mp3",
        }),
        signal: controller.signal,
      });
      if (!response.ok) return problem("OpenAI narration could not be generated.", 502);
      return new Response(await response.arrayBuffer(), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": response.headers.get("content-type") || "audio/mpeg",
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (cause) {
    return problem(cause instanceof Error ? cause.message : "Invalid narration request.");
  }
});
