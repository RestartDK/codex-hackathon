import { describe, expect, it } from "vite-plus/test";
import {
  beginVote,
  chooseLovers,
  createGame,
  hunterShot,
  living,
  resolveNight,
  resolveVote,
  startGame,
  submitNightAction,
  submitVote,
  view,
} from "./engine.js";
import { defaultRoleCounts } from "./rules.js";
import type { Game, Role, TieRule, Winner } from "./types.js";
import { introduceStory } from "./engine.js";
import { loupsGarous } from "./modules/loups-garous.js";
import { flowGuidance } from "../../src/werewolf/flowNarration.js";

type Strategy = "village" | "wolves";

function fixedRoles(count: number, humanRole: Role): Role[] {
  const counts = defaultRoleCounts(count);
  if (counts[humanRole] === 0) throw new Error(`${humanRole} is unavailable with ${count} players`);
  counts[humanRole] -= 1;
  return [
    humanRole,
    ...Object.entries(counts).flatMap(([role, amount]) =>
      Array.from({ length: amount }, () => role as Role),
    ),
  ];
}

function chooseNightVictim(game: Game, strategy: Strategy, killHuman = false) {
  const candidates = living(game).filter((candidate) => candidate.role !== "werewolf");
  if (!candidates.length) throw new Error("No legal night victim");
  if (killHuman) return candidates.find((candidate) => candidate.id === "human") ?? candidates[0]!;
  if (strategy === "village")
    return candidates.find((candidate) => candidate.id !== "human") ?? candidates[0]!;
  return candidates.find((candidate) => candidate.role !== "hunter") ?? candidates[0]!;
}

function resolveHunters(game: Game, strategy: Strategy) {
  while (game.phase === "hunter") {
    const hunterId = game.pendingHunters[0]!;
    const target = living(game).find((candidate) =>
      strategy === "village" ? candidate.role === "werewolf" : candidate.role !== "werewolf",
    );
    hunterShot(
      game,
      hunterId,
      target?.id ?? living(game).find((candidate) => candidate.id !== hunterId)!.id,
    );
  }
}

function assertPrivateView(game: Game) {
  const publicView = view(game, "human");
  if (game.phase !== "over") {
    for (const candidate of publicView.players.filter((candidate) => candidate.alive))
      expect(candidate.revealedRole).toBeUndefined();
  }
  expect(
    publicView.feed.some(
      (entry) => entry.kind === "private" && entry.recipientId !== publicView.me.id,
    ),
  ).toBe(false);
}

function playNight(game: Game, strategy: Strategy, killHuman = false) {
  const victim = chooseNightVictim(game, strategy, killHuman);
  for (const wolf of living(game).filter((candidate) => candidate.role === "werewolf"))
    submitNightAction(game, wolf.id, { kind: "wolf", targetId: victim.id });

  const human = game.players[0]!;
  if (human.alive && human.role === "seer") {
    const target = living(game).find(
      (candidate) =>
        candidate.id !== human.id &&
        !human.investigations.some((finding) => finding.targetId === candidate.id),
    );
    submitNightAction(
      game,
      human.id,
      target ? { kind: "seer", targetId: target.id } : { kind: "pass" },
    );
  } else if (human.alive && human.role === "witch") {
    submitNightAction(game, human.id, { kind: "witch" });
  } else if (human.alive && human.role !== "werewolf") {
    submitNightAction(game, human.id, { kind: "pass" });
  }
  resolveNight(game);
  resolveHunters(game, strategy);
}

function playVote(game: Game, strategy: Strategy, tie = false) {
  beginVote(game);
  const voters = living(game);
  if (tie) {
    const [first, second] = voters.filter((candidate) => candidate.id !== "human").slice(0, 2);
    if (!first || !second || voters.length % 2 !== 0)
      throw new Error("Tie fixture needs two targets and an even electorate");
    let firstVotes = 0;
    let secondVotes = 0;
    for (const voter of voters) {
      let target = firstVotes < voters.length / 2 ? first : second;
      if (target.id === voter.id) target = target.id === first.id ? second : first;
      submitVote(game, voter.id, target.id);
      if (target.id === first.id) firstVotes += 1;
      else secondVotes += 1;
    }
    expect(firstVotes).toBe(secondVotes);
  } else {
    const target = voters.find((candidate) =>
      strategy === "village" ? candidate.role === "werewolf" : candidate.role !== "werewolf",
    )!;
    const alternate = voters.find((candidate) => candidate.id !== target.id)!;
    for (const voter of voters)
      submitVote(game, voter.id, voter.id === target.id ? alternate.id : target.id);
  }
  resolveVote(game, () => 0);
  if (tie) {
    expect(game.lastVoteResult?.tiedTargetIds).toHaveLength(2);
    if (game.tieRule === "no-exile") expect(game.lastVoteResult?.exiledPlayerId).toBeUndefined();
    else expect(game.lastVoteResult?.exiledPlayerId).toBeDefined();
  }
  resolveHunters(game, strategy);
}

