import { defineHandler } from "nitro";
import { getGameModule } from "../../game/registry.js";
import { authorize, getGameRecord } from "../../game/store.js";

export default defineHandler((event) => {
  const id = new URL(event.req.url).pathname.split("/").at(-1)!;
  const record = getGameRecord(id);
  if (!record) return Response.json({ error: "Game not found." }, { status: 404 });
  if (!authorize(id, event.req.headers.get("x-game-session")))
    return Response.json({ error: "A valid game session is required." }, { status: 401 });
  const module = getGameModule(record.gameType);
  if (!module) return Response.json({ error: "This game module is unavailable." }, { status: 500 });
  return module.view(record.state, module.actorId(record.state));
});
