/**
 * Text contrast in both themes (WCAG AA via axe color-contrast).
 *
 * Persona, accent and status colors are fill colors; used as text they were
 * unreadable on Midnight (Ferni green on the Midnight cards was ~1:1). The
 * design system now generates theme-aware text inks (--persona-ink,
 * --color-accent-text, --color-semantic-*-text, --persona-text for fills).
 * This keeps the main screens at zero contrast violations in Zen and Midnight.
 *
 * The clock is pinned: the app restyles itself by time of day (data-circadian),
 * so Midnight runs at 01:30, its most adjusted state, and Zen mid-afternoon.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { freshState, mockMemoryApi } from './memory-api-mock';

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
  // "What I remember": each tab, plus an open transcript, with realistic data
  ...(
    [
      ['memories', 'Memories'],
      ['memories: goals & habits', 'Goals & habits'],
      ['memories: goals editor', 'Goals & habits'],
      ['memories: conversations', 'Conversations'],
      ['memories: transcript', 'Conversations'],
      ['memories: your data', 'Your data'],
      ['memories: confirm', 'Your data'],
    ] as const
  ).map(([name, tab]) => ({
    name,
    open: async (page: Page) => {
      await mockMemoryApi(page, freshState());
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('ferni:open-memories')));
      const dialog = page.getByRole('dialog', { name: 'What I remember' });
      await dialog.getByRole('tab', { name: tab }).click();
      if (name === 'memories: transcript') {
        await dialog.locator('[data-conversation-id="c-1"] button').click();
        await dialog.locator('.memory-transcript').waitFor();
      }
      if (name === 'memories: goals editor') {
        await dialog.getByRole('button', { name: 'Edit Run a half marathon' }).click();
        await dialog.getByRole('combobox', { name: 'Status' }).waitFor();
      }
      if (name === 'memories: confirm') {
        await dialog.getByRole('button', { name: 'Delete everything' }).click();
        await page.getByRole('alertdialog').waitFor();
      }
    },
  })),
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

const CLOCK = { zen: '2026-01-15T14:00:00', midnight: '2026-01-15T01:30:00' } as const;

for (const theme of ['zen', 'midnight'] as const) {
  test.describe(`text contrast (${theme})`, () => {
    test.use({ timezoneId: 'UTC' });

    for (const screen of SCREENS) {
      test(screen.name, async ({ page }) => {
        // The memory screens open the panel and click through tabs first
        if (screen.name.startsWith('memories')) test.slow();
        await page.clock.setFixedTime(new Date(`${CLOCK[theme]}Z`));
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
