import type { Piece as ChessPiece, Square as ChessSquare } from "chess.js";
import Piece from "../Piece/Piece";
import type { PieceSet } from "../../types";

export type PieceInfo = Pick<ChessPiece, "color" | "type">;
const NAMES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

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
  column: number;
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
  pieceSet,
  column,
}: SquareProps) {
  const label = piece
    ? `${piece.color === "w" ? "White" : "Black"} ${NAMES[piece.type]} at ${square}`
    : `Empty square ${square}`;
  return (
    <button
      type="button"
      role="gridcell"
      aria-colindex={column}
      aria-label={label}
      aria-selected={isSelected}
      aria-description={isLegalMove ? "Legal move destination" : undefined}
      className={`square ${isLight ? "square-light" : "square-dark"}${isSelected ? " square-selected" : ""}${isLastMove ? " square-last-move" : ""}${isCheck ? " square-check" : ""}`}
      data-square={square}
      onClick={onClick}
      tabIndex={tabIndex}
      onFocus={onFocus}
    >
      {rankLabel && (
        <span className="label-rank" aria-hidden="true">
          {rankLabel}
        </span>
      )}
      {fileLabel && (
        <span className="label-file" aria-hidden="true">
          {fileLabel}
        </span>
      )}
      {piece && <Piece piece={piece} pieceSet={pieceSet} />}
      {isLegalMove && <span className="legal-move-dot" aria-hidden="true" />}
    </button>
  );
}
