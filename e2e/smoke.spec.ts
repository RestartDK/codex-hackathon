import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';

const GAME_KEY = 'chess-by-sparsh-save';
const SETTINGS_KEY = 'chess-by-sparsh-settings';

function savedGame(moves: string[]) {
  const game = new Chess();
  for (const move of moves) game.move(move);
  return { version: 3, fen: game.fen(), history: game.history(), result: null, timestamp: Date.now() };
}

test('opens on the accessible game library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Voice Game Companion' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Chess' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ludo' })).toBeVisible();
  await page.getByRole('button', { name: 'Play chess' }).click();
  await expect(page).toHaveURL(/\/games\/chess$/);
});

test('opens directly on the accessible chess experience', async ({ page }) => {
  await page.goto('/games/chess');
  await expect(page.getByRole('heading', { name: 'Voice Chess Companion' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice companion' })).toBeFocused();
  await expect(page.locator('#dashboard-overview')).toContainText('voice controls');
  await expect(page.getByRole('button', { name: 'Hear the quick guide' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip introduction' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Chess board' })).toBeVisible();
  await expect(page.getByLabel('Typed command fallback')).toBeVisible();
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('[data-piece="wp"]').first()).toHaveCSS('color', 'rgb(247, 243, 232)');
  await expect(page.locator('[data-piece="bp"]').first()).toHaveCSS('color', 'rgb(32, 38, 49)');
});

test('a directly ordered chess move plays without confirmation', async ({ page }) => {
  await page.goto('/games/chess');
  await page.getByLabel('Typed command fallback').fill('e2 to e4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.getByRole('group', { name: 'Move confirmation' })).toHaveCount(0);
  await expect(page.getByRole('gridcell', { name: 'White pawn at e4' })).toBeVisible();
  await expect(page.getByText('You (White)', { exact: true })).toBeVisible();
  await expect(page.getByText('Computer (Black)', { exact: true })).toBeVisible();
});

test('saved game blocks moves until resume and then hides the choice', async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: GAME_KEY,
    value: savedGame(['e4', 'e5']),
  });
  await page.goto('/games/chess');
  await expect(page.getByRole('button', { name: 'Pause Game' })).toBeDisabled();
  await page.getByLabel('Typed command fallback').fill('d2 to d4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.locator('.sr-announcement')).toContainText('Choose Resume or New Game first');
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history, GAME_KEY)).toEqual(['e4', 'e5']);
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(page.getByRole('group', { name: 'Saved game choice' })).toHaveCount(0);
});

test('chess reports a player piece lost to a computer capture', async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: GAME_KEY,
    value: savedGame(['e4', 'd5', 'exd5', 'Qxd5']),
  });
  await page.goto('/games/chess');
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(page.getByText(/You lost your White pawn/).first()).toBeVisible();
});

