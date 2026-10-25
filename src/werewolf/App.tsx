import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useId } from "react";
import { ArrowLeft, ArrowUp, Keyboard, X } from "lucide-react";
import LiquidOrb from "../components/PlayByVoice/LiquidOrb";
import { useDialogFocus } from "../hooks/useDialogFocus";
import VillageSky from "./VillageSky";
import { usePresence } from "../hooks/usePresence";
import { DEFAULT_ROLE_COUNTS } from "../../server/game/rules.js";
import type { FeedEntry, GameView, PublicPlayerView, Role } from "../../server/game/types.js";
import {
  createOpenAINarrationBackend,
  primeBrowserNarration,
  useStoryAudio,
} from "../voice/browser-narration.js";
import { startLiveVoice, type LiveVoiceSession } from "../voice/live-voice.js";
import {
  startPersistentSpeechRecognition,
  type SpeechRecognitionSession,
} from "../voice/speech-recognition.js";

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
const MIN_VILLAGE = 4;
const MAX_VILLAGE = 12;

type SetupStage = "preparing" | "prepare-error" | "mode" | "village" | "creating" | "create-error";
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
      "At night, you learn who the Werewolves targeted.",
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

function readStorySeen() {
  try {
    return window.localStorage.getItem("loups-story-seen") === "1";
  } catch {
    return false;
  }
}

