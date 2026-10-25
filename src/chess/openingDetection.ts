const OPENINGS: [string, ...string[]][] = [
  ["Sicilian Defense", "e2e4", "c7c5"],

  ["French Defense", "e2e4", "e7e6"],

  ["Caro-Kann Defense", "e2e4", "c7c6"],

  ["Queen's Gambit", "d2d4", "d7d5", "c2c4"],

  ["London System", "d2d4", "g1f3", "c1f4"],

  ["King's Indian Defense", "d2d4", "g8f6", "c2c4", "g7g6"],

  ["Italian Game", "e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],

  ["Ruy Lopez", "e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],

  ["Scotch Game", "e2e4", "e7e5", "g1f3", "b8c6", "d2d4"],

  ["Petrov Defense", "e2e4", "e7e5", "g1f3", "g8f6"],
];

export function detectOpening(history: string[]): string | null {
  if (history.length < 2) return null;

  const londonResult = detectLondonSystem(history);
  if (londonResult) return londonResult;

  let bestMatch: string | null = null;
  let bestLength = 0;

  for (const [name, ...moves] of OPENINGS) {
    if (name === "London System") continue;

    const prefix = moves.slice(0, history.length);
    if (prefix.length >= 2 && prefix.length > bestLength) {
      const matches = moves.every((m, i) => i < history.length && m === history[i]);
      if (matches && prefix.length > bestLength) {
        bestMatch = name;
        bestLength = prefix.length;
      }
    }
  }

  return bestMatch;
}

function detectLondonSystem(history: string[]): string | null {
  if (history.length < 5) return null;

  const whiteMoves: string[] = [];
  for (let i = 0; i < history.length && i < 5; i += 2) {
    whiteMoves.push(history[i]);
  }

  if (whiteMoves.length < 3) return null;

  const needs = new Set(["d2d4", "g1f3", "c1f4"]);
  const has = new Set(whiteMoves);

  let allPresent = true;
  for (const m of needs) {
    if (!has.has(m)) {
      allPresent = false;
      break;
    }
  }

  return allPresent ? "London System" : null;
}
