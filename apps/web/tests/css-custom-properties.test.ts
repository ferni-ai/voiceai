/**
 * CSS custom property guard
 *
 * `--x: var(--x)` is a self-referencing custom property. CSS treats it as
 * invalid at computed-value time, so it doesn't "pass the token through": it
 * erases the token for every element it applies to. inline-styles.css shipped
 * eight of these on :root, which wiped --color-text-primary (and borders and
 * accent hover) in every theme and left headings near-invisible on zen.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const WEB_ROOT = join(__dirname, '..');

function cssFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(dir, f));
}

/** Returns `line: declaration` for every `--x: var(--x ...)` in the source. */
function findSelfReferences(css: string): string[] {
  const hits: string[] = [];
  css.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*[,)]/);
    if (m && m[1] === m[2]) hits.push(`${i + 1}: ${line.trim()}`);
  });
  return hits;
}

describe('CSS custom properties', () => {
  it('detects a self-referencing declaration (scanner sanity check)', () => {
    const fixture = ':root {\n  --color-text-primary: var(--color-text-primary);\n  --ok: var(--other);\n}';
    expect(findSelfReferences(fixture)).toEqual(['2: --color-text-primary: var(--color-text-primary);']);
  });

  it('never aliases a custom property to itself', () => {
    const files = [
      ...cssFilesUnder(join(WEB_ROOT, 'src')),
      ...cssFilesUnder(join(WEB_ROOT, 'public', 'design-system')),
    ];
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap((file) =>
      findSelfReferences(readFileSync(file, 'utf8')).map((hit) => `${relative(WEB_ROOT, file)}:${hit}`)
    );
    expect(offenders).toEqual([]);
  });
});
