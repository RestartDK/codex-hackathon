import { INTERCEPT_INTRODUCTION, type InterceptActionResult, type InterceptChoice, type InterceptState } from './intercept';

export interface InterceptToolBridge {
  state: InterceptState;
  awaitingStartChoice: boolean;
  canUndo: boolean;
  choose: (choiceId: string) => InterceptActionResult;
  undo: () => InterceptActionResult;
  pause: () => InterceptActionResult;
  resume: () => InterceptActionResult;
  newGame: () => InterceptActionResult;
  repeat: () => string;
  recap: () => string;
  choices: () => string;
}

type PendingAction = {
  id: string;
  description: string;
  revision: number;
  kind: 'choice' | 'new-game';
  choiceId?: string;
};

function json(value: unknown): string {
  return JSON.stringify(value);
}

function visibleState(bridge: InterceptToolBridge) {
  return {
    storyStatus: bridge.state.status,
    revision: bridge.state.revision,
    passage: bridge.state.passage,
    choices: bridge.state.choices.map(({ number, text }) => ({ number, text })),
    canUndo: bridge.canUndo,
    awaitingStartChoice: bridge.awaitingStartChoice,
  };
}

export function createInterceptToolExecutor(
  getBridge: () => InterceptToolBridge,
  onPendingChange: () => void = () => undefined,
) {
  let pending: PendingAction | null = null;
  let nextId = 1;

  const invalidatePending = () => {
    pending = null;
    onPendingChange();
  };

  function propose(action: Omit<PendingAction, 'id'>) {
    pending = { ...action, id: `intercept-action-${nextId++}` };
    onPendingChange();
    return json({ status: 'confirmation_required', actionId: pending.id, description: pending.description });
  }

  function findChoice(choices: InterceptChoice[], value: unknown): InterceptChoice | null {
    const number = Number(value);
    return Number.isInteger(number) ? choices.find((choice) => choice.number === number) ?? null : null;
  }

  async function execute(name: string, rawArguments: string): Promise<string> {
    const bridge = getBridge();
    let args: Record<string, unknown> = {};
    try { args = rawArguments ? JSON.parse(rawArguments) as Record<string, unknown> : {}; }
    catch { return json({ status: 'error', message: 'The tool arguments were not valid JSON.' }); }

    if (name === 'get_story_state') return json({ status: 'ok', ...visibleState(bridge) });
    if (name === 'get_game_introduction') return json({ status: 'ok', message: INTERCEPT_INTRODUCTION });
    if (name === 'repeat_story_passage') return json({ status: 'ok', message: bridge.repeat() });
    if (name === 'get_story_recap') return json({ status: 'ok', message: bridge.recap() });
    if (name === 'undo_story_choice') return json(bridge.undo());

    if (name === 'choose_story_option') {
      const choice = findChoice(bridge.state.choices, args.choiceNumber);
      if (!choice) return json({ status: 'clarification_required', message: bridge.choices(), ...visibleState(bridge) });
      invalidatePending();
      const result = bridge.choose(choice.id);
      return json({ status: result.ok ? 'completed' : 'error', message: result.message });
    }

    if (name === 'suggest_story_option') {
      if (bridge.awaitingStartChoice) return json({ status: 'error', message: 'Choose Resume or New Story first.' });
      if (bridge.state.status !== 'playing') return json({ status: 'error', message: bridge.state.status === 'paused' ? 'Resume the story first.' : 'The story has ended.' });
      const requested = findChoice(bridge.state.choices, args.choiceNumber);
      const choice = requested ?? bridge.state.choices[0];
      if (!choice) return json({ status: 'error', message: 'There is no story choice available.' });
      return propose({
        kind: 'choice',
        revision: bridge.state.revision,
        choiceId: choice.id,
        description: `Choose option ${choice.number}, ${choice.text}`,
      });
    }

    if (name === 'confirm_action') {
      if (!pending) return json({ status: 'nothing_pending', message: 'There is no story action waiting for confirmation.' });
      const action = pending;
      pending = null;
      onPendingChange();
      if (action.revision !== bridge.state.revision) return json({ status: 'stale', message: 'The story changed, so that suggestion was cancelled.' });
      const result = action.kind === 'choice' && action.choiceId
        ? bridge.choose(action.choiceId)
        : bridge.newGame();
      return json({ status: result.ok ? 'completed' : 'error', message: result.message });
    }

    if (name === 'cancel_action') {
      const hadPending = Boolean(pending);
      invalidatePending();
      return json({ status: hadPending ? 'cancelled' : 'nothing_pending', message: hadPending ? 'Cancelled.' : 'There is no pending story action.' });
    }

    if (name === 'propose_story_control') {
      const action = String(args.action ?? '');
      invalidatePending();
      if (action === 'pause') return json(bridge.pause());
      if (action === 'resume') return json(bridge.resume());
      if (action === 'new_story') {
        const hasProgress = bridge.state.transcript.some((entry) => entry.kind === 'choice');
        if (hasProgress && bridge.state.status !== 'finished') {
          return propose({ kind: 'new-game', revision: bridge.state.revision, description: 'Start a new story and discard current progress' });
        }
        return json(bridge.newGame());
      }
      return json({ status: 'error', message: 'Unknown story control.' });
    }

    return json({ status: 'error', message: `Unknown Intercept tool: ${name}` });
  }

  return {
    execute,
    invalidatePending,
    getPending: () => pending ? { id: pending.id, description: pending.description } : null,
  };
}
