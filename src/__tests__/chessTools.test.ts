import { describe, expect, it, vi } from 'vite-plus/test';
import { Chess } from 'chess.js';
import { createChessToolExecutor, type ChessToolBridge } from '../voice/chessTools';
import { narrateMove } from '../components/VoiceCompanion/VoiceCompanion';

function setup(confirmMoves = true) {
  const game = new Chess();
  const bridge: ChessToolBridge = {
    game,
    history: [],
    playerColor: 'w',
    confirmMoves,
    makeMove: (from, to, promotion) => {
      try {
        game.move({ from, to, promotion });
        return { ok: true, message: 'Move played.' };
      } catch {
        return { ok: false, message: 'Illegal move.' };
      }
    },
    newGame: vi.fn(),
    undoMove: vi.fn(),
    resign: vi.fn(),
  };
  return { game, bridge, executor: createChessToolExecutor(() => bridge) };
}

describe('chess voice tools', () => {
  it('plays a directly ordered legal move without asking for confirmation', async () => {
    const { game, executor } = setup();
    const result = JSON.parse(await executor.execute('propose_move', JSON.stringify({ from: 'e2', to: 'e4' })));
    expect(result.status).toBe('completed');
    expect(game.get('e4')).toMatchObject({ type: 'p', color: 'w' });
    expect(executor.getPending()).toBeNull();
  });

  it('requires confirmation when the companion chooses a move', async () => {
    const { game, bridge, executor } = setup();
    bridge.getHint = async () => ({ ok: true, from: 'e2', to: 'e4', san: 'e4' });
    const proposal = JSON.parse(await executor.execute('propose_best_move', '{}'));
    expect(proposal.status).toBe('confirmation_required');
    expect(game.get('e2')).toMatchObject({ type: 'p', color: 'w' });
    const result = JSON.parse(await executor.execute('confirm_action', '{}'));
    expect(result.status).toBe('completed');
    expect(game.get('e4')).toMatchObject({ type: 'p', color: 'w' });
  });

  it('rejects illegal direct moves and stale suggested moves', async () => {
    const { game, bridge, executor } = setup();
    const illegal = JSON.parse(await executor.execute('propose_move', JSON.stringify({ from: 'e2', to: 'e5' })));
    expect(illegal.status).toBe('illegal');

    bridge.getHint = async () => ({ ok: true, from: 'e2', to: 'e4', san: 'e4' });
    await executor.execute('propose_best_move', '{}');
    game.move('d4');
    const stale = JSON.parse(await executor.execute('confirm_action', '{}'));
    expect(stale.status).toBe('stale');
  });

  it('answers square and board queries from authoritative state', async () => {
    const { executor } = setup();
    const square = JSON.parse(await executor.execute('inspect_square', JSON.stringify({ square: 'e1' })));
    const rank = JSON.parse(await executor.execute('read_board', JSON.stringify({ scope: 'rank', value: '1' })));
    expect(square.occupant).toBe('White king');
    expect(rank.pieces).toHaveLength(8);
  });

  it('plays direct orders immediately regardless of suggestion confirmation preference', async () => {
    const { game, executor } = setup(false);
    const result = JSON.parse(await executor.execute('propose_move', JSON.stringify({ from: 'e2', to: 'e4' })));
    expect(result.status).toBe('completed');
    expect(game.get('e4')?.type).toBe('p');
  });

  it('resumes a saved game without requiring destructive confirmation', async () => {
    const { bridge, executor } = setup();
    bridge.resumeGame = vi.fn();
    const result = JSON.parse(await executor.execute('propose_game_control', JSON.stringify({ action: 'resume' })));
    expect(result.status).toBe('completed');
    expect(bridge.resumeGame).toHaveBeenCalledOnce();
    expect(executor.getPending()).toBeNull();
  });

  it('blocks moves and hints while paused or after the game has ended', async () => {
    const { bridge, executor } = setup();
    bridge.getHint = vi.fn();
    bridge.isPaused = true;
    expect(JSON.parse(await executor.execute('propose_move', JSON.stringify({ from: 'e2', to: 'e4' }))).status).toBe('error');
    expect(JSON.parse(await executor.execute('get_hint', '{}')).status).toBe('error');
    expect(bridge.getHint).not.toHaveBeenCalled();

    bridge.isPaused = false;
    bridge.getHint = async () => ({ ok: true, from: 'e2', to: 'e4', san: 'e4' });
    await executor.execute('propose_best_move', '{}');
    bridge.isTerminated = true;
    expect(JSON.parse(await executor.execute('confirm_action', '{}')).status).toBe('error');
    expect(executor.getPending()).toBeNull();
  });

  it('returns spoken history and verified effects for the last move', async () => {
    const { game, bridge, executor } = setup();
    game.move('e4');
    game.move('d5');
    game.move('exd5');
    bridge.history = game.history();
    const history = JSON.parse(await executor.execute('get_history', JSON.stringify({ count: 1 })));
    const explanation = JSON.parse(await executor.execute('explain_last_move', '{}'));
    expect(history.moves[0].spoken).toContain('captures the pawn');
    expect(explanation.verifiedEffects).toContain('captured a pawn');
    expect(explanation.limitation).toContain('do not invent');
  });

  it('explicitly announces when the computer captures one of the player pieces', () => {
    const game = new Chess();
    game.move('e4'); game.move('d5'); game.move('exd5'); game.move('Qxd5');
    const move = game.history({ verbose: true }).at(-1)!;
    const narration = narrateMove(move, game, 'w');
    expect(narration).toContain('You lost your White pawn');
    expect(narration).toContain('Your turn, playing White');
  });

  it('reports unavailable pause and resume controls instead of claiming success', async () => {
    const { executor } = setup();
    expect(JSON.parse(await executor.execute('propose_game_control', JSON.stringify({ action: 'pause' }))).status).toBe('error');
    expect(JSON.parse(await executor.execute('propose_game_control', JSON.stringify({ action: 'resume' }))).status).toBe('error');
  });

  it('passes through a failed pause or resume operation', async () => {
    const { bridge, executor } = setup();
    bridge.pauseGame = () => ({ ok: false, message: 'The game is already over.' });
    bridge.resumeGame = () => ({ ok: false, message: 'The game is already active.' });
    expect(JSON.parse(await executor.execute('propose_game_control', JSON.stringify({ action: 'pause' }))).status).toBe('error');
    expect(JSON.parse(await executor.execute('propose_game_control', JSON.stringify({ action: 'resume' }))).status).toBe('error');
  });
});
