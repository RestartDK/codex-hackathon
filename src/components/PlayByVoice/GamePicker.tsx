import { useLayoutEffect, useRef } from "react";
import type { ChessCompanion } from "../../voice/useChessCompanion";
import { GAME_CARDS } from "./gameCatalog";

const CARD_CYCLES = [0, 1, 2, 3, 4];
const CENTER_CYCLE = 2;

export default function GamePicker({ companion }: { companion: ChessCompanion }) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const cycleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const carousel = carouselRef.current;
    const cycle = cycleRef.current;
    const nextCycle = cycle?.nextElementSibling;
    if (!carousel || !cycle || !nextCycle) return;

    let cycleWidth = 0;
    const measure = () => {
      const nextWidth = nextCycle.getBoundingClientRect().left - cycle.getBoundingClientRect().left;
      const offset = cycleWidth ? carousel.scrollLeft / cycleWidth : CENTER_CYCLE;
      cycleWidth = nextWidth;
      carousel.scrollLeft = offset * cycleWidth;
    };
    const wrap = () => {
      if (!cycleWidth) return;
      const cycles = Math.floor(carousel.scrollLeft / cycleWidth - CENTER_CYCLE + 0.5);
      if (cycles) carousel.scrollLeft -= cycles * cycleWidth;
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? carousel.clientWidth : 1;
      carousel.scrollLeft += event.deltaY * unit;
      wrap();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cycle);
    carousel.addEventListener("scroll", wrap);
    carousel.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      carousel.removeEventListener("scroll", wrap);
      carousel.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <section className="game-picker" aria-labelledby="page-heading">
      <h1 id="page-heading" className="sr-only" tabIndex={-1}>
        Choose your game
      </h1>
      <div className="game-carousel-frame">
        <div
          ref={carouselRef}
          className="game-carousel"
          role="region"
          aria-label="Choose a game. Scroll or use the left and right arrow keys to browse."
          aria-roledescription="carousel"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            const cycle = cycleRef.current;
            const card = cycle?.firstElementChild;
            if (!cycle || !card) return;
            event.preventDefault();
            const gap = Number.parseFloat(getComputedStyle(cycle).columnGap);
            event.currentTarget.scrollLeft +=
              (card.getBoundingClientRect().width + gap) * (event.key === "ArrowRight" ? 1 : -1);
          }}
        >
          <div className="game-cards">
            {CARD_CYCLES.map((cycle) => (
              <div
                className="game-card-cycle"
                key={cycle}
                ref={cycle === CENTER_CYCLE ? cycleRef : undefined}
                aria-hidden={cycle !== CENTER_CYCLE ? true : undefined}
              >
                {GAME_CARDS.map((game) => (
                  <article
                    className={`game-card game-card-${game.id}`}
                    key={game.id}
                    aria-labelledby={`${game.id}-${cycle}-title`}
                  >
                    {!game.launch && <span className="coming-soon">Coming soon</span>}
                    <span className={`game-shape ${game.shape}`} aria-hidden="true" />
                    <div className="game-card-copy">
                      <h2 id={`${game.id}-${cycle}-title`}>{game.title}</h2>
                      <p>{game.description}</p>
                    </div>
                    <button
                      className="start-game"
                      disabled={!game.launch || companion.busy}
                      tabIndex={cycle === CENTER_CYCLE ? undefined : -1}
                      onPointerDown={(event) => {
                        if (cycle !== CENTER_CYCLE) event.preventDefault();
                      }}
                      onClick={() => {
                        if (game.launch) void companion.navigate(game.launch);
                      }}
                      aria-label={
                        game.launch
                          ? `Start the game: ${game.title}`
                          : `${game.title} is coming soon`
                      }
                    >
                      {game.launch ? "Start the game" : "Coming soon"}
                    </button>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="picker-hint">
        Choose a game. Or start voice and say <span>"Play chess"</span> or{" "}
        <span>"Play Loups-Garous"</span>.
      </p>
    </section>
  );
}
