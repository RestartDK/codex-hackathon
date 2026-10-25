export type LiveVoiceSession = {
  stop: () => void;
};

export type LiveVoiceCallbacks = {
  onStatus: (message: string) => void;
  onInputTranscript: (text: string) => void;
  onInputTranscriptComplete: (text: string) => void;
  onClosed: () => void;
};

/** A game session is authenticated; the public lobby session carries no game credentials. */
export type LiveVoiceTarget =
  | { kind: "game"; gameId: string; sessionToken: string }
  | { kind: "lobby" };

export type StartLiveVoiceOptions = LiveVoiceCallbacks & {
  target: LiveVoiceTarget;
  /** Lets an owning screen cancel startup before a microphone or connection leaks. */
  signal?: AbortSignal;
};

type LiveSessionRequest = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

function sessionRequest(target: LiveVoiceTarget, sdp: string | undefined): LiveSessionRequest {
  return target.kind === "game"
    ? {
        url: `/api/games/${target.gameId}/voice`,
        headers: { "Content-Type": "application/json", "X-Game-Session": target.sessionToken },
        body: { sdp },
      }
    : {
        url: "/api/voice/session",
        headers: { "Content-Type": "application/json" },
        body: { sdp, mode: "lobby" },
      };
}

function answerSdp(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { sdp?: unknown; transport?: unknown };
  if (typeof record.sdp === "string") return record.sdp;
  if (!record.transport || typeof record.transport !== "object") return null;
  const sdp = (record.transport as { sdp?: unknown }).sdp;
  return typeof sdp === "string" ? sdp : null;
}

function errorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

type LiveTransportEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
};

/**
 * Opens the player-guide WebRTC connection. NPC narration deliberately does not
 * use this path: it stays in the ordered story-audio queue.
 */
export async function startLiveVoice({
  target,
  onStatus,
  onInputTranscript,
  onInputTranscriptComplete,
  onClosed,
  signal,
}: StartLiveVoiceOptions): Promise<LiveVoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("Live voice needs a browser with microphone support.");

  let peerConnection: RTCPeerConnection | undefined;
  let stream: MediaStream | undefined;
  let dataChannel: RTCDataChannel | undefined;
  let closed = false;
  let inputTranscript = "";
  let inputPauseTimer: number | undefined;
  let inputTurnFinalized = false;
  let transcriptTransport: "live" | "compatibility" | undefined;
  let stopOnAbort: (() => void) | undefined;

  const throwIfAborted = () => {
    if (signal?.aborted)
      throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  };

  const clearInputPauseTimer = () => {
    if (inputPauseTimer !== undefined) window.clearTimeout(inputPauseTimer);
    inputPauseTimer = undefined;
  };

  const finalizeInputTranscript = (completedTranscript?: string) => {
    if (closed || inputTurnFinalized) return;
    const transcript = (completedTranscript ?? inputTranscript).trim();
    inputTranscript = "";
    clearInputPauseTimer();
    if (!transcript) return;
    inputTurnFinalized = true;
    onInputTranscriptComplete(transcript);
  };

  const queueInputTranscript = (text: string) => {
    if (inputTurnFinalized) inputTurnFinalized = false;
    inputTranscript += text;
    onInputTranscript(text);
    clearInputPauseTimer();
    // GPT-Live streams transcript fragments without a final-turn event. A
    // short pause lets a natural multiword command complete without restoring
    // the former near-second delay.
    inputPauseTimer = window.setTimeout(() => finalizeInputTranscript(), 650);
  };

  const stop = (status = "Voice is off") => {
    if (closed) return;
    closed = true;
    clearInputPauseTimer();
    if (stopOnAbort) signal?.removeEventListener("abort", stopOnAbort);
    dataChannel?.close();
    dataChannel = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    peerConnection?.close();
    peerConnection = undefined;
    onClosed();
    onStatus(status);
  };

  stopOnAbort = () => stop();
  signal?.addEventListener("abort", stopOnAbort, { once: true });

  try {
    throwIfAborted();
    onStatus("Requesting microphone…");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (closed || signal?.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      stream = undefined;
      throwIfAborted();
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    throwIfAborted();
    peerConnection = new RTCPeerConnection();
    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as LiveTransportEvent;
        const text = payload.delta ?? payload.transcript;
        if (payload.type === "session.input_transcript.delta" && text) {
          transcriptTransport = "live";
          queueInputTranscript(text);
        }
        // Retain a Realtime-compatible input path for older transports. Once
        // GPT-Live transcript events arrive, ignore a later compatibility
        // completion event so one spoken command cannot run twice.
        if (
          transcriptTransport !== "live" &&
          payload.type === "conversation.item.input_audio_transcription.delta" &&
          text
        ) {
          transcriptTransport = "compatibility";
          queueInputTranscript(text);
        }
        if (
          transcriptTransport !== "live" &&
          payload.type === "conversation.item.input_audio_transcription.completed"
        ) {
          transcriptTransport = "compatibility";
          finalizeInputTranscript(text);
        }
        if (payload.type === "error") stop("Live voice reported an error. End and try again.");
      } catch {
        // Ignore non-JSON messages from the WebRTC data channel.
      }
    };
    dataChannel.onerror = () => stop("Live voice connection had an error.");
    // This connection is transcription-only. Deliberately leave incoming model
    // media unattached so it can never overlap the app's single narrator.
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection?.connectionState === "failed")
        stop("Live voice connection failed. End and try again.");
    };
    stream.getTracks().forEach((track) => peerConnection!.addTrack(track, stream!));
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const request = sessionRequest(target, offer.sdp);
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal,
    });
    const data: unknown = await response.json();
    if (!response.ok) throw new Error(errorMessage(data) ?? "Could not start live voice.");
    const sdp = answerSdp(data);
    if (!sdp) throw new Error("Live voice returned an invalid session.");
    throwIfAborted();
    await peerConnection.setRemoteDescription({ type: "answer", sdp });
    throwIfAborted();
    return { stop: () => stop() };
  } catch (cause) {
    stop();
    throw cause;
  }
}
