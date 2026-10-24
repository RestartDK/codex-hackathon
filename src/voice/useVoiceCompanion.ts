import { useCallback, useEffect, useRef, useState } from 'react';
export interface VoiceToolExecutor {
  execute: (name: string, rawArguments: string) => Promise<string>;
  invalidatePending: () => void;
  getPending: () => { id: string; description: string } | null;
}

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'closing' | 'error';

type LiveEvent = {
  type?: string;
  event_id?: string;
  delegation_id?: string;
  delta?: string;
  event?: {
    type?: string;
    response_id?: string;
    item?: { type?: string; name?: string; arguments?: string; call_id?: string };
  };
};

function waitForIce(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const listener = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', listener);
        resolve();
      }
    };
    peer.addEventListener('icegatheringstatechange', listener);
  });
}

export function useVoiceCompanion(executor: VoiceToolExecutor, audioMuted: boolean, gameId = 'chess') {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechDeadlineRef = useRef(0);
  const speechContextRef = useRef<AudioContext | null>(null);
  const speechAnalyserRef = useRef<AnalyserNode | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handledCalls = useRef(new Set<string>());
  const closeResolverRef = useRef<(() => void) | null>(null);
  const disconnectTimeoutRef = useRef<number | null>(null);
  const transcriptSourceRef = useRef<'user' | 'companion' | null>(null);

  const send = useCallback((event: object) => {
    const channel = channelRef.current;
    if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
  }, []);

  const reserveSpeech = useCallback(() => {
    // Reserve time for network latency before playback begins. Actual audio
    // activity releases this gate after speech ends; the deadline prevents a
    // dropped voice response from blocking the game indefinitely.
    speechDeadlineRef.current = audioMuted ? 0 : Date.now() + 8000;
    setIsSpeaking(!audioMuted);
  }, [audioMuted]);

  const announce = useCallback((content: string) => {
    if (channelRef.current?.readyState !== 'open') return;
    reserveSpeech();
    send({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: null, content });
  }, [reserveSpeech, send]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    void speechContextRef.current?.close();
    speechContextRef.current = null;
    speechAnalyserRef.current = null;
    speechDeadlineRef.current = 0;
    setIsSpeaking(false);
    handledCalls.current.clear();
    if (disconnectTimeoutRef.current !== null) window.clearTimeout(disconnectTimeoutRef.current);
    disconnectTimeoutRef.current = null;
    executor.invalidatePending();
    setMicrophoneMuted(false);
    setStatus('idle');
  }, [executor]);

  const stop = useCallback(async () => {
    const channel = channelRef.current;
    if (channel?.readyState !== 'open') {
      cleanup();
      return;
    }
    setStatus('closing');
    const closed = new Promise<void>((resolve) => { closeResolverRef.current = resolve; });
    send({ type: 'session.close', event_id: crypto.randomUUID() });
    await Promise.race([closed, new Promise<void>((resolve) => window.setTimeout(resolve, 5000))]);
    closeResolverRef.current = null;
    cleanup();
  }, [cleanup, send]);

  const handleEvent = useCallback(async (message: MessageEvent<string>) => {
    let envelope: LiveEvent;
    try { envelope = JSON.parse(message.data) as LiveEvent; } catch { return; }
    if (envelope.type === 'session.started') {
      setStatus('connected');
      return;
    }
    if (envelope.type === 'session.closed') {
      closeResolverRef.current?.();
      return;
    }
    if (envelope.type === 'error') {
      setError('The voice service reported an error. End voice and try again.');
      return;
    }
    if (envelope.type === 'session.input_transcript.delta' || envelope.type === 'session.output_transcript.delta') {
      const source = envelope.type.includes('input') ? 'user' : 'companion';
      const label = source === 'user' ? 'You: ' : 'Companion: ';
      setCaption((previous) => (
        transcriptSourceRef.current === source
          ? `${previous}${envelope.delta ?? ''}`.slice(-800)
          : `${label}${envelope.delta ?? ''}`.slice(-800)
      ));
      transcriptSourceRef.current = source;
      return;
    }
    if (envelope.type !== 'response.event' || envelope.event?.type !== 'response.output_item.done') return;
    const item = envelope.event.item;
    if (item?.type !== 'function_call' || !item.call_id || !item.name) return;
    if (handledCalls.current.has(item.call_id)) return;
    handledCalls.current.add(item.call_id);
    const output = await executor.execute(item.name, item.arguments ?? '{}');
    reserveSpeech();
    send({
      type: 'response.item.create',
      event_id: crypto.randomUUID(),
      item: { type: 'function_call_output', call_id: item.call_id, output },
    });
    send({ type: 'response.create', event_id: crypto.randomUUID() });
  }, [executor, reserveSpeech, send]);

  const start = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') return;
    setStatus('connecting');
    setError(null);
    setCaption('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = audioMuted;
      audioRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        // Observe the same remote stream that the audio element plays. No
        // second connection to the speakers: this only measures playback.
        try {
          const context = new AudioContext();
          speechContextRef.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaStreamSource(event.streams[0]).connect(analyser);
          speechAnalyserRef.current = analyser;
          void context.resume().catch(() => undefined);
        } catch { /* Timed fallback remains available without Web Audio. */ }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected' && disconnectTimeoutRef.current !== null) {
          window.clearTimeout(disconnectTimeoutRef.current);
          disconnectTimeoutRef.current = null;
        }
        if (peer.connectionState === 'failed') {
          executor.invalidatePending();
          setStatus('error');
          setError('The voice connection ended. Your chess game is still saved.');
        }
        if (peer.connectionState === 'disconnected' && disconnectTimeoutRef.current === null) {
          disconnectTimeoutRef.current = window.setTimeout(() => {
            executor.invalidatePending();
            setStatus('error');
            setError('The voice connection was lost. Your chess game is still saved.');
          }, 3000);
        }
      };
      const channel = peer.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.addEventListener('message', handleEvent);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await Promise.race([
        waitForIce(peer),
        new Promise<void>((_, reject) => window.setTimeout(() => reject(new Error('Microphone connection setup timed out.')), 10_000)),
      ]);
      const response = await fetch('/api/voice/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, gameId }),
      });
      const responseText = await response.text();
      let result: { transport?: { sdp?: string }; error?: string };
      try {
        result = JSON.parse(responseText) as typeof result;
      } catch {
        const contentType = response.headers.get('content-type') ?? 'unknown content type';
        throw new Error(
          `The voice endpoint returned an unexpected response (${response.status}, ${contentType}). ` +
          'Make sure the tunnel points to the Vite+ app server, then refresh and try again.'
        );
      }
      if (!response.ok || !result.transport?.sdp) throw new Error(result.error ?? 'Could not create the voice session.');
      await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
    } catch (cause) {
      cleanup();
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Voice startup failed.');
    }
  }, [audioMuted, cleanup, executor, gameId, handleEvent, status]);

  const toggleMicrophone = useCallback(() => {
    const next = !microphoneMuted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMicrophoneMuted(next);
  }, [microphoneMuted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = audioMuted;
  }, [audioMuted]);

  useEffect(() => {
    if (status !== 'connected' || audioMuted) {
      setIsSpeaking(false);
      return;
    }
    const samples = new Uint8Array(256);
    const timer = window.setInterval(() => {
      const analyser = speechAnalyserRef.current;
      if (analyser) {
        analyser.getByteTimeDomainData(samples);
        const audible = samples.some((sample) => Math.abs(sample - 128) > 3);
        if (audible) {
          speechDeadlineRef.current = Date.now() + 700;
        }
      }
      setIsSpeaking(Date.now() < speechDeadlineRef.current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [audioMuted, status]);

  useEffect(() => cleanup, [cleanup]);

  return { status, error, caption, microphoneMuted, isSpeaking, start, stop, toggleMicrophone, announce };
}
