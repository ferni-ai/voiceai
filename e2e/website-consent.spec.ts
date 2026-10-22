/**
 * Built ferni.ai pages: analytics waits for cookie consent, and a few bits of
 * stale or unprompted content stay gone.
 *
 * gtag.js is replaced by a stub that replays dataLayer and sends one
 * google-analytics.com/g/collect hit per 'config' and per later 'event', the
 * way the real tag does, so the test sees the hits without reaching Google.
 *
 * Needs a built site: cd apps/website/ferni-website && npm run build
 */

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { keepOffProdApi, serveBuiltSite, type BuiltSite } from './built-site-server';

const PORT = 8768;
const SITE = `http://127.0.0.1:${PORT}`;

const GTAG_STUB = `
(function () {
  var dl = (window.dataLayer = window.dataLayer || []);
  var consent = {};
  var ids = [];
  function hit(name) {
    navigator.sendBeacon('https://www.google-analytics.com/g/collect?tid=' + ids.join(',') +
      '&en=' + name + '&gcs=' + (consent.analytics_storage || 'unset'));
  }
  function run(args) {
    var a = Array.prototype.slice.call(args);
    if (a[0] === 'consent') Object.assign(consent, a[2] || {});
    else if (a[0] === 'config') { ids.push(a[1]); hit('page_view'); }
    else if (a[0] === 'event' && ids.length) hit(a[1]);
  }
  dl.forEach(run);
  var push = dl.push.bind(dl);
  dl.push = function (x) { run(x); return push(x); };
})();`;

let site: BuiltSite | undefined;

/** Stubs Google and the prod API; records analytics hits, visitor-ID requests and prod calls. */
async function watch(
  context: BrowserContext
): Promise<{ hits: string[]; idRequests: string[]; prodCalls: string[] }> {
  const hits: string[] = [];
  const idRequests: string[] = [];
  const prodCalls = await keepOffProdApi(context);
  await context.route(/googletagmanager\.com\/gtag\/js/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: GTAG_STUB })
  );
  await context.route(/google-analytics\.com/, (route) => route.fulfill({ status: 204, body: '' }));
  context.on('request', (request) => {
    const url = request.url();
    if (/google-analytics\.com\/g\/collect/.test(url)) hits.push(url);
    if (
      /\/api\/landing\/(experiments|track)/.test(url) &&
      /userId|visitorId/.test(url + (request.postData() ?? ''))
    ) {
      idRequests.push(url);
    }
  });
  return { hits, idRequests, prodCalls };
}

/** The banner's Accept and Decline sit under the chat bubble, so click them in the DOM. */
async function choose(page: Page, label: 'Accept' | 'Decline'): Promise<void> {
  const button = page.locator(`#cookieBanner button:has-text("${label}")`);
  await expect(page.locator('#cookieBanner.is-visible')).toBeVisible({ timeout: 5000 });
  await button.evaluate((el: HTMLElement) => el.click());
}

test.describe('ferni.ai consent and content', () => {
  test.beforeAll(async () => {
    site = await serveBuiltSite(PORT);
  });

  test.afterAll(() => {
    site?.stop();
  });

  test('sends no analytics hit or visitor ID until Accept, then remembers it', async ({
    context,
    page,
  }) => {
    const { hits, idRequests, prodCalls } = await watch(context);
    await page.goto(`${SITE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    expect(hits).toEqual([]);
    expect(idRequests).toEqual([]);
    // Backend-flagged features look the same as before consent existed: with
    // no experiments service, the flags fall through to on, chat bubble included.
    await expect(page.locator('.ferni-chat-trigger')).toHaveCount(1);
    const consentDefault = await page.evaluate(
      () =>
        (window as unknown as { dataLayer: unknown[][] }).dataLayer.find(
          (a) => a[0] === 'consent' && a[1] === 'default'
        )?.[2]
    );
    expect(consentDefault).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });

    await choose(page, 'Accept');
    await expect.poll(() => hits.length).toBeGreaterThan(0);
    expect(hits.every((url) => url.includes('gcs=granted'))).toBe(true);

    const before = hits.length;
    await page.goto(`${SITE}/about/`, { waitUntil: 'load' });
    await expect.poll(() => hits.length).toBeGreaterThan(before);
    // Leaving / records exit events through the site's own experiments API, not
    // a beacon to app.ferni.ai (that one had no visitor id and got a 400).
    expect(prodCalls.filter((url) => url.includes('/experiments/track/batch'))).toEqual([]);
    await expect(page.locator('#cookieBanner.is-visible')).toHaveCount(0);
  });

  test('sends nothing after Decline, on this page or the next', async ({ context, page }) => {
    const { hits, idRequests } = await watch(context);
    await page.goto(`${SITE}/`, { waitUntil: 'load' });
    await choose(page, 'Decline');
    await page.mouse.wheel(0, 3000);
    await page.goto(`${SITE}/about/`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    expect(hits).toEqual([]);
    expect(idRequests).toEqual([]);
    await expect(page.locator('#cookieBanner.is-visible')).toHaveCount(0);
  });

  test('home shows this year, no Venmo block, and one input per persona card', async ({
    context,
    page,
  }) => {
    await watch(context);
    await page.goto(`${SITE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    const year = String(new Date().getFullYear());
    await expect(page.locator('.footer__copyright')).toContainText(`© ${year} Ferni`);
    expect(await page.locator('#founders, .chip-in').count()).toBe(0);
    const inputsPerCard = await page
      .locator('.team-card')
      .evaluateAll((cards) => cards.map((card) => card.querySelectorAll('input').length));
    expect(inputsPerCard.length).toBeGreaterThan(0);
    expect(inputsPerCard.every((n) => n === 1)).toBe(true);
  });

  test('/about/ shows no unprompted toast in its first minute', async ({ context, page }) => {
    await watch(context);
    await page.clock.install();
    await page.goto(`${SITE}/about/`, { waitUntil: 'load' });
    // A toast removes itself after 4s, so record every one that appears.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { toastsSeen: string[] }).toastsSeen = seen;
      new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.classList.contains('ferni-toast'))
              seen.push((node.textContent ?? '').trim());
          });
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 800);
      await page.clock.runFor(250);
    }
    await page.clock.runFor(57_000);

    expect(
      await page.evaluate(() => (window as unknown as { toastsSeen: string[] }).toastsSeen)
    ).toEqual([]);
    await expect(page.locator('footer')).toContainText(`© ${new Date().getFullYear()} Ferni`);
  });
});
