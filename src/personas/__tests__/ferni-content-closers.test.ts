/**
 * identity/character.md: Ferni doesn't "thank people for sharing". The persona
 * content still closed sessions with "Thank you for trusting me with this." and
 * had the same line in several variants (with that / with it / with the hard
 * stuff), plus "Thank you for sharing that." This walks every string in the
 * Ferni content JSON and fails on any of them.
 *
 * Sibling of ferni-content-banned-phrases.test.ts (PR #1042, which covers
 * "I'll be here when you need me" and streak counts). Fold the two together
 * once both are on main.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONTENT = join(process.cwd(), 'src', 'personas', 'bundles', 'ferni', 'content');

const THANKS_FOR_SHARING = /\bthank(?:s| you) for (?:trusting me with|sharing)\b/i;

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return jsonFiles(path);
    return e.name.endsWith('.json') ? [path] : [];
  });
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('Ferni persona content: no thanking people for sharing', () => {
  it('flags the closer and its variants, and passes ordinary lines', () => {
    expect(THANKS_FOR_SHARING.test('Thank you for trusting me with this.')).toBe(true);
    expect(THANKS_FOR_SHARING.test('That was real. Thank you for trusting me with it.')).toBe(true);
    expect(THANKS_FOR_SHARING.test('Thanks for trusting me with that.')).toBe(true);
    expect(THANKS_FOR_SHARING.test("That's real. Thank you for sharing that.")).toBe(true);
    expect(THANKS_FOR_SHARING.test('Go easy on yourself, okay?')).toBe(false);
    expect(THANKS_FOR_SHARING.test('If you trusted yourself here, what would you do?')).toBe(false);
  });

  it('the core methodology closing no longer thanks them for trusting Ferni', () => {
    const file = join(CONTENT, 'methodologies', 'core-methodology.json');
    const { fernisPhrases } = JSON.parse(readFileSync(file, 'utf8')) as {
      fernisPhrases: { closing: string[] };
    };
    const { closing } = fernisPhrases;
    expect(closing).toContain('Go easy on yourself, okay?');
    expect(closing.filter((s) => THANKS_FOR_SHARING.test(s))).toEqual([]);
  });

  it('no Ferni content string thanks the person for sharing', () => {
    const files = jsonFiles(CONTENT);
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) =>
      strings(JSON.parse(readFileSync(file, 'utf8')))
        .filter((s) => THANKS_FOR_SHARING.test(s))
        .map((s) => `${relative(CONTENT, file)}: ${s}`)
    );
    expect(offenders).toEqual([]);
  });
});
