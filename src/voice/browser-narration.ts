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
  /** Essential private guidance uses explicit audio with an ended event. */
  privateRole?: boolean;
  onPlaybackStarted?: () => void;
  onPlaybackFinished?: (outcome: NarrationOutcome) => void;
};

export type NarrationOutcome = "completed" | "interrupted" | "failed";

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
  onStarted?: () => void;
  onFinished: (outcome?: NarrationOutcome) => void;
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
export function createBrowserNarrationBackend(
  onPlaybackError?: (message: string) => void,
): NarrationBackend {
  const isSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
  // Resolve the assistant voice once for this game. If the browser exposes an
  // empty voice list at first, retain its default choice for the whole session
  // rather than switching identity when that list later loads.
  const selectedVoices = new Map<string, SpeechSynthesisVoice | null>();
  let cancelActive: (() => void) | undefined;
  let pauseActive: (() => void) | undefined;
  let resumeActive: (() => void) | undefined;

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
    speak({ line, voice, volume, onStarted, onFinished }) {
      if (!isSupported()) {
        onPlaybackError?.(
          "Speech playback is unavailable in this browser. Typed commands remain available.",
        );
        onFinished("failed");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(line.text);
      let finished = false;
      let started = false;
      let startTimer: ReturnType<typeof setTimeout>;
      const finish = (outcome: NarrationOutcome) => {
        if (finished) return;
        finished = true;
        clearTimeout(startTimer);
        cancelActive = undefined;
        pauseActive = undefined;
        resumeActive = undefined;
        onFinished(outcome);
      };
      utterance.volume = volume;
      cancelActive = () => finish("interrupted");
      utterance.rate = voice.rate;
      utterance.pitch = voice.pitch;
      utterance.voice = voiceFor(line.voiceKey);
      utterance.onstart = () => {
        if (finished) return;
        started = true;
        clearTimeout(startTimer);
        onStarted?.();
      };
      utterance.onend = () => finish(started ? "completed" : "failed");
      utterance.onerror = (event) => {
        if (event.error !== "canceled" && event.error !== "interrupted") {
          onPlaybackError?.(
            event.error === "not-allowed"
              ? "Your browser blocked automatic narration. Choose Start narration to continue."
              : "Narration could not play. Choose Start narration to try again.",
          );
        }
        finish(
          event.error === "canceled" || event.error === "interrupted" ? "interrupted" : "failed",
        );
      };
      // Some browser engines fail silently without firing onerror or onstart.
      const startWatchdog = () => {
        startTimer = setTimeout(() => {
          if (started || finished) return;
          onPlaybackError?.(
            "Narration did not start. Choose Start narration to retry, or read the role explanation below.",
          );
          finish("failed");
          window.speechSynthesis.cancel();
        }, 8_000);
      };
      startWatchdog();
      pauseActive = () => clearTimeout(startTimer);
      resumeActive = () => {
        if (!started && !finished) startWatchdog();
      };
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        onPlaybackError?.("Narration could not play. Choose Start narration to try again.");
        finish("failed");
      }
    },
    cancel() {
      cancelActive?.();
      if (isSupported()) window.speechSynthesis.cancel();
    },
    pause() {
      pauseActive?.();
      if (isSupported()) window.speechSynthesis.pause();
    },
    resume() {
      resumeActive?.();
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
  onPlaybackError?: (message: string) => void,
): NarrationBackend {
  const browserFallback = createBrowserNarrationBackend(onPlaybackError);
  let controller: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let objectUrl: string | undefined;
  let generation = 0;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let pendingFallback: (() => void) | undefined;
  // Private audio stays in this game session's memory only. Changed ability
  // state gets a different key, while repeats avoid another generation request.
  const audioCache = new Map<string, Blob>();

  const clearPlayback = () => {
    clearTimeout(requestTimer);
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
      if (request.line.instant || !gameId || !sessionToken) {
        browserFallback.speak(request);
        return;
      }
      const current = ++generation;
      let finished = false;
      let fallbackStarted = false;
      const finish = (outcome: NarrationOutcome = "completed") => {
        if (current !== generation || finished) return;
        finished = true;
        controller = undefined;
        clearPlayback();
        request.onFinished(outcome);
      };
      const useBrowserFallback = () => {
        if (current !== generation || finished || fallbackStarted) return;
        if (paused) {
          clearTimeout(requestTimer);
          pendingFallback = useBrowserFallback;
          return;
        }
        fallbackStarted = true;
        clearPlayback();
        browserFallback.speak({ ...request, onFinished: finish });
      };
      controller = new AbortController();
      requestTimer = setTimeout(() => {
        if (current !== generation || finished || fallbackStarted) return;
        controller?.abort();
        useBrowserFallback();
      }, 25_000);
      const cached = audioCache.get(request.line.text);
      const narration = cached
        ? Promise.resolve(cached)
        : fetch(`/api/games/${gameId}/narration`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Game-Session": sessionToken,
            },
            body: JSON.stringify({ text: request.line.text }),
            signal: controller.signal,
          }).then(async (response) => {
            if (!response.ok) {
              throw new Error("Narration provider is unavailable.");
            }
            const blob = await response.blob();
            if (current === generation) {
              if (audioCache.size >= 12) audioCache.delete(audioCache.keys().next().value!);
              audioCache.set(request.line.text, blob);
            }
            return blob;
          });
      void narration
        .then((blob) => {
          if (current !== generation || finished || fallbackStarted) return;
          objectUrl = URL.createObjectURL(blob);
          const playback = new Audio(objectUrl);
          audio = playback;
          playback.volume = request.volume;
          playback.playbackRate = request.voice.rate;
          let started = false;
          playback.onplaying = () => {
            clearTimeout(requestTimer);
            if (current === generation && !finished && !started) {
              started = true;
              request.onStarted?.();
            }
          };
          playback.onended = () => finish(started ? "completed" : "failed");
          playback.onerror = useBrowserFallback;
          if (paused) {
            clearTimeout(requestTimer);
            return;
          }
          return playback.play().catch(useBrowserFallback);
        })
        .catch((cause: unknown) => {
          if (
            current !== generation ||
            (cause instanceof DOMException && cause.name === "AbortError")
          )
            return;
          useBrowserFallback();
        });
    },
    cancel() {
      generation += 1;
      controller?.abort();
      controller = undefined;
      paused = false;
      pendingFallback = undefined;
      clearPlayback();
      browserFallback.cancel();
    },
    pause() {
      paused = true;
      if (audio) audio.pause();
      else browserFallback.pause();
    },
    resume() {
      paused = false;
      if (pendingFallback) {
        const fallback = pendingFallback;
        pendingFallback = undefined;
        fallback();
        return;
      }
      if (audio)
        void audio
          .play()
          .catch(() =>
            onPlaybackError?.("Narration could not resume. Choose Start narration to retry."),
          );
      else browserFallback.resume();
    },
  };
}

