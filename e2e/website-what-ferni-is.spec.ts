/**
 * ferni.ai says plainly what Ferni is (owner decision 2026-10-18: disclose on
 * the website, not inside the app). The answer lives at /what-ferni-is/ and is
 * linked from every site footer, the homepage, both FAQs and the sign-up
 * modal. These checks keep any of those links from quietly disappearing, and
 * keep "AI" out of the labels around it (prose may name the technology).
 *
 * Needs a built site: cd apps/website/ferni-website && npm run build
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, test } from '@playwright/test';

import { keepOffProdApi, serveBuiltSite, type BuiltSite } from './built-site-server';

const SITE_DIR = 'apps/website/ferni-website/_site';
const PORT = 8769;
const SITE = `http://127.0.0.1:${PORT}`;
const LINK = 'href="/what-ferni-is/"';
/** "AI" as a word, the way a badge, button or heading would say it. */
const AI_WORD = /\bAI\b/;

/** Built pages, minus the developer portal (its own static docs). */
function builtPages(dir = SITE_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'developers' ? [] : builtPages(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

const html = (path: string): string => readFileSync(join(SITE_DIR, path), 'utf8');
const footers = (page: string): string[] => page.match(/<footer\b[\s\S]*?<\/footer>/g) ?? [];
const text = (fragment: string): string =>
  fragment.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const all = (page: string, re: RegExp): string[] => [...page.matchAll(re)].map((m) => text(m[1]!));

test.describe('what Ferni is, on ferni.ai', () => {
  test('every page with a site footer links to it from the footer', () => {
    const pages = builtPages();
    expect(pages.length).toBeGreaterThan(50);
    const withFooter = pages.filter((p) => footers(readFileSync(p, 'utf8')).length > 0);
    const missing = withFooter.filter((p) => !footers(readFileSync(p, 'utf8')).some((f) => f.includes(LINK)));
    expect(missing.map((p) => relative(SITE_DIR, p))).toEqual([]);
    for (const key of ['index.html', 'faq/index.html', 'help/index.html', 'about/index.html', 'privacy/index.html', 'blog/index.html']) {
      expect(footers(html(key)).some((f) => f.includes(LINK)), key).toBe(true);
    }
  });

  test('footer links and taglines carry no "AI" label', () => {
    for (const path of builtPages()) {
      for (const footer of footers(readFileSync(path, 'utf8'))) {
        const labels = [
          ...all(footer, /<a\b[^>]*>([\s\S]*?)<\/a>/g),
          ...all(footer, /class="footer[_-]+tagline"[^>]*>([\s\S]*?)<\/p>/g),
        ];
        expect(labels.filter((l) => AI_WORD.test(l)), relative(SITE_DIR, path)).toEqual([]);
      }
    }
  });

  test('the page answers plainly, links to help and deletion, and labels without "AI"', () => {
    const page = html('what-ferni-is/index.html');
    expect(all(page, /<h1\b[^>]*>([\s\S]*?)<\/h1>/g)).toEqual(["I'm not a person."]);
    expect(text(page)).toContain("I'm software, built with artificial intelligence.");
    expect(text(page)).toContain('Real people built me, and they stand behind me.');
    for (const href of ['/delete-account/', '/privacy/', 'tel:988', '/contact/']) {
      expect(page).toContain(`href="${href}"`);
    }
    const labels = [
      ...all(page, /<title>([\s\S]*?)<\/title>/g),
      ...all(page, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/g),
      ...all(page, /class="story-page__eyebrow"[^>]*>([\s\S]*?)<\/p>/g),
    ];
    expect(labels.length).toBeGreaterThan(4);
    expect(labels.filter((l) => AI_WORD.test(l))).toEqual([]);
  });

  test('both FAQs ask "Is Ferni a real person?" and link to the answer', () => {
    const faq = html('faq/index.html');
    const questions = all(faq, /class="faq-page__question"[^>]*>([\s\S]*?)<\/h2>/g);
    expect(questions).toContain('Is Ferni a real person?');
    expect(questions.filter((q) => AI_WORD.test(q))).toEqual([]);
    expect(faq).toContain(LINK);

    const home = html('index.html');
    const homeQuestions = all(home, /class="faq-item__question"[^>]*>([\s\S]*?)<\/summary>/g);
    expect(homeQuestions[0]).toBe('Is Ferni a real person?');
    expect(homeQuestions.filter((q) => AI_WORD.test(q))).toEqual([]);
  });

  test('the homepage and the sign-up modal carry the quiet line', () => {
    const home = html('index.html');
    expect(home).toMatch(/class="hero__note">Ferni is software, not a person\. <a href="\/what-ferni-is\/">/);
    expect(home).toMatch(/waitlist-modal__note--honest">\s*I'm software, not a person\. <a href="\/what-ferni-is\/">/);
  });

  test.describe('in a phone-sized browser', () => {
    let site: BuiltSite | undefined;
    test.beforeAll(async () => {
      site = await serveBuiltSite(PORT);
    });
    test.afterAll(() => site?.stop());

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`reads at 390px in ${colorScheme} mode with no sideways scroll`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
        await keepOffProdApi(context);
        const page = await context.newPage();
        await page.goto(`${SITE}/what-ferni-is/`, { waitUntil: 'load' });
        await expect(page.getByRole('heading', { level: 1 })).toHaveText("I'm not a person.");
        await expect(page.getByRole('link', { name: 'Delete your account' })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await context.close();
      });
    }
  });
});
