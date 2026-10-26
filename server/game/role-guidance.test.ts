import { describe, expect, it, vi } from "vite-plus/test";
import { createGame, introduceStory, startGame, view } from "./engine.js";
import { roleExplanation, nextRoleAction } from "./role-guidance.js";
import { ROLES } from "./types.js";
import { loupsGarous } from "./modules/loups-garous.js";
import { prepareGame } from "./prepare.js";

describe("role guidance against controlled engine fixtures", () => {
  for (const role of ROLES) {
    it(`uses the actual assigned ${role} and never serializes other hidden roles`, () => {
      const game = createGame("You", 6, {
        roleCounts: { werewolf: 1, villager: 1, seer: 1, witch: 1, hunter: 1, cupid: 1 },
        fixedRoles: [role, ...ROLES.filter((candidate) => candidate !== role)],
      });
      introduceStory(game);
      const scoped = view(game, "human");
      const explanation = roleExplanation(scoped);
      expect(scoped.me.role).toBe(role);
      expect(explanation.toLowerCase()).toContain(`your role is the ${role}`);
      expect(nextRoleAction(scoped, true)).toContain("say I am ready");
      for (const npc of game.players.slice(1)) {
        expect(scoped.players.find((p) => p.id === npc.id)?.revealedRole).toBeUndefined();
        expect(explanation).not.toContain(npc.name);
      }
    });
  }

  it("supports the announced combined Witch voice action and enforces both potion rules", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    try {
      const make = async () => {
        const game = createGame("You", 4, {
          fixedRoles: ["witch", "werewolf", "villager", "seer"],
          roleCounts: { werewolf: 1, villager: 1, seer: 1, witch: 1, hunter: 0, cupid: 0 },
        });
        startGame(game);
        await prepareGame(game);
        game.wolfVictimId = "human";
        game.players[1]!.nightAction = { kind: "wolf", targetId: "human" };
        return game;
      };
      const game = await make();
      const command = await loupsGarous.parseCommand!("save and poison Lucas", game, "human");
      expect(command).toEqual({ type: "night", heal: true, poison: "npc-2" });
      await loupsGarous.applyAction(game, "human", command);
      expect(game.witchHealAvailable).toBe(false);
      expect(game.witchPoisonAvailable).toBe(false);
      expect(game.players[0]!.alive).toBe(true);
      expect(game.players[2]!.alive).toBe(false);
      const invalid = await make();
      invalid.wolfVictimId = "npc-2";
      const invalidAction = await loupsGarous.parseCommand!(
        "save and poison Lucas",
        invalid,
        "human",
      );
      await expect(loupsGarous.applyAction(invalid, "human", invalidAction)).rejects.toThrow(
        /valid poison target/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
