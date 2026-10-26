import { describe, expect, it } from "vite-plus/test";
import { AVAILABLE_DESTINATIONS } from "../../voice/navigation";
import { GAME_CARDS } from "./gameCatalog";

describe("game picker catalog", () => {
  it("launches every game exposed by the picker", () => {
    const launches = GAME_CARDS.map((card) => [card.id, card.launch]);
    expect(launches).toEqual([
      ["chess", "chess"],
      ["loups-garous", "loups-garous"],
      ["ludo", "ludo"],
      ["intercept", "intercept"],
      ["tic-tac-toe", "tic-tac-toe"],
    ]);
  });

  it("only launches destinations the shell can mount", () => {
    for (const card of GAME_CARDS) {
      if (card.launch === null) continue;
      expect(AVAILABLE_DESTINATIONS).toContain(card.launch);
      expect(card.id).toBe(card.launch);
    }
  });
});
