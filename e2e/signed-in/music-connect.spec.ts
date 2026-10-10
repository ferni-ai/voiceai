/**
 * Musical You: Connect for Spotify starts connecting Spotify.
 *
 * It used to send a `ferni:connect-spotify` event no one listened for and close, so nothing
 * happened. The server's answer is stubbed: the test proves the app asks to connect Spotify
 * and goes where the server says, without leaving for Spotify.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test } from '@playwright/test';
import { createUser, expectHome, newPanel, openSettingsMenu, shownDialogs, signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test("Connect for Spotify asks to connect Spotify, and goes where it's sent", async ({ page }) => {
  let asked: Record<string, unknown> | undefined;
  await page.route('**/auth/oauth/start', async (route) => {
    asked = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { url: '/?e2e=spotify-login' } });
  });

  await openSettingsMenu(page);
  const before = await shownDialogs(page);
  await page.locator('.settings-menu [data-action="music-dashboard"]').click();
  const panel = await newPanel(page, before, 'music-dashboard');
  await panel.locator('[data-action="connect-spotify"]').click();

  await expect.poll(() => asked?.provider, { message: 'the app asked the server to connect Spotify' }).toBe('spotify');
  await expect(page, 'and went to the login URL it got back').toHaveURL(/e2e=spotify-login/);
});
