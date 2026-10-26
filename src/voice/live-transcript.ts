type Fragment = { delta: string; itemId?: string; startMs?: number; endMs?: number };

/** Live sends timeline fragments, not completed turns or reliable item IDs.
 * Group for captions/limited setup checks only, never infer a game action here. */
export class LiveTranscriptBuffer {
  private current = { id: "", text: "", endMs: -1 };
  private sequence = 0;
  private sessionKey = crypto.randomUUID();

  append(fragment: Fragment) {
    const newGroup = fragment.itemId
      ? fragment.itemId !== this.current.id
      : !this.current.id ||
        (fragment.startMs !== undefined && fragment.startMs - this.current.endMs > 1_200);
    if (newGroup)
      this.current = {
        id: fragment.itemId ?? `${this.sessionKey}:speech-${++this.sequence}`,
        text: "",
        endMs: -1,
      };
    this.current.text = `${this.current.text}${fragment.delta}`.slice(-4_000);
    this.current.endMs = fragment.endMs ?? this.current.endMs;
    return { ...this.current };
  }
}
