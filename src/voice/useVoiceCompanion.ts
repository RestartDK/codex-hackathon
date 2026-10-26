import { useCallback, useEffect, useRef, useState } from "react";
import type { AvailableDestination } from "./navigation";

export type VoiceToolExecutor = {
  execute: (name: string, rawArguments: string) => Promise<string>;
  onUserTranscript?: (transcript: string, itemId: string) => void | Promise<void>;
  cancelRequests?: () => void;
  invalidatePending?: () => void;
};

export type VoiceStatus = "idle" | "connecting" | "connected" | "closing" | "error";

const VOICE_ENABLED_KEY = "playora.voice-enabled";
const MICROPHONE_MUTED_KEY = "playora.microphone-muted";
// Live speech regularly contains pauses around 1.2 seconds between clauses.
// Releasing sooner can treat one response as multiple responses and advance an
// ordered narration queue before the current line is actually finished.
const REMOTE_SPEECH_RELEASE_MS = 1_600;

function readPreference(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}

export function shouldAutoStartVoice(): boolean {
  return readPreference(VOICE_ENABLED_KEY, true);
}

type LiveEvent =
  | { kind: "started" | "closed" | "error" }
  | { kind: "instructions-appended"; clientEventId: string }
  | {
      kind: "transcript";
      source: "user" | "companion";
      delta: string;
      itemId: string;
    }
  | { kind: "tool"; callId: string; name: string; arguments: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEvent(raw: string): LiveEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  if (value.type === "session.started") return { kind: "started" };
  if (value.type === "session.closed") return { kind: "closed" };
  if (value.type === "error") return { kind: "error" };
  if (value.type === "session.instructions.appended" && typeof value.client_event_id === "string")
    return { kind: "instructions-appended", clientEventId: value.client_event_id };
  if (
    (value.type === "session.input_transcript.delta" ||
      value.type === "session.output_transcript.delta") &&
    typeof value.delta === "string"
  ) {
    return {
      kind: "transcript",
      source: value.type === "session.input_transcript.delta" ? "user" : "companion",
      delta: value.delta,
      itemId: typeof value.item_id === "string" ? value.item_id : "current-turn",
    };
  }
  if (
    value.type !== "response.event" ||
    !isObject(value.event) ||
    value.event.type !== "response.output_item.done"
  )
    return null;
  const item = value.event.item;
  if (
    !isObject(item) ||
    item.type !== "function_call" ||
    typeof item.call_id !== "string" ||
    typeof item.name !== "string"
  )
    return null;
  return {
    kind: "tool",
    callId: item.call_id,
    name: item.name,
    arguments: typeof item.arguments === "string" ? item.arguments : "{}",
  };
}

function parseSession(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isObject(value) && isObject(value.transport) && typeof value.transport.sdp === "string"
    ? value.transport.sdp
    : null;
}

function waitForIce(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const listener = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", listener);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", listener);
  });
}

