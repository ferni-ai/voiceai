/**
 * The calmer homepage preview at /home-next/ (docs/plans/2026-10-31-design-elevation.md):
 * eight sections instead of sixteen, "Meet Ferni" in place of the old slogan, a
 * button that plays Ferni's real voice, and no indexing. The live homepage must
 * render exactly as before until the swap.
 *
 * Needs a built site: cd apps/website/ferni-website && npm run build
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { keepOffProdApi, serveBuiltSite, type BuiltSite } from './built-site-server';

const SITE_DIR = 'apps/website/ferni-website/_site';
const PORT = 8771;
const SITE = `http://127.0.0.1:${PORT}`;
const TTS = 'https://app.ferni.ai/api/landing/tts';
// 09:00 in the browser's zone: the hour the homepage's time greeting is the old slogan.
const MORNING = '2026-10-17T09:00:00';

const html = (path: string): string => readFileSync(join(SITE_DIR, path), 'utf8');
const sections = (page: string): number => (page.match(/<section\b/g) ?? []).length;

test.describe('homepage preview', () => {
  test('the preview has half the sections and is not indexed; the live homepage is unchanged', () => {
    const next = html('home-next/index.html');
    const live = html('index.html');
    expect(sections(next)).toBe(8);
    expect(sections(live)).toBe(16);
    expect(next).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(live).toContain('<meta name="robots" content="index, follow">');
    expect(next).toContain('data-hear-ferni');
    expect(live).not.toContain('data-hear-ferni');
    expect(live).toContain('<p class="hero__tagline">Better than human.</p>');
    expect(readFileSync(join(SITE_DIR, 'sitemap.xml'), 'utf8')).not.toContain('home-next');
  });

  test.describe('in a browser', () => {
    let site: BuiltSite | undefined;
    test.beforeAll(async () => {
      site = await serveBuiltSite(PORT);
    });
    test.afterAll(() => site?.stop());

    test('keeps "Meet Ferni" where the time greeting would bring back the slogan', async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await keepOffProdApi(context);
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(MORNING));
      await page.goto(`${SITE}/home-next/`, { waitUntil: 'load' });
      await expect(page.locator('.hero__tagline')).toHaveText('Meet Ferni');
      await page.goto(`${SITE}/`, { waitUntil: 'load' });
      await expect(page.locator('.hero__tagline')).toHaveText('Better than human.');
      await context.close();
    });

    test('Hear Ferni plays the voice, stops on a second tap, and says so when the voice is unreachable', async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await keepOffProdApi(context);
      let status = 200;
      const asked: string[] = [];
      await context.route(TTS, (route) => {
        asked.push(route.request().postData() ?? '');
        return route.fulfill({ status, contentType: 'audio/mpeg', body: Buffer.alloc(0) });
      });
      const page = await context.newPage();
      // A headless browser can't decode an empty clip; stand in for playback the way a
      // browser behaves mid-clip: play() stays pending, and pause() rejects it with AbortError.
      await page.addInitScript(() => {
        const aborts = new WeakMap<HTMLMediaElement, () => void>();
        HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
          return new Promise<void>((_resolve, reject) => {
            aborts.set(this, () => reject(new DOMException('interrupted by pause()', 'AbortError')));
          });
        };
        HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
          aborts.get(this)?.();
        };
      });
      await page.goto(`${SITE}/home-next/`, { waitUntil: 'load' });
      const button = page.locator('[data-hear-ferni]');
      await expect(button).toHaveAccessibleName('Hear Ferni');
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(button).toHaveText('Stop');
      expect(JSON.parse(asked[0] ?? '{}')).toMatchObject({ personaId: 'ferni' });
      await button.click();
      await expect(button).toHaveText('Hear Ferni');
      await expect(button).toHaveAttribute('aria-pressed', 'false');

      status = 503;
      const fresh = await context.newPage();
      await fresh.goto(`${SITE}/home-next/`, { waitUntil: 'load' });
      await fresh.locator('[data-hear-ferni]').click();
      await expect(fresh.locator('[data-hear-ferni]')).toHaveText(
        "Couldn't reach Ferni's voice. Try again"
      );
      await expect(fresh.locator('[data-hear-ferni]')).toHaveAttribute('aria-pressed', 'false');
      await context.close();
    });
  });
});
