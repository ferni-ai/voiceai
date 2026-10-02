/**
 * E2E: the "Sensitive" tab of "What I remember" — consent for health, money
 * and beliefs, switching a category off with an offer to delete, health notes
 * and the mood timeline. APIs are mocked statefully, so this runs offline.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { freshState, mockMemoryApi } from './memory-api-mock';
import { freshSensitiveState, mockSensitiveApi, type SensitiveState } from './sensitive-api-mock';

async function openSensitive(page: Page) {
  await page.goto('/');
  await page.locator('#teamRoster .team-member[data-persona-id]').first().waitFor();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ferni:open-memories')));
  const dialog = page.getByRole('dialog', { name: 'What I remember' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'Sensitive' }).click();
  return dialog;
}

test.describe('What I remember: sensitive things', () => {
  let state: SensitiveState;

  test.beforeEach(async ({ page }) => {
    state = freshSensitiveState();
    await mockMemoryApi(page, freshState());
    await mockSensitiveApi(page, state);
  });

  test('asks once, then each category has its own switch', async ({ page }) => {
    const dialog = await openSensitive(page);
    await expect(dialog).toContainText('your health, your money, and what you believe');
    await expect(dialog.getByRole('switch', { name: 'Health & mood' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await expect(dialog.locator('[data-role="safety-note"]')).toContainText('peanut (severe)');

    await dialog.getByRole('button', { name: 'Yes, remember these' }).click();
    await expect(dialog.getByRole('switch', { name: 'Money' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(dialog.getByRole('button', { name: 'Yes, remember these' })).toHaveCount(0);
    await expect(dialog.locator('[data-health-id]')).toContainText('Has asthma');

    await dialog.getByRole('switch', { name: 'Faith & beliefs' }).click();
    await expect(dialog.getByRole('switch', { name: 'Faith & beliefs' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(state.requests).toContainEqual(
      expect.objectContaining({
        method: 'PUT',
        path: '/consent',
        body: expect.objectContaining({ categories: { beliefs: false } }),
      })
    );
  });

  test('switching Health off offers to delete what is stored', async ({ page }) => {
    state.answeredAt = '2026-09-01T00:00:00.000Z';
    state.enabled.health = true;
    const dialog = await openSensitive(page);
    await expect(dialog.getByText("You've seemed in good spirits lately.")).toBeVisible();

    await dialog.getByRole('switch', { name: 'Health & mood' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete what I have?' });
    await expect(confirm).toContainText('allergies stay');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect
      .poll(() =>
        state.requests.some((r) => r.method === 'DELETE' && r.path === '/consent/health/data')
      )
      .toBe(true);
    await expect(dialog.locator('[data-health-id]')).toHaveCount(0);
  });

  test('corrects and forgets a health note', async ({ page }) => {
    state.answeredAt = '2026-09-01T00:00:00.000Z';
    state.enabled.health = true;
    const dialog = await openSensitive(page);

    await dialog.getByRole('button', { name: 'Correct: Has asthma' }).click();
    await dialog.getByRole('textbox', { name: 'Correct this memory' }).fill('Mild asthma');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.locator('[data-health-id]')).toContainText('Mild asthma');

    await dialog.getByRole('button', { name: 'Forget: Mild asthma' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget' }).click();
    await expect(dialog.locator('[data-health-id]')).toHaveCount(0);
  });
});
