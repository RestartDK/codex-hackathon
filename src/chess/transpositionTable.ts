const TT_SIZE = 1 << 19;

export const NodeType = {
  Exact: 0,
  LowerBound: 1,
  UpperBound: 2,
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface TTEntry {
  key: number;
  fen: string;
  depth: number;
  score: number;
  nodeType: NodeType;
  bestFrom?: string;
  bestTo?: string;
  bestPromotion?: string;
  age: number;
}

export class TranspositionTable {
  private entries: (TTEntry | null)[];
  private age: number = 0;

  constructor() {
    this.entries = new Array(TT_SIZE).fill(null);
  }

  hashFen(fen: string): number {
    const relevant = this.getRelevantPart(fen);
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < relevant.length; i++) {
      hash ^= relevant.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  getRelevantPart(fen: string): string {
    const parts = fen.split(" ");
    return parts.slice(0, 4).join(" ");
  }

  private index(key: number): number {
    return key & (TT_SIZE - 1);
  }

  store(
    fen: string,
    depth: number,
    score: number,
    nodeType: NodeType,
    bestMove?: { from: string; to: string; promotion?: string },
  ): void {
    const key = this.hashFen(fen);
    const idx = this.index(key);
    const relevantFen = this.getRelevantPart(fen);

    const existing = this.entries[idx];
    if (existing) {
      if (existing.fen !== relevantFen) {
        // Hash collision — replace regardless
      } else if (existing.depth > depth && existing.age >= this.age - 1) {
        return;
      }
    }

    this.entries[idx] = {
      key,
      fen: relevantFen,
      depth,
      score,
      nodeType,
      age: this.age,
      bestFrom: bestMove?.from,
      bestTo: bestMove?.to,
      bestPromotion: bestMove?.promotion,
    };
  }

  probe(fen: string, requiredDepth: number): TTEntry | null {
    const key = this.hashFen(fen);
    const idx = this.index(key);
    const entry = this.entries[idx];

    if (!entry) return null;

    if (entry.key !== key) return null;
    if (entry.fen !== this.getRelevantPart(fen)) return null;
    if (entry.depth < requiredDepth) return null;

    return entry;
  }

  getBestMove(fen: string): { from: string; to: string; promotion?: string } | null {
    const key = this.hashFen(fen);
    const idx = this.index(key);
    const entry = this.entries[idx];

    if (!entry || entry.key !== key) return null;
    if (entry.fen !== this.getRelevantPart(fen)) return null;
    if (!entry.bestFrom || !entry.bestTo) return null;

    return {
      from: entry.bestFrom,
      to: entry.bestTo,
      promotion: entry.bestPromotion,
    };
  }

  newIteration(): void {
    this.age++;
  }

  clear(): void {
    this.entries.fill(null);
    this.age = 0;
  }

  get size(): number {
    let count = 0;
    for (const e of this.entries) {
      if (e) count++;
    }
    return count;
  }
}
