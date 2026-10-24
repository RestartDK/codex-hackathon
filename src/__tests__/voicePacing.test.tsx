import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceCompanion } from '../voice/useVoiceCompanion';

describe('voice playback pacing', () => {
  let channel: EventTarget & { readyState: string; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let audible = false;
  beforeEach(() => {
    vi.useFakeTimers();
    audible = false;
    channel = Object.assign(new EventTarget(), { readyState: 'open', send: vi.fn(), close: vi.fn() });
    const stream = { getTracks: () => [], getAudioTracks: () => [] };
    vi.stubGlobal('Audio', class { autoplay = false; muted = false; srcObject: unknown; });
    vi.stubGlobal('AudioContext', class {
      createAnalyser() { return { fftSize: 256, getByteTimeDomainData: (samples: Uint8Array) => { samples.fill(128); if (audible) samples[0] = 150; } }; }
      createMediaStreamSource() { return { connect: vi.fn() }; }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    });
    vi.stubGlobal('RTCPeerConnection', class {
      iceGatheringState = 'complete';
      localDescription = { sdp: 'test' };
      ontrack?: (event: { streams: unknown[] }) => void;
      addTrack() {}
      createDataChannel() { return channel; }
      createOffer() { return Promise.resolve({ type: 'offer', sdp: 'test' }); }
      setLocalDescription() { return Promise.resolve(); }
      setRemoteDescription() { this.ontrack?.({ streams: [stream] }); return Promise.resolve(); }
      close() {}
    });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ transport: { sdp: 'test-answer' } }) }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function connect(audioMuted = false) {
    const executor = { execute: vi.fn(), invalidatePending: vi.fn(), getPending: () => null };
    const hook = renderHook(() => useVoiceCompanion(executor, audioMuted, 'ludo'));
    await act(async () => { await hook.result.current.start(); });
    act(() => { channel.dispatchEvent(new MessageEvent('message', { data: '{"type":"session.started"}' })); });
    return hook;
  }

  it('holds pending narration, follows remote audio, and releases after playback goes quiet', async () => {
    const { result } = await connect();
    act(() => { result.current.announce('Computer rolled two.'); });
    expect(result.current.isSpeaking).toBe(true);
    audible = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.isSpeaking).toBe(true);
    audible = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(result.current.isSpeaking).toBe(false);
  });

  it('releases a dropped narration after a bounded wait so the game cannot stall', async () => {
    const { result } = await connect();
    act(() => { result.current.announce('Computer turn.'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(result.current.isSpeaking).toBe(false);
  });

  it('does not hold game turns for muted voice output in screen-reader mode', async () => {
    const { result } = await connect(true);
    act(() => { result.current.announce('Computer turn.'); });
    expect(result.current.isSpeaking).toBe(false);
  });
});
