interface PieceProps {
  piece: { color: "w" | "b"; type: string };
  pieceSet?: "unicode" | "symbols" | "outlined" | "merida";
}

const SYMBOLS: Record<string, Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

export default function Piece({ piece, pieceSet = "merida" }: PieceProps) {
  return (
    <span
      className={`piece piece-${piece.color} piece-set-${pieceSet}`}
      aria-hidden="true"
      data-piece={piece.color + piece.type}
    >
      {pieceSet === "merida" ? (
        <img
          src={`/artwork/pieces/${piece.color}${piece.type}.webp`}
          alt=""
          draggable={false}
          width={160}
          height={160}
        />
      ) : (
        SYMBOLS[piece.color]?.[piece.type]
      )}
    </span>
  );
}
