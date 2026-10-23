/**
 * Built Ferni homepage, served as the real Eleventy output.
 * Dark mode follows the system. Light mode stays on paper.
 */

import { expect, test, type Page } from '@playwright/test';

import { keepOffProdApi, serveBuiltSite, type BuiltSite } from './built-site-server';
import { installColourReader, type Rgba } from './computed-colour';

const PORT = 8766;
const SITE = `http://127.0.0.1:${PORT}`;

let site: BuiltSite | undefined;

// The homepage restyles itself by the visitor's local hour (late night is
// 00:00 to 05:00), so every check pins the clock instead of using CI's.
const HOURS = { night: '2026-10-17T00:30:00Z', day: '2026-10-17T12:00:00Z' } as const;

async function openAt(page: Page, url: string, when: string, scheme: 'light' | 'dark') {
  await page.clock.setFixedTime(new Date(when));
  await page.emulateMedia({ colorScheme: scheme });
  return page.goto(url);
}

interface PageColors {
  bodyBg: string;
  headline: number;
  buttonBg: string;
  buttonColor: string;
  button: number;
  sheet: string | null;
}

async function readPage(page: Page): Promise<PageColors> {
  await installColourReader(page);
  return page.evaluate(() => {
    const reader = window.ferniColour;
    if (!reader) throw new Error('colour reader not installed');
    const channel = (value: number): number => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (color: string): number => {
      const { r, g, b }: Rgba = reader.read(color);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (foreground: string, background: string): number => {
      const hi = Math.max(lum(foreground), lum(background));
      const lo = Math.min(lum(foreground), lum(background));
      return (hi + 0.05) / (lo + 0.05);
    };
    const opaqueBackground = (el: Element): string => {
      let node: Element | null = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (reader.read(bg).a !== 0) return bg;
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };

    const heading = document.querySelector('h1');
    const button = document.querySelector('.btn--primary');
    if (!heading || !button) {
      throw new Error('Homepage is missing a headline or a primary button');
    }
    const headingColor = getComputedStyle(heading).color;
    const buttonColor = getComputedStyle(button).color;
    const buttonBg = getComputedStyle(button).backgroundColor;
    const sheet =
      document.querySelector('link[href*="dark-mode.css"]')?.getAttribute('href') ?? null;
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headline: ratio(headingColor, opaqueBackground(heading)),
      buttonBg,
      buttonColor,
      button: ratio(buttonColor, buttonBg),
      sheet,
    };
  });
}

test.describe('Night Ink website', () => {
  test.use({ timezoneId: 'UTC' });

  test.beforeAll(async () => {
    site = await serveBuiltSite(PORT);
  });

  test.afterAll(() => {
    site?.stop();
  });

  test.beforeEach(async ({ context }) => {
    await keepOffProdApi(context);
  });

  for (const [label, when] of Object.entries(HOURS)) {
    test(`system dark paints Night Ink with readable type and a sage button (${label})`, async ({
      page,
    }) => {
      await openAt(page, SITE, when, 'dark');
      const colors = await readPage(page);

      expect(colors.sheet).toContain('dark-mode.css?v=20261005');
      expect(colors.bodyBg).toBe('rgb(20, 17, 14)');
      expect(colors.headline).toBeGreaterThan(7);
      expect(colors.buttonBg).toBe('rgb(142, 174, 122)');
      expect(colors.buttonColor).toBe('rgb(20, 17, 14)');
      expect(colors.button).toBeGreaterThan(7);

      const chrome = await page.locator('meta[name="theme-color"]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          media: node.getAttribute('media'),
          content: node.getAttribute('content'),
        }))
      );
      expect(chrome).toEqual(
        expect.arrayContaining([
          { media: '(prefers-color-scheme: light)', content: '#fafaf9' },
          { media: '(prefers-color-scheme: dark)', content: '#14110e' },
        ])
      );
    });

    test(`system light stays on paper with a readable headline and button (${label})`, async ({
      page,
    }) => {
      await openAt(page, SITE, when, 'light');
      const colors = await readPage(page);

      expect(colors.bodyBg).not.toBe('rgb(20, 17, 14)');
      const bodyLum = await page.evaluate(() => {
        const reader = window.ferniColour;
        if (!reader) throw new Error('colour reader not installed');
        const { r, g, b } = reader.read(getComputedStyle(document.body).backgroundColor);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      });
      expect(bodyLum).toBeGreaterThan(0.8);
      expect(colors.headline).toBeGreaterThan(4.5);
      expect(colors.button).toBeGreaterThan(4.5);
    });
  }

  test('blog keeps the same Night Ink sheet', async ({ page }) => {
    const response = await openAt(page, `${SITE}/blog/`, HOURS.night, 'dark');
    expect(response?.ok()).toBe(true);
    const colors = await readPage(page);
    expect(colors.sheet).toContain('dark-mode.css?v=20261005');
    expect(colors.bodyBg).toBe('rgb(20, 17, 14)');
    expect(colors.headline).toBeGreaterThan(7);
  });
});
