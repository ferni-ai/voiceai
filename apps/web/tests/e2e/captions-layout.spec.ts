/**
 * Captions v2 layout contract, in a real browser (dev server only: the
 * overlay gallery's `captions` scene connects and streams a long user line
 * and a long Ferni line).
 *
 * - the caption region (words + moment chip) sits in the persona's slot,
 *   under the name (beside it in the landscape row), and never intersects
 *   the name, the avatar, the voice waveform, the team roster or the controls
 * - the AI companion pill (#928) stays visible beside it
 * - no caption line is clipped inside itself (scrollHeight <= clientHeight,
 *   scrollWidth <= clientWidth): text wraps, it is never ellipsized
 *
 *   npx playwright test tests/e2e/captions-layout.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop 1440x900', width: 1440, height: 900, mobile: false },
  { name: 'phone 390x844', width: 390, height: 844, mobile: true },
  { name: 'phone landscape 844x390', width: 844, height: 390, mobile: true },
];

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const vp of VIEWPORTS) {
  test(`captions sit in the persona slot, clear of everything, at ${vp.name}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('ferni:flag:captions-v2', 'true');
      localStorage.setItem('ferni_show_transcription', 'true');
    });
    await page.goto('/?e2e=1&gallery=overlays&scene=caption-moments');
    await page.waitForFunction(
      () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready
    );
    await expect(page.locator('.ferni-captions.ferni-captions--visible')).toBeVisible();
    await expect(page.locator('.ferni-captions .ferni-moment')).toHaveCount(1);
    await page.waitForTimeout(500); // layout follows the connect transition

    const geometry = await page.evaluate(() => {
      // Boxes with no area (e.g. a roster hidden on phones) can't collide.
      const box = (selector: string): Box | null => {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0
          ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
          : null;
      };
      const lines = [
        ...document.querySelectorAll<HTMLElement>(
          '.ferni-captions .ferni-caption-line, .ferni-captions .ferni-moment'
        ),
      ];
      return {
        captions: box('.ferni-captions'),
        aiPill: box('.ai-companion-label'),
        others: {
          name: box('#personaName'),
          avatar: box('.avatar-container'),
          waveform: box('#waveformContainer'),
          roster: box('#teamRoster'),
          controls: box('.controls-row'),
          aiPill: box('.ai-companion-label'),
        },
        clipped: lines
          .filter((l) => l.scrollHeight > l.clientHeight || l.scrollWidth > l.clientWidth)
          .map((l) => l.textContent?.slice(0, 40)),
        overflow: lines.map((l) => getComputedStyle(l).textOverflow),
        // A chip is one line; two lines read like a toast.
        multiLineChips: [...document.querySelectorAll<HTMLElement>('.ferni-captions .ferni-moment')]
          .filter((c) => c.clientHeight >= 2 * parseFloat(getComputedStyle(c).lineHeight))
          .map((c) => c.textContent),
      };
    });

    const captions = geometry.captions as Box;
    expect(captions).not.toBeNull();
    expect(geometry.others.avatar).not.toBeNull();
    expect(geometry.others.waveform).not.toBeNull();
    expect(geometry.aiPill).not.toBeNull(); // #928: the AI label never hides
    const hits = Object.entries(geometry.others)
      .filter(([, other]) => other && intersects(captions, other))
      .map(([name]) => name);
    expect(hits).toEqual([]);
    expect(geometry.clipped).toEqual([]);
    expect(geometry.multiLineChips).toEqual([]);
    expect(geometry.overflow.every((v) => v !== 'ellipsis')).toBe(true);
    await context.close();
  });
}

test('captions start off on a call and one tap on the captions button shows them', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ferni:flag:captions-v2', 'true'));
  await page.goto('/?e2e=1&gallery=overlays&scene=captions');
  await page.waitForFunction(
    () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready
  );
  await expect(page.locator('.ferni-captions--visible')).toHaveCount(0);
  const toggle = page.locator('.ferni-captions-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ferni-captions.ferni-captions--visible')).toBeVisible();
});
