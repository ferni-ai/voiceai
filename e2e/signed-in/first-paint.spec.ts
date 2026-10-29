/**
 * Signed in, a reload paints Home at once and never the sign-in gate, not even
 * its gate-first copy (motion audit 2026-10-29, P8). The signed-out half, frame
 * by frame on the production build, is apps/web/tests/first-paint.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 * Without the API, E2E_WAITLIST_STUB=1 answers the access check with "approved".
 */
import { expect, test } from '@playwright/test';
import { installSampler, summarize, type Capture } from '../../apps/web/tests/first-paint/sampler';
import { createUser, expectHome, signIn } from './support';

const SAMPLE_MS = 2500;

test('signed in: a reload paints Home at once, never the sign-in gate', async ({ page }) => {
  if (process.env.E2E_WAITLIST_STUB) {
    await page.route('**/api/waitlist/check**', (route) =>
      route.fulfill({ json: { approved: true, status: 'approved' } })
    );
  }
  await signIn(page, await createUser());
  await expectHome(page);
  // Written on sign-in; the head script in index.html reads it before anything paints
  expect(await page.evaluate(() => localStorage.getItem('ferni:session-hint'))).toBe('1');

  await page.addInitScript(installSampler, SAMPLE_MS);
  await page.reload();
  await expectHome(page);
  await page.waitForFunction((ms) => performance.now() > ms + 100, SAMPLE_MS);
  const capture = await page.evaluate(
    () => (window as unknown as { __firstPaint: Capture }).__firstPaint
  );
  const s = summarize(capture, SAMPLE_MS);
  console.log('signed-in reload', JSON.stringify(s));

  expect(s.frames, 'frames sampled').toBeGreaterThan(30);
  expect(s.gateFrames, 'frames showing the sign-in gate or its copy').toBe(0);
  expect(s.homeFrames, 'frames showing Home').toBeGreaterThan(0);
  expect(s.maxAvatars, 'avatars on screen at once').toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.className)).not.toMatch(
    /gate-first|sign-in-gate-up/
  );
});