function completeMatch(options: {
  count: number;
  humanRole: Role;
  strategy: Strategy;
  tieRule?: TieRule;
  tieFirstDay?: boolean;
  killHumanFirstNight?: boolean;
}) {
  const counts = defaultRoleCounts(options.count);
  const game = createGame("You", options.count, {
    roleCounts: counts,
    fixedRoles: fixedRoles(options.count, options.humanRole),
    tieRule: options.tieRule,
  });
  startGame(game);
  if (game.phase === "cupid") {
    const cupid = game.players.find((candidate) => candidate.role === "cupid")!;
    const choices = game.players.filter(
      (candidate) =>
        candidate.id !== cupid.id && candidate.id !== "human" && candidate.role !== "werewolf",
    );
    chooseLovers(game, cupid.id, choices[0]!.id, choices[1]!.id);
  }

  let rounds = 0;
  let usedTie = false;
  while (game.phase !== "over" && rounds < 12) {
    assertPrivateView(game);
    if (game.phase === "night")
      playNight(game, options.strategy, Boolean(options.killHumanFirstNight && rounds === 0));
    if (game.phase === "day") {
      const tie: boolean = Boolean(
        options.tieFirstDay && !usedTie && living(game).length % 2 === 0,
      );
      playVote(game, options.strategy, tie);
      usedTie ||= tie;
    }
    rounds += 1;
  }
  expect(game.phase).toBe("over");
  expect(game.winner).toBeDefined();
  if (options.tieFirstDay) {
    expect(usedTie).toBe(true);
  }
  return game;
}

