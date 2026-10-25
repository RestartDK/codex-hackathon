import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedEntry } from "../../server/game/types.js";

/** A line that must be spoken in order with every other public game line. */
export type SpokenLine = {
  id: string;
  speaker: string;
  text: string;
  /** Always `assistant` for public narration, kept extensible for a TTS backend. */
  voiceKey?: string;
  /** Begin with browser speech instead of waiting for a server narration request. */
  instant?: boolean;
  /** Unlock the next game turn once this phase-setting line finishes. */
  phaseBoundary?: boolean;
  /**
   * Play this local accessibility response while the Live Voice companion is
   * connected. The companion handles open questions; the app handles commands
   * and reads authoritative game information.
   */
  duringLive?: boolean;
};

export type NarrationVoice = {
  preferredNames: string[];
  locales: string[];
  rate: number;
  pitch: number;
};

/**
 * The only browser-TTS identity. The assistant reads every public line, including
 * NPC dialogue, so villagers never receive separate synthetic voices.
 *
 * `preferredNames` are intentionally suggestions: installed browser voice names differ
 * between macOS, Windows, Android, and Chromium. The selector falls back to a stable
 * compatible voice when none of these names exists.
 */
export const browserVoiceProfiles: Record<string, NarrationVoice> = {
  assistant: {
    preferredNames: ["Samantha", "Ava", "Google US English"],
    locales: ["en-US", "en"],
    rate: 0.94,
    pitch: 1,
  },
  default: { preferredNames: [], locales: ["en", "fr"], rate: 1, pitch: 1 },
};

export type NarrationRequest = {
  line: SpokenLine;
  voice: NarrationVoice;
  volume: number;
  onFinished: () => void;
};

/**
 * A narrow adapter around one narration provider. The queue only relies on this
 * contract, so a server-backed TTS provider can replace browser synthesis without
 * changing game, guide, or UI code.
 */
export interface NarrationBackend {
  isSupported(): boolean;
  speak(request: NarrationRequest): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

const compatibleLocale = (locale: string, preferences: string[]) =>
  preferences.some((preference) =>
    locale.toLocaleLowerCase().startsWith(preference.toLocaleLowerCase()),
  );

const stableIndex = (value: string, length: number) => {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) total += value.charCodeAt(index);
  return length ? total % length : 0;
};

/** Select a named installed voice first, then make a stable compatible fallback choice. */
export function selectBrowserVoice(voiceKey: string | undefined, voices: SpeechSynthesisVoice[]) {
  const profile = browserVoiceProfiles[voiceKey ?? "default"] ?? browserVoiceProfiles.default;
  const preferred = voices.find((voice) =>
    profile.preferredNames.some((name) =>
      voice.name.toLocaleLowerCase().includes(name.toLocaleLowerCase()),
    ),
  );
  if (preferred) return preferred;
  const compatible = voices.filter((voice) => compatibleLocale(voice.lang, profile.locales));
  const candidates = compatible.length ? compatible : voices;
  return candidates[stableIndex(voiceKey ?? "default", candidates.length)];
}

/** Default local fallback. Replace this factory to use recorded or server-generated audio. */
export function createBrowserNarrationBackend(): NarrationBackend {
  const isSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
  // Resolve the assistant voice once for this game. If the browser exposes an
  // empty voice list at first, retain its default choice for the whole session
  // rather than switching identity when that list later loads.
  const selectedVoices = new Map<string, SpeechSynthesisVoice | null>();

  const voiceFor = (voiceKey: string | undefined) => {
    const key = voiceKey ?? "default";
    const installed = window.speechSynthesis.getVoices();
    if (selectedVoices.has(key)) {
      const cached = selectedVoices.get(key) ?? null;
      if (!cached || installed.includes(cached)) return cached;
    }
    const selected = selectBrowserVoice(key, installed);
    const voice = selected ?? null;
    selectedVoices.set(key, voice);
    return voice;
  };

  return {
    isSupported,
    speak({ line, voice, volume, onFinished }) {
      if (!isSupported()) {
        onFinished();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(line.text);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        onFinished();
      };
      utterance.volume = volume;
      utterance.rate = voice.rate;
      utterance.pitch = voice.pitch;
      utterance.voice = voiceFor(line.voiceKey);
      utterance.onend = finish;
      utterance.onerror = finish;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    },
    cancel() {
      if (isSupported()) window.speechSynthesis.cancel();
    },
    pause() {
      if (isSupported()) window.speechSynthesis.pause();
    },
    resume() {
      if (isSupported()) window.speechSynthesis.resume();
    },
  };
}

