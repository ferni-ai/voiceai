/**
 * Opens every feature in the settings menu as a signed-in user and proves it
 * works: the panel opens, shows no raw translation keys, raises no console
 * errors or failed API calls, and closes again.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test } from '@playwright/test';
import {
  createUser,
  expectHome,
  isGone,
  newPanel,
  openSettingsMenu,
  rawKeysOnScreen,
  shownDialogs,
  signIn,
  watchProblems,
  type TestUser,
} from './support';

/** data-action of each settings-menu row that opens a panel */
const PANELS = [
  'commands',
  'calendar-settings',
  'notifications',
  'journal',
  'play-games',
  'contacts',
  'family-callers',
  'all-connections',
  'theme',
  'billing',
  'export',
  'share-ferni',
  'help',
];

const TOGGLES = ['toggle-transcription', 'toggle-sounds'];

// A fresh person per test: one shared account signing in ~50 times in a few minutes
// hits the per-user API limit (100/min), which no real person comes near.
let user: TestUser;

test.beforeEach(async () => {
  user = await createUser();
});

const openMenu = openSettingsMenu;


test.describe('every settings feature', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, user);
    await expectHome(page);
  });

  for (const action of PANELS) {
    test(`${action} opens, renders and closes cleanly`, async ({ page }) => {
      const problems = watchProblems(page);
      await openMenu(page);
      const before = await shownDialogs(page);
      await page.locator(`.settings-menu [data-action="${action}"]`).click();

      const panel = await newPanel(page, before, action);
      const id = (await panel.getAttribute('data-e2e-dialog')) as string;
      await page.waitForTimeout(1_500); // let the panel load its data
      expect(await rawKeysOnScreen(page), 'raw i18n keys on screen').toEqual([]);

      await page.keyboard.press('Escape');
      await expect.poll(() => isGone(page, id), { message: `${action} did not close on Escape`, timeout: 5_000 }).toBe(true);
      expect(problems.take(), `${action} raised problems`).toEqual([]);
    });
  }

  for (const action of TOGGLES) {
    test(`${action} switches and remembers its state`, async ({ page }) => {
      const problems = watchProblems(page);
      await openMenu(page);
      const toggle = page.locator(`.settings-menu [data-action="${action}"][role="switch"]`);
      const before = await toggle.getAttribute('aria-checked');
      expect(['true', 'false'], `${action} has no on/off state`).toContain(before);
      const after = before === 'true' ? 'false' : 'true';
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', after);
      await page.reload();
      await expectHome(page);
      await openMenu(page);
      await expect(toggle, `${action} forgot its state on reload`).toHaveAttribute('aria-checked', after);
      // The keyboard toggles it back
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-checked', before as string);
      expect(problems.take(), `${action} raised problems`).toEqual([]);
    });
  }
});

// Seth, 2026-10-17: no relationship-stage locks. Everything is open from the first call.
test.describe('a first-call user', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, user);
    await expectHome(page);
  });

  test('sees nothing locked and no stage bar, and History opens', async ({ page }) => {
    const problems = watchProblems(page);
    await openMenu(page);
    await expect(page.locator('.settings-menu [data-locked], .settings-menu [aria-disabled="true"]')).toHaveCount(0);
    await expect(page.locator('.settings-menu__stage-banner')).toHaveCount(0);

    const before = await shownDialogs(page);
    await page.locator('.settings-menu [data-action="history"]').click();
    const panel = await newPanel(page, before, 'history');
    const id = (await panel.getAttribute('data-e2e-dialog')) as string;
    await page.keyboard.press('Escape');
    await expect.poll(() => isGone(page, id), { message: 'history did not close on Escape', timeout: 5_000 }).toBe(true);
    expect(problems.take(), 'history raised problems').toEqual([]);
  });

  // Hidden on purpose (apps/web/src/config/menu-visibility.ts, Seth 2026-10-17)
  const HIDDEN = ['ritual', 'knowledge-quiz', 'music-dashboard', 'vibe-controller', 'discover-agents',
    'household-members', 'voice-id-settings', 'whats-growing'];

  test('the menu shows no hidden row', async ({ page }) => {
    await openMenu(page);
    await expect(page.locator('.settings-menu [data-action="journal"]')).toBeVisible();
    for (const action of HIDDEN) {
      await expect(page.locator(`.settings-menu [data-action="${action}"]`), action).toHaveCount(0);
    }
  });
});

test('home screen loads without errors', async ({ page }) => {
  const problems = watchProblems(page);
  await signIn(page, user);
  await expectHome(page);
  await page.waitForTimeout(3_000);
  expect(await rawKeysOnScreen(page)).toEqual([]);
  expect(problems.take()).toEqual([]);
});
