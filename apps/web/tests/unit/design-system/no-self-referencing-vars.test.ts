/**
 * A custom property that reads itself (`--x: var(--x)`, or
 * `--x: calc(var(--x) * 2)`) is a dependency cycle. The browser makes it
 * invalid at computed-value time, so the token is wiped out for that element,
 * every fallback like `var(--x, #fff)` kicks in, and anything built from it
 * breaks too. That turned Midnight team cards white late at night.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../../../..');
const ROOTS = ['apps/web/src', 'apps/website/ferni-website/src/css'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '_site', '__tests__']);

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(css|ts)$/.test(name) && !/\.(test|spec|d)\.ts$/.test(name)) yield path;
  }
}

/** `--name: value` declarations whose value reads `var(--name ...)`. */
function findSelfReferences(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const hits: string[] = [];
  for (const m of code.matchAll(/(--[\w-]+)\s*:([^;{}]*)/g)) {
    const [, name, value] = m;
    if (new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value)) hits.push(`${name}:${value.trim()}`);
  }
  return hits;
}

describe('findSelfReferences', () => {
  it('flags direct and computed self-references', () => {
    expect(findSelfReferences('a { --x: var(--x); }')).toHaveLength(1);
    expect(findSelfReferences('a { --d: calc(var(--d, 5s) * 2); }')).toHaveLength(1);
  });

  it('ignores other variables, prefixes and comments', () => {
    expect(findSelfReferences('a { --x: var(--x-base); --y: var(--x); }')).toEqual([]);
    expect(findSelfReferences('/* --x: var(--x) */')).toEqual([]);
  });
});

describe('design tokens', () => {
  it('no custom property references itself', () => {
    const failures: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(resolve(REPO, root))) {
        for (const hit of findSelfReferences(readFileSync(file, 'utf8'))) {
          failures.push(`${relative(REPO, file)}: ${hit}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
