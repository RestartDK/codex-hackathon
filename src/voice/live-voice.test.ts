import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { startLiveVoice } from "./live-voice";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  const box: { resolve?: (value: T) => void; reject?: (reason: unknown) => void } = {};
  const promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });
  return {
    promise,
    resolve: (value: T) => box.resolve?.(value),
    reject: (reason: unknown) => box.reject?.(reason),
  };
}

type FakeTrack = { stopped: boolean; stop: () => void };

function fakeStream() {
  const tracks: FakeTrack[] = [
    {
      stopped: false,
      stop() {
        this.stopped = true;
      },
    },
  ];
  return { getTracks: () => tracks, tracks };
}

function fakePeer(calls: { closed: number; added: number }) {
  return {
    connectionState: "new",
    ontrack: null,
    onconnectionstatechange: null,
    createDataChannel: () => ({
      readyState: "connecting",
      send: () => undefined,
      close: () => undefined,
      addEventListener: () => undefined,
    }),
    addTrack: () => {
      calls.added += 1;
    },
    createOffer: async () => ({ type: "offer", sdp: "offer-sdp" }),
    setLocalDescription: async () => undefined,
    setRemoteDescription: async () => undefined,
    close: () => {
      calls.closed += 1;
    },
  };
}

function stubBrowser(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  stream = fakeStream(),
) {
  const calls = { closed: 0, added: 0 };
  const statuses: string[] = [];
  const closed: number[] = [];
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => stream } });
  vi.stubGlobal("RTCPeerConnection", function PeerConnection() {
    return fakePeer(calls);
  });
  vi.stubGlobal("Audio", function FakeAudio() {
    return {
      autoplay: false,
      srcObject: null,
      muted: false,
      pause: () => undefined,
      play: async () => undefined,
    };
  });
  vi.stubGlobal("fetch", fetchImpl);
  return {
    calls,
    stream,
    statuses,
    closed,
    callbacks: {
      onStatus: (status: string) => statuses.push(status),
      onInputTranscript: () => undefined,
      onInputTranscriptComplete: () => undefined,
      onGuideReply: () => undefined,
      onClosed: () => closed.push(1),
    },
  };
}

const baseOptions = {
  target: { kind: "game", gameId: "game-1", sessionToken: "session-token" } as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("live voice startup ownership", () => {
  it("disposes a microphone stream that arrives after the owner unmounted", async () => {
    const pending = deferred<ReturnType<typeof fakeStream>>();
    const stream = fakeStream();
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => pending.promise } });
    vi.stubGlobal("fetch", async () => Response.json({ sdp: "answer" }));
    const controller = new AbortController();
    const closed: number[] = [];
    const callbacks = {
      onStatus: () => undefined,
      onInputTranscript: () => undefined,
      onInputTranscriptComplete: () => undefined,
      onGuideReply: () => undefined,
      onClosed: () => closed.push(1),
    };

    const starting = startLiveVoice({ ...baseOptions, ...callbacks, signal: controller.signal });
    controller.abort();
    pending.resolve(stream);

    await expect(starting).rejects.toThrow(/abort/iu);
    expect(stream.tracks[0].stopped).toBe(true);
    expect(closed).toHaveLength(1);
  });

  it("closes the peer connection and stops the microphone when the SDP exchange is cancelled", async () => {
    const controller = new AbortController();
    const requestStarted = deferred<void>();
    const stubs = stubBrowser(async (_input, init) => {
      const signal = init?.signal;
      requestStarted.resolve();
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    });

    const starting = startLiveVoice({
      ...baseOptions,
      ...stubs.callbacks,
      signal: controller.signal,
    });
    await requestStarted.promise;
    controller.abort();

    await expect(starting).rejects.toThrow(/abort/iu);
    expect(stubs.stream.tracks[0].stopped).toBe(true);
    expect(stubs.calls.closed).toBe(1);
    expect(stubs.closed).toHaveLength(1);
  });

  it("releases the shared microphone once when the running session is stopped", async () => {
    const controller = new AbortController();
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const stubs = stubBrowser(async (input, init) => {
      requests.push({ url: input, init });
      return Response.json({ sdp: "answer-sdp" });
    });

    const session = await startLiveVoice({
      ...baseOptions,
      ...stubs.callbacks,
      signal: controller.signal,
    });
    expect(requests[0].url).toBe("/api/games/game-1/voice");
    expect(requests[0].init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-Game-Session": "session-token",
    });
    expect(stubs.stream.tracks[0].stopped).toBe(false);

    session.stop();
    session.stop();
    controller.abort();

    expect(stubs.stream.tracks[0].stopped).toBe(true);
    expect(stubs.calls.closed).toBe(1);
    expect(stubs.closed).toHaveLength(1);
  });

  it("opens the public lobby session without game credentials", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const stubs = stubBrowser(async (input, init) => {
      requests.push({ url: input, init });
      return Response.json({ transport: { sdp: "lobby-answer" } });
    });

    await startLiveVoice({ target: { kind: "lobby" }, ...stubs.callbacks });

    expect(requests[0]?.url).toBe("/api/voice/session");
    expect(requests[0]?.init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ sdp: "offer-sdp", mode: "lobby" }));
    expect(JSON.stringify(requests[0]?.init)).not.toContain("session-token");
  });

  it("rejects a session response without an SDP answer", async () => {
    const stubs = stubBrowser(async () => Response.json({ transport: {} }));
    await expect(
      startLiveVoice({ target: { kind: "lobby" }, ...stubs.callbacks }),
    ).rejects.toThrow(/invalid session/iu);
    expect(stubs.stream.tracks[0].stopped).toBe(true);
  });
});
