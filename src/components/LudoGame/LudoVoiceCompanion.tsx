import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { createLudoToolExecutor, type LudoToolBridge } from "../../games/ludo/ludoTools";
import { useLibraryVoice } from "../../voice/useLibraryVoice";

interface Props extends LudoToolBridge {
  screenReaderMode: boolean;
  status: string;
  onNarrationBusyChange: (busy: boolean) => void;
}

function localIntent(command: string): { name: string; args: object } | null {
  const value = command.trim().toLowerCase().replace(/[,.?]/g, "");
  if (
    /\bboard\b/.test(value) &&
    /\b(config(?:uration)?s?|positions?|layout|describe|read)\b/.test(value)
  )
    return { name: "get_position", args: {} };
  if (/^(resume|resume game|resume saved game)$/.test(value))
    return { name: "propose_game_control", args: { action: "resume" } };
  if (/^(pause|pause game)$/.test(value))
    return { name: "propose_game_control", args: { action: "pause" } };
  if (/^(new game|start a new game)$/.test(value))
    return { name: "propose_game_control", args: { action: "new_game" } };
  if (/^(yes|confirm|play it|do it)$/.test(value)) return { name: "confirm_action", args: {} };
  if (/^(no|cancel|never mind|nevermind)$/.test(value)) return { name: "cancel_action", args: {} };
  if (/^(roll|roll the die|roll dice)$/.test(value)) return { name: "roll_dice", args: {} };
  if (/^(continue|continue turn|go on)$/.test(value)) return { name: "continue_turn", args: {} };
  if (/^(correct|correct my last move|change that)$/.test(value))
    return { name: "correct_last_move", args: {} };
  if (
    /^(status|position|board|board config|board configuration|describe (?:the )?board|(?:give|tell) me (?:the )?(?:board config|board configuration|configuration of (?:the )?board)|what is happening|whats happening)$/.test(
      value,
    )
  )
    return { name: "get_position", args: {} };
  if (/^(choose a token for me|suggest a token|suggest a move|play for me)$/.test(value))
    return { name: "propose_best_token_move", args: {} };
  if (/^(where are my tokens|my tokens|tokens)$/.test(value))
    return { name: "get_tokens", args: { owner: "human" } };
  if (
    /^(where are (?:the )?(?:computer|opponent)(?:s|'s)? tokens|computer tokens|opponent tokens)$/.test(
      value,
    )
  )
    return { name: "get_tokens", args: { owner: "computer" } };
  const token = value.match(/(?:move|choose|select) (?:my )?token (one|two|three|four|[1-4])/);
  if (token) {
    const id =
      ({ one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[token[1]] ??
      Number(token[1]);
    return { name: "propose_token_move", args: { tokenId: id } };
  }
  return null;
}

const GUIDE =
  "Say roll, then move token one, two, three, or four. Your choice plays immediately. A six brings a token out of base. Safe squares prevent captures. Reach home exactly with all four tokens to win. A six, capture, or finishing gives another roll; three sixes end your turn. The computer plays automatically. Say correct before the next roll to change your choice, board configuration to hear positions, or pause to take your time.";

export default function LudoVoiceCompanion(props: Props) {
  const [, refreshPending] = useState(0);
  const bridgeRef = useRef<LudoToolBridge>(props);
  bridgeRef.current = props;
  const executorRef = useRef<ReturnType<typeof createLudoToolExecutor> | null>(null);
  if (!executorRef.current)
    executorRef.current = createLudoToolExecutor(
      () => bridgeRef.current,
      () => refreshPending((v) => v + 1),
    );
  const executor = executorRef.current;
  const { voice, runGlobalCommand } = useLibraryVoice(executor, "ludo");
  useEffect(() => {
    props.onNarrationBusyChange(voice.status === "connected" && voice.isSpeaking);
  }, [props.onNarrationBusyChange, voice.isSpeaking, voice.status]);
  const [typedCommand, setTypedCommand] = useState("");
  const [response, setResponse] = useState("Ready. Say roll to begin.");
  const previousVoiceStatus = useRef(voice.status);
  const lastAnnouncedRevision = useRef(props.state.revision);

  useEffect(() => {
    if (voice.status === "connected" && previousVoiceStatus.current !== "connected") {
      const welcome = props.awaitingStartChoice
        ? "Welcome back. Resume your saved game or start a new one?"
        : "Welcome to Ludo. You are red. Say roll to begin. Ask for help or board configuration anytime.";
      setResponse(welcome);
      voice.announce(welcome);
    }
    previousVoiceStatus.current = voice.status;
  }, [props.awaitingStartChoice, voice.announce, voice.status]);

  useEffect(() => {
    if (props.state.revision === lastAnnouncedRevision.current) return;
    lastAnnouncedRevision.current = props.state.revision;
    setResponse(props.status);
    if (voice.status === "connected") voice.announce(props.status);
  }, [props.state.revision, props.status, voice.announce, voice.status]);

  async function runCommand() {
    const value = typedCommand.trim().toLowerCase();
    const global = await runGlobalCommand(value);
    if (global !== null) {
      setResponse(global);
      setTypedCommand("");
      return;
    }
    if (/^(guide|tutorial|how to play|quick guide|help|rules)$/.test(value)) {
      setResponse(GUIDE);
      if (voice.status === "connected") voice.announce(GUIDE);
      setTypedCommand("");
      return;
    }
    const intent = localIntent(typedCommand);
    if (!intent) {
      setResponse(
        "Try “roll”, “move token 2”, “status”, “where are my tokens”, “continue”, or “correct”.",
      );
      return;
    }
    const parsed = JSON.parse(await executor.execute(intent.name, JSON.stringify(intent.args))) as {
      message?: string;
      description?: string;
      [key: string]: unknown;
    };
    setResponse(parsed.message ?? parsed.description ?? JSON.stringify(parsed));
    if (
      voice.status === "connected" &&
      (intent.name === "get_position" || intent.name === "get_tokens") &&
      parsed.message
    )
      voice.announce(parsed.message);
    setTypedCommand("");
  }

  const pendingFromVoice = executor.getPending();
  const pending =
    pendingFromVoice ??
    (props.pendingToken == null
      ? null
      : { id: "ui-token", description: `Move your token ${props.pendingToken}` });
  return (
    <Card className="voice-companion" aria-labelledby="ludo-voice-heading">
      <div className="voice-heading-row">
        <div>
          <p className="voice-eyebrow">Conversational game controls</p>
          <h2 id="ludo-voice-heading">Voice companion</h2>
          <p className="voice-status">
            {voice.status === "connected"
              ? "Listening"
              : voice.status === "connecting"
                ? "Connecting…"
                : voice.status === "error"
                  ? "Voice unavailable"
                  : "Voice is off"}
          </p>
        </div>
        {voice.status !== "connected" ? (
          <Button onClick={voice.start} disabled={voice.status === "connecting"} autoFocus>
            <Mic aria-hidden="true" size={20} /> Start voice companion
          </Button>
        ) : (
          <div className="voice-actions">
            <Button onClick={voice.toggleMicrophone} className="secondary-button">
              {voice.microphoneMuted ? (
                <MicOff aria-hidden="true" size={20} />
              ) : (
                <Mic aria-hidden="true" size={20} />
              )}
              {voice.microphoneMuted ? "Unmute" : "Mute"} microphone
            </Button>
            <Button onClick={voice.stop} className="danger-button">
              <Square aria-hidden="true" size={18} /> End voice
            </Button>
          </div>
        )}
      </div>
      <p className="voice-help">
        Try: “roll”, “move token 2”, “where are my tokens?”, “continue”, or “correct my last move”.
      </p>
      <p id="ludo-dashboard-overview" className="dashboard-overview">
        The dashboard has voice controls, a typed command fallback, the Ludo board, numbered tokens,
        the die result, turn status, correction, continue, pause, and new game controls.
      </p>
      {props.awaitingStartChoice && (
        <div className="resume-choice" role="group" aria-label="Saved Ludo game choice">
          <p>A saved Ludo game is loaded. Resume it or start a new game?</p>
          <Button
            type="button"
            onClick={async () =>
              setResponse(
                JSON.parse(
                  await executor.execute(
                    "propose_game_control",
                    JSON.stringify({ action: "resume" }),
                  ),
                ).message ?? "The saved game is resumed.",
              )
            }
          >
            Resume saved game
          </Button>
          <Button
            type="button"
            className="secondary-button"
            onClick={async () =>
              setResponse(
                JSON.parse(
                  await executor.execute(
                    "propose_game_control",
                    JSON.stringify({ action: "new_game" }),
                  ),
                ).description ?? "Confirm starting a new game.",
              )
            }
          >
            Start a new game
          </Button>
        </div>
      )}
      <div className="voice-onboarding" role="group" aria-label="Ludo introduction">
        <p>New to Ludo or voice controls?</p>
        <Button
          type="button"
          onClick={() => {
            setResponse(GUIDE);
            if (voice.status === "connected") voice.announce(GUIDE);
          }}
        >
          Hear the quick guide
        </Button>
        <Button
          type="button"
          className="secondary-button"
          onClick={() => setResponse("Introduction skipped. Say roll when you are ready.")}
        >
          Skip introduction
        </Button>
      </div>
      {voice.error && (
        <p role="alert" className="voice-error">
          {voice.error}
        </p>
      )}
      {voice.caption && (
        <p className="voice-caption">
          <strong>Caption:</strong> {voice.caption}
        </p>
      )}
      <form
        className="typed-command"
        onSubmit={(event) => {
          event.preventDefault();
          void runCommand();
        }}
      >
        <label htmlFor="ludo-typed-command">Typed command fallback</label>
        <div>
          <input
            id="ludo-typed-command"
            value={typedCommand}
            onChange={(event) => setTypedCommand(event.target.value)}
            placeholder="roll"
          />
          <Button type="submit">Run command</Button>
        </div>
      </form>
      {pending && (
        <div className="pending-action" role="group" aria-label="Ludo token confirmation">
          <p>{pending.description}. Confirm?</p>
          <Button
            onClick={async () => {
              const result = pendingFromVoice
                ? (JSON.parse(await executor.execute("confirm_action", "{}")) as {
                    message?: string;
                  })
                : props.confirmToken();
              setResponse(result.message ?? "Completed.");
            }}
          >
            Confirm move
          </Button>
          <Button
            className="secondary-button"
            onClick={async () => {
              if (pendingFromVoice) await executor.execute("cancel_action", "{}");
              else props.cancelToken();
              setResponse("Cancelled.");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      <p
        className="sr-announcement"
        aria-live={props.screenReaderMode ? "polite" : "off"}
        aria-atomic="true"
      >
        <Volume2 aria-hidden="true" size={18} /> {response}
      </p>
    </Card>
  );
}
