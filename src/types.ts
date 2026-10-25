import type { Square as ChessSquare } from "chess.js";
import type { Difficulty } from "./chess/difficulty";

export type { ChessSquare };

export interface PromotionChoice {
  from: ChessSquare;
  to: ChessSquare;
}

export interface GameState {
  fen: string;
  history: string[];
  turn: "w" | "b";
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  isGameOver: boolean;
}

export type GameMode = "computer" | "local";

export type BoardOrientation = "white-bottom" | "flip-turn";

export type BoardTheme = "classic" | "marine" | "ember" | "forest" | "midnight";

export type PieceSet = "unicode" | "symbols" | "outlined" | "merida";

export type StockfishStatus = "unloaded" | "loading" | "ready" | "error";

export type MoveFeedbackTag =
  | "book"
  | "perfect"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface MoveFeedback {
  moveIndex: number;
  tag: MoveFeedbackTag;
  centipawnLoss: number;
  evalBefore: number;
  evalAfter: number;
  isBook: boolean;
}

export interface AppSettings {
  gameMode: GameMode;
  playerColor: "w" | "b";
  difficulty: Difficulty;
  boardOrientation: BoardOrientation;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  soundEnabled: boolean;
  confirmMoves: boolean;
  screenReaderMode: boolean;
  voiceVolume: number;
}
