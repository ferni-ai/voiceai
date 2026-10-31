/**
 * The two generated lists (generated-lists.ts) are gitignored and written at
 * install, typecheck, build and test time, so nothing here reads a committed copy.
 * These check the generator itself: it is deterministic, it matches the current
 * tree, and the files the test run imports are exactly what it writes.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENV_READ_NAMES } from '../env-read-names.generated.js';
import * as FLAG_FILES from '../flags/index.generated.js';
import {
  FLAG_FILE,
  REPO_ROOT,
  envReadNames,
  envReadNamesSource,
  flagBarrelSource,
  flagFileNames,
  generatedLists,
  namesRead,
} from '../generated-lists.js';
import { MIN_ENV_READ_NAMES } from '../generated-guard.js';

const SRC = join(REPO_ROOT, 'src');
const FLAGS_DIR = join(SRC, 'config', 'flags');

describe('generated lists', () => {
  it('generates the same text twice from the same tree', () => {
    const first = generatedLists(REPO_ROOT);
    const second = generatedLists(REPO_ROOT);
    expect([...first.keys()].map((p) => p.slice(REPO_ROOT.length + 1)).sort()).toEqual([
      'src/config/env-read-names.generated.ts',
      'src/config/flags/index.generated.ts',
    ]);
    expect(second).toEqual(first);
  });

  it('is what the test run imports (the global setup wrote it)', () => {
    for (const [path, text] of generatedLists(REPO_ROOT)) {
      expect(readFileSync(path, 'utf8') === text, `${path} is stale: pnpm gen:lists`).toBe(true);
    }
  });
});

describe('flag barrel', () => {
  it('re-exports every flags/<NAME>.ts, sorted, and nothing else', () => {
    const files = readdirSync(FLAGS_DIR)
      .map((f) => FLAG_FILE.exec(f)?.[1])
      .filter((n): n is string => n !== undefined);
    expect(files.length).toBeGreaterThan(0);
    expect(flagFileNames(FLAGS_DIR)).toEqual([...files].sort());
    expect(Object.keys(FLAG_FILES).sort()).toEqual([...files].sort());
  });

  it('writes one export line per name, in the given order', () => {
    const source = flagBarrelSource(['A_ONE', 'B_TWO']);
    const lines = source.split('\n').filter((l) => l.startsWith('export { '));
    expect(lines).toEqual([
      "export { A_ONE } from './A_ONE.js';",
      "export { B_TWO } from './B_TWO.js';",
    ]);
    expect(source.endsWith('export {};\n')).toBe(true);
  });
});

describe('env read names', () => {
  it('finds the reads src/ makes', () => {
    const reads = namesRead(SRC);
    expect(reads.size).toBeGreaterThan(MIN_ENV_READ_NAMES);
    // Each kind of read the scan claims to cover, from a file that makes it.
    for (const name of ['NODE_ENV', 'PERSONA_ID', 'GEMINI_API_KEY', 'LAUGH_CAP']) {
      expect(reads.has(name), name).toBe(true);
    }
  });

  it('is sorted with no duplicates, and the imported list is the scan', () => {
    const names = envReadNames(SRC);
    expect(names).toEqual([...new Set(names)].sort());
    expect([...ENV_READ_NAMES]).toEqual(names);
  });

  it('round-trips: the source lists exactly the names, one per line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-names-'));
    const file = join(dir, 'names.ts');
    writeFileSync(file, envReadNamesSource(['A_B', 'C_D']));
    const mod = (await import(file)) as { ENV_READ_NAMES: string[] };
    expect(mod.ENV_READ_NAMES).toEqual(['A_B', 'C_D']);
  });

  it('refuses to generate from a tree with too few reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-scan-'));
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'a', 'x.ts'), 'const v = process.env.ONLY_ONE;\n');
    expect(namesRead(dir).has('ONLY_ONE')).toBe(true);
    expect(() => envReadNames(dir)).toThrow(/found 1 env reads/);
  });
});
