import { describe, expect, it } from "vite-plus/test";
import { LiveTranscriptBuffer } from "./live-transcript";

describe("Live transcript grouping (not action completion)", () => {
  it("does not reuse confirmation identities after reconnecting", () => {
    const fragment = { delta: "confirm", startMs: 100, endMs: 200 };
    expect(new LiveTranscriptBuffer().append(fragment).id).not.toBe(
      new LiveTranscriptBuffer().append(fragment).id,
    );
  });
  it("uses documented timeline fields when the provider has no item IDs", () => {
    const buffer = new LiveTranscriptBuffer();
    const first = buffer.append({ delta: "use the defaults", startMs: 100, endMs: 800 });
    const next = buffer.append({ delta: "confirm", startMs: 4000, endMs: 4400 });
    expect(next.text).toBe("confirm");
    expect(next.id).not.toBe(first.id);
    expect(buffer.append({ delta: " please", startMs: 4450, endMs: 4800 }).text).toBe(
      "confirm please",
    );
  });

  it("preserves fragments and repeated words without inventing final turns", () => {
    const buffer = new LiveTranscriptBuffer();
    buffer.append({ delta: "I", startMs: 100, endMs: 200 });
    expect(buffer.append({ delta: " I suspect Emma", startMs: 500, endMs: 1000 }).text).toBe(
      "I I suspect Emma",
    );
    const bounded = buffer.append({ delta: "x".repeat(5000) });
    expect(bounded.text).toHaveLength(4000);
  });
});
