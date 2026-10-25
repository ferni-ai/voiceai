/**
 * Every built ferni.ai page has a real <title>.
 *
 * /team/ferni/ shipped " -  | Ferni": team.json computes "{{ name }} - {{ role }}"
 * for every page in src/team/, and ferni.njk (a page there with no name or role)
 * lost its own title to it. The other team pages read "Communication &amp;amp;
 * Coordination", escaped twice (new-person hunt, 2026-10-18).
 *
 * The site's production build runs scripts/check-page-titles.js over all of
 * _site, so the deploy fails on a broken title. Here the check is exercised on
 * known-bad titles, and, where the site's own dependencies are installed, on a
 * fresh build of every page.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE = join(process.cwd(), 'apps/website/ferni-website');
const ELEVENTY = join(SITE, 'node_modules/.bin/eleventy');
const require = createRequire(import.meta.url);
const { checkTitle, checkSite } = require(join(SITE, 'scripts/check-page-titles.js')) as {
  checkTitle: (html: string) => string[];
  checkSite: (dir: string) => string[];
};

const page = (title: string) => `<html><head><title>${title}</title></head></html>`;

describe('page title check', () => {
  it.each([
    [' -  | Ferni', 'title starts with a dash'],
    [' | Ferni', 'empty title'],
    ['{{ &#39;errorPage.title&#39; | t }} | Ferni', 'unrendered template'],
    ['{% if x %}Ferni{% endif %}', 'unrendered template'],
    ['Alex - Communication &amp;amp; Coordination | Ferni', 'double-escaped'],
  ])('rejects "%s"', (title, problem) => {
    expect(checkTitle(page(title)).join()).toContain(problem);
  });

  it.each([
    'Meet Ferni - Your Life Coach | Ferni',
    'Alex - Communication &amp; Coordination | Ferni',
    'Lost in thought? | Ferni',
    'Ferni - Your Life Coach',
  ])('accepts "%s"', (title) => {
    expect(checkTitle(page(title))).toEqual([]);
  });

  it('team.json keeps a page title when the page has no name', () => {
    const team = JSON.parse(readFileSync(join(SITE, 'src/team/team.json'), 'utf8'));
    const computed: string = team.eleventyComputed.title;
    expect(computed).toMatch(/\{% if name %\}/);
    expect(computed).toMatch(/\{\{ title/);
  });
});

describe.skipIf(!existsSync(ELEVENTY))('built site (site dependencies installed)', () => {
  it('every page has a real title, the team pages included', () => {
    const out = mkdtempSync(join(tmpdir(), 'ferni-site-'));
    execFileSync(ELEVENTY, ['--quiet', `--output=${out}`], { cwd: SITE, stdio: 'pipe' });
    expect(checkSite(out)).toEqual([]);
    const title = (path: string) =>
      /<title>([^<]*)<\/title>/.exec(readFileSync(join(out, path), 'utf8'))?.[1];
    expect(title('team/ferni/index.html')).toMatch(/^Meet Ferni - .+ \| Ferni$/);
    expect(title('team/alex/index.html')).toBe('Alex - Communication &amp; Coordination | Ferni');
  }, 60_000);
});
