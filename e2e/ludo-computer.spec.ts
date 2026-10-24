import { expect, test } from '@playwright/test';
import { createLudoState, serializeLudo } from '../src/games/ludo/ludo';

const SAVE_KEY = 'voice-game-companion-ludo-save';

test('explicit Ludo orders play immediately and board descriptions are available on request', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto('/games/ludo');
  await page.getByRole('button', { name: 'Roll die' }).click();
  await page.getByLabel('Typed command fallback').fill('move token 2');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.getByRole('group', { name: 'Ludo token confirmation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Your token 2, .*square 0/ })).toBeVisible();
  await page.getByLabel('Typed command fallback').fill('board configuration');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.locator('.sr-announcement')).toContainText('You are red; the computer is yellow');
  await expect(page.locator('.sr-announcement')).toContainText('your token 2 is 0 spaces');
  await expect(page.locator('.sr-announcement')).not.toContainText('"status"');
});

test('chess board configuration describes the actual pieces on request', async ({ page }) => {
  await page.goto('/games/chess');
  await page.getByLabel('Typed command fallback').fill('board configuration');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.locator('.sr-announcement')).toContainText('White king on e1');
  await expect(page.locator('.sr-announcement')).toContainText('Black king on e8');
});

test('computer rolls on page mount and the human can play the following turn', async ({ page }) => {
  const state = createLudoState();
  state.activePlayer = 'computer';
  state.tokens.computer[0].progress = 0;
  await page.addInitScript(({ key, save }) => {
    Math.random = () => 0;
    localStorage.setItem(key, save);
  }, { key: SAVE_KEY, save: serializeLudo(state) });
  await page.goto('/games/ludo');
  await expect.poll(async () => page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!).state;
    return { owner: saved.activePlayer, moves: saved.history.length, progress: saved.tokens.computer[0].progress };
  }, SAVE_KEY)).toEqual({ owner: 'human', moves: 1, progress: 1 });
  await expect(page.getByRole('button', { name: 'Roll die' })).toBeEnabled();
  await page.getByRole('button', { name: 'Roll die' }).click();
  // Human has no token out: the turn passes and the computer must act again.
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.history.length, SAVE_KEY)).toBe(2);
});

test('resumes a saved computer roll, moves, and returns control to the player', async ({ page }) => {
  const state = createLudoState();
  state.activePlayer = 'computer';
  state.phase = 'awaiting-token';
  state.currentRoll = 2;
  state.lastRoll = { player: 'computer', value: 2 };
  state.tokens.computer[0].progress = 0;
  state.history.push({ player: 'human', color: 'red', tokenId: 1, roll: 1, from: 0, to: 1, captured: [], finished: false, entered: false });
  state.tokens.human[0].progress = 1;
  await page.addInitScript(({ key, save }) => localStorage.setItem(key, save), { key: SAVE_KEY, save: serializeLudo(state) });
  await page.goto('/games/ludo');
  await expect(page.getByRole('group', { name: 'Saved Ludo game choice' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume saved game' }).click();
  await expect.poll(async () => page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!).state;
    return { owner: saved.activePlayer, progress: saved.tokens.computer[0].progress, moves: saved.history.length };
  }, SAVE_KEY)).toEqual({ owner: 'human', progress: 2, moves: 2 });
  await expect(page.getByRole('button', { name: 'Roll die' })).toBeEnabled();
});
