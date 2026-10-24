/** Difficulty levels for the computer opponent */
export type Difficulty = 'beginner' | 'casual' | 'club' | 'expert' | 'nightmare';

export interface DifficultyConfig {
  /** Human-readable label */
  label: string;
  /** Approximate rating */
  rating: number;
  /** Search depth in half-moves (plies) — 0 means depth is not applicable (uses external engine) */
  depth: number;
  /** Whether random blunders occur */
  randomBlunders: boolean;
  /** Whether to use quiescence search */
  quiescence: boolean;
  /** Whether to use transposition table */
  useTranspositionTable: boolean;
  /** Whether to use iterative deepening with time management */
  iterativeDeepening: boolean;
  /** Whether this difficulty uses external engine integration (e.g. Stockfish WASM) */
  usesStockfish?: boolean;
  /** Stockfish Skill Level (0-20). Only used when usesStockfish is true. */
  stockfishSkillLevel?: number;
  /** Stockfish think time in ms. Only used when usesStockfish is true. */
  stockfishThinkTimeMs?: number;
  /** Description for the UI */
  description: string;
  /** Whether this difficulty is hidden from the UI */
  hidden?: boolean;
  /** If true, this difficulty cannot be selected yet */
  disabled?: boolean;
}

/** Maximum think time for iterative deepening (Expert) in ms */
export const EXPERT_THINK_TIME_MS = 2500;
/** Default search depth for Expert per ply (before qs) */
export const EXPERT_DEPTH = 5;

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  beginner: {
    label: 'Easy',
    rating: 0,
    depth: 0,
    randomBlunders: false,
    quiescence: false,
    useTranspositionTable: false,
    iterativeDeepening: false,
    usesStockfish: true,
    stockfishSkillLevel: 0,
    stockfishThinkTimeMs: 150,
    description: 'A forgiving opponent with a short thinking time.',
  },
  casual: {
    label: 'Medium',
    rating: 0,
    depth: 1,
    randomBlunders: false,
    quiescence: false,
    useTranspositionTable: false,
    iterativeDeepening: false,
    usesStockfish: true,
    stockfishSkillLevel: 8,
    stockfishThinkTimeMs: 400,
    description: 'A balanced opponent with moderate tactical awareness.',
  },
  club: {
    label: 'Hard',
    rating: 0,
    depth: 3,
    randomBlunders: false,
    quiescence: true,
    useTranspositionTable: false,
    iterativeDeepening: false,
    usesStockfish: true,
    stockfishSkillLevel: 16,
    stockfishThinkTimeMs: 1000,
    description: 'A strong opponent with more thinking time.',
  },
  expert: {
    label: 'Expert Bot',
    rating: 1700,
    depth: 5,
    randomBlunders: false,
    quiescence: true,
    useTranspositionTable: true,
    iterativeDeepening: true,
    usesStockfish: true,
    stockfishSkillLevel: 16,
    stockfishThinkTimeMs: 2000,
    description: 'Stockfish at Skill Level 16 with longer think time. Strong positional and tactical play.',
    hidden: true,
  },
  nightmare: {
    label: 'Nightmare Bot',
    rating: 2000,
    depth: 0,
    randomBlunders: false,
    quiescence: false,
    useTranspositionTable: false,
    iterativeDeepening: false,
    usesStockfish: true,
    stockfishSkillLevel: 20,
    stockfishThinkTimeMs: 3000,
    description:
      'Stockfish at full strength (Skill Level 20). Extremely strong. Requires SharedArrayBuffer support in your browser.',
    hidden: true,
  },
};

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Easy' },
  { value: 'casual', label: 'Medium' },
  { value: 'club', label: 'Hard' },
];

/** Disclaimer text shown near difficulty selector */
export const DISCLAIMER_TEXT = 'Difficulty controls Stockfish skill and thinking time.';

/** Evaluation features enabled by difficulty level */
export type EvalFeatures = {
  mobility: boolean;
  pawnStructure: boolean;
  development: boolean;
  space: boolean;
  kingSafety: boolean;
};

/** Which evaluation features to use per difficulty */
export const EVAL_FEATURES: Record<Difficulty, EvalFeatures> = {
  beginner: { mobility: false, pawnStructure: false, development: false, space: false, kingSafety: false },
  casual: { mobility: true, pawnStructure: false, development: true, space: false, kingSafety: true },
  club: { mobility: true, pawnStructure: true, development: true, space: true, kingSafety: true },
  expert: { mobility: true, pawnStructure: true, development: true, space: true, kingSafety: true },
  nightmare: { mobility: false, pawnStructure: false, development: false, space: false, kingSafety: false },
};

