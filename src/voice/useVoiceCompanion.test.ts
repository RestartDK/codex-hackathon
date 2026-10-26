import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// A minimal hook host keeps the tests offline without installing a DOM package.
// The real hook, event parser, media callbacks and tool handoff run below.
const host = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
  let slots: Slot[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const changed = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  return {
    begin() {
      cursor = 0;
    },
    flush() {
      const pending = effects;
      effects = [];
      pending.forEach((run) => run());
    },
    reset() {
      slots.forEach((slot) => slot.cleanup?.());
      slots = [];
      cursor = 0;
      effects = [];
    },
    react: {
      useRef<T>(value: T) {
        const slot = (slots[cursor++] ??= { value: { current: value } });
        return slot.value as { current: T };
      },
      useState<T>(initial: T | (() => T)) {
        const slot = (slots[cursor++] ??= {
          value: typeof initial === "function" ? (initial as () => T)() : initial,
        });
        return [
          slot.value as T,
          (value: T | ((previous: T) => T)) => {
            slot.value =
              typeof value === "function" ? (value as (previous: T) => T)(slot.value as T) : value;
          },
        ] as const;
      },
      useCallback<T>(callback: T, deps: readonly unknown[]) {
        const slot = (slots[cursor++] ??= {});
        if (changed(slot.deps, deps)) {
          slot.value = callback;
          slot.deps = deps;
        }
        return slot.value as T;
      },
      useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
        const slot = (slots[cursor++] ??= {});
        if (changed(slot.deps, deps)) {
          slot.deps = deps;
          effects.push(() => {
            slot.cleanup?.();
            slot.cleanup = effect() || undefined;
          });
        }
      },
    },
  };
});
vi.mock("react", () => host.react);
import { useVoiceCompanion, type VoiceToolExecutor } from "./useVoiceCompanion";

