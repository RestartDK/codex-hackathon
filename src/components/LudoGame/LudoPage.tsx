import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useSettings } from '../../hooks/useSettings';
import { useLudoGame } from '../../games/ludo/useLudoGame';
import { absoluteSquare, describeToken, isSafeSquare, legalTokenIds, type LudoPlayer } from '../../games/ludo/ludo';
import LudoVoiceCompanion from './LudoVoiceCompanion';

type LudoHook = ReturnType<typeof useLudoGame>;
type Coordinate = readonly [row: number, column: number];

// Clockwise track order, starting at the red player's entry square.
const TRACK: Coordinate[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];
const RED_HOME: Coordinate[] = [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]];
const YELLOW_HOME: Coordinate[] = [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]];
const RED_BASE: Coordinate[] = [[1, 1], [1, 4], [4, 1], [4, 4]];
const YELLOW_BASE: Coordinate[] = [[10, 10], [10, 13], [13, 10], [13, 13]];
const keyOf = ([row, column]: Coordinate) => `${row}-${column}`;
const TRACK_BY_CELL = new Map(TRACK.map((coordinate, square) => [keyOf(coordinate), square]));

function coordinateFor(player: LudoPlayer, progress: number, tokenId: number): Coordinate {
  if (progress === -1) return (player === 'human' ? RED_BASE : YELLOW_BASE)[tokenId - 1];
  if (progress <= 51) return TRACK[absoluteSquare(player, progress)!];
  if (progress <= 56) return (player === 'human' ? RED_HOME : YELLOW_HOME)[progress - 52];
  return player === 'human' ? [7, 6] : [7, 8];
}

function cellKind(row: number, column: number): string {
  const key = `${row}-${column}`;
  const trackSquare = TRACK_BY_CELL.get(key);
  if (trackSquare != null) return `track${isSafeSquare(trackSquare) ? ' safe' : ''}${trackSquare === 0 ? ' red-start' : ''}${trackSquare === 26 ? ' yellow-start' : ''}`;
  if (RED_HOME.some((cell) => keyOf(cell) === key)) return 'red-home-lane';
  if (YELLOW_HOME.some((cell) => keyOf(cell) === key)) return 'yellow-home-lane';
  if (row >= 6 && row <= 8 && column >= 6 && column <= 8) return 'home-goal';
  if (row < 6 && column < 6) return 'red-yard';
  if (row < 6 && column > 8) return 'green-yard inactive-yard';
  if (row > 8 && column < 6) return 'blue-yard inactive-yard';
  if (row > 8 && column > 8) return 'yellow-yard';
  return 'blank';
}

function LudoBoard({ state }: { state: LudoHook['state'] }) {
  const pieces = useMemo(() => {
    const occupied = new Map<string, { player: LudoPlayer; id: number }[]>();
    for (const player of ['human', 'computer'] as const) {
      for (const token of state.tokens[player]) {
        const key = keyOf(coordinateFor(player, token.progress, token.id));
        occupied.set(key, [...(occupied.get(key) ?? []), { player, id: token.id }]);
      }
    }
    return occupied;
  }, [state]);

  return (
    <div className="classic-ludo-board" role="img" aria-label="Classic Ludo board. You are red in the upper left. The computer is yellow in the lower right. Token positions are described below the board and by voice.">
      {Array.from({ length: 15 }, (_, row) => Array.from({ length: 15 }, (_, column) => {
        const key = `${row}-${column}`;
        const trackSquare = TRACK_BY_CELL.get(key);
        return <div key={key} aria-hidden="true" className={`classic-ludo-cell ${cellKind(row, column)}`}>
          {trackSquare != null && isSafeSquare(trackSquare) && <span className="safe-mark">★</span>}
          {pieces.get(key)?.map((piece) => <span key={`${piece.player}-${piece.id}`} className={`classic-token ${piece.player === 'human' ? 'red-token' : 'yellow-token'}`}>{piece.id}</span>)}
        </div>;
      }))}
      <span className="yard-label red-yard-label" aria-hidden="true">YOU</span>
      <span className="yard-label yellow-yard-label" aria-hidden="true">CPU</span>
    </div>
  );
}

function DiceFace({ value }: { value: number | null }) {
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <div className="ludo-die" aria-label={value == null ? 'Die has not been rolled' : `Die shows ${value}`}>
    {Array.from({ length: 9 }, (_, index) => <i key={index} className={value != null && pips[value].includes(index) ? 'pip visible' : 'pip'} />)}
  </div>;
}

function TokenList({ player, state, legal, onChoose }: { player: LudoPlayer; state: LudoHook['state']; legal: number[]; onChoose: (id: number) => void }) {
  return <div className={`ludo-token-list ${player === 'human' ? 'ludo-human' : 'ludo-computer'}`}><h3>{player === 'human' ? 'Your red tokens' : 'Computer yellow tokens'}</h3>{state.tokens[player].map((token) => <button key={token.id} type="button" className="ludo-token-row" disabled={player !== 'human' || !legal.includes(token.id)} onClick={() => onChoose(token.id)} aria-label={`${player === 'human' ? 'Your' : 'Computer'} token ${token.id}, ${describeToken(state, player, token.id)}${legal.includes(token.id) ? ', available to move' : ''}`}><span className="token-number">{token.id}</span><span>{describeToken(state, player, token.id)}</span>{legal.includes(token.id) && <strong>Available</strong>}</button>)}</div>;
}

