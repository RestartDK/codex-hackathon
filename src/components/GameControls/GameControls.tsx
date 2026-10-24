import { useState, useCallback } from 'react';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';

interface GameControlsProps {
  onNewGame: () => void;
  onExportFen: () => string;
  onImportFen: (fen: string) => boolean;
  onUndo: () => void;
  onResign: () => void;
  onExportPgn: () => string;
  canUndo: boolean;
  canResign: boolean;
}

export default function GameControls({
  onNewGame,
  onExportFen,
  onImportFen,
  onUndo,
  onResign,
  onExportPgn,
  canUndo,
  canResign,
}: GameControlsProps) {
  const [fenInput, setFenInput] = useState('');
  const [fenCopied, setFenCopied] = useState(false);
  const [fenError, setFenError] = useState('');
  const [showFenInput, setShowFenInput] = useState(false);
  const [pgnCopied, setPgnCopied] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  const handleExport = useCallback(() => {
    const fen = onExportFen();
    navigator.clipboard.writeText(fen).then(() => {
      setFenCopied(true);
      setTimeout(() => setFenCopied(false), 2000);
    });
  }, [onExportFen]);

  const handleImport = useCallback(() => {
    const trimmed = fenInput.trim();
    if (!trimmed) return;
    const ok = onImportFen(trimmed);
    if (ok) {
      setFenInput('');
      setFenError('');
      setShowFenInput(false);
    } else {
      setFenError('Invalid FEN string');
    }
  }, [fenInput, onImportFen]);

  const handlePgnExport = useCallback(() => {
    const pgn = onExportPgn();
    navigator.clipboard.writeText(pgn).then(() => {
      setPgnCopied(true);
      setTimeout(() => setPgnCopied(false), 2000);
    });
    // Also download as .pgn file
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chess-game.pgn';
    a.click();
    URL.revokeObjectURL(url);
  }, [onExportPgn]);

  return (
    <div className="game-controls">
      <button className="btn" onClick={onNewGame}>
        New Game
      </button>

      <button
        className="btn btn-secondary"
        onClick={() => setShowRestartConfirm(true)}
        disabled={false}
      >
        Restart
      </button>

      <button
        className="btn btn-secondary"
        onClick={onUndo}
        disabled={!canUndo}
      >
        Undo
      </button>

      <button
        className="btn btn-danger-outline"
        onClick={() => setShowResignConfirm(true)}
        disabled={!canResign}
      >
        Resign
      </button>

      <button className="btn" onClick={handleExport}>
        {fenCopied ? 'FEN Copied!' : 'Copy FEN'}
      </button>

      <button className="btn" onClick={handlePgnExport}>
        {pgnCopied ? 'PGN Copied!' : 'Export PGN'}
      </button>

      <button className="btn" onClick={() => setShowFenInput(!showFenInput)}>
        {showFenInput ? 'Close Import' : 'Import FEN'}
      </button>

      {showFenInput && (
        <div className="fen-import-area">
          <input
            type="text"
            className="fen-input"
            placeholder="Paste FEN string..."
            value={fenInput}
            onChange={(e) => {
              setFenInput(e.target.value);
              setFenError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleImport();
            }}
          />
          <button className="btn btn-sm" onClick={handleImport}>
            Load
          </button>
          {fenError && <p className="fen-error">{fenError}</p>}
        </div>
      )}

      {showRestartConfirm && (
        <ConfirmDialog
          title="Restart Game"
          message="Are you sure you want to restart the current game?"
          confirmLabel="Restart"
          cancelLabel="Cancel"
          onConfirm={() => {
            setShowRestartConfirm(false);
            onNewGame();
          }}
          onCancel={() => setShowRestartConfirm(false)}
        />
      )}

      {showResignConfirm && (
        <ConfirmDialog
          title="Resign Game"
          message="Are you sure you want to resign?"
          confirmLabel="Resign"
          cancelLabel="Cancel"
          onConfirm={() => {
            setShowResignConfirm(false);
            onResign();
          }}
          onCancel={() => setShowResignConfirm(false)}
        />
      )}
    </div>
  );
}

