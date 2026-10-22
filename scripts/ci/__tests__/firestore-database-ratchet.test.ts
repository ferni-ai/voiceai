/**
 * The Firestore database ratchet must fail a NEW client that ignores
 * FIRESTORE_DATABASE, pass the allowlisted ones, and skip the helpers and tests.
 * Runs measure() over a throwaway tree laid out like the repo.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowlistAt,
  countByFile,
  lowered,
  measure,
  raised,
  regressions,
} from '../firestore-database-ratchet.js';
import { transformFile } from '../../codemods/firestore-database.js';

let root: string | undefined;

function tree(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'fs-db-ratchet-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

const VIOLATIONS = `
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
export const a = new Firestore({ projectId: 'p' });
export const b = admin.firestore();
export const c = getFirestore();
export async function d() {
  const { getFirestore: getFs } = await import('firebase-admin/firestore');
  return getFs();
}
`;

const CLEAN = `
import { Firestore } from '@google-cloud/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirestoreDatabase } from '../config/environment.js';
// A local wrapper with the same name is not firebase-admin's.
function getFirestoreLocal() { return null; }
export const a = new Firestore({ projectId: 'p', databaseId: getFirestoreDatabase() });
export const b = getFirestore(getFirestoreDatabase());
export const c = getFirestoreLocal();
`;

describe('firestore database ratchet', () => {
  it('fails a new violation in a file that is not allowlisted', () => {
    const r = tree({ 'src/services/new-store.ts': VIOLATIONS, 'src/services/ok-store.ts': CLEAN });
    const found = measure(r);
    expect(found.map((v) => v.site.kind).sort()).toEqual([
      'admin-get-firestore',
      'admin-get-firestore',
      'admin-namespace',
      'new-firestore',
    ]);
    const worse = regressions({}, found);
    expect(worse).toHaveLength(1);
    expect(worse[0]).toContain('src/services/new-store.ts');
  });

  it('passes allowlisted sites and fails one more than allowlisted', () => {
    const r = tree({ 'scripts/tool.ts': VIOLATIONS });
    const found = measure(r);
    expect(regressions({ 'scripts/tool.ts': 4 }, found)).toEqual([]);
    expect(regressions({ 'scripts/tool.ts': 3 }, found)).toHaveLength(1);
  });

  it('follows an aliased Firestore class, static or lazy', () => {
    const r = tree({
      'src/services/aliased.ts': `
        import { Firestore as Fz } from '@google-cloud/firestore';
        export const a = new Fz({ projectId: 'p' });
        export async function b() {
          const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
          return new FirestoreClass();
        }
        export async function c() {
          const Fc = (await import('@google-cloud/firestore')).Firestore;
          return new Fc({ databaseId: 'x' });
        }
      `,
    });
    const found = measure(r);
    expect(found.map((v) => v.site.text)).toEqual([
      "new Fz({ projectId: 'p' })",
      'new FirestoreClass()',
    ]);
    expect(regressions({}, found)).toHaveLength(1);
  });

  it("reads main's allowlist, and says when it can't", () => {
    const repo = tree({ 'scripts/ci/list.json': '{"src/a.ts": 2}\n' });
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
    git('init', '-q', '-b', 'main');
    expect(allowlistAt(repo, 'main', 'scripts/ci/list.json')).toBe('no-ref');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');
    expect(allowlistAt(repo, 'main', 'scripts/ci/list.json')).toEqual({ 'src/a.ts': 2 });
    expect(allowlistAt(repo, 'main', 'scripts/ci/other.json')).toBe('no-file');
  });

  it('ignores the two helpers and test files', () => {
    const r = tree({
      'src/utils/firebase-admin-app.ts': VIOLATIONS,
      'src/utils/firestore-utils.ts': VIOLATIONS,
      'src/services/__tests__/store.test.ts': VIOLATIONS,
      'apps/web/src/client.ts': VIOLATIONS,
    });
    expect(measure(r)).toEqual([]);
  });

  it('only lowers the allowlist, and flags an allowlist raised above main', () => {
    const r = tree({ 'src/a.ts': VIOLATIONS });
    const found = measure(r);
    expect(lowered({ 'src/a.ts': 9, 'src/gone.ts': 2 }, found)).toEqual({ 'src/a.ts': 4 });
    expect(countByFile(found)).toEqual({ 'src/a.ts': 4 });
    expect(raised({ 'src/a.ts': 4 }, { 'src/a.ts': 5 })).toHaveLength(1);
    expect(raised({ 'src/a.ts': 4 }, { 'src/a.ts': 3 })).toEqual([]);
  });
});

describe('firestore-database codemod', () => {
  it('rewrites every banned shape, and a second run changes nothing', async () => {
    const file = 'src/services/new-store.ts';
    const once = await transformFile(file, VIOLATIONS);
    expect(once.outcomes.filter((o) => o.skipped)).toEqual([]);
    expect(once.text).toContain(
      "new Firestore({ projectId: 'p', databaseId: getFirestoreDatabase() })"
    );
    expect(once.text).toContain(
      "import { getAdminFirestore } from '../utils/firebase-admin-app.js';"
    );
    expect(once.text).toContain("import { getFirestoreDatabase } from '../config/environment.js';");
    expect(once.text).toContain("await import('../utils/firebase-admin-app.js')");
    expect(once.text).not.toMatch(/admin\.firestore\(\)|getFirestore\(\)|getFs\(\)/);

    const r = tree({ [file]: once.text });
    expect(measure(r)).toEqual([]);
    const twice = await transformFile(file, once.text);
    expect(twice.text).toBe(once.text);
  });

  it('moves the inline FIRESTORE_DATABASE copy onto getFirestoreDatabase()', async () => {
    const text = `import { Firestore } from '@google-cloud/firestore';\nexport const db = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE || '(default)' });\n`;
    const { text: next } = await transformFile('src/a.ts', text);
    expect(next).toContain('new Firestore({ databaseId: getFirestoreDatabase() })');
  });
});
