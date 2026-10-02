/**
 * E2E: the Money section of "What I remember" → Sensitive. Shown only with
 * the Money switch on; notes can be corrected, an amount forgotten, a note
 * forgotten. APIs are mocked statefully, so this runs offline.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { freshFinanceState, mockFinanceApi, type FinanceState } from './finance-api-mock';
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

test.describe('What I remember: money', () => {
  let sensitive: SensitiveState;
  let finance: FinanceState;

  test.beforeEach(async ({ page }) => {
    sensitive = freshSensitiveState();
    sensitive.answeredAt = '2026-09-01T00:00:00.000Z';
    finance = freshFinanceState();
    await mockMemoryApi(page, freshState());
    await mockSensitiveApi(page, sensitive);
    await mockFinanceApi(page, finance, () => sensitive.enabled.finances);
  });

  test('with Money off, only a short line; switching it on shows the notes', async ({ page }) => {
    const dialog = await openSensitive(page);
    const money = dialog.locator('[data-section="money"]');
    await expect(money).toContainText("Money is off, so I'm not keeping money notes.");
    await expect(money.locator('[data-money-id]')).toHaveCount(0);

    await dialog.getByRole('switch', { name: 'Money' }).click();
    await expect(money.locator('[data-money-id]')).toHaveCount(2);
    await expect(money).toContainText('never keep card or account numbers');
    await expect(money).toContainText('$4,000');
    await expect(money).toContainText('In your goals');
  });

  test('corrects a note, forgets the amount, then forgets the note', async ({ page }) => {
    sensitive.enabled.finances = true;
    const dialog = await openSensitive(page);
    const money = dialog.locator('[data-section="money"]');

    await money.getByRole('button', { name: 'Correct: Paying off their credit card' }).click();
    await money.getByRole('textbox', { name: 'Correct this memory' }).fill('Paying down the Visa');
    await money.getByRole('button', { name: 'Save' }).click();
    await expect(money).toContainText('Paying down the Visa');
    await expect(money).toContainText('You corrected this');

    await money.getByRole('button', { name: 'Forget the amount' }).click();
    await expect(money).not.toContainText('$4,000');
    expect(finance.requests).toContainEqual(
      expect.objectContaining({ method: 'PATCH', body: expect.objectContaining({ amount: null }) })
    );

    await money.getByRole('button', { name: 'Forget: Paying down the Visa' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget' }).click();
    await expect(money.locator('[data-money-id]')).toHaveCount(1);
    expect(finance.requests).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: '/fin_aaaaaaaaaaaaaaaaaaaaaaaa' })
    );
  });

  test('money notes keep readable contrast', async ({ page }) => {
    sensitive.enabled.finances = true;
    const dialog = await openSensitive(page);
    await dialog.locator('[data-money-id]').first().waitFor();
    const results = await new AxeBuilder({ page })
      .include('[data-section="money"]')
      .withRules(['color-contrast'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
