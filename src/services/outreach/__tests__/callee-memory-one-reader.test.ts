/**
 * call_memories holds untrusted words from whoever answered a call Ferni made. The
 * unmerged feat/contact-call-memory kept them beside the owner's facts, and every new
 * reader of that collection forgot the filter (three leaks in review). So the store has
 * one writer and one reader, and this test fails when any other production module
 * imports the store or names its collection. A new reader is a design change: add it
 * here on purpose, with its guard.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..', '..');
const SRC = join(ROOT, 'src');
const DIR = 'src/services/outreach/callee-memory/';

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') sources(path, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(relative(ROOT, path));
    }
  }
  return out;
}

const FILES = sources(SRC).map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const importing = (target: RegExp): string[] =>
  FILES.filter(({ text }) => target.test(text))
    .map(({ path }) => path)
    .sort();

describe('call_memories: one writer, one reader, nothing else', () => {
  it('only the capture path reaches into callee-memory from outside it', () => {
    expect(
      importing(/from\s+['"][^'"]*callee-memory\/|import\(\s*['"][^'"]*callee-memory\//).filter(
        (p) => !p.startsWith(DIR)
      )
    ).toEqual(['src/services/outreach/call-result-capture.ts']);
  });

  it('inside callee-memory, only the writer and its extraction import the store', () => {
    expect(importing(/from\s+['"]\.\/store\.js['"]/).filter((p) => p.startsWith(DIR))).toEqual([
      `${DIR}extract.ts`,
      `${DIR}writer.ts`,
    ]);
  });

  it('no other module names the collection (the export allowlist lists it, read as stored)', () => {
    expect(importing(/['"`]call_memories['"`]/)).toEqual([
      `${DIR}store.ts`,
      'src/services/platform/user-records-export.ts',
    ]);
  });
});
