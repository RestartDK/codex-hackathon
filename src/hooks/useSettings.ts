import { useState, useCallback, useEffect } from "react";
import type { AppSettings, GameMode, BoardOrientation, BoardTheme, PieceSet } from "../types";
import type { Difficulty } from "../chess/difficulty";
import { loadSettings, saveSettings } from "../lib/storage";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setGameMode = useCallback((gameMode: GameMode) => {
    setSettings((prev: AppSettings) => ({ ...prev, gameMode }));
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    setSettings((prev: AppSettings) => ({ ...prev, difficulty }));
  }, []);

  const setPlayerColor = useCallback((playerColor: "w" | "b") => {
    setSettings((prev: AppSettings) => ({ ...prev, playerColor }));
  }, []);

  const setConfirmMoves = useCallback((confirmMoves: boolean) => {
    setSettings((prev: AppSettings) => ({ ...prev, confirmMoves }));
  }, []);

  const setScreenReaderMode = useCallback((screenReaderMode: boolean) => {
    setSettings((prev: AppSettings) => ({ ...prev, screenReaderMode }));
  }, []);

  const setVoiceVolume = useCallback((voiceVolume: number) => {
    setSettings((prev) => ({ ...prev, voiceVolume }));
  }, []);

  const setBoardOrientation = useCallback((boardOrientation: BoardOrientation) => {
    setSettings((prev: AppSettings) => ({ ...prev, boardOrientation }));
  }, []);

  const setBoardTheme = useCallback((boardTheme: BoardTheme) => {
    setSettings((prev: AppSettings) => ({ ...prev, boardTheme }));
  }, []);

  const setPieceSet = useCallback((pieceSet: PieceSet) => {
    setSettings((prev: AppSettings) => ({ ...prev, pieceSet }));
  }, []);

  const setSoundEnabled = useCallback((soundEnabled: boolean) => {
    setSettings((prev: AppSettings) => ({ ...prev, soundEnabled }));
  }, []);

  return {
    settings,
    setGameMode,
    setDifficulty,
    setPlayerColor,
    setConfirmMoves,
    setScreenReaderMode,
    setVoiceVolume,
    setBoardOrientation,
    setBoardTheme,
    setPieceSet,
    setSoundEnabled,
  };
}

export type Preferences = ReturnType<typeof useSettings>;
