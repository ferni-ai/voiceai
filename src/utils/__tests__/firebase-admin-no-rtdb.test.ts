/**
 * No code uses firebase-admin's Realtime Database.
 *
 * firebase-admin 14 depends on @firebase/database-compat 2.1.x, which declares
 * @firebase/app and @firebase/app-compat as optional peers. In this workspace pnpm
 * satisfies them with the copies the web app's firebase 13 brings, and those declare
 * engines.node >=24.12.0, while the server runs Node 22. firebase-admin 14 itself needs
 * only >=22. The Realtime Database entry point (firebase-admin/database) is the only
 * part of firebase-admin that loads database-compat, so as long as nothing imports it,
 * those packages sit on disk and never run.
 *
 * This test keeps it that way: it fails if any file imports firebase-admin/database,
 * or calls `.database(` in a file that imports firebase-admin. If you need the Realtime
 * Database, move the server runtime to Node 24 first, then drop this test. Imports are
 * read with TypeScript's import scanner (static imports, re-exports, `import type`,
 * `import()` and `require()`).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const RTDB_ENTRY = /^firebase-admin\/database(\/|$)/;
const ADMIN = /^firebase-admin(\/|$)/;

function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--'].concat(
      ['ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs', 'jsx'].map((ext) => `*.${ext}`)
    ),
    { cwd: ROOT, maxBuffer: 1 << 28 }
  );
  return out.toString('utf8').split('\0').filter(Boolean);
}

/** `file -> what` for each Realtime Database use. */
function realtimeDatabaseUses(files: string[], read: (file: string) => string): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (file === 'src/utils/__tests__/firebase-admin-no-rtdb.test.ts') continue;
    let text: string;
    try {
      text = read(file);
    } catch {
      continue; // listed by git but deleted in the working tree
    }
    if (!text.includes('firebase-admin')) continue;
    const specifiers = ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);
    for (const s of specifiers) if (RTDB_ENTRY.test(s)) found.push(`${file} -> ${s}`);
    if (specifiers.some((s) => ADMIN.test(s)) && /\.database\(/.test(text)) {
      found.push(`${file} -> .database(`);
    }
  }
  return found;
}

describe("firebase-admin's Realtime Database stays unused", () => {
  const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

  it('no file imports firebase-admin/database or calls .database() next to firebase-admin', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(1000); // the scan saw the repo, not an empty list
    expect(
      realtimeDatabaseUses(files, read),
      'The Realtime Database loads @firebase/app, which needs Node >=24.12; the server runs ' +
        "Node 22 (see this file's header)."
    ).toEqual([]);
  }, 60_000);

  it.each([
    ['src/services/example.ts', `import { getDatabase } from 'firebase-admin/database';`],
    ['scripts/example.mjs', `const { getDatabase } = await import('firebase-admin/database');`],
    ['apps/async/src/example.js', `const rtdb = require('firebase-admin/database');`],
    [
      'src/services/example.ts',
      `import { getApp } from 'firebase-admin/app';\nconst ref = getApp().database().ref('x');`,
    ],
  ])('flags %s', (file, source) => {
    expect(realtimeDatabaseUses([file], () => source)).toHaveLength(1);
  });

  it.each([
    ['src/services/example.ts', `import { getFirestore } from 'firebase-admin/firestore';`],
    [
      'src/memory/example.ts',
      `import { Spanner } from '@google-cloud/spanner';\nconst db = instance.database('graph');`,
    ],
  ])('allows %s', (file, source) => {
    expect(realtimeDatabaseUses([file], () => source)).toEqual([]);
  });
});
