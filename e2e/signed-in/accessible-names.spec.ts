/**
 * Buttons are announced by what they are. A bulk pass once stamped generic
 * labels ("Go forward", "More information") over buttons that already had text,
 * and in places left code behind as the label (") || '5 seeds'}"). The label
 * wins over the text, so a screen reader heard the stamp, not the button.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, newPanel, openSettingsMenu, shownDialogs, signIn } from './support';

const GENERIC = /^(go forward|more information|go back)$/i;
const CODE = /\|\||\$\{|=>|^\(\)$|\)\s*\|\|/;

async function badNames(page: Page, scope: string): Promise<string[]> {
  return page.locator(scope).evaluate((root, patterns) => {
    const generic = new RegExp(patterns.generic, 'i');
    const code = new RegExp(patterns.code);
    return [...root.querySelectorAll<HTMLElement>('button, [role="button"]')]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .flatMap((b) => {
        const label = b.getAttribute('aria-label')?.trim() ?? '';
        const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (label && code.test(label)) return [`code as a name: "${label}"`];
        if (label && generic.test(label) && text) return [`"${label}" hides "${text.slice(0, 40)}"`];
        return [];
      });
  }, { generic: GENERIC.source, code: CODE.source });
}

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

for (const action of ['whats-growing', 'calendar-settings', 'contacts', 'all-connections', 'journal']) {
  test(`${action}: every button is announced by what it is`, async ({ page }) => {
    const panel = await openPanel(page, action);
    await page.waitForTimeout(1_200);
    const id = await panel.getAttribute('data-e2e-dialog');
    expect(await badNames(page, `[data-e2e-dialog="${id}"]`)).toEqual([]);
  });
}

test('importing contacts: each source is announced by name', async ({ page }) => {
  const panel = await openPanel(page, 'contacts');
  const before = await shownDialogs(page);
  await panel.locator('[data-action="import-contacts"]').click();
  const sheet = await newPanel(page, before, 'import contacts');
  const id = await sheet.getAttribute('data-e2e-dialog');
  expect(await badNames(page, `[data-e2e-dialog="${id}"]`)).toEqual([]);
});
