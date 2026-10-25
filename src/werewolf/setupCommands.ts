export const MIN_VILLAGE = 4;
export const MAX_VILLAGE = 12;

export type WerewolfSetupStage = "village" | "mode";

export type WerewolfSetupCommand =
  | { kind: "open-mode" }
  | { kind: "open-village" }
  | { kind: "set-count"; count: number }
  | { kind: "explain"; enabled: boolean }
  | { kind: "read" }
  | { kind: "back" }
  | { kind: "cancel" }
  | { kind: "start"; quickTest: boolean };

const NUMBER_WORDS: Record<string, number> = {
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function clampVillageCount(count: number): number {
  if (!Number.isFinite(count)) return MIN_VILLAGE;
  return Math.min(MAX_VILLAGE, Math.max(MIN_VILLAGE, Math.round(count)));
}

function requestedCount(command: string): number | null {
  const digits = command.match(/\b(\d{1,2})\b/u);
  if (digits) return clampVillageCount(Number(digits[1]));
  const words = command.split(" ");
  for (const word of words) {
    const value = NUMBER_WORDS[word];
    if (value) return clampVillageCount(value);
  }
  return null;
}

export function parseWerewolfSetupCommand(
  text: string,
  count: number,
): WerewolfSetupCommand | null {
  const command = normalize(text);
  if (!command) return null;
  if (
    /\b(read|hear|describe|what(?:'s| is)|list)\b.*\b(setup|options?|settings?|village size)\b/u.test(
      command,
    ) ||
    /^(setup status|current setup)$/u.test(command)
  )
    return { kind: "read" };
  if (/^(back|go back|previous step)$/u.test(command)) return { kind: "back" };
  if (/^(cancel|never mind|cancel setup|stop setup)$/u.test(command)) return { kind: "cancel" };
  if (/\b(quick|test)\b/u.test(command) && /\b(start|begin|play|try|run)\b/u.test(command))
    return { kind: "start", quickTest: true };
  if (
    /\b(start|begin|launch|create)\b.*\b(game|village|match|defaults?)\b/u.test(command) ||
    /\bstart with (?:the )?defaults?\b/u.test(command) ||
    /^(play|go)$/u.test(command)
  )
    return { kind: "start", quickTest: false };
  if (/\b(explain|explanations?|guided|guidance|tutorial)\b/u.test(command)) {
    if (/\b(off|no|disable|stop|without)\b/u.test(command)) return { kind: "explain", enabled: false };
    if (/\b(on|yes|enable|start|with)\b/u.test(command)) return { kind: "explain", enabled: true };
  }
  if (
    /\b(players?|villagers?|count|size|village)\b/u.test(command) ||
    /^(more|fewer|less|one more|one fewer)$/u.test(command)
  ) {
    if (/\b(more|increase|add)\b/u.test(command))
      return { kind: "set-count", count: clampVillageCount(count + 1) };
    if (/\b(fewer|less|decrease|remove)\b/u.test(command))
      return { kind: "set-count", count: clampVillageCount(count - 1) };
    const value = requestedCount(command);
    if (value !== null) return { kind: "set-count", count: value };
  }
  if (/\b(with friends|friends|multiplayer|other players)\b/u.test(command))
    return { kind: "open-mode" };
  if (/\b(solo|single player|alone|by myself)\b/u.test(command)) return { kind: "open-village" };
  if (
    /\b(open|show|enter|set ?up|choose|start|begin|play)\b.*\b(setup|mode|game|village)\b/u.test(
      command,
    ) ||
    /^(setup|game setup|who do you want to play)$/u.test(command)
  )
    return { kind: "open-mode" };
  return null;
}

export function describeWerewolfSetup(options: {
  stage: WerewolfSetupStage;
  count: number;
  explainGame: boolean;
  roles: ReadonlyArray<{ role: string; total: number }>;
}): string {
  if (options.stage === "mode")
    return "Loups-Garous setup. Who do you want to play? Solo is available; With Friends is coming soon. Say solo, start with the defaults, or start a quick test.";
  const roles = options.roles
    .filter((entry) => entry.total > 0)
    .map((entry) => `${entry.total} ${entry.role}${entry.total === 1 ? "" : "s"}`)
    .join(", ");
  return `Village setup. ${options.count} players: ${roles}. Explain the game as we play is ${
    options.explainGame ? "on" : "off"
  }. Say more players, fewer players, or a number of players; then say start game or start with the defaults. Say back to return to the play mode.`;
}
