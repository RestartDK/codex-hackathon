import { useEffect, useRef, useState } from "react";
import type { Move } from "chess.js";
import { createChessToolExecutor, type ChessToolBridge } from "./chessTools";
import { localIntent, formatToolReply, QUICK_GUIDE } from "./commands";
import { useVoiceCompanion } from "./useVoiceCompanion";
import { PLAYABLE_GAMES_LABEL, type AvailableDestination } from "./navigation";

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
    return "You are in Settings. You can adjust narrator volume, game sounds, and chess preferences. Say play chess to return to the board, or home for the game picker.";
  if (bridge.view === "help")
    return "You are in Help. Say play chess to begin, or ask me about chess rules and voice commands.";
  if (bridge.view === "loading") return "Chess is loading. You can return to the game picker.";
  if (bridge.view === "chess-setup")
    return "Chess setup is open. Choose each preference, or say start with the defaults.";
  if (bridge.awaitingStartChoice)
    return `Welcome back. A saved chess game with ${bridge.history.length} moves is waiting. Say resume or new game.`;
  if (bridge.isTerminated)
    return "Your last game has finished. You can review the moves or ask to start a new game.";
  if (bridge.isPaused) return "Your chess game is paused. Say resume to continue.";
  return "Welcome to Chess. Say your move to play it immediately, ask for a hint, or say quick guide to hear the rules.";
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const previousVoiceStatus = useRef(voice.status);
  const previousHistoryLength = useRef(bridge.history.length);
  const previousResult = useRef(resultMessage);

  useEffect(() => {
    if (voice.status === "connecting") window.speechSynthesis?.cancel();
  }, [voice.status]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  useEffect(() => {
    if (voice.status === "connected" && previousVoiceStatus.current !== "connected") {
      const greeting = welcome(bridgeRef.current);
      setMessage(greeting);
    }
    previousVoiceStatus.current = voice.status;
  }, [voice.status]);

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

  async function runTool(name: string, args: Record<string, unknown>) {
    setBusy(true);
    try {
      if (name === "voice_control") {
        const message = voice.runVoiceControl(args.action);
        setMessage(message);
        if (voice.status === "connected") voice.announce(message);
        return;
      }
      const raw = await executor.execute(name, JSON.stringify(args));
      const result = JSON.parse(raw) as { status?: string };
      // The history effect announces the complete move, including captures.
      // A short SAN acknowledgement must not replace that authoritative update.
      if (
        result.status === "completed" &&
        ["make_move", "play_best_move", "promote_pawn"].includes(name)
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

  function announce(message: string) {
    setMessage(message);
    if (voice.status === "connected") voice.announce(message);
  }

  async function runCommand(command: string) {
    if (/^start (with )?(the )?defaults?$/i.test(command.trim())) {
      if (bridgeRef.current.view !== "chess-setup") {
        announce("Open Chess setup first, then say start with the defaults.");
        return;
      }
      await runTool("chess_setup", { action: "defaults", value: null });
      return;
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
