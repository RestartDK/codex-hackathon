interface GameEndModalProps {
  result: { winner: "w" | "b" | null; reason: "checkmate" | "resign" | "draw" } | null;
  onNewGame: () => void;
  onEnterReview: () => void;
  commandControls?: React.ReactNode;
}

const WINNER_LABEL: Record<"w" | "b", string> = {
  w: "White",
  b: "Black",
};

export default function GameEndModal({ result, onNewGame, onEnterReview, commandControls }: GameEndModalProps) {
  const titleId = useId();
  const messageId = useId();
  const { dialogRef, onKeyDown } = useDialogFocus(undefined, Boolean(result));
  if (!result) return null;

  const { winner, reason } = result;

  let title: string;
  let message: string;

  switch (reason) {
    case "checkmate":
      title = "Checkmate!";
      message = winner ? `${WINNER_LABEL[winner]} wins by checkmate.` : "The game ended.";
      break;
    case "resign":
      title = "Resignation";
      message = winner ? `${WINNER_LABEL[winner]} wins by resignation.` : "The game ended.";
      break;
    case "draw":
      title = "Draw";
      message = "The game ended in a draw.";
      break;
  }

  return (
    <div className="game-end-overlay">
      <div
        ref={dialogRef}
        className="game-end-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={onKeyDown}
      >
        <div id={titleId} className="game-end-result">
          {title}
        </div>
        <div id={messageId} className="game-end-message">
          {message}
        </div>
        <div className="game-end-actions">
          <button className="btn btn-sm" onClick={onNewGame}>
            New Game
          </button>
          <button
            className="btn btn-sm btn-review"
            onClick={() => {
              onEnterReview();
            }}
          >
            Review Game
          </button>
        </div>
        {commandControls}
      </div>
    </div>
  );
}

import { useId } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";
