import { useState } from 'react';
import MoveHistory from '../Game/MoveHistory';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';
import type { StockfishStatus, MoveFeedback } from '../../types';
import type { Difficulty } from '../../chess/difficulty';
import { DIFFICULTIES } from '../../chess/difficulty';
import { detectOpening } from '../../chess/openingDetection';
import './GamePanel.css';

interface GamePanelProps {
  /* Status */
  status: string;
  gameMode: 'computer' | 'local';
  difficulty?: Difficulty;
  isComputerThinking: boolean;
  stockfishStatus?: StockfishStatus;
  stockfishError?: string | null;
  stockfishProgress?: { depth: number; score: number } | null;
  onRetryEngine: () => void;

  /* Move History */
  history: string[];
  reviewMode: boolean;
  reviewIndex: number;
  moveFeedback: Map<number, MoveFeedback>;
  onGoToMove: (index: number) => void;
  onEnterReview: () => void;
  onExitReview: () => void;

  /* Game Actions */
  onNewGame: () => void;
  onUndo: () => void;
  onResign: () => void;
  canUndo: boolean;
  canResign: boolean;
  isPaused: boolean;
  canPause: boolean;
  onPause: () => void;
  onResume: () => void;

  /* Flip Board */
  onFlipBoard: () => void;
}

