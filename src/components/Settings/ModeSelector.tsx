import type { GameMode } from '../../types';

interface ModeSelectorProps {
  value: GameMode;
  onChange: (mode: GameMode) => void;
}

export default function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="settings-field">
      <label htmlFor="game-mode" className="settings-label">Game Mode</label>
      <select
        id="game-mode"
        className="settings-select"
        value={value}
        onChange={(e) => onChange(e.target.value as GameMode)}
        aria-label="Select game mode"
      >
        <option value="computer">User vs Computer</option>
        <option value="local">Local Two Player</option>
      </select>
    </div>
  );
}

