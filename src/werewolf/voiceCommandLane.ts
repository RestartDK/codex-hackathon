export function voiceOrbAction(state: {
  needsAudioActivation: boolean;
  connected: boolean;
  busy: boolean;
  microphoneMuted: boolean;
  commandsPaused: boolean;
}) {
  if (state.needsAudioActivation) return "activate";
  if (state.busy) return "wait";
  if (!state.connected) return "start";
  if (state.microphoneMuted) return "unmute";
  return state.commandsPaused ? "resume" : "pause";
}

/** Serialize actions without capturing the screen handler from an earlier phase. */
export class VoiceCommandLane {
  private queue = Promise.resolve();
  private directConfirmation: { text: string; expires: number } | undefined;
  private revision = 0;

  private normalize(text: string) {
    return text
      .trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  /** The setup transcript fast path and its later tool call are one command. */
  confirmedDirectly(text: string) {
    this.directConfirmation = { text: this.normalize(text), expires: Date.now() + 15_000 };
  }

  consumeDirectConfirmation(text: string) {
    if (!this.directConfirmation) return false;
    if (this.directConfirmation.expires < Date.now()) {
      this.directConfirmation = undefined;
      return false;
    }
    if (this.directConfirmation.text !== this.normalize(text)) return false;
    this.directConfirmation = undefined;
    return true;
  }

  enqueue(text: string, currentHandler: () => (text: string) => Promise<void>) {
    const revision = this.revision;
    const queued = this.queue
      .catch(() => undefined)
      .then(async () => {
        // Let React commit the previous command's screen before selecting its handler.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (revision === this.revision) await currentHandler()(text);
      });
    this.queue = queued;
    return queued;
  }

  reset() {
    this.revision++;
    this.queue = Promise.resolve();
    this.directConfirmation = undefined;
  }
}
