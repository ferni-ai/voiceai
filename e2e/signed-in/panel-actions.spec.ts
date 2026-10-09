/**
 * Doing things inside the panels, not just opening them: what a person
 * changes, writes, copies or exports actually happens, and sticks.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, newPanel, openSettingsMenu, shownDialogs, signIn, watchProblems } from './support';

async function openPanel(page: Page, action: string) {
  await openSettingsMenu(page);
  const before = await shownDialogs(page);
  await page.locator(`.settings-menu [data-action="${action}"]`).click();
  return newPanel(page, before, action);
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('notifications: a changed preference is saved and survives a reload', async ({ page }) => {
  const problems = watchProblems(page);
  let panel = await openPanel(page, 'notifications');
  const pref = () => panel.locator('input[data-pref="ritualReminders"]');
  const was = await pref().isChecked();
  await pref().setChecked(!was);
  await expect(pref()).toHaveAccessibleName(/\S/); // a named switch, not a blank one
  await panel.locator('[data-action="save"]').click(); // changes apply on Save
  await page.waitForTimeout(1_000);

  await page.reload();
  await expectHome(page);
  panel = await openPanel(page, 'notifications');
  await expect(pref()).toBeChecked({ checked: !was });
  expect(problems.take()).toEqual([]);
});

test('invite: Copy puts a working invite link on the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const problems = watchProblems(page);
  const panel = await openPanel(page, 'invite');
  await panel.locator('[data-action="copy"]').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/https?:\/\/\S+/); // a short message with the link in it
  expect(problems.take()).toEqual([]);
});

test('the Chronicle: a written entry is kept', async ({ page }) => {
  const problems = watchProblems(page);
  const words = `e2e entry ${Date.now()}`;
  let panel = await openPanel(page, 'journal');
  await panel.getByRole('button', { name: /capture a thought/i }).click();
  await panel.locator('textarea').first().fill(words);
  await panel.getByRole('button', { name: /save entry/i }).click();
  await page.waitForTimeout(1_500);
  await page.keyboard.press('Escape');

  await page.reload();
  await expectHome(page);
  panel = await openPanel(page, 'journal');
  await expect(panel).toContainText(words, { timeout: 10_000 });
  expect(problems.take()).toEqual([]);
});

test('Take Your Story: Export gives you a file with your data in it', async ({ page }) => {
  const problems = watchProblems(page);
  const panel = await openPanel(page, 'export');
  await panel.locator('[data-format="json"]').click();
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await panel.getByRole('button', { name: 'Export Selected', exact: true }).click();
  const file = await download;
  const text = await (await file.createReadStream())!.toArray().then((c) => Buffer.concat(c).toString('utf8'));
  const data = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(data).length, 'the export has content').toBeGreaterThan(0);
  expect(problems.take()).toEqual([]);
});

test('quiz: answering a question moves it on', async ({ page }) => {
  const problems = watchProblems(page);
  const panel = await openPanel(page, 'knowledge-quiz');
  const first = await panel.textContent();
  await panel.getByRole('button', { name: /all of the above/i }).click();
  await expect.poll(() => panel.textContent(), { timeout: 10_000 }).not.toBe(first);
  expect(problems.take()).toEqual([]);
});

test('every control in these panels has a name', async ({ page }) => {
  const unnamed: string[] = [];
  for (const action of ['journal', 'gift', 'contacts', 'notifications', 'export', 'calendar-settings', 'play-games']) {
    const panel = await openPanel(page, action);
    await page.waitForTimeout(800);
    const found = await panel.evaluate((d, action) =>
      [...d.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]), textarea, select, [role="switch"]')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .filter((e) => {
          const label = (e as HTMLInputElement).labels?.[0]?.textContent?.trim();
          const name = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || label ||
            e.textContent?.trim() || e.getAttribute('title') || e.getAttribute('placeholder');
          return !name;
        })
        .map((e) => `${action}: ${e.tagName.toLowerCase()} ${e.className.toString().split(' ')[0]}`), action);
    unnamed.push(...found);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  expect(unnamed, 'controls a screen reader announces with no name').toEqual([]);
});

test('gift: the seed amounts are announced as amounts', async ({ page }) => {
  const panel = await openPanel(page, 'gift');
  for (const amount of ['10', '25', '50']) {
    await expect(panel.locator(`[data-amount="${amount}"]`)).toHaveAccessibleName(new RegExp(amount));
  }
  await expect(panel.locator('[aria-pressed="true"][data-amount]'), 'the chosen amount is marked').toHaveCount(1);
});
