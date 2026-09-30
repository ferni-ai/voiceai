/**
 * Text contrast in both themes (WCAG AA via axe color-contrast).
 *
 * Persona, accent and status colors are fill colors; used as text they were
 * unreadable on Midnight (Ferni green on the Midnight cards was ~1:1). The
 * design system now generates theme-aware text inks (--persona-ink,
 * --color-accent-text, --color-semantic-*-text, --persona-text for fills).
 * This keeps the main screens at zero contrast violations in Zen and Midnight.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const SCREENS: Array<{ name: string; open?: (page: Page) => Promise<void> }> = [
  { name: 'home' },
  {
    name: 'settings menu',
    open: (page) => page.getByRole('button', { name: 'Open settings' }).click(),
  },
  ...['team', 'people', 'practices', 'memory-lane', 'your-story', 'notifications', 'patterns'].map(
    (screen) => ({
      name: screen,
      open: (page: Page) =>
        page.evaluate((e) => window.dispatchEvent(new CustomEvent(e)), `ferni:open-${screen}`),
    })
  ),
];

/** An established user, so every settings section and team member shows. */
async function seedUser(page: Page, theme: 'zen' | 'midnight'): Promise<void> {
  await page.addInitScript((theme) => {
    localStorage.setItem('voiceai-theme', theme);
    localStorage.setItem('ferni:conversation_count', '25');
    localStorage.setItem('ferni:onboarding:complete', 'true');
    localStorage.setItem(
      'ferni_relationship',
      JSON.stringify({
        stage: 'established',
        firstMeetingDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        metrics: {
          totalConversations: 25,
          daysSinceFirstMeeting: 30,
          currentStreak: 5,
          longestStreak: 9,
          milestonesReached: 3,
          insightsShared: 4,
        },
        memories: [],
        lastUpdated: new Date().toISOString(),
      })
    );
  }, theme);
}

for (const theme of ['zen', 'midnight'] as const) {
  test.describe(`text contrast (${theme})`, () => {
    for (const screen of SCREENS) {
      test(screen.name, async ({ page }) => {
        await seedUser(page, theme);
        await page.goto('/');
        await page.locator('#teamRoster .team-member[data-persona-id]').first().waitFor();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        if (screen.open) {
          await screen.open(page);
          // Let open animations settle so axe sees final colors
          await page.waitForTimeout(1200);
        }

        const { violations } = await new AxeBuilder({ page })
          .withRules(['color-contrast'])
          .analyze();
        const failures = violations.flatMap((v) =>
          v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim()}`)
        );
        expect(failures, failures.join('\n')).toEqual([]);
      });
    }
  });
}
