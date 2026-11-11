/**
 * The forget reader registry (forget-readers.ts) covers every file that touches a memory store.
 *
 * Scans src/ (non-test) for the store signature. Every matching file must be a registered reader,
 * a NOT_A_READER with a reason, on the DEAD_PATH step 6 deletes, or still UNCLASSIFIED, a list that only shrinks: a new reader
 * cannot land without saying whether it honours "forget that". Each registered reader must still
 * be where the registry says (its file holds its read site), so a moved reader is re-registered.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEAD_PATH,
  FORGET_READERS,
  NOT_A_READER,
  STORE_SIGNATURE,
  UNCLASSIFIED,
} from './forget-readers.js';

const ROOT = join(__dirname, '../../../..');
const SRC = join(ROOT, 'src');
const IS_TEST = /(__tests__|\/tests\/|\.test\.ts$|\.spec\.ts$|\.d\.ts$)/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (path.endsWith('.ts') && !IS_TEST.test(path)) out.push(path);
  }
  return out;
}

const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
const touching = sourceFiles(SRC)
  .filter((path) => STORE_SIGNATURE.test(readFileSync(path, 'utf8')))
  .map((path) => relative(ROOT, path))
  .sort();
const readerFiles = new Set(FORGET_READERS.map((r) => r.file));

/** Today's size of UNCLASSIFIED: lower it as files are triaged, never raise it. */
const UNCLASSIFIED_CEILING = 36;

describe('forget reader registry', () => {
  it('the scan finds the store files it is meant to (not a vacuous pass)', () => {
    expect(touching).toContain('src/memory/storage/call-summaries.ts');
    expect(touching).toContain('src/tools/domains/awareness/index.ts');
    expect(touching.length).toBeGreaterThan(80);
  });

  it('every file that touches a memory store is classified', () => {
    const known = new Set([
      ...readerFiles,
      ...Object.keys(NOT_A_READER),
      ...Object.keys(DEAD_PATH),
      ...UNCLASSIFIED,
    ]);
    expect(touching.filter((f) => !known.has(f))).toEqual([]);
  });

  it('NOT_A_READER and UNCLASSIFIED hold no stale or doubled entries', () => {
    const scanned = new Set(touching);
    const listed = [...Object.keys(NOT_A_READER), ...UNCLASSIFIED];
    expect(listed.filter((f) => !scanned.has(f))).toEqual([]);
    expect(listed.filter((f) => readerFiles.has(f))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
    for (const reason of Object.values(NOT_A_READER)) expect(reason.trim()).not.toBe('');
  });

  it('DEAD_PATH files are listed nowhere else, and say why', () => {
    const elsewhere = new Set([...readerFiles, ...Object.keys(NOT_A_READER), ...UNCLASSIFIED]);
    expect(Object.keys(DEAD_PATH).filter((f) => elsewhere.has(f))).toEqual([]);
    for (const reason of Object.values(DEAD_PATH)) expect(reason.trim()).not.toBe('');
    // Step 6 deletes these; until then a path that matches no file is a typo hiding a reader.
    const stepSixLanded = !existsSync(
      join(SRC, 'intelligence/context-builders/core/builder-imports.ts')
    );
    if (!stepSixLanded) {
      expect(Object.keys(DEAD_PATH).filter((f) => !existsSync(join(ROOT, f)))).toEqual([]);
    }
  });

  it('UNCLASSIFIED only shrinks', () => {
    expect(UNCLASSIFIED.length).toBeLessThanOrEqual(UNCLASSIFIED_CEILING);
  });

  it.each(FORGET_READERS.map((r) => [r.id, r] as const))(
    '%s is where the registry says',
    (_, r) => {
      expect(read(r.file)).toContain(r.site);
      if (!r.probe) return;
      const probe = read(r.probe); // throws if the probe file is gone
      // The registry-driven probes read each reader by its id.
      if (r.probe.includes('forget-probe-')) expect(probe).toContain(`'${r.id}'`);
    }
  );

  it('ids are unique, and every unchecked reader names the PR that fixes it', () => {
    const ids = FORGET_READERS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FORGET_READERS.filter((r) => r.check === 'none' && !r.fix).map((r) => r.id)).toEqual([]);
    expect(FORGET_READERS.filter((r) => r.check !== 'none' && r.fix).map((r) => r.id)).toEqual([]);
  });
});
