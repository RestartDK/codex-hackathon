export type GuidanceCommand =
  | "capabilities"
  | "location"
  | "repeat"
  | "explain"
  | "back"
  | "home"
  | "defaults"
  | "start";

export type GuidanceSnapshot = {
  key: string;
  message: string;
  location: string;
  capabilities: string;
  explanation?: string;
};

export function parseGuidanceCommand(input: string): GuidanceCommand | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[,.!?]/g, "")
    .replace(/\s+/g, " ");
  if (/^(what can i do|what are my options|options|available commands)$/.test(value))
    return "capabilities";
  if (/^(where am i|what screen is this|current screen)$/.test(value)) return "location";
  if (/^(repeat|repeat that|say that again|what did you say)$/.test(value)) return "repeat";
  if (/^(explain|explain this|explain that|more detail)$/.test(value)) return "explain";
  if (/^(go back|back|previous)$/.test(value)) return "back";
  if (/^(go home|home|game picker|return home)$/.test(value)) return "home";
  if (/^(use the defaults|use defaults|defaults|start with the defaults)$/.test(value))
    return "defaults";
  if (/^(start the game|start game|confirm|begin)$/.test(value)) return "start";
  return null;
}

/**
 * Tracks the one guidance snapshot that has been spoken for the current mounted
 * flow. A changed snapshot is eligible immediately; reconnecting to the same
 * snapshot is not. Keeping this independent of React makes lifecycle behavior
 * deterministic and directly testable.
 */
export class GuidanceTracker {
  private spokenKey: string | null = null;

  take(snapshot: GuidanceSnapshot): string | null {
    if (snapshot.key === this.spokenKey) return null;
    this.spokenKey = snapshot.key;
    return snapshot.message;
  }

  repeat(snapshot: GuidanceSnapshot): string {
    this.spokenKey = snapshot.key;
    return snapshot.message;
  }
}

type PendingDelivery = {
  key: string;
  message: string;
  requestedSession: number | null;
  playbackBaseline: number;
};

/**
 * Keeps screen guidance pending until remote audio actually begins. A request is
 * issued once per live session, and a reconnect may issue it again only when the
 * previous session never produced playback.
 */
export class LiveGuidanceDelivery {
  private deliveredKey: string | null = null;
  private pending: PendingDelivery | null = null;

  sync(key: string, message: string): void {
    if (this.deliveredKey === key || this.pending?.key === key) return;
    this.pending = {
      key,
      message,
      requestedSession: null,
      playbackBaseline: 0,
    };
  }

  request(sessionSequence: number, playbackSequence: number): string | null {
    if (!this.pending || this.pending.requestedSession === sessionSequence) return null;
    this.pending.requestedSession = sessionSequence;
    this.pending.playbackBaseline = playbackSequence;
    return this.pending.message;
  }

  requestFailed(sessionSequence: number): void {
    if (this.pending?.requestedSession === sessionSequence) this.pending.requestedSession = null;
  }

  confirmPlayback(playbackSequence: number): boolean {
    if (!this.pending || this.pending.requestedSession === null) return false;
    if (playbackSequence <= this.pending.playbackBaseline) return false;
    this.deliveredKey = this.pending.key;
    this.pending = null;
    return true;
  }

  currentMessage(): string | null {
    return this.pending?.message ?? null;
  }
}

export function isCurrentSetupAnswer(
  currentStep: string,
  submittedFields: readonly string[],
  awaitingConfirmation = false,
): boolean {
  return (
    !awaitingConfirmation && submittedFields.length === 1 && submittedFields[0] === currentStep
  );
}
