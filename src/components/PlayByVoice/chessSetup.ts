import type { Difficulty } from "../../chess/difficulty";
import type { GameMode } from "../../types";

export type ChessSetupColor = "w" | "b" | "random";

export type ChessSetupSelection = {
  gameMode: GameMode;
  difficulty: Difficulty;
  playerColor: "w" | "b";
  timerMinutes: 5 | 10 | null;
  explainRules: boolean;
};

export type ChessSetupDraft = {
  gameMode: GameMode;
  difficulty: Difficulty;
  color: ChessSetupColor;
  timerMinutes: 5 | 10 | null;
  explainRules: boolean;
};

export const CHESS_SETUP_STEPS = ["opponent", "difficulty", "color", "timer", "rules"] as const;

export type ChessSetupStep = (typeof CHESS_SETUP_STEPS)[number];

export type ChessSetupState = {
  draft: ChessSetupDraft;
  step: ChessSetupStep;
  ready: boolean;
};

export const CHESS_SETUP_DIFFICULTIES = [
  {
    difficulty: "beginner",
    label: "Beginner",
    description: "A gentle pace while you learn the board.",
  },
  {
    difficulty: "casual",
    label: "Intermediate",
    description: "A balanced opponent with tactical awareness.",
  },
  {
    difficulty: "club",
    label: "Advanced",
    description: "A stronger opponent with more thinking time.",
  },
] as const satisfies ReadonlyArray<{
  difficulty: Difficulty;
  label: string;
  description: string;
}>;

export function difficultyLabel(difficulty: Difficulty): string {
  return (
    CHESS_SETUP_DIFFICULTIES.find((option) => option.difficulty === difficulty)?.label ??
    `${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}`
  );
}

export type ChessSetupCommand =
  | { kind: "choose-opponent"; gameMode: GameMode }
  | { kind: "choose-difficulty"; difficulty: Difficulty }
  | { kind: "choose-color"; color: ChessSetupColor }
  | { kind: "choose-timer"; minutes: 5 | 10 | null }
  | { kind: "choose-rules"; explainRules: boolean }
  | { kind: "next" }
  | { kind: "back" }
  | { kind: "cancel" }
  | { kind: "start" }
  | { kind: "defaults" };

export type ChessSetupEffect = "none" | "cancel" | "start";

export type ChessSetupOutcome = {
  state: ChessSetupState;
  effect: ChessSetupEffect;
};

export function defaultChessSetup(): ChessSetupState {
  return {
    draft: {
      gameMode: "computer",
      difficulty: "beginner",
      color: "w",
      timerMinutes: null,
      explainRules: false,
    },
    step: "opponent",
    ready: false,
  };
}

function stepAfter(step: ChessSetupStep): ChessSetupState["step"] | null {
  const index = CHESS_SETUP_STEPS.indexOf(step);
  return CHESS_SETUP_STEPS[index + 1] ?? null;
}

function advance(
  state: ChessSetupState,
  chosen: ChessSetupStep,
): Pick<ChessSetupState, "step" | "ready"> {
  const current = CHESS_SETUP_STEPS.indexOf(state.step);
  if (CHESS_SETUP_STEPS.indexOf(chosen) < current)
    return state.ready ? { step: "rules", ready: true } : { step: state.step, ready: false };
  const next = stepAfter(chosen);
  return next ? { step: next, ready: false } : { step: "rules", ready: true };
}

export function reduceChessSetup(
  state: ChessSetupState,
  command: ChessSetupCommand,
): ChessSetupOutcome {
  const unchanged: ChessSetupOutcome = { state, effect: "none" };
  switch (command.kind) {
    case "choose-opponent":
      return {
        state: {
          ...state,
          draft: { ...state.draft, gameMode: command.gameMode },
          ...advance(state, "opponent"),
        },
        effect: "none",
      };
    case "choose-difficulty":
      return {
        state: {
          ...state,
          draft: { ...state.draft, difficulty: command.difficulty },
          ...advance(state, "difficulty"),
        },
        effect: "none",
      };
    case "choose-color":
      return {
        state: {
          ...state,
          draft: { ...state.draft, color: command.color },
          ...advance(state, "color"),
        },
        effect: "none",
      };
    case "choose-timer":
      return {
        state: {
          ...state,
          draft: { ...state.draft, timerMinutes: command.minutes },
          ...advance(state, "timer"),
        },
        effect: "none",
      };
    case "choose-rules":
      return {
        state: {
          ...state,
          draft: { ...state.draft, explainRules: command.explainRules },
          ...advance(state, "rules"),
        },
        effect: "none",
      };
    case "next": {
      if (state.ready) return unchanged;
      const next = stepAfter(state.step);
      return next
        ? { state: { ...state, step: next }, effect: "none" }
        : { state: { ...state, ready: true }, effect: "none" };
    }
    case "back": {
      if (state.ready) return { state: { ...state, ready: false }, effect: "none" };
      const index = CHESS_SETUP_STEPS.indexOf(state.step);
      if (index > 0) return { state: { ...state, step: CHESS_SETUP_STEPS[index - 1] }, effect: "none" };
      return { state, effect: "cancel" };
    }
    case "cancel":
      return { state, effect: "cancel" };
    case "start":
      return { state: { ...state, ready: true }, effect: "start" };
    case "defaults":
      return { state: { ...defaultChessSetup(), ready: true }, effect: "start" };
  }
}

