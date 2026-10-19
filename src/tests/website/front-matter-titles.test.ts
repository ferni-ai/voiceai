/**
 * Eleventy does not render templates inside plain front matter, so
 * `title: "{{ 'errorPage.title' | t }}"` shipped literally: ferni.ai's 404 page
 * (served for /app, /login, ...) had the title "{{ 'errorPage.title' | t }} | Ferni".
 * Templated titles and descriptions must sit under `eleventyComputed`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE_SRC = join(process.cwd(), 'apps/website/ferni-website/src');

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : pages(path);
    return /\.(njk|md|html)$/.test(entry.name) ? [path] : [];
  });
}

function frontMatter(source: string): string | null {
  const m = /^---[^\n]*\n([\s\S]*?)\n---/.exec(source);
  return m ? m[1]! : null;
}

describe('ferni.ai front matter', () => {
  it('finds pages to check', () => {
    expect(pages(SITE_SRC).length).toBeGreaterThan(20);
  });

  it('puts every templated title or description under eleventyComputed', () => {
    const offenders = pages(SITE_SRC).filter((file) => {
      const fm = frontMatter(readFileSync(file, 'utf8'));
      return fm !== null && /^(title|description):.*\{\{/m.test(fm);
    });
    expect(offenders.map((file) => relative(SITE_SRC, file))).toEqual([]);
  });
});
