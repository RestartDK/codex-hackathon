export type LudoPlayer = "human" | "computer";
export type LudoColor = "red" | "yellow";
export type LudoPhase =
  | "awaiting-roll"
  | "awaiting-token"
  | "awaiting-confirmation"
  | "awaiting-continue"
  | "computer-turn"
  | "finished";
export type TokenProgress = -1 | number;

export interface LudoToken {
  id: number;
  progress: TokenProgress;
}

export interface LudoMove {
  player: LudoPlayer;
  color: LudoColor;
  tokenId: number;
  roll: number;
  from: TokenProgress;
  to: TokenProgress;
  captured: number[];
  finished: boolean;
  entered: boolean;
}

export interface LudoState {
  version: 1;
  activePlayer: LudoPlayer;
  phase: LudoPhase;
  tokens: Record<LudoPlayer, LudoToken[]>;
  currentRoll: number | null;
  lastRoll: { player: LudoPlayer; value: number } | null;
  sixStreak: number;
  history: LudoMove[];
  result: LudoPlayer | null;
  revision: number;
  lastMoveRevision?: number;
  correction: { state: LudoState; move: LudoMove } | null;
}

export interface LudoRandom {
  nextDie: () => number;
}

const START: Record<LudoPlayer, number> = { human: 0, computer: 26 };
const COLORS: Record<LudoPlayer, LudoColor> = { human: "red", computer: "yellow" };
const TRACK_LENGTH = 52;
const FINAL_PROGRESS = 57;
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function createLudoState(): LudoState {
  return {
    version: 1,
    activePlayer: "human",
    phase: "awaiting-roll",
    tokens: { human: makeTokens(), computer: makeTokens() },
    currentRoll: null,
    lastRoll: null,
    sixStreak: 0,
    history: [],
    result: null,
    revision: 0,
    correction: null,
  };
}

function makeTokens(): LudoToken[] {
  return [1, 2, 3, 4].map((id) => ({ id, progress: -1 }));
}

export function cloneLudoState(state: LudoState): LudoState {
  return structuredClone(state);
}

export function colorFor(player: LudoPlayer): LudoColor {
  return COLORS[player];
}

export function absoluteSquare(player: LudoPlayer, progress: number): number | null {
  if (progress < 0 || progress > 51) return null;
  return (START[player] + progress) % TRACK_LENGTH;
}

export function isSafeSquare(square: number): boolean {
  return SAFE_SQUARES.has(square);
}

export function tokenLabel(player: LudoPlayer, tokenId: number): string {
  return `${player === "human" ? "your" : "the computer's"} token ${tokenId}`;
}

export function tokenCanMove(
  state: LudoState,
  player: LudoPlayer,
  tokenId: number,
  roll = state.currentRoll,
): boolean {
  if (roll == null || roll < 1 || roll > 6) return false;
  const token = state.tokens[player].find((item) => item.id === tokenId);
  if (!token || token.progress === FINAL_PROGRESS) return false;
  if (token.progress === -1) return roll === 6;
  return token.progress + roll <= FINAL_PROGRESS;
}

export function legalTokenIds(state: LudoState, player: LudoPlayer = state.activePlayer): number[] {
  return state.tokens[player]
    .filter((token) => tokenCanMove(state, player, token.id))
    .map((token) => token.id);
}

function nextPlayer(player: LudoPlayer): LudoPlayer {
  return player === "human" ? "computer" : "human";
}

function finishRoll(state: LudoState, roll: number): void {
  state.lastRoll = { player: state.activePlayer, value: roll };
  state.currentRoll = roll;
  state.revision += 1;
  if (roll === 6) {
    state.sixStreak += 1;
    if (state.sixStreak >= 3) {
      state.currentRoll = null;
      state.sixStreak = 0;
      state.activePlayer = nextPlayer(state.activePlayer);
      state.phase = "awaiting-roll";
      state.revision += 1;
      return;
    }
  } else {
    state.sixStreak = 0;
  }
  state.phase = legalTokenIds(state).length > 0 ? "awaiting-token" : "awaiting-roll";
  if (state.phase === "awaiting-roll" && roll !== 6)
    state.activePlayer = nextPlayer(state.activePlayer);
}

export function roll(
  state: LudoState,
  random: LudoRandom,
): { ok: true; roll: number; message: string } | { ok: false; message: string } {
  if (state.result) return { ok: false, message: "The game is already over." };
  if (state.phase === "computer-turn" && state.activePlayer === "computer")
    state.phase = "awaiting-roll";
  if (state.phase !== "awaiting-roll")
    return { ok: false, message: "The die is already rolled. Choose a token first." };
  const value = random.nextDie();
  if (!Number.isInteger(value) || value < 1 || value > 6)
    return { ok: false, message: "The dice source returned an invalid result." };
  const player = state.activePlayer;
  // Starting the next roll closes the correction window for the previous move.
  state.correction = null;
  finishRoll(state, value);
  if (state.phase === "awaiting-roll" && value === 6) {
    return {
      ok: true,
      roll: value,
      message: `${player} rolled a six but has no legal move. Roll again.`,
    };
  }
  if (state.phase === "awaiting-roll")
    return {
      ok: true,
      roll: value,
      message: `${player} rolled ${value}. There is no legal move; the turn passes.`,
    };
  if (state.phase === "awaiting-token")
    return {
      ok: true,
      roll: value,
      message: `${player} rolled ${value}. Choose token ${legalTokenIds(state).join(", ")}.`,
    };
  return { ok: true, roll: value, message: `${player} rolled three sixes. The turn passes.` };
}

