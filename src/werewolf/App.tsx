import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
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
  const [name, setName] = useState("You");
  const [count, setCount] = useState(8);
  const [tieRule, setTieRule] = useState("no-exile");
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
      liveStartRef.current?.abort();
      liveStartRef.current = null;
      stopLiveVoice();
    };
  }, []);

  async function create(event?: FormEvent, testMode = false) {
    event?.preventDefault();
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
          skipIntro: !testMode && window.localStorage.getItem("loups-story-seen") === "1",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create a game.");
      const game = data as GameView;
      const briefing = openingBriefing(game);
      commitGame(game, data.session);
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

  const voiceDock = (
    <aside
      className={`voice-orb-dock ${listening || liveConnected || liveConnecting ? "is-active" : ""}`}
      aria-live="polite"
      aria-label="Voice companion status"
    >
      <span className="voice-orb" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="voice-dock-copy">
        <strong>Voice companion</strong>
        <small>
          {session
            ? liveConnected
              ? "Listening and answering"
              : listening
                ? voiceCommandsPaused
                  ? "Commands paused — say resume listening"
                  : "Always listening"
                : voiceStatus
            : listening
              ? "Listening — say “start the game”"
              : voiceStatus}
        </small>
      </span>
    </aside>
  );

  if (!session) {
    return (
      <main className="app-shell landing-screen">
        <header className="topbar">
          <a className="wordmark" href="#top" id="top">
            <span>Play by Voice</span>
            <span className="wordmark-divider">·</span>
            <span className="wordmark-game">Loups-Garous</span>
          </a>
          <div className="game-nav">
            <a className="help-link" href="#how-to-play">
              How to play
            </a>
            <button className="text-button" onClick={onShowGamePicker}>
              Games
            </button>
          </div>
        </header>
        <section className="landing-content">
          <p className="overline">A VILLAGE OF SECRETS</p>
          <form onSubmit={create}>
            <article className="game-tile">
              <span className="tile-symbol" aria-hidden="true">
                <i />
              </span>
              <div className="tile-copy">
                <p className="tile-kicker">SOCIAL DEDUCTION</p>
                <h1>Loups-Garous</h1>
                <p>Listen, question, and uncover the Werewolves hiding among the villagers.</p>
              </div>
              <button className="start-button" disabled={busy}>
                {busy ? "Preparing the village…" : "Start the game"}
              </button>
            </article>
            <button
              className="test-button"
              type="button"
              disabled={busy}
              onClick={() => void create(undefined, true)}
            >
              <strong>Try a quick test</strong>
              <span>4 players · Seer role · bot opponents</span>
            </button>
            <p className="voice-entry-status" aria-live="polite">
              Tap anywhere once to allow the browser microphone, then say “start the game” or “start
              a quick test”. Your voice companion stays on for the whole match.
            </p>
            <details className="game-options">
              <summary>Game options</summary>
              <div className="option-fields">
                <label>
                  Your name
                  <input
                    value={name}
                    maxLength={32}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  Village size
                  <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                    {Array.from({ length: 9 }, (_, index) => index + 4).map((size) => (
                      <option key={size} value={size}>
                        {size} players
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tied vote
                  <select value={tieRule} onChange={(event) => setTieRule(event.target.value)}>
                    <option value="no-exile">No one is exiled</option>
                    <option value="random-among-tied">Choose randomly</option>
                  </select>
                </label>
              </div>
            </details>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="moon-note" id="how-to-play">
            <span className="moon-orb" aria-hidden="true" />
            <p>
              <strong>By day, find the truth.</strong>
              <br />
              By night, stay alive. Your village is waiting.
            </p>
          </div>
        </section>
        {voiceDock}
      </main>
    );
  }

  const game = presentedGame ?? session.game;
  const me = game.me;
  const interactionLocked = busy;
  const alive = game.players.filter((player) => player.alive);
  const others = alive.filter((player) => player.id !== me.id);
  const toggleTarget = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const targetButton = (player: PublicPlayerView, multiple = false) => (
    <button
      key={player.id}
      className={`person-choice ${selected.includes(player.id) ? "is-selected" : ""}`}
      onClick={() => (multiple ? toggleTarget(player.id) : setSelected([player.id]))}
      aria-pressed={selected.includes(player.id)}
      disabled={interactionLocked}
    >
      <span className="person-initial">{player.name.slice(0, 1).toUpperCase()}</span>
      {player.name}
    </button>
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
  const hasDiscussion = game.feed.some((entry) => entry.kind === "speech");
  const phaseTitle =
    game.phase === "over"
      ? game.winner === "village"
        ? "The village wins"
        : game.winner === "lovers"
          ? "Love survives"
          : "The werewolves win"
      : game.phase === "night"
        ? "Your turn"
        : game.phase === "prologue"
          ? "Meet the village"
          : game.phase === "day"
            ? hasDiscussion
              ? "Discussion"
              : "The village wakes up"
            : game.phase === "vote"
              ? "Time to vote"
              : game.phase === "cupid"
                ? "Your role"
                : game.phase === "hunter"
                  ? "One last shot"
                  : "The story continues";
  const phaseSubtitle =
    game.phase === "over"
      ? `You survived as ${roleNames[me.role]}.`
      : game.phase === "prologue"
        ? "These are the people you’ll be playing with tonight. Their roles are hidden."
        : game.phase === "night" && me.role === "seer"
          ? "Who do you want to investigate?"
          : game.phase === "night" && me.role === "werewolf"
            ? "Who do you want to choose tonight?"
            : game.phase === "night"
              ? "The village is asleep. Follow your private role instructions."
              : game.phase === "day"
                ? hasDiscussion
                  ? "Ask, accuse, or listen."
                  : "Listen for what changed overnight."
                : game.phase === "vote"
                  ? "Who should leave the village?"
                  : game.phase === "cupid"
                    ? "Learn how your role works before the first night."
                    : "Choose carefully. The village is listening.";
  const latestEvent = [...game.feed].reverse().find((entry) => entry.kind === "event");
  const recentSpeakers = [...game.feed]
    .reverse()
    .filter((entry) => entry.kind === "speech")
    .slice(0, 2)
    .map((entry) => entry.speaker);
  const latestUpdate = latestEvent ?? game.feed.at(-1);
  const situationSummary = game.paused
    ? "The game is paused. Say ‘resume game’ when you want the village to continue."
    : game.phase === "prologue"
      ? "Meet the village before the first night begins. Secret roles stay hidden."
      : game.phase === "night"
        ? "Night actions are private. Follow the ability shown for your role, then wait for dawn."
        : game.phase === "day"
          ? `The discussion is open.${recentSpeakers.length ? ` ${recentSpeakers.join(" and ")} spoke most recently.` : " Invite the villagers to speak."}`
          : game.phase === "vote"
            ? "Voting is open. Your choice is final once cast."
            : (latestEvent?.text ?? "The village is waiting for the next chapter.");

  return (
    <main className={`app-shell play-screen phase-${game.phase}`}>
      <header className="topbar">
        <a className="wordmark" href="#top" id="top">
          <span>Play by Voice</span>
          <span className="wordmark-divider">·</span>
          <span className="wordmark-game">Loups-Garous</span>
        </a>
        <div className="game-nav">
          <a className="help-link" href="#assistant">
            Help
          </a>
          <span>
            Day {game.day} · {phaseNames[game.phase]}
          </span>
          <button
            className="text-button"
            onClick={() => {
              onShowGamePicker();
            }}
          >
            Games
          </button>
          <button className="text-button" onClick={() => setSession(undefined)}>
            New game
          </button>
        </div>
      </header>
      <section className="play-content">
        <div className="round-heading">
          {game.testMode && <p className="test-banner">Quick test · You are the Seer</p>}
          <p className="overline">
            DAY {game.day} · {phaseNames[game.phase].toUpperCase()}
          </p>
          <h1>{phaseTitle}</h1>
          <p className="round-subtitle">{phaseSubtitle}</p>
          {latestUpdate && (
            <p className="latest-update" aria-live="polite" role="status">
              <span>{latestUpdate.kind === "private" ? "PRIVATE UPDATE" : "VILLAGE UPDATE"}</span>
              {latestUpdate.text}
            </p>
          )}
        </div>
        <div className="game-dashboard">
          <section className="village-board">
            <div className="board-heading">
              <h2>The village</h2>
              <span>
                {alive.length} of {game.players.length} remain
              </span>
            </div>
            <div className="village-grid">
              {game.players.map((player) => (
                <article
                  className={`${player.alive ? "village-seat" : "village-seat is-dead"}${storyAudio.activeSpeaker === player.name ? " is-speaking" : ""}`}
                  key={player.id}
                >
                  <span
                    className="seat-avatar"
                    data-portrait={player.profile.voiceKey}
                    aria-label={`${player.name}'s portrait`}
                  >
                    {player.name.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>
                    {player.name}
                    {player.id === me.id ? " · You" : ""}
                  </strong>
                  <small>
                    {player.revealedRole
                      ? roleNames[player.revealedRole]
                      : player.alive
                        ? "In the village"
                        : "Eliminated"}
                  </small>
                </article>
              ))}
            </div>
          </section>
          <aside className="assistant-column">
            <section className="panel history-panel" id="history">
              <div className="panel-heading">
                <h2>Village history</h2>
                <span>{game.feed.length} updates</span>
              </div>
              <div className="history-list">
                {game.feed.slice(-8).map((entry) => (
                  <p
                    className={`${entry.kind === "event" ? "history-event" : ""}${storyAudio.activeSpeaker === entry.speaker ? " is-speaking" : ""}`}
                    key={entry.id}
                  >
                    <span>{entry.speaker}</span>
                    {entry.text}
                  </p>
                ))}
              </div>
              {game.phase === "over" && game.lastVotes && (
                <details className="vote-history">
                  <summary>Final votes</summary>
                  {game.lastVotes.map((vote, index) => (
                    <p key={index}>
                      {game.players.find((player) => player.id === vote.voter)?.name} voted for{" "}
                      {game.players.find((player) => player.id === vote.target)?.name}
                    </p>
                  ))}
                </details>
              )}
            </section>
            <section className="panel assistant-panel" id="assistant">
              <div className="panel-heading">
                <h2>Assistant</h2>
                <span>{game.modelMode === "llm" ? "AI agents" : "Village guide"}</span>
              </div>
              <div className="assistant-snapshot">
                <div className="assistant-tip">
                  <span className="tip-icon">✦</span>
                  <div>
                    <small>Your role</small>
                    <strong>{roleNames[me.role]}</strong>
                    <p>
                      {roleHint}
                      {me.lover ? ` Bound to ${me.lover}.` : ""}
                    </p>
                  </div>
                </div>
                {me.investigations.map((result, index) => (
                  <div className="assistant-tip private-tip" key={index}>
                    <span className="tip-icon">◉</span>
                    <div>
                      <small>Seer’s finding · Day {result.day}</small>
                      <strong>{result.name}</strong>
                      <p>
                        {result.result === "wolf"
                          ? "This player is a Werewolf."
                          : "This player is clear."}
                      </p>
                    </div>
                  </div>
                ))}
                <section className="assistant-tip situation-tip" aria-label="What is happening now">
                  <span className="tip-icon">◌</span>
                  <div>
                    <small>WHAT IS HAPPENING</small>
                    <strong>{phaseNames[game.phase]}</strong>
                    <p>{situationSummary}</p>
                  </div>
                </section>
              </div>
              <section className="guide-chat" aria-label="Game guide">
                <div className="guide-chat-heading">
                  <div>
                    <small>PRIVATE GAME GUIDE</small>
                    <p>Rules, phase help, and strategy for your seat.</p>
                  </div>
                  <div className="guide-chat-actions">
                    <button className="guide-replay" type="button" onClick={replayOpeningBriefing}>
                      Replay briefing
                    </button>
                    <span className="guide-privacy">Private</span>
                  </div>
                </div>
                <div className="guide-messages" aria-live="polite">
                  {guideMessages.slice(-4).map((entry, index) => (
                    <p
                      className={`guide-message is-${entry.role}`}
                      key={`${entry.role}-${index}-${entry.text.slice(0, 18)}`}
                    >
                      <span>{entry.role === "assistant" ? "Guide" : "You"}</span>
                      {entry.text}
                      {entry.role === "assistant" && entry.mode && (
                        <small>{entry.mode === "model" ? "AI" : "Local guide"}</small>
                      )}
                    </p>
                  ))}
                </div>
                <form
                  className="guide-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void askGuide();
                  }}
                >
                  <input
                    value={guideText}
                    onChange={(event) => setGuideText(event.target.value)}
                    maxLength={1000}
                    placeholder="Ask about your role or the phase…"
                    aria-label="Ask the private game guide"
                  />
                  <button
                    className="plain-button"
                    type="submit"
                    disabled={storyAudio.phaseTransitioning || guideBusy || !guideText.trim()}
                  >
                    {guideBusy ? "Thinking…" : "Ask"}
                  </button>
                </form>
              </section>
              <section className="audio-controls" aria-label="Story audio controls">
                <div>
                  <small>STORY AUDIO</small>
                  <p>
                    {storyAudio.activeSpeaker
                      ? `AI voice is reading ${storyAudio.activeSpeaker}`
                      : storyAudio.autoRead
                        ? "AI voice ready for narration and dialogue"
                        : "Automatic reading is off"}
                  </p>
                </div>
                <div className="audio-buttons">
                  <button
                    className="plain-button"
                    type="button"
                    onClick={storyAudio.toggleAutoRead}
                  >
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
              <section className="voice-controls" aria-label="Voice controls">
                <div className="voice-control-heading">
                  <div>
                    <small>VOICE GUIDE</small>
                    <p>{voiceStatus}</p>
                  </div>
                  <span className="voice-auto-chip">
                    {liveConnecting ? "Reconnecting" : "Always listening"}
                  </span>
                </div>
                <p
                  className={`voice-listening ${listening ? "is-listening" : ""}`}
                  aria-live="polite"
                >
                  <span aria-hidden="true" />
                  {liveConnected
                    ? "Live Voice Guide is answering private questions"
                    : listening
                      ? "Listening for game commands, guide questions, and audio controls"
                      : "Microphone permission is needed to resume hands-free play"}
                </p>
                {voiceTranscript && <p className="voice-transcript">You said: {voiceTranscript}</p>}
                <p className="voice-examples">
                  Say “choose Camille”, “continue”, “describe the interface”, “read all messages”,
                  “ask the villagers what they think”, or “vote for Camille”.
                </p>
                <details className="voice-command-reference">
                  <summary>Voice command reference</summary>
                  <p>
                    Information: “describe the interface”, “read my role”, “read the players”, “who
                    is alive”, “read updates”, “read all messages”, or “what did Camille say?”.
                  </p>
                  <p>
                    Controls: “choose Camille”, “continue”, “voice help”, “repeat that”, “stop
                    speaking”, “pause narration”, “speak slower”, “volume up”, “turn auto read on”,
                    “pause game”, or “pause voice control”.
                  </p>
                </details>
                <form
                  className="command-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const typedCommand = commandText;
                    setCommandText("");
                    void handleVoiceCommand(typedCommand);
                  }}
                >
                  <label htmlFor="typed-command">Typed command fallback</label>
                  <div>
                    <input
                      id="typed-command"
                      value={commandText}
                      onChange={(event) => setCommandText(event.target.value)}
                      placeholder={
                        game.phase === "night" && me.role === "seer"
                          ? "Try: investigate Camille"
                          : "Try: hear the villagers"
                      }
                      maxLength={1000}
                    />
                    <button
                      className="plain-button"
                      type="submit"
                      disabled={interactionLocked || !commandText.trim()}
                    >
                      Run command
                    </button>
                  </div>
                </form>
              </section>
              <div className="turn-actions">
                <p className="overline">{game.phase === "over" ? "GAME COMPLETE" : "YOUR TURN"}</p>
                {storyAudio.phaseTransitioning && (
                  <p className="phase-narration-status" aria-live="polite">
                    The guide is setting the scene…
                  </p>
                )}
                {game.paused ? (
                  <div className="paused-game">
                    <strong>The game is paused.</strong>
                    <p>
                      The village will not progress until you say “resume game” or use this button.
                    </p>
                    <button
                      className="action-button"
                      disabled={interactionLocked}
                      onClick={() => void act("resume")}
                    >
                      Resume game
                    </button>
                  </div>
                ) : (
                  <>
                    {game.phase === "prologue" && (
                      <>
                        <div className="story-callouts">
                          <span>Some of them are villagers.</span>
                          <strong>Some may be Werewolves.</strong>
                        </div>
                        <p>
                          Their roles are hidden. Say “introduce the village” whenever you want to
                          hear their character introductions again.
                        </p>
                        <button
                          className="action-button"
                          disabled={interactionLocked}
                          onClick={() => void act("begin-story")}
                        >
                          Continue
                        </button>
                      </>
                    )}
                    {game.phase === "cupid" && me.role === "cupid" && (
                      <>
                        <p>Select two players.</p>
                        <div className="choice-list">
                          {others.map((player) => targetButton(player, true))}
                        </div>
                        <button
                          className="action-button"
                          disabled={interactionLocked || selected.length !== 2}
                          onClick={() =>
                            void act("lovers", { first: selected[0], second: selected[1] })
                          }
                        >
                          Bind their hearts
                        </button>
                      </>
                    )}
                    {game.phase === "night" && me.alive && (
                      <>
                        <p>
                          {me.role === "werewolf"
                            ? "Choose your pack’s target."
                            : me.role === "seer"
                              ? "Choose someone to investigate."
                              : me.role === "witch"
                                ? "Use a potion or let the night pass."
                                : "Rest until morning."}
                        </p>
                        {["werewolf", "seer"].includes(me.role) && (
                          <div className="choice-list">
                            {others
                              .filter(
                                (player) =>
                                  me.role !== "werewolf" || !me.werewolfTeam?.includes(player.name),
                              )
                              .map((player) => targetButton(player))}
                          </div>
                        )}
                        {me.role === "witch" && (
                          <>
                            {me.witchPoisonAvailable && (
                              <div className="choice-list">
                                {others
                                  .filter((player) => player.name !== me.wolfVictim)
                                  .map((player) => targetButton(player))}
                              </div>
                            )}
                            {me.witchHealAvailable && me.wolfVictim && (
                              <label className="save-choice">
                                <input
                                  type="checkbox"
                                  checked={heal}
                                  onChange={(event) => setHeal(event.target.checked)}
                                />{" "}
                                Save {me.wolfVictim}
                              </label>
                            )}
                          </>
                        )}
                        {me.role === "werewolf" && (
                          <button
                            className="plain-button"
                            disabled={interactionLocked}
                            onClick={() => void act("night")}
                          >
                            Let the pack decide
                          </button>
                        )}
                        <button
                          className="action-button"
                          disabled={
                            interactionLocked ||
                            (["werewolf", "seer"].includes(me.role) && selected.length !== 1)
                          }
                          onClick={() =>
                            void act("night", {
                              ...(selected[0] ? { target: selected[0], poison: selected[0] } : {}),
                              heal,
                            })
                          }
                        >
                          {["villager", "hunter", "cupid"].includes(me.role)
                            ? "Wait for dawn"
                            : "Submit action"}
                        </button>
                      </>
                    )}
                    {game.phase === "day" && me.alive && (
                      <>
                        <textarea
                          value={message}
                          maxLength={400}
                          placeholder="Share a thought publicly — villagers will respond…"
                          onChange={(event) => setMessage(event.target.value)}
                          disabled={storyAudio.phaseTransitioning}
                        />
                        <button
                          className="plain-button"
                          disabled={interactionLocked || !message.trim()}
                          onClick={() => void act("speak", { message })}
                        >
                          Speak
                        </button>
                        <button
                          className="plain-button"
                          disabled={interactionLocked}
                          onClick={() => void act("discuss")}
                        >
                          Hear the villagers
                        </button>
                        <button
                          className="action-button"
                          disabled={interactionLocked}
                          onClick={() => void act("begin-vote")}
                        >
                          Begin vote
                        </button>
                      </>
                    )}
                    {game.phase === "vote" && me.alive && (
                      <>
                        <p>Your vote is final.</p>
                        <div className="choice-list">
                          {others.map((player) => targetButton(player))}
                        </div>
                        <button
                          className="action-button"
                          disabled={interactionLocked || selected.length !== 1}
                          onClick={() => void act("vote", { target: selected[0] })}
                        >
                          Cast vote
                        </button>
                      </>
                    )}
                    {game.phase === "hunter" && me.hunterActionPending && (
                      <>
                        <p>Choose someone to take with you.</p>
                        <div className="choice-list">
                          {others.map((player) => targetButton(player))}
                        </div>
                        <button
                          className="action-button"
                          disabled={interactionLocked || selected.length !== 1}
                          onClick={() => void act("hunter-shot", { target: selected[0] })}
                        >
                          Take the shot
                        </button>
                      </>
                    )}
                    {!me.alive && !me.hunterActionPending && game.phase !== "over" && (
                      <>
                        <p>You are out. The village will finish the game.</p>
                        <button
                          className="action-button"
                          disabled={interactionLocked}
                          onClick={() => void act("continue")}
                        >
                          Continue watching
                        </button>
                      </>
                    )}
                    {game.phase === "over" && (
                      <button className="action-button" onClick={() => setSession(undefined)}>
                        Play again
                      </button>
                    )}
                  </>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
        <div className="ambient-orb" aria-hidden="true" />
      </section>
      {voiceDock}
    </main>
  );
}
