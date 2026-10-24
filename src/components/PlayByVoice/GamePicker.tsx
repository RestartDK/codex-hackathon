import type { ChessCompanion } from "../../voice/useChessCompanion";

const GAMES = [
  {
    id: "chess",
    title: "Chess",
    description: "Plan your moves. Challenge the bot. Ask about the board at any time.",
    shape: "triangle",
    available: true,
  },
  {
    id: "werewolf",
    title: "Loups-Garous",
    description: "Listen, question, and uncover the werewolf hiding among the villagers.",
    shape: "pentagon",
    available: false,
  },
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    description: "Three in a row. A familiar little challenge, played your way.",
    shape: "diamond",
    available: false,
  },
];

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
          {GAMES.map((game) => (
            <article
              className={`game-card game-card-${game.id}`}
              key={game.id}
              aria-labelledby={`${game.id}-title`}
            >
              {!game.available && <span className="coming-soon">Coming soon</span>}
              <span className={`game-shape ${game.shape}`} aria-hidden="true" />
              <div className="game-card-copy">
                <h2 id={`${game.id}-title`}>{game.title}</h2>
                <p>{game.description}</p>
              </div>
              <button
                className="start-game"
                disabled={!game.available || companion.busy}
                onClick={() => {
                  void companion.navigate("chess");
                }}
                aria-label={
                  game.available ? "Start the game: Chess" : `${game.title} is coming soon`
                }
              >
                {game.available ? "Start the game" : "Coming soon"}
              </button>
            </article>
          ))}
          <div className="game-peek peek-right" aria-hidden="true">
            <span className="game-shape diamond" />
          </div>
        </div>
      </div>
      <p className="picker-hint">
        Choose a game. Or start voice and say <span>"Play chess."</span>
      </p>
    </section>
  );
}