export default function LudoPage() {
  const { settings, setConfirmMoves, setScreenReaderMode } = useSettings();
  const game = useLudoGame();
  const [newGamePrompt, setNewGamePrompt] = useState(false);
  const legal = !game.paused && !game.awaitingStartChoice && game.state.activePlayer === 'human' && game.state.phase === 'awaiting-token'
    ? legalTokenIds(game.state, 'human') : [];
  function choose(id: number) { const result = game.proposeToken(id); if (result.ok) game.confirmToken(); }
  const turnOwner = game.state.activePlayer === 'human' ? 'Your turn' : "Computer's turn";

  return <div className="app ludo-app"><a href="#ludo-main" className="skip-link">Skip to main content</a><header className="app-header"><button className="library-link" onClick={() => { window.location.href = '/'; }}>Game library</button><h1>Voice Ludo</h1><span className="game-badge">Ludo</span></header><main id="ludo-main" className="ludo-main">
    <LudoVoiceCompanion onNarrationBusyChange={game.setNarrationBusy} state={game.state} status={game.status} awaitingStartChoice={game.awaitingStartChoice} paused={game.paused} pendingToken={game.pendingToken} confirmMoves={settings.confirmMoves} screenReaderMode={settings.screenReaderMode} rollDice={game.rollDice} proposeToken={game.proposeToken} confirmToken={game.confirmToken} cancelToken={game.cancelToken} correct={game.correct} continueGame={game.continueGame} newGame={game.newGame} pauseGame={game.pauseGame} resumeGame={game.resumeGame} />
    <div className={`ludo-turn-banner ${game.state.activePlayer === 'human' ? 'human-turn' : 'computer-turn'}`} role="status" aria-live="assertive" aria-atomic="true"><span>{turnOwner}</span><strong>{game.status}</strong></div>
    <div className="ludo-layout"><aside className="ludo-side"><Card><div className="ludo-turn-panel"><div><p className="panel-title">Turn and die</p><p className="ludo-status" aria-live="polite">{game.status}</p><p className="ludo-roll-number">Last roll: <strong>{game.lastRoll?.value ?? 'none'}</strong>{game.lastRoll && <span> — {game.lastRoll.player === 'human' ? 'you' : 'computer'}</span>}</p><p>Sixes this turn: <strong>{game.state.sixStreak}</strong></p></div><DiceFace value={game.state.currentRoll ?? game.lastRoll?.value ?? null} /></div><div className="ludo-actions"><Button onClick={() => { if (!game.state.result && (game.state.history.length > 0 || Object.values(game.state.tokens).some((tokens) => tokens.some((token) => token.progress !== -1)))) setNewGamePrompt(true); else game.newGame(); }} className="secondary-button">New game</Button><Button onClick={game.paused ? game.resumeGame : game.pauseGame}>{game.paused ? 'Resume game' : 'Pause game'}</Button>{game.state.phase === 'awaiting-roll' && game.state.activePlayer === 'human' && <Button onClick={game.rollDice} disabled={game.awaitingStartChoice}>Roll die</Button>}{game.state.phase === 'awaiting-continue' && <Button onClick={game.continueGame}>Roll for computer now</Button>}{game.state.correction && <Button onClick={game.correct} className="secondary-button">Correct last move</Button>}</div></Card><TokenList player="human" state={game.state} legal={legal} onChoose={choose}/><TokenList player="computer" state={game.state} legal={[]} onChoose={() => undefined}/><Card><label><input type="checkbox" checked={settings.confirmMoves} onChange={(event) => setConfirmMoves(event.target.checked)} /> Confirm suggested token moves</label><label><input type="checkbox" checked={settings.screenReaderMode} onChange={(event) => setScreenReaderMode(event.target.checked)} /> Screen-reader narration</label></Card></aside><section className="ludo-board-section" aria-label="Ludo board"><LudoBoard state={game.state}/><p className="ludo-board-help">Red is you. Yellow is the computer. Green and blue are inactive in this two-player game. Starred squares are safe.</p></section></div>
    {newGamePrompt && <div className="ludo-confirm" role="alertdialog" aria-label="Start new Ludo game"><p>Start a new Ludo game and clear this saved position?</p><Button onClick={() => { game.newGame(); setNewGamePrompt(false); }}>Start new game</Button><Button className="secondary-button" onClick={() => setNewGamePrompt(false)}>Cancel</Button></div>}
    {game.state.result && <div className="ludo-finished" role="dialog" aria-label="Ludo game result"><h2>{game.state.result === 'human' ? 'You win!' : 'Computer wins'}</h2><p>All four tokens have reached home.</p><Button onClick={game.newGame}>Play again</Button></div>}
  </main></div>;
}
