import { describe, expect, it } from "vite-plus/test";
import { normalizeLoopPosition } from "./infiniteCarousel";

describe("infinite game carousel", () => {
  it("moves an outer copy back into the seamless middle range", () => {
    expect(normalizeLoopPosition(150, 100)).toBe(250);
    expect(normalizeLoopPosition(450, 100)).toBe(350);
  });

  it("does not shift positions in the middle or before measurement", () => {
    expect(normalizeLoopPosition(300, 100)).toBe(300);
    expect(normalizeLoopPosition(300, 0)).toBe(300);
  });
});
