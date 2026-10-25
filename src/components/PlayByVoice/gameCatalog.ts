import type { PlayableGame } from "../../voice/navigation";

export type GameCardShape = "triangle" | "pentagon" | "diamond";

export type GameCard = {
  id: string;
  title: string;
  description: string;
  shape: GameCardShape;
  launch: PlayableGame | null;
};

export const GAME_CARDS: readonly GameCard[] = [
  {
    id: "chess",
    title: "Chess",
    description: "Plan your moves. Challenge the bot. Ask about the board at any time.",
    shape: "triangle",
    launch: "chess",
  },
  {
    id: "loups-garous",
    title: "Loups-Garous",
    description: "Listen, question, and uncover the werewolf hiding among the villagers.",
    shape: "pentagon",
    launch: "loups-garous",
  },
  {
    id: "ludo",
    title: "Ludo",
    description: "Roll, move four numbered tokens, and race the computer home.",
    shape: "diamond",
    launch: "ludo",
  },
  {
    id: "intercept",
    title: "The Intercept",
    description: "Explore an authored wartime mystery where every spoken choice shapes the story.",
    shape: "triangle",
    launch: "intercept",
  },
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    description: "Three in a row. A familiar little challenge, played your way.",
    shape: "diamond",
    launch: "tic-tac-toe",
  },
];