test('Ludo opens with accessible roll and numbered token controls', async ({ page }) => {
  await page.goto('/games/ludo');
  await expect(page.getByRole('heading', { name: 'Voice Ludo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice companion' })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Ludo board' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Your token 1/ })).toBeVisible();
  await expect(page.getByLabel('Typed command fallback')).toHaveAttribute('placeholder', 'roll');
  await expect(page.getByRole('button', { name: 'Roll die' })).toBeVisible();
});

test('Ludo confirms a suggested token and supports correction with the same die', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto('/games/ludo');
  await page.getByRole('button', { name: 'Roll die' }).click();
  await expect(page.getByRole('button', { name: /Your token 1.*available to move/ })).toBeEnabled();
  await page.getByLabel('Typed command fallback').fill('choose a token for me');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.getByRole('group', { name: 'Ludo token confirmation' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm move' }).click();
  await expect(page.getByRole('button', { name: 'Correct last move' })).toBeVisible();
  await page.getByRole('button', { name: 'Correct last move' }).click();
  await expect(page.getByRole('button', { name: /Your token 1.*available to move/ })).toBeEnabled();
  await expect(page.getByLabel('Die shows 6')).toBeVisible();
  await expect(page.getByText('Last roll:').locator('..')).toContainText('6 — you');
});

test('Ludo saved games wait for an explicit resume choice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('voice-game-companion-ludo-save', JSON.stringify({ version: 1, state: { version: 1, activePlayer: 'human', phase: 'awaiting-roll', tokens: { human: [{ id: 1, progress: 0 }, { id: 2, progress: -1 }, { id: 3, progress: -1 }, { id: 4, progress: -1 }], computer: [{ id: 1, progress: -1 }, { id: 2, progress: -1 }, { id: 3, progress: -1 }, { id: 4, progress: -1 }] }, currentRoll: null, sixStreak: 0, history: [{ player: 'human', color: 'red', tokenId: 1, roll: 6, from: -1, to: 0, captured: [], finished: false, entered: true }], result: null, revision: 1, correction: null } })));
  await page.goto('/games/ludo');
  await expect(page.getByRole('group', { name: 'Saved Ludo game choice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Roll die' })).toBeDisabled();
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(page.getByRole('group', { name: 'Saved Ludo game choice' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Roll die' })).toBeEnabled();
});

test('Ludo can disable token confirmation without losing the move', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto('/games/ludo');
  await page.getByLabel('Confirm suggested token moves').uncheck();
  await page.getByRole('button', { name: 'Roll die' }).click();
  await page.getByRole('button', { name: /Your token 1.*available to move/ }).click();
  await expect(page.getByRole('group', { name: 'Ludo token confirmation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Your token 1, .*square 0/ })).toBeVisible();
});

test('Ludo immediately runs the computer after a human roll has no legal move', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/games/ludo');
  await page.getByRole('button', { name: 'Roll die' }).click();
  await expect(page.getByRole('status').filter({ hasText: "Computer's turn" })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Your turn' })).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('Last roll:').locator('..')).toContainText('1 — computer');
  await expect(page.getByRole('button', { name: 'Roll die' })).toBeEnabled();
});

test('Ludo announces and completes the computer turn after Continue', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem('voice-game-companion-ludo-save', JSON.stringify({ version: 1, state: { version: 1, activePlayer: 'human', phase: 'awaiting-roll', tokens: { human: [{ id: 1, progress: 0 }, { id: 2, progress: -1 }, { id: 3, progress: -1 }, { id: 4, progress: -1 }], computer: [{ id: 1, progress: -1 }, { id: 2, progress: -1 }, { id: 3, progress: -1 }, { id: 4, progress: -1 }] }, currentRoll: null, sixStreak: 0, history: [{ player: 'human', color: 'red', tokenId: 1, roll: 6, from: -1, to: 0, captured: [], finished: false, entered: true }], result: null, revision: 1, correction: null } }));
  });
  await page.goto('/games/ludo');
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await page.getByRole('button', { name: 'Roll die' }).click();
  await page.getByRole('button', { name: /Your token 1.*available to move/ }).click();
  await expect(page.getByRole('status')).toContainText("Computer's turn next");
  await expect(page.getByRole('status')).toContainText('Your turn', { timeout: 6000 });
  await expect(page.getByRole('button', { name: 'Roll die' })).toBeEnabled();
});

test('Ludo computer rolls and moves a token after the automatic handoff', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.999;
    localStorage.setItem('voice-game-companion-ludo-save', JSON.stringify({ version: 1, state: { version: 1, activePlayer: 'computer', phase: 'awaiting-continue', tokens: { human: [{ id: 1, progress: 1 }, { id: 2, progress: -1 }, { id: 3, progress: -1 }, { id: 4, progress: -1 }], computer: [{ id: 1, progress: -1 }, { id: 2, progress: -1 }, { id: 3, progress: -1 }, { id: 4, progress: -1 }] }, currentRoll: null, lastRoll: { player: 'human', value: 1 }, sixStreak: 0, history: [{ player: 'human', color: 'red', tokenId: 1, roll: 1, from: 0, to: 1, captured: [], finished: false, entered: false }], result: null, revision: 2, correction: null } }));
  });
  await page.goto('/games/ludo');
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('voice-game-companion-ludo-save')!);
    return saved.state.history.filter((move: { player: string }) => move.player === 'computer').length;
  }), { timeout: 8000 }).toBeGreaterThan(0);
  await expect(page.getByRole('status').filter({ hasText: 'The computer moved token' })).toBeVisible();
  await expect(page.getByText('Last roll:').locator('..')).toContainText('6 — computer');
});

test('a complete Ludo game reaches the win dialog through the real controls', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem('voice-game-companion-ludo-save', JSON.stringify({ version: 1, state: {
      version: 1, activePlayer: 'human', phase: 'awaiting-roll',
      tokens: {
        human: [{ id: 1, progress: 57 }, { id: 2, progress: 57 }, { id: 3, progress: 57 }, { id: 4, progress: 56 }],
        computer: [{ id: 1, progress: 4 }, { id: 2, progress: 12 }, { id: 3, progress: -1 }, { id: 4, progress: -1 }],
      },
      currentRoll: null, lastRoll: { player: 'computer', value: 2 }, sixStreak: 0,
      history: [{ player: 'human', color: 'red', tokenId: 3, roll: 1, from: 56, to: 57, captured: [], finished: true, entered: false }],
      result: null, revision: 20, correction: null,
    } }));
  });
  await page.goto('/games/ludo');
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await page.getByRole('button', { name: 'Roll die' }).click();
  await page.getByRole('button', { name: /Your token 4.*available to move/ }).click();
  await expect(page.getByRole('dialog', { name: 'Ludo game result' })).toContainText('You win!');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('voice-game-companion-ludo-save')!).state.result)).toBe('human');
});

