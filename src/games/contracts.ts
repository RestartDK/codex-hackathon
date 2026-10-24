import type { GameId } from './registry';

export interface GameEvent<TPayload = unknown> {
  id: string;
  gameId: GameId;
  sessionId: string;
  revision: number;
  actor: 'human' | 'computer' | 'system';
  type: string;
  payload: TPayload;
}

export interface GameSnapshot<TState = unknown> {
  gameId: GameId;
  sessionId: string;
  revision: number;
  status: 'ready' | 'paused' | 'finished';
  state: TState;
  availableActions: readonly string[];
}

/** Shared controller boundary used by the library shell. Rules remain game-specific. */
export interface GameController<TState = unknown, TCommand = unknown> {
  getSnapshot(): GameSnapshot<TState>;
  execute(command: TCommand): { ok: boolean; message: string };
  subscribe(listener: (snapshot: GameSnapshot<TState>) => void): () => void;
  dispose(): void;
}
