export type OpeningLine = string[];

const OPENINGS: [string, ...OpeningLine][] = [
  ["Italian Game: Main Line", "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"],
  ["Italian Game: Giuoco Piano", "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"],
  ["Italian Game: Two Knights Defense", "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"],
  ["Ruy Lopez: Main Line", "e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"],
  ["Ruy Lopez: Morphy Defense", "e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6"],
  ["Ruy Lopez: Exchange Variation", "e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5c6"],
  ["Scotch Game", "e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4"],
  ["Petrov Defense", "e2e4", "e7e5", "g1f3", "g8f6"],
  ["Philidor Defense", "e2e4", "e7e5", "g1f3", "d7d6"],
  ["King's Gambit: Accepted", "e2e4", "e7e5", "f2f4", "e5f4"],
  ["King's Gambit: Declined", "e2e4", "e7e5", "f2f4", "d7d5"],
  ["Vienna Game", "e2e4", "e7e5", "b1c3"],

  ["Sicilian Defense: Open", "e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4"],
  [
    "Sicilian Defense: Najdorf",
    "e2e4",
    "c7c5",
    "g1f3",
    "d7d6",
    "d2d4",
    "c5d4",
    "f3d4",
    "g8f6",
    "b1c3",
    "a7a6",
  ],
  [
    "Sicilian Defense: Dragon",
    "e2e4",
    "c7c5",
    "g1f3",
    "d7d6",
    "d2d4",
    "c5d4",
    "f3d4",
    "g8f6",
    "b1c3",
    "g7g6",
  ],

  ["French Defense: Advance", "e2e4", "e7e6", "d2d4", "d7d5", "e4e5"],
  ["French Defense: Tarrasch", "e2e4", "e7e6", "d2d4", "d7d5", "b1d2"],
  ["French Defense: Winawer", "e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "f8b4"],

  ["Caro-Kann Defense: Classical", "e2e4", "c7c6", "d2d4", "d7d5", "b1c3", "d5e4", "c3e4", "c8f5"],
  ["Caro-Kann Defense: Advance", "e2e4", "c7c6", "d2d4", "d7d5", "e4e5"],

  ["Pirc Defense", "e2e4", "d7d6", "d2d4", "g8f6", "b1c3", "g7g6"],

  ["Queen's Gambit: Accepted", "d2d4", "d7d5", "c2c4", "d5c4"],
  ["Queen's Gambit: Declined", "d2d4", "d7d5", "c2c4", "e7e6"],
  ["Queen's Gambit: Slav Defense", "d2d4", "d7d5", "c2c4", "c7c6"],
  ["Queen's Gambit: Semi-Slav", "d2d4", "d7d5", "c2c4", "c7c6", "b1c3", "e7e6"],
  ["Queen's Gambit: Exchange", "d2d4", "d7d5", "c2c4", "e7e6", "c4d5"],

  ["King's Indian Defense", "d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7"],
  ["King's Indian: Classical", "d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6"],
  ["Grünfeld Defense", "d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5"],
  ["Nimzo-Indian Defense", "d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"],
  ["Queen's Indian Defense", "d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6"],
  ["Bogo-Indian Defense", "d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "f8b4"],

  ["English Opening", "c2c4"],
  ["English: Symmetrical", "c2c4", "c7c5"],

  ["Dutch Defense", "d2d4", "f7f5"],
  ["Benoni Defense", "d2d4", "c7c5"],
];

export class OpeningBook {
  private lines: [string, ...OpeningLine][];

  constructor(openings: [string, ...OpeningLine][] = OPENINGS) {
    this.lines = openings;
  }

  lookup(history: string[]): string[] {
    const candidates: Set<string> = new Set();

    for (const [, ...line] of this.lines) {
      if (history.length >= line.length) continue;

      const matches = history.every((m, i) => m === line[i]);
      if (matches) {
        candidates.add(line[history.length]);
      }
    }

    return [...candidates];
  }

  getBookMove(history: string[]): string | null {
    const candidates = this.lookup(history);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  bookDepth(history: string[]): number {
    let maxDepth = 0;
    for (const [, ...line] of this.lines) {
      if (history.length >= line.length) continue;
      const matches = history.every((m, i) => m === line[i]);
      if (matches) {
        maxDepth = Math.max(maxDepth, line.length - history.length);
      }
    }
    return maxDepth;
  }

  get lineCount(): number {
    return this.lines.length;
  }
}

export const openingBook = new OpeningBook();
