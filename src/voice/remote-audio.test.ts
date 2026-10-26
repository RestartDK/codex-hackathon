import { describe, expect, it } from "vite-plus/test";
import { hasRemoteSpeech } from "./remote-audio";

describe("remote speech playback detection", () => {
  it("detects quiet real audio that disappears after byte waveform quantization", () => {
    const quiet = Float32Array.from({ length: 256 }, (_, i) => Math.sin(i) * 0.002);
    expect([...quiet].every((sample) => Math.abs(Math.round(128 + sample * 128) - 128) <= 3)).toBe(
      true,
    );
    expect(hasRemoteSpeech(quiet)).toBe(true);
  });
  it("does not call digital silence or tiny comfort noise speech", () => {
    expect(hasRemoteSpeech(new Float32Array(256))).toBe(false);
    expect(hasRemoteSpeech(new Float32Array(256).fill(0.00001))).toBe(false);
  });
});
