import { describe, expect, it, vi } from 'vitest';
import {
  applyTicTacToeMove,
  availableMoves,
  chooseComputerMove,
  createTicTacToeState,
  deserializeTicTacToe,
  describeTicTacToeBoard,
  findWinningLine,
  parseTicTacToePosition,
  serializeTicTacToe,
  undoTicTacToeTurn,
  type TicTacToeState,
} from './ticTacToe';
import { createTicTacToeToolExecutor, type TicTacToeToolBridge } from './ticTacToeTools';

describe('Tic-Tac-Toe rules engine', () => {
  it.each([
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ])('detects winning line %s, %s, %s', (a, b, c) => {
    const board = Array(9).fill(null);
    board[a] = board[b] = board[c] = 'X';
    expect(findWinningLine(board)).toEqual([a, b, c]);
  });

  it('plays a win, blocks occupied and terminal moves, and updates score', () => {
    const state = createTicTacToeState();
    for (const index of [0, 3, 1, 4]) expect(applyTicTacToeMove(state, index).ok).toBe(true);
    expect(applyTicTacToeMove(state, 0)).toMatchObject({ ok: false });
    expect(applyTicTacToeMove(state, 2)).toMatchObject({ ok: true });
    expect(state).toMatchObject({ status: 'won', winner: 'X', winningLine: [0, 1, 2], score: { wins: 1, losses: 0, draws: 0 } });
    expect(applyTicTacToeMove(state, 8)).toMatchObject({ ok: false });
  });

  it('detects a draw and can undo a complete turn and its score effect', () => {
    const state = createTicTacToeState();
    for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) applyTicTacToeMove(state, index);
    expect(state.status).toBe('draw');
    expect(state.score.draws).toBe(1);
    expect(undoTicTacToeTurn(state)).toMatchObject({ ok: true });
    expect(state.status).toBe('playing');
    expect(state.turn).toBe('X');
    expect(state.moves).toHaveLength(8);
    expect(state.score.draws).toBe(0);
  });

  it('easy is injectable and medium takes wins before blocks', () => {
    const easy = createTicTacToeState('easy');
    expect(chooseComputerMove(easy, () => 0.999)).toBe(8);
    const win = createTicTacToeState('medium');
    win.board = ['O', 'O', null, 'X', 'X', null, null, null, null];
    expect(chooseComputerMove(win, () => 0)).toBe(2);
    const block = createTicTacToeState('medium');
    block.board = ['X', 'X', null, 'O', null, null, null, null, null];
    expect(chooseComputerMove(block, () => 0)).toBe(2);
  });

  it('hard mode cannot lose against any sequence of legal human moves', () => {
    function explore(state: TicTacToeState): boolean {
      if (state.status !== 'playing') return state.winner !== 'X';
      if (state.turn === 'O') {
        const next = structuredClone(state);
        const move = chooseComputerMove(next);
        expect(move).not.toBeNull();
        applyTicTacToeMove(next, move!);
        return explore(next);
      }
      return availableMoves(state.board).every((move) => {
        const next = structuredClone(state);
        applyTicTacToeMove(next, move);
        return explore(next);
      });
    }
    expect(explore(createTicTacToeState('hard'))).toBe(true);
  });

  it('recognizes natural positions and describes only authoritative marks', () => {
    expect(parseTicTacToePosition('play top left')).toBe(0);
    expect(parseTicTacToePosition('row 2 column 3')).toBe(5);
    expect(parseTicTacToePosition('play middle right')).toBe(5);
    expect(parseTicTacToePosition('play bottom middle')).toBe(7);
    expect(parseTicTacToePosition('square nine')).toBe(8);
    expect(parseTicTacToePosition('somewhere')).toBeNull();
    const state = createTicTacToeState();
    applyTicTacToeMove(state, 4);
    expect(describeTicTacToeBoard(state)).toContain('center is your X');
    expect(describeTicTacToeBoard(state)).toContain("Computer's turn");
  });

  it('round-trips valid saves and rejects corrupt or impossible saves', () => {
    const state = createTicTacToeState('hard', { wins: 2, losses: 1, draws: 3 });
    applyTicTacToeMove(state, 4);
    expect(deserializeTicTacToe(serializeTicTacToe(state))).toEqual(state);
    expect(deserializeTicTacToe('{broken')).toBeNull();
    expect(deserializeTicTacToe(JSON.stringify({ version: 1, state: { ...state, board: ['X'] } }))).toBeNull();
    expect(deserializeTicTacToe(JSON.stringify({ version: 1, state: { ...state, moves: [{ index: 0, mark: 'O' }] } }))).toBeNull();
  });
});

