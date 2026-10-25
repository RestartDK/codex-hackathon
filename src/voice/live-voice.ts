export type LiveVoiceSession = {
  stop: () => void;
};

export type LiveVoiceCallbacks = {
  onStatus: (message: string) => void;
  onInputTranscript: (text: string) => void;
  onInputTranscriptComplete: (text: string) => void;
  onClosed: () => void;
};

export type StartLiveVoiceOptions = LiveVoiceCallbacks & {
  gameId: string;
  sessionToken: string;
  /** Lets an owning screen cancel startup before a microphone or connection leaks. */
  signal?: AbortSignal;
};

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
  gameId,
  sessionToken,
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
    const response = await fetch(`/api/games/${gameId}/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Game-Session": sessionToken },
      body: JSON.stringify({ sdp: offer.sdp }),
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not start live voice.");
    throwIfAborted();
    await peerConnection.setRemoteDescription({ type: "answer", sdp: data.sdp });
    throwIfAborted();
    return { stop: () => stop() };
  } catch (cause) {
    stop();
    throw cause;
  }
}
