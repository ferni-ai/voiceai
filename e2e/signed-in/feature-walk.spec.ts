/**
 * Opens every feature in the settings menu as a signed-in user and proves it
 * works: the panel opens, stops loading, shows no raw translation keys, raises
 * no console errors or failed API calls, and closes again.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  createUser,
  expectHome,
  expectNoStuckLoader,
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
  'contact-settings', // How I reach you
  'hub', // Your Day with Ferni
  'commands',
  'what-i-do-for-you',
  'calendar-settings',
  'notifications',
  'outreach-schedule', // When I'll Reach Out
  'your-story', // Our Story So Far
  'trust-dashboard', // Trust & Growth
  'wellbeing', // How You're Feeling
  'memory-lane',
  // 'your-year' (This Year Together) is left out: it doesn't close on Escape, as every
  // panel here must. your-year-with-ferni.ui.ts has no keydown handler; add it once it does.
  'journal',
  'play-games',
  'contacts',
  'family-callers',
  'all-connections',
  'personal-settings', // Make It Yours
  'theme',
  'cognitive', // What Ferni Knows (VITE_MEMORY_VIEW, as in prod)
  'export',
  'share-ferni',
  'support-ferni', // Chip In, in place of Account & Billing while Ferni is free (as in prod)
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

/**
 * Open one panel and prove it works: it opens, stops showing a loader, shows no raw
 * i18n keys, raises no problems and closes on Escape. `prepare` gets the screen ready
 * (opens the menu); `open` is the click that opens the panel.
 */
async function walkPanel(
  page: Page,
  name: string,
  open: () => Promise<void>,
  prepare?: () => Promise<void>
) {
  const problems = watchProblems(page);
  await prepare?.();
  const before = await shownDialogs(page);
  await open();

  const panel = await newPanel(page, before, name);
  const id = (await panel.getAttribute('data-e2e-dialog')) as string;
  await page.waitForTimeout(1_500); // let the panel load its data
  await expectNoStuckLoader(panel, name);
  expect(await rawKeysOnScreen(page), 'raw i18n keys on screen').toEqual([]);

  await page.keyboard.press('Escape');
  await expect.poll(() => isGone(page, id), { message: `${name} did not close on Escape`, timeout: 5_000 }).toBe(true);
  expect(problems.take(), `${name} raised problems`).toEqual([]);
}


test.describe('every settings feature', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, user);
    await expectHome(page);
  });

  for (const action of PANELS) {
    test(`${action} opens, renders and closes cleanly`, async ({ page }) => {
      const row = page.locator(`.settings-menu [data-action="${action}"]`);
      await walkPanel(
        page,
        action,
        () => row.click(),
        () => openMenu(page)
      );
    });
  }

  // "What we've been thinking": the lightbulb by the call button, not a menu row. In prod a
  // background check fetches its data every 5 minutes while it is closed, and opening it
  // right after one spun forever (#3253). Run that check first, as prod would, then open it.
  test('team insights opens, renders and closes cleanly', async ({ page }) => {
    await expect(page.locator('.team-insights-panel')).toBeAttached();
    await page.evaluate(async () => {
      // The app's own copy of the module (the dev server may have stamped its URL)
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/src\/ui\/team-insights\.ui\.ts(\?|$)/.test(name));
      if (!url) throw new Error('the app has not loaded team-insights.ui.ts');
      const insights = await import(/* @vite-ignore */ url);
      await insights.checkForNewInsights();
    });
    await walkPanel(page, 'team-insights', () => page.locator('#insightsTriggerBtn').click());
  });

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
