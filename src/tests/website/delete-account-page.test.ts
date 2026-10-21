/**
 * ferni.ai/delete-account is the web link Google Play requires for account
 * deletion (entered in the Data safety form). It must describe the real in-app
 * path, so the menu labels it names are checked against the app's strings.
 *
 * Unknown paths on ferni.ai must answer 404, not 200 with the 404 page: a
 * rewrite to /404.html made every typo a "page" (and made /delete-account look
 * live before it existed). Firebase Hosting serves 404.html with a 404 status
 * on its own when nothing matches.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SITE = join(ROOT, 'apps/website/ferni-website');
const page = readFileSync(join(SITE, 'src/delete-account.njk'), 'utf8');
const strings = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/i18n/locales/en-US.json'), 'utf8')
) as { menu: { items: { exportData: string } }; dataExport: { deleteAccount: string } };

interface Rewrite {
  source: string;
  destination?: string;
}

const landing = (
  JSON.parse(readFileSync(join(SITE, 'firebase.json'), 'utf8')) as {
    hosting: { site: string; rewrites?: Rewrite[] }[];
  }
).hosting.find((h) => h.site === 'ferni-landing');

describe('ferni.ai/delete-account', () => {
  it('is published at /delete-account/', () => {
    expect(page).toMatch(/^permalink: \/delete-account\/$/m);
  });

  it('walks through the in-app path using the labels the app shows', () => {
    expect(strings.menu.items.exportData).toBe('Privacy & your data');
    expect(strings.dataExport.deleteAccount).toBe('Delete my account');
    expect(page).toContain(`<strong>${strings.menu.items.exportData}</strong>`);
    expect(page).toContain(`<strong>${strings.dataExport.deleteAccount}</strong>`);
    expect(page).toContain('<strong>Settings</strong>');
  });

  it('offers an email path with a 30-day deadline', () => {
    expect(page).toContain('mailto:privacy@ferni.ai');
    expect(page).toContain('within 30 days');
  });

  it('says plainly that usage analytics are not erased yet', () => {
    expect(page).toMatch(/does not remove them yet/);
  });

  it('names the app and never says "AI"', () => {
    expect(page).toContain('Ferni app on Android');
    expect(page).not.toMatch(/\bAI\b/);
  });
});

describe('ferni.ai unknown paths', () => {
  it('get a real 404: no rewrite answers them with the 404 page', () => {
    expect(landing).toBeDefined();
    const to404 = (landing?.rewrites ?? []).filter((r) => r.destination === '/404.html');
    expect(to404).toEqual([]);
  });
});
