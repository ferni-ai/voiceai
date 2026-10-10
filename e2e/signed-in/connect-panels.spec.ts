/**
 * Everything Connected's setup panels (Apple Health, Oura, Eight Sleep, Wearables) are
 * dialogs, and one Escape closes only the one on top.
 *
 * Before: Apple Health, Oura and Eight Sleep each closed on any Escape through their own
 * listener, so one press closed them and Everything Connected under them. Wearables had no
 * Escape at all, so the press closed Everything Connected and left Wearables on top. Eight
 * Sleep wasn't announced as a dialog.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, isGone, newPanel, openSettingsMenu, shownDialogs, signIn, watchProblems } from './support';

async function openHub(page: Page) {
  await openSettingsMenu(page);
  const before = await shownDialogs(page);
  await page.locator('.settings-menu [data-action="all-connections"]').click();
  const hub = await newPanel(page, before, 'everything connected');
  return { hub, id: (await hub.getAttribute('data-e2e-dialog')) as string };
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

for (const id of ['apple-health', 'oura', 'eight-sleep', 'wearables']) {
  test(`${id}: a named dialog, and one Escape closes only it`, async ({ page }) => {
    const problems = watchProblems(page);
    const { hub, id: hubId } = await openHub(page);
    const before = await shownDialogs(page);
    await hub.locator(`[data-connect="${id}"]`).click();
    const panel = await newPanel(page, before, id);
    const panelId = (await panel.getAttribute('data-e2e-dialog')) as string;

    await expect(panel, 'announced as a dialog').toHaveAttribute('role', 'dialog');
    await expect(panel).toHaveAccessibleName(/\S/);

    await page.keyboard.press('Escape');
    await expect.poll(() => isGone(page, panelId), { message: `${id} closed` }).toBe(true);
    await page.waitForTimeout(400);
    expect(await isGone(page, hubId), 'Everything Connected is still open under it').toBe(false);

    await page.keyboard.press('Escape');
    await expect.poll(() => isGone(page, hubId), { message: 'then Everything Connected closes' }).toBe(true);
    // A missing Apple Health summary is the normal "no data yet" answer, not a failure
    expect(problems.take().filter((p) => !/apple-health\/summary|eight-sleep\/status/.test(p))).toEqual([]);
  });
}
