export type SpeechRecognitionSession = { stop: () => void };

type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type RecognitionEvent = {
  /** Browser recognition events retain earlier results, so begin at this index. */
  resultIndex?: number;
  results: ArrayLike<RecognitionResult>;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => Recognition;

const recognitionConstructor = () => {
  const browser = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
};

/**
 * Browser-only persistent microphone transcription. It restarts after a normal
 * recognition end so one enabled microphone can handle a whole match. It never
 * contacts the game provider directly.
 */
export function startPersistentSpeechRecognition({
  language = "en-US",
  onTranscript,
  onError,
  onStopped,
}: {
  language?: string;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onStopped: () => void;
}): SpeechRecognitionSession | undefined {
  const Recognition = recognitionConstructor();
  if (!Recognition) return undefined;
  const recognition = new Recognition();
  let stopped = false;
  let restartTimer: number | undefined;
  let recoverableError = false;
  const begin = () => {
    if (stopped) return;
    try {
      recognition.start();
    } catch {
      // Some browser implementations throw while finishing the previous result.
      restartTimer = window.setTimeout(begin, 300);
    }
  };
  recognition.lang = language;
  recognition.interimResults = false;
  recognition.continuous = true;
  recognition.onresult = (event) => {
    const firstNewResult = event.resultIndex ?? 0;
    for (let index = firstNewResult; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result || result.isFinal === false) continue;
      const transcript = result[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    }
  };
  recognition.onerror = (event) => {
    // `network` is not recoverable in many embedded browsers. Let the caller
    // switch to its provider-backed voice fallback instead of retrying forever.
    const terminal = ["not-allowed", "service-not-allowed", "audio-capture", "network"].includes(
      event.error,
    );
    recoverableError = !terminal;
    onError(event.error);
    if (terminal) stopped = true;
  };
  recognition.onend = () => {
    if (stopped) {
      onStopped();
      return;
    }
    // Restart after routine ends and recoverable browser recognition failures.
    restartTimer = window.setTimeout(begin, recoverableError ? 600 : 180);
    recoverableError = false;
  };
  begin();
  return {
    stop: () => {
      stopped = true;
      if (restartTimer) window.clearTimeout(restartTimer);
      recognition.stop();
    },
  };
}