function toolFixture() {
  const state = createTicTacToeState();
  const playHumanMove = vi.fn((index: number) => {
    const result = applyTicTacToeMove(state, index);
    return result;
  });
  const bridge: TicTacToeToolBridge = {
    state,
    awaitingStartChoice: false,
    paused: false,
    playHumanMove,
    undo: vi.fn(() => ({ ok: true, message: 'Undone.' })),
    newRound: vi.fn(() => ({ ok: true, message: 'New round.' })),
    resetMatch: vi.fn(() => ({ ok: true, message: 'Reset.' })),
    pause: vi.fn(() => ({ ok: true, message: 'Paused.' })),
    resume: vi.fn(() => ({ ok: true, message: 'Resumed.' })),
    changeDifficulty: vi.fn(() => ({ ok: true, message: 'Difficulty changed.' })),
  };
  return { bridge, executor: createTicTacToeToolExecutor(() => bridge) };
}

describe('Tic-Tac-Toe voice tools', () => {
  it('plays explicit moves immediately but confirms companion suggestions', async () => {
    const { bridge, executor } = toolFixture();
    expect(JSON.parse(await executor.execute('place_tic_tac_toe_mark', '{"position":"center"}')).status).toBe('completed');
    expect(bridge.playHumanMove).toHaveBeenCalledWith(4);
    // Restore a human turn for an independent suggestion assertion.
    bridge.state.board = Array(9).fill(null);
    bridge.state.moves = [];
    bridge.state.turn = 'X';
    bridge.state.revision += 1;
    expect(JSON.parse(await executor.execute('suggest_tic_tac_toe_move', '{}')).status).toBe('confirmation_required');
    expect(bridge.playHumanMove).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await executor.execute('confirm_tic_tac_toe_action', '{}')).status).toBe('completed');
    expect(bridge.playHumanMove).toHaveBeenCalledTimes(2);
  });

  it('answers board, square, availability, history, and score queries', async () => {
    const { executor } = toolFixture();
    const state = JSON.parse(await executor.execute('get_tic_tac_toe_state', '{}'));
    expect(state.message).toContain('board is empty');
    expect(state.score).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(JSON.parse(await executor.execute('inspect_tic_tac_toe_cell', '{"position":"bottom right"}')).message).toContain('empty');
    expect(JSON.parse(await executor.execute('get_available_tic_tac_toe_moves', '{}')).moves).toHaveLength(9);
    expect(JSON.parse(await executor.execute('get_tic_tac_toe_history', '{}')).message).toContain('No moves');
  });

  it('cancels a stale suggestion and confirms destructive controls', async () => {
    const { bridge, executor } = toolFixture();
    await executor.execute('suggest_tic_tac_toe_move', '{}');
    bridge.state.revision += 1;
    expect(JSON.parse(await executor.execute('confirm_tic_tac_toe_action', '{}')).status).toBe('stale');
    bridge.state.moves.push({ index: 0, mark: 'X' });
    expect(JSON.parse(await executor.execute('propose_tic_tac_toe_control', '{"action":"new_round"}')).status).toBe('confirmation_required');
    expect(bridge.newRound).not.toHaveBeenCalled();
  });

  it('confirms a difficulty change that would clear a live round', async () => {
    const { bridge, executor } = toolFixture();
    bridge.state.moves.push({ index: 0, mark: 'X' });
    bridge.state.board[0] = 'X';
    bridge.state.turn = 'X';
    const proposed = JSON.parse(await executor.execute('set_tic_tac_toe_difficulty', '{"difficulty":"hard"}'));
    expect(proposed.status).toBe('confirmation_required');
    expect(bridge.changeDifficulty).not.toHaveBeenCalled();
    await executor.execute('confirm_tic_tac_toe_action', '{}');
    expect(bridge.changeDifficulty).toHaveBeenCalledWith('hard');
  });

  it('does not create a stale destructive confirmation during the computer turn', async () => {
    const { bridge, executor } = toolFixture();
    bridge.state.moves.push({ index: 0, mark: 'X' });
    bridge.state.board[0] = 'X';
    bridge.state.turn = 'O';
    expect(JSON.parse(await executor.execute('set_tic_tac_toe_difficulty', '{"difficulty":"hard"}')).status).toBe('wait');
    expect(executor.getPending()).toBeNull();
  });
});
