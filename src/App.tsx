import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { FeedEntry, GameView, Role } from "../server/game/types.js";
import { defaultRoleCounts } from "../server/game/rules.js";
import {
  createBrowserNarrationBackend,
  primeBrowserNarration,
  useStoryAudio,
} from "./voice/browser-narration.js";
import { startLiveVoice, type LiveVoiceSession } from "./voice/live-voice.js";
import {
  startPersistentSpeechRecognition,
  type SpeechRecognitionSession,
} from "./voice/speech-recognition.js";

type Session = { game: GameView; token: string };
type GuideMessage = { role: "user" | "assistant"; text: string; mode?: "model" | "local" };
type VoiceInputMode = "idle" | "browser" | "connecting-live" | "live";
const roleNames: Record<Role, string> = {
  werewolf: "Werewolf",
  villager: "Villager",
  seer: "Seer",
  witch: "Witch",
  hunter: "Hunter",
  cupid: "Cupid",
};
const roleSymbols: Record<Role, string> = {
  werewolf: "🐺",
  villager: "●",
  seer: "◆",
  witch: "✦",
  hunter: "✹",
  cupid: "♥",
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
    `Your voice companion is already listening after microphone permission. At night, ${nightVoiceExample[me.role]}, or simply say ‘choose Emma’.`,
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
    `Your voice companion is already listening after microphone permission. At night, ${nightVoiceExample[me.role]}, or simply say ‘choose Emma’. During the morning, say ‘Emma, why do you suspect Sofia?’ or ‘tell the village I trust Lucas’ to post a public message; the villagers will answer. Say ‘hear the villagers’, ‘begin vote’, ‘vote for Emma’, or ‘what can I do?’ at any time.`,
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
  const { me } = game;
  if (game.paused) return "The game is paused. Say ‘resume game’ when you are ready.";
  if (game.phase === "over")
    return "This game is over. Say ‘start a new game’ to open another village.";
  if (!me.alive && !me.hunterActionPending)
    return "You are out of this village. Say ‘continue watching’ to let the story move on.";
  if (game.phase === "prologue")
    return "The village is being introduced. Say ‘begin the first night’ when you are ready.";
  if (game.phase === "cupid")
    return "You are Cupid. Say ‘pair’ followed by two living player names, for example ‘pair Emma and Lucas’.";
  if (game.phase === "night") {
    if (me.role === "werewolf")
      return "It is night. Say ‘hunt’ and a living player’s name, or say ‘let the pack decide’.";
    if (me.role === "seer")
      return "It is night. Say ‘choose’ or ‘investigate’ followed by a living player’s name.";
    if (me.role === "witch")
      return "It is night. Say ‘save’, ‘poison’ and a living player’s name, or ‘pass’.";
    return "It is night. Say ‘wait for dawn’ to continue.";
  }
  if (game.phase === "day")
    return "It is day. Speak to the village naturally, say ‘hear the villagers’, or say ‘begin vote’.";
  if (game.phase === "vote")
    return "Voting is open. Say ‘choose’, ‘select’, or ‘vote for’ and a living player’s name. Your vote is final.";
  if (game.phase === "hunter")
    return "You have one final shot. Say ‘shoot’ and a living player’s name.";
  return "Ask the guide to describe the current phase.";
}

function voiceActionFeedback(game: GameView, command: string) {
  const normalized = normalizeVoiceText(command);
  const newestPrivate = [...game.feed].reverse().find((entry) => entry.kind === "private");
  const newestEvent = [...game.feed].reverse().find((entry) => entry.kind === "event");

  if (
    /\b(choose|pick|select|investigate|check|inspect|hunt|attack|kill|poison|save|heal)\b/u.test(
      normalized,
    )
  ) {
    return `Done. ${newestPrivate?.text ?? newestEvent?.text ?? "Your choice has been recorded."} ${currentActionHelp(game)}`;
  }
  if (/\b(vote|eliminate|exile|remove|kick out)\b/u.test(normalized)) {
    return `Done. ${newestEvent?.text ?? "Your vote has been recorded."} ${currentActionHelp(game)}`;
  }
  if (/^(?:say|speak|tell|ask|message)\b/u.test(normalized)) {
    return `Done. Your message has been sent to the village. ${currentActionHelp(game)}`;
  }
  return `Done. ${currentActionHelp(game)}`;
}