class Track extends EventTarget {
  enabled = true;
  stop = vi.fn();
}
class Channel extends EventTarget {
  readyState = "open";
  sent: Record<string, unknown>[] = [];
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }
  emit(value: object) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
  }
}
let peers: Peer[];
let play: () => Promise<void>;
let track: Track;
class Peer {
  iceGatheringState = "complete";
  connectionState = "connected";
  localDescription = { sdp: "offline-offer" };
  channel = new Channel();
  ontrack?: (event: { streams: object[] }) => void;
  onconnectionstatechange?: () => void;
  constructor() {
    peers.push(this);
  }
  addTrack() {}
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return this.localDescription;
  }
  async setLocalDescription() {}
  async setRemoteDescription() {
    this.ontrack?.({ streams: [{}] });
  }
  close() {}
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe("voice session offline regressions", () => {
  let executor: VoiceToolExecutor;
  let preferences: Map<string, string>;
  let gameId = "loups-garous";
  const render = function VoiceHarness() {
    host.begin();
    const voice = useVoiceCompanion(executor, false, gameId);
    host.flush();
    return voice;
  };
  const connect = async () => {
    await render().start();
    await settle();
    peers.at(-1)!.channel.emit({ type: "session.started" });
    return render();
  };
  const tool = (callId = "call-1", command = "continue") => ({
    type: "response.event",
    event: {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: callId,
        name: "submit_player_command",
        arguments: JSON.stringify({ command }),
      },
    },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    peers = [];
    gameId = "loups-garous";
    track = new Track();
    play = () => Promise.resolve();
    preferences = new Map();
    executor = {
      ownsToolResponse: true,
      execute: vi.fn().mockResolvedValue('{"status":"completed"}'),
      onUserTranscript: vi.fn(),
    };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => preferences.get(key) ?? null,
        setItem: (key: string, value: string) => preferences.set(key, value),
      },
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] }),
      },
    });
    vi.stubGlobal("RTCPeerConnection", Peer);
    vi.stubGlobal(
      "Audio",
      class {
        volume = 1;
        srcObject: unknown;
        play() {
          return play();
        }
        pause() {}
      },
    );
    // All requests are mocked. Unexpected endpoints fail rather than call a provider.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url !== "/api/voice/session") throw new Error(`Unexpected network request: ${url}`);
        return Response.json({ transport: { sdp: "offline-answer" } });
      }),
    );
  });
  afterEach(() => {
    host.reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recovers a persisted muted mic", async () => {
    preferences.set("playora.microphone-muted", "true");
    let voice = await connect();
    expect(voice.microphoneMuted).toBe(true);
    expect(track.enabled).toBe(false);
    voice.toggleMicrophone();
    voice = render();
    expect(voice.microphoneMuted).toBe(false);
    expect(track.enabled).toBe(true);
    expect(preferences.get("playora.microphone-muted")).toBe("false");
  });

  it("preserves main's shared voice pause, resume, and microphone controls", async () => {
    const voice = await connect();
    voice.runVoiceControl("pause_commands");
    const channel = peers[0]!.channel;
    channel.emit({
      type: "response.event",
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "paused-action",
          name: "place_tic_tac_toe_mark",
          arguments: "{}",
        },
      },
    });
    await settle();
    expect(executor.execute).not.toHaveBeenCalled();
    voice.runVoiceControl("resume_commands");
    voice.runVoiceControl("mute_microphone");
    expect(track.enabled).toBe(false);
    voice.runVoiceControl("unmute_microphone");
    expect(track.enabled).toBe(true);
    expect(preferences.get("playora.microphone-muted")).toBe("false");
    channel.emit(tool("resumed-action"));
    await settle();
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it("preserves automatic connection recovery for other games without enabling it for Loups-Garous", async () => {
    gameId = "tic-tac-toe";
    await connect();
    peers[0]!.channel.close();
    expect(render().status).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1_200);
    expect(peers).toHaveLength(2);
    peers[1]!.channel.emit({ type: "session.started" });
    expect(render().status).toBe("connected");
  });

  it("uses the latest mute preference when microphone permission arrives late", async () => {
    let grant!: (stream: unknown) => void;
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = resolve as (stream: unknown) => void;
        }),
    );
    const startup = render().start();
    render().toggleMicrophone();
    grant({ getTracks: () => [track], getAudioTracks: () => [track] });
    await startup;
    await settle();
    expect(track.enabled).toBe(false);
    expect(render().microphoneMuted).toBe(true);
  });

  it("surfaces and recovers a temporary microphone interruption without opening another session", async () => {
    await connect();
    track.dispatchEvent(new Event("mute"));
    expect(render().error).toMatch(/microphone input was interrupted/);
    track.dispatchEvent(new Event("unmute"));
    expect(render().error).toBeNull();
    expect(peers).toHaveLength(1);
  });

  it("reports a closed command channel instead of pretending to listen; retry works", async () => {
    await connect();
    const previous = peers[0]!;
    previous.channel.close();
    expect(render().status).toBe("error");
    expect(render().error).toMatch(/command connection ended/);
    expect((await connect()).status).toBe("connected");
    previous.channel.emit(tool("stale"));
    await settle();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("surfaces microphone removal and a failed data channel", async () => {
    await connect();
    track.dispatchEvent(new Event("ended"));
    expect(render().status).toBe("error");
    expect(render().error).toMatch(/microphone stopped/);
    await connect();
    peers.at(-1)!.channel.dispatchEvent(new Event("error"));
    expect(render().error).toMatch(/command connection ended/);
  });

  it("does not let a stale audio-play result resurrect a disconnected session", async () => {
    let finish!: () => void;
    play = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    await render().start();
    const peer = peers[0]!;
    peer.channel.emit({ type: "session.started" });
    peer.channel.close();
    finish();
    await settle();
    expect(render().status).toBe("error");
  });

  it("never enables the mic through a blocked playback gate", async () => {
    play = () => Promise.reject(new Error("autoplay blocked"));
    let voice = await connect();
    expect(voice.needsAudioActivation).toBe(true);
    voice.toggleMicrophone();
    voice.toggleMicrophone();
    expect(track.enabled).toBe(false);
    play = () => Promise.resolve();
    await render().activateAudio();
    voice = render();
    expect(voice.status).toBe("connected");
    expect(track.enabled).toBe(true);
  });

  it("keeps input enabled during narration and completes each delegated tool once", async () => {
    const voice = await connect();
    voice.setOutputSuppressed(true);
    voice.interrupt();
    const channel = peers[0]!.channel;
    expect(track.enabled).toBe(true);
    expect(JSON.stringify(channel.sent)).toMatch(/Keep listening/);
    channel.emit(tool());
    channel.emit(tool());
    await settle();
    expect(executor.execute).toHaveBeenCalledOnce();
    expect(channel.sent.filter((event) => event.type === "response.item.create")).toHaveLength(1);
    expect(channel.sent.filter((event) => event.type === "response.create")).toHaveLength(1);
  });

  it("warns when speech never reaches a tool, without guessing an action from fragments", async () => {
    await connect();
    const channel = peers[0]!.channel;
    channel.emit({
      type: "session.input_transcript.delta",
      delta: "vote for",
      start_ms: 100,
      end_ms: 600,
    });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(render().error).toMatch(/no game command arrived/);
    expect(executor.execute).not.toHaveBeenCalled();
    channel.emit(tool("retry", "vote for Emma"));
    await settle();
    expect(render().error).toBeNull();
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it("groups separate timeline phrases without requiring nonexistent item IDs", async () => {
    await connect();
    const channel = peers[0]!.channel;
    channel.emit({
      type: "session.input_transcript.delta",
      delta: "use defaults",
      start_ms: 100,
      end_ms: 600,
    });
    channel.emit({
      type: "session.input_transcript.delta",
      delta: "confirm",
      start_ms: 4000,
      end_ms: 4400,
    });
    expect(executor.onUserTranscript).toHaveBeenLastCalledWith(
      "confirm",
      expect.stringMatching(/:speech-2$/),
    );
  });
});
