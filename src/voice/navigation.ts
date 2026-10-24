export type Destination = "home" | "chess" | "audio" | "help" | "werewolf" | "tic-tac-toe";
export type AvailableDestination = Exclude<Destination, "werewolf" | "tic-tac-toe">;

export function parseDestination(value: unknown): Destination | null {
  switch (value) {
    case "home":
    case "chess":
    case "audio":
    case "help":
    case "werewolf":
    case "tic-tac-toe":
      return value;
    default:
      return null;
  }
}

export const navigationTool = {
  type: "function",
  name: "navigate_app",
  description:
    "Open a game, the game picker, audio settings, or help. Only chess is playable. Leaving an active chess game requires confirmation and saves it for later.",
  parameters: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        enum: ["home", "chess", "audio", "help", "werewolf", "tic-tac-toe"],
      },
    },
    required: ["destination"],
    additionalProperties: false,
  },
  strict: true,
};
