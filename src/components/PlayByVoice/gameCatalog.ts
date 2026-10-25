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
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    description: "Three in a row. A familiar little challenge, played your way.",
    shape: "diamond",
    launch: null,
  },
];