/** Prefer free local speech. Essential guidance falls back to an explicit audio
 * element if the local engine fails or silently refuses to start. */
export function createRoleAwareNarrationBackend(
  gameId: string | undefined,
  token: string | undefined,
  onPlaybackError?: (message: string) => void,
): NarrationBackend {
  const roleBrowser = createBrowserNarrationBackend();
  const roleAudio = createOpenAINarrationBackend(gameId, token, onPlaybackError);
  let localRoleUnavailable = false;
  return {
    isSupported: () => roleBrowser.isSupported() || roleAudio.isSupported(),
    speak(request) {
      if (localRoleUnavailable) {
        roleAudio.speak({ ...request, line: { ...request.line, instant: false } });
        return;
      }
      roleBrowser.speak({
        ...request,
        onFinished: (outcome = "completed") => {
          if (outcome !== "failed") {
            request.onFinished(outcome);
            return;
          }
          localRoleUnavailable = true;
          roleAudio.speak({ ...request, line: { ...request.line, instant: false } });
        },
      });
    },
    cancel() {
      roleBrowser.cancel();
      roleAudio.cancel();
    },
    pause() {
      roleBrowser.pause();
      roleAudio.pause();
    },
    resume() {
      roleBrowser.resume();
      roleAudio.resume();
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
  /** Saved app preference supplied by the surrounding game shell. */
  initialVolume?: number;
  /** Keeps a spoken volume adjustment available after returning to the game picker. */
  onVolumeChange?: (volume: number) => void;
  feed: FeedEntry[] | undefined;
  gameId: string | undefined;
  phase: string | undefined;
  /** Reveals the new phase exactly when its spoken transition begins. */
  onPhaseBoundaryStart?: () => void;
  /** A private guide line that needs to play before the first public story line. */
  openingLine?: SpokenLine;
  /** Current-screen legal choices, read after the state changes that led here. */
  closingLine?: SpokenLine;
  onNarrationStarted?: () => void;
  onNarrationFailed?: () => void;
  backend?: NarrationBackend;
};

/**
 * Shared queue for narrator, NPC, and private-guide text. This is the integration
 * point for any future TTS provider: preserve the ordered `NarrationBackend` contract.
 */
export function useStoryAudio({
  initialVolume,
  onVolumeChange,
  feed,
  gameId,
  phase,
  onPhaseBoundaryStart,
  openingLine,
  closingLine,
  onNarrationStarted,
  onNarrationFailed,
  backend,
}: StoryAudioOptions) {
  const [autoRead, setAutoRead] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(initialVolume ?? 0.8);
  const [speechRate, setSpeechRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string>();
  const [phaseTransitioning, setPhaseTransitioning] = useState(false);
  const queueRef = useRef<SpokenLine[]>([]);
  const seenRef = useRef(new Set<string>());
  const gameRef = useRef<string | undefined>(undefined);
  const phaseRef = useRef<string | undefined>(undefined);
  const closingIdRef = useRef<string | undefined>(undefined);
  const narrationCallbacks = useRef({ onNarrationStarted, onNarrationFailed });
  useEffect(() => {
    narrationCallbacks.current = { onNarrationStarted, onNarrationFailed };
  }, [onNarrationStarted, onNarrationFailed]);
  const onPhaseBoundaryStartRef = useRef(onPhaseBoundaryStart);
  const speakingRef = useRef(false);
  // Browser speech can call an old completion handler just after cancel(). Keep
  // one generation and one active playback ID so a stale handler cannot advance
  // a newly-started narration queue.
  const playbackGenerationRef = useRef(0);
  const activePlaybackRef = useRef<string | undefined>(undefined);
  const activeLineRef = useRef<SpokenLine | undefined>(undefined);
  const autoReadRef = useRef(autoRead);
  const mutedRef = useRef(muted);
  const pausedRef = useRef(paused);
  const volumeRef = useRef(volume);
  const speechRateRef = useRef(speechRate);
  const lastLineRef = useRef<SpokenLine | undefined>(undefined);
  const publicLinesRef = useRef<SpokenLine[]>([]);
  const backendRef = useRef<NarrationBackend>(backend ?? createBrowserNarrationBackend());
  const onVolumeChangeRef = useRef(onVolumeChange);

  function interruptLines() {
    const interrupted = [activeLineRef.current, ...queueRef.current];
    activeLineRef.current = undefined;
    queueRef.current = [];
    for (const line of interrupted) line?.onPlaybackFinished?.("interrupted");
  }

  useEffect(() => {
    if (!backend || backendRef.current === backend) return;
    playbackGenerationRef.current += 1;
    activePlaybackRef.current = undefined;
    interruptLines();
    backendRef.current.cancel();
    backendRef.current = backend;
    speakingRef.current = false;
    setActiveSpeaker(undefined);
  }, [backend]);
  useEffect(() => {
    onPhaseBoundaryStartRef.current = onPhaseBoundaryStart;
  }, [onPhaseBoundaryStart]);
  useEffect(() => {
    onVolumeChangeRef.current = onVolumeChange;
  }, [onVolumeChange]);

  function stop() {
    interruptLines();
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
    if (!autoReadRef.current || mutedRef.current || pausedRef.current || speakingRef.current)
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
    activeLineRef.current = next;
    setActiveSpeaker(next.speaker);
    lastLineRef.current = next;
    narration.speak({
      line: next,
      voice,
      volume: volumeRef.current,
      onStarted: () => {
        if (
          generation === playbackGenerationRef.current &&
          activePlaybackRef.current === playbackId
        ) {
          if (next.phaseBoundary) onPhaseBoundaryStartRef.current?.();
          narrationCallbacks.current.onNarrationStarted?.();
          next.onPlaybackStarted?.();
        }
      },
      onFinished: (outcome = "completed") => {
        if (
          generation !== playbackGenerationRef.current ||
          activePlaybackRef.current !== playbackId
        )
          return;
        activePlaybackRef.current = undefined;
        activeLineRef.current = undefined;
        next.onPlaybackFinished?.(outcome);
        speakingRef.current = false;
        setActiveSpeaker(undefined);
        if (next.phaseBoundary) setPhaseTransitioning(false);
        if (outcome === "failed") {
          narrationCallbacks.current.onNarrationFailed?.();
          return;
        }
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
    stop();
    queueRef.current.unshift({
      ...line,
      id: crypto.randomUUID(),
      phaseBoundary: false,
      onPlaybackStarted: undefined,
      onPlaybackFinished: undefined,
    });
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
    onVolumeChangeRef.current?.(next);
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
      closingIdRef.current = undefined;
      seenRef.current = new Set();
      interruptLines();
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
    const closingChanged = Boolean(closingLine && closingLine.id !== closingIdRef.current);
    if (phaseChanged || closingChanged) {
      // A round can advance while earlier NPC dialogue is still queued. Drop that
      // old scene so the first thing heard always describes the phase now on screen.
      interruptLines();
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
    const batch: SpokenLine[] = [];
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
      batch.push(line);
    }
    if (closingChanged && closingLine) {
      closingIdRef.current = closingLine.id;
      batch.push(closingLine);
    }
    // One coherent scene avoids many generation requests and prevents a private
    // finding or NPC line from being mistaken for the current action prompt.
    if (closingLine && batch.length) {
      let text = "";
      let part = 0;
      for (const line of batch) {
        if (text.length + line.text.length > 1_900 && text) {
          queueRef.current.push({ id: `${closingLine.id}:${part++}`, speaker: "Guide", text });
          text = "";
        }
        text += `${text ? " " : ""}${line.text}`;
      }
      if (text)
        queueRef.current.push({ ...closingLine, text, phaseBoundary: Boolean(phaseEventId) });
    } else queueRef.current.push(...batch);
    playNext();
  }, [feed, gameId, openingLine, closingLine, phase, playNext]);
  useEffect(
    () => () => {
      interruptLines();
      playbackGenerationRef.current += 1;
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
