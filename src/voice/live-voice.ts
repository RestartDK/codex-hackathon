export type LiveVoiceSession = { stop: () => void };

export type LiveVoiceCallbacks = {
  onStatus: (message: string) => void;
  onInputTranscript: (text: string) => void;
  onInputTranscriptComplete: (text: string) => void;
  onGuideReply: (text: string) => void;
  onClosed: () => void;
};

export type StartLiveVoiceOptions = LiveVoiceCallbacks & {
  gameId: string;
  sessionToken: string;
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
  onGuideReply,
  onClosed,
}: StartLiveVoiceOptions): Promise<LiveVoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("Live voice needs a browser with microphone support.");

  let peerConnection: RTCPeerConnection | undefined;
  let stream: MediaStream | undefined;
  let dataChannel: RTCDataChannel | undefined;
  let audio: HTMLAudioElement | undefined;
  let closed = false;
  let outputTranscript = "";
  let inputTranscript = "";
  let inputPauseTimer: number | undefined;
  let resumeAudioOnGesture: (() => void) | undefined;

  const flushInputTranscript = () => {
    const transcript = inputTranscript.trim();
    inputTranscript = "";
    if (transcript) onInputTranscriptComplete(transcript);
  };

  const stop = (status = "Voice is off") => {
    if (closed) return;
    closed = true;
    if (inputPauseTimer) window.clearTimeout(inputPauseTimer);
    if (resumeAudioOnGesture)
      window.removeEventListener("pointerdown", resumeAudioOnGesture);
    dataChannel?.close();
    stream?.getTracks().forEach((track) => track.stop());
    peerConnection?.close();
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    onClosed();
    onStatus(status);
  };

  try {
    onStatus("Requesting microphone…");
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    peerConnection = new RTCPeerConnection();
    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as LiveTransportEvent;
        const text = payload.delta ?? payload.transcript;
        if (payload.type === "conversation.item.input_audio_transcription.delta" && text) {
          onInputTranscript(text);
        }
        if (payload.type === "conversation.item.input_audio_transcription.completed" && text) {
          onInputTranscriptComplete(text);
        }
        // Backward-compatible handling for the preview event names used by an
        // earlier Realtime transport. Current sessions use the two events above.
        if (payload.type === "session.input_transcript.delta" && text) {
          inputTranscript += text;
          onInputTranscript(text);
          if (inputPauseTimer) window.clearTimeout(inputPauseTimer);
          // GPT-Live streams transcript fragments without a turn-complete event.
          // A brief silence lets the same command router handle a spoken sentence once.
          inputPauseTimer = window.setTimeout(flushInputTranscript, 900);
        }
        if (
          (payload.type === "response.output_audio_transcript.delta" ||
            payload.type === "session.output_transcript.delta") &&
          text
        ) {
          outputTranscript += text;
          onStatus("Guide is speaking…");
        }
        if (
          (payload.type === "response.output_audio_transcript.done" ||
            payload.type === "session.output_transcript.done") &&
          (text || outputTranscript.trim())
        ) {
          onGuideReply((payload.transcript ?? outputTranscript).trim());
          outputTranscript = "";
          onStatus("Listening…");
        }
        if (payload.type === "error") stop("Live voice reported an error. End and try again.");
      } catch {
        // Ignore non-JSON messages from the WebRTC data channel.
      }
    };
    dataChannel.onerror = () => stop("Live voice connection had an error.");
    peerConnection.ontrack = (event) => {
      audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play().catch(() => {
        onStatus("Tap anywhere once to hear the guide.");
        resumeAudioOnGesture = () => {
          void audio?.play().catch(() => undefined);
        };
        window.addEventListener("pointerdown", resumeAudioOnGesture, { once: true, passive: true });
      });
    };
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
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not start live voice.");
    await peerConnection.setRemoteDescription({ type: "answer", sdp: data.sdp });
    return { stop: () => stop() };
  } catch (cause) {
    stop();
    throw cause;
  }
}