describe("Loups-Garous complete-match regression matrix", () => {
  it("completes all six human roles through the real command/action module", async () => {
    const roles: Role[] = ["werewolf", "villager", "seer", "witch", "hunter", "cupid"];
    const outcomes: Winner[] = [];
    for (const role of roles) {
      const game = createGame("You", 8, {
        roleCounts: { werewolf: 1, villager: 3, seer: 1, witch: 1, hunter: 1, cupid: 1 },
        fixedRoles: [role, ...roles.filter((r) => r !== role), "villager", "villager"],
      });
      for (const npc of game.players.filter((p) => p.controller !== "human"))
        npc.memory.suspicion = { human: -100, "npc-6": 20, "npc-7": 19 };
      introduceStory(game);
      const command = async (text: string) => {
        const action = await loupsGarous.parseCommand!(text, game, "human");
        await loupsGarous.applyAction(game, "human", action);
        assertPrivateView(game);
        expect(flowGuidance(view(game, "human")).length).toBeGreaterThan(20);
      };
      await command("begin the first night");
      let steps = 0;
      while (game.phase !== "over" && steps++ < 40) {
        const human = game.players[0]!;
        if (game.phase === "cupid") await command("pair Emma and Lucas");
        else if (game.phase === "hunter") {
          expect(game.pendingHunters[0]).toBe("human");
          const target = living(game).find((p) => p.role === "werewolf") ?? living(game)[0]!;
          await command(`shoot ${target.name}`);
        } else if (!human.alive) await command("continue watching");
        else if (game.phase === "night") {
          const target = living(game).find(
            (p) =>
              p.id !== human.id &&
              (role !== "werewolf" || p.role !== "werewolf") &&
              (role !== "seer" || !human.investigations.some((i) => i.targetId === p.id)),
          );
          await command(
            role === "werewolf"
              ? `hunt ${target!.name}`
              : role === "seer" && target
                ? `investigate ${target.name}`
                : "pass",
          );
        } else if (game.phase === "day") {
          await command("hear the villagers");
          await command("begin vote");
        } else if (game.phase === "vote") {
          const target =
            living(game).find((p) => p.id !== human.id && p.role === "werewolf") ??
            living(game).find((p) => p.id !== human.id)!;
          // Controlled ballots reach outcomes without teaching bots hidden roles.
          for (const npc of living(game).filter((p) => p.id !== human.id))
            npc.voteId = npc.id === target.id ? human.id : target.id;
          await command(`vote for ${target.name}`);
        } else throw new Error(`Unexpected ${game.phase}`);
      }
      expect(game.phase, `${role} did not finish`).toBe("over");
      outcomes.push(game.winner!);
      // Replay is a fresh authoritative game, with no potions/votes carried over.
      const replay = await loupsGarous.create(loupsGarous.parseCreate({ testMode: true }));
      expect(replay.id).not.toBe(game.id);
      expect(replay.witchHealAvailable).toBe(true);
      expect(replay.lastVotes).toBeUndefined();
    }
    expect(outcomes).toHaveLength(6);
    expect(outcomes).toContain("village");
    expect(outcomes).toContain("wolves");
  });
  it("completes twelve varied matches through a terminal winner", () => {
    const scenarios: Array<{
      count: number;
      humanRole: Role;
      strategy: Strategy;
      expected: Winner;
      tieRule?: TieRule;
      tieFirstDay?: boolean;
      killHumanFirstNight?: boolean;
    }> = [
      { count: 4, humanRole: "villager", strategy: "village", expected: "village" },
      { count: 5, humanRole: "seer", strategy: "village", expected: "village" },
      { count: 6, humanRole: "witch", strategy: "village", expected: "village" },
      { count: 4, humanRole: "werewolf", strategy: "wolves", expected: "wolves" },
      {
        count: 6,
        humanRole: "hunter",
        strategy: "village",
        expected: "village",
        killHumanFirstNight: true,
      },
      { count: 9, humanRole: "cupid", strategy: "village", expected: "village" },
      { count: 8, humanRole: "villager", strategy: "village", expected: "village" },
      { count: 11, humanRole: "werewolf", strategy: "wolves", expected: "wolves" },
      { count: 12, humanRole: "seer", strategy: "village", expected: "village" },
      {
        count: 7,
        humanRole: "villager",
        strategy: "village",
        expected: "village",
        tieRule: "no-exile",
        tieFirstDay: true,
      },
      {
        count: 9,
        humanRole: "witch",
        strategy: "village",
        expected: "village",
        tieRule: "random-among-tied",
        tieFirstDay: true,
        killHumanFirstNight: true,
      },
      {
        count: 10,
        humanRole: "witch",
        strategy: "wolves",
        expected: "wolves",
      },
    ];

    const completed = scenarios.map((scenario) => completeMatch(scenario));
    expect(completed).toHaveLength(12);
    expect(completed.map((game) => game.winner)).toEqual(
      scenarios.map((scenario) => scenario.expected),
    );
  });

  it("rejects an incomplete ballot as the implemented no-abstention rule", () => {
    const game = createGame("You", 4, {
      roleCounts: defaultRoleCounts(4),
      fixedRoles: ["villager", "werewolf", "seer", "witch"],
    });
    startGame(game);
    game.phase = "day";
    beginVote(game);
    submitVote(game, "human", "npc-1");
    expect(() => resolveVote(game)).toThrow("Every living player must vote.");
  });

  it("allows a human Witch to self-heal once and never reuse either potion", () => {
    const game = createGame("You", 4, {
      roleCounts: defaultRoleCounts(4),
      fixedRoles: ["witch", "werewolf", "seer", "villager"],
    });
    startGame(game);
    submitNightAction(game, "npc-1", { kind: "wolf", targetId: "human" });
    game.wolfVictimId = "human";
    submitNightAction(game, "human", { kind: "witch", heal: true, poisonTargetId: "npc-2" });
    resolveNight(game);
    expect(game.players[0]!.alive).toBe(true);
    expect(game.witchHealAvailable).toBe(false);
    expect(game.witchPoisonAvailable).toBe(false);

    game.phase = "night";
    game.players[0]!.nightAction = undefined;
    game.wolfVictimId = "human";
    expect(() => submitNightAction(game, "human", { kind: "witch", heal: true })).toThrow(
      "healing potion has already been used",
    );
    expect(() =>
      submitNightAction(game, "human", { kind: "witch", poisonTargetId: "npc-3" }),
    ).toThrow("poison potion has already been used");
  });
});
