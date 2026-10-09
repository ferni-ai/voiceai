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
  'garden',
  'gift',
  'invite',
  'commands',
  'calendar-settings',
  'notifications',
  'journal',
  'knowledge-quiz',
  'music-dashboard',
  'play-games',
  'vibe-controller',
  'contacts',
  'family-callers',
  'all-connections',
  'theme',
  'billing',
  'export',
  'whats-growing',
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
      const toggle = page.locator(`.settings-menu [data-action="${action}"]`);
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      await expect(toggle).not.toHaveAttribute('aria-checked', before ?? '');
      await page.reload();
      await expectHome(page);
      await openMenu(page);
      await expect(page.locator(`.settings-menu [data-action="${action}"]`)).not.toHaveAttribute(
        'aria-checked',
        before ?? ''
      );
      expect(problems.take(), `${action} raised problems`).toEqual([]);
    });
  }
});

test('home screen loads without errors', async ({ page }) => {
  const problems = watchProblems(page);
  await signIn(page, user);
  await expectHome(page);
  await page.waitForTimeout(3_000);
  expect(await rawKeysOnScreen(page)).toEqual([]);
  expect(problems.take()).toEqual([]);
});
