import type { GameMode, StockfishStatus } from '../../types';

interface StatusBarProps {
  status: string;
  fen: string;
  gameMode: GameMode;
  isComputerThinking?: boolean;
  stockfishStatus?: StockfishStatus;
  stockfishError?: string | null;
  stockfishProgress?: { depth: number; score: number } | null;
  isNightmare?: boolean;
}

export default function StatusBar({
  status,
  fen,
  gameMode,
  isComputerThinking,
  stockfishStatus,
  stockfishError,
  stockfishProgress,
  isNightmare,
}: StatusBarProps) {
  const modeLabel = gameMode === 'computer' ? 'Computer' : 'Local 2P';

  const getThinkingLabel = () => {
    if (!isComputerThinking) return '';

    if (isNightmare && stockfishStatus === 'loading') {
      return ' (Loading Stockfish engine…)';
    }

    if (isNightmare && stockfishProgress) {
      const score =
        stockfishProgress.score >= 0
          ? `+${(stockfishProgress.score / 100).toFixed(2)}`
          : `${(stockfishProgress.score / 100).toFixed(2)}`;
      return ` (Nightmare d${stockfishProgress.depth} | ${score})`;
    }

    if (isNightmare && stockfishStatus === 'ready') {
      return ' (Nightmare thinking)';
    }

    if (stockfishStatus === 'error') {
      return ' (Stockfish unavailable)';
    }

    return '';
  };

  const showThinkingDots = isComputerThinking && modeLabel !== 'Local 2P';

  return (
    <div className="status-bar">
      <span className="status-mode">
        {modeLabel}
        {getThinkingLabel()}
        {showThinkingDots && <span className="thinking-dots" />}
      </span>
      <span className="status-text">{status}</span>
      {stockfishStatus === 'error' && stockfishError && (
        <span className="status-error" title={stockfishError}>
          ⚠ Engine error
        </span>
      )}
      <span className="status-fen" title={fen}>
        {fen.length > 30 ? fen.slice(0, 30) + '…' : fen}
      </span>
    </div>
  );
}

