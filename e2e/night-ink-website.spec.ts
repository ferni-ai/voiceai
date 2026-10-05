/**
 * Built Ferni homepage, served as the real Eleventy output.
 * Dark mode follows the system. Light mode stays on paper.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

import { expect, test, type Page } from '@playwright/test';

const PORT = 8766;
const SITE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | undefined;

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => {
      probe.close(() => resolve(false));
    });
    probe.listen(port, '127.0.0.1');
  });
}

async function waitForSite(): Promise<void> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(SITE);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Homepage did not answer on ${SITE}`);
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
  return page.evaluate(() => {
    const channel = (value: number): number => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (color: string): number => {
      const parts = color.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return 0;
      const [r, g, b] = parts.slice(0, 3).map(Number);
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
        const parts = bg.match(/[\d.]+/g);
        const alpha = parts && parts.length >= 4 ? Number(parts[3]) : 1;
        if (bg !== 'transparent' && alpha !== 0) return bg;
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
    const sheet = document.querySelector('link[href*="dark-mode.css"]')?.getAttribute('href') ?? null;
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
  test.beforeAll(async () => {
    if (await portOpen(PORT)) return;
    server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: 'apps/website/ferni-website/_site',
      stdio: 'ignore',
    });
    await waitForSite();
  });

  test.afterAll(() => {
    server?.kill();
  });

  test('system dark paints Night Ink with readable type and a sage button', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(SITE);
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

  test('system light stays on paper with a readable headline and button', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(SITE);
    const colors = await readPage(page);

    expect(colors.bodyBg).not.toBe('rgb(20, 17, 14)');
    const bodyLum = await page.evaluate(() => {
      const parts = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
      if (!parts) return 0;
      const [r, g, b] = parts.slice(0, 3).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    });
    expect(bodyLum).toBeGreaterThan(0.8);
    expect(colors.headline).toBeGreaterThan(4.5);
    expect(colors.button).toBeGreaterThan(4.5);
  });

  test('blog keeps the same Night Ink sheet', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const response = await page.goto(`${SITE}/blog/`);
    expect(response?.ok()).toBe(true);
    const colors = await readPage(page);
    expect(colors.sheet).toContain('dark-mode.css?v=20261005');
    expect(colors.bodyBg).toBe('rgb(20, 17, 14)');
    expect(colors.headline).toBeGreaterThan(7);
  });
});