function captureTargets(state: LudoState, player: LudoPlayer, to: number): number[] {
  const square = absoluteSquare(player, to);
  if (square == null || isSafeSquare(square)) return [];
  const other = nextPlayer(player);
  return state.tokens[other]
    .filter((token) => absoluteSquare(other, token.progress) === square)
    .map((token) => token.id);
}

function progressForSquare(player: LudoPlayer, square: number): number {
  return (square - START[player] + TRACK_LENGTH) % TRACK_LENGTH;
}

/** Reports whether an opponent could capture this token with one ordinary roll. */
export function isTokenThreatened(state: LudoState, player: LudoPlayer, progress: number): boolean {
  const square = absoluteSquare(player, progress);
  if (square == null || isSafeSquare(square)) return false;
  const opponent = nextPlayer(player);
  const opponentTargetProgress = progressForSquare(opponent, square);
  return state.tokens[opponent].some((token) => {
    if (token.progress < 0 || token.progress > 51) return false;
    const distance = opponentTargetProgress - token.progress;
    return distance >= 1 && distance <= 6;
  });
}

export function chooseToken(
  state: LudoState,
  tokenId: number,
): { ok: true; move: LudoMove; message: string } | { ok: false; message: string } {
  const player = state.activePlayer;
  const rollValue = state.currentRoll;
  if (state.result) return { ok: false, message: "The game is already over." };
  if (state.phase !== "awaiting-token" || rollValue == null)
    return { ok: false, message: "Roll the die before choosing a token." };
  if (!tokenCanMove(state, player, tokenId, rollValue)) {
    return { ok: false, message: `${tokenLabel(player, tokenId)} cannot move by ${rollValue}.` };
  }
  const token = state.tokens[player].find((item) => item.id === tokenId)!;
  const before = cloneLudoState(state);
  const from = token.progress;
  const to = from === -1 ? 0 : from + rollValue;
  token.progress = to;
  const captured = captureTargets(state, player, to);
  for (const capturedId of captured) {
    const target = state.tokens[nextPlayer(player)].find((item) => item.id === capturedId);
    if (target) target.progress = -1;
  }
  const move: LudoMove = {
    player,
    color: colorFor(player),
    tokenId,
    roll: rollValue,
    from,
    to,
    captured,
    finished: to === FINAL_PROGRESS,
    entered: from === -1,
  };
  state.history.push(move);
  state.currentRoll = null;
  state.revision += 1;
  state.lastMoveRevision = state.revision;
  if (state.tokens[player].every((item) => item.progress === FINAL_PROGRESS)) {
    state.result = player;
    state.phase = "finished";
    state.correction = { state: before, move };
  } else {
    const bonus = rollValue === 6 || captured.length > 0 || move.finished;
    state.phase = bonus
      ? player === "human"
        ? "awaiting-roll"
        : "computer-turn"
      : player === "human"
        ? "awaiting-continue"
        : "awaiting-roll";
    if (!bonus) state.activePlayer = nextPlayer(player);
    state.correction = player === "human" ? { state: before, move } : null;
  }
  const effects = [
    move.entered ? "entered the track" : `moved ${rollValue} spaces`,
    captured.length ? `captured token ${captured.join(" and token ")}` : "",
    move.finished ? "reached home" : "",
  ].filter(Boolean);
  return { ok: true, move, message: `${tokenLabel(player, tokenId)} ${effects.join(", ")}.` };
}

export function continueTurn(
  state: LudoState,
): { ok: true; message: string } | { ok: false; message: string } {
  if (state.result) return { ok: false, message: "The game is already over." };
  if (state.phase !== "awaiting-continue")
    return { ok: false, message: "There is no waiting turn to continue." };
  state.correction = null;
  // chooseToken already handed activePlayer to the opponent. The correction
  // window delays that turn; it must not switch the player a second time.
  state.phase = state.activePlayer === "human" ? "awaiting-roll" : "computer-turn";
  state.revision += 1;
  return { ok: true, message: `Continue. ${state.activePlayer} to roll.` };
}

export function correctLastMove(
  state: LudoState,
): { ok: true; message: string } | { ok: false; message: string } {
  if (!state.correction) return { ok: false, message: "The last move can no longer be corrected." };
  const checkpoint = state.correction.state;
  const restored = cloneLudoState(checkpoint);
  Object.assign(state, restored);
  state.phase = "awaiting-token";
  state.revision += 1;
  return {
    ok: true,
    message: "The last token move was corrected. Choose another token using the same roll.",
  };
}

