/**
 * E2E Tests for "Your Patterns"
 *
 * Both ways in (the settings menu item and the voice agent's
 * ferni:open-patterns event) used to look for an `.app-shell` element that
 * doesn't exist, so nothing happened. They now open the insights in a dialog.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const INSIGHTS = [
  {
    id: 'evening',
    type: 'timing',
    title: 'Evening reflector',
    description: 'You tend to open up after 9pm',
    icon: 'moon',
  },
];

async function mockInsights(page: Page): Promise<void> {
  // apiGet appends ?userId=…
  await page.route(/\/api\/insights\/patterns(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ insights: INSIGHTS, generatedAt: new Date().toISOString() }),
    })
  );
}

/** "Our Story", where the menu item lives, shows from the getting-started stage. */
async function seedReturningUser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const firstMeeting = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('ferni:conversation_count', '3');
    localStorage.setItem('ferni:onboarding:complete', 'true');
    localStorage.setItem(
      'ferni_relationship',
      JSON.stringify({
        stage: 'getting-started',
        firstMeetingDate: firstMeeting,
        metrics: {
          totalConversations: 3,
          daysSinceFirstMeeting: 3,
          currentStreak: 2,
          longestStreak: 2,
          milestonesReached: 0,
          insightsShared: 0,
        },
        memories: [],
        lastUpdated: new Date().toISOString(),
      })
    );
  });
}

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  // Window event listeners are registered once initialization finishes; the
  // rendered roster is a reliable signal for that.
  await page.locator('#teamRoster .team-member[data-persona-id]').first().waitFor();
}

const patternsDialog = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.locator('.pattern-insights-card') });

test.describe('Your Patterns', () => {
  test.beforeEach(async ({ page }) => {
    await mockInsights(page);
  });

  test('opens from the voice agent event', async ({ page }) => {
    await gotoApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ferni:open-patterns')));

    const dialog = patternsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Your Patterns' })).toBeVisible();
    await expect(dialog.getByText('Evening reflector')).toBeVisible();
  });

  test('opens from the settings menu and closes with Escape', async ({ page }) => {
    await seedReturningUser(page);
    await gotoApp(page);

    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.locator('[data-action="pattern-insights"]').first().click();

    const dialog = patternsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('You tend to open up after 9pm')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
