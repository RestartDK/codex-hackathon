import { describe, expect, it } from "vite-plus/test";
import { isEligibleSeerTarget } from "./targeting";

describe("Loups-Garous Seer targets", () => {
  it("does not offer the Seer herself, eliminated players, or previous investigations", () => {
    const findings = [{ name: "Emma" }];
    expect(isEligibleSeerTarget({ id: "human", name: "You", alive: true }, "human", findings)).toBe(
      false,
    );
    expect(
      isEligibleSeerTarget({ id: "npc-1", name: "Emma", alive: true }, "human", findings),
    ).toBe(false);
    expect(
      isEligibleSeerTarget({ id: "npc-2", name: "Lucas", alive: false }, "human", findings),
    ).toBe(false);
    expect(
      isEligibleSeerTarget({ id: "npc-3", name: "Sofia", alive: true }, "human", findings),
    ).toBe(true);
  });
});
