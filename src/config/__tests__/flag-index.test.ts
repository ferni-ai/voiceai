/**
 * src/config/flags/index.generated.ts re-exports every flag file, one line per
 * flag. This test fails unless the barrel is exactly what flag-barrel.ts would
 * write, and UPDATE_FLAG_INDEX=1 (`pnpm flags:gen`) rewrites it.
 *
 * It reads the barrel as text and never imports it: a bad union merge
 * (.gitattributes) can leave the barrel unparseable, and an import would then stop
 * this file loading, so the regenerate hint and the rewrite could not run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FLAG_BARREL_HEADER as HEADER,
  FLAG_BARREL_TAIL as TAIL,
  flagBarrelSource as generatedSource,
  flagFileNames,
  writeFlagBarrel,
} from './flag-barrel.js';

const FLAGS_DIR = join(__dirname, '..', 'flags');
const BARREL = join(FLAGS_DIR, 'index.generated.ts');
const LINE = /^export \{ ([A-Z][A-Z0-9_]*) \} from '\.\/\1\.js';$/;
const REGENERATE = 'Regenerate the flag barrel: pnpm flags:gen';
const UNPARSEABLE = `The flag barrel is not in the generated shape (a bad merge?). ${REGENERATE}`;

/** The names the barrel lists, or null when it is not the generator's shape. */
function listedNames(): string[] | null {
  const text = readFileSync(BARREL, 'utf8');
  if (!text.startsWith(HEADER) || !text.endsWith(TAIL)) return null;
  const body = text.slice(HEADER.length, text.length - TAIL.length);
  const lines = body === '' ? [] : body.replace(/\n$/, '').split('\n');
  const names = lines.map((line) => LINE.exec(line)?.[1]);
  return names.every((n) => n !== undefined) ? (names as string[]) : null;
}

describe('flag barrel', () => {
  // The union driver keeps both sides' lines: it can leave two added names out of
  // order, bring back a line the other side deleted, or duplicate one. Only an exact
  // match with the directory makes that safe.
  it('is exactly what the generator writes for src/config/flags/', () => {
    const names = flagFileNames(FLAGS_DIR);
    if (process.env.UPDATE_FLAG_INDEX === '1') {
      writeFlagBarrel(FLAGS_DIR);
      return;
    }
    const listed = listedNames();
    expect(listed, UNPARSEABLE).not.toBeNull();
    expect(listed, REGENERATE).toEqual(names);
    expect(readFileSync(BARREL, 'utf8') === generatedSource(names), REGENERATE).toBe(true);
  });
});
