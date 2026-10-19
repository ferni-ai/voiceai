/**
 * The team, for someone who just joined: the whole team is there from the first call,
 * with no locks, unlock hints or progress bars.
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

test('Meet Your Team: the whole team from the first call, with no locks or progress', async ({ page }) => {
  // TEAM_BY_NEED (#1959): everyone is here from the first call, so nothing is locked
  const problems = watchProblems(page);
  const team = await openTeam(page);
  const cards = team.locator('.team-member-card');
  await expect(cards).toHaveCount(6);
  await expect(team.locator('.team-member-card__lock, .team-member-card__hint, [class*="progress"]')).toHaveCount(0);
  await expect(team.locator('.team-member-card--ferni .team-member-card__always')).toBeVisible();
  const maya = cards.filter({ hasText: 'Maya' });
  await expect(maya.locator('.team-member-card__action, .team-member-card__added')).toBeVisible();
  expect(problems.take()).toEqual([]);
});

test('the marketplace shows no progress toward Maya before any conversation', async ({ page }, info) => {
  // Phones hide the team bar and its marketplace button; they reach the marketplace from
  // settings once the whole team is unlocked, and before that it only says "meet your team"
  test.skip(true, 'Meet More Friends (the marketplace) is hidden: apps/web/src/config/menu-visibility.ts');
  test.skip(info.project.name === 'mobile', 'no marketplace button on phones');
  const before = await shownDialogs(page);
  await page.locator('#marketplaceBtn').click();
  const market = await newPanel(page, before, 'marketplace');
  const maya = market.locator('.team-progress-member', { hasText: 'Maya' });
  await expect(maya.locator('.team-progress-percent')).toHaveText('0%');
});
