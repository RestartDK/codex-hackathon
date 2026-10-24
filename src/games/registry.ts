export type GameId = 'chess' | 'ludo';

export interface GameMetadata {
  id: GameId;
  title: string;
  description: string;
  route: `/games/${GameId}`;
  saveKey: string;
  supportsComputer: boolean;
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
    capabilities: ['position queries', 'move confirmation', 'hints', 'save and resume'],
  },
  {
    id: 'ludo',
    title: 'Ludo',
    description: 'Roll, choose numbered tokens, capture safely, and race four tokens home against the computer.',
    route: '/games/ludo',
    saveKey: 'voice-game-companion-ludo-save',
    supportsComputer: true,
    capabilities: ['die and token narration', 'move confirmation', 'correction before next roll', 'save and resume'],
  },
];

export function getGameMetadata(id: string): GameMetadata | undefined {
  return gameRegistry.find((game) => game.id === id);
}
