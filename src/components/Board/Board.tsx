import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square as ChessSquare, Color } from 'chess.js';
import Square from './Square';
import type { PieceInfo } from './Square';
import type { BoardOrientation, BoardTheme, PieceSet } from '../../types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

interface BoardProps {
  game: Chess;
  selectedSquare: ChessSquare | null;
  legalMoves: ChessSquare[];
  onSquareClick: (square: ChessSquare) => void;
  boardOrientation?: BoardOrientation;
  boardTheme?: BoardTheme;
  pieceSet?: PieceSet;
  isComputerThinking?: boolean;
  lastMove?: { from: string; to: string } | null;
  kingInCheck?: { square: string; color: 'w' | 'b' } | null;
  /** When set, Board renders from this FEN instead of the live game */
  displayFen?: string | null;
  /** Inverts the configured orientation when the player presses Flip Board. */
  manualFlip?: boolean;
  playerColor?: Color;
  gameMode?: 'computer' | 'local';
}

export default function Board({
  game,
  selectedSquare,
  legalMoves,
  onSquareClick,
  boardOrientation = 'white-bottom',
  boardTheme = 'classic',
  pieceSet = 'merida',
  isComputerThinking = false,
  lastMove = null,
  kingInCheck = null,
  displayFen = null,
  manualFlip = false,
  playerColor = 'w',
  gameMode = 'computer',
}: BoardProps) {
  // When displayFen is provided (review mode), use a separate Chess instance
  // to render the historical position. Never mutate the live game.
  const source = useMemo(() => {
    if (!displayFen) return game;
    const g = new Chess();
    try {
      g.load(displayFen);
      return g;
    } catch {
      return game;
    }
  }, [displayFen, game]);

  const currentTurn: Color = source.turn();
  const automaticallyFlipped = boardOrientation === 'flip-turn' && currentTurn === 'b';
  const flipped = automaticallyFlipped !== manualFlip;

  // Display ranks: when flipped, reverse so Black's rank 8 is at bottom
  const displayRanks = flipped ? [...RANKS].reverse() : RANKS;
  const displayFiles = flipped ? [...FILES].reverse() : FILES;
  const [focusedSquare, setFocusedSquare] = useState<ChessSquare>('e1');

  // Which color is on each side
  const bottomColor: Color = flipped ? 'b' : 'w';
  const topColor: Color = flipped ? 'w' : 'b';

  const squares: React.ReactNode[] = [];

  displayRanks.forEach((rank, ri) => {
    displayFiles.forEach((file, fi) => {
      const square = (file + rank) as ChessSquare;
      const isLight = (ri + fi) % 2 === 0;
      const piece = source.get(square) as PieceInfo | null;
      const isSelected = selectedSquare === square;
      const isLegalMove = legalMoves.includes(square);
      const isLastMove = lastMove !== null && (square === lastMove.from || square === lastMove.to);
      const isCheck = kingInCheck !== null && square === kingInCheck.square;

      // Rank labels on left edge (file a)
      const rankLabel = fi === 0 ? rank : null;
      // File labels on bottom edge (last displayed rank)
      const fileLabel = ri === displayRanks.length - 1 ? file.toUpperCase() : null;

      squares.push(
        <Square
          key={square}
          square={square}
          piece={piece}
          isLight={isLight}
          isSelected={isSelected}
          isLegalMove={isLegalMove}
          isLastMove={isLastMove}
          isCheck={isCheck}
          rankLabel={rankLabel}
          fileLabel={fileLabel}
          onClick={() => onSquareClick(square)}
          tabIndex={focusedSquare === square ? 0 : -1}
          onFocus={() => setFocusedSquare(square)}
          pieceSet={pieceSet}
        />
      );
    });
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const targetElement = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-square]') : null;
    if (targetElement) {
      const focusedSquare = targetElement.getAttribute('data-square') as ChessSquare | null;
      if (!focusedSquare) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        return;
      }

      const row = displayRanks.indexOf(focusedSquare[1] as typeof RANKS[number]);
      const column = displayFiles.indexOf(focusedSquare[0] as typeof FILES[number]);
      let newRow = row;
      let newColumn = column;
      switch (e.key) {
        case 'ArrowUp':
          newRow = Math.max(row - 1, 0);
          break;
        case 'ArrowDown':
          newRow = Math.min(row + 1, 7);
          break;
        case 'ArrowLeft':
          newColumn = Math.max(column - 1, 0);
          break;
        case 'ArrowRight':
          newColumn = Math.min(column + 1, 7);
          break;
        default:
          return;
      }

      e.preventDefault();
      const targetSquare = `${displayFiles[newColumn]}${displayRanks[newRow]}`;
      const target = document.querySelector(
        `[data-square="${targetSquare}"]`
      );
      if (target instanceof HTMLElement) target.focus();
    }
  };

  const thinkingClass = isComputerThinking ? ' board-computer-thinking' : '';
  const flipClass = flipped ? ' board-flipped' : '';

  return (
    <div className={'board-wrapper' + flipClass}>
      {/* Top side: white or black label */}
      <div className="board-side-label board-side-top">
        <span className={`side-color-dot side-dot-${topColor}`} />
        <span className="side-color-name">{topColor === 'w' ? 'White' : 'Black'}{gameMode === 'computer' ? (topColor === playerColor ? ' — You' : ' — Computer') : ''}</span>
        {topColor === currentTurn && (
          <span className="side-turn-dot" title="Current turn to move">●</span>
        )}
      </div>

      <div
        className={'board theme-' + boardTheme + thinkingClass}
        role="grid"
        aria-label={`Chess board — ${topColor === 'w' ? 'White' : 'Black'} at top, ${bottomColor === 'w' ? 'White' : 'Black'} at bottom`}
        onKeyDown={handleKeyDown}
      >
        {squares}
      </div>

      {/* Bottom side: white or black label */}
      <div className="board-side-label board-side-bottom">
        <span className={`side-color-dot side-dot-${bottomColor}`} />
        <span className="side-color-name">{bottomColor === 'w' ? 'White' : 'Black'}{gameMode === 'computer' ? (bottomColor === playerColor ? ' — You' : ' — Computer') : ''}</span>
        {bottomColor === currentTurn && (
          <span className="side-turn-dot" title="Current turn to move">●</span>
        )}
      </div>
    </div>
  );
}