export interface LudoMoveChoice {
  tokenId: number;
  score: number;
  reason: "finish" | "capture" | "escape" | "safe-square" | "home-lane" | "enter" | "advance";
}

/**
 * Rank legal moves using a deterministic version of the useful opponent ideas:
 * finish, capture, rescue threatened tokens, prefer safe squares, enter on six,
 * then advance. Stable tie-breaking keeps saves and narration reproducible.
 */
export function rankStrategicMoves(
  state: LudoState,
  player: LudoPlayer = state.activePlayer,
): LudoMoveChoice[] {
  if (state.currentRoll == null) return [];
  return legalTokenIds(state, player)
    .map((tokenId) => {
      const token = state.tokens[player].find((item) => item.id === tokenId)!;
      const target = token.progress === -1 ? 0 : token.progress + state.currentRoll!;
      const captures = captureTargets(state, player, target).length;
      const targetSquare = absoluteSquare(player, target);
      const targetIsSafe = targetSquare != null && isSafeSquare(targetSquare);
      const escapesDanger =
        isTokenThreatened(state, player, token.progress) &&
        !isTokenThreatened(state, player, target);
      const landsInDanger = isTokenThreatened(state, player, target);

      let reason: LudoMoveChoice["reason"] = "advance";
      let score = target;
      if (token.progress === -1) {
        reason = "enter";
        score = 20_000 + target;
      }
      if (target > 51) {
        reason = "home-lane";
        score = 30_000 + target;
      }
      if (targetIsSafe) {
        reason = "safe-square";
        score = 40_000 + target;
      }
      if (escapesDanger) {
        reason = "escape";
        score = 60_000 + target;
      }
      if (captures > 0) {
        reason = "capture";
        score = 80_000 + captures * 1_000 + target;
      }
      if (target === FINAL_PROGRESS) {
        reason = "finish";
        score = 100_000 + target;
      }
      if (landsInDanger && captures === 0) score -= 15_000;
      return { tokenId, score, reason };
    })
    .sort((a, b) => b.score - a.score || a.tokenId - b.tokenId);
}

export function chooseStrategicToken(
  state: LudoState,
  player: LudoPlayer = state.activePlayer,
): number | null {
  return rankStrategicMoves(state, player)[0]?.tokenId ?? null;
}

export function chooseComputerToken(state: LudoState): number | null {
  return chooseStrategicToken(state, "computer");
}

export function describeToken(state: LudoState, player: LudoPlayer, tokenId: number): string {
  const token = state.tokens[player].find((item) => item.id === tokenId);
  if (!token) return `${tokenLabel(player, tokenId)} does not exist.`;
  if (token.progress === -1) return `${tokenLabel(player, tokenId)} is in base.`;
  if (token.progress === FINAL_PROGRESS) return `${tokenLabel(player, tokenId)} is home.`;
  if (token.progress > 51)
    return `${tokenLabel(player, tokenId)} is in the home lane, ${FINAL_PROGRESS - token.progress} spaces from home.`;
  const square = absoluteSquare(player, token.progress);
  return `${tokenLabel(player, tokenId)} is ${token.progress} spaces along the track on square ${square},${isSafeSquare(square!) ? " safe" : " unsafe"}.`;
}

export function describeLudoPosition(state: LudoState): string {
  const owner = state.activePlayer === "human" ? "Your turn" : "Computer's turn";
  const turn = state.result
    ? `${state.result === "human" ? "You win" : "Computer wins"}.`
    : `${owner}.`;
  const die = state.lastRoll
    ? `${state.lastRoll.player === "human" ? "You" : "The computer"} last rolled ${state.lastRoll.value}.`
    : "No roll yet.";
  const tokens = (["human", "computer"] as const).flatMap((player) =>
    state.tokens[player].map((token) => describeToken(state, player, token.id)),
  );
  return `${turn} You are red; the computer is yellow. ${die} ${tokens.join(" ")}`;
}

export function serializeLudo(state: LudoState): string {
  return JSON.stringify({ version: 1, state });
}

export function deserializeLudo(raw: string): LudoState | null {
  try {
    const parsed = JSON.parse(raw) as { version?: number; state?: LudoState };
    if (parsed.version !== 1 || !parsed.state || parsed.state.version !== 1) return null;
    const state = parsed.state;
    if (!["human", "computer"].includes(state.activePlayer) || !Array.isArray(state.history))
      return null;
    if (state.tokens.human.length !== 4 || state.tokens.computer.length !== 4) return null;
    state.lastRoll ??= null;
    return cloneLudoState(state);
  } catch {
    return null;
  }
}

export const LUDO_RULES_VERSION = "classic-two-player-v1";
export const ludoConstants = { FINAL_PROGRESS, SAFE_SQUARES } as const;

