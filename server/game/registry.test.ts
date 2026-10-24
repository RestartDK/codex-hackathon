import { describe, expect, it } from "vite-plus/test";
import { getGameModule, listGameModules } from "./registry.js";

describe("game module registry", () => {
  it("publishes registered games and their shared interaction capabilities", () => {
    expect(getGameModule("loups-garous")?.name).toBe("Loups-Garous");
    expect(listGameModules()).toContainEqual({
      id: "loups-garous",
      name: "Loups-Garous",
      description: "Find the Werewolves hiding among the villagers.",
      minPlayers: 4,
      maxPlayers: 12,
      capabilities: { voiceCommands: true, undo: false },
    });
  });
});
