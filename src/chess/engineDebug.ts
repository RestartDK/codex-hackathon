export interface EngineDebugInfo {
  difficulty: string;
  fen: string;
  depthReached: number;
  maxDepth: number;
  nodesSearched: number;
  nodeBudget: number;
  bestScore: number;
  bestMove: string;
  searchTimeMs: number;
  openingBookHit: boolean;
  quiescenceUsed: boolean;
  transpositionTableUsed: boolean;
  evaluationFeatures: string[];
}

let debugInfo: Partial<EngineDebugInfo> = {};
let debugEnabled = false;

export function enableDebug(): void {
  debugEnabled = true;
}

export function disableDebug(): void {
  debugEnabled = false;
}

export function isDebugEnabled(): boolean {
  return (
    debugEnabled ||
    (typeof window !== "undefined" &&
      (window as { __engineDebug?: boolean }).__engineDebug === true)
  );
}

export function recordDebug(info: Partial<EngineDebugInfo>): void {
  if (!isDebugEnabled()) return;
  debugInfo = { ...debugInfo, ...info };
}

export function getDebugInfo(): Partial<EngineDebugInfo> | null {
  if (!isDebugEnabled()) return null;
  return debugInfo;
}

export function clearDebug(): void {
  debugInfo = {};
}
