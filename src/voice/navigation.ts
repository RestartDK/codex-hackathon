export const PLAYABLE_GAMES = ["chess", "loups-garous"] as const;

export type PlayableGame = (typeof PLAYABLE_GAMES)[number];

export const AVAILABLE_DESTINATIONS = ["home", "audio", "help", ...PLAYABLE_GAMES] as const;

export type AvailableDestination = (typeof AVAILABLE_DESTINATIONS)[number];

export type Destination = AvailableDestination | "tic-tac-toe";

export const PLAYABLE_GAMES_LABEL = "Chess and Loups-Garous";

export function parseDestination(value: unknown): Destination | null {
  switch (value) {
    case "home":
    case "chess":
    case "audio":
    case "help":
    case "loups-garous":
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
