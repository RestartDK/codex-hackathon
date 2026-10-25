export const CHESS_SETUP_ACTIONS = [
  "read",
  "choose_opponent",
  "choose_difficulty",
  "choose_color",
  "choose_timer",
  "choose_rules",
  "next",
  "back",
  "cancel",
  "start",
  "defaults",
] as const;

export type ChessSetupAction = (typeof CHESS_SETUP_ACTIONS)[number];

export const chessSetupTool = {
  type: "function",
  name: "chess_setup",
  description:
    "Read or change chess setup. read states the current step and choice; choose_* sets one option and advances to the next relevant step; next and back move between steps; cancel leaves setup; start begins the game with the current choices; defaults resets every choice to the defaults and starts immediately. Timed chess is not available, so choose_timer only accepts off.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: CHESS_SETUP_ACTIONS },
      value: { type: ["string", "null"] },
    },
    required: ["action", "value"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export const APP_CONTROL_ACTIONS = ["back", "close", "dismiss_result", "review_result"] as const;

export type AppControlAction = (typeof APP_CONTROL_ACTIONS)[number];

export const appControlTool = {
  type: "function",
  name: "app_control",
  description:
    "Leave the current dialog or page. back returns from Audio Settings or Help to the screen that opened it, steps back through chess setup, and leaves the chessboard; close dismisses the open dialog; dismiss_result closes the finished-game result; review_result closes the result and opens move review.",
  parameters: {
    type: "object",
    properties: { action: { type: "string", enum: APP_CONTROL_ACTIONS } },
    required: ["action"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export function parseAppControl(value: unknown): AppControlAction | null {
  switch (value) {
    case "back":
    case "close":
    case "dismiss_result":
    case "review_result":
      return value;
    default:
      return null;
  }
}
