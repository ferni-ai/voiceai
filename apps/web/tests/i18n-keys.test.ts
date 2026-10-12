/**
 * Every literal translation key the UI asks for must exist in en-US.
 *
 * t() returns the key itself when nothing matches, and that string is never
 * falsy, so the common `t('a.b') || 'Fallback'` pattern never reaches its
 * fallback: users saw raw keys such as "roadmap.suggestionTitlePlaceholder" in
 * inputs and buttons. 54 keys were missing when this test was added.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t, tIfComplete } from '../src/i18n/index';
// Shared with `node tests/i18n-audit.mjs`, which also prints locale backlog numbers.
import { audit, loadLocale, objectKeys, tCalls, valueOf } from './i18n-audit.mjs';

const SRC = join(__dirname, '..', 'src');
const EN_US = loadLocale('en-US');
const hasKey = (key: string): boolean => valueOf(EN_US, key) !== undefined;
const report = audit();

describe('i18n keys', () => {
  it('finds keys to check (scanner sanity check)', () => {
    expect(hasKey('common.loading')).toBe(true);
    expect(hasKey('common.definitelyNotAKey')).toBe(false);
  });

  it('every literal key used in src/ exists in en-US', () => {
    // i18n/index.ts documents t() with an illustrative key in its JSDoc.
    expect(report.missing.filter((entry: string) => !entry.endsWith(' hero.headline'))).toEqual([]);
  });

  it('reads the param names a call passes', () => {
    expect(objectKeys('{ amount: total, count }')).toEqual(new Set(['amount', 'count']));
    expect(objectKeys('{ ...rest }')).toBeNull();
    const [call] = tCalls("t('a.b', 'Fallback {n}', { n: fmt(x, { y: 1 }) })");
    expect(call).toMatchObject({ key: 'a.b', fallback: 'Fallback {n}', params: new Set(['n']) });
    expect(tCalls("t('a.b').replace('{n}', v)")[0]).toMatchObject({ params: undefined, replacedAfter: true });
  });

  it('every placeholder gets a param, including calls that pass none', () => {
    // A missing param is stripped at runtime, so the sentence silently loses a word.
    expect(report.unfilled).toEqual([]);
  });

  it('no key-shaped literal points into a namespace but misses its key', () => {
    expect(report.rawKeys).toEqual([]);
  });

  it('every data-i18n key in index.html exists in en-US', () => {
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1] as string);
    expect(keys.length).toBeGreaterThan(5);
    expect(keys.filter((key) => !hasKey(key))).toEqual([]);
  });

  it('interpolates params into the fallback text', () => {
    expect(t('test.missing.key', { seeds: 5 }, "You'll both get {seeds} seeds")).toBe("You'll both get 5 seeds");
  });

  it('never shows a raw placeholder when a param is missing', () => {
    const summary = undefined as unknown as string;
    expect(t('toasts.teamInsight', { source: 'Ferni', summary })).toBe('Ferni: ');
    expect(t('test.missing.key', "Hi {name}, you've got {count}", { count: 2 })).toBe("Hi , you've got 2");
  });

  it('tIfComplete returns null unless every placeholder has a non-empty value', () => {
    expect(tIfComplete('toasts.teamInsight', { source: 'Maya', summary: 'Budget is 80% used.' })).toBe(
      'Maya: Budget is 80% used.'
    );
    expect(tIfComplete('toasts.teamInsight', { source: 'Ferni', summary: undefined as unknown as string })).toBeNull();
    expect(tIfComplete('toasts.teamInsight', { source: 'Ferni', summary: '  ' })).toBeNull();
    expect(tIfComplete('test.missing.key', { a: 1 })).toBeNull();
  });
});
