import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useId } from "react";
import { ArrowLeft, ArrowUp, Keyboard, X } from "lucide-react";
import LiquidOrb from "../components/PlayByVoice/LiquidOrb";
import { useDialogFocus } from "../hooks/useDialogFocus";
import VillageSky from "./VillageSky";
import { isEligibleSeerTarget } from "./targeting";
import { buildVillageIntroduction, VillageIntroductionSequence } from "./villageIntroduction";
import { usePresence } from "../hooks/usePresence";
import { localIntent } from "../voice/commands";
import { parseDestination, type AvailableDestination } from "../voice/navigation";
import { LiveGuidanceDelivery, parseGuidanceCommand } from "../voice/guidance";
import { isSetupStartConfirmation, setupStartDecision } from "./setupVoice";
import { RoleRevealDelivery, roleHelpIntent } from "./roleReveal";
import { flowGuidance } from "./flowNarration";
import { ActionDelivery } from "./actionDelivery";
import { VoiceCommandLane, voiceOrbAction } from "./voiceCommandLane";
import { nextRoleAction, roleExplanation } from "../../server/game/role-guidance.js";
import { DEFAULT_ROLE_COUNTS } from "../../server/game/rules.js";
import type {
  FeedEntry,
  GameView,
  PublicPlayerView,
  Role,
  VoteResult,
} from "../../server/game/types.js";
import {
  createRoleAwareNarrationBackend,
  primeBrowserNarration,
  useStoryAudio,
} from "../voice/browser-narration.js";
import { useVoiceCompanion, type VoiceToolExecutor } from "../voice/useVoiceCompanion.js";
import { looksLikeControlCommand } from "./voiceRouting.js";
import {
  clampVillageCount,
  describeWerewolfSetup,
  MAX_VILLAGE,
  MIN_VILLAGE,
  parseWerewolfSetupCommand,
} from "./setupCommands.js";

type Session = { game: GameView; token: string };
type GuideMessage = { role: "user" | "assistant"; text: string; mode?: "model" | "local" };
const roleNames: Record<Role, string> = {
  werewolf: "Werewolf",
  villager: "Villager",
  seer: "Seer",
  witch: "Witch",
  hunter: "Hunter",
  cupid: "Cupid",
};
const phaseNames = {
  setup: "Setup",
  prologue: "Story introduction",
  cupid: "Cupid chooses",
  night: "Night",
  day: "Day discussion",
  vote: "Village vote",
  hunter: "Hunter’s shot",
  over: "Game over",
};

const ART = "/artwork/loups-garous";
const PREPARE_ASSETS = [
  `${ART}/voice-companion.png`,
  `${ART}/player.svg`,
  `${ART}/minus.svg`,
  `${ART}/plus.svg`,
  `${ART}/guidance-check.svg`,
  `${ART}/home.svg`,
  `${ART}/separator-dark.svg`,
];
const SESSION_ASSETS = [`${ART}/seer-symbol.svg`, `${ART}/werewolf.png`];
const PLAYER_COLORS = [
  "#fadc57",
  "#57c1fa",
  "#fa57ed",
  "#d2fa57",
  "#fa5757",
  "#8f7bfa",
  "#57fac0",
  "#fab657",
  "#b0b0b0",
  "#5781fa",
  "#c9a27e",
];
const MY_COLOR = "#fa8b57";

type SetupStage = "preparing" | "prepare-error" | "mode" | "village" | "creating" | "create-error";

function roleTotalsFor(count: number) {
  const totals = DEFAULT_ROLE_COUNTS[count] ?? {};
  return (Object.keys(totals) as Role[])
    .filter((role) => (totals[role] ?? 0) > 0)
    .map((role) => ({ role: roleNames[role], total: totals[role] ?? 0 }));
}
type IntroStep = "village" | "role" | "role-details";

const roleCards: Record<
  Role,
  { color: string; summary: string; howItWorks: string[]; goal: string }
> = {
  seer: {
    color: "#57c1fa",
    summary: "You can discover the true identity of one player every night.",
    howItWorks: [
      "During the night, choose one player.",
      "I’ll tell you whether they are a Werewolf or not.",
      "Keep your role secret during the discussion.",
    ],
    goal: "Help the village find and eliminate all Werewolves before they take over.",
  },
  werewolf: {
    color: "#ec4c4c",
    summary: "Each night, your pack secretly chooses one villager to remove.",
    howItWorks: [
      "During the night, choose a target with your pack, or let the pack decide.",
      "By day, blend in with the villagers.",
      "Never reveal who is in your pack.",
    ],
    goal: "Remove villagers until the Werewolves equal or outnumber everyone else.",
  },
  witch: {
    color: "#a77bfa",
    summary: "You hold one healing potion and one poison potion for the whole game.",
    howItWorks: [
      "While your heal remains, you learn the Werewolves’ target.",
      "You may save them, poison someone else, or pass.",
      "Each potion can be used only once.",
    ],
    goal: "Help the village find and eliminate all Werewolves before they take over.",
  },
  hunter: {
    color: "#8bc34a",
    summary: "If you are eliminated, you take one final shot.",
    howItWorks: [
      "You have no night action, so rest until dawn.",
      "If you are eliminated, choose one living player to take with you.",
      "Keep your role secret during the discussion.",
    ],
    goal: "Help the village find and eliminate all Werewolves before they take over.",
  },
  cupid: {
    color: "#fa57ed",
    summary: "At the start of the game, you bind two players as lovers.",
    howItWorks: [
      "Before the first night, choose two living players.",
      "If one lover dies, the other dies too.",
      "Keep your role secret during the discussion.",
    ],
    goal: "Help the village find and eliminate all Werewolves before they take over.",
  },
  villager: {
    color: "#fadc57",
    summary: "You have no night power, but your voice and vote matter.",
    howItWorks: [
      "Rest during the night.",
      "By day, listen closely and question the other players.",
      "Vote to remove the player you suspect most.",
    ],
    goal: "Help the village find and eliminate all Werewolves before they take over.",
  },
};

function preloadImage(src: string, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const image = new Image();
    const finish = () => {
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish);
    image.onload = finish;
    // Decorative artwork must not block play when an image is unavailable.
    image.onerror = finish;
    image.src = src;
  });
}

async function prepareVillage(signal: AbortSignal) {
  const health = await fetch("/api/health", { signal, cache: "no-store" });
  if (!health.ok) throw new Error("The village server is not responding.");
  await Promise.all(PREPARE_ASSETS.map((src) => preloadImage(src, signal)));
}

function openingBriefing(game: GameView, explainAsWePlay: boolean) {
  const { me } = game;
  const roleBriefing: Record<Role, string> = {
    seer: "You are the Seer. Each night, privately investigate one living player to learn whether they are a Werewolf.",
    werewolf:
      "You are a Werewolf. Each night, privately choose a non-wolf target with your pack and keep your identity hidden by day. You can also say ‘let the pack decide’ to move on without choosing a target yourself.",
    witch:
      "You are the Witch. You have one heal and one poison potion for the whole game, both used during the night.",
    hunter:
      "You are the Hunter. If the village eliminates you, you get one final shot before the game continues.",
    cupid:
      "You are Cupid. At the opening, bind two living players as lovers; if one dies, the other dies too.",
    villager:
      "You are a Villager. You have no night power, so listen closely, test stories, and help expose the Werewolves.",
  };
  const nextStep =
    game.phase === "prologue"
      ? "Meet the village, then begin the first night when you are ready."
      : game.phase === "night"
        ? "It is night now, so follow the private action in your turn panel."
        : "Use the current phase panel for your next action.";
  const nightVoiceExample: Record<Role, string> = {
    seer: "say ‘investigate Emma’",
    werewolf: "say ‘hunt Emma’ or ‘let the pack decide’",
    witch: "say ‘save’, ‘poison Emma’, or ‘pass’",
    hunter: "say ‘wait for dawn’ until you need your final shot",
    cupid: "say ‘wait for dawn’ once the lovers are bound",
    villager: "say ‘wait for dawn’",
  };

  const essentials = [
    `Welcome to Valombre. ${roleBriefing[me.role]}`,
    `Press the voice orb and allow the microphone. At night, ${nightVoiceExample[me.role]}, or simply say ‘choose Emma’.`,
    nextStep,
  ];

  if (!explainAsWePlay)
    return [
      ...essentials,
      "Guided explanations are off for this game. Say ‘voice help’ or ask a question whenever you want help.",
    ].join(" ");

  return [
    `Welcome to Valombre. ${roleBriefing[me.role]}`,
    "The village wins by removing every Werewolf. The Werewolves win when they equal or outnumber everyone else. Nights are private; mornings are for public discussion and a village vote.",
    `Press the voice orb and allow the microphone. At night, ${nightVoiceExample[me.role]}, or simply say ‘choose Emma’. During the morning, say ‘Emma, why do you suspect Sofia?’ or ‘tell the village I trust Lucas’ to post a public message; the villagers will answer. Say ‘hear the villagers’, ‘begin vote’, ‘vote for Emma’, or ‘what can I do?’ at any time.`,
    "For the full hands-free control list, say ‘voice help’. You can also say ‘repeat that’, ‘pause narration’, ‘speak slower’, ‘pause game’, ‘resume game’, or ‘stop voice control’.",
    nextStep,
  ].join(" ");
}

function normalizeVoiceText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase();
}

