import type { PublicPlayerView } from "../../server/game/types.js";

export type VillageIntroductionLine = {
  id: string;
  text: string;
  kind: "opening" | "character" | "guidance";
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function publicIntroduction(player: PublicPlayerView): string {
  const source = player.profile.introduction.trim() || player.bio.trim();
  if (!source) return "A member of the village.";
  const repeatedName = new RegExp(
    `^(?:(?:I am|I'm)\\s+)?${escapeRegExp(player.name)}(?:\\s+here)?[.!,:-]*\\s*`,
    "iu",
  );
  return source.replace(repeatedName, "").trim() || source;
}

export function buildVillageIntroduction(
  gameId: string,
  players: readonly PublicPlayerView[],
  viewerId: string,
): VillageIntroductionLine[] {
  if (!players.length) return [];
  const characterLines = players.map((player) => ({
    id: `${gameId}:character:${player.id}`,
    kind: "character" as const,
    text:
      player.id === viewerId
        ? "You are part of this village. Your role remains private."
        : `${player.name}. ${publicIntroduction(player)}`,
  }));
  return [
    {
      id: `${gameId}:introduction-opening`,
      kind: "opening",
      text: "Starting a new village. I will introduce the characters first.",
    },
    ...characterLines,
    {
      id: `${gameId}:introduction-guidance`,
      kind: "guidance",
      text: "Those are the people in your village. Continue to reveal your role, or say repeat introductions to hear them again.",
    },
  ];
}

/**
 * Coordinates a remote spoken sequence without treating the first completed
 * response as completion of the whole village introduction.
 */
export class VillageIntroductionSequence {
  private gameId: string | null = null;
  private lines: VillageIntroductionLine[] = [];
  private index = 0;
  private requestedSession: number | null = null;
  private playbackBaseline = 0;
  private playbackStarted = false;

  start(gameId: string, lines: VillageIntroductionLine[]): boolean {
    if (this.gameId === gameId) return false;
    this.gameId = gameId;
    this.lines = lines;
    this.index = 0;
    this.resetDelivery();
    return true;
  }

  current(): VillageIntroductionLine | null {
    return this.lines[this.index] ?? null;
  }

  request(sessionSequence: number, playbackSequence: number): VillageIntroductionLine | null {
    const line = this.current();
    if (!line || this.requestedSession === sessionSequence) return null;
    this.requestedSession = sessionSequence;
    this.playbackBaseline = playbackSequence;
    this.playbackStarted = false;
    return line;
  }

  requestFailed(sessionSequence: number): void {
    if (this.requestedSession === sessionSequence) this.resetDelivery();
  }

  confirmPlayback(playbackSequence: number): boolean {
    if (this.requestedSession === null || playbackSequence <= this.playbackBaseline) return false;
    this.playbackStarted = true;
    return true;
  }

  finishPlayback(isSpeaking: boolean): boolean {
    if (!this.playbackStarted || isSpeaking) return false;
    this.index += 1;
    this.resetDelivery();
    return true;
  }

  nextCharacter(): VillageIntroductionLine | null {
    if (!this.current()) return null;
    do this.index += 1;
    while (this.current()?.kind === "opening");
    this.resetDelivery();
    return this.current();
  }

  repeat(): VillageIntroductionLine | null {
    const line = this.current();
    if (line) this.resetDelivery();
    return line;
  }

  restartCharacters(): VillageIntroductionLine | null {
    const firstCharacter = this.lines.findIndex((line) => line.kind === "character");
    if (firstCharacter < 0) return null;
    this.index = firstCharacter;
    this.resetDelivery();
    return this.current();
  }

  skip(): void {
    this.index = this.lines.length;
    this.resetDelivery();
  }

  isActive(): boolean {
    return this.current() !== null;
  }

  private resetDelivery(): void {
    this.requestedSession = null;
    this.playbackBaseline = 0;
    this.playbackStarted = false;
  }
}
