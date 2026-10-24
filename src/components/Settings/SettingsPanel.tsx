import type { AppSettings, GameMode, BoardOrientation, BoardTheme, PieceSet } from '../../types';
import type { Difficulty } from '../../chess/difficulty';
import ModeSelector from './ModeSelector';
import DifficultySelector from './DifficultySelector';
import { useDialogFocus } from '../../hooks/useDialogFocus';

const BOARD_THEME_OPTIONS: { value: BoardTheme; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'marine', label: 'Marine' },
  { value: 'ember', label: 'Ember' },
  { value: 'forest', label: 'Forest' },
  { value: 'midnight', label: 'Midnight' },
];

const PIECE_SET_OPTIONS: { value: PieceSet; label: string }[] = [
  { value: 'merida', label: 'Merida' },
  { value: 'unicode', label: 'Unicode' },
  { value: 'symbols', label: 'Symbols' },
  { value: 'outlined', label: 'Outlined' },
];

interface SettingsPanelProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onGameModeChange: (mode: GameMode) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onBoardOrientationChange: (orientation: BoardOrientation) => void;
  onBoardThemeChange: (theme: BoardTheme) => void;
  onPieceSetChange: (pieceSet: PieceSet) => void;
  onSoundEnabledChange: (enabled: boolean) => void;
}

export default function SettingsPanel({
  settings,
  isOpen,
  onClose,
  onGameModeChange,
  onDifficultyChange,
  onBoardOrientationChange,
  onBoardThemeChange,
  onPieceSetChange,
  onSoundEnabledChange,
}: SettingsPanelProps) {
  const { dialogRef, onKeyDown } = useDialogFocus(onClose, isOpen);
  if (!isOpen) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="settings-panel"
        role="dialog"
        aria-label="Game settings"
        aria-modal="true"
        onKeyDown={onKeyDown}
      >
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        <div className="settings-body">
          <ModeSelector value={settings.gameMode} onChange={onGameModeChange} />

          <DifficultySelector
            value={settings.difficulty}
            onChange={onDifficultyChange}
            visible={settings.gameMode === 'computer'}
          />

          <div className="settings-field">
            <label htmlFor="board-orientation" className="settings-label">
              Board Orientation
            </label>
            <select
              id="board-orientation"
              className="settings-select"
              value={settings.boardOrientation}
              onChange={(e) => onBoardOrientationChange(e.target.value as BoardOrientation)}
              aria-label="Select board orientation"
            >
              <option value="white-bottom">White always at bottom</option>
              <option value="flip-turn">Flip to match current turn</option>
            </select>
          </div>

          <div className="settings-field">
            <label htmlFor="board-theme" className="settings-label">
              Board Theme
            </label>
            <select
              id="board-theme"
              className="settings-select"
              value={settings.boardTheme}
              onChange={(e) => onBoardThemeChange(e.target.value as BoardTheme)}
              aria-label="Select board theme"
            >
              {BOARD_THEME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-field">
            <label htmlFor="piece-set" className="settings-label">
              Piece Set
            </label>
            <select
              id="piece-set"
              className="settings-select"
              value={settings.pieceSet}
              onChange={(e) => onPieceSetChange(e.target.value as PieceSet)}
              aria-label="Select piece set"
            >
              {PIECE_SET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-field">
            <label className="settings-label">Sound Effects</label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => onSoundEnabledChange(e.target.checked)}
              />
              <span className="settings-toggle-label">
                {settings.soundEnabled ? 'On' : 'Off'}
              </span>
            </label>
          </div>
        </div>
      </div>
    </>
  );
}

