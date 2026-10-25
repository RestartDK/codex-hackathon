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
  try {
    gameId = ((await event.req.clone().json()) as { gameId?: unknown }).gameId;
  } catch {
    gameId = undefined;
  }
  if (
    gameId === "loups-garous" ||
    gameId === "ludo" ||
    gameId === "intercept" ||
    gameId === "tic-tac-toe"
  )
    return handleLibraryVoiceSession(event.req);
  return handleChessVoiceSession(event.req, chessVoiceSettings(process.env), transport);
});

