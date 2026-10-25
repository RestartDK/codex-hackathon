import { useMemo, useState, type KeyboardEvent } from "react";
import { Chess, type Square as ChessSquare } from "chess.js";
import Square from "./Square";
import type { BoardOrientation, BoardTheme, PieceSet } from "../../types";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

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
  kingInCheck?: { square: string; color: "w" | "b" } | null;
  displayFen?: string | null;
  manualFlip?: boolean;
}

export default function Board({
  game,
  selectedSquare,
  legalMoves,
  onSquareClick,
  boardOrientation = "white-bottom",
  boardTheme = "classic",
  pieceSet = "merida",
  isComputerThinking = false,
  lastMove = null,
  kingInCheck = null,
  displayFen = null,
  manualFlip = false,
}: BoardProps) {
  const source = useMemo(() => (displayFen ? new Chess(displayFen) : game), [displayFen, game]);
  const flipped = (boardOrientation === "flip-turn" && source.turn() === "b") !== manualFlip;
  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;
  const [focusedSquare, setFocusedSquare] = useState<ChessSquare>("e1");

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-square]")
        : null;
    const square = target?.dataset.square;
    if (!square) return;
    const row = ranks.findIndex((rank) => rank === square[1]);
    const column = files.findIndex((file) => file === square[0]);
    const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (!(event.key in delta)) return;
    const change = Object.entries(delta).find(([key]) => key === event.key)?.[1];
    if (!change) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(7, row + change[0]));
    const nextColumn = Math.max(0, Math.min(7, column + change[1]));
    event.currentTarget
      .querySelector<HTMLElement>(`[data-square="${files[nextColumn]}${ranks[nextRow]}"]`)
      ?.focus();
  }

  return (
    <div
      className={`board-wrapper theme-${boardTheme}${isComputerThinking ? " board-computer-thinking" : ""}`}
    >
      <div
        className="board"
        role="grid"
        aria-label={`Chess board, ${flipped ? "Black" : "White"} at bottom`}
        aria-rowcount={8}
        aria-colcount={8}
        onKeyDown={handleKeyDown}
      >
        {ranks.map((rank, row) => (
          <div role="row" aria-rowindex={row + 1} className="board-row" key={rank}>
            {files.map((file, column) => {
              const square: ChessSquare = `${file}${rank}`;
              return (
                <Square
                  key={square}
                  square={square}
                  piece={source.get(square) ?? null}
                  isLight={(row + column) % 2 === 0}
                  isSelected={selectedSquare === square}
                  isLegalMove={legalMoves.includes(square)}
                  isLastMove={lastMove?.from === square || lastMove?.to === square}
                  isCheck={kingInCheck?.square === square}
                  rankLabel={column === 0 ? rank : null}
                  fileLabel={row === 7 ? file : null}
                  column={column + 1}
                  onClick={() => onSquareClick(square)}
                  tabIndex={focusedSquare === square ? 0 : -1}
                  onFocus={() => setFocusedSquare(square)}
                  pieceSet={pieceSet}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
