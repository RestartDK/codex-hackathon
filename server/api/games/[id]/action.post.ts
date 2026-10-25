import { defineHandler } from "nitro";
import { z } from "zod";
import { getGameModule } from "../../../game/registry.js";
import {
  acquireGameLock,
  authorize,
  getGameRecord,
  getReceipt,
  saveGameRecord,
  saveReceipt,
} from "../../../game/store.js";

const problem = (message: string, status = 400) => Response.json({ error: message }, { status });

export default defineHandler(async (event) => {
  const id = new URL(event.req.url).pathname.split("/").at(-2)!;
  const record = getGameRecord(id);
  if (!record) return problem("Game not found.", 404);
  if (!authorize(id, event.req.headers.get("x-game-session")))
    return problem("A valid game session is required.", 401);

  const requestId = event.req.headers.get("x-request-id");
  if (!requestId || !z.string().uuid().safeParse(requestId).success)
    return problem("A valid X-Request-Id is required.");
  const receipt = getReceipt(id, requestId);
  if (receipt) return receipt;

  const module = getGameModule(record.gameType);
  if (!module) return problem("This game module is unavailable.", 500);
  const release = acquireGameLock(id);
  if (!release) return problem("A game action is already being resolved. Try again shortly.", 409);

  try {
    const input: unknown = await event.req.json();
    // Work on a private copy. Invalid or failed actions never leak partial state into the store.
    const draft = structuredClone(record.state);
    const commandInput = z.object({ command: z.string().trim().min(1).max(1000) }).safeParse(input);
    const actorId = module.actorId(draft);
    const undoInput = z.object({ type: z.literal("undo") }).safeParse(input);
    if (undoInput.success) {
      if (!module.capabilities.undo || !module.undoAction)
        throw new Error("Undo is not available in this game.");
      await module.undoAction(draft, actorId);
    } else {
      const action = commandInput.success
        ? module.parseCommand
          ? await module.parseCommand(commandInput.data.command, draft, actorId)
          : (() => {
              throw new Error("This game does not accept voice or typed commands yet.");
            })()
        : module.parseAction(input);
      await module.applyAction(draft, actorId, action);
    }
    const result = module.view(draft, module.actorId(draft));
    saveGameRecord({ ...record, state: draft });
    saveReceipt(id, requestId, result);
    return result;
  } catch (cause) {
    return problem(
      cause instanceof z.ZodError
        ? (cause.issues[0]?.message ?? "Invalid action.")
        : cause instanceof Error
          ? cause.message
          : "Action failed.",
    );
  } finally {
    release();
  }
});
