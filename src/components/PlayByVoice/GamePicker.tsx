import type { ChessCompanion } from "../../voice/useChessCompanion";
import { GAME_CARDS } from "./gameCatalog";

export default function GamePicker({ companion }: { companion: ChessCompanion }) {
  return (
    <section className="game-picker" aria-labelledby="page-heading">
      <h1 id="page-heading" className="sr-only" tabIndex={-1}>
        Choose your game
      </h1>
      <div className="game-carousel" aria-label="Choose a game">
        <div className="game-cards">
          <div className="game-peek peek-left" aria-hidden="true">
            <span className="game-shape diamond" />
          </div>
          {GAME_CARDS.map((game) => (
            <article
              className={`game-card game-card-${game.id}`}
              key={game.id}
              aria-labelledby={`${game.id}-title`}
            >
              {!game.launch && <span className="coming-soon">Coming soon</span>}
              <span className={`game-shape ${game.shape}`} aria-hidden="true" />
              <div className="game-card-copy">
                <h2 id={`${game.id}-title`}>{game.title}</h2>
                <p>{game.description}</p>
              </div>
              <button
                className="start-game"
                disabled={!game.launch || companion.busy}
                onClick={() => {
                  if (game.launch) void companion.navigate(game.launch);
                }}
                aria-label={
                  game.launch ? `Start the game: ${game.title}` : `${game.title} is coming soon`
                }
              >
                {game.launch ? "Start the game" : "Coming soon"}
              </button>
            </article>
          ))}
          <div className="game-peek peek-right" aria-hidden="true">
            <span className="game-shape diamond" />
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
