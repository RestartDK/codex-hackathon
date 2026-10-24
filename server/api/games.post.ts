import { defineHandler } from "nitro";
import { z } from "zod";
import { getGameModule } from "../game/registry.js";
import { createSession, saveGameRecord } from "../game/store.js";

const requestSchema = z.object({ gameType: z.string().trim().min(1).default("loups-garous") });

export default defineHandler(async (event) => {
  try {
    const rawInput: unknown = await event.req.json();
    const { gameType } = requestSchema.parse(rawInput);
    const module = getGameModule(gameType);
    if (!module)
      return Response.json({ error: `Unknown game type "${gameType}".` }, { status: 404 });
    const input = module.parseCreate(rawInput);
    const state = await module.create(input);
    const id = module.idOf(state);
    saveGameRecord({ id, gameType: module.id, state });
    return {
      ...(module.view(state, module.actorId(state)) as Record<string, unknown>),
      session: createSession(id),
    };
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Invalid game setup." },
      { status: 400 },
    );
  }
});
