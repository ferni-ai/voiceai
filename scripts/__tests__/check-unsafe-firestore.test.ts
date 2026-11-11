/**
 * quality:firestore fails only on unsafe Firestore writes a change adds against its merge
 * base. Each case builds a throwaway git repo: a base commit, then the change on top.
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { findUnsafeWrites, newUnsafeWrites } from '../check-unsafe-firestore.js';

const SCRIPT = fileURLToPath(new URL('../check-unsafe-firestore.ts', import.meta.url));
const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));
const UNSAFE = "  await db.collection('profiles').doc(id).set(data);";
const SAFE = "  await safeSet(db.collection('profiles').doc(id), data);";
const store = (...body: string[]): string =>
  [
    "import { getFirestore } from 'firebase-admin/firestore';",
    'const db = getFirestore();',
    '',
    'export async function save(id: string, data: object): Promise<void> {',
    ...body,
    '}',
    '',
  ].join('\n');

let root: string;
const git = (...args: string[]): string =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
const write = (files: Record<string, string>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
};
/** A repo whose base commit has one known unsafe write; returns the base sha. */
function repo(): string {
  root = mkdtempSync(join(tmpdir(), 'firestore-ratchet-'));
  git('init', '-q', '-b', 'main');
  write({ 'src/store.ts': store(UNSAFE), 'src/other.ts': store(SAFE) });
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return git('rev-parse', 'HEAD');
}
const added = (base: string) => newUnsafeWrites(root, { QUALITY_BASE: base }).added;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('findUnsafeWrites', () => {
  it('flags a bare write and passes a wrapped one', () => {
    expect(findUnsafeWrites('a.ts', store(UNSAFE))).toEqual([
      { file: 'a.ts', line: 5, code: UNSAFE.trim(), type: 'set' },
    ]);
    expect(findUnsafeWrites('a.ts', store(SAFE))).toEqual([]);
  });
});

describe('quality:firestore against the merge base', () => {
  it('fails a new site in a changed file, with its line', () => {
    const base = repo();
    // The safe wrapper is gone from the lines around the write, so it is now unsafe.
    write({ 'src/other.ts': store("  await db.collection('notes').add({ id });") });
    expect(added(base)).toEqual([
      {
        file: 'src/other.ts',
        line: 5,
        code: "await db.collection('notes').add({ id });",
        type: 'add',
      },
    ]);
  });

  it('passes a known site in a file the change edits elsewhere', () => {
    const base = repo();
    write({ 'src/store.ts': `${store(UNSAFE)}export const edited = true;\n` });
    expect(added(base)).toEqual([]);
  });

  it('passes a site that moved down its file, or moved with its file', () => {
    const base = repo();
    write({ 'src/store.ts': `// a comment\n// and another\n${store(`  ${UNSAFE}`)}` });
    expect(added(base)).toEqual([]);
    mkdirSync(join(root, 'src/profiles'));
    git('mv', 'src/store.ts', 'src/profiles/store.ts');
    expect(added(base)).toEqual([]);
  });

  it('fails a second copy of a known site', () => {
    const base = repo();
    write({ 'src/store.ts': store(UNSAFE, UNSAFE) });
    expect(added(base)).toHaveLength(1);
  });

  it('fails when the merge base cannot be resolved', () => {
    repo();
    expect(() => newUnsafeWrites(root, { QUALITY_BASE: 'f'.repeat(40) })).toThrow(
      /could not be fetched/
    );
  });

  it('exits non-zero with file:line on a new site, and on a missing base', () => {
    const base = repo();
    write({ 'src/store.ts': store(UNSAFE, UNSAFE) });
    const run = (env: NodeJS.ProcessEnv) =>
      spawnSync(TSX, [SCRIPT], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '', ...env },
      });
    const fail = run({ QUALITY_BASE: base });
    expect(fail.status).toBe(1);
    expect(fail.stdout).toContain('src/store.ts:6  unsafe-set');
    const lost = run({ QUALITY_BASE: 'f'.repeat(40) });
    expect(lost.status).toBe(1);
    expect(lost.stderr).toContain('could not run');
    expect(readFileSync(join(root, 'src/store.ts'), 'utf8')).toBe(store(UNSAFE, UNSAFE));
  });
});
