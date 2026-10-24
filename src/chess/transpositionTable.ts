/**
 * Transposition table for the chess engine.
 *
 * Uses FNV-1a hashing on the relevant FEN part (position + castling + en passant)
 * for fast key generation. Collision verification is done by storing the full
 * FEN string alongside the key.
 *
 * Size: 524288 entries (~4-8MB depending on slot overhead), which is reasonable
 * for browser use and gives good cache hit rates at Expert depth 5.
 */

/** Table size: 2^19 = 524288 entries (2x previous size) */
const TT_SIZE = 1 << 19;

/** Node type for TT entry */
export const NodeType = {
  /** Exact score (from PV node or terminal) */
  Exact: 0,
  /** Lower bound (fail-high / beta cutoff) */
  LowerBound: 1,
  /** Upper bound (fail-low / alpha cutoff) */
  UpperBound: 2,
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface TTEntry {
  /** FNV-1a hash of the relevant FEN part */
  key: number;
  /** Full FEN (relevant part) for collision verification */
  fen: string;
  /** Depth searched */
  depth: number;
  /** Score from search (from perspective of the position's player) */
  score: number;
  /** Node type */
  nodeType: NodeType;
  /** Best move found (from/to squares) */
  bestFrom?: string;
  bestTo?: string;
  bestPromotion?: string;
  /** Age stamp for replacement */
  age: number;
}

export class TranspositionTable {
  private entries: (TTEntry | null)[];
  private age: number = 0;

  constructor() {
    this.entries = new Array(TT_SIZE).fill(null);
  }

  /**
   * FNV-1a hash of the relevant FEN portion.
   * We hash the piece placement + active color + castling + en passant
   * (4 fields), ignoring move counters for position matching.
   *
   * FNV-1a provides much better distribution than djb2, reducing collision
   * rate significantly.
   */
  hashFen(fen: string): number {
    const relevant = this.getRelevantPart(fen);
    let hash = 2166136261 >>> 0; // FNV offset basis
    for (let i = 0; i < relevant.length; i++) {
      hash ^= relevant.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
    }
    return hash >>> 0; // ensure unsigned 32-bit
  }

  /** Extract the position-significant part of a FEN (first 4 fields) */
  getRelevantPart(fen: string): string {
    const parts = fen.split(' ');
    return parts.slice(0, 4).join(' ');
  }

  /** Get the index for a given hash */
  private index(key: number): number {
    return key & (TT_SIZE - 1);
  }

  /** Store an entry */
  store(
    fen: string,
    depth: number,
    score: number,
    nodeType: NodeType,
    bestMove?: { from: string; to: string; promotion?: string }
  ): void {
    const key = this.hashFen(fen);
    const idx = this.index(key);
    const relevantFen = this.getRelevantPart(fen);

    // Replacement strategy: replace if depth >= existing, or if older
    const existing = this.entries[idx];
    if (existing) {
      // Collision check: if same key but different FEN, always replace
      if (existing.fen !== relevantFen) {
        // Hash collision — replace regardless
      } else if (existing.depth > depth && existing.age >= this.age - 1) {
        // Keep the deeper entry if it's recent enough
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

  /** Probe the table — returns entry if found and depth >= requiredDepth */
  probe(fen: string, requiredDepth: number): TTEntry | null {
    const key = this.hashFen(fen);
    const idx = this.index(key);
    const entry = this.entries[idx];

    if (!entry) return null;

    // Verify: check key and FEN match
    if (entry.key !== key) return null;
    if (entry.fen !== this.getRelevantPart(fen)) return null;
    if (entry.depth < requiredDepth) return null;

    return entry;
  }

  /** Get the best move from TT (for move ordering), without depth check */
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

  /** Increment age (called per iteration in iterative deepening) */
  newIteration(): void {
    this.age++;
  }

  /** Clear the table entirely */
  clear(): void {
    this.entries.fill(null);
    this.age = 0;
  }

  /** Number of entries currently stored */
  get size(): number {
    let count = 0;
    for (const e of this.entries) {
      if (e) count++;
    }
    return count;
  }
}

