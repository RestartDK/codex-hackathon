import { z } from "zod";
import {
  beginVote,
  chooseLovers,
  hunterShot,
  introduceStory,
  player,
  resolveNight,
  resolveVote,
  setGamePaused,
  speak,
  startGame,
  submitNightAction,
  submitVote,
  createGame,
  view,
} from "../engine.js";
import { chooseTarget, generateSpeech } from "../agents.js";
import { prepareGame } from "../prepare.js";
import { defaultRoleCounts } from "../rules.js";
import type { GameModule } from "../module.js";
import { ROLES, type Game, type GameView } from "../types.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(32).default("You"),
  count: z.number().int().min(4).max(12).default(8),
  tieRule: z.enum(["no-exile", "random-among-tied"]).default("no-exile"),
  roleCounts: z
    .object(
      Object.fromEntries(ROLES.map((role) => [role, z.number().int().min(0)])) as Record<
        (typeof ROLES)[number],
        z.ZodNumber
      >,
    )
    .optional(),
  start: z.boolean().default(true),
  testMode: z.boolean().default(false),
  skipIntro: z.boolean().default(false),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("begin-story") }),
  z.object({ type: z.literal("lovers"), first: z.string(), second: z.string() }),
  z.object({
    type: z.literal("night"),
    target: z.string().optional(),
    heal: z.boolean().optional(),
    poison: z.string().optional(),
  }),
  z.object({ type: z.literal("speak"), message: z.string().max(400) }),
  z.object({ type: z.literal("discuss") }),
  z.object({ type: z.literal("begin-vote") }),
  z.object({ type: z.literal("vote"), target: z.string() }),
  z.object({ type: z.literal("hunter-shot"), target: z.string() }),
  z.object({ type: z.literal("continue") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
]);

type CreateInput = z.infer<typeof createSchema>;
type ActionInput = z.infer<typeof actionSchema>;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .trim();

function mentionedPlayers(game: Game, text: string, actorId: string) {
  const normalized = normalize(text);
  return game.players
    .filter((candidate) => candidate.alive && candidate.id !== actorId)
    .filter((candidate) => normalized.includes(normalize(candidate.name)))
    .sort((first, second) => second.name.length - first.name.length);
}

