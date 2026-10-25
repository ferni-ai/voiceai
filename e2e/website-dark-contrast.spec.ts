/**
 * Built ferni.ai pages in system dark mode: every visible line of text on
 * a solid background must reach 3:1 contrast. The Night Ink check only
 * measured the homepage headline and button, so white cards with light
 * text shipped unnoticed on most pages.
 *
 * Needs a built site: cd apps/website/ferni-website && npm run build
 */

import { expect, test, type Page } from '@playwright/test';

import { keepOffProdApi, serveBuiltSite, type BuiltSite } from './built-site-server';
import { installColourReader, type Rgba } from './computed-colour';
import {
  NIGHT,
  NIGHT_CLASSES,
  nightClasses,
  serveNightContent,
  waitForNight,
} from './website-night';

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
  '/what-ferni-is/',
];

let site: BuiltSite | undefined;

/**
 * The cookie banner appears 1.5 to 2 seconds after load, and its link is
 * measured in whatever state it's in. Wait until the banner has settled
 * (shown, or dismissed by a stored choice) and the fonts have loaded, so the
 * reading never depends on when the banner happened to appear.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const banner = document.getElementById('cookieBanner');
    return (
      !banner ||
      ['visible', 'is-visible', 'hidden', 'is-hidden'].some((name) =>
        banner.classList.contains(name)
      )
    );
  });
  await page.evaluate(() => document.fonts.ready);
}

interface LowContrast {
  ratio: number;
  selector: string;
  text: string;
}

/** Text whose own color against its stacked solid backgrounds is under 3:1. */
async function lowContrastText(page: Page): Promise<LowContrast[]> {
  await installColourReader(page);
  return page.evaluate(() => {
    const reader = window.ferniColour;
    if (!reader) throw new Error('colour reader not installed');
    const parse = (value: string): Rgba => reader.read(value);
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
        if (bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 1) break;
        }
      }
      if (painted) continue;
      let bg: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);

      const raw = parse(getComputedStyle(el).color);
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

/**
 * The text check skips gradient backgrounds, and the home page's night
 * sections are gradients: every stop must stay dark under their light text.
 */
async function weakGradients(page: Page): Promise<string[]> {
  await installColourReader(page);
  return page.evaluate(() => {
    const reader = window.ferniColour;
    if (!reader) throw new Error('colour reader not installed');
    const lum = ({ r, g, b }: Rgba): number => {
      const [lr, lg, lb] = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };
    const found: string[] = [];
    for (const selector of ['.two-am', '.stats-bar', '.memory-demo']) {
      const el = document.querySelector(selector);
      if (!el) {
        found.push(`${selector} missing`);
        continue;
      }
      const style = getComputedStyle(el);
      const color = reader.read(style.color);
      const stops = reader.stops(style.backgroundImage);
      // Fail rather than pass silently if the colours can't be read
      if (stops.length < 2) {
        found.push(`${selector} unreadable: ${style.color} / ${style.backgroundImage}`);
        continue;
      }
      const text = lum(color);
      for (const stop of stops) {
        // What shows through a see-through stop isn't known here
        if (stop.a < 1) {
          found.push(`${selector} has a translucent stop: ${style.backgroundImage}`);
          continue;
        }
        const ratio = (Math.max(text, lum(stop)) + 0.05) / (Math.min(text, lum(stop)) + 0.05);
        if (ratio < 4.5)
          found.push(`${selector} stop rgb(${stop.r},${stop.g},${stop.b}) ${ratio.toFixed(2)}:1`);
      }
    }
    return found;
  });
}

/** Scroll reveals start hidden; show them so their text is measured. */
const STILL_CSS =
  '*{animation:none!important;transition:none!important}' +
  '.reveal,[data-animate],[class*="fade"]{opacity:1!important;transform:none!important}';

