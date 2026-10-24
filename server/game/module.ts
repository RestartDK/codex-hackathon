/** A game module owns its rules and translates them into the shared session API. */
export interface GameModule<State, CreateInput, ActionInput, PublicView> {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  capabilities: { voiceCommands: boolean; undo: boolean };
  parseCreate(input: unknown): CreateInput;
  create(input: CreateInput): State | Promise<State>;
  idOf(state: State): string;
  actorId(state: State): string;
  parseAction(input: unknown): ActionInput;
  parseCommand?(text: string, state: State, actorId: string): ActionInput | Promise<ActionInput>;
  undoAction?(state: State, actorId: string): void | Promise<void>;
  applyAction(state: State, actorId: string, action: ActionInput): void | Promise<void>;
  view(state: State, actorId: string): PublicView;
}

export interface RuntimeGameModule {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  capabilities: { voiceCommands: boolean; undo: boolean };
  parseCreate(input: unknown): unknown;
  create(input: unknown): Promise<unknown>;
  idOf(state: unknown): string;
  actorId(state: unknown): string;
  parseAction(input: unknown): unknown;
  parseCommand?(text: string, state: unknown, actorId: string): Promise<unknown>;
  undoAction?(state: unknown, actorId: string): Promise<void>;
  applyAction(state: unknown, actorId: string, action: unknown): Promise<void>;
  view(state: unknown, actorId: string): unknown;
}

/** Erase module-specific types only at the registry boundary. */
export function eraseGameModule<State, CreateInput, ActionInput, PublicView>(
  module: GameModule<State, CreateInput, ActionInput, PublicView>,
): RuntimeGameModule {
  return {
    id: module.id,
    name: module.name,
    description: module.description,
    minPlayers: module.minPlayers,
    maxPlayers: module.maxPlayers,
    capabilities: module.capabilities,
    parseCreate: (input) => module.parseCreate(input),
    create: async (input) => module.create(input as CreateInput),
    idOf: (state) => module.idOf(state as State),
    actorId: (state) => module.actorId(state as State),
    parseAction: (input) => module.parseAction(input),
    ...(module.parseCommand
      ? {
          parseCommand: async (text: string, state: unknown, actorId: string) =>
            module.parseCommand!(text, state as State, actorId),
        }
      : {}),
    ...(module.undoAction
      ? {
          undoAction: async (state: unknown, actorId: string) =>
            module.undoAction!(state as State, actorId),
        }
      : {}),
    applyAction: async (state, actorId, action) =>
      module.applyAction(state as State, actorId, action as ActionInput),
    view: (state, actorId) => module.view(state as State, actorId),
  };
}
