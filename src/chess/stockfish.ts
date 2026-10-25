export interface StockfishMove {
  from: string;
  to: string;
  promotion?: string;
}
export interface StockfishAnalysis {
  score: number;
  bestMove: string | null;
  depth: number;
  pv?: string;
}
export type StockfishEngineState = "idle" | "loading" | "ready" | "searching" | "error";
export interface StockfishCallbacks {
  onStateChange: (state: StockfishEngineState) => void;
  onBestMove: (move: StockfishMove) => void;
  onError: (error: string) => void;
  onProgress?: (info: { depth: number; score: number; pv?: string }) => void;
}

const ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";
const DEFAULT_ANALYSIS_DEPTH = 12;

export function isWasmThreadsSupported(): boolean {
  return typeof WebAssembly === "object" && typeof Worker === "function";
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private callbacks: StockfishCallbacks | null = null;
  private state: StockfishEngineState = "idle";
  private ready = false;
  private currentSkillLevel = 0;
  private currentThinkTimeMs = 1000;
  private listeners = new Set<(line: string) => void>();
  private mode: "play" | "analysis" | null = null;
  private lastScore = 0;
  private lastDepth = 0;
  private lastPv: string | undefined;

  async init(callbacks: StockfishCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.setState("loading");
    try {
      this.worker = new Worker(ENGINE_URL);
      this.worker.addEventListener("message", (event: MessageEvent<string>) => {
        const line = String(event.data);
        this.listeners.forEach((listener) => listener(line));
        this.handleLine(line);
      });
      this.worker.addEventListener("error", () => {
        this.ready = false;
        this.setState("error");
        callbacks.onError("The Stockfish worker could not be loaded.");
      });
      this.command("uci");
      await this.waitFor("uciok", 8000);
      this.command("setoption name Hash value 16");
      this.command("setoption name Threads value 1");
      this.command("isready");
      await this.waitFor("readyok", 8000);
      this.ready = true;
      this.setSkillLevel(0);
      this.setState("ready");
    } catch (cause) {
      this.ready = false;
      this.setState("error");
      callbacks.onError(cause instanceof Error ? cause.message : "Stockfish failed to start.");
    }
  }

  setSkillLevel(level: number): void {
    this.currentSkillLevel = Math.max(0, Math.min(20, Math.round(level)));
    if (this.ready) this.command(`setoption name Skill Level value ${this.currentSkillLevel}`);
  }
  get skillLevel() {
    return this.currentSkillLevel;
  }

  setThinkTime(ms: number): void {
    this.currentThinkTimeMs = Math.max(50, Math.min(30_000, ms));
  }
  get thinkTimeMs() {
    return this.currentThinkTimeMs;
  }

  search(fen: string, thinkTimeMs = this.currentThinkTimeMs): void {
    if (!this.ready) {
      this.callbacks?.onError("The chess engine is not ready.");
      return;
    }
    this.stop();
    this.mode = "play";
    this.setState("searching");
    this.command(`position fen ${fen}`);
    this.command(`go movetime ${Math.max(50, thinkTimeMs)}`);
  }

  analyze(fen: string, depth = DEFAULT_ANALYSIS_DEPTH): Promise<StockfishAnalysis> {
    if (!this.ready) return Promise.reject(new Error("The chess engine is not ready."));
    this.stop();
    this.mode = "analysis";
    this.setState("searching");
    this.lastScore = 0;
    this.lastDepth = 0;
    this.lastPv = undefined;
    return new Promise((resolve) => {
      let settled = false;
      let forcedTimeout: number | undefined;
      const finish = (bestMove: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forcedTimeout !== undefined) clearTimeout(forcedTimeout);
        this.listeners.delete(listener);
        this.mode = null;
        this.setState("ready");
        resolve({ score: this.lastScore, bestMove, depth: this.lastDepth, pv: this.lastPv });
      };
      const listener = (line: string) => {
        if (!line.startsWith("bestmove")) return;
        const value = line.split(/\s+/)[1];
        finish(value && value !== "(none)" ? value : null);
      };
      // UCI engines answer `stop` with a final bestmove. Keep this analysis
      const timeout = window.setTimeout(
        () => {
          this.command("stop");
          forcedTimeout = window.setTimeout(() => finish(null), 2000);
        },
        Math.max(3000, depth * 250),
      );
      this.listeners.add(listener);
      this.command(`position fen ${fen}`);
      this.command(`go depth ${Math.max(1, Math.min(24, depth))}`);
    });
  }

  stop(): void {
    if (this.worker && this.state === "searching") this.command("stop");
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
    this.ready = false;
    this.mode = null;
    this.setState("idle");
  }

  get isReady() {
    return this.ready;
  }
  get currentState() {
    return this.state;
  }

  private command(command: string) {
    this.worker?.postMessage(command);
  }
  private setState(state: StockfishEngineState) {
    this.state = state;
    this.callbacks?.onStateChange(state);
  }

  private handleLine(line: string): void {
    if (line.startsWith("info")) {
      const depth = line.match(/\bdepth (\d+)/)?.[1];
      const cp = line.match(/\bscore cp (-?\d+)/)?.[1];
      const mate = line.match(/\bscore mate (-?\d+)/)?.[1];
      const pv = line.match(/\bpv (.+)$/)?.[1];
      if (depth) this.lastDepth = Number(depth);
      if (cp) this.lastScore = Number(cp);
      if (mate)
        this.lastScore = Number(mate) > 0 ? 100_000 - Number(mate) : -100_000 - Number(mate);
      if (pv) this.lastPv = pv;
      this.callbacks?.onProgress?.({
        depth: this.lastDepth,
        score: this.lastScore,
        pv: this.lastPv,
      });
      return;
    }
    if (!line.startsWith("bestmove") || this.mode !== "play") return;
    const value = line.split(/\s+/)[1];
    this.mode = null;
    this.setState("ready");
    if (!value || value === "(none)") return;
    this.callbacks?.onBestMove({
      from: value.slice(0, 2),
      to: value.slice(2, 4),
      promotion: value.length > 4 ? value[4] : undefined,
    });
  }

  private waitFor(expected: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const listener = (line: string) => {
        if (!line.includes(expected)) return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve();
      };
      const timeout = window.setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Stockfish timed out waiting for ${expected}.`));
      }, timeoutMs);
      this.listeners.add(listener);
    });
  }
}
