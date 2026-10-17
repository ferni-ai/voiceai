/**
 * The EFFECTIVE_SETTINGS report names every env var src/ reads. This fails when a
 * read appears that the generated list does not cover, so the list cannot drift.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENV_READ_NAMES } from '../env-read-names.generated.js';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out);
    } else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

// env.X, env['X'] (also process.env.X, and an env passed in as a parameter), and a name passed to a config helper.
const READ =
  /(?:\benv(?:\.|\[['"])|\b(?:getEnv|requireEnv|flagOn|envEnabled)\(\s*['"])([A-Z][A-Z0-9_]+)/g;

function namesRead(): Map<string, string> {
  const reads = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(READ)) {
      const name = m[1];
      const line = text.slice(0, m.index).split('\n').length;
      if (!reads.has(name)) reads.set(name, `${relative(SRC, file)}:${line}`);
    }
  }
  return reads;
}

describe('env read names', () => {
  it('lists every env name src/ reads', () => {
    const listed = new Set(ENV_READ_NAMES);
    const reads = namesRead();
    expect(reads.size).toBeGreaterThan(500); // the scanner still finds the reads
    const missing = [...reads].filter(([name]) => !listed.has(name));
    expect(
      missing.map(([name, where]) => `${name} (${where})`),
      'Regenerate src/config/env-read-names.generated.ts (see its header)'
    ).toEqual([]);
  });

  it('has no duplicate names', () => {
    expect(new Set(ENV_READ_NAMES).size).toBe(ENV_READ_NAMES.length);
  });
});
