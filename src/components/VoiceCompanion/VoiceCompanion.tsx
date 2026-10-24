import { useEffect, useRef, useState } from 'react';
import type { Color, Move } from 'chess.js';
import { Mic, MicOff, Square, Volume2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { createChessToolExecutor, type ChessToolBridge } from '../../voice/chessTools';
import { useVoiceCompanion } from '../../voice/useVoiceCompanion';

interface VoiceCompanionProps extends ChessToolBridge {
  confirmMoves: boolean;
  screenReaderMode: boolean;
  onPlayerColorChange: (color: Color) => void;
  onConfirmMovesChange: (enabled: boolean) => void;
  onScreenReaderModeChange: (enabled: boolean) => void;
}

function localIntent(command: string): { name: string; args: object } | null {
  const normalized = command.trim().toLowerCase().replace(/[,.?]/g, '');
  if (/\bboard\b/.test(normalized) && /\b(config(?:uration)?s?|positions?|layout|describe|read)\b/.test(normalized)) return { name: 'read_board', args: { scope: 'all', value: null } };
  if (/^(yes|confirm|play it|do it)$/.test(normalized)) return { name: 'confirm_action', args: {} };
  if (/^(no|cancel|never mind|nevermind)$/.test(normalized)) return { name: 'cancel_action', args: {} };
  if (/^(status|position|what is happening|whats happening)$/.test(normalized)) return { name: 'get_position', args: {} };
  if (/^(board|board config|board configuration|describe (?:the )?board|(?:give|tell) me (?:the )?(?:board config|board configuration|configuration of (?:the )?board))$/.test(normalized)) return { name: 'read_board', args: { scope: 'all', value: null } };
  if (/^(history|recent moves|last moves)$/.test(normalized)) return { name: 'get_history', args: { count: 6 } };
  if (/^(hint|give me a hint|suggest a move)$/.test(normalized)) return { name: 'get_hint', args: {} };
  if (/^(choose a move|choose a move for me|play for me)$/.test(normalized)) return { name: 'propose_best_move', args: {} };
  const square = normalized.match(/(?:what(?: is|'s) on |inspect )?([a-h][1-8])$/);
  if (square && /what|inspect/.test(normalized)) return { name: 'inspect_square', args: { square: square[1] } };
  const move = normalized.match(/(?:move )?([a-h][1-8])\s+(?:to\s+)?([a-h][1-8])(?:\s+(queen|rook|bishop|knight))?$/);
  if (move) return { name: 'propose_move', args: { from: move[1], to: move[2], piece: null, promotion: move[3] ?? null } };
  const legal = normalized.match(/(?:legal moves|moves from)\s+([a-h][1-8])$/);
  if (legal) return { name: 'get_legal_moves', args: { from: legal[1] } };
  return null;
}

const QUICK_GUIDE = `Here is the quick guide. Your goal is to checkmate the opposing king. The board files are letters a through h, and ranks are numbers one through eight. Pawns move forward and capture diagonally. Knights move in an L shape. Bishops move diagonally, rooks move straight, queens move straight or diagonally, and kings move one square at a time. You can say a move such as e two to e four, ask what is on a square, ask where your pieces are, request legal moves, ask what the computer played, or ask for a hint. A move you directly order plays immediately. If you ask me to choose or suggest a move for you, I will ask for confirmation before playing it. You can interrupt me at any time or ask for more detail about a rule.`;

const DASHBOARD_OVERVIEW = 'The dashboard has voice controls and a typed-command fallback at the top, an accessible chessboard, player and game status, move history, new game, undo and resign controls, and settings for color, difficulty, board appearance, confirmations, sounds, and screen-reader narration.';

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const;

export function narrateMove(move: Move, game: ChessToolBridge['game'], playerColor: Color): string {
  const color = move.color === 'w' ? 'White' : 'Black';
  const owner = move.color === playerColor ? 'You moved' : 'The computer moved';
  let action: string;
  if (move.flags.includes('k')) action = `${owner} by castling the ${color} king kingside`;
  else if (move.flags.includes('q')) action = `${owner} by castling the ${color} king queenside`;
  else {
    action = `${owner} the ${color} ${PIECE_NAMES[move.piece]} from ${move.from} to ${move.to}`;
    if (move.captured) {
      const capturedColor = move.color === 'w' ? 'Black' : 'White';
      const captureSquare = move.flags.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to;
      action += `, capturing the ${capturedColor} ${PIECE_NAMES[move.captured]} on ${captureSquare}`;
      if ((move.color === 'w' ? 'b' : 'w') === playerColor) {
        action += `. You lost your ${capturedColor} ${PIECE_NAMES[move.captured]}`;
      } else {
        action += `. The computer lost its ${capturedColor} ${PIECE_NAMES[move.captured]}`;
      }
    }
    if (move.promotion) action += `, promoting to ${PIECE_NAMES[move.promotion]}`;
  }
  if (game.isCheckmate()) return `${action}. Checkmate. ${color} wins.`;
  if (game.isStalemate()) return `${action}. Stalemate. The game is a draw.`;
  if (game.isDraw()) return `${action}. The game is a draw.`;
  if (game.isCheck()) action += '. Check';
  const nextColor = game.turn() === 'w' ? 'White' : 'Black';
  const nextOwner = game.turn() === playerColor ? 'Your turn' : "The computer's turn";
  return `${action}. ${nextOwner}, playing ${nextColor}.`;
}

export default function VoiceCompanion(props: VoiceCompanionProps) {
  const [, refreshPending] = useState(0);
  const bridgeRef = useRef<ChessToolBridge>(props);
  bridgeRef.current = props;
  const executorRef = useRef<ReturnType<typeof createChessToolExecutor> | null>(null);
  if (!executorRef.current) {
    executorRef.current = createChessToolExecutor(
      () => bridgeRef.current,
      () => refreshPending((version) => version + 1),
    );
  }
  const executor = executorRef.current;
  const voice = useVoiceCompanion(executor, props.screenReaderMode);
  const [typedCommand, setTypedCommand] = useState('');
  const [localResponse, setLocalResponse] = useState('Ready.');
  const [requestedColor, setRequestedColor] = useState<Color | null>(null);
  const lastHistoryLength = useRef(props.history.length);
  const previousVoiceStatus = useRef(voice.status);

  useEffect(() => {
    if (voice.status === 'connected' && previousVoiceStatus.current !== 'connected') {
      const color = props.playerColor === 'w' ? 'White' : 'Black';
      const nextQuestion = props.awaitingStartChoice
        ? `A saved game with ${props.history.length} moves is loaded. Would you like to resume it or start a new game?`
        : props.isTerminated
          ? 'The previous game is finished. You can review its moves or start a new game.'
          : 'Make a move when ready. Ask for help or board configuration anytime.';
      const welcome = `Welcome to chess. You are ${color}. ${nextQuestion}`;
      setLocalResponse(welcome);
      voice.announce(welcome);
    }
    previousVoiceStatus.current = voice.status;
  }, [props.awaitingStartChoice, props.history.length, props.playerColor, voice.announce, voice.status]);

  useEffect(() => {
    if (props.history.length <= lastHistoryLength.current) {
      lastHistoryLength.current = props.history.length;
      return;
    }
    lastHistoryLength.current = props.history.length;
    const move = props.game.history({ verbose: true }).at(-1);
    if (!move) return;
    const event = narrateMove(move, props.game, props.playerColor);
    setLocalResponse(event);
    if (voice.status === 'connected') voice.announce(event);
  }, [props.game, props.history.length, props.playerColor, voice.status, voice.announce]);

  async function runTypedCommand() {
    const normalized = typedCommand.trim().toLowerCase();
    if (/^(tutorial|guide|quick guide|how to play)$/.test(normalized)) {
      hearQuickGuide();
      setTypedCommand('');
      return;
    }
    if (/^(skip tutorial|skip introduction|i know how to play)$/.test(normalized)) {
      skipIntroduction();
      setTypedCommand('');
      return;
    }
    const intent = localIntent(typedCommand);
    if (!intent) {
      setLocalResponse('Try “e2 to e4”, “status”, “what is on e4”, “legal moves e2”, “yes”, or “cancel”.');
      return;
    }
    const response = await executor.execute(intent.name, JSON.stringify(intent.args));
    const parsed = JSON.parse(response) as { message?: string; description?: string; [key: string]: unknown };
    setLocalResponse(parsed.message ?? parsed.description ?? JSON.stringify(parsed));
    if (voice.status === 'connected' && intent.name === 'read_board' && parsed.message) voice.announce(parsed.message);
    setTypedCommand('');
  }

  function hearQuickGuide() {
    setLocalResponse(QUICK_GUIDE);
    if (voice.status === 'connected') voice.announce(QUICK_GUIDE);
  }

  function skipIntroduction() {
    const message = 'Introduction skipped. Ask for the quick guide at any time. You can make a move or ask about the position.';
    setLocalResponse(message);
    if (voice.status === 'connected') voice.announce(message);
  }

  async function resumeSavedGame() {
    const response = JSON.parse(await executor.execute('propose_game_control', JSON.stringify({ action: 'resume' }))) as { message?: string };
    const message = response.message ?? 'The saved game is resumed. Would you like the quick guide?';
    setLocalResponse(message);
    if (voice.status === 'connected') voice.announce(message);
  }

  async function requestNewGame() {
    const response = JSON.parse(await executor.execute('propose_game_control', JSON.stringify({ action: 'new_game' }))) as { description?: string; message?: string };
    setLocalResponse(response.description ?? response.message ?? 'Confirm starting a new game.');
  }

  const pending = executor.getPending();
  return (
    <Card className="voice-companion" aria-labelledby="voice-companion-heading">
      <div className="voice-heading-row">
        <div>
          <p className="voice-eyebrow">Conversational game controls</p>
          <h2 id="voice-companion-heading">Voice companion</h2>
          <p className="voice-status">{voice.status === 'connected' ? 'Listening' : voice.status === 'connecting' ? 'Connecting…' : voice.status === 'closing' ? 'Ending voice…' : voice.status === 'error' ? 'Voice unavailable' : 'Voice is off'}</p>
        </div>
        {voice.status !== 'connected' ? (
          <Button onClick={voice.start} disabled={voice.status === 'connecting' || voice.status === 'closing'} aria-describedby="dashboard-overview" autoFocus>
            <Mic aria-hidden="true" size={20} /> Start voice companion
          </Button>
        ) : (
          <div className="voice-actions">
            <Button onClick={voice.toggleMicrophone} className="secondary-button">
              {voice.microphoneMuted ? <MicOff aria-hidden="true" size={20} /> : <Mic aria-hidden="true" size={20} />}
              {voice.microphoneMuted ? 'Unmute' : 'Mute'} microphone
            </Button>
            <Button onClick={voice.stop} className="danger-button"><Square aria-hidden="true" size={18} /> End voice</Button>
          </div>
        )}
      </div>

      <p className="voice-help">Try: “Move my pawn from e2 to e4”, “What is on d5?”, “Where are my knights?”, or “What did the computer play?”</p>
      <p id="dashboard-overview" className="dashboard-overview">{DASHBOARD_OVERVIEW}</p>
      {props.awaitingStartChoice && (
        <div className="resume-choice" role="group" aria-label="Saved game choice">
          <p>A saved game with {props.history.length} moves is loaded.</p>
          <Button type="button" onClick={() => void resumeSavedGame()}>Resume saved game</Button>
          <Button type="button" className="secondary-button" onClick={() => void requestNewGame()}>Start a new game</Button>
        </div>
      )}
      <div className="voice-onboarding" role="group" aria-label="Chess introduction">
        <p>New to chess or voice controls?</p>
        <Button type="button" onClick={hearQuickGuide}>Hear the quick guide</Button>
        <Button type="button" className="secondary-button" onClick={skipIntroduction}>Skip introduction</Button>
      </div>
      {voice.error && <p role="alert" className="voice-error">{voice.error}</p>}
      {voice.caption && <p className="voice-caption"><strong>Caption:</strong> {voice.caption}</p>}

      <form className="typed-command" onSubmit={(event) => { event.preventDefault(); void runTypedCommand(); }}>
        <label htmlFor="typed-command">Typed command fallback</label>
        <div>
          <input id="typed-command" value={typedCommand} onChange={(event) => setTypedCommand(event.target.value)} placeholder="e2 to e4" />
          <Button type="submit">Run command</Button>
        </div>
      </form>

      {pending && (
        <div className="pending-action" role="group" aria-label="Move confirmation">
          <p>{pending.description}. Confirm?</p>
          <Button onClick={async () => setLocalResponse(JSON.parse(await executor.execute('confirm_action', '{}')).message ?? 'Completed.')}>Confirm</Button>
          <Button className="secondary-button" onClick={async () => { await executor.execute('cancel_action', '{}'); setLocalResponse('Cancelled.'); }}>Cancel</Button>
        </div>
      )}

      <div className="voice-preferences">
        <label>Play as <select value={props.playerColor} onChange={(event) => setRequestedColor(event.target.value as Color)}><option value="w">White</option><option value="b">Black</option></select></label>
        <label><input type="checkbox" checked={props.confirmMoves} onChange={(event) => props.onConfirmMovesChange(event.target.checked)} /> Confirm suggested moves</label>
        <label><input type="checkbox" checked={props.screenReaderMode} onChange={(event) => props.onScreenReaderModeChange(event.target.checked)} /> Screen-reader narration</label>
      </div>

      {requestedColor && requestedColor !== props.playerColor && (
        <div className="pending-action" role="group" aria-label="Color change confirmation">
          <p>Changing color starts a new game. Play as {requestedColor === 'w' ? 'White' : 'Black'}?</p>
          <Button type="button" onClick={() => { props.onPlayerColorChange(requestedColor); setRequestedColor(null); }}>Confirm color change</Button>
          <Button type="button" className="secondary-button" onClick={() => setRequestedColor(null)}>Cancel</Button>
        </div>
      )}

      <p className="sr-announcement" aria-live={props.screenReaderMode ? 'polite' : 'off'} aria-atomic="true"><Volume2 aria-hidden="true" size={18} /> {localResponse}</p>
    </Card>
  );
}
