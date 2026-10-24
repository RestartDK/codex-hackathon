import type { Square as ChessSquare } from 'chess.js';
import type { Difficulty } from './chess/difficulty';

export type { ChessSquare };

export interface PromotionChoice {
  from: ChessSquare;
  to: ChessSquare;
}

export interface GameState {
  fen: string;
  history: string[];
  turn: 'w' | 'b';
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  isGameOver: boolean;
}

/** Game mode: vs computer or local two-player */
export type GameMode = 'computer' | 'local';

/** Board orientation setting */
export type BoardOrientation = 'white-bottom' | 'flip-turn';

/** Board theme */
export type BoardTheme = 'classic' | 'marine' | 'ember' | 'forest' | 'midnight';

/** Piece set */
export type PieceSet = 'unicode' | 'symbols' | 'outlined' | 'merida';

/** Stockfish WASM loading state */
export type StockfishStatus = 'unloaded' | 'loading' | 'ready' | 'error';

/** Move quality feedback tags */
export type MoveFeedbackTag =
  | 'book'
  | 'perfect'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface MoveFeedback {
  /** The move index in history (0-based) */
  moveIndex: number;
  /** Quality tag */
  tag: MoveFeedbackTag;
  /** Centipawn loss from this move */
  centipawnLoss: number;
  /** Stockfish evaluation before the move (from the mover's perspective) */
  evalBefore: number;
  /** Stockfish evaluation after the move (from the mover's perspective) */
  evalAfter: number;
  /** Whether this move is from the opening book */
  isBook: boolean;
}

/** All user preferences */
export interface AppSettings {
  gameMode: GameMode;
  playerColor: 'w' | 'b';
  difficulty: Difficulty;
  boardOrientation: BoardOrientation;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  soundEnabled: boolean;
  confirmMoves: boolean;
  screenReaderMode: boolean;
  voiceVolume: number;
}