export type ChessSetupToolResult =
  | { ok: true; command: ChessSetupCommand }
  | { ok: false; message: string };

function parseSetupColor(value: string): ChessSetupColor | null {
  switch (value) {
    case "white":
    case "w":
      return "w";
    case "black":
    case "b":
      return "b";
    case "random":
    case "either":
      return "random";
    default:
      return null;
  }
}

function parseSetupDifficulty(value: string): Difficulty | null {
  const option = CHESS_SETUP_DIFFICULTIES.find(
    (entry) =>
      entry.difficulty === value || entry.label.toLocaleLowerCase() === value.toLocaleLowerCase(),
  );
  if (option) return option.difficulty;
  switch (value) {
    case "expert":
    case "nightmare":
      return value;
    default:
      return null;
  }
}

function parseSetupGameMode(value: string): GameMode | null {
  switch (value) {
    case "computer":
    case "the computer":
    case "solo":
      return "computer";
    case "local":
    case "player":
    case "two player":
    case "another player":
      return "local";
    default:
      return null;
  }
}

export function parseChessSetupCommand(action: string, rawValue: unknown): ChessSetupToolResult {
  const value = typeof rawValue === "string" ? rawValue.trim().toLocaleLowerCase() : "";
  switch (action) {
    case "next":
      return { ok: true, command: { kind: "next" } };
    case "back":
      return { ok: true, command: { kind: "back" } };
    case "cancel":
      return { ok: true, command: { kind: "cancel" } };
    case "start":
      return { ok: true, command: { kind: "start" } };
    case "defaults":
      return { ok: true, command: { kind: "defaults" } };
    case "choose_opponent": {
      const gameMode = parseSetupGameMode(value);
      return gameMode
        ? { ok: true, command: { kind: "choose-opponent", gameMode } }
        : { ok: false, message: "Choose the computer or another player." };
    }
    case "choose_difficulty": {
      const difficulty = parseSetupDifficulty(value);
      return difficulty
        ? { ok: true, command: { kind: "choose-difficulty", difficulty } }
        : { ok: false, message: "Choose Beginner, Intermediate, or Advanced." };
    }
    case "choose_color": {
      const color = parseSetupColor(value);
      return color
        ? { ok: true, command: { kind: "choose-color", color } }
        : { ok: false, message: "Choose White, Black, or Random." };
    }
    case "choose_timer":
      if (value === "off" || value === "no timer" || value === "")
        return { ok: true, command: { kind: "choose-timer", minutes: null } };
      return { ok: false, message: "Timed games are not available yet. Say timer off." };
    case "choose_rules":
      if (["on", "yes", "true"].includes(value))
        return { ok: true, command: { kind: "choose-rules", explainRules: true } };
      if (["off", "no", "false"].includes(value))
        return { ok: true, command: { kind: "choose-rules", explainRules: false } };
      return { ok: false, message: "Say rules on or rules off." };
    default:
      return { ok: false, message: "That chess setup action is not available." };
  }
}

export function resolveChessSetupColor(color: ChessSetupColor): "w" | "b" {
  if (color !== "random") return color;
  return Math.random() < 0.5 ? "w" : "b";
}

export function chessSetupSelection(state: ChessSetupState): ChessSetupSelection {
  return {
    gameMode: state.draft.gameMode,
    difficulty: state.draft.difficulty,
    playerColor: resolveChessSetupColor(state.draft.color),
    timerMinutes: state.draft.timerMinutes,
    explainRules: state.draft.explainRules,
  };
}

function stepSummary(state: ChessSetupState): string {
  const { draft } = state;
  switch (state.step) {
    case "opponent":
      return `Current opponent: ${draft.gameMode === "computer" ? "Computer" : "another player"}.`;
    case "difficulty":
      return `Current difficulty: ${difficultyLabel(draft.difficulty)}.`;
    case "color":
      return `Current pieces: ${
        draft.color === "random" ? "Random" : draft.color === "w" ? "White" : "Black"
      }.`;
    case "timer":
      return `Current timer: ${draft.timerMinutes === null ? "off" : `${draft.timerMinutes} minutes`}.`;
    case "rules":
      return `Explain the rules before starting: ${draft.explainRules ? "on" : "off"}.`;
  }
}

const STEP_PROMPTS: Record<ChessSetupStep, string> = {
  opponent: "Choose your opponent.",
  difficulty: "Choose your difficulty: Beginner, Intermediate, or Advanced.",
  color: "Choose your pieces: White, Black, or Random.",
  timer: "Set a timer. Say timer off.",
  rules: "Explain the rules before starting. Say rules on or rules off.",
};

export function describeChessSetup(state: ChessSetupState): string {
  if (state.ready)
    return `Chess setup is complete. ${stepSummary(state)} Say start game, back, or cancel.`;
  const position = CHESS_SETUP_STEPS.indexOf(state.step) + 1;
  return `Chess setup, step ${position} of ${CHESS_SETUP_STEPS.length}. ${STEP_PROMPTS[state.step]} ${stepSummary(state)}`;
}