function parseGameCommand(text: string, game: Game, actorId: string): ActionInput {
  const command = normalize(text);
  const actor = player(game, actorId);
  if (!actor) throw new Error("Your player is missing from this village.");
  if (!command) throw new Error("Say a game command, such as ‘choose Camille’.");

  const targets = mentionedPlayers(game, command, actorId);
  const target = targets[0];
  const isExactTargetName = Boolean(target && command === normalize(target.name));
  const choosesTarget =
    isExactTargetName ||
    /\b(choose|pick|select|target|go with|take|that one|this one)\b/u.test(command);
  const movesOn = /\b(pass|wait|skip|rest|dawn|continue|next|go on|nothing|do nothing|no action)\b/u.test(
    command,
  );
  const chooseForMe =
    /\b(choose|pick|select|decide)\b.*\b(for me|someone|anyone|a player)\b/u.test(command) ||
    /\b(surprise me|you decide)\b/u.test(command);
  const firstLivingOther = (predicate: (candidate: Game["players"][number]) => boolean = () => true) =>
    game.players.find((candidate) => candidate.alive && candidate.id !== actorId && predicate(candidate));

  if (/\b(pause|hold|freeze)\b.*\b(game|match|play)\b/u.test(command)) return { type: "pause" };
  if (/\b(resume|continue|unpause)\b.*\b(game|match|play)\b/u.test(command))
    return { type: "resume" };
  if (game.paused) throw new Error("The game is paused. Say ‘resume game’ when you are ready.");

  if (game.phase === "prologue") {
    if (/\b(begin|start|continue|skip|night|story|ready|next|go)\b/u.test(command))
      return { type: "begin-story" };
    throw new Error("Say ‘continue’, ‘I am ready’, or ‘begin the night’ when you are ready.");
  }

  if (game.phase === "cupid") {
    if (targets.length >= 2)
      return { type: "lovers", first: targets[0]!.id, second: targets[1]!.id };
    if (chooseForMe) {
      const choices = game.players.filter((candidate) => candidate.alive && candidate.id !== actorId).slice(0, 2);
      if (choices.length === 2)
        return { type: "lovers", first: choices[0]!.id, second: choices[1]!.id };
    }
    throw new Error("Name two players, for example ‘choose Camille and Jules’, or say ‘choose for me’.");
  }

  // Eliminated players retain only their Hunter shot or the ability to advance the story.
  if (!actor.alive && game.phase !== "hunter") {
    if (/\b(continue|watch|keep going|next)\b/u.test(command)) return { type: "continue" };
    throw new Error("You are out of the village. Say ‘continue watching’ to move the story on.");
  }

  if (game.phase === "night") {
    if (actor.role === "werewolf") {
      if (movesOn || /\b(delegate|pack decide|let the pack)\b/u.test(command)) return { type: "night" };
      if (target && (choosesTarget || /\b(hunt|attack|kill)\b/u.test(command)))
        return { type: "night", target: target.id };
      if (chooseForMe) {
        const automaticTarget = firstLivingOther((candidate) => candidate.role !== "werewolf");
        if (automaticTarget) return { type: "night", target: automaticTarget.id };
      }
      throw new Error("Say ‘choose Camille’, ‘hunt Camille’, ‘choose for me’, or ‘let the pack decide’.");
    }
    if (actor.role === "seer") {
      if (movesOn) return { type: "night" };
      if (
        target &&
        (choosesTarget || /\b(investigate|check|inspect|seer|see|look at|reveal)\b/u.test(command))
      )
        return { type: "night", target: target.id };
      if (chooseForMe) {
        const automaticTarget = firstLivingOther(
          (candidate) => !actor.investigations.some((finding) => finding.targetId === candidate.id),
        );
        if (automaticTarget) return { type: "night", target: automaticTarget.id };
      }
      throw new Error("Say ‘choose Camille’, ‘investigate Camille’, ‘choose for me’, or ‘wait for dawn’.");
    }
    if (actor.role === "witch") {
      if (/\b(save|heal|rescue)\b/u.test(command)) return { type: "night", heal: true };
      if (
        target &&
        (choosesTarget || /\b(poison|dose|kill)\b/u.test(command))
      )
        return { type: "night", poison: target.id };
      if (movesOn) return { type: "night" };
      if (chooseForMe) {
        if (game.wolfVictimId && game.witchHealAvailable) return { type: "night", heal: true };
        const automaticTarget = firstLivingOther((candidate) => candidate.id !== game.wolfVictimId);
        if (automaticTarget && game.witchPoisonAvailable)
          return { type: "night", poison: automaticTarget.id };
      }
      throw new Error("Say ‘save’, ‘choose Camille’ to poison, ‘choose for me’, or ‘pass’.");
    }
    if (movesOn) return { type: "night" };
    throw new Error("It is night. Say ‘continue’, ‘wait for dawn’, or ‘do nothing’.");
  }

  if (game.phase === "day") {
    const directVote =
      target && /\b(vote|choose|pick|select|eliminate|exile|remove|kick out)\b/u.test(command);
    // A spoken vote is complete in one sentence: it opens the vote, lets bots vote,
    // and records the player’s vote in the same authoritative action.
    if (directVote) return { type: "vote", target: target.id };
    if (chooseForMe) {
      const automaticTarget = firstLivingOther();
      if (automaticTarget) return { type: "vote", target: automaticTarget.id };
    }
    if (/\b(begin|start|call|open|time for)\b.*\bvote\b/u.test(command))
      return { type: "begin-vote" };
    if (/\b(discuss|discussion|hear|listen|talk)\b/u.test(command)) return { type: "discuss" };
    const speech = text
      .trim()
      .match(/^(?:say|speak|tell(?: the)? (?:village|everyone)|message)\s+(.+)$/iu)?.[1];
    if (speech) return { type: "speak", message: speech.slice(0, 400) };
    // Day speech is deliberately permissive: a player can speak to any villager naturally.
    return { type: "speak", message: text.trim().slice(0, 400) };
  }

  if (game.phase === "vote") {
    if (target && (choosesTarget || /\b(vote|eliminate|exile|remove)\b/u.test(command)))
      return { type: "vote", target: target.id };
    if (chooseForMe) {
      const automaticTarget = firstLivingOther();
      if (automaticTarget) return { type: "vote", target: automaticTarget.id };
    }
    throw new Error("Name someone to vote for, for example ‘choose Camille’ or ‘choose for me’.");
  }

  if (game.phase === "hunter") {
    if (target && (choosesTarget || /\b(shoot|fire|take|kill)\b/u.test(command)))
      return { type: "hunter-shot", target: target.id };
    if (chooseForMe) {
      const automaticTarget = firstLivingOther();
      if (automaticTarget) return { type: "hunter-shot", target: automaticTarget.id };
    }
    throw new Error("Name a player to shoot, for example ‘choose Camille’ or ‘choose for me’.");
  }

  throw new Error("There is no available game action for that command.");
}

