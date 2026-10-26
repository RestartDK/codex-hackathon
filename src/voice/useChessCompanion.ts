import { useCallback, useEffect, useRef, useState } from "react";
import type { Move } from "chess.js";
import { createChessToolExecutor, type ChessToolBridge } from "./chessTools";
import { localIntent, formatToolReply, QUICK_GUIDE } from "./commands";
import { useVoiceCompanion } from "./useVoiceCompanion";
import { PLAYABLE_GAMES_LABEL, type AvailableDestination } from "./navigation";
import { GuidanceTracker, parseGuidanceCommand } from "./guidance";

const PIECES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

function narrateMove(
  move: Move,
  game: ChessToolBridge["game"],
  playerColor: ChessToolBridge["playerColor"],
): string {
  const color = move.color === "w" ? "White" : "Black";
  let action = move.flags.includes("k")
    ? `${color} castles kingside`
    : move.flags.includes("q")
      ? `${color} castles queenside`
      : `${color} ${PIECES[move.piece]} from ${move.from} to ${move.to}`;
  if (move.captured)
    action += `, capturing ${move.color !== playerColor ? "your" : "the opponent's"} ${PIECES[move.captured]}`;
  if (move.promotion) action += `, promoting to ${PIECES[move.promotion]}`;
  if (game.isCheckmate()) return `${action}. Checkmate. ${color} wins.`;
  if (game.isDraw()) return `${action}. The game is a draw.`;
  return `${action}.${game.isCheck() ? " Check." : ""} ${game.turn() === "w" ? "White" : "Black"} to move.`;
}

function welcome(bridge: ChessToolBridge): string {
  if (bridge.view === "home")
    return `Welcome to Playora. ${PLAYABLE_GAMES_LABEL} are ready to play. Say a game name, or ask for help.`;
  if (bridge.view === "audio")
    return "You are in Audio Settings. You can adjust narrator volume, game sounds, and chess preferences. Say play chess to return to the board, or home for the game picker.";
  if (bridge.view === "help")
    return "You are in Help. Say play chess to begin, or ask me about chess rules and voice commands.";
  if (bridge.view === "loading") return "Chess is loading. You can return to the game picker.";
  if (bridge.view === "chess-setup") return bridge.setupGuidance?.message ?? "";
  if (bridge.awaitingStartChoice)
    return `Welcome back. A saved chess game with ${bridge.history.length} moves is waiting. Say resume or new game.`;
  if (bridge.isTerminated)
    return "Your last game has finished. You can review the moves or ask to start a new game.";
  if (bridge.isPaused) return "Your chess game is paused. Say resume to continue.";
  return `Chess is ready. You play ${bridge.playerColor === "w" ? "White" : "Black"}. ${bridge.game.turn() === "w" ? "White" : "Black"} to move. Say a move such as e two to e four, or ask for a hint, board description, undo, pause, or help.`;
}

