import type { AppSettings } from "../types";

const GAME_STORAGE_KEY = "chess-by-sparsh-save";
const SETTINGS_STORAGE_KEY = "chess-by-sparsh-settings";

interface SavedGame {
  version: number;
  fen: string;
  history: string[];
  result: { winner: "w" | "b" | null; reason: "checkmate" | "resign" | "draw" } | null;
  timestamp: number;
}

export function saveGame(fen: string, history: string[], result: SavedGame["result"] = null): void {
  try {
    const data: SavedGame = { version: 3, fen, history, result, timestamp: Date.now() };
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable or full
  }
}

export function loadGame(): Pick<SavedGame, "fen" | "history" | "result"> | null {
  try {
    const raw = localStorage.getItem(GAME_STORAGE_KEY);
    if (!raw) return null;
    const data: SavedGame = JSON.parse(raw);
    const validHistory =
      Array.isArray(data.history) && data.history.every((move) => typeof move === "string");
    const validResult =
      data.result == null ||
      (["checkmate", "resign", "draw"].includes(data.result.reason) &&
        (data.result.winner === "w" || data.result.winner === "b" || data.result.winner === null));
    if (typeof data.fen === "string" && validHistory && validResult) {
      return { fen: data.fen, history: data.history, result: data.result ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(GAME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  gameMode: "computer",
  playerColor: "w",
  difficulty: "beginner",
  boardOrientation: "white-bottom",
  boardTheme: "classic",
  pieceSet: "merida",
  soundEnabled: true,
  confirmMoves: true,
  screenReaderMode: false,
  voiceVolume: 80,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const difficulties = ["beginner", "casual", "club", "expert", "nightmare"];
    const orientations = ["white-bottom", "flip-turn"];
    const themes = ["classic", "marine", "ember", "forest", "midnight"];
    const pieceSets = ["merida", "unicode", "symbols", "outlined"];
    return {
      gameMode: parsed.gameMode === "local" ? "local" : "computer",
      playerColor: parsed.playerColor === "b" ? "b" : "w",
      difficulty: difficulties.includes(parsed.difficulty)
        ? parsed.difficulty
        : DEFAULT_SETTINGS.difficulty,
      boardOrientation: orientations.includes(parsed.boardOrientation)
        ? parsed.boardOrientation
        : DEFAULT_SETTINGS.boardOrientation,
      boardTheme: themes.includes(parsed.boardTheme)
        ? parsed.boardTheme
        : DEFAULT_SETTINGS.boardTheme,
      pieceSet: pieceSets.includes(parsed.pieceSet) ? parsed.pieceSet : DEFAULT_SETTINGS.pieceSet,
      soundEnabled:
        typeof parsed.soundEnabled === "boolean"
          ? parsed.soundEnabled
          : DEFAULT_SETTINGS.soundEnabled,
      confirmMoves:
        typeof parsed.confirmMoves === "boolean"
          ? parsed.confirmMoves
          : DEFAULT_SETTINGS.confirmMoves,
      screenReaderMode:
        typeof parsed.screenReaderMode === "boolean"
          ? parsed.screenReaderMode
          : DEFAULT_SETTINGS.screenReaderMode,
      voiceVolume:
        typeof parsed.voiceVolume === "number" && Number.isFinite(parsed.voiceVolume)
          ? Math.min(100, Math.max(0, parsed.voiceVolume))
          : DEFAULT_SETTINGS.voiceVolume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export { DEFAULT_SETTINGS };
