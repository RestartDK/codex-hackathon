import { describe, expect, it } from "vite-plus/test";
import { defaultRoleCounts } from "../../server/game/rules.js";
import { roleExplanation, nextRoleAction } from "../../server/game/role-guidance.js";
import { ROLES, type GameView, type Role } from "../../server/game/types.js";
import { RoleRevealDelivery, roleHelpIntent } from "./roleReveal";

const fixture = (role: Role) => {
  const playerView: GameView = {
    id: `fixture-${role}`,
    gameType: "loups-garous",
    testMode: true,
    paused: false,
    phase: "prologue",
    day: 1,
    tieRule: "no-exile",
    modelMode: "fallback",
    feed: [],
    players: ["You", "Emma", "Lucas", "Sofia", "Noah", "Mia"].map((name, index) => ({
      id: index ? `npc-${index}` : "human",
      name,
      alive: true,
      controller: index ? "bot" : "human",
      bio: "Public biography",
      profile: {
        archetype: "Resident",
        speakingStyle: "calm",
        introduction: "Hello",
        voiceKey: "assistant",
      },
    })),
    me: {
      id: "human",
      role,
      alive: true,
      witchHealAvailable: true,
      witchPoisonAvailable: true,
      investigations: [],
      hunterActionPending: false,
    },
  };
  // Every role here belongs to the production role-count schema.
  expect(Object.hasOwn(defaultRoleCounts(6), role)).toBe(true);
  return { playerView };
};

describe("authoritative private role explanations", () => {
  for (const role of ROLES) {
    it(`announces the assigned ${role} with its team, objective, ability and voice next action`, () => {
      const { playerView } = fixture(role);
      const text = roleExplanation(playerView);
      expect(text).toContain(`Your role is the ${role[0]!.toUpperCase()}${role.slice(1)}`);
      expect(text).toContain(`You are on the ${role === "werewolf" ? "Werewolf" : "village"} team`);
      expect(text).toContain(
        role === "werewolf" ? "equal or outnumber" : "all Werewolves have been eliminated",
      );
      expect(nextRoleAction(playerView, true)).toContain("say I am ready");
      expect(nextRoleAction(playerView, true)).toContain("skip role explanation");
      expect(`${text} ${nextRoleAction(playerView, true)}`.length).toBeLessThanOrEqual(2_000);
      for (const player of playerView.players.filter((player) => player.id !== "human")) {
        expect(player.revealedRole).toBeUndefined();
        expect(text).not.toContain(player.name);
      }
    });
  }

  it("describes the implemented potion limits, double use and current availability", () => {
    const { playerView } = fixture("witch");
    playerView.me.witchHealAvailable = false;
    playerView.me.wolfVictim = "Emma";
    const text = roleExplanation(playerView);
    expect(text).toContain("both potions in the same night, but not on the same person");
    expect(text).toContain("cannot poison yourself");
    expect(text).toContain("healing potion is already used");
    expect(text).toContain("Tonight's victim is Emma");
  });

  it("describes Seer restrictions, Hunter lover deaths and Cupid's distinct pair", () => {
    expect(roleExplanation(fixture("seer").playerView)).toContain("not investigated before");
    expect(roleExplanation(fixture("hunter").playerView)).toContain("through a lover's death");
    expect(roleExplanation(fixture("cupid").playerView)).toContain("two different living players");
  });

  it("reads only authorized pack and lover information without inferring their roles", () => {
    const { playerView } = fixture("werewolf");
    playerView.me.werewolfTeam = ["Authorized packmate"];
    playerView.me.lover = "Authorized partner";
    const text = roleExplanation(playerView);
    expect(text).toContain("Your living packmates are Authorized packmate");
    expect(text).toContain("You are bound to Authorized partner");
    expect(text).toContain("partner's role has not been disclosed");
  });

  it("keeps role help and legal next actions available after the reveal", () => {
    const { playerView } = fixture("witch");
    playerView.phase = "night";
    playerView.me.wolfVictim = "Emma";
    expect(nextRoleAction(playerView)).toContain("The pack targeted Emma");
    playerView.me.witchPoisonAvailable = false;
    expect(nextRoleAction(playerView)).toContain("poison potion has been used");
    expect(roleHelpIntent("Repeat my role")).toBe("role");
    expect(roleHelpIntent("Explain my abilities")).toBe("abilities");
    expect(roleHelpIntent("What do I do next?")).toBe("next");
  });
});

describe("role reveal audio handoff regression", () => {
  it("queues delayed role data and voice readiness, then speaks once per reveal", () => {
    const delivery = new RoleRevealDelivery();
    expect(delivery.request(true)).toBeNull(); // reveal rendered before role data
    delivery.sync("game:human:witch");
    expect(delivery.request(false)).toBeNull(); // connection is still opening
    const attempt = delivery.request(true)!;
    expect(delivery.request(true)).toBeNull();
    expect(delivery.canContinue()).toBe(false); // caption/request is not playback
    delivery.started(attempt);
    expect(delivery.canContinue()).toBe(false);
    delivery.finish(attempt, "completed");
    expect(delivery.canContinue()).toBe(true);
    delivery.sync("game:human:witch"); // card flip or reconnect
    expect(delivery.request(true)).toBeNull();
  });

  it("never marks interrupted or failed speech as completed, and retries explicitly", () => {
    for (const outcome of ["interrupted", "failed"] as const) {
      const delivery = new RoleRevealDelivery();
      delivery.sync("game:human:seer");
      const first = delivery.request(true)!;
      delivery.started(first);
      delivery.finish(first, outcome);
      expect(delivery.canContinue()).toBe(false);
      delivery.retry();
      const retry = delivery.request(true)!;
      expect(delivery.finish(first, "completed")).toBe(false); // stale cleanup
      delivery.started(retry);
      delivery.finish(retry, "completed");
      expect(delivery.canContinue()).toBe(true);
    }
  });

  it("does not mistake completion without audio start for success", () => {
    const delivery = new RoleRevealDelivery();
    delivery.sync("game:human:hunter");
    delivery.finish(delivery.request(true)!, "completed");
    expect(delivery.status).toBe("failed");
    expect(delivery.canContinue()).toBe(false);
  });

  it("only an explicit skip unlocks early advancement and a new game gets its own reveal", () => {
    const delivery = new RoleRevealDelivery();
    delivery.sync("game:human:cupid");
    const previous = delivery.request(true)!;
    delivery.skip();
    expect(delivery.canContinue()).toBe(true);
    expect(delivery.finish(previous, "interrupted")).toBe(false);
    delivery.sync("new-game:human:villager");
    expect(delivery.canContinue()).toBe(false);
    expect(delivery.request(true)).not.toBeNull();
  });
});