export function useChessCompanion(
  bridge: ChessToolBridge,
  screenReaderMode: boolean,
  volume: number,
  resultMessage: string | null,
) {
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const [executor] = useState(() => createChessToolExecutor(() => bridgeRef.current));
  const voice = useVoiceCompanion(executor, screenReaderMode, volume, bridge.view);
  const [message, setMessage] = useState(
    "Choose a game, or start voice to talk to your companion.",
  );
  const [busy, setBusy] = useState(false);
  const guidanceTracker = useRef(new GuidanceTracker());
  const previousHistoryLength = useRef(bridge.history.length);
  const previousResult = useRef(resultMessage);

  useEffect(() => {
    if (voice.status === "connecting") window.speechSynthesis?.cancel();
  }, [voice.status]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  useEffect(() => {
    const setup = bridge.setupGuidance;
    const key = `${bridge.view}:${bridge.awaitingStartChoice ? "saved" : "fresh"}:${setup?.key ?? "screen"}`;
    if (voice.status === "connected") {
      const currentMessage = welcome(bridgeRef.current);
      if (!currentMessage) return;
      const greeting = guidanceTracker.current.take({
        key,
        message: currentMessage,
        location: bridge.view,
        capabilities: "Ask what can I do for available actions.",
      });
      if (!greeting) return;
      setMessage(greeting);
      voice.announce(greeting);
    }
  }, [bridge.awaitingStartChoice, bridge.setupGuidance, bridge.view, voice.announce, voice.status]);

  useEffect(() => {
    if (
      bridge.view !== "home" &&
      !bridge.awaitingStartChoice &&
      bridge.history.length > previousHistoryLength.current
    ) {
      const move = bridge.game.history({ verbose: true }).at(-1);
      if (move) {
        const narration = narrateMove(move, bridge.game, bridge.playerColor);
        if (bridge.game.isGameOver()) previousResult.current = resultMessage;
        setMessage(narration);
        if (voice.status === "connected") voice.announce(narration);
      }
    }
    previousHistoryLength.current = bridge.history.length;
  }, [
    bridge.game,
    bridge.history.length,
    bridge.view,
    bridge.awaitingStartChoice,
    voice.status,
    voice.announce,
    resultMessage,
  ]);

  useEffect(() => {
    if (resultMessage && resultMessage !== previousResult.current) {
      setMessage(resultMessage);
      if (voice.status === "connected") voice.announce(resultMessage);
    }
    previousResult.current = resultMessage;
  }, [resultMessage, voice.status, voice.announce]);

  async function runTool(name: string, args: object) {
    setBusy(true);
    try {
      const raw = await executor.execute(name, JSON.stringify(args));
      const result = JSON.parse(raw) as { status?: string };
      // The history effect announces the complete move, including captures.
      // A short SAN acknowledgement must not replace that authoritative update.
      if (
        result.status === "completed" &&
        ["make_move", "play_best_move", "promote_pawn", "configure_chess_setup"].includes(name)
      )
        return;
      const reply = formatToolReply(raw);
      setMessage(reply);
      if (voice.status === "connected") voice.announce(reply);
    } catch {
      setMessage("That request could not finish. Your game is safe. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function guide() {
    setMessage(QUICK_GUIDE);
    if (voice.status === "connected") voice.announce(QUICK_GUIDE);
    else if ("speechSynthesis" in window && !screenReaderMode) {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(QUICK_GUIDE);
      speech.lang = "en-US";
      speech.volume = volume / 100;
      window.speechSynthesis.speak(speech);
    }
  }

  const announce = useCallback(
    (message: string) => {
      setMessage(message);
      if (voice.status === "connected") voice.announce(message);
    },
    [voice.announce, voice.status],
  );

  async function runCommand(command: string) {
    const guidanceCommand = parseGuidanceCommand(command);
    if (guidanceCommand === "repeat") {
      announce(message);
      return;
    }
    if (guidanceCommand === "location") {
      announce(
        `You are in ${bridgeRef.current.view === "chess-setup" ? "Chess setup" : bridgeRef.current.view}. ${message}`,
      );
      return;
    }
    if (guidanceCommand === "capabilities") {
      announce(
        bridgeRef.current.view === "chess-setup"
          ? `${message} You can also say go back, use the defaults, or start the game.`
          : "You can ask for the current position, legal moves, move history, a hint, help, or navigation to any available game.",
      );
      return;
    }
    if (guidanceCommand === "explain") {
      guide();
      return;
    }
    if (guidanceCommand === "defaults") {
      if (bridgeRef.current.view !== "chess-setup") {
        announce("Open Chess setup first, then say start with the defaults.");
        return;
      }
      await runTool("configure_chess_setup", { action: "defaults" });
      return;
    }
    if (bridgeRef.current.view === "chess-setup") {
      const value = command.trim().toLowerCase();
      if (guidanceCommand === "start" || /^(yes)$/.test(value))
        return await runTool("configure_chess_setup", { action: "start" });
      if (guidanceCommand === "back")
        return await runTool("configure_chess_setup", { action: "back" });
      if (/\b(beginner|easy)\b/.test(value))
        return await runTool("configure_chess_setup", { difficulty: "beginner" });
      if (/\b(intermediate|casual)\b/.test(value))
        return await runTool("configure_chess_setup", { difficulty: "casual" });
      if (/\b(advanced|club)\b/.test(value))
        return await runTool("configure_chess_setup", { difficulty: "club" });
      if (/\bwhite\b/.test(value)) return await runTool("configure_chess_setup", { color: "w" });
      if (/\bblack\b/.test(value)) return await runTool("configure_chess_setup", { color: "b" });
      if (/\brandom\b/.test(value))
        return await runTool("configure_chess_setup", { color: "random" });
      if (/timer off|no timer/.test(value))
        return await runTool("configure_chess_setup", { timer: "off" });
      if (/rules? (on|yes)|explain rules/.test(value))
        return await runTool("configure_chess_setup", { rules: true });
      if (/rules? (off|no)|skip rules/.test(value))
        return await runTool("configure_chess_setup", { rules: false });
    }
    if (/^(tutorial|guide|quick guide|how to play)$/i.test(command.trim())) {
      guide();
      return;
    }
    const intent = localIntent(command);
    if (!intent) {
      setMessage(
        "Try play chess, e2 to e4, what is on e4, hint, resume, undo, new game, or help. Commands run immediately. Live voice understands more natural language.",
      );
      return;
    }
    await runTool(intent.name, intent.args);
  }

  return {
    voice,
    message,
    busy,
    guide,
    announce,
    runCommand,
    runTool,
    navigate: (destination: AvailableDestination) => runTool("navigate_app", { destination }),
    cancelRequests: executor.cancelRequests,
  };
}

export type ChessCompanion = ReturnType<typeof useChessCompanion>;
