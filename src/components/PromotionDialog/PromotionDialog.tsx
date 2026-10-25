interface PromotionDialogProps {
  color: "w" | "b";
  onPromote: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
  commandControls?: React.ReactNode;
}

const PIECE_UNICODE: Record<string, Record<string, string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

const PIECES: Array<"q" | "r" | "b" | "n"> = ["q", "r", "b", "n"];

export default function PromotionDialog({ color, onPromote, onCancel, commandControls }: PromotionDialogProps) {
  const titleId = useId();
  const { dialogRef, onKeyDown } = useDialogFocus(onCancel);
  return (
    <div className="promotion-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="promotion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <p id={titleId} className="promotion-title">
          Choose promotion:
        </p>
        <div className="promotion-choices">
          {PIECES.map((p) => (
            <button
              key={p}
              className="promotion-btn"
              onClick={() => onPromote(p)}
              aria-label={`Promote to ${p === "q" ? "Queen" : p === "r" ? "Rook" : p === "b" ? "Bishop" : "Knight"}`}
            >
              {PIECE_UNICODE[color][p]}
            </button>
          ))}
        </div>
        {commandControls}
      </div>
    </div>
  );
}

import { useId } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";
