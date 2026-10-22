/**
 * flags:migrate on a throwaway git repo: main moves the legacy blocks file to flag
 * files while a PR edits the old layout; the PR's intent must land in main's layout.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFlagBarrel } from '../../../src/config/__tests__/flag-barrel.js';
import { migrateBranch } from '../migrate-branch.js';
import { moveToFiles } from '../move-to-files.js';

const BLOCKS = `import type { FlagSpec } from './flag-manifest-entries.js';

/** AA_ONE .. AB_MODE */
export const FLAGS_A = {
  // AA_ONE comment
  AA_ONE: { default: 'off', owner: 'voice', kind: 'experiment' },
  AB_MODE: { default: 'cartesia-cascade', owner: 'voice', kind: 'config' },
} as const satisfies Record<string, FlagSpec>;

/** ZZ_KEEP .. ZZ_TWO */
export const FLAGS_Z = {
  ZZ_KEEP: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  ZZ_TWO: { default: 'off', owner: 'platform', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;
`;

const MANIFEST = `import { FLAG_KINDS, FLAG_OWNERS, type FlagSpec } from './flag-manifest-entries.js';

import { FLAGS_A, FLAGS_Z } from './flag-manifest-blocks.js';
import { assembleManifest } from './flag-assembly.js';
import * as FLAG_FILES from './flags/index.generated.js';
export { FLAG_KINDS, FLAG_OWNERS, type FlagSpec };

const LEGACY_FLAG_MANIFEST = {
  ...FLAGS_A,
  MID: { default: 'off', owner: 'voice', kind: 'experiment' },
  ROTATED_SEGMENT_FIX: { default: 'off', owner: 'voice', kind: 'experiment' }, // 1.9.3 patch, #2566
  ...FLAGS_Z,
} as const satisfies Record<string, FlagSpec>;
export const FLAG_MANIFEST = assembleManifest(LEGACY_FLAG_MANIFEST, FLAG_FILES);
`;

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' });
const path = (root: string, p: string): string => join(root, 'src', 'config', p);
const read = (root: string, p: string): string => readFileSync(path(root, p), 'utf8');
function edit(root: string, p: string, from: string, to: string): void {
  const text = read(root, p);
  if (!text.includes(from)) throw new Error(`fixture: ${from} not in ${p}`);
  writeFileSync(path(root, p), text.replace(from, to));
}

/** A repo whose main moved every blocks entry to flag files; the PR branch is checked out. */
async function repo(onMain: (root: string) => void, onPr: (root: string) => void): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'flags-migrate-'));
  mkdirSync(path(root, 'flags'), { recursive: true });
  writeFileSync(path(root, 'flag-manifest-blocks.ts'), BLOCKS);
  writeFileSync(path(root, 'flag-manifest.ts'), MANIFEST);
  writeFlagBarrel(path(root, 'flags'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'core.hooksPath', '/dev/null');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  git(root, 'switch', '-qc', 'pr');
  onPr(root);
  git(root, 'commit', '-qam', 'pr edits');
  git(root, 'switch', '-q', 'main');
  await moveToFiles({ root, file: 'flag-manifest-blocks.ts', batch: 'blocks' });
  onMain(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'main moves the blocks');
  git(root, 'switch', '-q', 'pr');
  return root;
}

async function migrate(root: string): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await migrateBranch({ root, onto: 'main', steps: [], log: (l) => lines.push(l) });
  return { code, out: lines.join('\n') };
}

describe('flags:migrate', () => {
  it("re-applies a PR's add, default flip, comment edit and delete to main's layout", async () => {
    const root = await repo(
      () => {},
      (r) => {
        // flips a default and deletes a flag in the blocks file main has since removed
        edit(r, 'flag-manifest-blocks.ts', "AA_ONE: { default: 'off'", "AA_ONE: { default: 'on'");
        edit(r, 'flag-manifest-blocks.ts', '  AB_MODE:', '  // on: a mode comment\n  AB_MODE:');
        edit(
          r,
          'flag-manifest-blocks.ts',
          "  ZZ_KEEP: { default: 'on', owner: 'platform', kind: 'kill-switch' },\n",
          ''
        );
        // adds a flag next to an entry main still keeps in flag-manifest.ts, and edits that entry
        edit(
          r,
          'flag-manifest.ts',
          "  MID: { default: 'off'",
          "  // NEW_FLAG comment\n  NEW_FLAG: { default: 'shadow', owner: 'tools', kind: 'experiment' },\n  MID: { default: 'on'"
        );
      }
    );
    const { code, out } = await migrate(root);
    expect(out).toContain('per-name check (5 touched by this PR)');
    expect(out.match(/^ {2}OK /gm)).toHaveLength(5);
    expect(out).not.toMatch(/MISMATCH|DRIFT|CONFLICT/);
    expect(code).toBe(0);

    expect(read(root, 'flags/AA_ONE.ts')).toContain(
      "// AA_ONE comment\nexport const AA_ONE = {\n  default: 'on',"
    );
    expect(read(root, 'flags/AB_MODE.ts')).toContain(
      '// on: a mode comment\nexport const AB_MODE = {'
    );
    expect(existsSync(path(root, 'flags/ZZ_KEEP.ts'))).toBe(false);
    expect(read(root, 'flags/NEW_FLAG.ts')).toContain(
      "// NEW_FLAG comment\nexport const NEW_FLAG = {\n  default: 'shadow',"
    );
    expect(existsSync(path(root, 'flag-manifest-blocks.ts'))).toBe(false);
    const manifest = read(root, 'flag-manifest.ts');
    expect(manifest).toContain("  MID: { default: 'on', owner: 'voice', kind: 'experiment' },");
    expect(manifest).not.toMatch(/NEW_FLAG|FLAGS_A|flag-manifest-blocks/);
    expect(read(root, 'flags/index.generated.ts')).toContain(
      "export { NEW_FLAG } from './NEW_FLAG.js';"
    );
    expect(read(root, 'flags/index.generated.ts')).not.toContain('ZZ_KEEP');
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'log', '-1', '--format=%P').trim().split(' ')).toHaveLength(2);
  });

  it('stops before touching anything when main and the PR changed a flag differently', async () => {
    const root = await repo(
      (r) => edit(r, 'flags/AA_ONE.ts', "default: 'off'", "default: 'shadow'"),
      (r) =>
        edit(r, 'flag-manifest-blocks.ts', "AA_ONE: { default: 'off'", "AA_ONE: { default: 'on'")
    );
    const head = git(root, 'rev-parse', 'HEAD');
    const { code, out } = await migrate(root);
    expect(code).toBe(2);
    expect(out).toContain('CONFLICT AA_ONE');
    expect(out).toMatch(
      /PR: {3}src\/config\/flag-manifest-blocks\.ts\n.*\/\/ AA_ONE comment\n.*AA_ONE: \{ default: 'on'/
    );
    expect(out).toMatch(/main: src\/config\/flags\/AA_ONE\.ts[\s\S]*default: 'shadow'/);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(read(root, 'flag-manifest-blocks.ts')).toContain("AA_ONE: { default: 'on'");
  });

  it('does nothing to a flag main changed the same way the PR did', async () => {
    const root = await repo(
      (r) => edit(r, 'flags/ZZ_TWO.ts', "default: 'off'", "default: 'on'"),
      (r) =>
        edit(r, 'flag-manifest-blocks.ts', "ZZ_TWO: { default: 'off'", "ZZ_TWO: { default: 'on'")
    );
    const { code, out } = await migrate(root);
    expect(out).toContain('OK       change ZZ_TWO src/config/flags/ZZ_TWO.ts');
    expect(code).toBe(0);
    expect(read(root, 'flags/ZZ_TWO.ts')).toContain("default: 'on'");
  });

  it('refuses to start on a dirty tree', async () => {
    const root = await repo(
      () => {},
      (r) => edit(r, 'flag-manifest.ts', "MID: { default: 'off'", "MID: { default: 'on'")
    );
    writeFileSync(path(root, 'stray.ts'), '');
    await expect(migrate(root)).rejects.toThrow(/local changes/);
  });
});
