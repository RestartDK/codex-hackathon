import { randomInt, randomUUID } from "node:crypto";
import { defaultRoleCounts, validateRoleCounts } from "./rules.js";
import type {
  Game,
  GameView,
  NightAction,
  Player,
  Role,
  RoleCounts,
  TieRule,
  Winner,
} from "./types.js";

export const player = (game: Game, id: string) => game.players.find((p) => p.id === id);
export const living = (game: Game) => game.players.filter((p) => p.alive);
const addEvent = (game: Game, text: string, speaker = "Narrator") =>
  game.feed.push({ id: randomUUID(), day: game.day, speaker, text, kind: "event" });
const villagerProfiles = [
  {
    archetype: "The observant baker",
    speakingStyle: "Measured, precise, and fond of asking one more question.",
    introduction: "I am Emma. I notice who arrives late for bread, and who avoids meeting my eyes.",
    voiceKey: "emma",
  },
  {
    archetype: "The travelling cartographer",
    speakingStyle: "Warm, curious, and always compares two stories before deciding.",
    introduction:
      "Lucas here. A map only makes sense when every path joins up, and so should our stories.",
    voiceKey: "lucas",
  },
  {
    archetype: "The village herbalist",
    speakingStyle: "Quiet, thoughtful, and unexpectedly direct when pressed.",
    introduction:
      "I am Sofia. I prefer evidence to noise, but I will say when something does not add up.",
    voiceKey: "sofia",
  },
  {
    archetype: "The night watchmaker",
    speakingStyle: "Dry, blunt, and alert to small inconsistencies.",
    introduction: "Noah. Clocks do not lie, though people sometimes do. I will be listening.",
    voiceKey: "noah",
  },
  {
    archetype: "The innkeeper",
    speakingStyle: "Protective, practical, and willing to change her mind.",
    introduction:
      "Mia. I have heard every excuse made over my tables. Give me a reason, not a performance.",
    voiceKey: "mia",
  },
  {
    archetype: "The schoolmaster",
    speakingStyle: "Patient, analytical, and careful with accusations.",
    introduction:
      "Hugo. I teach children to show their working. Tonight, I expect the same from us.",
    voiceKey: "hugo",
  },
  {
    archetype: "The miller",
    speakingStyle: "Quick-witted, skeptical, and ready to challenge a consensus.",
    introduction:
      "Inès. I know when a wheel is turning without moving forward. Let us not do that to each other.",
    voiceKey: "ines",
  },
  {
    archetype: "The ferryman",
    speakingStyle: "Calm, sparse, and observant of who follows whom.",
    introduction:
      "Louis. The river teaches patience. I will wait for the facts, but I will not ignore a current.",
    voiceKey: "louis",
  },
  {
    archetype: "The archivist",
    speakingStyle: "Reflective, articulate, and inclined to remember exact words.",
    introduction:
      "Mila. I keep the village records. If a story changes, I tend to notice the ink is different.",
    voiceKey: "mila",
  },
  {
    archetype: "The shepherd",
    speakingStyle: "Earnest, intuitive, and occasionally too quick to trust.",
    introduction:
      "Raphaël. I know every flock has a nervous sheep. I hope we do not mistake fear for guilt.",
    voiceKey: "raphael",
  },
  {
    archetype: "The stargazer",
    speakingStyle: "Poetic, candid, and suspicious of easy answers.",
    introduction:
      "Zoé. The sky looks different before a storm. I have a feeling this village does too.",
    voiceKey: "zoe",
  },
] as const;
const humanProfile = {
  archetype: "The newcomer",
  speakingStyle: "Your own voice and choices shape this story.",
  introduction: "",
  voiceKey: "player",
};
const villagerNames = [
  "Emma",
  "Lucas",
  "Sofia",
  "Noah",
  "Mia",
  "Hugo",
  "Inès",
  "Louis",
  "Mila",
  "Raphaël",
  "Zoé",
] as const;
const roleSequence = (counts: RoleCounts): Role[] =>
  (Object.entries(counts) as [Role, number][]).flatMap(([role, count]) =>
    Array.from({ length: count }, () => role),
  );
const shuffle = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

