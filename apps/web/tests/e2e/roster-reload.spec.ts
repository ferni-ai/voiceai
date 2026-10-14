/**
 * E2E: the teammates a user added are still in the team bar after a reload.
 *
 * The roster preferences service only read localStorage in
 * initRosterPreferences(), and nothing called it, so every page load started
 * from "Ferni only" and the next "+" overwrote what had been saved. Runs with
 * the stable roster both off and on (?roster_stable=0/1). The APIs are mocked
 * so the test needs only the Vite dev server.
 */

import { expect, test, type Page } from '@playwright/test';

const TEAM = [
  { id: 'ferni', name: 'Ferni', isCoordinator: true },
  { id: 'alex-chen', name: 'Alex Chen' },
  { id: 'jordan-taylor', name: 'Jordan Taylor' },
  { id: 'maya-santos', name: 'Maya Santos' },
  { id: 'nayan-patel', name: 'Nayan Patel' },
  { id: 'peter-john', name: 'Peter John' },
];
const PREFS_KEY = 'ferni_roster_prefs';
const SHOTS = process.env.ROSTER_SHOTS_DIR;

async function membersInBar(page: Page): Promise<string[]> {
  return page
    .locator('#teamRoster [data-persona-id]:not(.team-member--addable)')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-persona-id') ?? ''));
}

async function savedMembers(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw) as { addedMembers?: string[] }).addedMembers ?? []) : [];
  }, PREFS_KEY);
}

for (const stable of ['0', '1']) {
  test.describe(`Team bar after reload (roster_stable=${stable})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/agents**', (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            agents: TEAM.map((a) => ({ isCoordinator: false, colors: null, ...a })),
          }),
        })
      );
      // Nobody unlocked, so the unlock sync adds no one and the bar shows only the saved roster.
      await page.route('**/api/relationship/team-unlocks**', (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ teamByNeed: false, tier: 'free' }),
        })
      );
      // Seed once: a later reload must read what the page itself saved.
      await page.addInitScript((key) => {
        if (sessionStorage.getItem('roster-seeded')) return;
        sessionStorage.setItem('roster-seeded', '1');
        localStorage.setItem('ferni_user_id', 'e2e-roster-reload');
        localStorage.setItem(
          key,
          JSON.stringify({ addedMembers: ['nayan-patel', 'maya-santos'], isFirstVisit: false })
        );
      }, PREFS_KEY);
    });

    test('saved teammates come back, and adding one keeps the others', async ({ page }) => {
      await page.goto(`/?e2e=1&roster_stable=${stable}`);
      await page.waitForSelector('#teamRoster [data-persona-id="ferni"]');
      await expect.poll(() => membersInBar(page)).toEqual(['ferni', 'maya-santos', 'nayan-patel']);
      if (SHOTS)
        await page
          .locator('#teamRoster')
          .screenshot({ path: `${SHOTS}/roster-reload-stable${stable}-loaded.png` });

      // Add Jordan (what the "+" and the marketplace call), then reload: all three are still there.
      await page.evaluate(async () => {
        const { rosterPreferences } = await import('/src/services/roster-preferences.service.ts');
        rosterPreferences.addMember('jordan-taylor');
      });
      await expect
        .poll(() => savedMembers(page))
        .toEqual(['nayan-patel', 'maya-santos', 'jordan-taylor']);

      await page.reload();
      await page.waitForSelector('#teamRoster [data-persona-id="ferni"]');
      await expect
        .poll(() => membersInBar(page))
        .toEqual(['ferni', 'maya-santos', 'jordan-taylor', 'nayan-patel']);
      if (SHOTS)
        await page
          .locator('#teamRoster')
          .screenshot({ path: `${SHOTS}/roster-reload-stable${stable}-after-add.png` });
    });
  });
}