export default function GamePanel({
  status,
  gameMode,
  difficulty,
  isComputerThinking,
  stockfishStatus,
  stockfishError,
  stockfishProgress,
  onRetryEngine,
  history,
  reviewMode,
  reviewIndex,
  moveFeedback,
  onGoToMove,
  onEnterReview,
  onExitReview,
  onNewGame,
  onUndo,
  onResign,
  canUndo,
  canResign,
  isPaused,
  canPause,
  onPause,
  onResume,
  onFlipBoard,
}: GamePanelProps) {
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  // ── Status helper ──────────────────────────────────────────────
  const modeLabel = gameMode === 'computer'
    ? (difficulty ? DIFFICULTIES[difficulty].label : 'Computer')
    : 'Local 2P';

  /** Generate human-friendly analysis feedback text */
  const getFeedbackMessage = (tag: string, centipawnLoss: number): string => {
    switch (tag) {
      case 'book':
        return 'Book Opening — Following established theory.';
      case 'perfect':
        return 'Perfect Move — Best move in the position.';
      case 'excellent':
        return 'Excellent — A strong move.';
      case 'good':
        return 'Good — Maintained your advantage.';
      case 'inaccuracy':
        if (centipawnLoss >= 150) {
          return 'Inaccuracy — Gave up some advantage.';
        }
        return 'Inaccuracy — Could have been better.';
      case 'mistake':
        return 'Mistake — You lost your advantage.';
      case 'blunder':
        if (centipawnLoss >= 500) {
          return 'Blunder — Cost you the game.';
        }
        return 'Blunder — A serious error.';
      default:
        return '';
    }
  };

  /** Detect opening name from history */
  const openingName = history.length >= 2 ? detectOpening(history) : null;
  const getThinkingLabel = () => {
    if (!isComputerThinking) return '';
    const isSfReady = stockfishStatus === 'ready' || stockfishStatus === 'loading';
    if (isSfReady && stockfishStatus === 'loading') return ' (Loading…)';
    if (isSfReady && stockfishProgress) {
      const s = stockfishProgress.score >= 0
        ? `+${(stockfishProgress.score / 100).toFixed(2)}`
        : `${(stockfishProgress.score / 100).toFixed(2)}`;
      return ` (d${stockfishProgress.depth} | ${s})`;
    }
    if (stockfishStatus === 'ready') return ' (thinking)';
    if (stockfishStatus === 'error') return ' (engine error)';
    return '';
  };

  return (
    <div className="game-panel">
      {/* ── Panel Status Header ────────────────────────────── */}
      <div className="panel-status">
        <span className="panel-mode">
          {modeLabel}
          {getThinkingLabel()}
          {isComputerThinking && <span className="thinking-dots" />}
        </span>
        {!isComputerThinking && (
          <span className="panel-status-text">{status}</span>
        )}
        {isComputerThinking && (
          <span className="panel-status-text panel-status-thinking">
            {difficulty ? DIFFICULTIES[difficulty].label : 'Bot'} thinking…
          </span>
        )}
        {stockfishStatus === 'error' && stockfishError && (
          <button className="panel-engine-error" title={stockfishError} onClick={onRetryEngine}>
            Engine error. Retry
          </button>
        )}
      </div>

      {/* ── 1. Move List ───────────────────────────────────── */}
      <div className="panel-section panel-moves">
        <h3 className="panel-section-title">Moves</h3>
        <div className="panel-moves-inner">
          <MoveHistory
            history={history}
            reviewMode={reviewMode}
            reviewIndex={reviewIndex}
            moveFeedback={moveFeedback}
            onGoToMove={onGoToMove}
            onEnterReview={onEnterReview}
            onExitReview={onExitReview}
          />
        </div>
      </div>

      {/* ── 2. Analysis ────────────────────────────────────── */}
      <div className="panel-section panel-analysis">
        <h3 className="panel-section-title">Analysis</h3>
        {openingName && (
          <div className="analysis-opening">
            <span className="analysis-opening-badge">Opening</span>
            <span className="analysis-opening-name">{openingName}</span>
          </div>
        )}
        {moveFeedback.size > 0 && (
          <div className="analysis-feedback-list">
            {Array.from(moveFeedback.values())
              .filter((f) => f.moveIndex >= 0)
              .slice(-10)
              .reverse()
              .map((f) => (
                <div key={f.moveIndex} className={`analysis-feedback-item tag-${f.tag}`}>
                  <span className="feedback-move-num">#{f.moveIndex + 1}</span>
                  <span className="feedback-tag">{f.tag}</span>
                  <span className="feedback-message">
                    {getFeedbackMessage(f.tag, f.centipawnLoss)}
                  </span>
                </div>
              ))}
          </div>
        )}
        {moveFeedback.size === 0 && !openingName && (
          <p className="panel-analysis-placeholder">
            Move quality analysis after your moves
          </p>
        )}
      </div>

      {/* ── 3. Game Actions ────────────────────────────────── */}
      <div className="panel-section panel-actions">
        <h3 className="panel-section-title">Game Actions</h3>
        <div className="panel-actions-grid">
          <button className="btn panel-action-btn" onClick={() => setShowNewGameConfirm(true)}>
            New Game
          </button>

          <button
            className="btn btn-secondary panel-action-btn"
            onClick={() => setShowUndoConfirm(true)}
            disabled={!canUndo}
          >
            Undo
          </button>

          <button
            className="btn btn-secondary panel-action-btn"
            onClick={onFlipBoard}
          >
            Flip Board
          </button>

          <button className="btn btn-secondary panel-action-btn" onClick={isPaused ? onResume : onPause} disabled={!canPause}>
            {isPaused ? 'Resume Game' : 'Pause Game'}
          </button>

          <button
            className="btn btn-danger-outline panel-action-btn"
            onClick={() => setShowResignConfirm(true)}
            disabled={!canResign}
          >
            Resign
          </button>
        </div>
      </div>

      {/* ── Resign confirmation ───────────────────────────── */}
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
      {showNewGameConfirm && (
        <ConfirmDialog
          title="Start New Game"
          message="Start a new game and clear the current position?"
          confirmLabel="Start New Game"
          onConfirm={() => { setShowNewGameConfirm(false); onNewGame(); }}
          onCancel={() => setShowNewGameConfirm(false)}
        />
      )}
      {showUndoConfirm && (
        <ConfirmDialog
          title="Undo Turn"
          message="Undo your latest player turn and any computer reply?"
          confirmLabel="Undo"
          onConfirm={() => { setShowUndoConfirm(false); onUndo(); }}
          onCancel={() => setShowUndoConfirm(false)}
        />
      )}
    </div>
  );
}