test.describe('ferni.ai in dark mode', () => {
  test.beforeAll(async () => {
    site = await serveBuiltSite(PORT);
  });

  test.afterAll(() => {
    site?.stop();
  });

  test.beforeEach(async ({ context }) => {
    await keepOffProdApi(context);
  });

  for (const path of PAGES) {
    test(`${path} has no text under 3:1`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      const response = await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle' });
      expect(response?.ok()).toBe(true);
      await page.addStyleTag({ content: STILL_CSS });
      await settle(page);
      expect(await lowContrastText(page)).toEqual([]);
    });
  }

  test('/ night sections keep a dark gradient', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto(`${SITE}/`, { waitUntil: 'networkidle' });
    expect(await weakGradients(page)).toEqual([]);
  });

  // At 02:00 the landing API says visualMode: 'dark' and the home page script
  // turns night on (website-night.ts), on a dark system only. The light
  // system case is in the screenshots (website-visual.spec.ts); here it is
  // enough that night stays off there.
  test.describe('at night', () => {
    test.use({ timezoneId: 'UTC' });

    test.beforeEach(async ({ context, page }) => {
      await serveNightContent(context);
      await page.clock.setFixedTime(NIGHT);
    });

    async function openAtNight(page: Page, path: string, scheme: 'light' | 'dark') {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const response = await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle' });
      expect(response?.ok()).toBe(true);
      await waitForNight(page);
    }

    for (const path of ['/', '/story/']) {
      test(`${path} at night on a dark system has no text under 3:1`, async ({ page }) => {
        await openAtNight(page, path, 'dark');
        expect(await nightClasses(page)).toEqual(NIGHT_CLASSES);
        await page.addStyleTag({ content: STILL_CSS });
        await settle(page);
        expect(await lowContrastText(page)).toEqual([]);
      });

      test(`${path} at night on a light system stays on paper`, async ({ page }) => {
        await openAtNight(page, path, 'light');
        expect(await nightClasses(page)).toEqual([]);
      });
    }

    test('/ at night on a dark system keeps the night sections dark', async ({ page }) => {
      await openAtNight(page, '/', 'dark');
      expect(await nightClasses(page)).toEqual(NIGHT_CLASSES);
      expect(await weakGradients(page)).toEqual([]);
    });
  });

  // The checks above are only as good as the colour reader, so prove it reads
  // every format Chromium computes and refuses what it can't read.
  test('reads computed colours in any CSS format', async ({ page }) => {
    await page.setContent(
      '<p id="rgb" style="color: rgb(20, 17, 14)">a</p>' +
        '<p id="rgba" style="color: rgba(255, 0, 0, 0.5)">a</p>' +
        '<p id="srgb" style="color: color(srgb 1 1 1)">a</p>' +
        '<p id="oklch" style="color: oklch(0.628 0.2577 29.23)">a</p>' +
        '<p id="mix" style="color: color-mix(in srgb, #ff0000 50%, #0000ff)">a</p>' +
        '<p id="grad" style="background-image: linear-gradient(oklch(0.628 0.2577 29.23), color-mix(in oklch, #0000ff 100%, white))">a</p>'
    );
    await installColourReader(page);
    const read = await page.evaluate(() => {
      const reader = window.ferniColour;
      if (!reader) throw new Error('colour reader not installed');
      const color = (id: string): string => getComputedStyle(document.getElementById(id)!).color;
      let bogus = '';
      try {
        reader.read('not-a-colour');
      } catch (error) {
        bogus = String(error);
      }
      return {
        computed: ['srgb', 'oklch', 'mix'].map(color),
        colours: ['rgb', 'rgba', 'srgb', 'oklch', 'mix'].map((id) => reader.read(color(id))),
        stops: reader.stops(getComputedStyle(document.getElementById('grad')!).backgroundImage),
        bogus,
      };
    });
    // The modern formats really are what reaches the reader
    expect(read.computed.some((value) => value.startsWith('rgb'))).toBe(false);
    const near = (got: Rgba, want: Rgba): void => {
      for (const key of ['r', 'g', 'b'] as const)
        expect(Math.abs(got[key] - want[key])).toBeLessThanOrEqual(1);
      expect(got.a).toBeCloseTo(want.a, 2);
    };
    near(read.colours[0], { r: 20, g: 17, b: 14, a: 1 });
    near(read.colours[1], { r: 255, g: 0, b: 0, a: 128 / 255 });
    near(read.colours[2], { r: 255, g: 255, b: 255, a: 1 });
    near(read.colours[3], { r: 255, g: 0, b: 0, a: 1 });
    near(read.colours[4], { r: 128, g: 0, b: 128, a: 1 });
    expect(read.stops).toHaveLength(2);
    near(read.stops[0], { r: 255, g: 0, b: 0, a: 1 });
    near(read.stops[1], { r: 0, g: 0, b: 255, a: 1 });
    expect(read.bogus).toContain('unreadable colour "not-a-colour"');
  });
});