/**
 * Uses the server-owned OpenAI speech route when a game session is available.
 * A failed or unavailable provider falls back to the browser voice automatically,
 * so narration remains playable without credentials.
 */
export function createOpenAINarrationBackend(
  gameId: string | undefined,
  sessionToken: string | undefined,
): NarrationBackend {
  const browserFallback = createBrowserNarrationBackend();
  let controller: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let objectUrl: string | undefined;
  let generation = 0;
  let remoteUnavailable = false;

  const clearPlayback = () => {
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = undefined;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    }
  };

  return {
    isSupported: () =>
      typeof window !== "undefined" && ("Audio" in window || browserFallback.isSupported()),
    speak(request) {
      if (request.line.instant || !gameId || !sessionToken || remoteUnavailable) {
        browserFallback.speak(request);
        return;
      }
      const current = ++generation;
      let finished = false;
      let fallbackStarted = false;
      const finish = () => {
        if (current !== generation || finished) return;
        finished = true;
        controller = undefined;
        clearPlayback();
        request.onFinished();
      };
      const useBrowserFallback = () => {
        if (current !== generation || finished || fallbackStarted) return;
        fallbackStarted = true;
        clearPlayback();
        browserFallback.speak({ ...request, onFinished: finish });
      };
      controller = new AbortController();
      void fetch(`/api/games/${gameId}/narration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Game-Session": sessionToken,
        },
        body: JSON.stringify({ text: request.line.text }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            remoteUnavailable = true;
            throw new Error("Narration provider is unavailable.");
          }
          return response.blob();
        })
        .then((blob) => {
          if (current !== generation) return;
          objectUrl = URL.createObjectURL(blob);
          const playback = new Audio(objectUrl);
          audio = playback;
          playback.volume = request.volume;
          playback.playbackRate = request.voice.rate;
          playback.onended = finish;
          playback.onerror = useBrowserFallback;
          return playback.play().catch(useBrowserFallback);
        })
        .catch((cause: unknown) => {
          if (
            current !== generation ||
            (cause instanceof DOMException && cause.name === "AbortError")
          )
            return;
          remoteUnavailable = true;
          useBrowserFallback();
        });
    },
    cancel() {
      generation += 1;
      controller?.abort();
      controller = undefined;
      clearPlayback();
      browserFallback.cancel();
    },
    pause() {
      if (audio) audio.pause();
      else browserFallback.pause();
    },
    resume() {
      if (audio) void audio.play();
      else browserFallback.resume();
    },
  };
}

let browserNarrationPrimed = false;

/**
 * Some browsers only allow their first speech-synthesis call from a direct click.
 * Prime a silent utterance while the player presses Start so the opening guide can
 * speak once the game request returns.
 */
export function primeBrowserNarration() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (browserNarrationPrimed) return;
  browserNarrationPrimed = true;
  const primer = new SpeechSynthesisUtterance(" ");
  primer.volume = 0;
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(primer);
}

export type StoryAudioOptions = {
  feed: FeedEntry[] | undefined;
  gameId: string | undefined;
  phase: string | undefined;
  /** Reveals the new phase exactly when its spoken transition begins. */
  onPhaseBoundaryStart?: () => void;
  /** A private guide line that needs to play before the first public story line. */
  openingLine?: SpokenLine;
  backend?: NarrationBackend;
};

/**
 * Shared queue for narrator, NPC, and private-guide text. This is the integration
 * point for any future TTS provider: preserve the ordered `NarrationBackend` contract.
 */
export function useStoryAudio({
  feed,
  gameId,
  phase,
  onPhaseBoundaryStart,
  openingLine,
  backend,
}: StoryAudioOptions) {
  const [autoRead, setAutoRead] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [speechRate, setSpeechRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string>();
  const [phaseTransitioning, setPhaseTransitioning] = useState(false);
  const queueRef = useRef<SpokenLine[]>([]);
  const seenRef = useRef(new Set<string>());
  const gameRef = useRef<string | undefined>(undefined);
  const phaseRef = useRef<string | undefined>(undefined);
  const onPhaseBoundaryStartRef = useRef(onPhaseBoundaryStart);
  const speakingRef = useRef(false);
  // Browser speech can call an old completion handler just after cancel(). Keep
  // one generation and one active playback ID so a stale handler cannot advance
  // a newly-started narration queue.
  const playbackGenerationRef = useRef(0);
  const activePlaybackRef = useRef<string | undefined>(undefined);
  const autoReadRef = useRef(autoRead);
  const mutedRef = useRef(muted);
  const pausedRef = useRef(paused);
  const volumeRef = useRef(volume);
  const speechRateRef = useRef(speechRate);
  const lastLineRef = useRef<SpokenLine | undefined>(undefined);
  const publicLinesRef = useRef<SpokenLine[]>([]);
  const backendRef = useRef<NarrationBackend>(backend ?? createBrowserNarrationBackend());

  useEffect(() => {
    if (!backend || backendRef.current === backend) return;
    playbackGenerationRef.current += 1;
    activePlaybackRef.current = undefined;
    backendRef.current.cancel();
    backendRef.current = backend;
    speakingRef.current = false;
    setActiveSpeaker(undefined);
  }, [backend]);
  useEffect(() => {
    onPhaseBoundaryStartRef.current = onPhaseBoundaryStart;
  }, [onPhaseBoundaryStart]);

  function stop() {
    queueRef.current = [];
    speakingRef.current = false;
    playbackGenerationRef.current += 1;
    activePlaybackRef.current = undefined;
    backendRef.current.cancel();
    pausedRef.current = false;
    setPaused(false);
    setPhaseTransitioning(false);
    onPhaseBoundaryStartRef.current?.();
    setActiveSpeaker(undefined);
  }

  const playNext = useCallback(function playNext() {
    const narration = backendRef.current;
    if (
      !narration.isSupported() ||
      !autoReadRef.current ||
      mutedRef.current ||
      pausedRef.current ||
      speakingRef.current
    )
      return;
    const next = queueRef.current.shift();
    if (!next) {
      setActiveSpeaker(undefined);
      return;
    }
    const profile = browserVoiceProfiles.assistant;
    const voice = { ...profile, rate: profile.rate * speechRateRef.current };
    const generation = playbackGenerationRef.current;
    const playbackId = crypto.randomUUID();
    speakingRef.current = true;
    activePlaybackRef.current = playbackId;
    setActiveSpeaker(next.speaker);
    lastLineRef.current = next;
    if (next.phaseBoundary) onPhaseBoundaryStartRef.current?.();
    narration.speak({
      line: next,
      voice,
      volume: volumeRef.current,
      onFinished: () => {
        if (
          generation !== playbackGenerationRef.current ||
          activePlaybackRef.current !== playbackId
        )
          return;
        activePlaybackRef.current = undefined;
        speakingRef.current = false;
        setActiveSpeaker(undefined);
        if (next.phaseBoundary) setPhaseTransitioning(false);
        // Leave just enough room for the browser to release the old utterance
        // before starting the next short response.
        window.setTimeout(playNext, 30);
      },
    });
  }, []);

  function enqueue(line: SpokenLine) {
    if (!line.text.trim()) return;
    queueRef.current.push(line);
    playNext();
  }

  function repeatLast() {
    const line = lastLineRef.current;
    if (!line) return;
    queueRef.current.unshift({ ...line, id: crypto.randomUUID() });
    playNext();
  }

  function replayPublicLines() {
    queueRef.current.push(
      ...publicLinesRef.current.map((line) => ({ ...line, id: crypto.randomUUID() })),
    );
    playNext();
  }

  function toggleAutoRead() {
    const next = !autoReadRef.current;
    autoReadRef.current = next;
    setAutoRead(next);
    if (!next) stop();
    else playNext();
  }

  function toggleMuted() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) stop();
    else playNext();
  }

  function updateVolume(next: number) {
    volumeRef.current = next;
    setVolume(next);
  }

  function updateSpeechRate(next: number) {
    const clamped = Math.min(1.35, Math.max(0.7, next));
    speechRateRef.current = clamped;
    setSpeechRate(clamped);
  }

  function pause() {
    if (pausedRef.current) return;
    backendRef.current.pause();
    pausedRef.current = true;
    setPaused(true);
  }

  function resume() {
    if (!pausedRef.current) return;
    backendRef.current.resume();
    pausedRef.current = false;
    setPaused(false);
    playNext();
  }

  function togglePause() {
    if (pausedRef.current) resume();
    else pause();
  }

  useEffect(() => {
    autoReadRef.current = autoRead;
  }, [autoRead]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    if (!feed || !gameId) return;
    if (gameRef.current !== gameId) {
      gameRef.current = gameId;
      phaseRef.current = phase;
      seenRef.current = new Set();
      queueRef.current = [];
      publicLinesRef.current = [];
      speakingRef.current = false;
      playbackGenerationRef.current += 1;
      activePlaybackRef.current = undefined;
      setPhaseTransitioning(false);
      backendRef.current.cancel();
      window.queueMicrotask(() => setActiveSpeaker(undefined));
    }
    const phaseChanged = phaseRef.current !== undefined && phaseRef.current !== phase;
    phaseRef.current = phase;
    if (phaseChanged) {
      // A round can advance while earlier NPC dialogue is still queued. Drop that
      // old scene so the first thing heard always describes the phase now on screen.
      queueRef.current = [];
      speakingRef.current = false;
      playbackGenerationRef.current += 1;
      activePlaybackRef.current = undefined;
      backendRef.current.cancel();
      window.queueMicrotask(() => setActiveSpeaker(undefined));
    }
    if (openingLine && !seenRef.current.has(openingLine.id)) {
      seenRef.current.add(openingLine.id);
      queueRef.current.push(openingLine);
    }
    const freshEntries = feed.filter((entry) => {
      if (seenRef.current.has(entry.id)) return false;
      seenRef.current.add(entry.id);
      return true;
    });
    const phaseEventId = phaseChanged
      ? freshEntries.filter((entry) => entry.kind === "event").at(-1)?.id
      : undefined;
    const hasPhaseBoundary = Boolean(
      phaseEventId && autoReadRef.current && !mutedRef.current && backendRef.current.isSupported(),
    );
    if (phaseChanged) setPhaseTransitioning(hasPhaseBoundary);
    if (phaseChanged && !hasPhaseBoundary) onPhaseBoundaryStartRef.current?.();
    const entriesToNarrate =
      phaseChanged && phaseEventId
        ? [
            // A private result belongs to the ending phase, so read it before
            // revealing the next one.
            ...freshEntries.filter((entry) => entry.kind === "private"),
            // Deaths, exiles, and other outcomes are recorded immediately before
            // the phase-setting line. They must be spoken too; otherwise a player
            // only hears that dawn arrived and can miss who died.
            ...freshEntries.filter((entry) => entry.kind === "event" && entry.id !== phaseEventId),
            freshEntries.find((entry) => entry.id === phaseEventId)!,
            ...freshEntries.filter(
              (entry) =>
                entry.id !== phaseEventId && entry.kind !== "event" && entry.kind !== "private",
            ),
          ]
        : freshEntries;
    for (const entry of entriesToNarrate) {
      const isPhaseBoundary = entry.id === phaseEventId;
      const line: SpokenLine = {
        id: entry.id,
        speaker: entry.speaker,
        text:
          entry.kind === "private"
            ? `Private guide: ${entry.text}`
            : entry.speaker === "Narrator"
              ? `Narrator: ${entry.text}`
              : `${entry.speaker} says: ${entry.text}`,
        voiceKey: "assistant",
        // State-setting narration and private results must not wait on network TTS.
        ...(isPhaseBoundary || entry.kind === "private" ? { instant: true } : {}),
        ...(isPhaseBoundary ? { phaseBoundary: true } : {}),
      };
      if (entry.kind !== "private") publicLinesRef.current.push(line);
      queueRef.current.push(line);
    }
    playNext();
  }, [feed, gameId, openingLine, phase, playNext]);
  useEffect(
    () => () => {
      backendRef.current.cancel();
    },
    [],
  );

  return {
    activeSpeaker,
    autoRead,
    enqueue,
    muted,
    pause,
    paused,
    phaseTransitioning,
    replayPublicLines,
    repeatLast,
    resume,
    speechRate,
    stop,
    toggleAutoRead,
    toggleMuted,
    togglePause,
    updateVolume,
    updateSpeechRate,
    volume,
  };
}
