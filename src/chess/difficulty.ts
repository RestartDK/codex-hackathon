export type Difficulty = "beginner" | "casual" | "club" | "expert" | "nightmare";

export interface DifficultyConfig {
  label: string;
  rating: number;
  depth: number;
  randomBlunders: boolean;
  quiescence: boolean;
  useTranspositionTable: boolean;
  iterativeDeepening: boolean;
  usesStockfish?: boolean;
  stockfishSkillLevel?: number;
  stockfishThinkTimeMs?: number;
  description: string;
  hidden?: boolean;
  disabled?: boolean;
}

export const EXPERT_THINK_TIME_MS = 2500;
export const EXPERT_DEPTH = 5;

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  beginner: {
    label: "Easy",
    rating: 0,
    depth: 0,
    randomBlunders: false,
    quiescence: false,
    useTranspositionTable: false,
    iterativeDeepening: false,
    usesStockfish: true,
    stockfishSkillLevel: 0,
    stockfishThinkTimeMs: 150,
    description: "A forgiving opponent with a short thinking time.",
  },
  casual: {
    label: "Medium",
    rating: 0,
    depth: 1,
    randomBlunders: false,
    quiescence: false,
    useTranspositionTable: false,
    iterativeDeepening: false,
    usesStockfish: true,
    stockfishSkillLevel: 8,
    stockfishThinkTimeMs: 400,
    description: "A balanced opponent with moderate tactical awareness.",
  },
  club: {
    label: "Hard",
    rating: 0,
    depth: 3,
    randomBlunders: false,
    quiescence: true,
    useTranspositionTable: false,
    iterativeDeepening: false,
    usesStockfish: true,
    stockfishSkillLevel: 16,
    stockfishThinkTimeMs: 1000,
    description: "A strong opponent with more thinking time.",
  },
  expert: {
    label: "Expert Bot",
    rating: 1700,
    depth: 5,
    randomBlunders: false,
    quiescence: true,
    useTranspositionTable: true,
    iterativeDeepening: true,
    usesStockfish: true,
    stockfishSkillLevel: 16,
    stockfishThinkTimeMs: 2000,
    description:
      "Stockfish at Skill Level 16 with longer think time. Strong positional and tactical play.",
    hidden: true,
  },
  nightmare: {
    label: "Nightmare Bot",
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
      "Stockfish at full strength (Skill Level 20). Extremely strong. Requires SharedArrayBuffer support in your browser.",
    hidden: true,
  },
};

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: "beginner", label: "Easy" },
  { value: "casual", label: "Medium" },
  { value: "club", label: "Hard" },
];

export const DISCLAIMER_TEXT = "Difficulty controls Stockfish skill and thinking time.";

export type EvalFeatures = {
  mobility: boolean;
  pawnStructure: boolean;
  development: boolean;
  space: boolean;
  kingSafety: boolean;
};

export const EVAL_FEATURES: Record<Difficulty, EvalFeatures> = {
  beginner: {
    mobility: false,
    pawnStructure: false,
    development: false,
    space: false,
    kingSafety: false,
  },
  casual: {
    mobility: true,
    pawnStructure: false,
    development: true,
    space: false,
    kingSafety: true,
  },
  club: { mobility: true, pawnStructure: true, development: true, space: true, kingSafety: true },
  expert: { mobility: true, pawnStructure: true, development: true, space: true, kingSafety: true },
  nightmare: {
    mobility: false,
    pawnStructure: false,
    development: false,
    space: false,
    kingSafety: false,
  },
};
