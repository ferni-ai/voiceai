/**
 * E2E: "What I remember" (the memory control panel).
 *
 * Users see what Ferni has stored about them from /api/memory/me/**, correct
 * or forget facts, read and delete conversations, export everything and wipe
 * it all. The API is mocked statefully in the page, so this runs offline.
 */

import type { Page } from '@playwright/test';
import { test, expect, DEV_AUTH_USER } from './fixtures';
import { freshState, mockMemoryApi, type MockState } from './memory-api-mock';

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#teamRoster .team-member[data-persona-id]').first().waitFor();
}

async function openPanel(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ferni:open-memories')));
  await expect(panel(page)).toBeVisible();
}

const panel = (page: Page) => page.getByRole('dialog', { name: 'What I remember' });

test.describe('What I remember', () => {
  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = freshState();
    await mockMemoryApi(page, state);
  });

  test('opens from the settings menu and shows facts by category and people', async ({ page }) => {
    await gotoApp(page);
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.locator('[data-action="conversation-memory"]').first().click();

    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Memories' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(dialog.getByRole('heading', { name: 'Interests' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Work' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'People' })).toBeVisible();

    const hike = dialog.locator('[data-fact-id="f-hike"]');
    await expect(hike).toContainText('Loves hiking on weekends');
    await expect(hike).toContainText('From 2 conversations');
    await expect(hike).toContainText('Learned September 12, 2026');
    await expect(dialog.locator('[data-fact-id="f-job"]')).toContainText('You corrected this');
    await expect(dialog.locator('[data-person-id="p-sarah"]')).toContainText('Sister');

    // Search narrows the list
    await dialog.getByRole('searchbox', { name: 'Search memories' }).fill('nurse');
    await expect(dialog.locator('[data-fact-id="f-job"]')).toBeVisible();
    await expect(dialog.locator('[data-fact-id="f-hike"]')).toHaveCount(0);

    // Escape closes and focus returns to the page
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('corrects a fact inline', async ({ page }) => {
    await gotoApp(page);
    await openPanel(page);
    const dialog = panel(page);

    await dialog.getByRole('button', { name: 'Correct: Loves hiking on weekends' }).click();
    const field = dialog.getByRole('textbox', { name: 'Correct this memory' });
    await expect(field).toBeFocused();
    await field.fill('Loves trail running on weekends');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const item = dialog.locator('[data-fact-id="f-hike"]');
    await expect(item).toContainText('Loves trail running on weekends');
    await expect(item).toContainText('You corrected this');
    expect(state.requests).toContainEqual(
      expect.objectContaining({
        method: 'PATCH',
        path: '/facts/f-hike',
        body: expect.objectContaining({
          text: 'Loves trail running on weekends',
          category: 'interests',
        }),
      })
    );
  });

  test('forgets a fact after confirming', async ({ page }) => {
    await gotoApp(page);
    await openPanel(page);
    const dialog = panel(page);

    await dialog.getByRole('button', { name: 'Forget: Loves hiking on weekends' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Forget this?' });
    await expect(confirm).toBeVisible();
    // Destructive dialogs start on Cancel; Escape closes only the dialog
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-fact-id="f-hike"]')).toHaveCount(1);

    await dialog.getByRole('button', { name: 'Forget: Loves hiking on weekends' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget' }).click();
    await expect(dialog.locator('[data-fact-id="f-hike"]')).toHaveCount(0);
    await expect
      .poll(() => state.requests.some((r) => r.method === 'DELETE' && r.path === '/facts/f-hike'))
      .toBe(true);
  });

  test('reads a conversation transcript and deletes it', async ({ page }) => {
    await gotoApp(page);
    await openPanel(page);
    const dialog = panel(page);

    await dialog.getByRole('tab', { name: 'Conversations' }).click();
    const row = dialog.locator('[data-conversation-id="c-1"]');
    await expect(row).toContainText('We talked about your night shifts and sleep');
    await expect(row).toContainText('2 messages');
    await expect(dialog.locator('[data-conversation-id="c-2"]')).toContainText('Maya');

    await row.getByRole('button').click();
    const transcript = dialog.locator('.memory-transcript');
    await expect(transcript.getByRole('heading', { name: 'With Ferni' })).toBeFocused();
    const turns = transcript.getByRole('listitem');
    await expect(turns.nth(0)).toContainText('You');
    await expect(turns.nth(0)).toContainText("I can't sleep after night shifts");
    await expect(turns.nth(1)).toContainText('Ferni');
    await expect(turns.nth(1)).toContainText('That sounds exhausting.');

    await transcript.getByRole('button', { name: 'Delete conversation' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete this conversation?' });
    await expect(confirm).toContainText(
      'Anything I learned only from this conversation will be forgotten too'
    );
    await confirm.getByRole('button', { name: 'Delete' }).click();

    await expect(dialog.locator('[data-conversation-id="c-1"]')).toHaveCount(0);
    await expect(dialog.locator('[data-conversation-id="c-2"]')).toBeVisible();
    expect(state.requests).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: '/conversations/c-1' })
    );
  });

  test('exports memories as JSON and CSV downloads', async ({ page }) => {
    await gotoApp(page);
    await openPanel(page);
    const dialog = panel(page);
    await dialog.getByRole('tab', { name: 'Your data' }).click();

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Download JSON' }).click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toBe('ferni-memories.json');

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Download CSV' }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toBe('ferni-memories.csv');
  });

  test('deletes everything only after typing DELETE', async ({ page }) => {
    await gotoApp(page);
    await openPanel(page);
    const dialog = panel(page);
    await dialog.getByRole('tab', { name: 'Your data' }).click();
    await dialog.getByRole('button', { name: 'Delete everything' }).click();

    const confirm = page.getByRole('alertdialog', { name: 'Delete everything I remember?' });
    const field = confirm.getByRole('textbox', { name: 'Type DELETE to confirm' });
    const go = confirm.getByRole('button', { name: 'Delete everything' });
    await expect(field).toBeFocused();
    await expect(go).toBeDisabled();
    await field.fill('delete');
    await expect(go).toBeDisabled();
    await field.fill('DELETE');
    await go.click();

    await expect(confirm).toBeHidden();
    await expect
      .poll(() => state.requests.find((r) => r.method === 'DELETE' && r.path === '/')?.body)
      .toEqual({ confirm: 'DELETE' });

    await dialog.getByRole('tab', { name: 'Memories' }).click();
    await expect(dialog.getByText("We're just getting to know each other")).toBeVisible();
  });

  test('shows a warm error with retry when memories fail to load', async ({ page }) => {
    state.failMemories = true;
    await gotoApp(page);
    await openPanel(page);
    const dialog = panel(page);
    await expect(dialog.getByText("I couldn't reach my memories just now.")).toBeVisible();

    state.failMemories = false;
    await dialog.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog.locator('[data-fact-id="f-hike"]')).toBeVisible();
  });

  test('anonymous users are invited to sign in', async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('ferni_dev_auth_user', JSON.stringify({ uid: user.uid }));
    }, DEV_AUTH_USER);
    await gotoApp(page);
    await openPanel(page);
    await expect(panel(page).getByText('these memories live only on this device')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
