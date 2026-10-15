/**
 * Built ferni.ai pages in system dark mode: every visible line of text on
 * a solid background must reach 3:1 contrast. The Night Ink check only
 * measured the homepage headline and button, so white cards with light
 * text shipped unnoticed on most pages.
 *
 * Needs a built site: cd apps/website/ferni-website && npm run build
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

import { expect, test, type Page } from '@playwright/test';

const PORT = 8767;
const SITE = `http://127.0.0.1:${PORT}`;

const PAGES = [
  '/',
  '/about/',
  '/accessibility/',
  '/capabilities/',
  '/compare/',
  '/contact/',
  '/cookies/',
  '/enterprise/',
  '/faq/',
  '/features/',
  '/garden/',
  '/give/',
  '/help/',
  '/how-it-works/',
  '/marketplace/',
  '/press/',
  '/privacy/',
  '/sms-consent/',
  '/story/',
  '/team/',
  '/terms/',
  '/use-cases/',
];

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
  throw new Error(`Site did not answer on ${SITE}`);
}

interface LowContrast {
  ratio: number;
  selector: string;
  text: string;
}

/** Text whose own color against its stacked solid backgrounds is under 3:1. */
async function lowContrastText(page: Page): Promise<LowContrast[]> {
  return page.evaluate(() => {
    interface Rgba {
      r: number;
      g: number;
      b: number;
      a: number;
    }
    const parse = (value: string): Rgba | null => {
      const parts = value.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return null;
      const [r, g, b, a] = parts.map(Number);
      return { r, g, b, a: parts.length > 3 ? a : 1 };
    };
    const channel = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (c: Rgba): number =>
      0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    const over = (top: Rgba, under: Rgba): Rgba => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const hidden = (el: Element): boolean => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) < 0.1
        )
          return true;
      }
      return false;
    };

    const found: LowContrast[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      const text = walker.currentNode.textContent?.trim() ?? '';
      if (!el || !text || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[aria-hidden="true"], script, style, noscript, svg, .skip-link')) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1 || hidden(el)) continue;

      // Walk up to the first opaque background. A gradient or image can't
      // be measured from computed style, so that text is skipped.
      const layers: Rgba[] = [];
      let painted = false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none') painted = true;
        const bg = parse(style.backgroundColor);
        if (bg && bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 1) break;
        }
      }
      if (painted) continue;
      let bg: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);

      const raw = parse(getComputedStyle(el).color);
      if (!raw) continue;
      const fg = raw.a < 1 ? over(raw, bg) : raw;
      const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
      if (ratio < 3) {
        const classes =
          typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2) : [];
        found.push({
          ratio: Math.round(ratio * 100) / 100,
          selector: [el.tagName.toLowerCase(), ...classes].join('.'),
          text: text.slice(0, 40),
        });
      }
    }
    return found;
  });
}

test.describe('ferni.ai in dark mode', () => {
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

  for (const path of PAGES) {
    test(`${path} has no text under 3:1`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      const response = await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle' });
      expect(response?.ok()).toBe(true);
      // Scroll reveals start hidden; show them so their text is measured.
      await page.addStyleTag({
        content:
          '*{animation:none!important;transition:none!important}' +
          '.reveal,[data-animate],[class*="fade"]{opacity:1!important;transform:none!important}',
      });
      expect(await lowContrastText(page)).toEqual([]);
    });
  }
});
