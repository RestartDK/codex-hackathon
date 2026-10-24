import type { GameMode } from '../../types';

const PIECE_CHARS: Record<string, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

interface PlayerPanelProps {
  whiteCaptured: string[];
  blackCaptured: string[];
  gameMode: GameMode;
  playerColor: 'w' | 'b';
  turn: 'w' | 'b';
  status: string;
  materialAdvantage: number;
}

export default function PlayerPanel({
  whiteCaptured,
  blackCaptured,
  gameMode,
  playerColor,
  turn,
  status,
  materialAdvantage,
}: PlayerPanelProps) {
  const whiteName = gameMode === 'computer' ? (playerColor === 'w' ? 'You (White)' : 'Computer (White)') : 'Player 1 (White)';
  const blackName = gameMode === 'computer' ? (playerColor === 'b' ? 'You (Black)' : 'Computer (Black)') : 'Player 2 (Black)';

  // Pieces white lost = pieces black captured
  const whiteLost = blackCaptured;
  // Pieces black lost = pieces white captured
  const blackLost = whiteCaptured;

  const renderPlayer = (
    color: 'w' | 'b',
    name: string,
    lostPieces: string[],
  ) => {
    const isActive = turn === color;

    return (
      <div className={'player-row' + (isActive ? ' player-active' : '')}>
        <div className="player-row-header">
          <span className="player-color-dot">
            {color === 'w' ? '⚪' : '⚫'}
          </span>
          <span className="player-name">{name}</span>
          {isActive && <span className="player-turn-arrow">{'➡'}</span>}
        </div>
        <div className="player-lost-row">
          <span className="player-lost-label">Lost: </span>
          <span className="player-lost-pieces">
            {lostPieces.length === 0 ? (
              <span className="player-lost-empty">&mdash;</span>
            ) : (
              lostPieces.map((piece, i) => (
                <span
                  key={color + '-' + piece + '-' + i}
                  className={
                    'player-lost-piece' +
                    (color === 'w'
                      ? ' player-lost-piece-white'
                      : ' player-lost-piece-black')
                  }
                >
                  {PIECE_CHARS[piece] ?? ''}
                </span>
              ))
            )}
          </span>
          {color === 'b' && materialAdvantage > 0 && (
            <span className="material-advantage positive">+{materialAdvantage}</span>
          )}
          {color === 'w' && materialAdvantage < 0 && (
            <span className="material-advantage negative">&minus;{Math.abs(materialAdvantage)}</span>
          )}
        </div>
        {isActive && <div className="player-to-move">{status}</div>}
      </div>
    );
  };

  return (
    <div className="player-panel">
      {renderPlayer('b', blackName, blackLost)}
      {renderPlayer('w', whiteName, whiteLost)}
      <div className="player-divider" />
      <div className="player-clock-placeholder">{'⏱'} Clock coming later</div>
    </div>
  );
}

