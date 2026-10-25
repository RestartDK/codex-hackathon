import { defineHandler } from "nitro";
import {
  chessVoiceSettings,
  createChessVoiceTransport,
  handleChessVoiceSession,
} from "../../voice/chess-voice.js";

const transport = createChessVoiceTransport();

export default defineHandler((event) =>
  handleChessVoiceSession(event.req, chessVoiceSettings(process.env), transport),
);
