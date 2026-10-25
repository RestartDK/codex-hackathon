import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Game } from "./types.js";

export interface GameRecord {
  id: string;
  gameType: string;
  state: unknown;
}

export interface GameRepository {
  get(id: string): GameRecord | undefined;
  save(record: GameRecord): void;
}

/** Default local adapter; replace this implementation with a durable repository for deployment. */
export class InMemoryGameRepository implements GameRepository {
  private readonly records = new Map<string, GameRecord>();

  get(id: string) {
    return this.records.get(id);
  }

  save(record: GameRecord) {
    this.records.set(record.id, record);
  }
}

const games: GameRepository = new InMemoryGameRepository();
const sessions = new Map<string, string>();
const locks = new Set<string>();
const receipts = new Map<string, Map<string, unknown>>();
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export const getGameRecord = (id: string) => games.get(id);
export const saveGameRecord = (record: GameRecord) => {
  games.save(record);
  return record;
};
export const getGame = (id: string) => games.get(id)?.state as Game | undefined;
export const saveGame = (game: Game, gameType = "loups-garous") => {
  games.save({ id: game.id, gameType, state: game });
  return game;
};
export function createSession(gameId: string) {
  const token = randomBytes(32).toString("base64url");
  sessions.set(gameId, digest(token));
  return token;
}
export function authorize(gameId: string, token: string | null) {
  if (!token) return false;
  const expected = sessions.get(gameId);
  if (!expected) return false;
  const actual = digest(token);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}
export function acquireGameLock(id: string) {
  if (locks.has(id)) return undefined;
  locks.add(id);
  return () => locks.delete(id);
}
export function getReceipt(gameId: string, requestId: string) {
  return receipts.get(gameId)?.get(requestId);
}
export function saveReceipt(gameId: string, requestId: string, result: unknown) {
  let entries = receipts.get(gameId);
  if (!entries) {
    entries = new Map();
    receipts.set(gameId, entries);
  }
  entries.set(requestId, result);
  if (entries.size > 100) entries.delete(entries.keys().next().value!);
}
