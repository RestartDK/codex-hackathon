import { describe, expect, it } from 'vitest';
import { InterceptGame, INTERCEPT_SAVE_KEY, matchInterceptChoice } from './intercept';
import { createInterceptToolExecutor, type InterceptToolBridge } from './interceptTools';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function bridge(game: InterceptGame): InterceptToolBridge {
  return {
    state: game.state,
    awaitingStartChoice: game.awaitingStartChoice,
    canUndo: game.canUndo,
    choose: (id) => game.choose(id),
    undo: () => game.undo(),
    pause: () => game.pause(),
    resume: () => game.resume(),
    newGame: () => game.newGame(),
    repeat: () => game.currentNarration(),
    recap: () => game.recap(),
    choices: () => game.choiceList(),
  };
}

describe('The Intercept story engine', () => {
  it('opens at an authored passage with numbered choices', () => {
    const game = new InterceptGame(new MemoryStorage());
    expect(game.state.passage.join(' ')).toContain('They are keeping me waiting');
    expect(game.state.choices.map((choice) => choice.text)).toEqual(expect.arrayContaining(['Think', 'Plan', 'Wait']));
    expect(game.state.status).toBe('playing');
  });

  it('commits an explicit choice immediately and supports one exact undo', () => {
    const game = new InterceptGame(new MemoryStorage());
    const originalPassage = game.state.passage;
    const originalChoices = game.state.choices.map((choice) => choice.text);
    const staleId = game.state.choices[0].id;
    expect(game.choose(staleId).ok).toBe(true);
    expect(game.state.revision).toBe(1);
    expect(game.state.transcript.some((entry) => entry.kind === 'choice')).toBe(true);
    expect(game.choose(staleId)).toMatchObject({ ok: false });
    expect(game.undo().ok).toBe(true);
    expect(game.state.passage).toEqual(originalPassage);
    expect(game.state.choices.map((choice) => choice.text)).toEqual(originalChoices);
    expect(game.undo()).toMatchObject({ ok: false });
  });

  it('restores a save but blocks changes until the player resumes', () => {
    const storage = new MemoryStorage();
    const first = new InterceptGame(storage);
    first.choose(first.state.choices[0].id);
    const savedRevision = first.state.revision;
    const restored = new InterceptGame(storage);
    expect(restored.awaitingStartChoice).toBe(true);
    expect(restored.state.revision).toBe(savedRevision);
    expect(restored.choose(restored.state.choices[0].id).ok).toBe(false);
    expect(restored.resume().ok).toBe(true);
    expect(restored.choose(restored.state.choices[0].id).ok).toBe(true);
  });

  it('recovers from a corrupt save and overwrites it with valid state', () => {
    const storage = new MemoryStorage();
    storage.setItem(INTERCEPT_SAVE_KEY, '{broken');
    const game = new InterceptGame(storage);
    expect(game.awaitingStartChoice).toBe(false);
    expect(game.state.choices.length).toBeGreaterThan(0);
    expect(() => JSON.parse(storage.getItem(INTERCEPT_SAVE_KEY)!)).not.toThrow();
  });

  it('recognizes numbers, ordinals, and exact authored choice text only', () => {
    const game = new InterceptGame(new MemoryStorage());
    expect(matchInterceptChoice('choice one', game.state.choices)?.number).toBe(1);
    expect(matchInterceptChoice('second', game.state.choices)?.number).toBe(2);
    expect(matchInterceptChoice(game.state.choices[0].text, game.state.choices)?.number).toBe(1);
    expect(matchInterceptChoice('do something different', game.state.choices)).toBeNull();
  });

  it('can complete a real authored route without a dead end or runaway loop', () => {
    const game = new InterceptGame(new MemoryStorage());
    let decisions = 0;
    while (game.state.status !== 'finished' && decisions < 250) {
      const choice = game.state.choices.at(-1);
      expect(choice, `missing choice at revision ${game.state.revision}`).toBeDefined();
      expect(game.choose(choice!.id).ok).toBe(true);
      decisions++;
    }
    expect(decisions).toBeLessThan(250);
    expect(game.state.status).toBe('finished');
    expect(game.state.passage.join(' ').length).toBeGreaterThan(0);
  });
});

describe('The Intercept voice tools', () => {
  it('explains the premise, goal, and ending model without hidden story state', async () => {
    const game = new InterceptGame(new MemoryStorage());
    const tools = createInterceptToolExecutor(() => bridge(game));
    const result = JSON.parse(await tools.execute('get_game_introduction', '{}'));
    expect(result.message).toContain('Bletchley Park');
    expect(result.message).toContain('There is no score or single official victory');
    expect(result.message).toContain('multiple endings');
    expect(result.message).not.toContain('forceful');
  });

  it('plays direct choices without confirmation but confirms delegated choices', async () => {
    const game = new InterceptGame(new MemoryStorage());
    let currentBridge = bridge(game);
    const tools = createInterceptToolExecutor(() => currentBridge);
    const direct = JSON.parse(await tools.execute('choose_story_option', '{"choiceNumber":1}'));
    expect(direct.status).toBe('completed');
    expect(game.state.revision).toBe(1);

    currentBridge = bridge(game);
    const suggested = JSON.parse(await tools.execute('suggest_story_option', '{"choiceNumber":1}'));
    expect(suggested.status).toBe('confirmation_required');
    expect(game.state.revision).toBe(1);
    const confirmed = JSON.parse(await tools.execute('confirm_action', '{}'));
    expect(confirmed.status).toBe('completed');
    expect(game.state.revision).toBe(2);
  });

  it('cancels a pending suggestion if the story revision changes', async () => {
    const game = new InterceptGame(new MemoryStorage());
    let currentBridge = bridge(game);
    const tools = createInterceptToolExecutor(() => currentBridge);
    await tools.execute('suggest_story_option', '{"choiceNumber":1}');
    game.choose(game.state.choices[1].id);
    currentBridge = bridge(game);
    const result = JSON.parse(await tools.execute('confirm_action', '{}'));
    expect(result.status).toBe('stale');
  });
});
