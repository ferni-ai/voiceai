/**
 * The team, for someone who just joined: nobody is shown as partly unlocked, and what it
 * takes to unlock each teammate matches the rules that actually unlock them.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, menuTrigger, newPanel, shownDialogs, signIn, watchProblems } from './support';

/** Meet Your Team: key 2 on a keyboard, the quick-actions sheet on a phone */
async function openTeam(page: Page) {
  const before = await shownDialogs(page);
  const viaSheet = await menuTrigger(page).evaluate((el) => el.classList.contains('mobile-menu-trigger'));
  if (viaSheet) {
    await menuTrigger(page).click();
    await page.locator('.mobile-bottom-sheet [data-action="team"]').click();
  } else {
    // Shortcuts start a moment after the home screen: press until the panel opens
    await expect
      .poll(async () => {
        await page.keyboard.press('2');
        return (await shownDialogs(page)).some((id) => !before.includes(id));
      })
      .toBe(true);
  }
  return newPanel(page, before, 'team');
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('Meet Your Team: no progress before any conversation, and the real requirements', async ({ page }) => {
  const problems = watchProblems(page);
  const team = await openTeam(page);
  const maya = team.locator('.team-member-card', { hasText: 'Maya' });
  await expect(maya.locator('.team-member-card__hint'), 'the rule is 10 conversations').toContainText('10');
  const fills = await team
    .locator('.team-member-card__progress-fill')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.width));
  expect(fills.length, 'locked teammates show progress').toBeGreaterThan(0);
  expect(new Set(fills), 'a new person has made no progress toward anyone').toEqual(new Set(['0%']));
  expect(problems.take()).toEqual([]);
});

test('the marketplace shows no progress toward Maya before any conversation', async ({ page }, info) => {
  // Phones hide the team bar and its marketplace button; they reach the marketplace from
  // settings once the whole team is unlocked, and before that it only says "meet your team"
  test.skip(info.project.name === 'mobile', 'no marketplace button on phones');
  const before = await shownDialogs(page);
  await page.locator('#marketplaceBtn').click();
  const market = await newPanel(page, before, 'marketplace');
  const maya = market.locator('.team-progress-member', { hasText: 'Maya' });
  await expect(maya.locator('.team-progress-percent')).toHaveText('0%');
});