function normalizeVoiceCommand(value: string) {
  return normalizeVoiceText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

/** Accept a player's intent, not one exact incantation, before routing it. */
function startsNewGameNaturally(text: string) {
  const command = normalizeVoiceCommand(text);
  if (/^how\b/u.test(command)) return false;
  return (
    /\b(?:start|begin|create|make|launch)\b.*\b(?:game|match|village|round|session|demo|test)\b/u.test(
      command,
    ) ||
    /\b(?:let s|i want to|can we|shall we|ready to|time to) (?:start|begin|play)\b/u.test(
      command,
    ) ||
    /\b(?:another round|one more game|run it back|get started|play a game)\b/u.test(command)
  );
}

/**
 * Questions can still be actions. Keep target-and-phase language on the
 * validated command route instead of accidentally sending it to the guide.
 */
function looksLikeGameAction(text: string, game?: GameView) {
  if (!game) return startsNewGameNaturally(text);
  const command = normalizeVoiceCommand(text);
  const hasPlayerName = game.players.some((candidate) => {
    if (!candidate.alive || candidate.id === game.me.id) return false;
    const archetypeNoun = normalizeVoiceCommand(candidate.profile.archetype).split(" ").at(-1);
    return (
      command.includes(normalizeVoiceCommand(candidate.name)) ||
      Boolean(archetypeNoun && archetypeNoun.length > 3 && command.includes(archetypeNoun))
    );
  });
  const movesOn =
    /\b(?:pass|wait|skip|rest|dawn|morning|daybreak|continue|next|go on|move on|(?:i m|we re|all) done|that s it|end (?:my )?turn|wrap (?:this|it) up|finish (?:the )?night|go ahead|wake (?:everyone|everybody|the village)?|go to (?:the )?(?:morning|day|dawn)|ready (?:for|to) (?:morning|daylight|dawn))\b/u.test(
      command,
    );
  const choosesForMe =
    /\b(?:you decide|you pick|your choice|surprise me|whatever you think|anyone is fine|whoever you want)\b/u.test(
      command,
    );
  const selection =
    /\b(?:choose|pick|select|target|go with|hunt|attack|kill|go after|get rid of|take out|investigate|check|inspect|look at|look into|check on|save|heal|rescue|protect|poison|vote|eliminate|exile|remove|kick out|send home|banish|nominate|shoot|fire|take .* with me)\b/u.test(
      command,
    );
  const voteIntent =
    /\b(?:should (?:leave|go)|needs? to go|must go|goes home|time to vote|begin (?:the )?vote|start (?:the )?vote|make (?:a )?decision)\b/u.test(
      command,
    );

  if (/\b(?:pause|hold|freeze|resume|unpause)\b.*\b(?:game|match|village|play)\b/u.test(command))
    return true;
  if (game.phase === "prologue")
    return movesOn || /\b(?:ready|begin|start|night|let s go|get started)\b/u.test(command);
  if (game.phase === "cupid") return choosesForMe || (hasPlayerName && selection);
  if (game.phase === "night") return movesOn || choosesForMe || (hasPlayerName && selection);
  if (game.phase === "day") return (hasPlayerName && (selection || voteIntent)) || voteIntent;
  if (game.phase === "vote") return choosesForMe || (hasPlayerName && (selection || voteIntent));
  if (game.phase === "hunter") return choosesForMe || (hasPlayerName && selection);
  return false;
}

function readableFeedEntry(entry: FeedEntry) {
  const speaker = entry.kind === "private" ? "Private guide" : entry.speaker;
  return `Day ${entry.day}. ${speaker}: ${entry.text}`;
}

function currentActionHelp(game: GameView) {
  return nextRoleAction(game);
}

function roleStateSummary(game: GameView) {
  const { me } = game;
  const details = [
    `Your role is ${roleNames[me.role]}.`,
    me.alive ? "You are alive." : "You have been eliminated.",
  ];
  if (me.role === "werewolf")
    details.push(
      !me.alive
        ? "You are eliminated; living pack information is unavailable."
        : me.werewolfTeam?.length
          ? `Your pack is ${me.werewolfTeam.join(", ")}.`
          : "You are the lone Werewolf.",
    );
  if (me.role === "witch")
    details.push(
      `Your healing potion is ${me.witchHealAvailable ? "available" : "used"}, and your poison potion is ${me.witchPoisonAvailable ? "available" : "used"}.`,
      ...(me.wolfVictim ? [`The Werewolves targeted ${me.wolfVictim} tonight.`] : []),
    );
  if (me.investigations.length) {
    details.push(
      ...me.investigations.map(
        (finding) =>
          `Your private Seer finding from day ${finding.day}: ${finding.name} is ${finding.result === "wolf" ? "a Werewolf" : "clear"}.`,
      ),
    );
  }
  if (me.lover) details.push(`You are bound to ${me.lover}.`);
  if (me.hunterActionPending) details.push("Your Hunter shot is ready now.");
  details.push(currentActionHelp(game));
  return details.join(" ");
}

function rosterSummary(game: GameView) {
  const alive = game.players.filter((player) => player.alive);
  const eliminated = game.players.filter((player) => !player.alive);
  const aliveNames = alive.map(
    (player) => `${player.name}${player.id === game.me.id ? ", you" : ""}`,
  );
  const eliminatedNames = eliminated.map(
    (player) =>
      `${player.name}${player.revealedRole ? `, revealed as ${roleNames[player.revealedRole]}` : ""}`,
  );
  return [
    `${alive.length} of ${game.players.length} players are alive: ${aliveNames.join("; ") || "nobody"}.`,
    eliminatedNames.length
      ? `Eliminated players: ${eliminatedNames.join("; ")}.`
      : "No one is eliminated.",
  ].join(" ");
}

function voiceHelp(game: GameView) {
  return [
    currentActionHelp(game),
    "To hear the interface in order, say ‘describe the interface’. Say ‘read my role’, ‘read the players’, ‘who is alive’, ‘read updates’, ‘read all messages’, or ‘what did Emma say?’ to hear game information.",
    "For audio, say ‘repeat that’, ‘stop speaking’, ‘pause narration’, ‘resume narration’, ‘speak slower’, ‘speak faster’, ‘volume up’, ‘volume down’, ‘turn auto read on’, or ‘turn auto read off’.",
    "For choices, you can say ‘choose Emma’, ‘pick Lucas’, ‘select Sofia’, ‘vote for Noah’, ‘choose for me’, ‘continue’, or ‘do nothing’. Say ‘pause game’, ‘resume game’, ‘pause voice control’, or ‘resume listening’ whenever you need them.",
  ].join(" ");
}

function interfaceSummary(game: GameView) {
  return [
    `You are on the Loups-Garous game screen, day ${game.day}, in ${phaseNames[game.phase]}.`,
    "From top to bottom, the header has the game name, Audio Settings, and Help. Home is on the left edge.",
    "Next is the round heading, the latest village update, and a card for every player showing whether they are alive or eliminated.",
    "Below the players are the actions available in this phase.",
    "After that, Game tools holds the village history, your private role and findings, the private guide, story audio controls, Voice Guide controls, a typed fallback command box, and New game.",
    currentActionHelp(game),
    "You never need to use these controls by sight. Say ‘voice help’ for commands, or ask me to read any section again.",
  ].join(" ");
}

function updatesForReading(game: GameView, command: string) {
  const normalized = normalizeVoiceText(command);
  const requestedPlayer = game.players.find((player) =>
    normalized.includes(normalizeVoiceText(player.name)),
  );
  const requestedSpeaker = requestedPlayer?.name;
  const latestOnly = /\b(latest|newest|last)\b/u.test(normalized);
  const readEverything = /\b(all|every|everything|entire|whole)\b/u.test(normalized);
  const amountMatch = normalized.match(/\b(\d{1,2})\b/u);
  const namedAmount = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/u.exec(
    normalized,
  )?.[1];
  const namedAmounts: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const amount = amountMatch ? Number(amountMatch[1]) : namedAmount ? namedAmounts[namedAmount] : 5;
  let entries = requestedSpeaker
    ? game.feed.filter((entry) => entry.speaker === requestedSpeaker)
    : [...game.feed];
  if (!readEverything) entries = latestOnly ? entries.slice(-1) : entries.slice(-amount);
  if (!entries.length)
    return [
      requestedSpeaker
        ? `${requestedSpeaker} has not sent a village message yet.`
        : "There are no village updates to read yet.",
    ];
  const label = requestedSpeaker
    ? `${requestedSpeaker}'s messages`
    : readEverything
      ? "every available village update"
      : latestOnly
        ? "the latest update"
        : `the latest ${entries.length} updates`;
  return [`Reading ${label}.`, ...entries.map(readableFeedEntry)];
}

function GameDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const { dialogRef, onKeyDown } = useDialogFocus(onClose);
  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="confirm-dialog ww-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ww-dialog-heading">
          <h2 id={titleId} className="confirm-title">
            {title}
          </h2>
          <button
            type="button"
            className="text-icon"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function WerewolfApp({
  narrationVolume,
  onNarrationVolumeChange,
  onShowGamePicker,
  onNavigateGame,
  autoVoice = false,
}: {
  autoVoice?: boolean;
  narrationVolume: number;
  onNarrationVolumeChange: (volume: number) => void;
  onShowGamePicker: () => void;
  onNavigateGame?: (destination: AvailableDestination, startVoice?: boolean) => void;
}) {
  const [session, setSession] = useState<Session>();
  const [presentedGame, setPresentedGame] = useState<GameView>();
  const [name] = useState("You");
  const [count, setCount] = useState(6);
  const [tieRule] = useState("no-exile");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [heal, setHeal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Voice is off.");
  const [guideMessages, setGuideMessages] = useState<GuideMessage[]>([]);
  const [guideText, setGuideText] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [narrationError, setNarrationError] = useState("");
  const [openingAudio, setOpeningAudio] = useState<{ gameId: string; text: string }>();
  const [stage, setStage] = useState<SetupStage>("preparing");
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const [explainGame, setExplainGame] = useState(true);
  const [setupAwaitingConfirmation, setSetupAwaitingConfirmation] = useState(false);
  const [introStep, setIntroStep] = useState<IntroStep | null>(null);
  const [seenInvestigations, setSeenInvestigations] = useState(0);
  const [voteOutcome, setVoteOutcome] = useState<{ result: VoteResult; revealing: boolean }>();
  const [dialog, setDialog] = useState<"audio" | "help" | null>(null);
  const [typing, setTyping] = useState(false);
  const createControllerRef = useRef<AbortController | null>(null);
  const lastCreateTestModeRef = useRef(false);
  const typedToggleRef = useRef<HTMLButtonElement>(null);
  const commandPanel = usePresence(typing);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const villageIntroductionRef = useRef(new VillageIntroductionSequence());
  const introductionFeedIdsRef = useRef(new Set<string>());
  const [introductionRevision, setIntroductionRevision] = useState(0);
  const roleRevealRef = useRef(new RoleRevealDelivery());
  const [roleRevealRevision, setRoleRevealRevision] = useState(0);
  const [roleVoiceWaitExpired, setRoleVoiceWaitExpired] = useState(false);

  // Reopening during the closing animation reuses the panel, so focus the input explicitly.
  useEffect(() => {
    if (typing) commandInputRef.current?.focus();
  }, [typing]);
  const latestGameRef = useRef<GameView | undefined>(undefined);
  const sessionRef = useRef<Session | undefined>(undefined);
  const presentedGameRef = useRef<GameView | undefined>(undefined);
  const voiceCommandHandlerRef = useRef<(transcript: string) => Promise<void>>(
    async () => undefined,
  );
  const setupConfirmationRef = useRef(false);
  useEffect(() => {
    setupConfirmationRef.current = setupAwaitingConfirmation;
  }, [setupAwaitingConfirmation]);
  const directConfirmationItemsRef = useRef(new Set<string>());
  const voiceCommandLaneRef = useRef(new VoiceCommandLane());
  const voiceExecutor = useMemo<VoiceToolExecutor>(
    () => ({
      ownsToolResponse: true,
      onUserTranscript: (transcript, itemId) => {
        if (
          sessionRef.current ||
          !setupConfirmationRef.current ||
          directConfirmationItemsRef.current.has(itemId) ||
          !isSetupStartConfirmation(transcript)
        )
          return;
        directConfirmationItemsRef.current.add(itemId);
        voiceCommandLaneRef.current.confirmedDirectly(transcript);
        void voiceCommandHandlerRef.current(transcript);
      },
      execute: async (name, rawArguments) => {
        if (name !== "submit_player_command")
          return JSON.stringify({ status: "error", message: "Unknown voice command." });
        let command: unknown;
        try {
          command = (JSON.parse(rawArguments || "{}") as { command?: unknown }).command;
        } catch {
          command = undefined;
        }
        if (typeof command !== "string" || !command.trim())
          return JSON.stringify({ status: "error", message: "Repeat the command in words." });
        if (voiceCommandLaneRef.current.consumeDirectConfirmation(command))
          return JSON.stringify({
            status: "completed",
            message: "Setup confirmation already handled.",
          });
        await voiceCommandHandlerRef.current(command);
        return JSON.stringify({
          status: "completed",
          message: "The application handled the command and narrates any result.",
        });
      },
    }),
    [],
  );
  // The live session owns setup guidance and voice commands. Authored gameplay
  // scenes continue through the story narrator after a village starts.
  const voice = useVoiceCompanion(
    voiceExecutor,
    false,
    "loups-garous",
    "home",
    Math.round(narrationVolume * 100),
  );
  const voiceCommandsPaused = voice.commandsPaused;
  const countRef = useRef(count);
  const explainGameRef = useRef(explainGame);
  const startVoiceRef = useRef(voice.start);
  startVoiceRef.current = voice.start;
  useEffect(() => {
    if (autoVoice) void startVoiceRef.current();
  }, [autoVoice]);
  const currentCommandHandlerRef = useRef(handleVoiceCommand);
  const actionInFlightRef = useRef(false);
  const actionDeliveryRef = useRef(new ActionDelivery());
  const guideRequestIdRef = useRef(0);
  const guideAbortRef = useRef<AbortController | undefined>(undefined);
  // Preserve ordinary story speech. Essential private role guidance uses an
  // explicit audio element, with local speech as the offline fallback.
  const narrationBackend = useMemo(
    () => createRoleAwareNarrationBackend(session?.game.id, session?.token, setNarrationError),
    [session?.game.id, session?.token],
  );
  const revealNarratedPhase = useCallback(() => {
    const latestGame = latestGameRef.current;
    if (!latestGame) return;
    presentedGameRef.current = latestGame;
    setPresentedGame(latestGame);
  }, []);
  const storyFeed = useMemo(
    () => session?.game.feed.filter((entry) => !introductionFeedIdsRef.current.has(entry.id)) ?? [],
    [session?.game.feed],
  );
  const flowLine = useMemo(() => {
    const game = session?.game;
    if (!game || introStep || game.phase === "prologue") return undefined;
    const finding =
      game.me.investigations.length > seenInvestigations
        ? game.me.investigations.at(-1)
        : undefined;
    return {
      id: `flow:${game.id}:${game.feed.at(-1)?.id}:${game.phase}:${game.paused}:${voteOutcome?.result.day}:${voteOutcome?.revealing}:${finding?.day}:${seenInvestigations}`,
      speaker: "Guide",
      text: flowGuidance(game, { vote: voteOutcome, finding }),
    };
  }, [session?.game, introStep, voteOutcome, seenInvestigations]);
  const storyAudio = useStoryAudio({
    initialVolume: narrationVolume,
    onVolumeChange: onNarrationVolumeChange,
    feed: storyFeed,
    gameId: session?.game.id,
    phase: session?.game.phase,
    onPhaseBoundaryStart: revealNarratedPhase,
    backend: narrationBackend,
    closingLine: flowLine,
    onNarrationStarted: () => setNarrationError(""),
    onNarrationFailed: () =>
      setNarrationError(
        "Narration could not finish. The game has not taken another action. Open Audio Settings and choose Repeat, or choose Start narration to retry. You can also ask What do I do next, or read the current instructions in Help.",
      ),
  });

  useEffect(() => {
    if (!session || introStep === "village") return;
    const speaking = Boolean(storyAudio.activeSpeaker);
    voice.setOutputSuppressed(speaking);
    if (speaking) voice.interrupt();
  }, [
    session?.game.id,
    introStep,
    storyAudio.activeSpeaker,
    voice.setOutputSuppressed,
    voice.interrupt,
  ]);

  useEffect(() => {
    storyAudio.updateVolume(narrationVolume);
  }, [narrationVolume]);

  function commitGame(game: GameView, token: string) {
    const previous = latestGameRef.current;
    // A newly resolved village vote gets its result and, after an exile, the revealed role.
    if (
      previous &&
      game.lastVoteResult &&
      JSON.stringify(previous.lastVoteResult) !== JSON.stringify(game.lastVoteResult)
    )
      setVoteOutcome({ result: game.lastVoteResult, revealing: false });
    const nextSession = { game, token };
    latestGameRef.current = game;
    sessionRef.current = nextSession;
    setSession(nextSession);
    // A player command always wins over an in-progress announcement. Showing the
    // new game state immediately prevents a spoken move from being applied to an
    // old day or night screen.
    presentedGameRef.current = game;
    setPresentedGame(game);
  }

  useEffect(() => {
    if (stage !== "preparing") return;
    const controller = new AbortController();
    prepareVillage(controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        setStage("mode");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error && cause.name !== "TypeError"
            ? cause.message
            : "Loups-Garous could not reach the village server.",
        );
        setStage("prepare-error");
      });
    return () => controller.abort();
  }, [stage, prepareAttempt]);

  function retryPreparation() {
    setError("");
    setStage("preparing");
    setPrepareAttempt((attempt) => attempt + 1);
  }

  function cancelCreation() {
    createControllerRef.current?.abort();
    createControllerRef.current = null;
    setBusy(false);
  }

  function leaveToGamePicker() {
    voiceCommandLaneRef.current.reset();
    cancelCreation();
    villageIntroductionRef.current.skip();
    storyAudio.stop();
    voice.interrupt();
    onShowGamePicker();
  }

  function openNewGameSetup() {
    voiceCommandLaneRef.current.reset();
    cancelCreation();
    cancelPendingGuide();
    voice.interrupt();
    storyAudio.stop();
    setSession(undefined);
    setPresentedGame(undefined);
    latestGameRef.current = undefined;
    sessionRef.current = undefined;
    setIntroStep(null);
    villageIntroductionRef.current.skip();
    introductionFeedIdsRef.current = new Set();
    setIntroductionRevision((value) => value + 1);
    setError("");
    setStage("village");
  }

  async function create(event?: FormEvent, testMode = false) {
    event?.preventDefault();
    // One launch at a time: repeated clicks or voice commands reuse the pending request.
    if (createControllerRef.current) return;
    const count = countRef.current;
    const explainGame = explainGameRef.current;
    const controller = new AbortController();
    createControllerRef.current = controller;
    lastCreateTestModeRef.current = testMode;
    cancelPendingGuide();
    setStage("creating");
    primeBrowserNarration();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          name,
          count,
          tieRule,
          start: true,
          testMode,
          explainAsWePlay: explainGame,
          // The narrated introduction is part of the hands-free game flow. Keep it
          // for every new village so a returning player never lands in the middle
          // of a night without the role and controls being introduced first.
          skipIntro: false,
        }),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error ?? "Could not create a game.");
      const game = data as GameView;
      const briefing = openingBriefing(game, explainGame);
      const introduction = buildVillageIntroduction(game.id, game.players, game.me.id);
      if (!introduction.length) {
        throw new Error("The village roster is unavailable. Return to setup and try again.");
      }
      void Promise.all(SESSION_ASSETS.map((src) => preloadImage(src, controller.signal)));
      introductionFeedIdsRef.current = new Set(game.feed.map((entry) => entry.id));
      villageIntroductionRef.current.start(game.id, introduction);
      commitGame(game, data.session);
      setSeenInvestigations(game.me.investigations.length);
      setVoteOutcome(undefined);
      setIntroStep(game.phase === "prologue" ? "village" : "role");
      setIntroductionRevision((value) => value + 1);
      setSelected([]);
      setGuideMessages([
        {
          role: "assistant",
          mode: "local",
          text: briefing,
        },
      ]);
      setOpeningAudio({ gameId: game.id, text: briefing });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Could not create a game.");
      setStage("create-error");
    } finally {
      if (createControllerRef.current === controller) {
        createControllerRef.current = null;
        setBusy(false);
      }
    }
  }

  async function perform(input: Record<string, unknown>, announceFailure = false) {
    const activeSession = sessionRef.current;
    if (!activeSession) return undefined;
    if ((voteOutcome || pendingFinding) && input.type !== "pause" && input.type !== "resume") {
      narrateAccessibility([
        flowGuidance(activeSession.game, { vote: voteOutcome, finding: pendingFinding }),
      ]);
      return undefined;
    }
    if (
      (introStep === "role" || introStep === "role-details") &&
      !roleRevealRef.current.canContinue() &&
      input.type !== "pause" &&
      input.type !== "resume"
    ) {
      setNarrationError(
        "Your role explanation is still pending. Say Repeat my role to hear it, or skip role explanation to continue now.",
      );
      return undefined;
    }
    if (actionInFlightRef.current || busy) {
      if (announceFailure) queueAssistant("One moment. I am still resolving the previous command.");
      return undefined;
    }
    let delivery;
    try {
      delivery = actionDeliveryRef.current.request(activeSession.game.id, input);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Say retry last move.";
      setError(message);
      narrateAccessibility([message]);
      return undefined;
    }
    cancelPendingGuide();
    // A player action wins over any older scene. This keeps commands such as
    // “wait for dawn” from being trapped behind a long narration queue.
    storyAudio.stop();
    actionInFlightRef.current = true;
    setBusy(true);
    setVoiceStatus("The guide is resolving your move…");
    setError("");
    try {
      const response = await fetch(`/api/games/${activeSession.game.id}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Game-Session": activeSession.token,
          "X-Request-Id": delivery.requestId,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json();
      if (sessionRef.current?.game.id !== activeSession.game.id) return undefined;
      if (response.status !== 409) actionDeliveryRef.current.confirmed(delivery.requestId);
      if (!response.ok) throw new Error(data.error ?? "That action could not be completed.");
      const game = data as GameView;
      commitGame(game, activeSession.token);
      // The state-driven narration queue reads the result and next action once.
      // A second imperative confirmation here raced the phase-cleanup effect.
      setSelected([]);
      setHeal(false);
      return game;
    } catch (cause) {
      if (sessionRef.current?.game.id !== activeSession.game.id) return undefined;
      const message =
        cause instanceof Error ? cause.message : "That action could not be completed.";
      if (message === "Game not found.") {
        recoverExpiredSession();
        queueAssistant("That village is no longer open. Say ‘start the game’ to begin a new one.");
        return undefined;
      }
      const recovery = actionDeliveryRef.current.pending
        ? `${message} Your move's result is not confirmed. Say retry last move; the same request will be checked without taking the action twice.`
        : `${message} No action was taken. ${flowGuidance(activeSession.game)}`;
      setError(recovery);
      narrateAccessibility([recovery]);
      return undefined;
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
      if (!voiceCommandsPaused)
        setVoiceStatus(
          sessionRef.current ? "Voice companion is listening" : "Listening — say “start the game”",
        );
    }
  }

  async function act(type: string, values: Record<string, unknown> = {}) {
    const result = await perform({ type, ...values });
    return result;
  }

  function queueAssistant(
    text: string,
    mode: "model" | "local" = "local",
    options: { instant?: boolean } = {},
  ) {
    appendAssistantCaption(text, mode);
    if (!session && voice.status === "connected") {
      storyAudio.stop();
      if (voice.announce(text)) return;
    }
    storyAudio.enqueue({
      id: crypto.randomUUID(),
      speaker: "Assistant",
      text,
      voiceKey: "assistant",
      duringLive: true,
      instant: options.instant ?? voice.status === "connected",
    });
  }

  const setupGuidanceDelivery = useRef(new LiveGuidanceDelivery());
  const currentSetupGuidanceRef = useRef("");
  const liveAnnounce = voice.announce;
  const livePlaybackSequence = voice.playbackSequence;
  const liveSessionSequence = voice.sessionSequence;
  const liveStatus = voice.status;
  const stopStoryAudio = storyAudio.stop;
  const suppressLiveOutput = voice.setOutputSuppressed;

  const roleRevealVisible = Boolean(
    session && (introStep === "role" || introStep === "role-details"),
  );
  const roleRevealKey = session?.game.me?.role
    ? `${session.game.id}:${session.game.me.id}:${session.game.me.role}`
    : undefined;

  useEffect(() => {
    setRoleVoiceWaitExpired(false);
    if (!roleRevealVisible || liveStatus !== "connecting") return;
    const timer = window.setTimeout(() => setRoleVoiceWaitExpired(true), 8_000);
    return () => window.clearTimeout(timer);
  }, [roleRevealVisible, liveStatus, roleRevealKey]);

  // This effect runs after useStoryAudio's game/phase cleanup. Both mouse and
  // voice navigation converge here, after the reveal has actually rendered.
  useEffect(() => {
    if (!roleRevealVisible || !session || !roleRevealKey) return;
    roleRevealRef.current.sync(roleRevealKey);
    const attempt = roleRevealRef.current.request(
      (liveStatus !== "connecting" || roleVoiceWaitExpired) &&
        !voice.needsAudioActivation &&
        !storyAudio.muted &&
        storyAudio.autoRead &&
        storyAudio.volume > 0,
    );
    if (attempt === null) return;
    stopStoryAudio();
    voice.interrupt();
    suppressLiveOutput(true);
    setNarrationError("");
    const text = `${roleExplanation(session.game)} ${nextRoleAction(session.game, true)}`;
    appendAssistantCaption(text);
    setRoleRevealRevision((value) => value + 1);
    storyAudio.enqueue({
      id: `${roleRevealKey}:reveal:${attempt}`,
      speaker: "Private role guide",
      text,
      voiceKey: "assistant",
      instant: true,
      duringLive: true,
      privateRole: true,
      onPlaybackStarted: () => {
        setNarrationError("");
        roleRevealRef.current.started(attempt);
        setRoleRevealRevision((value) => value + 1);
      },
      onPlaybackFinished: (outcome) => {
        if (!roleRevealRef.current.finish(attempt, outcome)) return;
        suppressLiveOutput(false);
        if (outcome === "completed") setNarrationError("");
        if (outcome !== "completed")
          setNarrationError(
            "Your role explanation did not finish. Say Repeat my role, choose Start narration to retry, or explicitly skip the explanation. Your role and abilities are also available in Help.",
          );
        setRoleRevealRevision((value) => value + 1);
      },
    });
  }, [
    roleRevealVisible,
    roleRevealKey,
    roleRevealRevision,
    session,
    liveStatus,
    roleVoiceWaitExpired,
    voice.needsAudioActivation,
    storyAudio.muted,
    storyAudio.autoRead,
    storyAudio.volume,
    stopStoryAudio,
    suppressLiveOutput,
  ]);

  useEffect(() => () => suppressLiveOutput(false), [suppressLiveOutput]);

  function repeatRoleExplanation() {
    if (!session) return;
    if (introStep === "village") {
      villageIntroductionRef.current.skip();
      setIntroductionRevision((value) => value + 1);
      voice.interrupt();
      setIntroStep("role");
      return;
    }
    if (roleRevealVisible) {
      storyAudio.stop();
      roleRevealRef.current.sync(
        `${session.game.id}:${session.game.me.id}:${session.game.me.role}`,
      );
      roleRevealRef.current.retry();
      setRoleRevealRevision((value) => value + 1);
    } else
      narrateAccessibility(
        [`${roleExplanation(session.game)} ${nextRoleAction(session.game)}`],
        true,
      );
  }

  async function continueAfterRole(skip = false) {
    if (!session) return;
    if (skip) roleRevealRef.current.skip();
    if (!roleRevealRef.current.canContinue()) {
      setNarrationError(
        "Please let your role explanation finish. To move on now, say skip role explanation or choose Skip role explanation.",
      );
      return;
    }
    storyAudio.stop();
    suppressLiveOutput(false);
    setNarrationError("");
    if (session.game.phase === "prologue") {
      setIntroStep(null);
      await act("begin-story");
    } else setIntroStep(null);
  }
  useEffect(() => {
    if (session) return;
    const key = `${stage}:${count}:${explainGame}:${setupAwaitingConfirmation}`;
    const message =
      stage === "prepare-error"
        ? "Loups-Garous could not load. Choose Retry or return home."
        : stage === "mode"
          ? "Welcome to Loups-Garous. Setup has two steps. First choose who to play with. Solo is selected and is the only available mode. Say Solo or choose it to continue."
          : stage === "village"
            ? setupAwaitingConfirmation
              ? `Your settings are ${count} players with explain-as-you-play ${explainGame ? "on" : "off"}. Say Start the game or choose Confirm and start.`
              : `Now set up your village. Choose from ${MIN_VILLAGE} to ${MAX_VILLAGE} players; ${count} is selected and six is the default. Explain-as-you-play is ${explainGame ? "on" : "off"}, and on is the default. Say a player count, say explanation on or off, or say Start the game to review.`
            : "";
    if (!message) return;
    currentSetupGuidanceRef.current = message;
    setupGuidanceDelivery.current.sync(key, message);
    if (liveStatus !== "connected") return;
    const guidance = setupGuidanceDelivery.current.request(
      liveSessionSequence,
      livePlaybackSequence,
    );
    if (!guidance) return;
    appendAssistantCaption(guidance);
    stopStoryAudio();
    if (!liveAnnounce(guidance)) setupGuidanceDelivery.current.requestFailed(liveSessionSequence);
  }, [
    count,
    explainGame,
    session,
    setupAwaitingConfirmation,
    stage,
    liveAnnounce,
    livePlaybackSequence,
    liveSessionSequence,
    liveStatus,
    stopStoryAudio,
  ]);

  useEffect(() => {
    setupGuidanceDelivery.current.confirmPlayback(livePlaybackSequence);
  }, [livePlaybackSequence]);

  const villageIntroductionActive = Boolean(
    introductionRevision >= 0 &&
    session?.game.phase === "prologue" &&
    introStep === "village" &&
    villageIntroductionRef.current.isActive(),
  );

  useEffect(() => {
    if (!villageIntroductionActive || liveStatus !== "connected") return;
    const line = villageIntroductionRef.current.request(liveSessionSequence, livePlaybackSequence);
    if (!line) return;
    setNarrationError("");
    appendAssistantCaption(line.text);
    stopStoryAudio();
    if (!liveAnnounce(line.text)) {
      villageIntroductionRef.current.requestFailed(liveSessionSequence);
      setNarrationError("Character narration could not start. Choose Start narration to retry.");
    }
  }, [
    introductionRevision,
    liveAnnounce,
    livePlaybackSequence,
    liveSessionSequence,
    liveStatus,
    stopStoryAudio,
    villageIntroductionActive,
  ]);

  useEffect(() => {
    if (!villageIntroductionActive) return;
    if (villageIntroductionRef.current.confirmPlayback(livePlaybackSequence))
      setIntroductionRevision((value) => value + 1);
  }, [livePlaybackSequence, villageIntroductionActive]);

  useEffect(() => {
    if (!villageIntroductionActive || liveStatus !== "connected") return;
    if (villageIntroductionRef.current.finishPlayback(voice.isSpeaking))
      setIntroductionRevision((value) => value + 1);
  }, [liveStatus, voice.isSpeaking, villageIntroductionActive]);

  function repeatVillageIntroduction(allCharacters = false) {
    const line = allCharacters
      ? villageIntroductionRef.current.restartCharacters()
      : villageIntroductionRef.current.repeat();
    if (!line) return false;
    setIntroductionRevision((value) => value + 1);
    return true;
  }

  function nextVillageCharacter() {
    const line = villageIntroductionRef.current.nextCharacter();
    if (!line) return false;
    setIntroductionRevision((value) => value + 1);
    return true;
  }

  function skipVillageIntroductions() {
    if (!villageIntroductionActive) return false;
    villageIntroductionRef.current.skip();
    setIntroductionRevision((value) => value + 1);
    appendAssistantCaption("Introductions skipped. Continue to reveal your role.");
    if (!liveAnnounce("Introductions skipped. Continue to reveal your role."))
      setNarrationError("Character narration stopped. Continue to reveal your role.");
    return true;
  }

  function recoverNarration() {
    primeBrowserNarration();
    setNarrationError("");
    if (!storyAudio.autoRead) storyAudio.toggleAutoRead();
    if (storyAudio.muted) storyAudio.toggleMuted();
    if (storyAudio.volume === 0) storyAudio.updateVolume(0.8);
    if (roleRevealVisible) {
      if (!storyAudio.autoRead) storyAudio.toggleAutoRead();
      if (storyAudio.muted) storyAudio.toggleMuted();
      if (storyAudio.volume === 0) storyAudio.updateVolume(0.8);
      if (voice.needsAudioActivation) void voice.activateAudio();
      repeatRoleExplanation();
      return;
    }
    if (villageIntroductionActive) {
      if (voice.needsAudioActivation) void voice.activateAudio();
      else if (voice.status !== "connected") void voice.start();
      else setIntroductionRevision((value) => value + 1);
      return;
    }
    if (session) {
      narrateAccessibility([
        flowGuidance(session.game, { vote: voteOutcome, finding: pendingFinding }),
      ]);
      return;
    }
    storyAudio.stop();
    const currentGuidance = currentSetupGuidanceRef.current;
    if (!session && voice.status === "connected" && currentGuidance) {
      queueAssistant(currentGuidance);
      return;
    }
    storyAudio.repeatLast();
  }

  /** Read structured, player-safe information immediately without waiting for Live Voice. */
  function narrateAccessibility(lines: string[], privateRole = false) {
    const readableLines = lines.filter((line) => line.trim());
    if (!readableLines.length) return;
    storyAudio.stop();
    voice.interrupt();
    suppressLiveOutput(true);
    setNarrationError("");
    appendAssistantCaption(readableLines.join(" "));
    for (const [index, text] of readableLines.entries()) {
      storyAudio.enqueue({
        id: crypto.randomUUID(),
        speaker: "Guide",
        text,
        voiceKey: "assistant",
        instant: true,
        duringLive: true,
        privateRole,
        onPlaybackFinished: () => {
          if (index === readableLines.length - 1) suppressLiveOutput(false);
        },
      });
    }
  }

  /** Add a visible assistant response without feeding its words back into the microphone. */
  function appendAssistantCaption(text: string, mode: "model" | "local" = "local") {
    setGuideMessages((current) => [...current, { role: "assistant", text, mode }]);
  }

  function replayOpeningBriefing() {
    if (!openingAudio?.text) return;
    storyAudio.stop();
    storyAudio.enqueue({
      id: crypto.randomUUID(),
      speaker: "Guide",
      text: openingAudio.text,
      voiceKey: "assistant",
      instant: true,
      duringLive: true,
    });
  }

  const isGuideQuestion = (text: string) =>
    /\b(explain|who|what|why|how|rule|role|story|character|introduce|summary|summari[sz]e|option|help|happening|voice|command|microphone|hands.free)\b/iu.test(
      text,
    ) && !/\b(tell everyone|tell the village|say|speak)\b/iu.test(text);

  const isVillageMessage = (text: string) => {
    if (session?.game.phase !== "day") return false;
    const addressedVillager = session.game.players.some(
      (player) =>
        player.id !== session.game.me.id &&
        text.toLocaleLowerCase().includes(player.name.toLocaleLowerCase()),
    );
    return (
      addressedVillager ||
      /\b(tell|ask|say|speak)\b.*\b(village|villagers|everyone|anyone)\b/iu.test(text) ||
      /\b(what do you think|who do you suspect|why do you|do you trust|what did you|can anyone)\b/iu.test(
        text,
      )
    );
  };

  async function handleVoiceCommand(transcript: string) {
    const command = transcript.trim();
    if (!command) return;
    setVoiceTranscript(command);
    const navigation = localIntent(command);
    if (navigation?.name === "navigate_app") {
      const destination = parseDestination(navigation.args.destination);
      if (destination === "audio" || destination === "help") {
        openTools(destination);
        return;
      }
      if (destination && destination !== "loups-garous") {
        const keepVoice = voice.status === "connected";
        window.setTimeout(() => {
          leaveToGamePicker();
          onNavigateGame?.(destination, keepVoice);
        }, 0);
        return;
      }
    }
    if (navigation?.name === "voice_control") {
      const message = voice.runVoiceControl(navigation.args.action);
      setVoiceStatus(message);
      queueAssistant(message, "local", { instant: true });
      return;
    }
    const screenControls = [
      handleDialogVoiceCommand,
      handleBackVoiceCommand,
      handleAudioVoiceCommand,
    ];
    if (screenControls.some((handle) => handle(command))) return;
    if (voice.commandsPaused) {
      queueAssistant(
        "Voice commands are paused. Say resume voice commands before playing.",
        "local",
        { instant: true },
      );
      return;
    }
    if (handleSetupVoiceCommand(command)) return;
    if (!session) {
      const guidanceCommand = parseGuidanceCommand(command);
      if (guidanceCommand === "repeat") {
        storyAudio.repeatLast();
        return;
      }
      if (guidanceCommand === "location") {
        queueAssistant(
          `You are in Loups-Garous ${stage === "mode" ? "game mode setup" : stage === "village" ? "village setup" : "loading"}.`,
        );
        return;
      }
      if (guidanceCommand === "capabilities") {
        queueAssistant(
          stage === "mode"
            ? "Choose Solo to continue. You can also repeat, ask for an explanation, go back, use defaults, or go home."
            : `Choose ${MIN_VILLAGE} to ${MAX_VILLAGE} players and explanation on or off. You can also repeat, go back, use defaults, or start the game.`,
        );
        return;
      }
      if (guidanceCommand === "explain") {
        queueAssistant(
          "Loups-Garous alternates private night actions with public day discussion and voting. Your role stays private. Complete setup one question at a time.",
        );
        return;
      }
      if (guidanceCommand === "back") {
        if (stage === "village") {
          setSetupAwaitingConfirmation(false);
          setStage("mode");
        } else leaveToGamePicker();
        return;
      }
      if (guidanceCommand === "defaults") {
        setCount(6);
        setExplainGame(true);
        setStage("village");
        setSetupAwaitingConfirmation(true);
        return;
      }
      if (stage === "mode" && /\bsolo\b/iu.test(command)) {
        setStage("village");
        return;
      }
      const countAnswer = command.match(/\b(5|6|7|8|9|10|11|12)\b/);
      if (stage === "village" && countAnswer) {
        setCount(Number(countAnswer[1]));
        setSetupAwaitingConfirmation(false);
        return;
      }
      if (
        stage === "village" &&
        /\b(?:explanation|explain as you play|guidance)\b.*\b(on|yes)\b/iu.test(command)
      ) {
        setExplainGame(true);
        setSetupAwaitingConfirmation(false);
        return;
      }
      if (
        stage === "village" &&
        /\b(?:explanation|explain as you play|guidance)\b.*\b(off|no)\b/iu.test(command)
      ) {
        setExplainGame(false);
        setSetupAwaitingConfirmation(false);
        return;
      }
      if (isSetupStartConfirmation(command) && setupAwaitingConfirmation) {
        await create();
        return;
      }
      if (guidanceCommand === "start" && stage === "village") {
        setSetupAwaitingConfirmation(true);
        return;
      }
      if (startsNewGameNaturally(command)) {
        if (/\b(quick|test)\b/iu.test(command)) {
          await create(undefined, true);
          return;
        }
        setStage("village");
        setSetupAwaitingConfirmation(true);
        queueAssistant(
          `Your village has ${count} players, and explain-as-you-play is ${explainGame ? "on" : "off"}. Say confirm to start.`,
        );
        return;
      }
      if (isGuideQuestion(command)) {
        queueAssistant(
          "Tell me you are ready to play, and I will open the village. Once it is open, I can explain your role, the rules, and every phase.",
        );
        return;
      }
      queueAssistant("Tell me when you want to play, and I will start a new village.");
      return;
    }

    const helpIntent = roleHelpIntent(command);
    if (/^retry (?:my |the |last )?(?:move|action|command)[.!]?$/iu.test(command)) {
      const pending = actionDeliveryRef.current.pending;
      if (pending?.gameId === session.game.id) await perform(pending.input, true);
      else narrateAccessibility(["There is no unconfirmed move. " + flowGuidance(session.game)]);
      return;
    }
    if (helpIntent === "role" || helpIntent === "abilities") {
      repeatRoleExplanation();
      return;
    }
    if (helpIntent === "next") {
      narrateAccessibility(
        [
          roleRevealVisible
            ? nextRoleAction(session.game, true)
            : flowGuidance(session.game, { vote: voteOutcome, finding: pendingFinding }),
        ],
        true,
      );
      return;
    }
    if (roleRevealVisible && /\bskip\b.*\b(?:role|explanation|reveal)\b/iu.test(command)) {
      await continueAfterRole(true);
      return;
    }
    const activeGuidanceCommand = parseGuidanceCommand(command);
    const currentScreenGuidance = () =>
      flowGuidance(session.game, { vote: voteOutcome, finding: pendingFinding });
    if (
      session.game.phase === "prologue" &&
      introStep === "village" &&
      /\bskip\b.*\b(?:introductions?|characters?|village)\b/iu.test(command)
    ) {
      skipVillageIntroductions();
      return;
    }
    if (
      session.game.phase === "prologue" &&
      introStep === "village" &&
      /\bnext\b.*\b(?:character|person|villager)\b/iu.test(command)
    ) {
      if (!nextVillageCharacter())
        appendAssistantCaption("The character introductions are complete.");
      return;
    }
    if (
      session.game.phase === "prologue" &&
      introStep === "village" &&
      /\b(?:repeat|replay|restart)\b.*\b(?:introductions?|characters?|village)\b/iu.test(command)
    ) {
      if (!repeatVillageIntroduction(true))
        appendAssistantCaption("There are no character introductions to repeat.");
      return;
    }
    if (activeGuidanceCommand === "repeat") {
      if (roleRevealVisible) {
        repeatRoleExplanation();
        return;
      }
      if (villageIntroductionActive) {
        repeatVillageIntroduction();
        return;
      }
      storyAudio.repeatLast();
      return;
    }
    if (activeGuidanceCommand === "location") {
      queueAssistant(
        `You are in Loups-Garous. ${roleRevealVisible ? nextRoleAction(session.game, true) : currentScreenGuidance()}`,
      );
      return;
    }
    if (activeGuidanceCommand === "capabilities") {
      queueAssistant(
        roleRevealVisible ? nextRoleAction(session.game, true) : currentScreenGuidance(),
      );
      return;
    }
    if (activeGuidanceCommand === "explain") {
      queueAssistant(
        roleRevealVisible ? nextRoleAction(session.game, true) : currentScreenGuidance(),
      );
      return;
    }
    if (activeGuidanceCommand === "back") {
      queueAssistant(
        "A live village cannot move back to an earlier phase. Continue with the available action, or say go home to leave the village.",
      );
      return;
    }
    if (activeGuidanceCommand === "defaults" || activeGuidanceCommand === "start") {
      queueAssistant(`The village is already active. ${currentActionHelp(session.game)}`);
      return;
    }

    if (
      /^(?:continue|next|go on|i(?:'m| am) ready|ready)[.!]?$/iu.test(command) &&
      session.game.phase !== "prologue"
    ) {
      if (introStep) {
        await continueAfterRole();
        return;
      }
      if (voteOutcome) {
        setVoteOutcome(
          voteOutcome.revealing || !voteOutcome.result.exiledPlayerId
            ? undefined
            : { ...voteOutcome, revealing: true },
        );
        return;
      }
      if (pendingFinding) {
        setSeenInvestigations(session.game.me.investigations.length);
        return;
      }
      if (storyAudio.phaseTransitioning) {
        storyAudio.stop();
        return;
      }
    }

    // Voice follows the same introduction as the screen: village, role card,
    // role details, then the first night.
    if (session.game.phase === "prologue") {
      const wantsToAdvance =
        !/\b(?:narration|audio|talking|speaking)\b/iu.test(command) &&
        (/\b(continue|ready|begin|start|next|go on|move on|i(?:'m| am) done|let(?:'s| us) go|get started)\b/iu.test(
          command,
        ) ||
          /\b(show|read|hear|tell me about|explain)\b.*\b(role|card|details?|instructions?)\b/iu.test(
            command,
          ));
      if (wantsToAdvance) {
        if (villageIntroductionActive) {
          setVoiceStatus(
            "Character introductions are still playing. Say next character or skip introductions.",
          );
          return;
        }
        const step = introStep ?? "village";
        if (step === "village") {
          setIntroStep("role");
          return;
        }
        if (step === "role" || step === "role-details") {
          await continueAfterRole();
          return;
        }
        await act("begin-story");
        return;
      }
    }

    if (
      /\b(describe|explain|read|what(?:'s| is) on|where (?:is|are))\b.*\b(screen|page|interface|layout|controls?)\b/iu.test(
        command,
      )
    ) {
      narrateAccessibility([interfaceSummary(session.game)]);
      return;
    }
    if (
      /\b(voice help|command help|help with (?:voice|commands)|what can i (?:say|do)|how do i (?:use|control|play))\b/iu.test(
        command,
      )
    ) {
      narrateAccessibility([voiceHelp(session.game)]);
      return;
    }
    if (
      /\b(read|hear|list|who (?:is|are))\b.*\b(players?|roster|alive|village)\b/iu.test(command)
    ) {
      narrateAccessibility([rosterSummary(session.game)]);
      return;
    }
    if (
      /\b(read|hear|what(?:'s| is)|tell me)\b.*\b(my role|role|my power|ability|private (?:result|results|info|information))\b/iu.test(
        command,
      )
    ) {
      narrateAccessibility([roleStateSummary(session.game)]);
      return;
    }
    const requestsVillageUpdates =
      /\b(read|hear|list|what did|what has|who said)\b.*\b(update|updates|message|messages|history|journal|chat|conversation|say|said|says|village)\b/iu.test(
        command,
      ) || /\b(read|hear)\b.*\b(all|every|everything|entire|whole)\b/iu.test(command);
    if (requestsVillageUpdates) {
      narrateAccessibility(updatesForReading(session.game, command));
      return;
    }
    if (/\b(current|my|the)\b.*\b(action|turn|move|phase|next step)\b/iu.test(command)) {
      narrateAccessibility([currentActionHelp(session.game)]);
      return;
    }
    if (
      /^(?:please )?(?:play again|new game|new round|start over|restart|another round|one more game)[.!]?$/iu.test(
        command,
      )
    ) {
      queueAssistant(
        "Opening game setup. Choose your village size, then start when you are ready.",
        "local",
        { instant: true },
      );
      openNewGameSetup();
      return;
    }
    if (startsNewGameNaturally(command) && !isVillageMessage(command)) {
      queueAssistant("Opening village setup. Start when your choices are ready.");
      openNewGameSetup();
      return;
    }
    if (/\b(pause|hold|freeze)\b.*\b(game|match|play)\b/iu.test(command)) {
      await act("pause");
      return;
    }
    if (/\b(resume|continue|unpause)\b.*\b(game|match|play)\b/iu.test(command)) {
      await act("resume");
      return;
    }
    if (/\b(introduce|replay|read)\b.*\b(characters?|introductions?|village)\b/iu.test(command)) {
      storyAudio.replayPublicLines();
      return;
    }
    if (/^(cancel|never mind|cancel that)\b/iu.test(command.trim())) {
      queueAssistant(
        "There is nothing to cancel right now. Say back to leave a screen, or voice help for the current commands.",
        "local",
        { instant: true },
      );
      return;
    }
    if (/^undo\b/iu.test(command.trim())) {
      queueAssistant(
        "Loups-Garous has no undo. Say read updates to hear what happened, or voice help for the current commands.",
        "local",
        { instant: true },
      );
      return;
    }
    if (looksLikeControlCommand(command)) {
      queueAssistant(
        "I could not match that control. Say voice help for the current commands, or ask me about the game.",
        "local",
        { instant: true },
      );
      return;
    }
    if (isVillageMessage(command)) {
      await perform({ command }, true);
      return;
    }
    if (isGuideQuestion(command) && !looksLikeGameAction(command, session.game)) {
      // Use the server guide for every answer. It receives the current game
      // state, while a long-running Live session only has its opening context.
      await askGuide(command);
      return;
    }
    await perform({ command }, true);
  }

  function handleDialogVoiceCommand(command: string): boolean {
    if (!dialog) return false;
    if (
      /\b(close|dismiss|exit|hide|shut)\b/iu.test(command) ||
      /^(close|dismiss|done|never mind|cancel)$/iu.test(command.trim())
    ) {
      setDialog(null);
      queueAssistant(`Closed ${dialog === "audio" ? "audio settings" : "help"}.`, "local", {
        instant: true,
      });
      return true;
    }
    return false;
  }

  function handleBackVoiceCommand(command: string): boolean {
    if (!/^(back|go back|previous step)\.?$/iu.test(command.trim())) return false;
    if (dialog) {
      setDialog(null);
      queueAssistant("Closed the dialog.", "local", { instant: true });
      return true;
    }
    if (backAction) {
      backAction.run();
      queueAssistant(`${backAction.label}.`, "local", { instant: true });
      return true;
    }
    queueAssistant("There is no previous screen right now.", "local", { instant: true });
    return true;
  }

  function handleSetupVoiceCommand(command: string): boolean {
    if (session) return false;
    const parsed = parseWerewolfSetupCommand(command, countRef.current);
    if (!parsed) return false;
    if (stage === "creating" && parsed.kind !== "read" && parsed.kind !== "cancel") {
      queueAssistant("The village is still being created. Say cancel to stop it.", "local", {
        instant: true,
      });
      return true;
    }
    if (
      (stage === "preparing" || stage === "prepare-error" || stage === "create-error") &&
      parsed.kind !== "read"
    ) {
      queueAssistant("Loups-Garous is still loading. Try again in a moment.", "local", {
        instant: true,
      });
      return true;
    }
    switch (parsed.kind) {
      case "read":
        queueAssistant(
          describeWerewolfSetup({
            stage: stage === "village" || stage === "creating" ? "village" : "mode",
            count: countRef.current,
            explainGame: explainGameRef.current,
            roles: roleTotalsFor(countRef.current),
          }),
          "local",
          { instant: true },
        );
        return true;
      case "open-mode":
        setSetupAwaitingConfirmation(false);
        setStage("mode");
        queueAssistant(
          "Solo is ready. With Friends is coming soon. Say solo or start the game.",
          "local",
          { instant: true },
        );
        return true;
      case "open-village":
        setSetupAwaitingConfirmation(false);
        setStage("village");
        queueAssistant(
          `${countRef.current} players. Say more players, fewer players, or start the game.`,
          "local",
          { instant: true },
        );
        return true;
      case "set-count": {
        setSetupAwaitingConfirmation(false);
        const next = clampVillageCount(parsed.count);
        countRef.current = next;
        setCount(next);
        queueAssistant(
          `${next} players. Explain the game as we play is ${explainGameRef.current ? "on" : "off"}.`,
          "local",
          { instant: true },
        );
        return true;
      }
      case "explain":
        setSetupAwaitingConfirmation(false);
        explainGameRef.current = parsed.enabled;
        setExplainGame(parsed.enabled);
        queueAssistant(
          `Explain the game as we play is ${parsed.enabled ? "on" : "off"}.`,
          "local",
          { instant: true },
        );
        return true;
      case "back":
        setSetupAwaitingConfirmation(false);
        if (stage === "village") {
          setStage("mode");
          queueAssistant("Back at the play mode choice.", "local", { instant: true });
        } else if (stage === "creating") {
          cancelCreation();
          setStage("village");
          queueAssistant("Stopped creating the village. Back at village setup.", "local", {
            instant: true,
          });
        } else {
          leaveToGamePicker();
        }
        return true;
      case "cancel":
        setSetupAwaitingConfirmation(false);
        if (stage === "creating") {
          cancelCreation();
          setStage("village");
          queueAssistant("Stopped creating the village. Back at village setup.", "local", {
            instant: true,
          });
        } else if (stage === "village" || stage === "create-error") {
          setStage("mode");
          queueAssistant("Setup cancelled. Back at the play mode choice.", "local", {
            instant: true,
          });
        } else leaveToGamePicker();
        return true;
      case "defaults":
        countRef.current = 8;
        explainGameRef.current = true;
        setCount(8);
        setExplainGame(true);
        setStage("village");
        setSetupAwaitingConfirmation(true);
        queueAssistant(
          "Defaults selected: eight players, explanations on. Say confirm to start.",
          "local",
          { instant: true },
        );
        return true;
      case "start": {
        const decision = setupStartDecision(command, setupAwaitingConfirmation, parsed.quickTest);
        // The async confirmation path below awaits creation before acknowledging it.
        if (decision === "confirm") return false;
        if (decision === "quick-test") {
          void create(undefined, true);
          return true;
        }
        setStage("village");
        setSetupAwaitingConfirmation(true);
        queueAssistant(
          `Your village has ${countRef.current} players, and explain-as-you-play is ${explainGameRef.current ? "on" : "off"}. Say confirm to start.`,
          "local",
          { instant: true },
        );
        return true;
      }
    }
  }

  function handleAudioVoiceCommand(command: string): boolean {
    if (
      /\b(turn|switch|set|put)\b.*\b(auto(?:matic)?(?:\s+read(?:ing)?)?|auto-read)\b.*\b(off|disable|stop)\b/iu.test(
        command,
      )
    ) {
      if (storyAudio.autoRead) storyAudio.toggleAutoRead();
      appendAssistantCaption("Automatic reading is off. Say ‘turn auto read on’ to restore it.");
      return true;
    }
    if (
      /\b(turn|switch|set|put)\b.*\b(auto(?:matic)?(?:\s+read(?:ing)?)?|auto-read)\b.*\b(on|enable|start)\b/iu.test(
        command,
      )
    ) {
      if (!storyAudio.autoRead) storyAudio.toggleAutoRead();
      queueAssistant("Automatic reading is on.", "local", { instant: true });
      return true;
    }
    if (/\b(mute|silence)\b.*\b(narration|audio|story|guide)\b/iu.test(command)) {
      if (!storyAudio.muted) storyAudio.toggleMuted();
      appendAssistantCaption("Narration is muted. Voice commands remain available.");
      setVoiceStatus("Narration is muted. Voice guide is still listening.");
      return true;
    }
    if (/\b(unmute|sound on)\b.*\b(narration|audio|story|guide)\b/iu.test(command)) {
      if (storyAudio.muted) storyAudio.toggleMuted();
      queueAssistant("Narration is unmuted.", "local", { instant: true });
      return true;
    }
    if (/\b(louder|volume up|increase volume)\b/iu.test(command)) {
      const next = Math.min(1, storyAudio.volume + 0.1);
      storyAudio.updateVolume(next);
      queueAssistant(`Volume is ${Math.round(next * 100)} percent.`, "local", { instant: true });
      return true;
    }
    if (/\b(quieter|volume down|decrease volume)\b/iu.test(command)) {
      const next = Math.max(0, storyAudio.volume - 0.1);
      storyAudio.updateVolume(next);
      queueAssistant(`Volume is ${Math.round(next * 100)} percent.`, "local", { instant: true });
      return true;
    }

    const exactVolume =
      command.match(/\bvolume\b[^\d]{0,12}(\d{1,3})\b/iu) ??
      command.match(/\b(\d{1,3})\b[^\d]{0,8}\bvolume\b/iu);
    if (exactVolume) {
      const next = Math.min(1, Math.max(0, Number(exactVolume[1]) / 100));
      storyAudio.updateVolume(next);
      queueAssistant(`Volume is ${Math.round(next * 100)} percent.`, "local", { instant: true });
      return true;
    }
    const exactRate = command.match(/\b(?:speed|rate)\b[^\d]{0,14}([\d.]+)\b/iu);
    if (exactRate) {
      const rate = Number(exactRate[1]);
      if (!Number.isFinite(rate)) {
        queueAssistant("Choose a speech speed from 0.7 to 1.35.", "local", { instant: true });
        return true;
      }
      storyAudio.updateSpeechRate(rate);
      queueAssistant(
        `Speech speed is ${Math.min(1.35, Math.max(0.7, rate)).toFixed(2)}.`,
        "local",
        {
          instant: true,
        },
      );
      return true;
    }
    if (
      /\b(stop|quiet|silence)\b.*\b(talking|speaking|narration|audio)\b/iu.test(command) ||
      /\blet me speak\b/iu.test(command)
    ) {
      storyAudio.stop();
      setVoiceStatus("Narration stopped. Voice guide is still listening.");
      return true;
    }
    if (/\b(repeat|replay|read|play back)\b.*\b(guide|briefing)\b/iu.test(command)) {
      replayOpeningBriefing();
      return true;
    }
    if (/\b(repeat|say that again|repeat that)\b/iu.test(command)) {
      storyAudio.repeatLast();
      return true;
    }
    if (/\b(slower|slow down)\b/iu.test(command)) {
      storyAudio.updateSpeechRate(storyAudio.speechRate - 0.1);
      queueAssistant("I will speak more slowly.");
      return true;
    }
    if (/\b(faster|speed up)\b/iu.test(command)) {
      storyAudio.updateSpeechRate(storyAudio.speechRate + 0.1);
      queueAssistant("I will speak faster.");
      return true;
    }
    if (/\b(pause|hold)\b.*\b(narration|conversation|audio|talking)\b/iu.test(command)) {
      storyAudio.pause();
      setVoiceStatus("Narration paused. Voice guide is still listening.");
      return true;
    }
    if (/\b(resume|continue)\b.*\b(narration|conversation|audio|talking)\b/iu.test(command)) {
      storyAudio.resume();
      return true;
    }
    return false;
  }

  async function askGuide(text = guideText) {
    const activeSession = sessionRef.current;
    if (!activeSession || !text.trim()) return;
    if (actionInFlightRef.current) {
      queueAssistant("I am finishing your move. Ask me again in a moment.", "local", {
        instant: true,
      });
      return;
    }
    const message = text.trim();
    const requestId = guideRequestIdRef.current + 1;
    guideRequestIdRef.current = requestId;
    guideAbortRef.current?.abort();
    const controller = new AbortController();
    guideAbortRef.current = controller;
    const history = guideMessages.slice(-8).map(({ role, text: historyText }) => ({
      role,
      text: historyText,
    }));
    // A guide question is a deliberate interruption. Drop an older scene so the
    // answer can begin as soon as it arrives instead of waiting behind it.
    storyAudio.stop();
    setGuideMessages((current) => [...current, { role: "user", text: message }]);
    setGuideText("");
    setError("");
    try {
      const response = await fetch(`/api/games/${activeSession.game.id}/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Game-Session": activeSession.token,
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The guide is unavailable.");
      if (requestId !== guideRequestIdRef.current) return;
      setGuideMessages((current) => [
        ...current,
        { role: "assistant", text: data.reply, mode: data.mode },
      ]);
      storyAudio.enqueue({
        id: crypto.randomUUID(),
        speaker: "Guide",
        text: data.reply,
        voiceKey: "assistant",
      });
    } catch (cause) {
      if (requestId !== guideRequestIdRef.current || controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "The guide is unavailable.";
      if (message === "Game not found.") {
        recoverExpiredSession();
        queueAssistant("That village is no longer open. Say ‘start the game’ to begin a new one.");
      } else setError(message);
    } finally {
      if (requestId === guideRequestIdRef.current) {
        guideAbortRef.current = undefined;
      }
    }
  }

  /** Recover cleanly if a local/dev server has restarted and lost its in-memory match. */
  function recoverExpiredSession() {
    voiceCommandLaneRef.current.reset();
    storyAudio.stop();
    cancelCreation();
    villageIntroductionRef.current.skip();
    introductionFeedIdsRef.current = new Set();
    setIntroductionRevision((value) => value + 1);
    latestGameRef.current = undefined;
    presentedGameRef.current = undefined;
    sessionRef.current = undefined;
    setSession(undefined);
    setPresentedGame(undefined);
    setIntroStep(null);
    setVoteOutcome(undefined);
    setSelected([]);
    setHeal(false);
    setOpeningAudio(undefined);
    setGuideMessages([]);
    setGuideText("");
    setError("");
    setStage("mode");
  }

  /** A new move makes an older guide answer stale, so never let it speak late. */
  function cancelPendingGuide() {
    guideRequestIdRef.current += 1;
    guideAbortRef.current?.abort();
    guideAbortRef.current = undefined;
  }

  useEffect(() => {
    currentCommandHandlerRef.current = handleVoiceCommand;
    voiceCommandHandlerRef.current = async (transcript) => {
      const text = transcript.trim();
      if (!text) return;
      setVoiceTranscript(text);
      // A slow open-ended guide answer must not make an immediate game command
      // wait in line. Actions still share their ordered command lane.
      if (isGuideQuestion(text) && !looksLikeGameAction(text, latestGameRef.current)) {
        void handleVoiceCommand(text);
        return;
      }
      await voiceCommandLaneRef.current.enqueue(text, () => currentCommandHandlerRef.current);
    };
  });

  useEffect(() => {
    const prime = () => primeBrowserNarration();
    const commandLane = voiceCommandLaneRef.current;
    window.addEventListener("pointerdown", prime, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      // Leaving while a village is being created must not navigate back into it.
      createControllerRef.current?.abort();
      createControllerRef.current = null;
      guideAbortRef.current?.abort();
      guideAbortRef.current = undefined;
      commandLane.reset();
    };
  }, []);

  countRef.current = count;
  explainGameRef.current = explainGame;
  const voiceConnected = voice.status === "connected" && !voice.needsAudioActivation;
  const voiceBusy =
    (voice.status === "connecting" && !voice.needsAudioActivation) || voice.status === "closing";
  const voiceActive = voiceConnected && !voiceCommandsPaused;
  const orbAction = voiceOrbAction({
    needsAudioActivation: voice.needsAudioActivation,
    connected: voiceConnected,
    busy: voiceBusy,
    microphoneMuted: voice.microphoneMuted,
    commandsPaused: voiceCommandsPaused,
  });
  const narratorSpeaking = Boolean(storyAudio.activeSpeaker || voice.isSpeaking);
  const voiceActivity = narratorSpeaking
    ? "speaking"
    : busy
      ? "thinking"
      : voiceActive && !voice.microphoneMuted
        ? "listening"
        : voice.status;
  const voiceDockStatus = narratorSpeaking
    ? "Companion speaking"
    : busy
      ? "Companion thinking"
      : voice.status === "connecting"
        ? "Connecting voice"
        : voice.status === "closing"
          ? "Ending voice"
          : voiceConnected
            ? voiceCommandsPaused
              ? "Voice commands paused"
              : voice.microphoneMuted
                ? "Microphone muted"
                : "Listening and answering"
            : voice.status === "error"
              ? "Retry voice"
              : "Voice is off";
  const latestGuideReply = [...guideMessages].reverse().find((entry) => entry.role === "assistant");

  function closeCommands() {
    setTyping(false);
    typedToggleRef.current?.focus();
  }

  function toggleVoiceFromOrb() {
    primeBrowserNarration();
    if (voice.needsAudioActivation) {
      void voice.activateAudio();
      return;
    }
    if (voiceConnected) {
      if (orbAction === "unmute") {
        voice.runVoiceControl("unmute_microphone");
        voice.runVoiceControl("resume_commands");
        setVoiceStatus("Microphone is on. Voice guide is listening.");
      } else {
        const message = voice.runVoiceControl(
          voice.commandsPaused ? "resume_commands" : "pause_commands",
        );
        setVoiceStatus(message);
        queueAssistant(message, "local", { instant: true });
      }
      return;
    }
    if (!voiceBusy) {
      setVoiceStatus("Voice guide is listening");
      void voice.start();
    }
  }

  // The same dock, orb, and typed-command panel as Chess (src/components/PlayByVoice/CompanionDock.tsx).
  const voiceDock = (
    <footer
      className={`companion-dock ww-companion-dock${voiceActive ? " voice-connected" : ""} voice-${voiceActivity}`}
      aria-label="Voice companion"
      data-voice-activity={voiceActivity}
    >
      <div className="companion-orb-row">
        <button
          type="button"
          className="orb-button"
          aria-label={
            voiceConnected
              ? orbAction === "unmute"
                ? "Unmute microphone"
                : voiceCommandsPaused
                  ? "Resume voice commands"
                  : "Pause voice commands"
              : voiceBusy || voice.status === "error"
                ? voiceDockStatus
                : "Start voice companion"
          }
          disabled={voiceBusy}
          onClick={toggleVoiceFromOrb}
        >
          <LiquidOrb tone="amber" />
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {voiceDockStatus}
          </span>
        </button>
      </div>
      {voiceConnected && voice.microphoneMuted && (
        <div className="voice-error" role="status">
          <p>Your microphone is muted. Choose the voice orb to unmute it.</p>
        </div>
      )}
      {voice.error && (
        <div className="voice-error" role="alert">
          <p>{voice.error}</p>
          {voice.needsAudioActivation ? (
            <button type="button" onClick={() => void voice.activateAudio()}>
              Start voice
            </button>
          ) : voice.status === "error" ? (
            <button type="button" onClick={() => void voice.start()}>
              Retry voice
            </button>
          ) : null}
        </div>
      )}
      {narrationError && (
        <div className="voice-error" role="alert">
          <p>{narrationError}</p>
          <button type="button" onClick={recoverNarration}>
            Start narration
          </button>
        </div>
      )}
      {commandPanel.mounted && (
        <form
          id="command-panel"
          className={`command-panel${commandPanel.closing ? " is-closing" : ""}`}
          inert={commandPanel.closing || undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeCommands();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const typedCommand = commandText.trim();
            if (!typedCommand) return;
            setCommandText("");
            void handleVoiceCommand(typedCommand);
          }}
        >
          <div className="command-panel-heading">
            <label htmlFor="typed-command">Type to your companion</label>
            <button
              type="button"
              className="text-icon"
              aria-label="Close typed commands"
              onClick={closeCommands}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="command-input-row">
            <input
              id="typed-command"
              ref={commandInputRef}
              autoFocus
              value={commandText}
              onChange={(event) => setCommandText(event.target.value)}
              placeholder={
                !session
                  ? "Try start the game, or help"
                  : session.game.phase === "night" && session.game.me.role === "seer"
                    ? "Try investigate Emma, or help"
                    : "Try hear the villagers, or help"
              }
              autoComplete="off"
              maxLength={1000}
            />
            <button
              className="send-command"
              type="submit"
              disabled={busy || !commandText.trim()}
              aria-label="Send command"
            >
              <ArrowUp size={20} aria-hidden="true" />
            </button>
          </div>
          {latestGuideReply && (
            <p className="ww-command-reply" aria-live="polite">
              {latestGuideReply.text}
            </p>
          )}
          <p>No microphone needed. Type any voice command, or a question for your guide.</p>
        </form>
      )}
    </footer>
  );

  const viewGame = presentedGame ?? session?.game;
  const transitioning = Boolean(session && storyAudio.phaseTransitioning);
  const introView: IntroStep | null = viewGame
    ? viewGame.phase === "prologue"
      ? (introStep ?? "village")
      : introStep
    : null;
  const pendingFinding =
    viewGame && !introView && viewGame.me.investigations.length > seenInvestigations
      ? viewGame.me.investigations.at(-1)
      : undefined;
  // Once eliminated, no game choice belongs to this player. Leave time for
  // narration and acknowledgements, then let the NPC-only round proceed.
  useEffect(() => {
    if (
      !session ||
      session.game.me.alive ||
      session.game.me.hunterActionPending ||
      session.game.phase === "over" ||
      session.game.paused ||
      introView ||
      voteOutcome ||
      pendingFinding ||
      storyAudio.activeSpeaker ||
      storyAudio.paused ||
      narrationError ||
      busy
    )
      return;
    const timer = window.setTimeout(() => void act("continue"), 1_500);
    return () => window.clearTimeout(timer);
  }, [
    session,
    introView,
    voteOutcome,
    pendingFinding,
    storyAudio.activeSpeaker,
    storyAudio.paused,
    narrationError,
    busy,
  ]);
  const screenKey = !viewGame
    ? stage
    : [
        viewGame.id,
        introView === "role-details" ? "role" : (introView ?? ""),
        voteOutcome ? `vote-${voteOutcome.result.day}-${voteOutcome.revealing}` : "",
        pendingFinding ? `finding-${seenInvestigations}` : "",
        viewGame.phase,
        viewGame.day,
        viewGame.paused ? "paused" : "",
      ].join(":");

  // Move focus to the new screen heading, as the Play by Voice screens do.
  useEffect(() => {
    document.getElementById("ww-heading")?.focus({ preventScroll: true });
  }, [screenKey]);

  // The role card flips between two faces; ignore clicks until a flip has finished.
  const flipLockRef = useRef(false);
  const flipFocusRef = useRef<string | null>(null);
  function flipRoleCard(next: "role" | "role-details") {
    if (flipLockRef.current || introStep === next) return;
    flipLockRef.current = true;
    flipFocusRef.current = next === "role" ? "ww-role-card-title" : "ww-role-back-title";
    setIntroStep(next);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(
      () => {
        flipLockRef.current = false;
      },
      reduceMotion ? 0 : 720,
    );
  }
  useEffect(() => {
    const target = flipFocusRef.current;
    if (!target) return;
    flipFocusRef.current = null;
    document.getElementById(target)?.focus({ preventScroll: true });
  }, [introStep]);

  // A role card shown after skipping the prologue closes once the story moves on.
  const startPhaseRef = useRef<GameView["phase"] | undefined>(undefined);
  const latestPhase = session?.game.phase;
  useEffect(() => {
    if (!latestPhase) {
      startPhaseRef.current = undefined;
      return;
    }
    if (startPhaseRef.current === undefined) startPhaseRef.current = latestPhase;
    else if (startPhaseRef.current !== latestPhase) {
      startPhaseRef.current = latestPhase;
      setIntroStep(null);
    }
  }, [latestPhase]);

  function openTools(section: "audio" | "help") {
    setTyping(false);
    setDialog(section);
  }

  // Leaving no longer asks for confirmation, matching origin/main (#15).
  function requestHome() {
    leaveToGamePicker();
  }

  const loadingStage =
    !session &&
    (stage === "preparing" ||
      stage === "creating" ||
      stage === "prepare-error" ||
      stage === "create-error");
  const scene = !viewGame
    ? loadingStage
      ? "loading"
      : "plain"
    : introView
      ? "plain"
      : voteOutcome
        ? "day"
        : pendingFinding
          ? "night"
          : viewGame.phase === "over"
            ? viewGame.winner === "village"
              ? "victory"
              : "night"
            : viewGame.phase === "night" || viewGame.phase === "cupid"
              ? "night"
              : viewGame.phase === "prologue"
                ? "plain"
                : "day";
  const onArtwork = scene !== "plain";

  const header = (
    <header className={`ww-header${onArtwork ? " is-on-art" : ""}`}>
      <div className="ww-brand-group">
        <button className="ww-brand" type="button" onClick={requestHome}>
          Playora
          <span className="sr-only">, return to the game picker</span>
        </button>
        <img
          src={`${ART}/separator-${onArtwork ? "light" : "dark"}.svg`}
          width={8}
          height={8}
          alt=""
        />
        <span className="ww-header-game">Loups-Garous</span>
      </div>
      <nav className="ww-header-nav" aria-label="Main navigation">
        <button type="button" onClick={() => openTools("audio")}>
          Audio Settings
        </button>
        <button type="button" onClick={() => openTools("help")}>
          Help
        </button>
      </nav>
    </header>
  );

  const backAction = (() => {
    if (!session) {
      if (stage === "mode") return { label: "Back to game picker", run: leaveToGamePicker };
      if (stage === "village") return { label: "Back to play mode", run: () => setStage("mode") };
      return undefined;
    }
    if (introView === "role-details")
      return { label: "Back to role", run: () => flipRoleCard("role") };
    if (introView === "role" && viewGame?.phase === "prologue")
      return { label: "Back to meet the village", run: () => setIntroStep("village") };
    return undefined;
  })();
  const rail = (
    <nav className="ww-rail" aria-label="Game navigation">
      <button className="ww-round-control" type="button" onClick={requestHome}>
        <img src={`${ART}/home.svg`} width={24} height={24} alt="" />
        <span className="sr-only">Return to game picker</span>
      </button>
      {backAction && (
        <button className="ww-round-control" type="button" onClick={backAction.run}>
          <ArrowLeft size={24} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">{backAction.label}</span>
        </button>
      )}
      <button
        type="button"
        className={`dock-icon typed-toggle${typing ? " is-active" : ""}`}
        ref={typedToggleRef}
        onClick={() => {
          if (typing) closeCommands();
          else setTyping(true);
        }}
        aria-label={typing ? "Close typed commands" : "Type a command"}
        aria-expanded={typing}
        aria-controls="command-panel"
      >
        <Keyboard size={20} aria-hidden="true" />
      </button>
    </nav>
  );

  const audioSection = (
    <section className="audio-controls" aria-labelledby="ww-audio-heading">
      <div>
        <h3 id="ww-audio-heading">Story audio</h3>
        <p>
          {storyAudio.activeSpeaker
            ? `AI voice is reading ${storyAudio.activeSpeaker}`
            : storyAudio.autoRead
              ? "AI voice ready for narration and dialogue"
              : "Automatic reading is off"}
        </p>
      </div>
      {session && (
        <div className="audio-buttons">
          <button className="plain-button" type="button" onClick={recoverNarration}>
            Start narration
          </button>
          {roleRevealVisible && (
            <button
              className="plain-button"
              type="button"
              onClick={() => {
                setDialog(null);
                void continueAfterRole(true);
              }}
            >
              Skip role explanation
            </button>
          )}
          <button className="plain-button" type="button" onClick={storyAudio.toggleAutoRead}>
            {storyAudio.autoRead ? "Auto-read on" : "Auto-read off"}
          </button>
          <button className="plain-button" type="button" onClick={storyAudio.toggleMuted}>
            {storyAudio.muted ? "Unmute" : "Mute"}
          </button>
          <button
            className="plain-button"
            type="button"
            onClick={storyAudio.paused ? storyAudio.resume : storyAudio.pause}
            disabled={!storyAudio.autoRead || storyAudio.muted || !storyAudio.activeSpeaker}
          >
            {storyAudio.paused ? "Resume" : "Pause"}
          </button>
          <button
            className="plain-button"
            type="button"
            onClick={() => {
              if (roleRevealVisible) {
                repeatRoleExplanation();
                return;
              }
              if (
                session.game.phase !== "prologue" ||
                introStep !== "village" ||
                !repeatVillageIntroduction()
              )
                storyAudio.repeatLast();
            }}
          >
            Repeat
          </button>
          {villageIntroductionActive && (
            <>
              <button className="plain-button" type="button" onClick={nextVillageCharacter}>
                Next character
              </button>
              <button className="plain-button" type="button" onClick={skipVillageIntroductions}>
                Skip introductions
              </button>
            </>
          )}
          <button className="plain-button" type="button" onClick={storyAudio.stop}>
            Stop
          </button>
        </div>
      )}
      <label className="volume-control">
        Volume
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={storyAudio.volume}
          onChange={(event) => storyAudio.updateVolume(Number(event.target.value))}
        />
      </label>
      <label className="volume-control">
        Speech speed
        <input
          type="range"
          min="0.7"
          max="1.35"
          step="0.05"
          value={storyAudio.speechRate}
          onChange={(event) => storyAudio.updateSpeechRate(Number(event.target.value))}
        />
      </label>
    </section>
  );

  const helpBasics = (
    <>
      <p>
        You receive one secret role. Every other villager is played by the computer. At night, roles
        with powers act in secret. By day, the village discusses and votes to remove one player. The
        village wins by removing every Werewolf; the Werewolves win when they equal or outnumber
        everyone else.
      </p>
      <p>
        Voice:{" "}
        {voiceConnected
          ? voiceStatus
          : voiceBusy
            ? voiceDockStatus
            : (voice.error ?? "Voice is off. Press the orb to connect.")}
        {voiceTranscript ? ` You said: “${voiceTranscript}”.` : ""}
      </p>
      <p>
        {session
          ? "Say or type “choose Emma”, “continue”, “describe the interface”, “read my role”, “read all messages”, “ask the villagers what they think”, “vote for Emma”, or “voice help”."
          : "Say or type “start the game”, “start with the defaults”, or “start a quick test”."}
      </p>
      <p>
        Audio: “repeat that”, “stop speaking”, “pause narration”, “speak slower”, “volume up”, “turn
        auto read on”. Game: “pause game”, “resume game”, “pause voice control”.
      </p>
    </>
  );
  const dialogs = (
    <>
      {dialog === "audio" && (
        <GameDialog title="Audio settings" onClose={() => setDialog(null)}>
          {audioSection}
        </GameDialog>
      )}
      {dialog === "help" && (
        <GameDialog title="Help" onClose={() => setDialog(null)}>
          <div className="ww-help">
            {session && (
              <>
                <p>
                  <strong>Your role: {roleNames[session.game.me.role]}.</strong>{" "}
                  {session.game.me.investigations
                    .map(
                      (finding) =>
                        `${finding.name} is ${finding.result === "wolf" ? "a Werewolf" : "clear"}.`,
                    )
                    .join(" ")}
                </p>
                <p>{currentActionHelp(session.game)}</p>
                <p>{roleExplanation(session.game)}</p>
                <p>{nextRoleAction(session.game)}</p>
                <button type="button" className="plain-button" onClick={repeatRoleExplanation}>
                  Repeat my role
                </button>
                {roleRevealVisible && (
                  <button
                    type="button"
                    className="plain-button"
                    onClick={() => {
                      setDialog(null);
                      void continueAfterRole(true);
                    }}
                  >
                    Skip role explanation
                  </button>
                )}
              </>
            )}
            {helpBasics}
            {session && (
              <>
                <h3>Recent updates</h3>
                <ul className="ww-history">
                  {session.game.feed.slice(-6).map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.kind === "private" ? "Private guide" : entry.speaker}:</strong>{" "}
                      {entry.text}
                    </li>
                  ))}
                </ul>
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="btn btn-cancel"
                    disabled={!openingAudio}
                    onClick={replayOpeningBriefing}
                  >
                    Replay briefing
                  </button>
                  <button
                    type="button"
                    className="btn btn-cancel"
                    onClick={() => {
                      setDialog(null);
                      openNewGameSetup();
                    }}
                  >
                    New game
                  </button>
                </div>
              </>
            )}
          </div>
        </GameDialog>
      )}
    </>
  );

  if (!session || !viewGame) {
    if (loadingStage) {
      const failed = stage === "prepare-error" || stage === "create-error";
      return (
        <main className="pbv-root ww-app ww-scene-loading">
          <div className="ww-loading-art" aria-hidden="true" />
          {header}
          <section className="ww-loading" aria-labelledby="ww-heading">
            {failed ? (
              <div className="ww-loading-error" role="alert">
                <h1 id="ww-heading" tabIndex={-1}>
                  {stage === "prepare-error"
                    ? "Loups-Garous could not load"
                    : "The village could not be created"}
                </h1>
                <p>{error || "Something went wrong. Please try again."}</p>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      stage === "prepare-error"
                        ? retryPreparation()
                        : void create(undefined, lastCreateTestModeRef.current)
                    }
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      stage === "prepare-error" ? leaveToGamePicker() : setStage("village")
                    }
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="ww-loading-center" role="status" aria-live="polite">
                <span className="ww-loading-visual" aria-hidden="true">
                  <img
                    className="ww-loading-shape"
                    src={`${ART}/pentagon.svg`}
                    width={190}
                    height={181}
                    alt=""
                  />
                </span>
                <h1 id="ww-heading" tabIndex={-1}>
                  Loading
                </h1>
                <span className="sr-only">
                  {stage === "creating"
                    ? "Creating your village and assigning secret roles."
                    : "Preparing Loups-Garous."}
                </span>
              </div>
            )}
            {!failed && (
              <button className="ww-loading-back" type="button" onClick={leaveToGamePicker}>
                Go back to main
              </button>
            )}
          </section>
        </main>
      );
    }

    const roleTotals = Object.entries(DEFAULT_ROLE_COUNTS[count] ?? {}).filter(
      ([, total]) => total > 0,
    ) as Array<[Role, number]>;
    return (
      <main className="pbv-root ww-app ww-scene-plain">
        {header}
        {rail}
        <section className="ww-stage ww-setup" aria-labelledby="ww-setup-title">
          <div className="ww-stage-intro">
            <h1 id="ww-setup-title">Set up your game</h1>
            <p>Choose your preferences, or say ‘Start with the defaults.’</p>
          </div>
          {stage === "mode" ? (
            <>
              <div className="ww-panel ww-mode-panel">
                <h2 id="ww-heading" tabIndex={-1}>
                  Who do you want to play?
                </h2>
                <div className="ww-mode-options">
                  <button
                    className="ww-mode-option is-selected"
                    type="button"
                    aria-pressed="true"
                    onClick={() => setStage("village")}
                  >
                    <img src={`${ART}/player.svg`} width={24} height={24} alt="" />
                    <span>Solo</span>
                  </button>
                  <button className="ww-mode-option" type="button" disabled>
                    <span>With Friends</span>
                    <span>Coming soon..</span>
                  </button>
                </div>
              </div>
              <button
                className="ww-text-button"
                type="button"
                disabled={busy}
                onClick={() => void create(undefined, true)}
              >
                Try a quick test · 4 players, you are the Seer
              </button>
            </>
          ) : (
            <form
              className="ww-village-setup"
              onSubmit={(event) => {
                event.preventDefault();
                if (setupAwaitingConfirmation) void create();
                else setSetupAwaitingConfirmation(true);
              }}
            >
              <div className="ww-village-config">
                <div className="ww-panel ww-count-panel">
                  <h2 id="ww-heading" tabIndex={-1}>
                    Set up your village
                  </h2>
                  <div className="ww-count-setting">
                    <div className="ww-stepper" role="group" aria-labelledby="ww-count-label">
                      <button
                        className="ww-step-button is-decrease"
                        type="button"
                        disabled={count <= MIN_VILLAGE}
                        onClick={() => setCount((value) => Math.max(MIN_VILLAGE, value - 1))}
                      >
                        <img src={`${ART}/minus.svg`} width={24} height={24} alt="" />
                        <span className="sr-only">Fewer players</span>
                      </button>
                      <output className="ww-count-value" aria-live="polite">
                        {count}
                        <span className="sr-only"> players</span>
                      </output>
                      <button
                        className="ww-step-button is-increase"
                        type="button"
                        disabled={count >= MAX_VILLAGE}
                        onClick={() => setCount((value) => Math.min(MAX_VILLAGE, value + 1))}
                      >
                        <img src={`${ART}/plus.svg`} width={24} height={24} alt="" />
                        <span className="sr-only">More players</span>
                      </button>
                    </div>
                    <p className="ww-count-label" id="ww-count-label">
                      Players
                    </p>
                  </div>
                </div>
                <div className="ww-panel ww-roles-panel">
                  <h3>Roles</h3>
                  <ul>
                    {roleTotals.map(([role, total]) => (
                      <li key={role}>
                        <span className="ww-role-total">{total}</span>
                        <span className="ww-role-times">x</span>
                        <span className="ww-role-total">{roleNames[role]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="ww-village-footer">
                <label className="ww-panel ww-guidance">
                  <input
                    type="checkbox"
                    checked={explainGame}
                    onChange={(event) => setExplainGame(event.target.checked)}
                  />
                  <span className="ww-check-box" aria-hidden="true">
                    <img src={`${ART}/guidance-check.svg`} width={12} height={12} alt="" />
                  </span>
                  Explain the game as we play
                </label>
                <button className="ww-start-button" type="submit" disabled={busy}>
                  <span>{setupAwaitingConfirmation ? "Confirm and start" : "Start game"}</span>
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="ww-error" role="alert">
              {error}
            </p>
          )}
        </section>
        {voiceDock}
        {dialogs}
      </main>
    );
  }

  const game = viewGame;
  const me = game.me;
  const interactionLocked = busy;
  const alive = game.players.filter((player) => player.alive);
  const others = alive.filter((player) => player.id !== me.id);
  const toggleTarget = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const roleHint =
    me.role === "werewolf"
      ? `Your pack: ${me.werewolfTeam?.join(", ") || "you are the lone wolf"}.`
      : me.role === "seer"
        ? "Choose a villager to investigate each night."
        : me.role === "witch"
          ? `Healing potion ${me.witchHealAvailable ? "ready" : "used"}; poison ${me.witchPoisonAvailable ? "ready" : "used"}.${me.wolfVictim ? ` The pack targeted ${me.wolfVictim}.` : ""}`
          : me.role === "cupid"
            ? "Choose two players to bind as lovers."
            : me.role === "hunter"
              ? "If eliminated, you get one final shot."
              : "Help the village find the Werewolves.";
  const hasDiscussion = game.feed.some(
    (entry) => entry.kind === "speech" && entry.day === game.day,
  );
  const latestEvent = [...game.feed].reverse().find((entry) => entry.kind === "event");
  const latestUpdate = latestEvent ?? game.feed.at(-1);
  const updateIsLoss =
    latestUpdate?.kind === "event" &&
    /\b(eliminat\w*|exiled?|died|dies|killed|found dead|shot|did not survive)\b/iu.test(
      latestUpdate.text,
    );
  const card = roleCards[me.role];
  const colorFor = (player: PublicPlayerView) => {
    if (player.id === me.id) return MY_COLOR;
    const index = game.players.filter((item) => item.id !== me.id).indexOf(player);
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  };
  const roleSymbol = (role: Role, size = 40) =>
    role === "seer" ? (
      <img src={`${ART}/seer-symbol.svg`} width={size} height={size} alt="" />
    ) : role === "werewolf" ? (
      <img src={`${ART}/werewolf.png`} width={size} height={size} alt="" />
    ) : (
      <span
        className="ww-role-shape"
        style={{ background: roleCards[role].color, width: size, height: size }}
      />
    );

  const voteLabel = (count: number) => `${count} ${count === 1 ? "vote" : "votes"}`;
  const playerCards = (
    selectable: (player: PublicPlayerView) => boolean = () => false,
    multiple = false,
    options: {
      isSelected?: (player: PublicPlayerView) => boolean;
      onChoose?: (player: PublicPlayerView) => void;
      detail?: (player: PublicPlayerView) => ReactNode;
    } = {},
  ) => (
    <ul className="ww-players" aria-label="Players">
      {game.players.map((player) => {
        const isMe = player.id === me.id;
        const isSelected = options.isSelected
          ? options.isSelected(player)
          : selected.includes(player.id);
        const votes =
          game.phase === "vote" && player.alive ? game.voteTally?.[player.id] : undefined;
        const speaking = storyAudio.activeSpeaker === player.name;
        const content = (
          <>
            <span className="ww-player-name">{isMe ? "You" : player.name}</span>
            <span className="ww-dot" style={{ background: colorFor(player) }} aria-hidden="true" />
            {/* Roles are public only after the game ends. */}
            {/* The server reveals a role only once a player is eliminated or the game ends. */}
            {player.revealedRole && (
              <span className="ww-player-detail">{roleNames[player.revealedRole]}</span>
            )}
            {!player.alive && <span className="ww-player-detail">Eliminated</span>}
            {options.detail?.(player)}
            {votes !== undefined && <span className="ww-player-votes">{voteLabel(votes)}</span>}
            {speaking && <span className="sr-only">, speaking</span>}
          </>
        );
        const className = `ww-player${player.alive ? "" : " is-dead"}${speaking ? " is-speaking" : ""}${isSelected ? " is-selected" : ""}`;
        return (
          <li key={player.id}>
            {selectable(player) ? (
              <button
                type="button"
                className={className}
                aria-pressed={isSelected}
                disabled={interactionLocked}
                onClick={() =>
                  options.onChoose
                    ? options.onChoose(player)
                    : multiple
                      ? toggleTarget(player.id)
                      : setSelected([player.id])
                }
              >
                {content}
              </button>
            ) : (
              <div className={className}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const updateLine = (
    <p
      className={`ww-update${updateIsLoss ? " is-loss" : ""}${latestUpdate ? "" : " is-empty"}`}
      role="status"
      aria-live="polite"
    >
      {latestUpdate && (
        <>
          <span className="sr-only">
            {latestUpdate.kind === "private" ? "Private update: " : "Village update: "}
          </span>
          {latestUpdate.text}
        </>
      )}
    </p>
  );

  let stageContent: ReactNode;
  if (introView === "village") {
    stageContent = (
      <>
        <div className="ww-stage-intro">
          <h1 id="ww-heading" tabIndex={-1}>
            Meet the Village
          </h1>
          <p>
            These are the people
            <br />
            you’ll be playing with tonight.
          </p>
        </div>
        {playerCards()}
        <div className="ww-intro-notes">
          <p className="ww-note">
            Some of them are villagers.
            <br />
            Some may be werewolves.
          </p>
          <p className="ww-note is-dark">Their roles are hidden.</p>
          <button
            className="ww-pill is-primary"
            type="button"
            disabled={villageIntroductionActive}
            onClick={() => setIntroStep("role")}
          >
            Continue
          </button>
          {villageIntroductionActive && (
            <button className="ww-pill" type="button" onClick={skipVillageIntroductions}>
              Skip introductions
            </button>
          )}
        </div>
      </>
    );
  } else if (introView === "role" || introView === "role-details") {
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-section-title" tabIndex={-1}>
          Your Role
        </h1>
        <div
          className={`ww-role-flip${introView === "role-details" ? " is-flipped" : ""}`}
          style={{ "--role-color": card.color } as CSSProperties}
        >
          <div className="ww-role-inner">
            <article
              className="ww-role-card ww-role-face is-front"
              aria-labelledby="ww-role-card-title"
              aria-hidden={introView === "role-details" || undefined}
              inert={introView === "role-details" || undefined}
            >
              <span className="ww-role-glow" aria-hidden="true" />
              <div className="ww-role-front">
                <div className="ww-role-identity">
                  {roleSymbol(me.role)}
                  <h2 id="ww-role-card-title" tabIndex={-1}>
                    The {roleNames[me.role]}
                  </h2>
                </div>
                <p>{card.summary}</p>
              </div>
              <button
                className="ww-pill is-dark"
                type="button"
                onClick={() => flipRoleCard("role-details")}
              >
                Read about role
              </button>
            </article>
            <article
              className="ww-role-card ww-role-face is-back"
              aria-labelledby="ww-role-back-title"
              aria-hidden={introView !== "role-details" || undefined}
              inert={introView !== "role-details" || undefined}
            >
              <span className="ww-role-glow" aria-hidden="true" />
              <div className="ww-role-back">
                <h2 id="ww-role-back-title" tabIndex={-1}>
                  How your role works
                </h2>
                <ul>
                  {card.howItWorks.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  {me.role === "werewolf" && <li>{roleHint}</li>}
                </ul>
                <h3>Your Goal</h3>
                <p>{card.goal}</p>
              </div>
              <button
                className="ww-pill is-dark"
                type="button"
                onClick={() => flipRoleCard("role")}
              >
                Turn back
              </button>
            </article>
          </div>
        </div>
        {introView === "role-details" && (
          <button
            className="ww-pill is-primary"
            type="button"
            disabled={interactionLocked || !roleRevealRef.current.canContinue()}
            onClick={() => void continueAfterRole()}
          >
            I’m ready
          </button>
        )}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {roleRevealRef.current.status === "completed"
            ? "Role explanation finished. Say I am ready when you want to continue."
            : roleRevealRef.current.status === "speaking"
              ? "Reading your private role explanation. The village will wait."
              : roleRevealRef.current.status === "interrupted" ||
                  roleRevealRef.current.status === "failed"
                ? "Role explanation did not finish. Choose Repeat my role or explicitly skip."
                : voice.needsAudioActivation
                  ? "Voice audio needs your permission. Choose Start voice or Start narration."
                  : storyAudio.muted || storyAudio.volume === 0 || !storyAudio.autoRead
                    ? "Role narration is muted or automatic reading is off. Choose Start narration to hear your role."
                    : "Preparing your private role explanation. The village will wait."}
        </p>
      </>
    );
  } else if (voteOutcome && !voteOutcome.revealing) {
    const { result } = voteOutcome;
    const exiled = game.players.find((player) => player.id === result.exiledPlayerId);
    const received = (player: PublicPlayerView) =>
      result.tally.find((entry) => entry.target === player.id)?.votes ?? 0;
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          The village has voted
        </h1>
        {playerCards(() => false, false, {
          detail: (player) =>
            player.alive || player.id === exiled?.id ? (
              <span className="ww-player-votes">{voteLabel(received(player))}</span>
            ) : null,
        })}
        <p className="ww-update is-loss" role="status">
          {exiled
            ? `${exiled.id === me.id ? "You have" : `${exiled.name} has`} been eliminated.`
            : "The vote was tied. No one leaves the village."}
        </p>
        <button
          className="ww-pill is-primary"
          type="button"
          onClick={() =>
            exiled ? setVoteOutcome({ result, revealing: true }) : setVoteOutcome(undefined)
          }
        >
          Continue
        </button>
      </>
    );
  } else if (voteOutcome?.revealing) {
    const exiled = game.players.find((player) => player.id === voteOutcome.result.exiledPlayerId);
    const role = exiled?.revealedRole;
    stageContent = (
      <article className="ww-result-card" aria-labelledby="ww-heading">
        <h1 id="ww-heading" tabIndex={-1}>
          {exiled?.id === me.id ? "You were....." : `${exiled?.name ?? "They"} was.....`}
        </h1>
        {role && roleSymbol(role, 48)}
        <h2>
          {role
            ? `${/^[aeiou]/iu.test(roleNames[role]) ? "An" : "A"} ${roleNames[role].toLowerCase()}`
            : "Unknown"}
        </h2>
        <button className="ww-pill is-dark" type="button" onClick={() => setVoteOutcome(undefined)}>
          Continue
        </button>
      </article>
    );
  } else if (pendingFinding) {
    const findingPlayer = game.players.find((player) => player.name === pendingFinding.name);
    stageContent = (
      <article className="ww-result-card" aria-labelledby="ww-heading">
        <h1 id="ww-heading" tabIndex={-1}>
          {pendingFinding.name}
        </h1>
        {findingPlayer && (
          <span
            className="ww-dot"
            style={{ background: colorFor(findingPlayer) }}
            aria-hidden="true"
          />
        )}
        <h2>{pendingFinding.result === "wolf" ? "A Werewolf" : "Not a Werewolf"}</h2>
        <p>
          Remember this information.
          <br />
          The other players don’t know
          <br />
          what you’ve discovered.
        </p>
        <button
          className="ww-pill is-dark"
          type="button"
          onClick={() => setSeenInvestigations(me.investigations.length)}
        >
          Continue
        </button>
      </article>
    );
  } else if (transitioning) {
    const phase = session.game.phase;
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          {phase === "night"
            ? "The village falls asleep."
            : phase === "day"
              ? "The village wakes up."
              : phase === "vote"
                ? "Time to vote"
                : phase === "over"
                  ? "The story ends."
                  : "The story continues."}
        </h1>
        {updateLine}
        <button className="ww-pill is-dark" type="button" onClick={storyAudio.stop}>
          Skip narration
        </button>
      </>
    );
  } else if (game.paused) {
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          The game is paused.
        </h1>
        <p className="ww-stage-copy">
          The village will not progress until you say “resume game” or use this button.
        </p>
        <button
          className="ww-pill is-primary"
          type="button"
          disabled={interactionLocked}
          onClick={() => void act("resume")}
        >
          Resume game
        </button>
      </>
    );
  } else if (game.phase === "over") {
    const title =
      game.winner === "village"
        ? "The village wins"
        : game.winner === "lovers"
          ? "Love survives"
          : "The werewolves win";
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          {title}
        </h1>
        {latestEvent && <p className="ww-outcome">{latestEvent.text}</p>}
        <div className="ww-final-role">
          <p>{me.alive ? "You survived as" : "You played as"}</p>
          <p className="ww-final-role-name">THE {roleNames[me.role].toUpperCase()}</p>
        </div>
        <div className="ww-actions">
          <button className="ww-pill is-dark" type="button" onClick={leaveToGamePicker}>
            Home
          </button>
          <button className="ww-pill is-primary" type="button" onClick={openNewGameSetup}>
            Play again
          </button>
        </div>
      </>
    );
  } else if (!me.alive && !me.hunterActionPending) {
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          You are out
        </h1>
        <p className="ww-stage-copy">The village will finish the game.</p>
        {updateLine}
        {playerCards()}
        <button
          className="ww-pill is-primary"
          type="button"
          disabled={interactionLocked}
          onClick={() => void act("continue")}
        >
          Continue watching
        </button>
      </>
    );
  } else if (game.phase === "night") {
    const actsAtNight = me.role === "werewolf" || me.role === "seer" || me.role === "witch";
    // The Witch's own card is included: selecting tonight's victim, including "You", uses the heal.
    const victim =
      me.role === "witch" && me.witchHealAvailable && me.wolfVictim
        ? game.players.find((player) => player.alive && player.name === me.wolfVictim)
        : undefined;
    const poisonTarget =
      me.role === "witch" ? game.players.find((p) => p.id === selected[0]) : undefined;
    const victimLabel = victim ? (victim.id === me.id ? "yourself" : victim.name) : "";
    const candidate = (player: PublicPlayerView) =>
      me.role === "witch"
        ? player.id === victim?.id ||
          (me.witchPoisonAvailable &&
            player.alive &&
            player.id !== me.id &&
            player.name !== me.wolfVictim)
        : player.alive &&
          player.id !== me.id &&
          ((me.role === "seer" && isEligibleSeerTarget(player, me.id, me.investigations)) ||
            (me.role === "werewolf" && !me.werewolfTeam?.includes(player.name)));
    const witchCards = {
      isSelected: (player: PublicPlayerView) =>
        player.id === victim?.id ? heal : selected.includes(player.id),
      onChoose: (player: PublicPlayerView) => {
        if (player.id === victim?.id) setHeal((value) => !value);
        else setSelected((current) => (current[0] === player.id ? [] : [player.id]));
      },
      detail: (player: PublicPlayerView) =>
        player.id === victim?.id ? (
          <span className="ww-player-detail">
            Targeted tonight
            <span className="sr-only">. Select to save {victimLabel}.</span>
          </span>
        ) : candidate(player) ? (
          <span className="sr-only">. Select to poison.</span>
        ) : null,
    };
    stageContent = actsAtNight ? (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          Your Turn
        </h1>
        <h2 className="ww-question">
          {me.role === "seer"
            ? "Who do you want to investigate?"
            : me.role === "werewolf"
              ? "Who does your pack choose tonight?"
              : victim && me.witchPoisonAvailable
                ? "Save their target, poison someone, or let the night pass."
                : victim
                  ? "Save their target, or let the night pass."
                  : me.witchPoisonAvailable
                    ? "Use your poison, or let the night pass."
                    : "Let the night pass."}
        </h2>
        {updateLine}
        {me.role === "witch" ? playerCards(candidate, false, witchCards) : playerCards(candidate)}
        <div className="ww-actions">
          {me.role === "werewolf" && (
            <button
              className="ww-pill is-dark"
              type="button"
              disabled={interactionLocked}
              onClick={() => void act("night")}
            >
              Let the pack decide
            </button>
          )}
          <button
            className="ww-pill is-primary"
            type="button"
            disabled={
              interactionLocked ||
              ((me.role === "werewolf" || me.role === "seer") && selected.length !== 1)
            }
            onClick={() =>
              void act(
                "night",
                me.role === "witch"
                  ? {
                      ...(poisonTarget ? { poison: poisonTarget.id } : {}),
                      ...(heal && victim ? { save: victim.id } : {}),
                    }
                  : selected[0]
                    ? { target: selected[0] }
                    : {},
              )
            }
          >
            {me.role === "seer"
              ? "Investigate"
              : me.role === "werewolf"
                ? "Choose target"
                : heal && victim && poisonTarget
                  ? "Use both potions"
                  : heal && victim
                    ? `Save ${victimLabel}`
                    : poisonTarget
                      ? `Poison ${poisonTarget.name}`
                      : "Let the night pass"}
          </button>
        </div>
      </>
    ) : (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          The village falls asleep.
        </h1>
        <p className="ww-stage-copy">Rest until morning.</p>
        {updateLine}
        <button
          className="ww-pill is-primary"
          type="button"
          disabled={interactionLocked}
          onClick={() => void act("night")}
        >
          Wait for dawn
        </button>
      </>
    );
  } else if (game.phase === "cupid") {
    stageContent =
      me.role === "cupid" ? (
        <>
          <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
            Your Turn
          </h1>
          <h2 className="ww-question">Choose two lovers.</h2>
          {playerCards((player) => player.alive && player.id !== me.id, true)}
          <button
            className="ww-pill is-primary"
            type="button"
            disabled={interactionLocked || selected.length !== 2}
            onClick={() => void act("lovers", { first: selected[0], second: selected[1] })}
          >
            Bind their hearts
          </button>
        </>
      ) : (
        <>
          <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
            Cupid is choosing.
          </h1>
          {updateLine}
        </>
      );
  } else if (game.phase === "day") {
    const examples = others.slice(0, 3).map((player) => player.name);
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          {hasDiscussion ? "Discussion" : "The village wakes up."}
        </h1>
        {updateLine}
        {playerCards()}
        <p className="ww-stage-copy">Ask, accuse or listen.</p>
        {examples.length > 0 && (
          <div className="ww-examples">
            <p>Examples:</p>
            <p>“{examples[0]}, who do you suspect?”</p>
            {examples[1] && <p>“Ask {examples[1]} where they were.”</p>}
            {examples[2] && <p>“I think {examples[2]} is suspicious.”</p>}
          </div>
        )}
        <form
          className="ww-speak"
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim()) void act("speak", { message });
          }}
        >
          <label htmlFor="ww-message">Speak to the village</label>
          <textarea
            id="ww-message"
            value={message}
            maxLength={400}
            placeholder="Share a thought publicly — villagers will respond…"
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="ww-actions">
            <button
              className="ww-pill is-dark"
              type="submit"
              disabled={interactionLocked || !message.trim()}
            >
              Speak
            </button>
            <button
              className="ww-pill is-light"
              type="button"
              disabled={interactionLocked}
              onClick={() => void act("discuss")}
            >
              Hear the villagers
            </button>
            <button
              className="ww-pill is-primary"
              type="button"
              disabled={interactionLocked}
              onClick={() => void act("begin-vote")}
            >
              Begin vote
            </button>
          </div>
        </form>
      </>
    );
  } else if (game.phase === "vote") {
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          Time to vote
        </h1>
        <h2 className="ww-question">Who should leave the village?</h2>
        {playerCards((player) => player.alive && player.id !== me.id)}
        {updateLine}
        <p className="ww-stage-copy">Your vote is final.</p>
        <button
          className="ww-pill is-primary"
          type="button"
          disabled={interactionLocked || selected.length !== 1}
          onClick={() => void act("vote", { target: selected[0] })}
        >
          Cast vote
        </button>
      </>
    );
  } else if (game.phase === "hunter" && me.hunterActionPending) {
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          One last shot
        </h1>
        <h2 className="ww-question">Choose someone to take with you.</h2>
        {updateLine}
        {playerCards((player) => player.alive && player.id !== me.id)}
        <button
          className="ww-pill is-primary"
          type="button"
          disabled={interactionLocked || selected.length !== 1}
          onClick={() => void act("hunter-shot", { target: selected[0] })}
        >
          Take the shot
        </button>
      </>
    );
  } else {
    stageContent = (
      <>
        <h1 id="ww-heading" className="ww-display" tabIndex={-1}>
          The story continues.
        </h1>
        {updateLine}
        {playerCards()}
      </>
    );
  }

  return (
    <main className={`pbv-root ww-app ww-scene-${scene} phase-${game.phase}`}>
      <VillageSky
        scene={scene === "night" || scene === "day" || scene === "victory" ? scene : "none"}
      />
      {header}
      {rail}
      <section
        className={`ww-stage${introView ? " ww-intro" : " ww-phase"}${introView === "role" || introView === "role-details" ? " ww-role-stage" : ""}`}
        aria-labelledby="ww-heading"
      >
        {game.testMode && <p className="ww-test-banner">Quick test · You are the Seer</p>}
        <p className="sr-only">
          Day {game.day} · {phaseNames[game.phase]}
        </p>
        {stageContent}
        {error && (
          <div className="ww-error" role="alert">
            <p>{error}</p>
            {actionDeliveryRef.current.pending?.gameId === game.id && (
              <button
                type="button"
                className="ww-pill"
                disabled={busy}
                onClick={() => {
                  const pending = actionDeliveryRef.current.pending;
                  if (pending) void perform(pending.input);
                }}
              >
                Retry last move
              </button>
            )}
          </div>
        )}
      </section>
      {voiceDock}
      {dialogs}
    </main>
  );
}
