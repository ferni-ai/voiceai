/**
 * One screen on first paint, signed out (motion audit 2026-10-29, P8).
 *
 * At normal speed a signed-out visitor used to see the old Home layout ("Ferni /
 * Life Coach", ringed avatar) for ~300 ms, then a cross-fade with a double
 * exposure into the sign-in gate, the avatar jumping; Home then stayed mounted
 * under the gate with its button breathing forever. Here, from navigation
 * until the real gate has been up a while, every frame must show:
 *   - exactly one avatar, and it never moves or resizes;
 *   - never Home;
 *   - no infinite animation running on an element nobody can see;
 *   - no layout shift (CLS 0).
 *
 *   pnpm exec playwright test -c playwright.first-paint.config.ts
 *
 * Set FIRST_PAINT_REPORT=<dir> to save each run's summary and frames as JSON.
 *
 * Web fonts are not served by default. When Inter arrives after first paint,
 * font-display: swap nudges glyphs by a pixel (CLS ~0.0002, text nodes only),
 * whichever screen is up, and when it arrives depends on the network. That is
 * a font-loading question, not this one. FIRST_PAINT_WEB_FONTS=1 serves them.
 * FIRST_PAINT_CPU=4 slows the CPU fourfold, so the copy stays up longer.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { installSampler, summarize, type Capture } from './sampler';

/** The acceptance window is 0-1,000 ms; sample longer so the swap to the real gate is always inside it. */
const SAMPLE_MS = 2500;
const ACCEPT_MS = 1000;

for (const tryFirst of [true, false]) {
  test(`signed out, try-first ${tryFirst ? 'on (prod)' : 'off'}: one screen, one avatar, nothing animating unseen`, async ({
    page,
  }, testInfo) => {
    if (!process.env.FIRST_PAINT_WEB_FONTS) {
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    }
    const cpu = Number(process.env.FIRST_PAINT_CPU ?? 1);
    if (cpu > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    }
    await page.addInitScript((flag) => {
      localStorage.setItem('ferni:flag:try-first', flag);
    }, String(tryFirst));
    await page.addInitScript(installSampler, SAMPLE_MS);
    await page.goto('/');
    await expect(page.locator('.sign-in-gate-overlay')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction((ms) => performance.now() > ms + 100, SAMPLE_MS);
    const capture = await page.evaluate(
      () => (window as unknown as { __firstPaint: Capture }).__firstPaint
    );

    const all = summarize(capture, SAMPLE_MS);
    const window1s = summarize(capture, ACCEPT_MS);
    const dir = process.env.FIRST_PAINT_REPORT;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      const name = `${testInfo.project.name}-try-first-${tryFirst ? 'on' : 'off'}`;
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ window1s, all, capture }, null, 1));
    }
    console.log(testInfo.project.name, `try-first ${tryFirst}`, JSON.stringify({ window1s, all }));

    // The sampler ran, and the real gate came up inside the sampled window
    expect(all.frames, 'frames sampled').toBeGreaterThan(30);
    expect(
      capture.frames.some((f) => f.t <= SAMPLE_MS && f.gate),
      'gate on screen'
    ).toBe(true);
    for (const [label, s] of [
      ['0-1000 ms', window1s],
      [`0-${SAMPLE_MS} ms`, all],
    ] as const) {
      expect(s.homeFrames, `${label}: frames showing the old Home layout`).toBe(0);
      expect(s.framesNotOneAvatar, `${label}: frames without exactly one avatar`).toBe(0);
      expect(
        s.avatarJumpPx,
        `${label}: avatar move/resize between frames (px)`
      ).toBeLessThanOrEqual(1);
      expect(s.hiddenInfinite, `${label}: infinite animations on hidden elements`).toEqual([]);
      expect(s.cls, `${label}: cumulative layout shift`).toBe(0);
    }
  });
}