function openingBriefing(game: GameView) {
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
    seer: "say ‘investigate Camille’",
    werewolf: "say ‘hunt Camille’ or ‘let the pack decide’",
    witch: "say ‘save’, ‘poison Camille’, or ‘pass’",
    hunter: "say ‘wait for dawn’ until you need your final shot",
    cupid: "say ‘wait for dawn’ once the lovers are bound",
    villager: "say ‘wait for dawn’",
  };

  return [
    `Welcome to Valombre. ${roleBriefing[me.role]}`,
    "The village wins by removing every Werewolf. The Werewolves win when they equal or outnumber everyone else. Nights are private; mornings are for public discussion and a village vote.",
    `Your voice companion is already listening after microphone permission. At night, ${nightVoiceExample[me.role]}, or simply say ‘choose Camille’. During the morning, say ‘Camille, why do you suspect Noémie?’ or ‘tell the village I trust Jules’ to post a public message; the villagers will answer. Say ‘hear the villagers’, ‘begin vote’, ‘vote for Camille’, or ‘what can I do?’ at any time.`,
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
    return "You are Cupid. Say ‘pair’ followed by two living player names, for example ‘pair Camille and Jules’.";
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
    "To hear the interface in order, say ‘describe the interface’. Say ‘read my role’, ‘read the players’, ‘who is alive’, ‘read updates’, ‘read all messages’, or ‘what did Camille say?’ to hear game information.",
    "For audio, say ‘repeat that’, ‘stop speaking’, ‘pause narration’, ‘resume narration’, ‘speak slower’, ‘speak faster’, ‘volume up’, ‘volume down’, ‘turn auto read on’, or ‘turn auto read off’.",
    "For choices, you can say ‘choose Camille’, ‘pick Jules’, ‘select Noémie’, ‘vote for Théo’, ‘choose for me’, ‘continue’, or ‘do nothing’. Say ‘pause game’, ‘resume game’, ‘pause voice control’, or ‘resume listening’ whenever you need them.",
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
}: {
  narrationVolume: number;
  onNarrationVolumeChange: (volume: number) => void;
  onShowGamePicker: () => void;
}) {
  const [session, setSession] = useState<Session>();
  const [presentedGame, setPresentedGame] = useState<GameView>();
  const [name] = useState("You");
  const [count, setCount] = useState(8);
  const [tieRule] = useState("no-exile");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [heal, setHeal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [voiceStatus, setVoiceStatus] = useState(
    "Tap anywhere once to allow the microphone, then say “start the game”",
  );
  const [listening, setListening] = useState(false);
  const [voiceCommandsPaused, setVoiceCommandsPaused] = useState(false);
  const [guideMessages, setGuideMessages] = useState<GuideMessage[]>([]);
  const [guideText, setGuideText] = useState("");
  const [guideBusy, setGuideBusy] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [openingAudio, setOpeningAudio] = useState<{ gameId: string; text: string }>();
  const [stage, setStage] = useState<SetupStage>("preparing");
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const [explainGame, setExplainGame] = useState(() => !readStorySeen());
  const [introStep, setIntroStep] = useState<IntroStep | null>(null);
  const [seenInvestigations, setSeenInvestigations] = useState(0);
  const [dialog, setDialog] = useState<"audio" | "help" | null>(null);
  const [typing, setTyping] = useState(false);
  const createControllerRef = useRef<AbortController | null>(null);
  const lastCreateTestModeRef = useRef(false);
  const typedToggleRef = useRef<HTMLButtonElement>(null);
  const commandPanel = usePresence(typing);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Reopening during the closing animation reuses the panel, so focus the input explicitly.
  useEffect(() => {
    if (typing) commandInputRef.current?.focus();
  }, [typing]);
  const recognitionRef = useRef<SpeechRecognitionSession | null>(null);
  const latestGameRef = useRef<GameView | undefined>(undefined);
  const sessionRef = useRef<Session | undefined>(undefined);
  const autoVoiceRequestedRef = useRef(false);
  const voiceFailureRef = useRef<string | undefined>(undefined);
  const presentedGameRef = useRef<GameView | undefined>(undefined);
  const voiceCommandHandlerRef = useRef<(transcript: string) => void>(() => undefined);
  const startVoiceRef = useRef<() => void>(() => undefined);
  const liveConnectionRef = useRef<LiveVoiceSession | null>(null);
  const liveStartRef = useRef<AbortController | null>(null);
  const useLiveFallbackRef = useRef(false);
  const narrationBackend = useMemo(
    () => createOpenAINarrationBackend(session?.game.id, session?.token),
    [session?.game.id, session?.token],
  );
  const revealNarratedPhase = useCallback(() => {
    const latestGame = latestGameRef.current;
    if (!latestGame) return;
    presentedGameRef.current = latestGame;
    setPresentedGame(latestGame);
  }, []);
  const storyAudio = useStoryAudio({
    initialVolume: narrationVolume,
    onVolumeChange: onNarrationVolumeChange,
    feed: session?.game.feed,
    gameId: session?.game.id,
    phase: session?.game.phase,
    liveVoiceActive: liveConnected,
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
    // Browsers only allow a first microphone permission prompt from a user gesture.
    // After one tap, recognition runs on the landing screen and throughout a game.
    autoVoiceRequestedRef.current = true;
    // When the player has already granted microphone access, begin immediately.
    // For a first visit, wait for the one permission gesture below so the browser
    // can actually show its microphone prompt instead of silently rejecting it.
    if (navigator.permissions) {
      void navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((permission) => {
          if (permission.state === "granted") startVoiceRef.current();
        })
        .catch(() => undefined);
    }
    const enableVoice = () => {
      if (recognitionRef.current || liveConnectionRef.current) return;
      primeBrowserNarration();
      startVoiceRef.current();
    };
    // Keep this listener until the page closes: if permission was declined or a
    // microphone was connected later, the next ordinary tap can retry it.
    window.addEventListener("pointerdown", enableVoice, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", enableVoice);
      autoVoiceRequestedRef.current = false;
      recognitionRef.current?.stop();
      // Leaving while a village is being created must not navigate back into it.
      createControllerRef.current?.abort();
      createControllerRef.current = null;
      liveStartRef.current?.abort();
      liveStartRef.current = null;
      stopLiveVoice();
    };
  }, []);

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
    cancelCreation();
    onShowGamePicker();
  }

  function openNewGameSetup() {
    cancelCreation();
    storyAudio.stop();
    setSession(undefined);
    setPresentedGame(undefined);
    latestGameRef.current = undefined;
    sessionRef.current = undefined;
    setIntroStep(null);
    setError("");
    setStage("village");
  }

  async function create(event?: FormEvent, testMode = false) {
    event?.preventDefault();
    // One launch at a time: repeated clicks or voice commands reuse the pending request.
    if (createControllerRef.current) return;
    const controller = new AbortController();
    createControllerRef.current = controller;
    lastCreateTestModeRef.current = testMode;
    setStage("creating");
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
        signal: controller.signal,
        body: JSON.stringify({
          name,
          count,
          tieRule,
          start: true,
          testMode,
          skipIntro: !testMode && !explainGame,
        }),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error ?? "Could not create a game.");
      const game = data as GameView;
      const briefing = openingBriefing(game);
      void Promise.all(SESSION_ASSETS.map((src) => preloadImage(src, controller.signal)));
      commitGame(game, data.session);
      setSeenInvestigations(game.me.investigations.length);
      setIntroStep(game.phase === "prologue" ? "village" : "role");
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
      if (explainGame || testMode) setOpeningAudio({ gameId: game.id, text: briefing });
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
    if (!session) return undefined;
    if (storyAudio.phaseTransitioning) {
      // The player has spoken or acted. Stop the now-stale announcement and move
      // directly to the updated phase so the narration and screen cannot diverge.
      storyAudio.stop();
    }
    if (busy) {
      if (announceFailure) queueAssistant("One moment. I am still resolving the previous command.");
      return undefined;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/games/${session.game.id}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Game-Session": session.token,
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That action could not be completed.");
      const game = data as GameView;
      commitGame(game, session.token);
      if (announceFailure) {
        const command = typeof input.command === "string" ? input.command : "";
        queueAssistant(voiceActionFeedback(game, command), "local", {
          instant: true,
        });
      }
      setSelected([]);
      setMessage("");
      setCommandText("");
      setHeal(false);
      return game;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "That action could not be completed.";
      setError(message);
      if (announceFailure) queueAssistant(message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function act(type: string, values: Record<string, unknown> = {}) {
    const result = await perform({ type, ...values });
    if (type === "begin-story") window.localStorage.setItem("loups-story-seen", "1");
    return result;
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
    setVoiceTranscript(command);
    // The Live model receives every microphone turn. Keep its remote audio
    // quiet while the app carries out a game command and speaks the verified
    // result. It is re-enabled below only for open-ended guide questions.
    liveConnectionRef.current?.setGuideAudioEnabled(false);
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
      const startsGame =
        /\b(start|new|begin|play)\b.*\b(game|match|village|loups)\b/iu.test(command) ||
        /\bstart\b.*\bdefaults?\b/iu.test(command) ||
        /\b(start|begin|play)\b.*\b(quick|test|demo)\b/iu.test(command);
      if (startsGame) {
        queueAssistant("Starting a new village. I will introduce the characters first.");
        await create(undefined, /\b(quick|test)\b/iu.test(command));
        return;
      }
      if (isGuideQuestion(command)) {
        queueAssistant(
          "Say ‘start a new game’ to begin. Once the village is open, I can explain your role, the rules, and every phase.",
        );
        return;
      }
      queueAssistant("I can start a new game when you say ‘start a new game’.");
      return;
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
    if (/\b(start|new)\b.*\b(game|match|village)\b/iu.test(command)) {
      queueAssistant("Starting a new village. I will introduce the characters first.");
      setSession(undefined);
      setIntroStep(null);
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
    if (isGuideQuestion(command)) {
      // GPT-Live is already answering this question aloud in its own audio track.
      if (liveConnectionRef.current) {
        liveConnectionRef.current.setGuideAudioEnabled(true);
        return;
      }
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
    if (recognitionRef.current || liveConnectionRef.current || liveConnecting) return;
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
              useLiveFallbackRef.current = true;
              setVoiceStatus("Switching to the live voice companion…");
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
          const failure = voiceFailureRef.current;
          if (useLiveFallbackRef.current && sessionRef.current) {
            useLiveFallbackRef.current = false;
            void connectLiveVoice();
            return;
          }
          if (
            autoVoiceRequestedRef.current &&
            !["not-allowed", "service-not-allowed", "audio-capture"].includes(failure ?? "")
          ) {
            window.setTimeout(startAlwaysOnVoice, 700);
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
        setVoiceStatus(
          "Hands-free voice is unavailable in this browser. Use a browser with voice recognition.",
        );
        return;
      }
      recognitionRef.current = recognition;
      setListening(true);
      setVoiceCommandsPaused(false);
      setVoiceStatus(
        sessionRef.current ? "Voice companion is listening" : "Listening — say “start the game”",
      );
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceStatus("Tap anywhere once to allow the microphone, then say “start the game”.");
    }
  }

  startVoiceRef.current = startAlwaysOnVoice;

  function resetVoiceGuide(status: string) {
    setListening(false);
    setVoiceCommandsPaused(false);
    setVoiceStatus(status);
  }

  async function askGuide(text = guideText) {
    if (!session || guideBusy || !text.trim()) return;
    const message = text.trim();
    const history = guideMessages.slice(-8).map(({ role, text: historyText }) => ({
      role,
      text: historyText,
    }));
    setGuideMessages((current) => [...current, { role: "user", text: message }]);
    setGuideText("");
    setGuideBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/games/${session.game.id}/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Game-Session": session.token,
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify({ message, history }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The guide is unavailable.");
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
      setError(cause instanceof Error ? cause.message : "The guide is unavailable.");
    } finally {
      setGuideBusy(false);
    }
  }

  function stopLiveVoice(status = "Voice guide is off") {
    liveStartRef.current?.abort();
    liveStartRef.current = null;
    const live = liveConnectionRef.current;
    liveConnectionRef.current = null;
    live?.stop();
    setLiveConnected(false);
    setLiveConnecting(false);
    setVoiceTranscript("");
    setVoiceStatus(status);
  }

  async function connectLiveVoice() {
    const activeSession = sessionRef.current;
    if (!activeSession || liveConnecting || liveConnectionRef.current) return;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    resetVoiceGuide("Starting live voice companion…");
    setLiveConnecting(true);
    storyAudio.stop();
    setError("");
    setVoiceTranscript("");
    const controller = new AbortController();
    liveStartRef.current = controller;
    try {
      const live = await startLiveVoice({
        gameId: activeSession.game.id,
        sessionToken: activeSession.token,
        signal: controller.signal,
        onStatus: setVoiceStatus,
        onInputTranscript: (text) => setVoiceTranscript(text.slice(-900)),
        onInputTranscriptComplete: (text) => {
          setVoiceTranscript(text);
          void handleVoiceCommand(text);
        },
        onGuideReply: (reply) => {
          // A Live reply is allowed only for an open guide question. Mute the
          // remote track immediately afterwards so a later game command cannot
          // overlap with an automatic model acknowledgement.
          liveConnectionRef.current?.setGuideAudioEnabled(false);
          setGuideMessages((current) => [
            ...current,
            { role: "assistant", text: reply, mode: "model" },
          ]);
        },
        onClosed: () => {
          liveConnectionRef.current = null;
          setLiveConnected(false);
          setLiveConnecting(false);
        },
      });
      if (controller.signal.aborted) {
        live.stop();
        return;
      }
      liveConnectionRef.current = live;
      setLiveConnected(true);
      setVoiceStatus("Voice companion is listening");
    } catch (cause) {
      if (controller.signal.aborted) return;
      resetVoiceGuide(
        cause instanceof Error ? cause.message : "Could not start the Live Voice Guide.",
      );
    } finally {
      if (liveStartRef.current === controller) liveStartRef.current = null;
      setLiveConnecting(false);
    }
  }

  // The persistent recognizer reads this ref, avoiding stale game state after a new game starts.
  voiceCommandHandlerRef.current = (transcript) => {
    setVoiceTranscript(transcript);
    void handleVoiceCommand(transcript);
  };

  const voiceActive = listening && !voiceCommandsPaused;
  const voiceDockStatus = liveConnecting
    ? "Connecting voice"
    : liveConnected
      ? voiceCommandsPaused
        ? "Voice commands paused"
        : "Listening and answering"
      : listening
        ? voiceCommandsPaused
          ? "Voice commands paused"
          : "Listening"
        : "Voice is off";
  const latestGuideReply = [...guideMessages].reverse().find((entry) => entry.role === "assistant");

  function closeCommands() {
    setTyping(false);
    typedToggleRef.current?.focus();
  }

  function toggleVoiceFromOrb() {
    if (listening || liveConnected) {
      if (voiceCommandsPaused) {
        setVoiceCommandsPaused(false);
        setVoiceStatus("Voice guide is listening");
      } else {
        setVoiceCommandsPaused(true);
        setVoiceStatus("Voice commands are paused. Say ‘resume listening’ to continue.");
      }
      return;
    }
    primeBrowserNarration();
    autoVoiceRequestedRef.current = true;
    startAlwaysOnVoice();
  }

  // The same dock, orb, and typed-command panel as Chess (src/components/PlayByVoice/CompanionDock.tsx).
  const voiceDock = (
    <footer
      className={`companion-dock ww-companion-dock${voiceActive ? " voice-connected" : ""}`}
      aria-label="Voice companion"
    >
      <div className="companion-orb-row">
        <button
          type="button"
          className="orb-button"
          aria-label={
            listening || liveConnected
              ? voiceCommandsPaused
                ? "Resume voice commands"
                : "Pause voice commands"
              : liveConnecting
                ? voiceDockStatus
                : "Start voice companion"
          }
          disabled={liveConnecting}
          onClick={toggleVoiceFromOrb}
        >
          <LiquidOrb tone="amber" />
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {voiceDockStatus}
          </span>
        </button>
      </div>
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
                    ? "Try investigate Camille, or help"
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
  const screenKey = !viewGame
    ? stage
    : [
        viewGame.id,
        introView === "role-details" ? "role" : (introView ?? ""),
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

  function requestHome() {
    if (
      session &&
      session.game.phase !== "over" &&
      !window.confirm("Leave this Loups-Garous match? You cannot resume it from Games.")
    )
      return;
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
          Play by Voice
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
          <button className="plain-button" type="button" onClick={storyAudio.repeatLast}>
            Repeat
          </button>
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
        Voice: {voiceStatus}
        {voiceTranscript ? ` You said: “${voiceTranscript}”.` : ""}
      </p>
      <p>
        {session
          ? "Say or type “choose Camille”, “continue”, “describe the interface”, “read my role”, “read all messages”, “ask the villagers what they think”, “vote for Camille”, or “voice help”."
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
            <form className="ww-village-setup" onSubmit={create}>
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
                  <span>Start game</span>
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
            {game.phase === "over" && player.revealedRole && (
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
          <button className="ww-pill is-primary" type="button" onClick={() => setIntroStep("role")}>
            Continue
          </button>
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
                  {me.lover && <li>You are bound to {me.lover}.</li>}
                </ul>
                <h3>Your Goal</h3>
                <p>{card.goal}</p>
              </div>
              <button
                className="ww-pill is-dark"
                type="button"
                onClick={() => flipRoleCard("role")}
              >
                Back to role
              </button>
            </article>
          </div>
        </div>
        <button
          className="ww-pill is-primary"
          type="button"
          disabled={interactionLocked}
          onClick={() => {
            if (game.phase === "prologue") void act("begin-story");
            else setIntroStep(null);
          }}
        >
          I’m ready
        </button>
      </>
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
        {playerCards()}
        {game.lastVotes && (
          <details className="ww-final-votes">
            <summary>Final votes</summary>
            {game.lastVotes.map((vote, index) => (
              <p key={index}>
                {game.players.find((player) => player.id === vote.voter)?.name} voted for{" "}
                {game.players.find((player) => player.id === vote.target)?.name}
              </p>
            ))}
          </details>
        )}
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
          (me.role === "seer" ||
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
        className={`ww-stage${introView ? " ww-intro" : " ww-phase"}`}
        aria-labelledby="ww-heading"
      >
        {game.testMode && <p className="ww-test-banner">Quick test · You are the Seer</p>}
        <p className="sr-only">
          Day {game.day} · {phaseNames[game.phase]}
        </p>
        {stageContent}
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
