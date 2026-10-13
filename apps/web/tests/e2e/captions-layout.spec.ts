/**
 * Captions v2 layout contract, in a real browser (dev server only: the
 * overlay gallery's `captions` scene connects and streams a long user line
 * and a long Ferni line).
 *
 * - the caption region never intersects the avatar's box
 * - it sits above the call controls
 * - no caption line is clipped inside itself (scrollHeight <= clientHeight,
 *   scrollWidth <= clientWidth): text wraps, it is never ellipsized
 * - on a phone and a desktop, light and dark, once the call has settled it is
 *   showing and covers nothing else that is on screen in a call: the persona
 *   name, the persona picker under it (#teamRoster), the waveform or the
 *   controls; and it stays put when the picker or a status pill mounts late
 *
 *   npx playwright test tests/e2e/captions-layout.spec.ts --project=chromium
 */

import { expect, test, type Page } from '@playwright/test';

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

/** What a call shows besides the captions; none of it may sit under them. */
const IN_CALL = [
  '.avatar-container',
  '#personaName',
  '.ai-companion-label-row',
  '#teamRoster',
  '#waveformContainer',
  '.controls-row',
];

for (const vp of VIEWPORTS) {
  test(`captions stay clear of the avatar and unclipped at ${vp.name}`, async ({ browser }) => {
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
    await page.goto('/?e2e=1&gallery=overlays&scene=captions');
    await page.waitForFunction(
      () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready
    );
    await expect(page.locator('.ferni-captions.ferni-captions--visible')).toBeVisible();
    await page.waitForTimeout(500); // layout follows the connect transition

    const geometry = await page.evaluate(() => {
      const box = (selector: string): Box | null => {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
      };
      const lines = [
        ...document.querySelectorAll<HTMLElement>('.ferni-captions .ferni-caption-line'),
      ];
      return {
        captions: box('.ferni-captions'),
        avatar: box('.avatar-container'),
        controls: box('.controls-row'),
        clipped: lines
          .filter((l) => l.scrollHeight > l.clientHeight || l.scrollWidth > l.clientWidth)
          .map((l) => l.textContent?.slice(0, 40)),
        overflow: lines.map((l) => getComputedStyle(l).textOverflow),
      };
    });

    expect(geometry.captions).not.toBeNull();
    expect(geometry.avatar).not.toBeNull();
    expect(intersects(geometry.captions as Box, geometry.avatar as Box)).toBe(false);
    if (geometry.controls) {
      expect(geometry.captions!.bottom).toBeLessThanOrEqual(geometry.controls.top);
    }
    expect(geometry.clipped).toEqual([]);
    expect(geometry.overflow.every((v) => v !== 'ellipsis')).toBe(true);
    await context.close();
  });
}

/** Captions box and every in-call element it overlaps, or null when captions are not showing. */
async function probe(page: Page): Promise<{ box: Box; hits: string[] } | null> {
  return page.evaluate((selectors) => {
    const shown = (el: Element | null): DOMRect | null => {
      if (!el || getComputedStyle(el).visibility !== 'visible') return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const c = shown(document.querySelector('.ferni-captions.ferni-captions--visible'));
    if (!c) return null;
    const hits = selectors.filter((selector) => {
      const r = shown(document.querySelector(selector));
      return (
        r !== null && c.left < r.right && r.left < c.right && c.top < r.bottom && r.top < c.bottom
      );
    });
    return { box: { top: c.top, bottom: c.bottom, left: c.left, right: c.right }, hits };
  }, IN_CALL);
}

/** The connect transition grows the avatar and moves the stack: wait until the captions hold still. */
async function settled(page: Page): Promise<{ box: Box; hits: string[] }> {
  let last = '';
  let still = 0;
  for (let i = 0; i < 60 && still < 5; i++) {
    const now = JSON.stringify(await probe(page));
    still = now === last ? still + 1 : 0;
    last = now;
    await page.waitForTimeout(100);
  }
  const result = await probe(page);
  expect(result, 'captions are showing once the call has settled').not.toBeNull();
  return result!;
}

for (const vp of VIEWPORTS.slice(0, 2)) {
  for (const theme of ['light', 'dark'] as const) {
    test(`captions cover nothing else in the call at ${vp.name}, ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        colorScheme: theme,
      });
      const page = await context.newPage();
      await page.addInitScript(
        (dataTheme) => {
          localStorage.setItem('ferni:flag:captions-v2', 'true');
          localStorage.setItem('ferni_show_transcription', 'true');
          document.documentElement.setAttribute('data-theme', dataTheme);
        },
        theme === 'dark' ? 'midnight' : 'zen'
      );
      await page.goto('/?e2e=1&gallery=overlays&scene=captions');
      await page.waitForFunction(
        () =>
          (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready
      );

      const before = await settled(page);
      expect(before.hits).toEqual([]);

      // Late in the call the picker re-renders and a status pill shows: nothing moves.
      await page.evaluate(() => {
        const roster = document.getElementById('teamRoster');
        const card = roster?.firstElementChild?.cloneNode(true);
        if (roster && card) roster.append(card);
        document.getElementById('messageContainer')?.classList.add('visible');
      });
      const after = await settled(page);
      expect(after.hits).toEqual([]);
      expect(after.box).toEqual(before.box);
      await context.close();
    });
  }
}
