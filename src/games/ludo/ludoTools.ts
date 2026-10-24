import {
  describeToken,
  describeLudoPosition,
  chooseStrategicToken,
  legalTokenIds,
  type LudoState,
} from './ludo';

export interface LudoToolBridge {
  state: LudoState;
  awaitingStartChoice: boolean;
  paused: boolean;
  pendingToken: number | null;
  confirmMoves: boolean;
  rollDice: () => { ok: boolean; message: string };
  proposeToken: (tokenId: number) => { ok: boolean; message: string };
  confirmToken: () => { ok: boolean; message: string };
  cancelToken: () => { ok: boolean; message: string };
  correct: () => { ok: boolean; message: string };
  continueGame: () => { ok: boolean; message: string };
  newGame: () => void;
  pauseGame: () => { ok: boolean; message: string };
  resumeGame: () => { ok: boolean; message: string };
}

function json(value: unknown): string { return JSON.stringify(value); }

export function createLudoToolExecutor(getBridge: () => LudoToolBridge, onPendingChange: () => void = () => undefined) {
  let pending: { id: string; description: string; kind: 'token' | 'control' } | null = null;
  let nextId = 1;

  const invalidatePending = () => { pending = null; onPendingChange(); };
  const propose = (description: string, kind: 'token' | 'control' = 'token') => {
    pending = { id: `ludo-action-${nextId++}`, description, kind };
    onPendingChange();
    return json({ status: 'confirmation_required', actionId: pending.id, description });
  };

  async function execute(name: string, rawArguments: string): Promise<string> {
    const bridge = getBridge();
    let args: Record<string, unknown> = {};
    try { args = rawArguments ? JSON.parse(rawArguments) as Record<string, unknown> : {}; }
    catch { return json({ status: 'error', message: 'The tool arguments were not valid JSON.' }); }

    if (name === 'get_position') {
      return json({ status: 'ok', message: describeLudoPosition(bridge.state), activePlayer: bridge.state.activePlayer, phase: bridge.state.phase, roll: bridge.state.currentRoll, lastRoll: bridge.state.lastRoll, sixStreak: bridge.state.sixStreak, result: bridge.state.result, legalTokens: bridge.state.phase === 'awaiting-token' ? legalTokenIds(bridge.state) : [], human: bridge.state.tokens.human.map((token) => describeToken(bridge.state, 'human', token.id)), computer: bridge.state.tokens.computer.map((token) => describeToken(bridge.state, 'computer', token.id)) });
    }
    if (name === 'get_tokens') {
      const owner = String(args.owner ?? 'human') === 'computer' ? 'computer' : 'human';
      const tokens = bridge.state.tokens[owner].map((token) => describeToken(bridge.state, owner, token.id));
      return json({ status: 'ok', message: tokens.join(' '), owner, tokens, legalTokens: bridge.state.phase === 'awaiting-token' && bridge.state.activePlayer === owner ? legalTokenIds(bridge.state, owner) : [] });
    }
    if (name === 'roll_dice') return json(bridge.rollDice());
    if (name === 'propose_token_move' || name === 'propose_best_token_move') {
      const suggested = name === 'propose_best_token_move';
      const id = suggested ? chooseStrategicToken(bridge.state, 'human') : Number(args.tokenId);
      if (id == null) return json({ status: 'error', message: 'Roll first to get available token moves.' });
      if (!Number.isInteger(id) || id < 1 || id > 4) return json({ status: 'error', message: 'Choose a token number from one to four.' });
      const result = bridge.proposeToken(id);
      if (!result.ok) return json({ status: 'error', message: result.message });
      if (suggested && bridge.confirmMoves) return propose(`Move your token ${id}?`);
      pending = null;
      onPendingChange();
      return json(bridge.confirmToken());
    }
    if (name === 'confirm_action') {
      if (!pending) return json({ status: 'nothing_pending', message: 'There is no Ludo action waiting for confirmation.' });
      const action = pending;
      pending = null;
      onPendingChange();
      const result = action.kind === 'token' ? bridge.confirmToken() : (bridge.newGame(), { ok: true, message: 'New Ludo game started.' });
      return json({ status: result.ok ? 'completed' : 'error', message: result.message });
    }
    if (name === 'cancel_action') {
      const hadPending = Boolean(pending);
      pending = null;
      bridge.cancelToken();
      onPendingChange();
      return json({ status: hadPending ? 'cancelled' : 'nothing_pending' });
    }
    if (name === 'continue_turn') return json(bridge.continueGame());
    if (name === 'correct_last_move') return json(bridge.correct());
    if (name === 'propose_game_control') {
      const action = String(args.action ?? '');
      if (action === 'pause') return json(bridge.pauseGame());
      if (action === 'resume') return json(bridge.resumeGame());
      if (action === 'new_game') {
        const hasProgress = bridge.state.history.length > 0 || Object.values(bridge.state.tokens).some((tokens) => tokens.some((token) => token.progress !== -1));
        if (!bridge.state.result && hasProgress) return propose('Start a new Ludo game and clear the current board', 'control');
        pending = null;
        onPendingChange();
        bridge.newGame();
        return json({ status: 'completed', message: 'New Ludo game started.' });
      }
      return json({ status: 'error', message: 'Unknown Ludo game control.' });
    }
    return json({ status: 'error', message: `Unknown Ludo tool: ${name}` });
  }

  return { execute, invalidatePending, getPending: () => pending ? { id: pending.id, description: pending.description } : null };
}
