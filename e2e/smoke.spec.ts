import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';

const GAME_KEY = 'chess-by-sparsh-save';
const SETTINGS_KEY = 'chess-by-sparsh-settings';

function savedGame(moves: string[]) {
  const game = new Chess();
  for (const move of moves) game.move(move);
  return { version: 3, fen: game.fen(), history: game.history(), result: null, timestamp: Date.now() };
}

test('opens directly on the accessible chess experience', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Voice Chess Companion' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice companion' })).toBeFocused();
  await expect(page.locator('#dashboard-overview')).toContainText('voice controls');
  await expect(page.getByRole('button', { name: 'Hear the quick guide' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip introduction' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Chess board' })).toBeVisible();
  await expect(page.getByLabel('Typed command fallback')).toBeVisible();
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
});

test('typed fallback proposes and confirms a legal move', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Typed command fallback').fill('e2 to e4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.getByRole('group', { name: 'Move confirmation' })).toContainText('e2 to e4');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'White pawn at e4' })).toBeVisible();
});

test('saved game blocks moves until resume and then hides the choice', async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: GAME_KEY,
    value: savedGame(['e4', 'e5']),
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pause Game' })).toBeDisabled();
  await page.getByLabel('Typed command fallback').fill('d2 to d4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.locator('.sr-announcement')).toContainText('Choose Resume or New Game first');
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history, GAME_KEY)).toEqual(['e4', 'e5']);
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(page.getByRole('group', { name: 'Saved game choice' })).toHaveCount(0);
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
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
  await page.waitForTimeout(1800);
  await page.getByLabel('Typed command fallback').fill('e2 to e4');
  await page.getByRole('button', { name: 'Run command' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history.length, GAME_KEY), { timeout: 8000 }).toBe(2);
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
  await page.goto('/');
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
  await page.goto('/');
  await expect(page.getByRole('gridcell', { name: 'White king at e1' })).toBeVisible();
  await expect(page.getByLabel('Play as')).toHaveValue('w');
  await expect(page.getByRole('group', { name: 'Saved game choice' })).toHaveCount(0);
});