export function useVoiceCompanion(
  executor: VoiceToolExecutor,
  audioMuted: boolean,
  volumeOrGameId: number | string,
  view: AvailableDestination | "loading" | "chess-setup" = "home",
  gameVolume = 100,
) {
  const volume = typeof volumeOrGameId === "number" ? volumeOrGameId : gameVolume;
  const gameId = typeof volumeOrGameId === "string" ? volumeOrGameId : "chess";
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [microphoneMuted, setMicrophoneMuted] = useState(() =>
    readPreference(MICROPHONE_MUTED_KEY, false),
  );
  const [needsAudioActivation, setNeedsAudioActivation] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionSequence, setSessionSequence] = useState(0);
  const [playbackSequence, setPlaybackSequence] = useState(0);
  const speechDeadlineRef = useRef(0);
  const speechContextRef = useRef<AudioContext | null>(null);
  const speechAnalyserRef = useRef<AnalyserNode | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const starting = useRef(false);
  const handledCalls = useRef(new Set<string>());
  const closeResolver = useRef<(() => void) | null>(null);
  const disconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptSource = useRef<"user" | "companion" | null>(null);
  const userTranscriptItems = useRef(new Map<string, string>());
  const sessionStartedRef = useRef(false);
  const playbackReadyRef = useRef(audioMuted);
  const connectedOnceRef = useRef(false);
  const recoveryPendingRef = useRef(false);
  const playbackActiveRef = useRef(false);
  const pendingAnnouncementRef = useRef<{
    instructionId: string;
    content: string;
  } | null>(null);

  const send = useCallback((event: object) => {
    const channel = channelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(event));
  }, []);

  const interrupt = useCallback(() => {
    if (channelRef.current?.readyState !== "open") return;
    pendingAnnouncementRef.current = null;
    send({
      type: "session.instructions.append",
      event_id: crypto.randomUUID(),
      delegation_id: null,
      content:
        "Stop any current spoken response and discard queued guidance. Listen for the next application update.",
    });
    speechDeadlineRef.current = 0;
    setIsSpeaking(false);
  }, [send]);

  const announce = useCallback(
    (content: string) => {
      if (channelRef.current?.readyState !== "open") return false;
      pendingAnnouncementRef.current = null;
      const instructionId = crypto.randomUUID();
      send({
        type: "session.instructions.append",
        event_id: instructionId,
        delegation_id: null,
        content:
          "Stop any current spoken response and discard queued guidance. The next application commentary is authoritative. Speak it verbatim and in full, without shortening it, adding an offer of help, or replacing it with a generic welcome.",
      });
      pendingAnnouncementRef.current = { instructionId, content };
      setCaption("");
      transcriptSource.current = null;
      return true;
    },
    [send],
  );

  useEffect(() => {
    if (status === "connected") {
      if (connectedOnceRef.current && recoveryPendingRef.current) {
        recoveryPendingRef.current = false;
        announce("Voice is connected again. Say Where am I or What can I do to continue.");
      }
      connectedOnceRef.current = true;
    } else if (connectedOnceRef.current && (status === "error" || status === "idle")) {
      recoveryPendingRef.current = true;
    }
  }, [announce, status]);

  const cleanup = useCallback(() => {
    generation.current++;
    starting.current = false;
    requestRef.current?.abort();
    requestRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.srcObject = null;
    audioRef.current = null;
    handledCalls.current.clear();
    sessionStartedRef.current = false;
    playbackActiveRef.current = false;
    pendingAnnouncementRef.current = null;
    playbackReadyRef.current = audioMuted;
    setNeedsAudioActivation(false);
    setCaption("");
    transcriptSource.current = null;
    userTranscriptItems.current.clear();
    if (disconnectTimeout.current !== null) clearTimeout(disconnectTimeout.current);
    disconnectTimeout.current = null;
    if (connectionTimeout.current !== null) clearTimeout(connectionTimeout.current);
    connectionTimeout.current = null;
    closeResolver.current?.();
    closeResolver.current = null;
    executor.cancelRequests?.();
    executor.invalidatePending?.();
    speechDeadlineRef.current = 0;
    void speechContextRef.current?.close().catch(() => undefined);
    speechContextRef.current = null;
    speechAnalyserRef.current = null;
    setIsSpeaking(false);
    setStatus("idle");
  }, [audioMuted, executor]);

  const stop = useCallback(async () => {
    window.localStorage.setItem(VOICE_ENABLED_KEY, "false");
    if (channelRef.current?.readyState !== "open") {
      cleanup();
      return;
    }
    setStatus("closing");
    const closed = new Promise<void>((resolve) => {
      closeResolver.current = resolve;
    });
    send({ type: "session.close", event_id: crypto.randomUUID() });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 5000);
      }),
    ]);
    clearTimeout(timeout);
    cleanup();
  }, [cleanup, send]);

  const handleEvent = useCallback(
    async (message: MessageEvent<string>, channel: RTCDataChannel) => {
      if (channelRef.current !== channel) return;
      const event = parseEvent(message.data);
      if (!event) return;
      switch (event.kind) {
        case "started":
          if (connectionTimeout.current !== null) clearTimeout(connectionTimeout.current);
          connectionTimeout.current = null;
          sessionStartedRef.current = true;
          setSessionSequence((value) => value + 1);
          if (playbackReadyRef.current) setStatus("connected");
          return;
        case "instructions-appended": {
          const pendingAnnouncement = pendingAnnouncementRef.current;
          if (!pendingAnnouncement || pendingAnnouncement.instructionId !== event.clientEventId)
            return;
          pendingAnnouncementRef.current = null;
          send({
            type: "session.commentary.append",
            event_id: crypto.randomUUID(),
            delegation_id: null,
            content: pendingAnnouncement.content,
          });
          if (!audioMuted) {
            speechDeadlineRef.current =
              Date.now() + Math.min(20_000, 1_200 + pendingAnnouncement.content.length * 45);
            setIsSpeaking(true);
          }
          return;
        }
        case "closed":
          if (closeResolver.current) closeResolver.current();
          else cleanup();
          return;
        case "error":
          cleanup();
          setStatus("error");
          setError(
            "The voice service reported an error. Choose Retry voice to reconnect. Your game is saved.",
          );
          return;
        case "transcript": {
          if (event.source === "user") {
            speechDeadlineRef.current = 0;
            setIsSpeaking(false);
            const transcript = `${userTranscriptItems.current.get(event.itemId) ?? ""}${event.delta}`;
            userTranscriptItems.current.set(event.itemId, transcript);
            void executor.onUserTranscript?.(transcript, event.itemId);
          }
          const sameSource = transcriptSource.current === event.source;
          transcriptSource.current = event.source;
          setCaption((previous) =>
            (sameSource
              ? previous + event.delta
              : `${event.source === "user" ? "You" : "Companion"}: ${event.delta}`
            ).slice(-1200),
          );
          return;
        }
        case "tool": {
          if (handledCalls.current.has(event.callId)) return;
          handledCalls.current.add(event.callId);
          let output: string;
          try {
            output = await executor.execute(event.name, event.arguments);
          } catch {
            output = JSON.stringify({
              status: "error",
              message: "The request could not finish. Ask the player to try again.",
            });
          }
          if (!audioMuted) {
            speechDeadlineRef.current = Date.now() + 8_000;
            setIsSpeaking(true);
          }
          if (channelRef.current !== channel || channel.readyState !== "open") return;
          send({
            type: "response.item.create",
            event_id: crypto.randomUUID(),
            item: { type: "function_call_output", call_id: event.callId, output },
          });
          send({ type: "response.create", event_id: crypto.randomUUID() });
        }
      }
    },
    [audioMuted, cleanup, executor, send],
  );

  const start = useCallback(async () => {
    if (starting.current || peerRef.current || status === "closing") return;
    starting.current = true;
    const attempt = ++generation.current;
    const request = new AbortController();
    requestRef.current = request;
    setStatus("connecting");
    setError(null);
    setNeedsAudioActivation(false);
    setCaption("");
    transcriptSource.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (generation.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !microphoneMuted;
      });
      connectionTimeout.current = setTimeout(() => {
        if (generation.current !== attempt) return;
        cleanup();
        setStatus("error");
        setError(
          "Voice connection timed out. Check your connection and try again. Typed commands still work.",
        );
      }, 40_000);
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = audioMuted;
      audio.volume = volume / 100;
      audioRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        try {
          const context = new AudioContext();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaStreamSource(event.streams[0]).connect(analyser);
          speechContextRef.current = context;
          speechAnalyserRef.current = analyser;
          void context.resume().catch(() => undefined);
        } catch {
          /* Use the bounded timer if playback analysis is unavailable. */
        }
        void audio.play().then(
          () => {
            playbackReadyRef.current = true;
            setNeedsAudioActivation(false);
            if (sessionStartedRef.current) setStatus("connected");
          },
          () => {
            playbackReadyRef.current = false;
            stream.getAudioTracks().forEach((track) => {
              track.enabled = false;
            });
            setNeedsAudioActivation(true);
            setError("Your browser blocked automatic voice audio. Choose Start voice to continue.");
          },
        );
      };
      peer.onconnectionstatechange = () => {
        if (peerRef.current !== peer) return;
        if (peer.connectionState === "connected" && disconnectTimeout.current !== null) {
          clearTimeout(disconnectTimeout.current);
          disconnectTimeout.current = null;
        }
        const fail = () => {
          cleanup();
          setStatus("error");
          setError(
            "The voice connection ended. Your game is saved. You can reconnect or use typed commands.",
          );
        };
        if (peer.connectionState === "failed") fail();
        if (peer.connectionState === "disconnected" && disconnectTimeout.current === null)
          disconnectTimeout.current = setTimeout(fail, 3000);
      };
      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", (event: MessageEvent<string>) => {
        void handleEvent(event, channel);
      });
      await peer.setLocalDescription(await peer.createOffer());
      await Promise.race([
        waitForIce(peer),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Microphone connection setup timed out.")), 10_000),
        ),
      ]);
      if (generation.current !== attempt) return;
      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, view, gameId }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
      });
      const text = await response.text();
      if (generation.current !== attempt) return;
      const sdp = response.ok ? parseSession(text) : null;
      if (!sdp) {
        let serverMessage: string | undefined;
        try {
          const problem = JSON.parse(text) as { error?: unknown };
          if (typeof problem.error === "string" && problem.error.trim())
            serverMessage = problem.error.trim().slice(0, 600);
        } catch {
          serverMessage = undefined;
        }
        const messages: Record<number, string> = {
          403: "Voice is not allowed on this origin. Check the server origin settings.",
          429: "Too many voice starts. Wait a minute, then try again.",
          503: "Live voice needs OPENAI_API_KEY on the server. Typed commands still work.",
        };
        throw new Error(
          serverMessage ??
            messages[response.status] ??
            `Voice could not connect (${response.status}). Please try again. Typed commands still work.`,
        );
      }
      await peer.setRemoteDescription({ type: "answer", sdp });
      window.localStorage.setItem(VOICE_ENABLED_KEY, "true");
      starting.current = false;
    } catch (cause) {
      if (generation.current !== attempt) return;
      cleanup();
      setStatus("error");
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access for this site, then choose Retry voice."
          : cause instanceof Error
            ? cause.message
            : "Voice startup failed. Check microphone permission and try again.",
      );
    }
  }, [audioMuted, cleanup, gameId, handleEvent, microphoneMuted, status, volume, view]);

  const activateAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      await start();
      return;
    }
    try {
      await speechContextRef.current?.resume();
      await audio.play();
      playbackReadyRef.current = true;
      setNeedsAudioActivation(false);
      setError(null);
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !microphoneMuted;
      });
      if (sessionStartedRef.current) setStatus("connected");
      window.localStorage.setItem(VOICE_ENABLED_KEY, "true");
    } catch {
      setError("Voice audio is still blocked. Check this site's audio permission and try again.");
    }
  }, [microphoneMuted, start]);

  const toggleMicrophone = useCallback(() => {
    const next = !microphoneMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMicrophoneMuted(next);
    window.localStorage.setItem(MICROPHONE_MUTED_KEY, String(next));
  }, [microphoneMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = audioMuted;
      audioRef.current.volume = volume / 100;
    }
  }, [audioMuted, volume]);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (audioMuted || status !== "connected") {
      setIsSpeaking(false);
      return;
    }
    const samples = new Uint8Array(256);
    const timer = window.setInterval(() => {
      const analyser = speechAnalyserRef.current;
      let hasAudio = false;
      if (analyser) {
        analyser.getByteTimeDomainData(samples);
        hasAudio = samples.some((sample) => Math.abs(sample - 128) > 3);
        if (hasAudio) {
          speechDeadlineRef.current = Date.now() + REMOTE_SPEECH_RELEASE_MS;
          if (!playbackActiveRef.current) {
            playbackActiveRef.current = true;
            setPlaybackSequence((value) => value + 1);
          }
        }
      }
      const active = hasAudio || Date.now() < speechDeadlineRef.current;
      if (!active) playbackActiveRef.current = false;
      setIsSpeaking(active);
    }, 150);
    return () => window.clearInterval(timer);
  }, [audioMuted, status]);

  return {
    status,
    error,
    caption,
    microphoneMuted,
    needsAudioActivation,
    isSpeaking,
    sessionSequence,
    playbackSequence,
    start,
    stop,
    toggleMicrophone,
    activateAudio,
    interrupt,
    announce,
  };
}
