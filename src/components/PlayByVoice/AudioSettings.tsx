import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import type { Preferences } from "../../hooks/useSettings";
import { DIFFICULTIES, DIFFICULTY_OPTIONS } from "../../chess/difficulty";
import type { GameMode } from "../../types";
import type { Color } from "chess.js";

interface AudioSettingsProps {
  preferences: Preferences;
  onBack: () => void;
  onColorChange: (color: Color) => void;
  onModeChange: (mode: GameMode) => void;
}

export default function AudioSettings({
  preferences,
  onBack,
  onColorChange,
  onModeChange,
}: AudioSettingsProps) {
  const { settings } = preferences;
  return (
    <section className="settings-page" aria-labelledby="page-heading">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> Go back
      </button>
      <h1 id="page-heading" tabIndex={-1}>
        Settings
      </h1>
      <p className="page-intro">Make your companion sound right for you.</p>
      <div className="settings-fields">
        <div className="volume-field">
          <div>
            <label htmlFor="narrator-volume">Narrator volume</label>
            <output htmlFor="narrator-volume">{settings.voiceVolume}%</output>
          </div>
          <div className="volume-input">
            <VolumeX size={18} aria-hidden="true" />
            <input
              id="narrator-volume"
              type="range"
              min={0}
              max={100}
              value={settings.voiceVolume}
              onChange={(event) => preferences.setVoiceVolume(Number(event.target.value))}
              aria-valuetext={`${settings.voiceVolume} percent`}
            />
            <Volume2 size={20} aria-hidden="true" />
          </div>
          <p>Controls live voice and the spoken quick guide.</p>
        </div>
        <label className="toggle-field">
          <span>
            <strong>Game sounds</strong>
            <span>Hear moves, captures, and check.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.soundEnabled}
            onChange={(event) => preferences.setSoundEnabled(event.target.checked)}
          />
        </label>
        <label className="toggle-field">
          <span>
            <strong>Screen-reader mode</strong>
            <span>
              Announce text updates. Mute the companion audio to avoid overlapping voices.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.screenReaderMode}
            onChange={(event) => preferences.setScreenReaderMode(event.target.checked)}
          />
        </label>
      </div>
      <details className="chess-preferences">
        <summary>Chess preferences</summary>
        <div className="preferences-grid">
          <label>
            Play as
            <select
              value={settings.playerColor}
              onChange={(event) => {
                if (event.target.value === "w" || event.target.value === "b")
                  onColorChange(event.target.value);
              }}
            >
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </label>
          <label>
            Opponent
            <select
              value={settings.gameMode}
              onChange={(event) => {
                if (event.target.value === "computer" || event.target.value === "local")
                  onModeChange(event.target.value);
              }}
            >
              <option value="computer">Computer</option>
              <option value="local">Local two-player</option>
            </select>
          </label>
          <label>
            Difficulty
            <select
              value={settings.difficulty}
              onChange={(event) => {
                const option = DIFFICULTY_OPTIONS.find((item) => item.value === event.target.value);
                if (option) preferences.setDifficulty(option.value);
              }}
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {!DIFFICULTY_OPTIONS.some((option) => option.value === settings.difficulty) && (
                <option value={settings.difficulty}>
                  {DIFFICULTIES[settings.difficulty].label}
                </option>
              )}
            </select>
          </label>
          <label>
            Board orientation
            <select
              value={settings.boardOrientation}
              onChange={(event) => {
                if (event.target.value === "white-bottom" || event.target.value === "flip-turn")
                  preferences.setBoardOrientation(event.target.value);
              }}
            >
              <option value="white-bottom">White at bottom</option>
              <option value="flip-turn">Follow the turn</option>
            </select>
          </label>
          <label>
            Board colors
            <select
              value={settings.boardTheme}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "classic" ||
                  value === "marine" ||
                  value === "ember" ||
                  value === "forest" ||
                  value === "midnight"
                )
                  preferences.setBoardTheme(value);
              }}
            >
              <option value="classic">Original green</option>
              <option value="marine">Marine</option>
              <option value="ember">Ember</option>
              <option value="forest">Forest</option>
              <option value="midnight">Midnight</option>
            </select>
          </label>
          <label>
            Chess pieces
            <select
              value={settings.pieceSet}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "merida" ||
                  value === "unicode" ||
                  value === "symbols" ||
                  value === "outlined"
                )
                  preferences.setPieceSet(value);
              }}
            >
              <option value="merida">Original artwork</option>
              <option value="unicode">Classic symbols</option>
              <option value="symbols">Gold symbols</option>
              <option value="outlined">Outlined symbols</option>
            </select>
          </label>
        </div>
        <p>Changing your side or opponent starts a new chess game immediately.</p>
      </details>
    </section>
  );
}