test('a complete local chess game reaches checkmate through the board', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({
    gameMode: 'local', playerColor: 'w', difficulty: 'beginner', boardOrientation: 'white-bottom',
    boardTheme: 'classic', pieceSet: 'merida', soundEnabled: false, confirmMoves: false, screenReaderMode: false,
  })), SETTINGS_KEY);
  await page.goto('/games/chess');
  for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']] as const) {
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
  }
  await expect(page.getByRole('dialog', { name: 'Checkmate' })).toContainText('Black wins by checkmate');
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history, GAME_KEY)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
});

test('new game, undo, and color changes require confirmation', async ({ page }) => {
  await page.addInitScript(({ gameKey, settingsKey, game, settings }) => {
    localStorage.setItem(gameKey, JSON.stringify(game));
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  }, {
    gameKey: GAME_KEY,
    settingsKey: SETTINGS_KEY,
    game: savedGame(['e4']),
    settings: { gameMode: 'computer', playerColor: 'b', difficulty: 'beginner', boardOrientation: 'white-bottom', boardTheme: 'classic', pieceSet: 'merida', soundEnabled: false, confirmMoves: true, screenReaderMode: false },
  });
  await page.goto('/games/chess');
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Undo Turn' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history, GAME_KEY)).toEqual(['e4']);

  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Start New Game' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByLabel('Play as').selectOption('w');
  await expect(page.getByRole('group', { name: 'Color change confirmation' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  await expect(page.getByLabel('Play as')).toHaveValue('b');

  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Select game mode').selectOption('local');
  await expect(page.getByRole('alertdialog', { name: 'Change Game Mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).gameMode, SETTINGS_KEY)).toBe('computer');
});

test('pause blocks play and board keyboard navigation follows the flipped view', async ({ page }) => {
  await page.goto('/games/chess');
  await page.getByRole('button', { name: 'Pause Game' }).click();
  await page.getByLabel('Typed command fallback').fill('e2 to e4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.locator('.sr-announcement')).toContainText('paused');
  await expect(page.getByRole('gridcell', { name: 'White pawn at e2' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume Game' }).click();

  await page.getByRole('button', { name: 'Flip Board' }).click();
  const firstCell = page.locator('[role="gridcell"]').first();
  await expect(firstCell).toHaveAttribute('aria-label', 'White rook at h1');
  await firstCell.focus();
  await firstCell.press('ArrowRight');
  await expect(page.getByRole('gridcell', { name: 'White knight at g1' })).toBeFocused();
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
});

test('Stockfish produces exactly one reply to a player move', async ({ page }) => {
  await page.goto('/games/chess');
  await page.waitForTimeout(1800);
  await page.getByLabel('Typed command fallback').fill('e2 to e4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history.length, GAME_KEY), { timeout: 2500 }).toBe(2);
  await expect(page.getByText(/Your turn — White to move/).first()).toBeVisible();
  await page.waitForTimeout(1200);
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history.length, GAME_KEY)).toBe(2);
});

test('resignation remains terminal after reload', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, {
    key: GAME_KEY,
    value: savedGame(['e4', 'e5']),
  });
  await page.goto('/games/chess');
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Resign', exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: 'Resignation' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Resignation' })).toBeVisible();
  await page.getByRole('button', { name: 'Review Game' }).click();
  await expect(page.getByRole('dialog', { name: 'Resignation' })).toHaveCount(0);
  await page.getByLabel('Typed command fallback').fill('d2 to d4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.locator('.sr-announcement')).toContainText('already over');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), GAME_KEY);
  expect(saved.result).toEqual({ winner: 'b', reason: 'resign' });
  expect(saved.history).toEqual(['e4', 'e5']);
});

test('corrupt saves and settings recover safely', async ({ page }) => {
  await page.addInitScript(({ gameKey, settingsKey }) => {
    localStorage.setItem(gameKey, JSON.stringify({ version: 3, fen: 'invalid', history: ['e4', 'not-a-move'], result: null, timestamp: Date.now() }));
    localStorage.setItem(settingsKey, JSON.stringify({ gameMode: 'broken', playerColor: 'x', difficulty: 'impossible', boardOrientation: 'sideways', boardTheme: 'invisible', pieceSet: 'missing' }));
  }, { gameKey: GAME_KEY, settingsKey: SETTINGS_KEY });
  await page.goto('/games/chess');
  await expect(page.getByRole('gridcell', { name: 'White king at e1' })).toBeVisible();
  await expect(page.getByLabel('Play as')).toHaveValue('w');
  await expect(page.getByRole('group', { name: 'Saved game choice' })).toHaveCount(0);
});
