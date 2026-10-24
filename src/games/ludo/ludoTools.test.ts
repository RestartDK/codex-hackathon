import { describe, expect, it, vi } from 'vitest';
import { createLudoState } from './ludo';
import { createLudoToolExecutor, type LudoToolBridge } from './ludoTools';

function fixture() {
  const state = createLudoState();
  state.phase = 'awaiting-token';
  state.currentRoll = 6;
  const bridge: LudoToolBridge = {
    state, awaitingStartChoice: false, paused: false, pendingToken: null, confirmMoves: true,
    rollDice: vi.fn(() => ({ ok: true, message: 'You rolled 6.' })),
    proposeToken: vi.fn(() => ({ ok: true, message: 'Choose token.' })),
    confirmToken: vi.fn(() => ({ ok: true, message: 'Token moved.' })),
    cancelToken: vi.fn(() => ({ ok: true, message: 'Cancelled.' })),
    correct: vi.fn(() => ({ ok: true, message: 'Corrected.' })),
    continueGame: vi.fn(() => ({ ok: true, message: 'Continued.' })),
    newGame: vi.fn(), pauseGame: vi.fn(() => ({ ok: true, message: 'Paused.' })),
    resumeGame: vi.fn(() => ({ ok: true, message: 'Resumed.' })),
  };
  return { bridge, executor: createLudoToolExecutor(() => bridge) };
}

describe('Ludo conversational controls', () => {
  it('plays an explicit token order immediately even when suggested moves require confirmation', async () => {
    const { bridge, executor } = fixture();
    await executor.execute('propose_token_move', '{"tokenId":2}');
    expect(bridge.confirmToken).toHaveBeenCalledOnce();
    expect(executor.getPending()).toBeNull();
  });

  it('confirms a companion choice and a destructive restart, but not a board query', async () => {
    const { bridge, executor } = fixture();
    expect(JSON.parse(await executor.execute('propose_best_token_move', '{}')).status).toBe('confirmation_required');
    expect(bridge.confirmToken).not.toHaveBeenCalled();
    await executor.execute('confirm_action', '{}');
    expect(bridge.confirmToken).toHaveBeenCalledOnce();
    const position = JSON.parse(await executor.execute('get_position', '{}'));
    expect(position.message).toContain('You are red; the computer is yellow');
    expect(executor.getPending()).toBeNull();
    bridge.state.tokens.human[0].progress = 0;
    expect(JSON.parse(await executor.execute('propose_game_control', '{"action":"new_game"}')).status).toBe('confirmation_required');
    expect(bridge.newGame).not.toHaveBeenCalled();
  });

  it('starts a fresh board without asking to discard nonexistent progress', async () => {
    const { bridge, executor } = fixture();
    expect(JSON.parse(await executor.execute('propose_game_control', '{"action":"new_game"}')).status).toBe('completed');
    expect(bridge.newGame).toHaveBeenCalledOnce();
    expect(executor.getPending()).toBeNull();
  });

  it('describes track, home lane and finished tokens in ordinary language', async () => {
    const { bridge, executor } = fixture();
    bridge.state.tokens.human[0].progress = 4;
    bridge.state.tokens.human[1].progress = 55;
    bridge.state.tokens.computer[0].progress = 57;
    const position = JSON.parse(await executor.execute('get_position', '{}'));
    expect(position.message).toContain('square 4');
    expect(position.message).toContain('home lane, 2 spaces from home');
    expect(position.message).toContain("the computer's token 1 is home");
    expect(position.message).not.toContain('null');
  });
});
