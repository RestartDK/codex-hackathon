import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChessToolExecutor } from './chessTools';

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

export function useVoiceCompanion(executor: ChessToolExecutor, audioMuted: boolean) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
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

  const announce = useCallback((content: string) => {
    send({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: null, content });
  }, [send]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
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
    send({
      type: 'response.item.create',
      event_id: crypto.randomUUID(),
      item: { type: 'function_call_output', call_id: item.call_id, output },
    });
    send({ type: 'response.create', event_id: crypto.randomUUID() });
  }, [executor, send]);

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
      peer.ontrack = (event) => { audio.srcObject = event.streams[0]; };
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
        body: JSON.stringify({ sdp: peer.localDescription?.sdp }),
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
  }, [audioMuted, cleanup, executor, handleEvent, status]);

  const toggleMicrophone = useCallback(() => {
    const next = !microphoneMuted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMicrophoneMuted(next);
  }, [microphoneMuted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = audioMuted;
  }, [audioMuted]);

  useEffect(() => cleanup, [cleanup]);

  return { status, error, caption, microphoneMuted, start, stop, toggleMicrophone, announce };
}