export function createGame(
  name = "You",
  count = 8,
  options: {
    roleCounts?: RoleCounts;
    tieRule?: TieRule;
    controllers?: Record<string, "agent" | "bot">;
    fixedRoles?: Role[];
    testMode?: boolean;
  } = {},
): Game {
  const roleCounts = options.roleCounts ?? defaultRoleCounts(count);
  validateRoleCounts(count, roleCounts);
  const roles = options.fixedRoles ? [...options.fixedRoles] : shuffle(roleSequence(roleCounts));
  if (
    roles.length !== count ||
    roles.some((role) => !Object.hasOwn(roleCounts, role)) ||
    roles.some(
      (role) => roles.filter((candidate) => candidate === role).length !== roleCounts[role],
    )
  )
    throw new Error("The fixed role list must match the village role counts.");
  const game: Game = {
    id: randomUUID(),
    testMode: options.testMode ?? false,
    paused: false,
    phase: "setup",
    day: 1,
    hasDawned: false,
    players: roles.map((role, i) => ({
      id: i === 0 ? "human" : `npc-${i}`,
      name: i === 0 ? name.trim().slice(0, 32) || "You" : (villagerNames[i - 1] ?? `Villager ${i}`),
      role,
      // Local bots are the standard game mode: each choice is computed from the
      // current public state synchronously, so a turn never waits on several
      // model calls. A caller can still opt a specific NPC into an LLM agent.
      controller: i === 0 ? "human" : (options.controllers?.[`npc-${i}`] ?? "bot"),
      alive: true,
      bio:
        i === 0 ? "A new face in a village full of secrets." : villagerProfiles[i - 1]!.archetype,
      profile: i === 0 ? humanProfile : villagerProfiles[i - 1]!,
      traits: {
        caution: randomInt(20, 81),
        confidence: randomInt(20, 81),
        talkativeness: randomInt(20, 81),
      },
      memory: {
        suspicion:
          options.testMode && role === "werewolf" ? { human: -1 } : ({} as Record<string, number>),
        notes: [],
      },
      investigations: [],
    })),
    feed: [],
    roleCounts,
    tieRule: options.tieRule ?? "no-exile",
    witchHealAvailable: true,
    witchPoisonAvailable: true,
    pendingHunters: [],
    resumeAfterHunter: "day",
    processedFeedIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return game;
}

export function startGame(game: Game) {
  if (!["setup", "prologue"].includes(game.phase)) throw new Error("The game has already started.");
  const cupid = game.players.find((p) => p.role === "cupid");
  game.phase = cupid ? "cupid" : "night";
  game.cupidPlayerId = cupid?.id;
  addEvent(
    game,
    cupid ? "Cupid must choose two hearts to bind." : "Night falls. The village closes its eyes.",
  );
  game.updatedAt = Date.now();
}

/** Adds a public, role-safe introduction before the first night begins. */
export function introduceStory(game: Game) {
  if (game.phase !== "setup") throw new Error("The story can only begin from setup.");
  game.phase = "prologue";
  addEvent(
    game,
    "Welcome to Valombre. A full moon rises over the village, and someone among you is hiding a terrible secret.",
  );
  for (const villager of game.players.filter((candidate) => candidate.controller !== "human")) {
    game.feed.push({
      id: randomUUID(),
      day: game.day,
      speaker: villager.name,
      text: villager.profile.introduction,
      kind: "speech",
    });
  }
  addEvent(
    game,
    "By night, special roles act in secret. By day, the village discusses and votes. The village wins by finding every Werewolf; the pack wins when it can no longer be outvoted.",
  );
  game.updatedAt = Date.now();
}

/** Pausing is part of authoritative game state, so all command clients see it. */
export function setGamePaused(game: Game, paused: boolean) {
  if (game.paused === paused) return;
  game.paused = paused;
  addEvent(
    game,
    paused
      ? "The game is paused. The village will wait for the player to continue."
      : "The game resumes. The village is ready for the next command.",
  );
  game.updatedAt = Date.now();
}

function rememberPublicSpeech(game: Game, actor: Player, text: string) {
  const lower = text.toLocaleLowerCase();
  const mentioned = game.players.filter(
    (candidate) => candidate.id !== actor.id && lower.includes(candidate.name.toLocaleLowerCase()),
  );
  const accusatory = /accus|suspici|doubt|trust|lying|lie|contradic|explain|why/u.test(lower);
  for (const listener of game.players.filter(
    (candidate) => candidate.alive && candidate.id !== actor.id,
  )) {
    listener.memory.notes.push(`${actor.name}: ${text}`);
    listener.memory.notes.splice(0, Math.max(0, listener.memory.notes.length - 12));
    for (const target of mentioned) {
      const previous = listener.memory.suspicion[target.id] ?? 0;
      listener.memory.suspicion[target.id] = Math.max(
        -3,
        Math.min(8, previous + (accusatory ? 1 : 0.25)),
      );
    }
  }
}

export function chooseLovers(game: Game, actorId: string, firstId: string, secondId: string) {
  if (game.phase !== "cupid" || actorId !== game.cupidPlayerId)
    throw new Error("Cupid's choice is not available.");
  const first = player(game, firstId),
    second = player(game, secondId);
  if (!first?.alive || !second?.alive || first.id === second.id)
    throw new Error("Choose two different living players.");
  first.loverId = second.id;
  second.loverId = first.id;
  game.lovers = [first.id, second.id];
  game.phase = "night";
  addEvent(game, "Cupid has tied two hearts together. Night falls.");
  checkVictory(game);
}

export function submitNightAction(game: Game, actorId: string, action: NightAction) {
  if (game.phase !== "night") throw new Error("It is not night.");
  const actor = player(game, actorId);
  if (!actor?.alive) throw new Error("Only a living player can act at night.");
  if (actor.nightAction) throw new Error("Your night action is already locked in.");
  if (action.kind === "pass") {
    // A player may deliberately leave a private ability unused for this night.
    // The round resolves once the Werewolf pack has chosen its target.
  } else if (action.kind === "wolf") {
    if (actor.role !== "werewolf") throw new Error("Only Werewolves can choose a hunt target.");
    const target = player(game, action.targetId ?? "");
    if (!target?.alive || target.role === "werewolf")
      throw new Error("Choose a living player outside the pack.");
  } else if (action.kind === "seer") {
    if (actor.role !== "seer") throw new Error("Only the Seer can investigate.");
    const target = player(game, action.targetId ?? "");
    if (
      !target?.alive ||
      target.id === actor.id ||
      actor.investigations.some((i) => i.targetId === target.id)
    )
      throw new Error("Choose a living player you have not investigated.");
    actor.investigations.push({
      targetId: target.id,
      result: target.role === "werewolf" ? "wolf" : "clear",
      day: game.day,
    });
    game.feed.push({
      id: randomUUID(),
      day: game.day,
      speaker: "Private • Seer",
      text: `${target.name} is ${target.role === "werewolf" ? "a Werewolf" : "not a Werewolf"}.`,
      kind: "private",
      recipientId: actor.id,
    });
  } else {
    if (actor.role !== "witch") throw new Error("Only the Witch can use potions.");
    const targetId = action.poisonTargetId;
    if (action.heal && !game.witchHealAvailable)
      throw new Error("The healing potion has already been used.");
    if (targetId && !game.witchPoisonAvailable)
      throw new Error("The poison potion has already been used.");
    const target = targetId ? player(game, targetId) : undefined;
    if (
      targetId &&
      (!target?.alive || target.id === actor.id || (action.heal && targetId === game.wolfVictimId))
    )
      throw new Error("Choose a valid poison target different from the wolf victim.");
    if (action.heal && !game.wolfVictimId) throw new Error("There is no wolf victim to save.");
    if (action.heal) game.witchHealAvailable = false;
    if (targetId) game.witchPoisonAvailable = false;
  }
  actor.nightAction = structuredClone(action);
  game.updatedAt = Date.now();
}

function kill(game: Game, target: Player, reason: string) {
  if (!target.alive) return [] as Player[];
  target.alive = false;
  target.voteId = undefined;
  target.nightAction = undefined;
  addEvent(game, `${target.name} ${reason}.`);
  const deaths = [target];
  const lover = target.loverId ? player(game, target.loverId) : undefined;
  if (lover?.alive) {
    lover.alive = false;
    lover.voteId = undefined;
    addEvent(game, `${lover.name} dies of a broken heart.`);
    deaths.push(lover);
  }
  return deaths;
}

function markHunters(game: Game, deaths: Player[]) {
  for (const dead of deaths) if (dead.role === "hunter") game.pendingHunters.push(dead.id);
}

function settleWinners(game: Game): Winner | undefined {
  const alive = living(game),
    wolves = alive.filter((p) => p.role === "werewolf").length;
  if (
    game.lovers &&
    alive.length === 2 &&
    alive.every((p) => game.lovers!.includes(p.id)) &&
    alive.some((p) => p.role === "werewolf") &&
    alive.some((p) => p.role !== "werewolf")
  )
    return "lovers";
  if (wolves === 0) return "village";
  if (wolves >= alive.length - wolves) return "wolves";
  return undefined;
}
export function checkVictory(game: Game) {
  const winner = settleWinners(game);
  if (winner && game.pendingHunters.length === 0) {
    game.winner = winner;
    game.phase = "over";
    addEvent(
      game,
      winner === "village"
        ? "The village has driven out the Werewolves."
        : winner === "wolves"
          ? "The Werewolves have taken over the village."
          : "Love has conquered the village.",
    );
  }
  return winner;
}

export function resolveNight(game: Game) {
  if (game.phase !== "night") throw new Error("It is not night.");
  const wolves = living(game).filter((p) => p.role === "werewolf");
  const picks = [
    ...new Set(
      wolves
        .map((p) => (p.nightAction?.kind === "wolf" ? p.nightAction.targetId : undefined))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  if (wolves.some((p) => p.nightAction?.kind !== "wolf") || picks.length !== 1)
    throw new Error("The Werewolf pack needs one shared target before dawn.");
  const wolfTarget = player(game, picks[0]!);
  if (!wolfTarget?.alive) throw new Error("The pack's target is no longer alive.");
  game.wolfVictimId = wolfTarget.id;
  const witch = living(game).find((p) => p.role === "witch");
  const witchAction = witch?.nightAction?.kind === "witch" ? witch.nightAction : undefined;
  const deaths: Player[] = [];
  if (!witchAction?.heal) deaths.push(...kill(game, wolfTarget, "was taken by the Werewolves"));
  if (witchAction?.poisonTargetId) {
    const target = player(game, witchAction.poisonTargetId);
    if (target?.alive) deaths.push(...kill(game, target, "was poisoned during the night"));
  }
  markHunters(game, deaths);
  game.players.forEach((p) => {
    p.nightAction = undefined;
  });
  game.wolfVictimId = undefined;
  if (game.hasDawned) game.day++;
  else game.hasDawned = true;
  game.resumeAfterHunter = "day";
  game.phase = game.pendingHunters.length ? "hunter" : "day";
  addEvent(
    game,
    deaths.length
      ? `Dawn breaks. ${deaths.map((dead) => dead.name).join(" and ")} did not survive the night.`
      : "Dawn breaks. No one died last night.",
  );
  if (game.pendingHunters.length)
    addEvent(game, "Before the day can begin, the Hunter must take one final shot.");
  game.updatedAt = Date.now();
  checkVictory(game);
}

export function speak(game: Game, actorId: string, text: string) {
  const actor = player(game, actorId);
  if (game.phase !== "day" || !actor?.alive)
    throw new Error("Only living players can speak during the day.");
  const message = text.trim();
  if (!message || message.length > 400) throw new Error("Messages must contain 1–400 characters.");
  game.feed.push({
    id: randomUUID(),
    day: game.day,
    speaker: actor.name,
    text: message,
    kind: "speech",
  });
  rememberPublicSpeech(game, actor, message);
}
export function beginVote(game: Game) {
  if (game.phase !== "day") throw new Error("Voting can only begin during the day.");
  game.phase = "vote";
  addEvent(game, "The village is ready to vote.");
}
export function submitVote(game: Game, actorId: string, targetId: string) {
  if (game.phase !== "vote") throw new Error("Voting is not open.");
  const actor = player(game, actorId),
    target = player(game, targetId);
  if (!actor?.alive || !target?.alive || actor.id === target.id)
    throw new Error("Choose another living player.");
  if (actor.voteId) throw new Error("You have already voted.");
  actor.voteId = target.id;
}
export function resolveVote(game: Game, random: () => number = Math.random) {
  if (game.phase !== "vote") throw new Error("Voting is not open.");
  const alive = living(game);
  if (alive.some((p) => !p.voteId || !player(game, p.voteId)?.alive))
    throw new Error("Every living player must vote.");
  const ballots = alive.map((p) => ({ voter: p.id, target: p.voteId! }));
  game.lastVotes = ballots;
  for (const observer of alive) {
    for (const ballot of ballots) {
      const voter = player(game, ballot.voter)!;
      const target = player(game, ballot.target)!;
      observer.memory.notes.push(`${voter.name} voted for ${target.name}.`);
      observer.memory.notes.splice(0, Math.max(0, observer.memory.notes.length - 12));
      if (observer.id === ballot.target) {
        observer.memory.suspicion[ballot.voter] =
          (observer.memory.suspicion[ballot.voter] ?? 0) + 1.5;
      }
    }
  }
  const counts = new Map<string, number>();
  ballots.forEach(({ target }) => counts.set(target, (counts.get(target) ?? 0) + 1));
  const max = Math.max(...counts.values());
  const tied = [...counts].filter(([, count]) => count === max).map(([id]) => id);
  const exiledId =
    tied.length === 1
      ? tied[0]
      : game.tieRule === "random-among-tied"
        ? tied[Math.floor(random() * tied.length)]
        : undefined;
  game.lastVoteResult = {
    day: game.day,
    ballots,
    tally: [...counts].map(([target, votes]) => ({ target, votes })),
    tiedTargetIds: tied,
    ...(exiledId ? { exiledPlayerId: exiledId } : {}),
  };
  game.players.forEach((p) => {
    p.voteId = undefined;
  });
  const deaths = exiledId ? kill(game, player(game, exiledId)!, "was exiled by the village") : [];
  markHunters(game, deaths);
  game.phase = game.pendingHunters.length ? "hunter" : "night";
  game.resumeAfterHunter = "night";
  if (!checkVictory(game)) {
    if (game.pendingHunters.length)
      addEvent(game, "Before night falls, the Hunter must take one final shot.");
    else
      addEvent(
        game,
        exiledId
          ? `${player(game, exiledId)?.name} was exiled by the village. Night falls. The village closes its eyes.`
          : "The vote was tied. The village exiles no one. Night falls. The village closes its eyes.",
      );
  }
  game.updatedAt = Date.now();
}
export function hunterShot(game: Game, hunterId: string, targetId: string) {
  if (game.phase !== "hunter" || game.pendingHunters[0] !== hunterId)
    throw new Error("This Hunter cannot act now.");
  const target = player(game, targetId);
  if (!target?.alive || target.id === hunterId) throw new Error("Choose another living player.");
  game.pendingHunters.shift();
  const deaths = kill(game, target, "was shot by the Hunter");
  markHunters(game, deaths);
  if (game.pendingHunters.length) game.phase = "hunter";
  else {
    game.phase = game.resumeAfterHunter;
    if (!checkVictory(game))
      addEvent(
        game,
        game.phase === "night"
          ? "Night falls. The village closes its eyes."
          : "The Hunter's shot is resolved. Daylight returns to the village.",
      );
  }
}

export function view(game: Game, viewerId: string): GameView {
  const me = player(game, viewerId);
  if (!me) throw new Error("Player not found.");
  const publicFeed = game.feed.filter(
    (entry) => entry.kind !== "private" || entry.recipientId === viewerId,
  );
  const authorizedWolfTeam =
    me.role === "werewolf" && me.alive
      ? game.players
          .filter((p) => p.role === "werewolf" && p.id !== me.id && p.alive)
          .map((p) => p.name)
      : undefined;
  return {
    id: game.id,
    gameType: "loups-garous",
    testMode: game.testMode,
    paused: game.paused,
    phase: game.phase,
    day: game.day,
    players: game.players.map(({ id, name, alive, controller, bio, profile, agentMode, role }) => ({
      id,
      name,
      alive,
      controller,
      bio,
      profile,
      ...(game.phase === "over" || !alive ? { revealedRole: role } : {}),
      ...(controller === "agent" ? { agentMode } : {}),
    })),
    me: {
      id: me.id,
      role: me.role,
      alive: me.alive,
      ...(authorizedWolfTeam ? { werewolfTeam: authorizedWolfTeam } : {}),
      ...(me.loverId ? { lover: player(game, me.loverId)?.name } : {}),
      investigations: me.investigations.map((i) => ({
        name: player(game, i.targetId)?.name ?? "Unknown",
        result: i.result,
        day: i.day,
      })),
      witchHealAvailable: game.witchHealAvailable,
      witchPoisonAvailable: game.witchPoisonAvailable,
      ...(me.role === "witch" && me.alive && game.phase === "night" && game.wolfVictimId
        ? { wolfVictim: player(game, game.wolfVictimId)?.name }
        : {}),
      hunterActionPending: game.pendingHunters[0] === me.id,
    },
    feed: publicFeed,
    ...(game.lastVotes ? { lastVotes: game.lastVotes } : {}),
    ...(game.lastVoteResult ? { lastVoteResult: game.lastVoteResult } : {}),
    ...(game.phase === "over" ? { winner: game.winner } : {}),
    tieRule: game.tieRule,
    modelMode: game.players.some((p) => p.controller === "agent" && p.agentMode === "llm")
      ? "llm"
      : "fallback",
  };
}
