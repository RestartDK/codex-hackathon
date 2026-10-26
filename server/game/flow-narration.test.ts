import { describe, expect, it } from "vite-plus/test";
import { createGame, startGame, view } from "./engine.js";
import { flowGuidance } from "../../src/werewolf/flowNarration.js";
import { nextRoleAction } from "./role-guidance.js";

const fixture = () => {
  const game = createGame("You", 6, {
    fixedRoles: ["witch", "werewolf", "seer", "villager", "villager", "hunter"],
    roleCounts: { werewolf: 1, witch: 1, seer: 1, villager: 2, hunter: 1, cupid: 0 },
  });
  startGame(game);
  return game;
};
describe("authoritative screen narration", () => {
  it("recognizes an already-winning custom pack before allowing a night action", () => {
    const game = createGame("You", 4, {
      fixedRoles: ["werewolf", "werewolf", "villager", "villager"],
      roleCounts: { werewolf: 2, villager: 2, seer: 0, witch: 0, hunter: 0, cupid: 0 },
    });
    startGame(game);
    expect(game.phase).toBe("over");
    expect(game.winner).toBe("wolves");
    expect(flowGuidance(view(game, "human"))).toContain("You win");
  });
  it("reads vote counts and the acknowledgement instead of stale night commands", () => {
    const game = fixture();
    game.players[1]!.alive = false;
    const vote = {
      day: 1,
      ballots: [],
      tally: [
        { target: "npc-1", votes: 3 },
        { target: "human", votes: 2 },
      ],
      tiedTargetIds: ["npc-1"],
      exiledPlayerId: "npc-1",
    };
    const summary = flowGuidance(view(game, "human"), { vote: { result: vote, revealing: false } });
    expect(summary).toContain("Emma: 3 votes");
    expect(summary).toContain("Say continue");
    expect(summary).not.toContain("Say poison");
    expect(
      flowGuidance(view(game, "human"), { vote: { result: vote, revealing: true } }),
    ).toContain("Emma was the Werewolf");
  });
  it("explains ties according to the recorded result and only reveals entitled findings", () => {
    const game = fixture();
    const vote = { day: 1, ballots: [], tally: [], tiedTargetIds: ["human", "npc-1"] };
    expect(
      flowGuidance(view(game, "human"), { vote: { result: vote, revealing: false } }),
    ).toContain("exiles no one");
    const text = flowGuidance(view(game, "human"), {
      finding: { name: "Emma", result: "wolf", day: 1 },
    });
    expect(text).toContain("Only you");
    expect(text).toContain("Say continue");
    expect(text).not.toContain("Seer");
  });
  it("does not offer spent potions and hides the victim after healing has been used", () => {
    const game = fixture();
    game.wolfVictimId = "npc-3";
    game.witchHealAvailable = false;
    expect(view(game, "human").me.wolfVictim).toBeUndefined();
    expect(nextRoleAction(view(game, "human"))).not.toContain("use both");
    game.witchPoisonAvailable = false;
    expect(nextRoleAction(view(game, "human"))).not.toContain("Say poison");
  });
  it("keeps eliminated players out of abilities and announces actual victory or defeat", () => {
    const game = fixture();
    game.players[0]!.alive = false;
    expect(flowGuidance(view(game, "human"))).toContain("NPCs will continue");
    expect(flowGuidance(view(game, "human"))).not.toContain("Say poison");
    game.phase = "over";
    game.winner = "wolves";
    expect(flowGuidance(view(game, "human"))).toContain("You lose");
    game.winner = "village";
    expect(flowGuidance(view(game, "human"))).toContain("You win");
    expect(flowGuidance(view(game, "human"))).toContain("play again");
  });
  it("keeps living hidden roles out of narration", () => {
    const game = fixture();
    game.phase = "vote";
    const text = flowGuidance(view(game, "human"));
    expect(text).toContain("no abstention");
    expect(text).not.toMatch(/Emma.{0,10}Werewolf|Lucas.{0,10}Seer/);
  });
});
