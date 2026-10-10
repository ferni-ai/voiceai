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

test('quiz: answering a question shows how you did', async ({ page }) => {
  const problems = watchProblems(page);
  const panel = await openPanel(page, 'knowledge-quiz');
  await panel.locator('.knowledge-quiz-option').first().click(); // questions are random; any answer will do
  await expect(panel.locator('.knowledge-quiz-option--correct, .knowledge-quiz-option--selected').first()).toBeVisible();
  expect(problems.take()).toEqual([]);
});

test('every control in every panel has a name', async ({ page }) => {
  test.setTimeout(120_000);
  const unnamed: string[] = [];
  const panels = ['garden', 'gift', 'invite', 'commands', 'calendar-settings', 'notifications', 'journal',
    'knowledge-quiz', 'music-dashboard', 'play-games', 'vibe-controller', 'contacts', 'family-callers',
    'all-connections', 'theme', 'billing', 'export', 'whats-growing', 'share-ferni', 'help'];
  for (const action of panels) {
    const panel = await openPanel(page, action);
    await page.waitForTimeout(800);
    const found = await panel.evaluate((d, action) =>
      [...d.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]), textarea, select, [role="switch"]')]
        // Shown and reachable: a panel slid away with visibility:hidden can't be focused
        .filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden')
        .filter((e) => {
          const label = (e as HTMLInputElement).labels?.[0]?.textContent?.trim();
          const name = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || label ||
            e.innerText?.trim() || e.getAttribute('title') || e.getAttribute('placeholder'); // innerText: hidden text names nothing
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

/** A US 555 number no earlier run has used */
const freshPhone = () => `+1 555 ${String(Date.now() % 10_000_000).padStart(7, '0')}`;

async function addFamilyMember(page: Page, panel: import('@playwright/test').Locator, name: string, phone: string) {
  await panel.locator('[data-action="add"]').click();
  await panel.getByPlaceholder('e.g., Mom').fill(name);
  await panel.getByPlaceholder('+1 555 123 4567').fill(phone);
  await panel.locator('select').first().selectOption({ index: 1 });
  await panel.locator('[data-action="save-new"]').click();
}

test('family phone access: a number already set up says so, not just "couldn\'t add"', async ({ page }) => {
  const phone = freshPhone();
  const panel = await openPanel(page, 'family-callers');
  await addFamilyMember(page, panel, 'Uncle Lee', phone);
  await expect(panel).toContainText('Uncle Lee', { timeout: 10_000 });
  await addFamilyMember(page, panel, 'Uncle Lee again', phone);
  await expect(page.getByText(/already set up for someone else/i)).toBeVisible({ timeout: 10_000 });
});

test('family phone access: an added family member is listed and kept', async ({ page }) => {
  const problems = watchProblems(page);
  let panel = await openPanel(page, 'family-callers');
  await panel.locator('[data-action="add"]').click();
  await panel.getByPlaceholder('e.g., Mom').fill('Aunt Robin');
  await panel.getByPlaceholder('+1 555 123 4567').fill(freshPhone()); // a number belongs to one identity
  await panel.locator('select').first().selectOption({ index: 1 });
  await panel.locator('[data-action="save-new"]').click();
  await expect(panel).toContainText('Aunt Robin', { timeout: 10_000 });
  await page.keyboard.press('Escape');

  await page.reload();
  await expectHome(page);
  panel = await openPanel(page, 'family-callers');
  await expect(panel, 'kept after a reload').toContainText('Aunt Robin', { timeout: 10_000 });
  expect(problems.take()).toEqual([]);
});

test("people you've told me about: an added person is listed and kept", async ({ page }) => {
  const problems = watchProblems(page);
  let panel = await openPanel(page, 'contacts');
  await panel.locator('[data-action="add-person"]').click();
  const form = page.getByPlaceholder('e.g., Mom, Sarah Chen, Dr. Rivera');
  await form.fill('Sam Okafor');
  await page.locator('[data-relationship="friend"]').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel).toContainText('Sam Okafor', { timeout: 10_000 });
  await page.keyboard.press('Escape');

  await page.reload();
  await expectHome(page);
  panel = await openPanel(page, 'contacts');
  await expect(panel, 'kept after a reload').toContainText('Sam Okafor', { timeout: 10_000 });
  expect(problems.take()).toEqual([]);
});

test("let's play: each game is announced by its name", async ({ page }) => {
  const panel = await openPanel(page, 'play-games');
  const cards = panel.locator('.game-card');
  expect(await cards.count()).toBeGreaterThan(0);
  const names = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(names.filter((n) => /more information/i.test(n)), 'cards all announced as "More information"').toEqual([]);
});