function roleStateSummary(game: GameView) {
  const { me } = game;
  const details = [
    `Your role is ${roleNames[me.role]}.`,
    me.alive ? "You are alive." : "You have been eliminated.",
  ];
  if (me.role === "werewolf")
    details.push(
      me.werewolfTeam?.length
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
    "From top to bottom, the header has the game name, Help, the day and phase, and New game.",
    "Next is the round heading and the latest village update.",
    "The main area starts with the village board, which lists every player and whether they are alive or eliminated.",
    "The right side contains the village history, then your private assistant with your role and private findings, then story audio controls, then Voice Guide controls and a typed fallback command box.",
    "The last section is Your Turn. It shows only the actions available in this phase.",
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

export default function App() {
  const [session, setSession] = useState<Session>();
  const [presentedGame, setPresentedGame] = useState<GameView>();
  const [name] = useState("You");
  const [count, setCount] = useState(6);
  const [tieRule] = useState("no-exile");
  const [explainAsWePlay, setExplainAsWePlay] = useState(true);
  const [setupStep, setSetupStep] = useState<"mode" | "village">("mode");
  const [onboardingStep, setOnboardingStep] = useState<"village" | "role" | "details" | "moon">(
    "village",
  );
  const [cinematic, setCinematic] = useState<
    "sleep" | "wake" | "finding" | "vote" | "reveal" | undefined
  >();
  const [selected, setSelected] = useState<string[]>([]);
  const [heal, setHeal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState(
    "Tap anywhere once to allow the microphone, then say “start the game”",
  );
  const [listening, setListening] = useState(false);
  const [voiceCommandsPaused, setVoiceCommandsPaused] = useState(false);
  const [guideMessages, setGuideMessages] = useState<GuideMessage[]>([]);
  const [guideText, setGuideText] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [openingAudio, setOpeningAudio] = useState<{ gameId: string; text: string }>();
  const recognitionRef = useRef<SpeechRecognitionSession | null>(null);
  const latestGameRef = useRef<GameView | undefined>(undefined);
  const sessionRef = useRef<Session | undefined>(undefined);
  const autoVoiceRequestedRef = useRef(false);
  const voiceFailureRef = useRef<string | undefined>(undefined);
  const presentedGameRef = useRef<GameView | undefined>(undefined);
  const voiceCommandHandlerRef = useRef<(transcript: string) => void>(() => undefined);
  const startVoiceRef = useRef<() => void>(() => undefined);
  const liveConnectionRef = useRef<LiveVoiceSession | null>(null);
  const inputModeRef = useRef<VoiceInputMode>("idle");
  const cinematicTimerRef = useRef<number | undefined>(undefined);
  const onboardingTimerRef = useRef<number | undefined>(undefined);
  const commandQueueRef = useRef(Promise.resolve());
  const lastVoiceCommandRef = useRef({ text: "", at: 0 });
  const actionInFlightRef = useRef(false);
  const guideRequestIdRef = useRef(0);
  const guideAbortRef = useRef<AbortController | undefined>(undefined);
  // One browser narrator is deliberately used for every line. It starts without
  // a network round trip and never changes identity if a remote TTS request fails.
  const narrationBackend = useMemo(() => createBrowserNarrationBackend(), []);
  const revealNarratedPhase = useCallback(() => {
    const latestGame = latestGameRef.current;
    if (!latestGame) return;
    presentedGameRef.current = latestGame;
    setPresentedGame(latestGame);
  }, []);
  const storyAudio = useStoryAudio({
    feed: session?.game.feed,
    gameId: session?.game.id,
    phase: session?.game.phase,
    onPhaseBoundaryStart: revealNarratedPhase,
    openingLine: openingAudio && {
      id: `${openingAudio.gameId}:opening-guide`,
      speaker: "Guide",
      text: openingAudio.text,
      voiceKey: "assistant",
      instant: true,
    },
    backend: narrationBackend,
  });

  function commitGame(game: GameView, token: string) {
    const previous = latestGameRef.current;
    const nextSession = { game, token };
    latestGameRef.current = game;
    sessionRef.current = nextSession;
    setSession(nextSession);
    // A player command always wins over an in-progress announcement. Showing the
    // new game state immediately prevents a spoken move from being applied to an
    // old day or night screen.
    presentedGameRef.current = game;
    setPresentedGame(game);
    // The server can move the story forward while an onboarding card is still
    // visible. Once it has left the prologue, the current game screen wins.
    if (game.phase !== "prologue") {
      if (onboardingTimerRef.current) window.clearTimeout(onboardingTimerRef.current);
      onboardingTimerRef.current = undefined;
      setOnboardingStep("village");
    }
    if (!previous || previous.phase === game.phase) return;
    if (game.me.investigations.length > previous.me.investigations.length) {
      showCinematic("finding", 1800);
      return;
    }
    if (previous.phase === "vote") {
      showVoteOutcome(game);
      return;
    }
    if (game.phase === "day") showCinematic("wake");
    if (game.phase === "night") showCinematic("sleep");
  }

  function showCinematic(next: "sleep" | "wake" | "finding" | "vote" | "reveal", duration = 1450) {
    if (cinematicTimerRef.current) window.clearTimeout(cinematicTimerRef.current);
    setCinematic(next);
    cinematicTimerRef.current = window.setTimeout(() => {
      setCinematic(undefined);
      cinematicTimerRef.current = undefined;
    }, duration);
  }

  function showVoteOutcome(game: GameView) {
    if (cinematicTimerRef.current) window.clearTimeout(cinematicTimerRef.current);
    setCinematic("vote");
    cinematicTimerRef.current = window.setTimeout(() => {
      if (game.lastVoteResult?.exiledPlayerId) {
        setCinematic("reveal");
        cinematicTimerRef.current = window.setTimeout(() => {
          setCinematic(undefined);
          cinematicTimerRef.current = undefined;
        }, 1_800);
      } else {
        setCinematic(undefined);
        cinematicTimerRef.current = undefined;
      }
    }, 2_100);
  }

  /** A new move makes an older guide answer stale, so never let it speak late. */
  function cancelPendingGuide() {
    guideRequestIdRef.current += 1;
    guideAbortRef.current?.abort();
    guideAbortRef.current = undefined;
  }

  /** Keep the reference moon and nightfall slides distinct for clicks and voice commands. */
  function beginFirstNight() {
    if (onboardingTimerRef.current) return;
    storyAudio.stop();
    setOnboardingStep("moon");
    onboardingTimerRef.current = window.setTimeout(() => {
      onboardingTimerRef.current = undefined;
      setOnboardingStep("village");
      void act("begin-story");
    }, 2_200);
  }

  async function create(event?: FormEvent, testMode = false) {
    event?.preventDefault();
    cancelPendingGuide();
    if (onboardingTimerRef.current) window.clearTimeout(onboardingTimerRef.current);
    onboardingTimerRef.current = undefined;
    primeBrowserNarration();
    // This runs directly from the player's Start or Quick Test gesture, which is
    // the one moment browsers allow microphone permission to be requested.
    autoVoiceRequestedRef.current = true;
    startAlwaysOnVoice();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          count,
          tieRule,
          start: true,
          testMode,
          explainAsWePlay,
          // The narrated introduction is part of the hands-free game flow. Keep it
          // for every new village so a returning player never lands in the middle
          // of a night without the role and controls being introduced first.
          skipIntro: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create a game.");
      const game = data as GameView;
      const briefing = openingBriefing(game, explainAsWePlay);
      commitGame(game, data.session);
      setOnboardingStep("village");
      setCinematic(undefined);
      // When browser speech recognition is unavailable, try the provider-backed
      // companion once the game session is ready.
      if (!recognitionRef.current && !liveConnectionRef.current) void connectLiveVoice();
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
      setError(cause instanceof Error ? cause.message : "Could not create a game.");
    } finally {
      setBusy(false);
    }
  }

  async function perform(input: Record<string, unknown>, announceFailure = false) {
    const activeSession = sessionRef.current;
    if (!activeSession) return undefined;
    if (actionInFlightRef.current || busy) {
      if (announceFailure) queueAssistant("One moment. I am still resolving the previous command.");
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
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That action could not be completed.");
      const game = data as GameView;
      commitGame(game, activeSession.token);
      if (announceFailure) {
        const command = typeof input.command === "string" ? input.command : "";
        queueAssistant(voiceActionFeedback(game, command), "local", {
          instant: true,
        });
      }
      setSelected([]);
      setHeal(false);
      return game;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "That action could not be completed.";
      if (message === "Game not found.") {
        recoverExpiredSession();
        queueAssistant("That village is no longer open. Say ‘start the game’ to begin a new one.");
        return undefined;
      }
      // A spoken mis-hearing should be read back, not left as a persistent red
      // error that obscures the next reference slide. Click actions still keep
      // the visible message for sighted players.
      if (announceFailure) {
        setError("");
        queueAssistant(message);
      } else setError(message);
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

  /** Stop a stale provider connection before clearing the game it belongs to. */
  function teardownLiveVoice() {
    inputModeRef.current = "idle";
    const live = liveConnectionRef.current;
    liveConnectionRef.current = null;
    setLiveConnected(false);
    setLiveConnecting(false);
    live?.stop();
  }

  /** Recover cleanly if a local/dev server has restarted and lost its in-memory match. */
  function recoverExpiredSession() {
    storyAudio.stop();
    teardownLiveVoice();
    if (onboardingTimerRef.current) window.clearTimeout(onboardingTimerRef.current);
    onboardingTimerRef.current = undefined;
    latestGameRef.current = undefined;
    presentedGameRef.current = undefined;
    sessionRef.current = undefined;
    setSession(undefined);
    setPresentedGame(undefined);
    setOnboardingStep("village");
    setCinematic(undefined);
    setSelected([]);
    setHeal(false);
    setOpeningAudio(undefined);
    setGuideMessages([]);
    setGuideText("");
    setError("");
  }

  function returnToSetup(step: "mode" | "village" = "mode") {
    recoverExpiredSession();
    setSetupStep(step);
    setVoiceStatus("Listening — say “start the game”");
  }

  function queueAssistant(
    text: string,
    mode: "model" | "local" = "local",
    options: { instant?: boolean } = {},
  ) {
    appendAssistantCaption(text, mode);
    storyAudio.enqueue({
      id: crypto.randomUUID(),
      speaker: "Assistant",
      text,
      voiceKey: "assistant",
      duringLive: true,
      instant: options.instant ?? liveConnected,
    });
  }

  /** Read structured, player-safe information immediately without waiting for Live Voice. */
  function narrateAccessibility(lines: string[]) {
    const readableLines = lines.filter((line) => line.trim());
    if (!readableLines.length) return;
    storyAudio.stop();
    appendAssistantCaption(readableLines.join(" "));
    for (const text of readableLines) {
      storyAudio.enqueue({
        id: crypto.randomUUID(),
        speaker: "Guide",
        text,
        voiceKey: "assistant",
        instant: true,
        duringLive: true,
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
    if (/\bpause\b.*\b(listening|voice control|microphone)\b/iu.test(command)) {
      setVoiceCommandsPaused(true);
      setVoiceStatus("Voice commands are paused. Say ‘resume listening’ to continue.");
      appendAssistantCaption(
        "Voice commands are paused. Say ‘resume listening’ when you are ready.",
      );
      return;
    }
    if (
      voiceCommandsPaused &&
      /\b(resume|continue)\b.*\b(listening|voice control|microphone)\b/iu.test(command)
    ) {
      setVoiceCommandsPaused(false);
      setVoiceStatus("Voice guide is listening");
      queueAssistant("Voice commands are active again.");
      return;
    }
    if (/\b(stop|disable|turn off)\b.*\b(listening|voice control|microphone)\b/iu.test(command)) {
      setVoiceCommandsPaused(true);
      setVoiceStatus("Voice commands are paused. Say ‘resume listening’ to continue.");
      appendAssistantCaption(
        "Voice commands are paused. Say ‘resume listening’ when you are ready.",
      );
      return;
    }
    if (voiceCommandsPaused) return;
    if (!session) {
      if (startsNewGameNaturally(command)) {
        queueAssistant("Starting a new village. I will introduce the characters first.");
        await create(undefined, /\b(quick|test)\b/iu.test(command));
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

    // The introduction is deliberately local presentation state, while the game
    // only advances once the player reaches the moon transition. This keeps the
    // visual sequence and voice-only sequence in lockstep.
    if (session.game.phase === "prologue") {
      // The moon is a short intentional transition. Ignore echoed speech until
      // its timer has opened the first night rather than bypassing the slide.
      if (onboardingStep === "moon") return;
      const wantsToAdvance =
        /\b(continue|ready|begin|start|next|go on|move on|i(?:'m| am) done|let(?:'s| us) go|get started)\b/iu.test(
          command,
        ) ||
        /\b(show|read|hear|tell me about|explain)\b.*\b(role|card|details?|instructions?)\b/iu.test(
          command,
        );
      if (wantsToAdvance) {
        if (onboardingStep === "village") {
          setOnboardingStep("role");
          narrateAccessibility([
            `Your role is ${roleNames[session.game.me.role]}. Say continue to hear how it works.`,
          ]);
          return;
        }
        if (onboardingStep === "role") {
          setOnboardingStep("details");
          narrateAccessibility([
            roleStateSummary(session.game),
            "Say I am ready when you want the first night to begin.",
          ]);
          return;
        }
        if (onboardingStep === "details") {
          beginFirstNight();
          return;
        }
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
      /\b(turn|switch|set|put)\b.*\b(auto(?:matic)?(?:\s+read(?:ing)?)?|auto-read)\b.*\b(off|disable|stop)\b/iu.test(
        command,
      )
    ) {
      if (storyAudio.autoRead) storyAudio.toggleAutoRead();
      appendAssistantCaption("Automatic reading is off. Say ‘turn auto read on’ to restore it.");
      return;
    }
    if (
      /\b(turn|switch|set|put)\b.*\b(auto(?:matic)?(?:\s+read(?:ing)?)?|auto-read)\b.*\b(on|enable|start)\b/iu.test(
        command,
      )
    ) {
      if (!storyAudio.autoRead) storyAudio.toggleAutoRead();
      queueAssistant("Automatic reading is on.", "local", { instant: true });
      return;
    }
    if (/\b(mute|silence)\b.*\b(narration|audio|story|guide)\b/iu.test(command)) {
      if (!storyAudio.muted) storyAudio.toggleMuted();
      appendAssistantCaption("Narration is muted. Voice commands remain available.");
      setVoiceStatus("Narration is muted. Voice guide is still listening.");
      return;
    }
    if (/\b(unmute|sound on)\b.*\b(narration|audio|story|guide)?\b/iu.test(command)) {
      if (storyAudio.muted) storyAudio.toggleMuted();
      queueAssistant("Narration is unmuted.", "local", { instant: true });
      return;
    }
    if (/\b(louder|volume up|increase volume)\b/iu.test(command)) {
      const next = Math.min(1, storyAudio.volume + 0.1);
      storyAudio.updateVolume(next);
      queueAssistant(`Volume is ${Math.round(next * 100)} percent.`, "local", { instant: true });
      return;
    }
    if (/\b(quieter|volume down|decrease volume)\b/iu.test(command)) {
      const next = Math.max(0, storyAudio.volume - 0.1);
      storyAudio.updateVolume(next);
      queueAssistant(`Volume is ${Math.round(next * 100)} percent.`, "local", { instant: true });
      return;
    }

    if (
      /\b(stop|quiet|silence)\b.*\b(talking|speaking|narration|audio)\b/iu.test(command) ||
      /\blet me speak\b/iu.test(command)
    ) {
      storyAudio.stop();
      setVoiceStatus("Narration stopped. Voice guide is still listening.");
      return;
    }
    if (/\b(repeat|replay|read|play)\b.*\b(guide|briefing|instructions)\b/iu.test(command)) {
      replayOpeningBriefing();
      return;
    }
    if (/\b(repeat|say that again|repeat that)\b/iu.test(command)) {
      storyAudio.repeatLast();
      return;
    }
    if (/\b(slower|slow down)\b/iu.test(command)) {
      storyAudio.updateSpeechRate(storyAudio.speechRate - 0.1);
      queueAssistant("I will speak more slowly.");
      return;
    }
    if (/\b(faster|speed up)\b/iu.test(command)) {
      storyAudio.updateSpeechRate(storyAudio.speechRate + 0.1);
      queueAssistant("I will speak faster.");
      return;
    }
    if (/\b(pause|hold)\b.*\b(narration|conversation|audio|talking)\b/iu.test(command)) {
      storyAudio.pause();
      setVoiceStatus("Narration paused. Voice guide is still listening.");
      return;
    }
    if (/\b(resume|continue)\b.*\b(narration|conversation|audio|talking)\b/iu.test(command)) {
      storyAudio.resume();
      return;
    }
    if (startsNewGameNaturally(command) || /\b(?:restart|start over|new round)\b/iu.test(command)) {
      queueAssistant("Starting a new village. I will introduce the characters first.");
      recoverExpiredSession();
      await create(undefined, /\b(quick|test)\b/iu.test(command));
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

  /**
   * Starts the hands-free input once and leaves it running for the match.
   * Browser recognition restarts itself after ordinary phrase boundaries.
   */
  function startAlwaysOnVoice() {
    if (inputModeRef.current !== "idle" || recognitionRef.current || liveConnectionRef.current)
      return;
    voiceFailureRef.current = undefined;
    try {
      const recognition = startPersistentSpeechRecognition({
        onTranscript: (transcript) => voiceCommandHandlerRef.current(transcript),
        onError: (reason) => {
          voiceFailureRef.current = reason;
          // Chromium can emit `aborted` while it rotates a continuous
          // recognition session. The session restarts internally, so it is not
          // an interruption the player needs to hear about.
          if (reason === "aborted" || reason === "no-speech") {
            setVoiceStatus(
              sessionRef.current
                ? "Voice companion is listening"
                : "Listening — say “start the game”",
            );
            return;
          }
          if (reason === "network") {
            if (sessionRef.current) {
              setVoiceStatus("Switching to the live voice companion…");
              // Change modes before the browser callback ends. This keeps its
              // delayed onStopped handler from reviving a second listener.
              void connectLiveVoice();
            } else {
              setVoiceStatus("Voice companion will reconnect when the game opens.");
            }
            return;
          }
          if (["not-allowed", "service-not-allowed"].includes(reason)) {
            setVoiceStatus("Tap anywhere once to allow the microphone, then say “start the game”.");
            return;
          }
          setVoiceStatus(`Voice input interrupted (${reason}). Reconnecting when possible…`);
        },
        onStopped: () => {
          recognitionRef.current = null;
          // `connectLiveVoice` already owns the handoff. A stale browser
          // callback must never restart itself while Live is opening or active.
          if (inputModeRef.current === "connecting-live" || inputModeRef.current === "live") return;
          inputModeRef.current = "idle";
          const failure = voiceFailureRef.current;
          if (
            autoVoiceRequestedRef.current &&
            !["not-allowed", "service-not-allowed", "audio-capture"].includes(failure ?? "")
          ) {
            window.setTimeout(() => {
              if (inputModeRef.current === "idle") startAlwaysOnVoice();
            }, 700);
            return;
          }
          resetVoiceGuide(
            failure === "audio-capture"
              ? "No microphone was found. Connect one, then refresh the game."
              : sessionRef.current
                ? "Microphone permission is needed for hands-free play."
                : "Tap anywhere once to allow the microphone, then say “start the game”.",
          );
        },
      });
      if (!recognition) {
        inputModeRef.current = "idle";
        setVoiceStatus(
          "Hands-free voice is unavailable in this browser. Use a browser with voice recognition.",
        );
        if (sessionRef.current) void connectLiveVoice();
        return;
      }
      recognitionRef.current = recognition;
      inputModeRef.current = "browser";
      setListening(true);
      setVoiceCommandsPaused(false);
      setVoiceStatus(
        sessionRef.current ? "Voice companion is listening" : "Listening — say “start the game”",
      );
    } catch {
      recognitionRef.current = null;
      inputModeRef.current = "idle";
      setListening(false);
      setVoiceStatus("Tap anywhere once to allow the microphone, then say “start the game”.");
    }
  }

  function resetVoiceGuide(status: string) {
    setListening(false);
    setVoiceCommandsPaused(false);
    setVoiceStatus(status);
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

  async function connectLiveVoice() {
    const activeSession = sessionRef.current;
    if (
      !activeSession ||
      liveConnectionRef.current ||
      inputModeRef.current === "connecting-live" ||
      inputModeRef.current === "live"
    )
      return;
    inputModeRef.current = "connecting-live";
    const browserRecognition = recognitionRef.current;
    recognitionRef.current = null;
    browserRecognition?.stop();
    resetVoiceGuide("Starting live voice companion…");
    setLiveConnecting(true);
    setError("");
    let established = false;
    try {
      const live = await startLiveVoice({
        gameId: activeSession.game.id,
        sessionToken: activeSession.token,
        onStatus: setVoiceStatus,
        onInputTranscript: () => undefined,
        onInputTranscriptComplete: (text) => {
          voiceCommandHandlerRef.current(text);
        },
        onClosed: () => {
          liveConnectionRef.current = null;
          setLiveConnected(false);
          setLiveConnecting(false);
          if (inputModeRef.current === "connecting-live" || inputModeRef.current === "live") {
            inputModeRef.current = "idle";
          }
          // Only retry an established connection. A rejected setup should not
          // loop against the provider when its credentials or transport are bad.
          if (established && autoVoiceRequestedRef.current) {
            window.setTimeout(() => {
              if (inputModeRef.current === "idle") startVoiceRef.current();
            }, 700);
          }
        },
      });
      // A reset can happen while the provider is negotiating. Do not attach a
      // late connection to the next village (or to the setup screen).
      if (
        sessionRef.current?.game.id !== activeSession.game.id ||
        inputModeRef.current !== "connecting-live"
      ) {
        live.stop();
        return;
      }
      liveConnectionRef.current = live;
      established = true;
      inputModeRef.current = "live";
      setLiveConnected(true);
      setVoiceStatus("Voice companion is listening");
    } catch (cause) {
      if (
        sessionRef.current?.game.id !== activeSession.game.id ||
        inputModeRef.current !== "connecting-live"
      )
        return;
      inputModeRef.current = "idle";
      resetVoiceGuide(
        cause instanceof Error ? cause.message : "Could not start the Live Voice Guide.",
      );
    } finally {
      setLiveConnecting(false);
    }
  }

  useEffect(() => {
    voiceCommandHandlerRef.current = (transcript) => {
      const text = transcript.trim();
      if (!text) return;
      const normalized = normalizeVoiceCommand(text);
      const now = Date.now();
      if (
        lastVoiceCommandRef.current.text === normalized &&
        now - lastVoiceCommandRef.current.at < 2_200
      )
        return;
      lastVoiceCommandRef.current = { text: normalized, at: now };
      // A slow open-ended guide answer must not make an immediate game command
      // wait in line. Actions still share their ordered command lane.
      if (isGuideQuestion(text) && !looksLikeGameAction(text, latestGameRef.current)) {
        void handleVoiceCommand(text);
        return;
      }
      commandQueueRef.current = commandQueueRef.current
        .catch(() => undefined)
        .then(() => handleVoiceCommand(text));
    };
  });

  useEffect(() => {
    startVoiceRef.current = startAlwaysOnVoice;
  });

  useEffect(() => {
    autoVoiceRequestedRef.current = true;
    if (navigator.permissions) {
      void navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((permission) => {
          if (permission.state === "granted") startVoiceRef.current();
        })
        .catch(() => undefined);
    }
    const enableVoice = () => {
      if (inputModeRef.current !== "idle") return;
      primeBrowserNarration();
      startVoiceRef.current();
    };
    window.addEventListener("pointerdown", enableVoice, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", enableVoice);
      autoVoiceRequestedRef.current = false;
      if (cinematicTimerRef.current) window.clearTimeout(cinematicTimerRef.current);
      if (onboardingTimerRef.current) window.clearTimeout(onboardingTimerRef.current);
      guideAbortRef.current?.abort();
      guideAbortRef.current = undefined;
      recognitionRef.current?.stop();
      const live = liveConnectionRef.current;
      liveConnectionRef.current = null;
      inputModeRef.current = "idle";
      live?.stop();
    };
  }, []);

  const voiceDock = (
    <aside
      className={`voice-dock ${listening || liveConnected || liveConnecting ? "is-active" : ""}`}
      aria-live="polite"
      aria-label="Voice companion status"
    >
      <span className="voice-dock-orb" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        <strong>Voice companion</strong>
        <small>
          {busy
            ? "The guide is resolving your move"
            : liveConnected
              ? "Listening for your question"
              : listening
                ? voiceCommandsPaused
                  ? "Listening paused"
                  : session
                    ? "Always listening"
                    : "Say “start the game”"
                : voiceStatus}
        </small>
      </span>
    </aside>
  );

  const header = (
    <header className="reference-header">
      <a
        className="reference-wordmark"
        href="#top"
        id="top"
        onClick={() => setCinematic(undefined)}
      >
        <strong>Play by Voice</strong>
        <span>•</span>
        <b>Chess</b>
      </a>
      <nav aria-label="Game options">
        <button type="button" onClick={storyAudio.toggleMuted}>
          {storyAudio.muted ? "Audio on" : "Audio settings"}
        </button>
        <button
          type="button"
          onClick={() =>
            narrateAccessibility([
              "Your voice companion is always listening after microphone permission.",
              "Say voice help to hear every command, or say start the game to begin.",
            ])
          }
        >
          Help
        </button>
      </nav>
    </header>
  );

  const renderMoon = (large = false) => (
    <span className={`reference-moon ${large ? "is-large" : ""}`} aria-hidden="true" />
  );

  const homeButton = (
    <button
      className="reference-home"
      type="button"
      aria-label="Return to game setup"
      onClick={() => returnToSetup()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4.5 10.5 7.5-6 7.5 6v8.25a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V10.5Z" />
        <path d="M9.25 19.5v-5.25h5.5v5.25" />
      </svg>
    </button>
  );

  if (!session) {
    const roleCounts = defaultRoleCounts(count);
    const rolesForSetup = (["werewolf", "seer", "witch", "hunter", "cupid", "villager"] as Role[])
      .filter((role) => roleCounts[role] > 0)
      .map((role) => `${roleCounts[role]} × ${roleNames[role]}`);
    return (
      <main className="reference-app reference-day" id="top">
        {header}
        {homeButton}
        <section className="reference-stage setup-stage scene-enter">
          {setupStep === "mode" ? (
            <div className="setup-flow">
              <div className="stage-copy compact-copy">
                <h1>Set up your game</h1>
                <p>Choose your preferences, or say “start” with the defaults.</p>
              </div>
              <section className="setup-card mode-card" aria-label="Choose who to play with">
                <h2>Who do you want to play?</h2>
                <button
                  className="mode-choice is-selected"
                  type="button"
                  onClick={() => setSetupStep("village")}
                >
                  <span aria-hidden="true">♙</span>
                  Solo
                </button>
                <button className="mode-choice" type="button" disabled>
                  With Friends
                  <small>Coming soon…</small>
                </button>
              </section>
            </div>
          ) : (
            <div className="setup-flow village-setup">
              <div className="stage-copy compact-copy">
                <h1>Set up your game</h1>
                <p>Choose your preferences, or say “start” with the defaults.</p>
              </div>
              <div className="setup-grid">
                <section className="setup-card player-count-card">
                  <h2>Set up your village</h2>
                  <div className="count-control">
                    <button
                      type="button"
                      aria-label="Remove a player"
                      onClick={() => setCount((value) => Math.max(4, value - 1))}
                    >
                      −
                    </button>
                    <strong>{count}</strong>
                    <button
                      type="button"
                      aria-label="Add a player"
                      onClick={() => setCount((value) => Math.min(12, value + 1))}
                    >
                      +
                    </button>
                  </div>
                  <small>Players</small>
                </section>
                <section className="setup-card role-list-card">
                  <h2>Roles</h2>
                  {rolesForSetup.map((role) => (
                    <p key={role}>{role}</p>
                  ))}
                </section>
              </div>
              <label className="explain-toggle">
                <input
                  type="checkbox"
                  checked={explainAsWePlay}
                  onChange={(event) => setExplainAsWePlay(event.target.checked)}
                />
                <span>Explain the game as we play</span>
              </label>
              <div className="setup-actions">
                <button
                  className="secondary-pill"
                  type="button"
                  onClick={() => setSetupStep("mode")}
                >
                  Back
                </button>
                <button
                  className="primary-pill"
                  type="button"
                  disabled={busy}
                  onClick={() => void create()}
                >
                  {busy ? "Starting…" : "Start game"}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="stage-error" role="alert">
              {error}
            </p>
          )}
          {renderMoon()}
        </section>
        {voiceDock}
      </main>
    );
  }

  const game = presentedGame ?? session.game;
  const me = game.me;
  const alive = game.players.filter((player) => player.alive);
  const others = alive.filter((player) => player.id !== me.id);
  // A spoken or clicked action intentionally interrupts old narration in
  // perform(), so it must remain available while a phase line is playing.
  const interactionLocked = busy;
  const roleCopy: Record<Role, { symbol: string; goal: string; short: string; detail: string }> = {
    seer: {
      symbol: "◆",
      short: "You can discover the true identity of one player every night.",
      goal: "Help the village find and eliminate every Werewolf before they take over.",
      detail:
        "During the night, choose one player. I will tell you whether they are a Werewolf. Keep your role secret during the discussion.",
    },
    werewolf: {
      symbol: "◒",
      short: "Choose a target with the pack every night and keep your identity hidden.",
      goal: "Let the Werewolves outnumber the rest of the village.",
      detail:
        "During the night, choose a non-wolf target or say let the pack decide. During the day, blend in and direct suspicion away from the pack.",
    },
    witch: {
      symbol: "✦",
      short: "You have one healing potion and one poison potion for the whole game.",
      goal: "Use your potions wisely to protect the village.",
      detail:
        "At night, say save, poison a player, pass, or choose for me. Your potions are private and each can be used only once.",
    },
    hunter: {
      symbol: "✹",
      short: "If you are eliminated, you take one final shot before the game continues.",
      goal: "Help the village remove every Werewolf.",
      detail:
        "Stay alert through the discussion. If you fall, choose another living player for your final shot.",
    },
    cupid: {
      symbol: "♥",
      short: "At the start of the game, bind two villagers as lovers.",
      goal: "Choose carefully: if one lover dies, the other dies too.",
      detail:
        "Name two players during the opening night. Their bond stays hidden, but their fate is linked.",
    },
    villager: {
      symbol: "●",
      short: "You have no night power, so your voice and judgement matter by day.",
      goal: "Help the village find and eliminate every Werewolf.",
      detail:
        "Listen closely, question players in the discussion, and vote when the village is ready.",
    },
  };
  const role = roleCopy[me.role];
  const latestFinding = me.investigations.at(-1);
  const accentClass = (index: number) => `accent-${(index % 6) + 1}`;
  const displayedPlayers = [
    ...game.players.filter((player) => player.id !== me.id),
    game.players.find((player) => player.id === me.id),
  ].filter((player): player is GameView["players"][number] => Boolean(player));
  const selectTarget = (playerId: string, multiple = false) => {
    setSelected((current) =>
      multiple
        ? current.includes(playerId)
          ? current.filter((value) => value !== playerId)
          : [...current, playerId]
        : [playerId],
    );
  };
  const playerStrip = (
    options: { selectable?: boolean; multiple?: boolean; excludeSelf?: boolean } = {},
  ) => {
    return (
      <div className="player-strip" aria-label="Village players">
        {displayedPlayers
          .filter((player) => !options.excludeSelf || player.id !== me.id)
          .map((player, index) => {
            const isSelected = selected.includes(player.id);
            const selectable = Boolean(options.selectable && player.alive && !interactionLocked);
            return (
              <button
                className={`player-tile ${accentClass(index)} ${isSelected ? "is-selected" : ""} ${!player.alive ? "is-out" : ""}`}
                disabled={!selectable}
                aria-pressed={isSelected}
                onClick={() => selectTarget(player.id, options.multiple)}
                key={player.id}
                type="button"
              >
                <span>{player.id === me.id ? "You" : player.name}</span>
                <i aria-hidden="true" />
                {!player.alive && <small>Out</small>}
              </button>
            );
          })}
      </div>
    );
  };

  const playerName = (id: string | undefined) =>
    game.players.find((player) => player.id === id)?.name;
  const latestVoteTarget = playerName(game.lastVoteResult?.exiledPlayerId);
  const latestVoteRole = game.players.find(
    (player) => player.id === game.lastVoteResult?.exiledPlayerId,
  )?.revealedRole;

  const renderNormalStage = () => {
    if (game.paused) {
      return (
        <div className="phase-stack pause-card scene-enter">
          <div className="stage-copy">
            <h1>The village is waiting.</h1>
            <p>The game is paused.</p>
          </div>
          <button className="primary-pill" type="button" onClick={() => void act("resume")}>
            Resume game
          </button>
        </div>
      );
    }
    if (!me.alive && game.phase !== "over" && (game.phase !== "hunter" || !me.hunterActionPending)) {
      const canContinue = game.phase === "day" || game.phase === "vote" || game.phase === "night";
      return (
        <div className="phase-stack pause-card scene-enter">
          <div className="stage-copy">
            <h1>You are watching</h1>
            <p>The village continues without you.</p>
          </div>
          {canContinue && (
            <button
              className="primary-pill"
              type="button"
              disabled={interactionLocked}
              onClick={() => void act("continue")}
            >
              Continue watching
            </button>
          )}
        </div>
      );
    }
    if (game.phase === "prologue") {
      return (
        <div className="phase-stack meet-stage scene-enter">
          <div className="stage-copy">
            <h1>Meet the Village</h1>
            <p>
              These are the people
              <br />
              you’ll be playing with tonight.
            </p>
          </div>
          {playerStrip()}
          <div className="speech-stack">
            <p>
              Some of them are villagers.
              <br />
              Some may be Werewolves.
            </p>
            <strong>Their roles are hidden.</strong>
          </div>
          <button className="gold-pill" type="button" onClick={() => setOnboardingStep("role")}>
            Continue
          </button>
        </div>
      );
    }
    if (game.phase === "cupid") {
      if (me.role !== "cupid") {
        return (
          <div className="phase-stack night-turn scene-enter">
            <div className="stage-copy">
              <h1>The village is waiting</h1>
              <p>Cupid is choosing the lovers.</p>
            </div>
          </div>
        );
      }
      return (
        <div className="phase-stack night-turn scene-enter">
          <div className="stage-copy">
            <h1>Your Turn</h1>
            <p>Who do you want to bind as lovers?</p>
          </div>
          {playerStrip({ selectable: true, multiple: true, excludeSelf: true })}
          <p className="voice-prompt">Say “choose” followed by two names, or select two players.</p>
          <button
            className="primary-pill"
            disabled={interactionLocked || selected.length !== 2}
            type="button"
            onClick={() => void act("lovers", { first: selected[0], second: selected[1] })}
          >
            Bind hearts
          </button>
        </div>
      );
    }
    if (game.phase === "night") {
      const canPoison = me.role === "witch" && me.witchPoisonAvailable;
      const canTarget = me.role === "seer" || me.role === "werewolf" || canPoison;
      const prompt =
        me.role === "seer"
          ? "Who do you want to investigate?"
          : me.role === "werewolf"
            ? "Who do you want to choose tonight?"
            : me.role === "witch"
              ? "What will you do tonight?"
              : "The village is asleep.";
      const candidates =
        me.role === "werewolf"
          ? game.players.filter(
              (player) =>
                player.alive && player.id !== me.id && !me.werewolfTeam?.includes(player.name),
            )
          : me.role === "witch"
            ? others.filter((player) => !heal || player.name !== me.wolfVictim)
            : others;
      return (
        <div className="phase-stack night-turn scene-enter">
          <div className="stage-copy">
            <h1>Your Turn</h1>
            <p>{prompt}</p>
          </div>
          {canTarget && (
            <div className="player-strip">
              {candidates.map((player, index) => (
                <button
                  className={`player-tile ${accentClass(index)} ${selected.includes(player.id) ? "is-selected" : ""}`}
                  disabled={interactionLocked}
                  aria-pressed={selected.includes(player.id)}
                  onClick={() => selectTarget(player.id)}
                  key={player.id}
                  type="button"
                >
                  <span>{player.name}</span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          {me.role === "witch" && me.witchHealAvailable && me.wolfVictim && (
            <label className="potion-choice">
              <input
                type="checkbox"
                checked={heal}
                disabled={interactionLocked}
                onChange={(event) => {
                  const shouldHeal = event.target.checked;
                  setHeal(shouldHeal);
                  if (
                    shouldHeal &&
                    game.players.find((player) => player.id === selected[0])?.name === me.wolfVictim
                  )
                    setSelected([]);
                }}
              />{" "}
              Save {me.wolfVictim}
            </label>
          )}
          <p className="voice-prompt">
            {me.role === "seer"
              ? "Say “investigate” and a name."
              : me.role === "werewolf"
                ? "Say “hunt” and a name, or “let the pack decide.”"
                : me.role === "witch"
                  ? "Say “save”, “poison” and a name, or “pass.”"
                  : "Say “wait for dawn” to continue."}
          </p>
          <div className="stage-actions">
            {me.role === "werewolf" && (
              <button
                className="secondary-pill"
                type="button"
                disabled={interactionLocked}
                onClick={() => void act("night")}
              >
                Let the pack decide
              </button>
            )}
            <button
              className="primary-pill"
              type="button"
              disabled={
                interactionLocked ||
                ((me.role === "seer" || me.role === "werewolf") && !selected[0])
              }
              onClick={() => {
                const values =
                  me.role === "witch"
                    ? {
                        ...(canPoison && selected[0] ? { poison: selected[0] } : {}),
                        ...(heal ? { heal: true } : {}),
                      }
                    : selected[0]
                      ? { target: selected[0] }
                      : {};
                void act("night", values);
              }}
            >
              {canTarget ? "Continue" : "Wait for dawn"}
            </button>
          </div>
        </div>
      );
    }
    if (game.phase === "day") {
      return (
        <div className="phase-stack discussion-stage scene-enter">
          <div className="stage-copy">
            <h1>Discussion</h1>
          </div>
          {playerStrip()}
          <p className="voice-prompt">Ask, accuse, or listen.</p>
          <p className="examples">
            Examples:
            <br />“{game.players.find((player) => player.id !== me.id)?.name}, who do you suspect?”
            <br />
            “Tell the village I am suspicious.”
          </p>
          <div className="stage-actions">
            <button
              className="secondary-pill"
              type="button"
              disabled={interactionLocked}
              onClick={() => void act("discuss")}
            >
              Hear villagers
            </button>
            <button
              className="primary-pill"
              type="button"
              disabled={interactionLocked}
              onClick={() => void act("begin-vote")}
            >
              Begin vote
            </button>
          </div>
        </div>
      );
    }
    if (game.phase === "vote") {
      return (
        <div className="phase-stack vote-stage scene-enter">
          <div className="stage-copy">
            <h1>Time to vote</h1>
            <p>Who should leave the village?</p>
          </div>
          {playerStrip({ selectable: true, excludeSelf: true })}
          <p className="voice-prompt">Say “vote for” and a player’s name.</p>
          <button
            className="primary-pill"
            type="button"
            disabled={interactionLocked || !selected[0]}
            onClick={() => void act("vote", { target: selected[0] })}
          >
            Cast vote
          </button>
        </div>
      );
    }
    if (game.phase === "hunter") {
      if (!me.hunterActionPending) {
        return (
          <div className="phase-stack night-turn scene-enter">
            <div className="stage-copy">
              <h1>The village is waiting</h1>
              <p>The Hunter is making a final choice.</p>
            </div>
          </div>
        );
      }
      return (
        <div className="phase-stack night-turn scene-enter">
          <div className="stage-copy">
            <h1>One last shot</h1>
            <p>Who will you take with you?</p>
          </div>
          {playerStrip({ selectable: true, excludeSelf: true })}
          <button
            className="primary-pill"
            type="button"
            disabled={interactionLocked || !selected[0]}
            onClick={() => void act("hunter-shot", { target: selected[0] })}
          >
            Take the shot
          </button>
        </div>
      );
    }
    if (game.phase === "over") {
      const villageWon = game.winner === "village";
      return (
        <div className={`phase-stack end-stage scene-enter ${villageWon ? "has-fireworks" : ""}`}>
          {villageWon && (
            <div className="fireworks" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          )}
          <div className="stage-copy">
            <h1>
              {villageWon
                ? "The village wins"
                : game.winner === "lovers"
                  ? "Love survives"
                  : "The Werewolves win"}
            </h1>
            <p>
              {villageWon
                ? "Both Werewolves have been eliminated."
                : "The village has reached its final night."}
            </p>
          </div>
          <p className="survival-copy">You survived as</p>
          <h2>{roleNames[me.role]}</h2>
          <div className="stage-actions">
            <button
              className="secondary-pill"
              type="button"
              onClick={() => returnToSetup()}
            >
              Home
            </button>
            <button
              className="gold-pill"
              type="button"
              onClick={() => returnToSetup("village")}
            >
              Play again
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="phase-stack">
        <div className="stage-copy">
          <h1>The village waits.</h1>
        </div>
      </div>
    );
  };

  let stage: ReactNode;
  if (onboardingStep === "role") {
    stage = (
      <div className="phase-stack role-stage scene-enter">
        <div className="stage-copy">
          <h1>Your Role</h1>
        </div>
        <article className="role-card">
          <span className="role-symbol">{role.symbol}</span>
          <h2>The {roleNames[me.role]}</h2>
          <div className="role-card-glow">
            <p>{role.short}</p>
            <button
              className="primary-pill small-pill"
              type="button"
              onClick={() => setOnboardingStep("details")}
            >
              Read about role
            </button>
          </div>
        </article>
      </div>
    );
  } else if (onboardingStep === "details") {
    stage = (
      <div className="phase-stack role-stage scene-enter">
        <div className="stage-copy">
          <h1>Your Role</h1>
        </div>
        <article className="role-card detail-card">
          <h2>How your role works</h2>
          <p className="role-detail">• {role.detail}</p>
          <div className="role-card-glow">
            <h3>Your Goal</h3>
            <p>{role.goal}</p>
            <button
              className="primary-pill small-pill"
              type="button"
              onClick={() => setOnboardingStep("role")}
            >
              Turn back
            </button>
          </div>
        </article>
        <button
          className="gold-pill"
          type="button"
          disabled={interactionLocked}
          onClick={beginFirstNight}
        >
          I’m ready
        </button>
      </div>
    );
  } else if (onboardingStep === "moon") {
    stage = <div className="moon-only scene-enter">{renderMoon(true)}</div>;
  } else if (cinematic === "sleep") {
    stage = (
      <div className="cinematic-copy scene-enter">
        <h1>The village falls asleep.</h1>
      </div>
    );
  } else if (cinematic === "wake") {
    stage = (
      <div className="cinematic-copy scene-enter">
        <h1>The village wakes up.</h1>
      </div>
    );
  } else if (cinematic === "finding" && latestFinding) {
    stage = (
      <div className="finding-stage scene-enter">
        <article className="finding-card">
          <h2>{latestFinding.name}</h2>
          <i className="accent-3" aria-hidden="true" />
          <strong>{latestFinding.result === "wolf" ? "A Werewolf" : "Not a Werewolf"}</strong>
          <p>Remember this information. The other players do not know what you discovered.</p>
        </article>
      </div>
    );
  } else if (cinematic === "vote" && game.lastVoteResult) {
    stage = (
      <div className="phase-stack vote-result-stage scene-enter">
        <div className="stage-copy">
          <h1>Time to vote</h1>
          <p>Who should leave the village?</p>
        </div>
        <div className="player-strip vote-result-strip" aria-label="Vote results">
          {displayedPlayers.map((player, index) => {
            const votes = game.lastVoteResult?.tally.find(
              (item) => item.target === player.id,
            )?.votes;
            return (
              <div
                className={`player-tile ${accentClass(index)} ${player.id === game.lastVoteResult?.exiledPlayerId ? "is-eliminated" : ""}`}
                key={player.id}
              >
                <span>{player.id === me.id ? "You" : player.name}</span>
                <i aria-hidden="true" />
                {votes ? <b className="vote-count">{votes}</b> : null}
              </div>
            );
          })}
        </div>
        <p className={`vote-outcome ${game.lastVoteResult.exiledPlayerId ? "" : "is-tie"}`}>
          {game.lastVoteResult.exiledPlayerId
            ? `${latestVoteTarget} has been eliminated.`
            : "The vote is tied. No one leaves the village."}
        </p>
      </div>
    );
  } else if (cinematic === "reveal" && game.lastVoteResult && latestVoteTarget) {
    stage = (
      <div className="finding-stage role-reveal-stage scene-enter">
        <article className="finding-card reveal-card">
          <h2>{latestVoteTarget} was…</h2>
          <span className="revealed-role-symbol" aria-hidden="true">
            {latestVoteRole ? roleSymbols[latestVoteRole] : "?"}
          </span>
          <strong>{latestVoteRole ? `A ${roleNames[latestVoteRole]}` : "eliminated"}</strong>
        </article>
      </div>
    );
  } else {
    stage = renderNormalStage();
  }

  return (
    <main
      className={`reference-app ${game.phase === "night" || game.phase === "cupid" || game.phase === "hunter" ? "reference-night" : "reference-day"}`}
      id="top"
    >
      {header}
      {homeButton}
      <section className="reference-stage game-stage">
        {stage}
        {busy && (
          <p className="stage-progress" role="status">
            <i aria-hidden="true" /> The guide is resolving your move…
          </p>
        )}
        {error && (
          <p className="stage-error" role="alert">
            {error}
          </p>
        )}
        {onboardingStep !== "moon" && renderMoon()}
      </section>
      {voiceDock}
    </main>
  );
}
