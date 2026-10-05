/**
 * Every literal translation key the UI asks for must exist in en-US.
 *
 * t() returns the key itself when nothing matches, and that string is never
 * falsy, so the common `t('a.b') || 'Fallback'` pattern never reaches its
 * fallback: users saw raw keys such as "roadmap.suggestionTitlePlaceholder" in
 * inputs and buttons. 54 keys were missing when this test was added.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n/index';

const SRC = join(__dirname, '..', 'src');
const EN_US = JSON.parse(readFileSync(join(SRC, 'i18n', 'locales', 'en-US.json'), 'utf8'));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|d)\.ts$/.test(name) ? [path] : [];
  });
}

function valueOf(key: string): string | undefined {
  let node: unknown = EN_US;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function hasKey(key: string): boolean {
  return valueOf(key) !== undefined;
}

/** `file:line key` for every literal dotted t('...') key missing from en-US. */
function missingKeys(): string[] {
  return sourceFiles(SRC).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)['"]/g)]
      .filter((m) => !hasKey(m[1]))
      .map((m) => `${relative(SRC, file)}:${source.slice(0, m.index).split('\n').length} ${m[1]}`);
  });
}

/** Names a t('key', { ... }) call passes, or null when a spread hides them. */
function paramNames(objectBody: string): Set<string> | null {
  const names = new Set<string>();
  for (const part of objectBody.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (part.startsWith('...')) return null;
    const name = /^['"]?(\w+)['"]?\s*(?::|$)/.exec(part)?.[1];
    if (name) names.add(name);
  }
  return names;
}

/**
 * `file:line key` for t() calls that leave an en-US placeholder unfilled, which
 * renders literally ("Your balance: {amount} seeds"). Only calls whose params
 * are a flat object literal are checked.
 */
function unfilledPlaceholders(): string[] {
  return sourceFiles(SRC).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)['"]\s*,\s*\{([^{}]*)\}/g)]
      .filter((m) => {
        const passed = paramNames(m[2]);
        const wanted = [...(valueOf(m[1]) ?? '').matchAll(/\{(\w+)\}/g)].map((p) => p[1]);
        return passed !== null && wanted.some((name) => !passed.has(name));
      })
      .map((m) => `${relative(SRC, file)}:${source.slice(0, m.index).split('\n').length} ${m[1]}`);
  });
}

describe('i18n keys', () => {
  it('finds keys to check (scanner sanity check)', () => {
    expect(hasKey('common.loading')).toBe(true);
    expect(hasKey('common.definitelyNotAKey')).toBe(false);
  });

  it('every literal key used in src/ exists in en-US', () => {
    // i18n/index.ts documents t() with an illustrative key in its JSDoc.
    expect(missingKeys().filter((entry) => !entry.endsWith(' hero.headline'))).toEqual([]);
  });

  it('every placeholder in a checked call gets a param', () => {
    expect(paramNames('amount: total, count')).toEqual(new Set(['amount', 'count']));
    expect(paramNames('...rest')).toBeNull();
    expect(unfilledPlaceholders()).toEqual([]);
  });

  it('interpolates params into the fallback text', () => {
    expect(t('test.missing.key', { seeds: 5 }, "You'll both get {seeds} seeds")).toBe("You'll both get 5 seeds");
  });
});
