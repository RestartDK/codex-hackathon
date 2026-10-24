export type GameId = 'chess' | 'ludo' | 'intercept' | 'tic-tac-toe';

export interface GameMetadata {
  id: GameId;
  title: string;
  description: string;
  route: `/games/${GameId}`;
  saveKey: string;
  supportsComputer: boolean;
  symbol: string;
  capabilities: readonly string[];
}

/** The library's trusted catalog. Future games register metadata here and lazy-load their module. */
export const gameRegistry: readonly GameMetadata[] = [
  {
    id: 'chess',
    title: 'Chess',
    description: 'Play accessible chess with spoken moves, position questions, hints, and a computer opponent.',
    route: '/games/chess',
    saveKey: 'chess-by-sparsh-save',
    supportsComputer: true,
    symbol: '♟',
    capabilities: ['position queries', 'move confirmation', 'hints', 'save and resume'],
  },
  {
    id: 'ludo',
    title: 'Ludo',
    description: 'Roll, choose numbered tokens, capture safely, and race four tokens home against the computer.',
    route: '/games/ludo',
    saveKey: 'voice-game-companion-ludo-save',
    supportsComputer: true,
    symbol: '🎲',
    capabilities: ['die and token narration', 'move confirmation', 'correction before next roll', 'save and resume'],
  },
  {
    id: 'intercept',
    title: 'The Intercept',
    description: 'Explore a voice-first wartime mystery through narrated scenes and meaningful choices.',
    route: '/games/intercept',
    saveKey: 'voice-game-companion-intercept-save',
    supportsComputer: false,
    symbol: '◈',
    capabilities: ['scene narration', 'numbered choices', 'recap and repeat', 'undo', 'save and resume'],
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    description: 'Place X by speaking natural square names and play a complete three-by-three match against the computer.',
    route: '/games/tic-tac-toe',
    saveKey: 'voice-game-companion-tic-tac-toe-save',
    supportsComputer: true,
    symbol: '×',
    capabilities: ['spoken square names', 'three AI levels', 'full-turn undo', 'score and resume'],
  },
];

export function getGameMetadata(id: string): GameMetadata | undefined {
  return gameRegistry.find((game) => game.id === id);
}
