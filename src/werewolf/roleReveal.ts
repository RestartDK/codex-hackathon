import type { NarrationOutcome } from "../voice/browser-narration";

export type RoleRevealStatus =
  | "waiting"
  | "requested"
  | "speaking"
  | "completed"
  | "interrupted"
  | "failed"
  | "skipped";

/** A reveal is complete only after audio ends, never when a caption or request exists. */
export class RoleRevealDelivery {
  private key: string | null = null;
  private attempt = 0;
  status: RoleRevealStatus = "waiting";

  sync(key: string): void {
    if (key === this.key) return;
    this.key = key;
    this.attempt++;
    this.status = "waiting";
  }

  request(ready: boolean): number | null {
    if (!ready || !this.key || this.status !== "waiting") return null;
    this.status = "requested";
    return ++this.attempt;
  }

  started(attempt: number): void {
    if (attempt === this.attempt && this.status === "requested") this.status = "speaking";
  }

  finish(attempt: number, outcome: NarrationOutcome): boolean {
    if (attempt !== this.attempt || !["requested", "speaking"].includes(this.status)) return false;
    this.status = outcome === "completed" && this.status !== "speaking" ? "failed" : outcome;
    return true;
  }

  retry(): void {
    this.attempt++;
    this.status = "waiting";
  }
  skip(): void {
    this.attempt++;
    this.status = "skipped";
  }
  canContinue(): boolean {
    return this.status === "completed" || this.status === "skipped";
  }
}

export function roleHelpIntent(command: string): "role" | "abilities" | "next" | null {
  if (
    /\b(?:repeat|read|hear|explain|tell me|what(?:'s| is))\b.*\b(?:my role|my power|role)\b/iu.test(
      command,
    )
  )
    return "role";
  if (/\b(?:explain|read|repeat|what|tell me)\b.*\b(?:abilit(?:y|ies)|powers?)\b/iu.test(command))
    return "abilities";
  if (/\bwhat (?:do|should|can) i do next\b|\b(?:next action|next step)\b/iu.test(command))
    return "next";
  return null;
}
