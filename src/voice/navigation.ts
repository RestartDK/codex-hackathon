export const PLAYABLE_GAMES = [
  "chess",
  "loups-garous",
  "ludo",
  "intercept",
  "tic-tac-toe",
] as const;

export type PlayableGame = (typeof PLAYABLE_GAMES)[number];

export const AVAILABLE_DESTINATIONS = ["home", "audio", "help", ...PLAYABLE_GAMES] as const;

export type AvailableDestination = (typeof AVAILABLE_DESTINATIONS)[number];

export type Destination = AvailableDestination;

/**
 * Preserve the player's voice intent while moving between independently mounted
 * game experiences. A connecting session is deliberately included: navigation
 * tears that session down, so the destination must start its own replacement.
 */
export function shouldCarryVoiceOnNavigation(
  status: "idle" | "connecting" | "connected" | "closing" | "error",
  voiceEnabled: boolean,
): boolean {
  return status === "connecting" || status === "connected" || voiceEnabled;
}

const GAME_LABELS: Record<PlayableGame, string> = {
  chess: "Chess",
  "loups-garous": "Loups-Garous",
  ludo: "Ludo",
  intercept: "The Intercept",
  "tic-tac-toe": "Tic-Tac-Toe",
};

export const PLAYABLE_GAMES_LABEL = PLAYABLE_GAMES.map((game) => GAME_LABELS[game])
  .join(", ")
  .replace(/, ([^,]+)$/, ", and $1");

export function parseDestination(value: unknown): Destination | null {
  switch (value) {
    case "home":
    case "chess":
    case "audio":
    case "help":
    case "loups-garous":
    case "ludo":
    case "intercept":
    case "tic-tac-toe":
      return value;
    default:
      return null;
  }
}

export const navigationTool = {
  type: "function",
  name: "navigate_app",
  description: `Open a game, the game picker, audio settings, or help. ${PLAYABLE_GAMES_LABEL} are playable. Navigation runs immediately. Leaving an active chess game saves and pauses it for later.`,
  parameters: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        enum: AVAILABLE_DESTINATIONS,
      },
    },
    required: ["destination"],
    additionalProperties: false,
  },
  strict: true,
};
