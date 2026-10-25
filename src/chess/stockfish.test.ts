import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { StockfishEngine } from "./stockfish";

class FakeWorker {
  static instances: FakeWorker[] = [];
  private onMessage?: (event: { data: string }) => void;
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    if (type === "message") this.onMessage = listener;
  }
  postMessage(command: string) {
    const reply = command === "uci" ? "uciok" : command === "isready" ? "readyok" : null;
    if (reply) queueMicrotask(() => this.onMessage?.({ data: reply }));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe("Stockfish initialization lifecycle", () => {
  it("keeps a replacement engine ready after a terminated initialization times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Worker", FakeWorker);
    const engine = new StockfishEngine();
    const callbacks = {
      onStateChange: vi.fn(),
      onBestMove: vi.fn(),
      onError: vi.fn(),
    };
    const cancelled = engine.init(callbacks);
    engine.terminate();
    const replacement = engine.init(callbacks);
    await replacement;
    expect(engine.isReady).toBe(true);
    await vi.advanceTimersByTimeAsync(8000);
    await cancelled;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(engine.currentState).toBe("ready");
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