/** Opens each day with autonomous NPC discussion; later requests select new speakers. */
async function runNpcDiscussion(game: Game) {
  if (game.phase !== "day") return;
  const recent = new Set(
    game.feed
      .slice(-4)
      .filter((entry) => entry.kind === "speech")
      .map((entry) => entry.speaker),
  );
  const candidates = game.players
    .filter(
      (candidate) =>
        candidate.alive && candidate.controller !== "human" && !recent.has(candidate.name),
    )
    .sort((first, second) => second.traits.talkativeness - first.traits.talkativeness)
    .slice(0, 3);
  for (const actor of candidates) speak(game, actor.id, await generateSpeech(game, actor));
  game.discussionDay = game.day;
}

/** Gives the player a direct conversational reply during the public morning phase. */
async function runNpcReply(game: Game, humanId: string, message: string) {
  if (game.phase !== "day") return;
  const addressed = mentionedPlayers(game, message, humanId).filter(
    (candidate) => candidate.controller !== "human",
  );
  const speakingToVillage = /\b(village|villagers|everyone|anyone)\b/iu.test(message);
  const candidates = addressed.length
    ? addressed.slice(0, 1)
    : game.players
        .filter((candidate) => candidate.alive && candidate.controller !== "human")
        .sort((first, second) => second.traits.talkativeness - first.traits.talkativeness)
        .slice(0, speakingToVillage ? 2 : 1);

  for (const actor of candidates) speak(game, actor.id, await generateSpeech(game, actor));
}

async function resolveAiNight(game: Game) {
  if (game.phase !== "night") return;
  const wolves = game.players.filter(
    (candidate) => candidate.alive && candidate.role === "werewolf",
  );
  if (!wolves.some((candidate) => candidate.nightAction?.kind === "wolf")) {
    const wolf = wolves[0];
    if (wolf) {
      const pack = new Set(wolves.map((candidate) => candidate.id));
      const target = await chooseTarget(
        game,
        wolf,
        game.players.filter((candidate) => candidate.alive && !pack.has(candidate.id)),
        "hunt",
      );
      if (target) {
        wolves.forEach((candidate) => {
          candidate.nightAction = { kind: "wolf", targetId: target.id };
        });
        game.wolfVictimId = target.id;
      }
    }
  }
  await prepareGame(game);
  if (game.phase === "night" && !player(game, "human")?.alive) resolveNight(game);
}

async function fillAiVotes(game: Game) {
  for (const actor of game.players.filter(
    (candidate) => candidate.alive && candidate.controller !== "human" && !candidate.voteId,
  )) {
    const pack =
      actor.role === "werewolf"
        ? new Set(
            game.players
              .filter((candidate) => candidate.alive && candidate.role === "werewolf")
              .map((candidate) => candidate.id),
          )
        : new Set<string>();
    const target = await chooseTarget(
      game,
      actor,
      game.players.filter(
        (candidate) => candidate.alive && candidate.id !== actor.id && !pack.has(candidate.id),
      ),
      "vote",
    );
    if (target) actor.voteId = target.id;
  }
}

async function resolveNpcHunters(game: Game) {
  while (game.phase === "hunter" && game.pendingHunters.length) {
    const hunter = player(game, game.pendingHunters[0]!);
    if (!hunter || hunter.controller === "human") return;
    const targets = game.players.filter(
      (candidate) => candidate.alive && candidate.id !== hunter.id,
    );
    const target = await chooseTarget(game, hunter, targets, "hunter shot");
    if (!target) {
      game.pendingHunters.shift();
      game.phase = game.pendingHunters.length ? "hunter" : game.resumeAfterHunter;
    } else hunterShot(game, hunter.id, target.id);
  }
}

