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
    /** The Witch saves this player; it must be tonight's Werewolf target. */
    save: z.string().optional(),
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

/** Keep name matching tolerant of normal speech-recognition punctuation and accents. */
const words = (value: string) =>
  normalize(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const speechAliases: Record<string, string[]> = {
  sofia: ["sophia", "sophie"],
  noah: ["noa"],
  mia: ["mya"],
  ines: ["inez"],
  louis: ["louie"],
  raphael: ["rafael"],
  zoe: ["zoey"],
};

function playerAliases(candidate: Game["players"][number]) {
  const archetypeNoun = words(candidate.profile.archetype).split(" ").at(-1);
  return [
    words(candidate.name),
    ...(speechAliases[words(candidate.name)] ?? []),
    ...(archetypeNoun && archetypeNoun.length > 3 ? [archetypeNoun] : []),
  ];
}

function mentionedPlayers(
  game: Game,
  text: string,
  actorId: string,
  includeSelf = false,
  includeDead = false,
) {
  const candidates = game.players.filter(
    (candidate) => (includeDead || candidate.alive) && (includeSelf || candidate.id !== actorId),
  );
  const aliases = new Map<string, number>();
  for (const candidate of candidates) {
    for (const alias of new Set(playerAliases(candidate)))
      aliases.set(alias, (aliases.get(alias) ?? 0) + 1);
  }

  const spoken = ` ${words(text)} `;
  return candidates
    .flatMap((candidate) => {
      const positions = playerAliases(candidate)
        .filter((alias) => aliases.get(alias) === 1)
        .map((alias) => spoken.indexOf(` ${alias} `))
        .filter((position) => position >= 0);
      const position = Math.min(...positions);
      return Number.isFinite(position) ? [{ candidate, position }] : [];
    })
    .sort((first, second) => first.position - second.position)
    .map(({ candidate }) => candidate);
}

function parseGameCommand(text: string, game: Game, actorId: string): ActionInput {
  const command = normalize(text);
  const actor = player(game, actorId);
  if (!actor) throw new Error("Your player is missing from this village.");
  if (!command) throw new Error("Say a game command, such as ‘choose Emma’.");

  const targets = mentionedPlayers(game, command, actorId);
  const target = targets[0];
  const targetOnly =
    Boolean(target) &&
    targets.length === 1 &&
    words(command).split(" ").length <= 5 &&
    !/\b(why|how|what|who|when|where|explain|tell|is|are|was|were|suspect|trust)\b/u.test(command);
  const choosesTarget =
    targetOnly ||
    /\b(choose|pick|select|target|go with|take|that one|this one|make it|i want)\b/u.test(command);
  const movesOn =
    /\b(pass|wait|skip|rest|dawn|morning|daybreak|continue|next|go on|move on|nothing|do nothing|no action|(?:i(?:'m| am)|we(?:'re| are)|all) done|that(?:'s| is) it|end (?:my )?turn|wrap (?:this|it) up|finish (?:the )?night|call it a night|go ahead|wake (?:everyone|everybody|the village)?|go to (?:the )?(?:morning|day|dawn)|ready (?:for|to) (?:morning|daylight|dawn))\b/u.test(
      command,
    );
  const chooseForMe =
    /\b(choose|pick|select|decide)\b.*\b(for me|someone|anyone|a player)\b/u.test(command) ||
    /\b(surprise me|you decide|you pick|your choice|whatever you think|anyone is fine|whoever you want|i don't mind|doesn't matter)\b/u.test(
      command,
    );
  const huntIntent =
    /\b(hunt|attack|kill|go after|get rid of|take out|finish off|take down|make .* disappear)\b/u.test(
      command,
    );
  const investigateIntent =
    /\b(investigate|check|inspect|see|look at|look into|check on|find out about|learn about|reveal|read)\b/u.test(
      command,
    );
  const healIntent =
    /\b(save|heal|rescue|protect|keep .* alive|use .*healing potion|help .* survive)\b/u.test(
      command,
    );
  const poisonIntent = /\b(poison|dose|kill|go after|get rid of|take out|finish off)\b/u.test(
    command,
  );
  const voteIntent =
    /\b(vote|choose|pick|select|eliminate|exile|remove|kick out|get rid of|take out|send (?:them|him|her|\w+) (?:home|away)|send home|drive out|banish|nominate|should (?:leave|go)|needs? to go|must go|goes home)\b/u.test(
      command,
    );
  const firstLivingOther = (
    predicate: (candidate: Game["players"][number]) => boolean = () => true,
  ) =>
    game.players.find(
      (candidate) => candidate.alive && candidate.id !== actorId && predicate(candidate),
    );

  if (
    /\b(pause|hold|freeze|stop)\b.*\b(game|match|play|village)\b/u.test(command) ||
    /\b(?:take|need) a break\b/u.test(command)
  )
    return { type: "pause" };
  if (/\b(resume|continue|unpause|carry on)\b.*\b(game|match|play|village)\b/u.test(command))
    return { type: "resume" };
  if (game.paused) throw new Error("The game is paused. Say ‘resume game’ when you are ready.");
  if (
    /\b(don't|do not|never|cancel)\b/u.test(command) &&
    (choosesTarget || huntIntent || healIntent || poisonIntent || voteIntent)
  )
    throw new Error("No action was taken. Say one affirmative choice when you are ready.");

  if (game.phase === "prologue") {
    if (
      movesOn ||
      /\b(begin|start|skip|night|story|ready|let(?:'s| us) go|get started)\b/u.test(command)
    )
      return { type: "begin-story" };
    throw new Error("Tell me when you are ready to move on, and I will begin the first night.");
  }

  if (game.phase === "cupid") {
    const lovers = mentionedPlayers(game, command, actorId, true);
    if (/\b(me|myself)\b/u.test(command) && !lovers.some((p) => p.id === actorId))
      lovers.unshift(actor);
    if (lovers.length === 2) return { type: "lovers", first: lovers[0]!.id, second: lovers[1]!.id };
    if (chooseForMe) {
      const choices = game.players
        .filter((candidate) => candidate.alive && candidate.id !== actorId)
        .slice(0, 2);
      if (choices.length === 2)
        return { type: "lovers", first: choices[0]!.id, second: choices[1]!.id };
    }
    throw new Error("Name two players to bind together, or ask me to choose the pair for you.");
  }

  // Eliminated players retain only their Hunter shot or the ability to advance the story.
  if (!actor.alive && game.phase !== "hunter") {
    if (movesOn || /\b(watch|keep going)\b/u.test(command)) return { type: "continue" };
    throw new Error("You are out of the village. Tell me when you want the story to continue.");
  }

  if (game.phase === "night") {
    if (actor.role === "werewolf") {
      if (movesOn || /\b(delegate|pack decide|let the pack)\b/u.test(command))
        return { type: "night" };
      if (target && (choosesTarget || huntIntent)) return { type: "night", target: target.id };
      if (chooseForMe) {
        const automaticTarget = firstLivingOther((candidate) => candidate.role !== "werewolf");
        if (automaticTarget) return { type: "night", target: automaticTarget.id };
      }
      throw new Error("Tell me who the pack should go after, or ask the pack to decide.");
    }
    if (actor.role === "seer") {
      if (movesOn) return { type: "night" };
      if (target && (choosesTarget || investigateIntent))
        return { type: "night", target: target.id };
      if (chooseForMe) {
        const automaticTarget = firstLivingOther(
          (candidate) => !actor.investigations.some((finding) => finding.targetId === candidate.id),
        );
        if (automaticTarget) return { type: "night", target: automaticTarget.id };
      }
      throw new Error(
        "Tell me whom you want to look into, ask me to choose, or tell me to move on.",
      );
    }
    if (actor.role === "witch") {
      const victimId = game.witchHealAvailable ? game.wolfVictimId : undefined;
      const poisonClause = command.match(/\b(?:poison|dose|kill|take out)\s+(.+)$/u)?.[1];
      const poisonTarget = poisonClause
        ? mentionedPlayers(game, poisonClause, actorId)[0]
        : undefined;
      if (poisonClause && /\b(me|myself)\b/u.test(poisonClause))
        throw new Error("You cannot poison yourself. No action was taken.");
      const healClause = command
        .match(
          /\b(?:save|heal|rescue|protect)\b(.*?)(?=\b(?:and|then)\s+(?:poison|dose|kill)\b|$)/u,
        )?.[1]
        ?.trim();
      if (poisonIntent && poisonClause && !poisonTarget)
        throw new Error("Name another living player to poison. No action was taken.");
      const savedTarget =
        healClause && /\b(me|myself)\b/u.test(healClause)
          ? actor
          : healClause
            ? mentionedPlayers(game, healClause, actorId, true, true)[0]
            : undefined;
      if (healIntent && poisonIntent && poisonTarget)
        return savedTarget
          ? { type: "night", save: savedTarget.id, poison: poisonTarget.id }
          : { type: "night", heal: true, poison: poisonTarget.id };
      if (poisonIntent && !healIntent && poisonTarget)
        return { type: "night", poison: poisonTarget.id };
      // Naming tonight's victim, including “me” when the Witch is the victim, uses the heal,
      // matching the victim's card on screen.
      const savesSelf =
        victimId === actor.id &&
        /\b(me|myself|my own|you)\b/u.test(command) &&
        (healIntent || choosesTarget);
      if (savesSelf) return { type: "night", save: actor.id };
      if (victimId && target?.id === victimId && (choosesTarget || healIntent))
        return { type: "night", save: victimId };
      if (healIntent && savedTarget) return { type: "night", save: savedTarget.id };
      if (healIntent)
        return victimId ? { type: "night", save: victimId } : { type: "night", heal: true };
      if (target && (choosesTarget || poisonIntent)) return { type: "night", poison: target.id };
      if (movesOn) return { type: "night" };
      if (chooseForMe) {
        if (game.wolfVictimId && game.witchHealAvailable) return { type: "night", heal: true };
        const automaticTarget = firstLivingOther((candidate) => candidate.id !== game.wolfVictimId);
        if (automaticTarget && game.witchPoisonAvailable)
          return { type: "night", poison: automaticTarget.id };
      }
      throw new Error(
        "Tell me whether to save the victim, poison someone, move on, or choose for you.",
      );
    }
    if (movesOn) return { type: "night" };
    throw new Error("It is night. Tell me when you are ready for morning.");
  }

  if (game.phase === "day") {
    const directVote = target && voteIntent;
    // A spoken vote is complete in one sentence: it opens the vote, lets bots vote,
    // and records the player’s vote in the same authoritative action.
    if (directVote) return { type: "vote", target: target.id };
    if (chooseForMe) {
      const automaticTarget = firstLivingOther();
      if (automaticTarget) return { type: "vote", target: automaticTarget.id };
    }
    if (
      /\b(begin|start|call|open|time for)\b.*\bvote\b/u.test(command) ||
      /\b(?:time to|let(?:'s| us)|we should) (?:vote|decide)\b/u.test(command) ||
      /\bmake (?:a )?decision\b/u.test(command)
    )
      return { type: "begin-vote" };
    if (!target && /\b(discuss|discussion|hear|listen|talk|what .* think)\b/u.test(command))
      return { type: "discuss" };
    const speech = text
      .trim()
      .match(/^(?:say|speak|tell(?: the)? (?:village|everyone)|message)\s+(.+)$/iu)?.[1];
    if (speech) return { type: "speak", message: speech.slice(0, 400) };
    // Day speech is deliberately permissive: a player can speak to any villager naturally.
    return { type: "speak", message: text.trim().slice(0, 400) };
  }

  if (game.phase === "vote") {
    if (target && (choosesTarget || voteIntent)) return { type: "vote", target: target.id };
    if (chooseForMe) {
      const automaticTarget = firstLivingOther();
      if (automaticTarget) return { type: "vote", target: automaticTarget.id };
    }
    throw new Error("Tell me who should leave the village, or ask me to choose for you.");
  }

  if (game.phase === "hunter") {
    if (
      target &&
      (choosesTarget ||
        /\b(shoot|fire|take|kill|take .* with me|go after|get rid of|take out)\b/u.test(command))
    )
      return { type: "hunter-shot", target: target.id };
    if (chooseForMe) {
      const automaticTarget = firstLivingOther();
      if (automaticTarget) return { type: "hunter-shot", target: automaticTarget.id };
    }
    throw new Error("Tell me who you want to take with you, or ask me to choose for you.");
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
  if (
    !wolves.some((candidate) => candidate.controller === "human") &&
    !wolves.some((candidate) => candidate.nightAction?.kind === "wolf")
  ) {
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
  const human = player(game, "human");
  // Do not manufacture a human choice. Passive roles have no private input to
  // wait for; active roles retain their deliberate choice (including passing).
  if (
    game.phase === "night" &&
    (!human?.alive || !["werewolf", "seer", "witch"].includes(human.role))
  )
    resolveNight(game);
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
        if (game.phase !== "night") throw new Error("It is not night.");
        if (!human.alive) throw new Error("Only a living player can act at night.");
        if (human.nightAction) throw new Error("Your night action is already locked in.");
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
          const target = player(game, targetId);
          if (!target?.alive || target.role === "werewolf")
            throw new Error("Choose a living player outside the pack.");
          submitNightAction(game, human.id, { kind: "wolf", targetId });
          for (const wolf of game.players.filter(
            (candidate) => candidate.alive && candidate.role === "werewolf",
          ))
            if (wolf.id !== human.id) submitNightAction(game, wolf.id, { kind: "wolf", targetId });
          game.wolfVictimId = targetId;
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
        } else if (human.role === "seer") {
          if (action.target)
            submitNightAction(game, human.id, { kind: "seer", targetId: action.target });
          else submitNightAction(game, human.id, { kind: "pass" });
        } else if (human.role === "witch") {
          if (action.save !== undefined && action.save !== game.wolfVictimId)
            throw new Error("You can only save the player the Werewolves chose tonight.");
          submitNightAction(game, human.id, {
            kind: "witch",
            heal: action.heal || action.save !== undefined,
            poisonTargetId: action.poison,
          });
        } else submitNightAction(game, human.id, { kind: "pass" });
        // NPC abilities, especially the Witch's heal, depend on the pack's actual
        // target and must run before resolving a human Werewolf's hunt.
        await prepareGame(game);
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
        if (!human.alive) throw new Error("Only living players can open voting.");
        beginVote(game);
        await fillAiVotes(game);
        break;
      case "vote":
        // Voice users can say “vote for Emma” from discussion. Open the vote
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
