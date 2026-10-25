import { defineHandler } from "nitro";
import {
  chessVoiceSettings,
  createChessVoiceTransport,
  handleChessVoiceSession,
} from "../../voice/chess-voice.js";
import { handleLibraryVoiceSession } from "../../voice/library-voice.js";

const transport = createChessVoiceTransport();

export default defineHandler(async (event) => {
  let gameId: unknown;
  let mode: unknown;
  try {
    const body = (await event.req.clone().json()) as { gameId?: unknown; mode?: unknown };
    gameId = body.gameId;
    mode = body.mode;
  } catch {
    gameId = undefined;
    mode = undefined;
  }
  if (mode === "lobby")
    return handleChessVoiceSession(event.req, chessVoiceSettings(process.env), transport, "lobby");
  if (
    gameId === "loups-garous" ||
    gameId === "ludo" ||
    gameId === "intercept" ||
    gameId === "tic-tac-toe"
  )
    return handleLibraryVoiceSession(event.req);
  return handleChessVoiceSession(event.req, chessVoiceSettings(process.env), transport);
});
