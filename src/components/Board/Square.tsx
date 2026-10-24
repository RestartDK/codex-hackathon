import type { Square as ChessSquare } from 'chess.js';
import Piece from '../Piece/Piece';
import type { PieceSet } from '../../types';

export interface PieceInfo {
  color: 'w' | 'b';
  type: string;
}

const PIECE_TYPE_NAMES: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

function getSquareAriaLabel(
  piece: PieceInfo | null,
  square: ChessSquare
): string {
  if (!piece) return `Empty square ${square}`;
  const colorName = piece.color === 'w' ? 'White' : 'Black';
  const typeName = PIECE_TYPE_NAMES[piece.type] ?? piece.type;
  return `${colorName} ${typeName} at ${square}`;
}

interface SquareProps {
  square: ChessSquare;
  piece: PieceInfo | null;
  isLight: boolean;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  rankLabel: string | null;
  fileLabel: string | null;
  onClick: () => void;
  tabIndex: number;
  onFocus: () => void;
  pieceSet?: PieceSet;
}

export default function Square({
  square,
  piece,
  isLight,
  isSelected,
  isLegalMove,
  isLastMove,
  isCheck,
  rankLabel,
  fileLabel,
  onClick,
  tabIndex,
  onFocus,
  pieceSet = 'merida',
}: SquareProps) {
  const colorClass = isLight ? 'square-light' : 'square-dark';
  const selectedClass = isSelected ? ' square-selected' : '';
  const lastMoveClass = isLastMove ? ' square-last-move' : '';
  const checkClass = isCheck ? ' square-check' : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
    // Arrow keys handled at board level, but allow bubbling
  };

  return (
    <div
      className={'square ' + colorClass + selectedClass + lastMoveClass + checkClass}
      data-square={square}
      onClick={onClick}
      role="gridcell"
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      aria-label={getSquareAriaLabel(piece, square)}
    >
      {rankLabel && <span className="label-rank">{rankLabel}</span>}
      {fileLabel && <span className="label-file">{fileLabel}</span>}
      {piece && <Piece piece={piece} pieceSet={pieceSet} />}
      {isLegalMove && <span className="legal-move-dot" />}
    </div>
  );
}