export const loupsGarous: GameModule<Game, CreateInput, ActionInput, GameView> = {
  id: "loups-garous",
  name: "Loups-Garous",
  description: "Find the Werewolves hiding among the villagers.",
  minPlayers: 4,
  maxPlayers: 12,
  capabilities: { voiceCommands: true, undo: false },
  parseCreate: (input) => createSchema.parse(input),
  async create(input) {
    const testRoleCounts = {
      werewolf: 1,
      villager: 2,
      seer: 1,
      witch: 0,
      hunter: 0,
      cupid: 0,
    };
    const game = input.testMode
      ? createGame(input.name, 4, {
          roleCounts: testRoleCounts,
          fixedRoles: ["seer", "werewolf", "villager", "villager"],
          controllers: { "npc-1": "bot", "npc-2": "bot", "npc-3": "bot" },
          tieRule: input.tieRule,
          testMode: true,
        })
      : createGame(input.name, input.count, {
          roleCounts: input.roleCounts ?? defaultRoleCounts(input.count),
          tieRule: input.tieRule,
        });
    if (input.start) {
      if (input.testMode || input.skipIntro) {
        startGame(game);
        await prepareGame(game);
      } else introduceStory(game);
    }
    return game;
  },
  idOf: (game) => game.id,
  actorId: () => "human",
  parseAction: (input) => actionSchema.parse(input),
  parseCommand: parseGameCommand,
  async applyAction(game, actorId, action) {
    const human = player(game, actorId);
    if (!human) throw new Error("Your player is missing from this village.");
    if (game.paused && action.type !== "resume")
      throw new Error("The game is paused. Say ‘resume game’ when you are ready.");
    switch (action.type) {
      case "pause":
        setGamePaused(game, true);
        break;
      case "resume":
        setGamePaused(game, false);
        break;
      case "start":
      case "begin-story":
        startGame(game);
        await prepareGame(game);
        break;
      case "lovers":
        chooseLovers(game, human.id, action.first, action.second);
        await prepareGame(game);
        break;
      case "night":
        if (human.role === "werewolf") {
          const selectedByPlayer = Boolean(action.target);
          let targetId = action.target;
          if (!targetId) {
            const pack = new Set(
              game.players
                .filter((candidate) => candidate.alive && candidate.role === "werewolf")
                .map((candidate) => candidate.id),
            );
            targetId = (
              await chooseTarget(
                game,
                human,
                game.players.filter((candidate) => candidate.alive && !pack.has(candidate.id)),
                "hunt",
              )
            )?.id;
            if (!targetId) throw new Error("The pack has no one left to hunt.");
          }
          for (const wolf of game.players.filter(
            (candidate) => candidate.alive && candidate.role === "werewolf",
          ))
            wolf.nightAction = { kind: "wolf", targetId };
          game.wolfVictimId = targetId;
          const target = player(game, targetId);
          if (target) {
            game.feed.push({
              id: crypto.randomUUID(),
              day: game.day,
              speaker: "Private • Pack",
              text: selectedByPlayer
                ? `You chose ${target.name}. The pack carries out the hunt.`
                : `The pack chose ${target.name}. The hunt is underway.`,
              kind: "private",
              recipientId: human.id,
            });
          }
        } else if (human.role === "seer") {
          if (action.target) submitNightAction(game, human.id, { kind: "seer", targetId: action.target });
          else submitNightAction(game, human.id, { kind: "pass" });
        }
        else if (human.role === "witch")
          submitNightAction(game, human.id, {
            kind: "witch",
            heal: action.heal,
            poisonTargetId: action.poison,
          });
        else submitNightAction(game, human.id, { kind: "pass" });
        if (
          game.players.some(
            (candidate) =>
              candidate.alive &&
              candidate.role === "werewolf" &&
              candidate.nightAction?.kind === "wolf",
          )
        )
          resolveNight(game);
        break;
      case "speak":
        speak(game, human.id, action.message);
        await runNpcReply(game, human.id, action.message);
        break;
      case "discuss": {
        if (game.phase !== "day" || !human.alive)
          throw new Error("Discussion is only available to living players during the day.");
        await runNpcDiscussion(game);
        break;
      }
      case "begin-vote":
        beginVote(game);
        await fillAiVotes(game);
        break;
      case "vote":
        // Voice users can say “vote for Camille” from discussion. Open the vote
        // first so that sentence performs the same complete action as the UI flow.
        if (game.phase === "day") {
          beginVote(game);
          await fillAiVotes(game);
        }
        submitVote(game, human.id, action.target);
        await fillAiVotes(game);
        if (
          game.players.filter((candidate) => candidate.alive).every((candidate) => candidate.voteId)
        )
          resolveVote(game);
        break;
      case "hunter-shot":
        hunterShot(game, human.id, action.target);
        break;
      case "continue":
        if (human.alive) throw new Error("You are still alive; use the current phase action.");
        if (game.phase === "day") {
          beginVote(game);
          await fillAiVotes(game);
          resolveVote(game);
        } else if (game.phase === "vote") {
          await fillAiVotes(game);
          resolveVote(game);
        } else if (game.phase === "night") await resolveAiNight(game);
        break;
    }
    if (!game.paused) {
      await resolveNpcHunters(game);
      if (game.phase === "night") await resolveAiNight(game);
      if (game.phase === "day" && game.discussionDay !== game.day) await runNpcDiscussion(game);
    }
    game.updatedAt = Date.now();
  },
  view,
};
