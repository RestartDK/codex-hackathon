import { useEffect, useRef } from 'react';
import type { MoveFeedback } from '../../types';

interface MoveHistoryProps {
  history: string[];
  reviewMode: boolean;
  reviewIndex: number;
  moveFeedback: Map<number, MoveFeedback>;
  onGoToMove: (index: number) => void;
  onEnterReview: () => void;
  onExitReview: () => void;
}

export default function MoveHistory({
  history,
  reviewMode,
  reviewIndex,
  moveFeedback,
  onGoToMove,
  onEnterReview,
  onExitReview,
}: MoveHistoryProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest move when not reviewing
  useEffect(() => {
    if (!reviewMode && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [history, reviewMode]);

  // Scroll active row into view during review
  useEffect(() => {
    if (reviewMode && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [reviewIndex, reviewMode]);

  // Group moves into pairs (white, black)
  const rows: { num: number; white: string; black?: string; whiteIndex: number; blackIndex?: number }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      num: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1],
      whiteIndex: i,
      blackIndex: i + 1,
    });
  }

  const isCurrentInReview = (moveIndex: number) => reviewMode && reviewIndex === moveIndex;

  return (
    <div className="move-history">
      <h3 className="move-history-title">Moves</h3>

      {reviewMode && (
        <div className="review-indicator">
          <span className="review-label">
            Reviewing move {reviewIndex + 1}/{history.length}
          </span>
          <button className="btn btn-sm btn-review" onClick={onExitReview}>
            Exit Review
          </button>
        </div>
      )}

      <div className="move-history-list" ref={listRef}>
        {rows.length === 0 && !reviewMode && (
          <p className="move-history-empty">No moves yet</p>
        )}
        {rows.map((row) => (
          <div
            key={row.num}
            className={'move-row' + (isCurrentInReview(row.whiteIndex) ? ' move-row-active' : '')}
            ref={isCurrentInReview(row.whiteIndex) ? activeRowRef : undefined}
          >
            <span className="move-number">{row.num}.</span>
            <button
              type="button"
              className={'move-white' + (isCurrentInReview(row.whiteIndex) ? ' move-current' : '')}
              onClick={() => {
                if (!reviewMode) onEnterReview();
                onGoToMove(row.whiteIndex);
              }}
            >
              {row.white}
              <MoveFeedbackTag feedback={moveFeedback.get(row.whiteIndex)} />
            </button>
            {row.black !== undefined && (
              <button
                type="button"
                className={
                  'move-black' + (row.blackIndex !== undefined && isCurrentInReview(row.blackIndex)
                    ? ' move-current'
                    : '')
                }
                onClick={() => {
                  if (!reviewMode) onEnterReview();
                  if (row.blackIndex !== undefined) onGoToMove(row.blackIndex);
                }}
              >
                {row.black}
                {row.blackIndex !== undefined && (
                  <MoveFeedbackTag feedback={moveFeedback.get(row.blackIndex)} />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="review-controls">
        <button
          className="btn btn-sm btn-review-nav"
          onClick={() => onGoToMove(0)}
          disabled={!reviewMode || history.length === 0}
          aria-label="First move"
        >
          &#x23EE;
        </button>
        <button
          className="btn btn-sm btn-review-nav"
          onClick={() => onGoToMove(reviewIndex - 1)}
          disabled={!reviewMode || reviewIndex < 0}
          aria-label="Previous move"
        >
          &larr;
        </button>
        <button
          className="btn btn-sm btn-review-nav"
          onClick={() => onGoToMove(reviewIndex + 1)}
          disabled={!reviewMode || reviewIndex >= history.length - 1}
          aria-label="Next move"
        >
          &rarr;
        </button>
        <button
          className="btn btn-sm btn-review-nav"
          onClick={() => onGoToMove(history.length - 1)}
          disabled={!reviewMode || history.length === 0}
          aria-label="Last move"
        >
          &#x23ED;
        </button>
        {!reviewMode && history.length > 0 && (
          <button className="btn btn-sm btn-review" onClick={onEnterReview}>
            Review
          </button>
        )}
      </div>
    </div>
  );
}

/** Inline feedback tag rendered next to a move */
function MoveFeedbackTag({ feedback }: { feedback: MoveFeedback | undefined }) {
  if (!feedback) return null;

  const tagConfig: Record<string, { label: string; title: string }> = {
    book: { label: '★', title: 'Book move' },
    perfect: { label: '!!', title: `Perfect (0–10cp loss, ${Math.round(feedback.centipawnLoss)}cp)` },
    excellent: { label: '!', title: `Excellent (11–35cp loss, ${Math.round(feedback.centipawnLoss)}cp)` },
    good: { label: '⩀', title: `Good (36–80cp loss, ${Math.round(feedback.centipawnLoss)}cp)` },
    inaccuracy: { label: '?!', title: `Inaccuracy (81–150cp, ${Math.round(feedback.centipawnLoss)}cp loss)` },
    mistake: { label: '?', title: `Mistake (151–300cp, ${Math.round(feedback.centipawnLoss)}cp loss)` },
    blunder: { label: '??', title: `Blunder (>300cp, ${Math.round(feedback.centipawnLoss)}cp loss)` },
  };

  const info = tagConfig[feedback.tag];
  if (!info) return null;

  return (
    <span
      className={`feedback-badge feedback-badge-${feedback.tag}`}
      title={info.title}
    >
      {info.label}
    </span>
  );
}

