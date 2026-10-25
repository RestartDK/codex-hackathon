import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ChessCompanion } from "../../voice/useChessCompanion";
import { GAME_CARDS } from "./gameCatalog";
import { LOOP_CENTER, LOOP_COPIES, normalizeLoopPosition } from "./infiniteCarousel";

type DragState = {
  pointerId: number;
  startX: number;
  startScroll: number;
  moved: boolean;
};

export default function GamePicker({ companion }: { companion: ChessCompanion }) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const centerGroupRef = useRef<HTMLDivElement>(null);
  const cycleWidthRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  function launchGame(game: (typeof GAME_CARDS)[number]["launch"]) {
    if (!game || companion.busy) return;
    void companion.navigate(game);
  }

  useEffect(() => {
    const carousel = carouselRef.current;
    const centerGroup = centerGroupRef.current;
    if (!carousel || !centerGroup) return;

    const positionAtCenter = () => {
      const styles = getComputedStyle(carousel.querySelector(".game-cards")!);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const cycleWidth = centerGroup.getBoundingClientRect().width + gap;
      if (!cycleWidth) return;
      const previousWidth = cycleWidthRef.current;
      cycleWidthRef.current = cycleWidth;
      if (!previousWidth) carousel.scrollLeft = cycleWidth * LOOP_CENTER;
      else carousel.scrollLeft *= cycleWidth / previousWidth;
    };

    positionAtCenter();
    const resize = new ResizeObserver(positionAtCenter);
    resize.observe(carousel);
    resize.observe(centerGroup);
    return () => resize.disconnect();
  }, []);

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const carousel = event.currentTarget;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: carousel.scrollLeft,
      moved: false,
    };
  }

  function continueDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) > 4) {
      drag.moved = true;
      suppressClickRef.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    const next = normalizeLoopPosition(drag.startScroll - delta, cycleWidthRef.current);
    if (next !== drag.startScroll - delta) drag.startScroll += next - (drag.startScroll - delta);
    event.currentTarget.scrollLeft = next;
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  return (
    <section className="game-picker" aria-labelledby="page-heading">
      <h1 id="page-heading" className="sr-only" tabIndex={-1}>
        Choose your game
      </h1>
      <div
        ref={carouselRef}
        className={`game-carousel${dragging ? " is-dragging" : ""}`}
        aria-label="Choose a game"
        onPointerDown={beginDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onScroll={(event) => {
          if (dragRef.current) return;
          const carousel = event.currentTarget;
          const normalized = normalizeLoopPosition(carousel.scrollLeft, cycleWidthRef.current);
          if (normalized !== carousel.scrollLeft) carousel.scrollLeft = normalized;
        }}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div className="game-cards">
          {Array.from({ length: LOOP_COPIES }, (_, copyIndex) => (
            <div
              className="game-loop-group"
              key={copyIndex}
              ref={copyIndex === LOOP_CENTER ? centerGroupRef : undefined}
              aria-hidden={copyIndex === LOOP_CENTER ? undefined : true}
            >
              {GAME_CARDS.map((game) => {
                const semantic = copyIndex === LOOP_CENTER;
                return (
                  <article
                    className={`game-card game-card-${game.id}${game.launch ? " is-playable" : ""}`}
                    key={game.id}
                    aria-labelledby={semantic ? `${game.id}-title` : undefined}
                  >
                    {!game.launch && <span className="coming-soon">Coming soon</span>}
                    <button
                      type="button"
                      className="game-card-control"
                      disabled={!game.launch || companion.busy}
                      tabIndex={semantic ? undefined : -1}
                      onMouseDown={semantic ? undefined : (event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        launchGame(game.launch);
                      }}
                      aria-label={
                        game.launch
                          ? `Start the game: ${game.title}`
                          : `${game.title} is coming soon`
                      }
                    >
                      <span className={`game-shape ${game.shape}`} aria-hidden="true" />
                      <span className="game-card-copy">
                        <span
                          className="game-card-title"
                          id={semantic ? `${game.id}-title` : undefined}
                          role="heading"
                          aria-level={2}
                        >
                          {game.title}
                        </span>
                        <span className="game-card-description">{game.description}</span>
                      </span>
                      <span className="start-game" aria-hidden="true">
                        <span>{game.launch ? "Start the game" : "Coming soon"}</span>
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="picker-hint">
        Choose a game. Or start voice and say <span>"Play chess"</span> or{" "}
        <span>"Play Loups-Garous"</span>.
      </p>
    </section>
  );
}
