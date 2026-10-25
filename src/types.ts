import type { Square as ChessSquare } from "chess.js";
import type { AppSettings } from "./lib/preferences";
export type { AppSettings } from "./lib/preferences";

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

export type GameMode = AppSettings["gameMode"];

export type BoardOrientation = AppSettings["boardOrientation"];

export type BoardTheme = AppSettings["boardTheme"];

export type PieceSet = AppSettings["pieceSet"];

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
