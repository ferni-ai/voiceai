/**
 * The home screen's own controls, outside the settings menu: each opens its
 * screen cleanly and closes on Escape; Connect fails gracefully with no voice
 * server; the command palette works from the keyboard; and the keyboard never reaches
 * a control nobody can see.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  createUser,
  expectHome,
  isGone,
  newPanel,
  rawKeysOnScreen,
  shownDialogs,
  signIn,
  watchProblems,
} from './support';

/** Home-screen buttons that open a screen of their own */
const OPENERS: Record<string, string> = {
  journey: 'button.unified-indicator',
  'daily practice': '#engagementTriggerBtn',
  predictions: '#predictionsTriggerBtn',
  'team insights': '#insightsTriggerBtn',
  'add more agents': '#marketplaceBtn',
};

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

for (const [name, selector] of Object.entries(OPENERS)) {
  test(`home: "${name}" opens and closes cleanly`, async ({ page }) => {
    const button = page.locator(selector);
    test.skip(!(await button.isVisible()), `${name} isn't on this screen size`);
    const problems = watchProblems(page);
    const before = await shownDialogs(page);
    await button.click();

    const panel = await newPanel(page, before, name);
    const id = (await panel.getAttribute('data-e2e-dialog')) as string;
    await expect(panel, `${name} needs an accessible name`).toHaveAccessibleName(/\S/);
    await page.waitForTimeout(1_500); // let it load its data
    expect(await rawKeysOnScreen(page), 'raw i18n keys on screen').toEqual([]);

    await page.keyboard.press('Escape');
    await expect
      .poll(() => isGone(page, id), { message: `${name} did not close on Escape`, timeout: 5_000 })
      .toBe(true);
    expect(problems.take(), `${name} raised problems`).toEqual([]);
  });
}

test('home: tapping the avatar reacts without errors', async ({ page }) => {
  const problems = watchProblems(page);
  // The avatar breathes the whole time, so don't wait for it to hold still
  await page.locator('#coachAvatar').click({ force: true });
  await page.waitForTimeout(1_500);
  expect(problems.take()).toEqual([]);
});

test('Connect with no voice server says so and stays usable', async ({ page }) => {
  // The local stack has no LiveKit; the token call is what a real outage looks like too
  const problems = watchProblems(page);
  const connect = page.locator('#connectBtn');
  await connect.click();
  // Something on screen must tell the person it didn't work...
  await expect(page.getByRole('alert').or(page.locator('[role="status"]:visible')).first()).toBeVisible({
    timeout: 20_000,
  });
  // ...and they can try again
  await expect(connect).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('body')).not.toHaveClass(/connected|in-call/);
  const crashes = problems.take().filter((p) => p.startsWith('pageerror'));
  expect(crashes, 'Connect failure crashed the page').toEqual([]);
});

async function openPalette(page: Page) {
  await expect(page.locator('.command-palette')).toBeAttached(); // created just after load
  const before = await shownDialogs(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  return newPanel(page, before, 'command palette');
}

test('command palette: named, filters as you type, runs a command, closes', async ({ page }) => {
  const problems = watchProblems(page);
  const palette = await openPalette(page);
  await expect(palette, 'the palette needs an accessible name').toHaveAccessibleName(/\S/);

  const input = palette.locator('input').first();
  await expect(input).toBeFocused();
  const options = palette.locator('[role="option"]');
  const all = await options.count();
  expect(all, 'the palette lists commands').toBeGreaterThan(1);

  await input.fill('settings');
  await expect.poll(() => options.count()).toBeLessThan(all);
  await expect(options.first()).toContainText(/settings/i);

  await page.keyboard.press('Enter');
  await expect(page.locator('.settings-menu')).toBeVisible();
  await page.keyboard.press('Escape');

  const again = await openPalette(page);
  const id = (await again.getAttribute('data-e2e-dialog')) as string;
  await page.keyboard.press('Escape');
  await expect.poll(() => isGone(page, id)).toBe(true);
  expect(problems.take()).toEqual([]);
});

test('nothing the keyboard can reach is invisible', async ({ page }) => {
  await page.waitForTimeout(2_500); // let the sign-in screen finish fading out
  const unseen = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')) {
      if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || el.closest('[inert], [hidden]')) continue;
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || (r.width === 0 && r.height === 0)) continue;
      let opacity = 1;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity || 1);
      const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      // The skip link is meant to be invisible until focused, and shows itself when it is
      if ((onScreen && opacity > 0.05) || el.classList.contains('skip-to-content')) continue;
      out.push(`${el.className.toString().split(' ')[0]} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`);
    }
    return out;
  });
  expect(unseen, 'focusable but invisible (hidden UI should be inert)').toEqual([]);
});
