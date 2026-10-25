import { z } from "zod";
import { appSettingsSchema, preferenceNames, type AppSettings } from "./preferences";

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
  screenReaderMode: false,
  voiceVolume: 80,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data: unknown = JSON.parse(raw);
    const stored = z.record(z.string(), z.unknown()).safeParse(data);
    const settings = { ...DEFAULT_SETTINGS };
    if (!stored.success) return settings;
    for (const name of preferenceNames) {
      if (!Object.hasOwn(stored.data, name)) continue;
      const value = stored.data[name];
      const normalized =
        name === "voiceVolume" && typeof value === "number" && Number.isFinite(value)
          ? Math.min(100, Math.max(0, value))
          : value;
      const parsed = appSettingsSchema.partial().safeParse({ [name]: normalized });
      if (parsed.success) Object.assign(settings, parsed.data);
    }
    return settings;
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
