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
/** On <html> while the gate's copy (gate-first) or the gate itself (sign-in-gate-up) hides Home */
const GATE_CLASSES = ['gate-first', 'sign-in-gate-up'];

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

  // Wait for the history entry the sign-in gate held to be given back. Back closes
  // an overlay (apps/web/src/utils/back-closes-overlay.ts), so the gate pushed an
  // entry, and once it closed, history.back() pops it RELEASE_MS later. A reload in
  // that window races the traversal and is aborted (net::ERR_ABORTED, menu walk L2
  // 1/3 on 2026-10-29; 3 of 24 local runs).
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (history.state as { ferniOverlay?: boolean } | null)?.ferniOverlay ?? false
        ),
      {
        message: "the sign-in gate's history entry is given back",
      }
    )
    .toBe(false);

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
  // Whole class names: a substring test also caught unrelated classes such as gate-first-try
  const htmlClasses = await page.evaluate(() => [...document.documentElement.classList]);
  expect(
    htmlClasses.filter((c) => GATE_CLASSES.includes(c)),
    'gate classes on <html>'
  ).toEqual([]);
});
