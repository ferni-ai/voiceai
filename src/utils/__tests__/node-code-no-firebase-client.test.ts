/**
 * No code that runs in Node imports the Firebase client SDK (`firebase`, `firebase/*`,
 * `@firebase/*`). `firebase-admin` is the server SDK and stays allowed.
 *
 * firebase 13 declares `engines.node >=24.12.0` (firebase-js-sdk #10314), a support
 * floor for Node consumers. We build and test on Node 22 and declare our own build/test
 * floor instead, which is only honest while the client SDK runs in the browser and
 * nowhere else. This test keeps that true. If Node code ever needs the client SDK,
 * move the runtime to Node 24 first, then drop this test.
 *
 * Browser code (apps/web/src) is exempt. apps/web's vitest files run in Node, but
 * apps/web/vitest.config.ts aliases firebase/app and firebase/auth to a stub, so they
 * may import exactly the aliased specifiers and nothing else. Every other source file
 * in the repo counts as Node code: services, scripts, CLI, workers, configs and
 * Playwright specs alike. Imports are read with TypeScript's import scanner, which
 * sees static imports, re-exports, `import type`, `import()` and `require()`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const CLIENT_SDK = /^(firebase|@firebase\/[^/]+)(\/|$)/;
const BROWSER = /^apps\/web\/src\//;
const WEB_VITEST = /^apps\/web\/(src|tests)\/.*\.test\.tsx?$/;

/** The specifiers apps/web's vitest config points at its Firebase stub. */
function stubbedSpecifiers(): string[] {
  const config = readFileSync(join(ROOT, 'apps/web/vitest.config.ts'), 'utf8');
  return [...config.matchAll(/'(firebase\/[a-z-]+)':\s*firebaseStub/g)].map((m) => m[1] ?? '');
}

function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      '*.ts',
      '*.tsx',
      '*.mts',
      '*.cts',
      '*.js',
      '*.mjs',
      '*.cjs',
      '*.jsx',
    ],
    { cwd: ROOT, maxBuffer: 1 << 28 }
  );
  return out.toString('utf8').split('\0').filter(Boolean);
}

/** `file -> specifier` for each client-SDK import that would run in Node. */
function clientSdkImportsInNode(
  files: string[],
  read: (file: string) => string,
  stubbed: string[]
): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (BROWSER.test(file) && !WEB_VITEST.test(file)) continue;
    let text: string;
    try {
      text = read(file);
    } catch {
      continue; // listed by git but deleted in the working tree
    }
    if (!text.includes('firebase')) continue;
    for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
      if (!CLIENT_SDK.test(fileName)) continue;
      if (WEB_VITEST.test(file) && stubbed.includes(fileName)) continue;
      found.push(`${file} -> ${fileName}`);
    }
  }
  return found;
}

describe('the Firebase client SDK never runs in Node', () => {
  const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

  it('no Node-executed file imports firebase, firebase/* or @firebase/*', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(1000); // the scan saw the repo, not an empty list
    expect(
      clientSdkImportsInNode(files, read, stubbedSpecifiers()),
      'Node code must not import the Firebase client SDK: firebase 13 supports only Node >=24.12 and ' +
        "we declare the Node 22 build/test floor (see this file's header). Use firebase-admin on the server."
    ).toEqual([]);
  }, 60_000);

  it("apps/web's vitest config still stubs the specifiers its tests may import", () => {
    expect(stubbedSpecifiers().sort()).toEqual(['firebase/app', 'firebase/auth']);
  });

  it.each([
    ['src/agents/example.ts', `import { initializeApp } from 'firebase/app';`],
    ['scripts/example.ts', `const auth = await import('firebase/auth');`],
    ['apps/async/src/example.js', `const fb = require('firebase');`],
    ['apps/web/vite.config.ts', `export * from '@firebase/firestore';`],
    ['apps/web/tests/example.test.ts', `const db = await import('firebase/firestore');`],
  ])('flags %s', (file, source) => {
    expect(
      clientSdkImportsInNode([file], () => source, ['firebase/app', 'firebase/auth'])
    ).toHaveLength(1);
  });

  it.each([
    ['src/services/example.ts', `import { getFirestore } from 'firebase-admin/firestore';`],
    ['apps/web/src/config/example.ts', `import { initializeApp } from 'firebase/app';`],
    [
      'apps/web/tests/example.test.ts',
      `const { signInAnonymously } = await import('firebase/auth');`,
    ],
  ])('allows %s', (file, source) => {
    expect(clientSdkImportsInNode([file], () => source, ['firebase/app', 'firebase/auth'])).toEqual(
      []
    );
  });
});
