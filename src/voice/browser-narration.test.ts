import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createBrowserNarrationBackend,
  createOpenAINarrationBackend,
  createRoleAwareNarrationBackend,
  type NarrationRequest,
} from "./browser-narration";

describe("browser narration playback evidence", () => {
  let utterance: SpeechSynthesisUtterance;
  const cancel = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    cancel.mockClear();
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    vi.stubGlobal("window", {
      speechSynthesis: {
        getVoices: () => [],
        speak: (value: SpeechSynthesisUtterance) => {
          utterance = value;
        },
        cancel,
        pause: vi.fn(),
        resume: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const request = (): NarrationRequest => ({
    line: { id: "role", speaker: "Guide", text: "Your role is the Witch." },
    voice: { preferredNames: [], locales: ["en"], rate: 1, pitch: 1 },
    volume: 1,
    onStarted: vi.fn(),
    onFinished: vi.fn(),
  });
  const event = (name: "onstart" | "onend", value = {} as SpeechSynthesisEvent) => {
    utterance[name]?.(value);
  };

  it("only confirms completion after speech actually starts and ends", () => {
    const backend = createBrowserNarrationBackend();
    const req = request();
    backend.speak(req);
    expect(req.onStarted).not.toHaveBeenCalled();
    expect(req.onFinished).not.toHaveBeenCalled();
    event("onstart");
    expect(req.onStarted).toHaveBeenCalledOnce();
    event("onend");
    expect(req.onFinished).toHaveBeenCalledWith("completed");
  });

  it("reports interruption rather than completion and ignores the stale end event", () => {
    const backend = createBrowserNarrationBackend();
    const req = request();
    backend.speak(req);
    event("onstart");
    backend.cancel();
    event("onend");
    expect(req.onFinished).toHaveBeenCalledExactlyOnceWith("interrupted");
  });

  it("surfaces blocked audio and a silent start timeout accessibly", () => {
    const error = vi.fn();
    const backend = createBrowserNarrationBackend(error);
    const req = request();
    backend.speak(req);
    utterance.onerror?.({ error: "not-allowed" } as SpeechSynthesisErrorEvent);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("blocked automatic narration"));
    expect(req.onFinished).toHaveBeenCalledWith("failed");
    const silent = request();
    backend.speak(silent);
    vi.advanceTimersByTime(8_000);
    expect(silent.onFinished).toHaveBeenCalledWith("failed");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("did not start"));
  });

  it("canceled setup cleanup cannot later time out and cancel the role announcement", () => {
    const backend = createBrowserNarrationBackend();
    const old = request();
    backend.speak(old);
    backend.cancel();
    const role = request();
    backend.speak(role);
    event("onstart");
    vi.advanceTimersByTime(8_001);
    expect(cancel).toHaveBeenCalledOnce();
    expect(role.onFinished).not.toHaveBeenCalled();
    event("onend");
    expect(role.onFinished).toHaveBeenCalledWith("completed");
  });
  it("does not turn a paused startup into a failed narration", () => {
    const backend = createBrowserNarrationBackend();
    const req = request();
    backend.speak(req);
    backend.pause();
    vi.advanceTimersByTime(20_000);
    expect(req.onFinished).not.toHaveBeenCalled();
    backend.resume();
    event("onstart");
    event("onend");
    expect(req.onFinished).toHaveBeenCalledExactlyOnceWith("completed");
  });

  it("tracks audio playing and ended separately from a successful narration request", async () => {
    let playback: { onplaying?: () => void; onended?: () => void } = {};
    vi.stubGlobal(
      "Audio",
      class {
        onplaying?: () => void;
        onended?: () => void;
        play = vi.fn(async () => undefined);
        pause = vi.fn();
        constructor() {
          playback = this;
        }
      },
    );
    const fetchAudio = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["audio"]) }));
    vi.stubGlobal("fetch", fetchAudio);
    const backend = createOpenAINarrationBackend("game", "token");
    const req = request();
    backend.speak(req);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(req.onStarted).not.toHaveBeenCalled();
    expect(req.onFinished).not.toHaveBeenCalled();
    playback.onplaying?.();
    expect(req.onStarted).toHaveBeenCalledOnce();
    playback.onended?.();
    expect(req.onFinished).toHaveBeenCalledExactlyOnceWith("completed");
    const repeat = request();
    backend.speak(repeat);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(fetchAudio).toHaveBeenCalledOnce();
    playback.onplaying?.();
    playback.onended?.();
    expect(repeat.onFinished).toHaveBeenCalledExactlyOnceWith("completed");
  });

  it("does not play a late audio response after an explicit cancellation", async () => {
    let deliver: (value: unknown) => void = () => undefined;
    const audio = vi.fn();
    vi.stubGlobal("Audio", audio);
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    const backend = createOpenAINarrationBackend("game", "token");
    const req = request();
    backend.speak(req);
    backend.cancel();
    deliver({ ok: true, blob: async () => new Blob(["late audio"]) });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(audio).not.toHaveBeenCalled();
    expect(req.onStarted).not.toHaveBeenCalled();
  });

  it("prefers free local role speech and falls back to audio only after a local failure", async () => {
    const fetchAudio = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetchAudio);
    const backend = createRoleAwareNarrationBackend("game", "token");
    const ordinary = request();
    backend.speak(ordinary);
    expect(fetchAudio).not.toHaveBeenCalled();
    backend.cancel();
    const role = request();
    role.line.privateRole = true;
    role.line.instant = true;
    backend.speak(role);
    expect(fetchAudio).not.toHaveBeenCalled();
    utterance.onerror?.({ error: "synthesis-unavailable" } as SpeechSynthesisErrorEvent);
    expect(fetchAudio).toHaveBeenCalledOnce();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    event("onstart");
    event("onend");
    expect(role.onFinished).toHaveBeenCalledExactlyOnceWith("completed");
  });
  it("also recovers ordinary phase narration from the silent local engine", async () => {
    const fetchAudio = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["audio"]) }));
    vi.stubGlobal("fetch", fetchAudio);
    vi.stubGlobal(
      "Audio",
      class {
        play = vi.fn(async () => undefined);
        pause = vi.fn();
      },
    );
    const backend = createRoleAwareNarrationBackend("game", "token");
    backend.speak(request());
    vi.advanceTimersByTime(8_000);
    expect(fetchAudio).toHaveBeenCalledOnce();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    backend.cancel();
    backend.speak({
      ...request(),
      line: { id: "dawn", speaker: "Guide", text: "Dawn breaks. Say begin vote." },
    });
    expect(fetchAudio).toHaveBeenCalledTimes(2);
  });
  it("keeps a delayed audio response paused until the player resumes", async () => {
    let deliver: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    const play = vi.fn(async () => undefined);
    vi.stubGlobal(
      "Audio",
      class {
        play = play;
        pause = vi.fn();
      },
    );
    const backend = createOpenAINarrationBackend("game", "token");
    backend.speak(request());
    backend.pause();
    deliver({ ok: true, blob: async () => new Blob(["audio"]) });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
    backend.resume();
    expect(play).toHaveBeenCalledOnce();
  });
});
