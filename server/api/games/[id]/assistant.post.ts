import { defineHandler } from "nitro";
import { z } from "zod";
import { answerGuide } from "../../../game/assistant.js";
import { getGameModule } from "../../../game/registry.js";
import { authorize, getGameRecord } from "../../../game/store.js";
import type { Game } from "../../../game/types.js";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(1_000),
  history: z
    .array(
      z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(1_200) }),
    )
    .max(8)
    .default([]),
});

const problem = (message: string, status = 400) => Response.json({ error: message }, { status });

export default defineHandler(async (event) => {
  const id = new URL(event.req.url).pathname.split("/").at(-2)!;
  const record = getGameRecord(id);
  if (!record) return problem("Game not found.", 404);
  if (!authorize(id, event.req.headers.get("x-game-session")))
    return problem("A valid game session is required.", 401);
  if (record.gameType !== "loups-garous") return problem("This game has no guide yet.", 501);
  if (!getGameModule(record.gameType)) return problem("This game module is unavailable.", 500);
  try {
    const input = requestSchema.parse(await event.req.json());
    return Response.json(
      await answerGuide(record.state as Game, "human", input.message, input.history),
    );
  } catch (cause) {
    return problem(cause instanceof Error ? cause.message : "Could not reach the guide.");
  }
});
