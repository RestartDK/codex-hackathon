import { useCallback, useEffect, useRef, useState } from "react";
import type { ChessToolExecutor } from "./chessTools";
import type { AvailableDestination } from "./navigation";

export type VoiceStatus = "idle" | "connecting" | "connected" | "closing" | "error";

type LiveEvent =
  | { kind: "started" | "closed" | "error" }
  | { kind: "transcript"; source: "user" | "companion"; delta: string }
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
  if (
    (value.type === "session.input_transcript.delta" ||
      value.type === "session.output_transcript.delta") &&
    typeof value.delta === "string"
  ) {
    return {
      kind: "transcript",
      source: value.type === "session.input_transcript.delta" ? "user" : "companion",
      delta: value.delta,
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
  executor: ChessToolExecutor,
  audioMuted: boolean,
  volume: number,
  view: AvailableDestination | "loading" | "chess-setup",
) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
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

  const send = useCallback((event: object) => {
    const channel = channelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(event));
  }, []);

  const announce = useCallback(
    (content: string) => {
      setCaption("");
      transcriptSource.current = null;
      send({
        type: "session.commentary.append",
        event_id: crypto.randomUUID(),
        delegation_id: null,
        content,
      });
    },
    [send],
  );

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
    setCaption("");
    transcriptSource.current = null;
    if (disconnectTimeout.current !== null) clearTimeout(disconnectTimeout.current);
    disconnectTimeout.current = null;
    if (connectionTimeout.current !== null) clearTimeout(connectionTimeout.current);
    connectionTimeout.current = null;
    closeResolver.current?.();
    closeResolver.current = null;
    executor.invalidatePending();
    setMicrophoneMuted(false);
    setStatus("idle");
  }, [executor]);

  const stop = useCallback(async () => {
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
          setStatus("connected");
          return;
        case "closed":
          if (closeResolver.current) closeResolver.current();
          else cleanup();
          return;
        case "error":
          setError(
            "The voice service reported an error. End voice and try again. Your chess game is safe.",
          );
          return;
        case "transcript": {
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
    [cleanup, executor, send],
  );

  const start = useCallback(async () => {
    if (starting.current || peerRef.current || status === "closing") return;
    starting.current = true;
    const attempt = ++generation.current;
    const request = new AbortController();
    requestRef.current = request;
    setStatus("connecting");
    setError(null);
    setCaption("");
    transcriptSource.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
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
        void audio
          .play()
          .catch(() =>
            setError(
              "Your browser blocked voice audio. End voice, then start it again. Captions remain available.",
            ),
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
            "The voice connection ended. Your chess game is still saved. You can reconnect or use typed commands.",
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
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, view }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
      });
      const text = await response.text();
      if (generation.current !== attempt) return;
      const sdp = response.ok ? parseSession(text) : null;
      if (!sdp) {
        const messages: Record<number, string> = {
          403: "Voice is not allowed on this origin. Check the server origin settings.",
          429: "Too many voice starts. Wait a minute, then try again.",
          503: "Live voice needs OPENAI_API_KEY on the server. Typed commands still work.",
        };
        throw new Error(
          messages[response.status] ??
            `Voice could not connect (${response.status}). Please try again. Typed commands still work.`,
        );
      }
      await peer.setRemoteDescription({ type: "answer", sdp });
      starting.current = false;
    } catch (cause) {
      if (generation.current !== attempt) return;
      cleanup();
      setStatus("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Voice startup failed. Check microphone permission and try again.",
      );
    }
  }, [audioMuted, cleanup, handleEvent, status, volume, view]);

  const toggleMicrophone = useCallback(() => {
    const next = !microphoneMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMicrophoneMuted(next);
  }, [microphoneMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = audioMuted;
      audioRef.current.volume = volume / 100;
    }
  }, [audioMuted, volume]);

  useEffect(() => cleanup, [cleanup]);

  return { status, error, caption, microphoneMuted, start, stop, toggleMicrophone, announce };
}
