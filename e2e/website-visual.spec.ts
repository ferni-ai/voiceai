/**
 * Every main ferni.ai page, in light and dark mode, on desktop and mobile,
 * compared with approved screenshots in e2e/__screenshots__/website-visual/.
 * The dark mode work broke pages nobody looked at; this shows every change.
 *
 * The images only match inside the pinned Playwright image (its Chromium
 * build and fonts), so the check runs there in CI (website-checks.yml), and
 * the spec refuses to run on any other Chromium. To run it locally, from the
 * repo root after pnpm install, with the site built (cd
 * apps/website/ferni-website && npm ci && npm run build:prod):
 *
 *   docker run --rm --ipc=host -v "$PWD:$PWD" -w "$PWD" \
 *     mcr.microsoft.com/playwright:v1.64.1-noble \
 *     npx playwright test -c apps/website/ferni-website/playwright.visual.config.ts
 *
 * To approve a change on purpose, add --update-snapshots to that command, or
 * run the "Website checks" workflow by hand on your branch with "update
 * screenshots" ticked and commit the website-screenshots artifact into
 * e2e/__screenshots__/website-visual/. Look at every changed image first.
 * Moving to a new Playwright means a new image tag here, in the workflow and
 * in CHROMIUM below, and new screenshots.
 */

import { expect, test, type Page } from '@playwright/test';

import { keepOffProdApi } from './built-site-server';
import {
  NIGHT,
  NIGHT_CLASSES,
  nightClasses,
  serveNightContent,
  waitForNight,
} from './website-night';

/** Served once for all workers by the config's webServer. */
const SITE = 'http://127.0.0.1:8770';

/** The Chromium in mcr.microsoft.com/playwright:v1.64.1-noble. */
const CHROMIUM = '156.0.8078.4';

const PAGES = [
  '/',
  '/about/',
  '/team/',
  '/capabilities/',
  '/features/',
  '/how-it-works/',
  '/help/',
  '/faq/',
  '/story/',
  '/garden/',
  '/privacy/',
  '/enterprise/',
  '/compare/',
  '/press/',
  '/marketplace/',
  '/use-cases/',
];

/**
 * Each image is the full page cut off after `screens` screens, which keeps
 * the 64 images near 14 MB. Wide screens cost more, so desktop gets fewer.
 */
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, screens: 2 },
  mobile: { viewport: { width: 390, height: 844 }, screens: 3 },
} as const;

/**
 * Pinned overlays that scripts show on a timer. They sit over the page in a
 * full-page image, so they are hidden rather than masked (a mask would paint
 * over the content under them).
 */
const OVERLAYS = [
  '#cookieBanner',
  '.ferni-chat-widget',
  '#ferni-live-chat',
  '.ferni-toast',
  '.helpful-nudge',
  '.ai-hover-insight',
];

/** Pages that load js/landing-intelligence.js, which can switch to night. */
const NIGHT_PAGES = ['/', '/story/'];

/** Media whose frame depends on when the picture is taken. */
const MASKED = ['video', 'iframe', 'canvas'];

const STILL_CSS =
  '*,*::before,*::after{animation:none!important;transition:none!important}' +
  '.reveal,[data-animate],[class*="fade"]{opacity:1!important;transform:none!important}' +
  `${OVERLAYS.join(',')}{visibility:hidden!important}`;

const FAMILIES = ['Inter', 'Plus Jakarta Sans'];

/**
 * Same random numbers and empty storage on every load, and a clock that
 * never moves, so no timer swaps copy, rotates cards or opens a banner.
 */
async function freeze(page: Page, time = new Date('2026-06-15T10:00:00Z')): Promise<void> {
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    let seed = 0x2f6b3a1d;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

/** Loads every image (lazy ones too) and the web fonts, or fails. */
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({ content: STILL_CSS });
  const missing = await page.evaluate(async (families) => {
    const images = [...document.images];
    for (const img of images) img.loading = 'eager';
    await Promise.all(
      images.map((img) =>
        img.complete
          ? null
          : new Promise((done) => {
              img.addEventListener('load', done);
              img.addEventListener('error', done);
            })
      )
    );
    // Every declared face, not only those laid out so far, so no face can
    // arrive during the capture and move text.
    await Promise.allSettled([...document.fonts].map((face) => face.load()));
    await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`)));
    await document.fonts.ready;
    // check() is also true when the family was never declared (the Google
    // Fonts stylesheet failed), so look for a loaded face of each family.
    const loaded = new Set(
      [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => face.family.replaceAll('"', ''))
    );
    return families.filter((family) => !loaded.has(family));
  }, FAMILIES);
  expect(missing, 'Google Fonts did not load; the images would show fallback fonts').toEqual([]);
  await page.waitForLoadState('networkidle');
}

/** The page's first `screens` screens, compared with the approved image. */
async function snap(
  page: Page,
  name: string,
  viewport: { width: number; height: number },
  screens: number
): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    clip: {
      x: 0,
      y: 0,
      width: viewport.width,
      height: Math.min(height, viewport.height * screens),
    },
    mask: MASKED.map((selector) => page.locator(selector)),
  });
}

const slug = (path: string): string => path.replaceAll('/', '') || 'home';

test.beforeAll(async ({ browser }) => {
  expect(
    browser.version(),
    'Screenshots only match in mcr.microsoft.com/playwright:v1.64.1-noble; see the top of this file'
  ).toBe(CHROMIUM);
});

for (const [device, { viewport, screens }] of Object.entries(VIEWPORTS)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${device} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme });

      test.beforeEach(async ({ context, page }) => {
        await keepOffProdApi(context);
        await context.route(/googletagmanager\.com|google-analytics\.com/, (route) =>
          route.abort()
        );
        await freeze(page);
      });

      for (const path of PAGES) {
        test(`${path} looks as approved`, async ({ page }) => {
          const response = await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle' });
          expect(response?.ok()).toBe(true);
          await settle(page);
          await snap(page, `${slug(path)}-${device}-${colorScheme}.png`, viewport, screens);
        });
      }
    });
  }
}

// At 02:00 the landing API says visualMode: 'dark' and the home page script
// turns night on (website-night.ts). On a dark system that is the night
// look; on a light one the page must stay on paper, which these images show.
for (const [device, { viewport, screens }] of Object.entries(VIEWPORTS)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${device} ${colorScheme} at night`, () => {
      test.use({ viewport, colorScheme });

      test.beforeEach(async ({ context, page }) => {
        await keepOffProdApi(context);
        await context.route(/googletagmanager\.com|google-analytics\.com/, (route) =>
          route.abort()
        );
        await serveNightContent(context);
        await freeze(page, NIGHT);
      });

      for (const path of NIGHT_PAGES) {
        test(`${path} at night looks as approved`, async ({ page }) => {
          const response = await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle' });
          expect(response?.ok()).toBe(true);
          // The script starts on a 50 ms timer, which the paused clock holds.
          await page.clock.runFor(100);
          await waitForNight(page);
          expect(await nightClasses(page)).toEqual(colorScheme === 'dark' ? NIGHT_CLASSES : []);
          await settle(page);
          await snap(page, `${slug(path)}-${device}-night-${colorScheme}.png`, viewport, screens);
        });
      }
    });
  }
}
