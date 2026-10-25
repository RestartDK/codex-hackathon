export type LiveVoiceSession = {
  stop: () => void;
  /**
   * Live output is reserved for open guide questions. Game commands are spoken
   * by the app after their result has been validated, so the two paths never
   * narrate the same outcome.
   */
  setGuideAudioEnabled: (enabled: boolean) => void;
};

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
  let outputPauseTimer: number | undefined;
  let resumeAudioOnGesture: (() => void) | undefined;
  let guideAudioEnabled = false;

  const applyGuideAudioState = () => {
    if (audio) audio.muted = !guideAudioEnabled;
  };

  const flushInputTranscript = () => {
    const transcript = inputTranscript.trim();
    inputTranscript = "";
    if (transcript) onInputTranscriptComplete(transcript);
  };

  const flushOutputTranscript = () => {
    const transcript = outputTranscript.trim();
    outputTranscript = "";
    if (transcript && guideAudioEnabled) onGuideReply(transcript);
    onStatus("Listening…");
  };

  const stop = (status = "Voice is off") => {
    if (closed) return;
    closed = true;
    if (inputPauseTimer) window.clearTimeout(inputPauseTimer);
    if (outputPauseTimer) window.clearTimeout(outputPauseTimer);
    if (resumeAudioOnGesture) window.removeEventListener("pointerdown", resumeAudioOnGesture);
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
        // GPT-Live streams transcript fragments without a final-turn event.
        // A short quiet period marks one completed player command.
        if (payload.type === "session.input_transcript.delta" && text) {
          inputTranscript += text;
          onInputTranscript(text);
          if (inputPauseTimer) window.clearTimeout(inputPauseTimer);
          inputPauseTimer = window.setTimeout(flushInputTranscript, 900);
        }
        if (payload.type === "session.output_transcript.delta" && text) {
          outputTranscript += text;
          if (guideAudioEnabled) onStatus("Guide is speaking…");
          if (outputPauseTimer) window.clearTimeout(outputPauseTimer);
          outputPauseTimer = window.setTimeout(flushOutputTranscript, 900);
        }
        // Realtime compatibility remains useful for a future Realtime transport,
        // but GPT-Live sessions use the two session transcript events above.
        if (payload.type === "conversation.item.input_audio_transcription.delta" && text)
          onInputTranscript(text);
        if (payload.type === "conversation.item.input_audio_transcription.completed" && text)
          onInputTranscriptComplete(text);
        if (
          (payload.type === "response.output_audio_transcript.done" ||
            payload.type === "session.output_transcript.done") &&
          (text || outputTranscript.trim())
        ) {
          const transcript = (payload.transcript ?? outputTranscript).trim();
          if (transcript && guideAudioEnabled) onGuideReply(transcript);
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
      applyGuideAudioState();
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
    return {
      stop: () => stop(),
      setGuideAudioEnabled(enabled) {
        guideAudioEnabled = enabled;
        applyGuideAudioState();
      },
    };
  } catch (cause) {
    stop();
    throw cause;
  }
}
