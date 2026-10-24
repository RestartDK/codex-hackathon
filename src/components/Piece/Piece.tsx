import type { CSSProperties } from "react";

interface PieceProps {
  piece: { color: "w" | "b"; type: string };
  pieceSet?: "unicode" | "symbols" | "outlined" | "merida";
}

const PIECE_UNICODE: Record<string, Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

type PieceSetRenderer = (
  color: "w" | "b",
  _type: string,
  char: string
) => {
  className: string;
  style: CSSProperties;
  children: string;
};

const PIECE_RENDERERS: Record<string, PieceSetRenderer> = {
  unicode: (color, _type, char) => ({
    className: "piece piece-" + color + " piece-set-unicode",
    style: { color: "var(--text)" },
    children: char,
  }),

  symbols: (color, _type, char) => ({
    className: "piece piece-" + color + " piece-set-symbols",
    style: {
      color: color === "w" ? "#c8a84e" : "#8b6914",
      fontWeight: 700,
    },
    children: char,
  }),

  outlined: (color, _type, char) => ({
    className: "piece piece-" + color + " piece-set-outlined",
    style: {
      color: "transparent",
      WebkitTextStroke:
        color === "w"
          ? "1.2px rgba(0,0,0,0.35)"
          : "1.2px rgba(0,0,0,0.55)",
      textShadow: "none",
    } as CSSProperties,
    children: char,
  }),

  merida: (color, _type, char) => ({
    className: "piece piece-" + color + " piece-set-merida",
    style: {
      color: color === "w" ? "#2a2a2a" : "#d4d4d4",
      fontWeight: 700,
      fontSize: "1.15em",
    },
    children: char,
  }),
};

export default function Piece({ piece, pieceSet = "unicode" }: PieceProps) {
  const char = PIECE_UNICODE[piece.color]?.[piece.type] ?? "";
  const resolvedSet = pieceSet || "unicode";
  const renderer = PIECE_RENDERERS[resolvedSet] ?? PIECE_RENDERERS.unicode;
  const rendered = renderer(piece.color, piece.type, char);

  return (
    <span
      aria-hidden="true"
      className={rendered.className}
      style={rendered.style}
      data-piece={piece.color + piece.type}
      data-piece-set={resolvedSet}
    >
      {rendered.children}
    </span>
  );
}

