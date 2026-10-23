/**
 * flags:migrate on a throwaway git repo: main moves the legacy blocks file to flag
 * files while a PR edits the old layout; the PR's intent must land in main's layout.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFlagBarrel } from '../../../src/config/__tests__/flag-barrel.js';
import { migrateBranch, type Step } from '../migrate-branch.js';
import { moveToFiles } from '../move-to-files.js';
import { flagFileText } from '../new-flag.js';

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

const REPO = join(__dirname, '..', '..', '..');

/** What src/config/__tests__/flag-manifest-contract.test.ts needs to run in a throwaway repo. */
function addContractSuite(root: string): void {
  for (const f of ['flag-spec.ts', 'flag-assembly.ts', '__tests__/flag-manifest-contract.test.ts'])
    cpSync(join(REPO, 'src', 'config', f), path(root, f));
  const entries = readFileSync(join(REPO, 'src', 'config', 'flag-manifest-entries.ts'), 'utf8');
  const shape = entries.indexOf('}\n', entries.indexOf('export interface FlagSpec')) + 2;
  writeFileSync(path(root, 'flag-manifest-entries.ts'), entries.slice(0, shape));
  copyFileSync(
    join(REPO, 'src/config/__tests__/flag-barrel.ts'),
    path(root, '__tests__/flag-barrel.ts')
  );
  cpSync(join(REPO, 'scripts', 'flags'), join(root, 'scripts', 'flags'), { recursive: true });
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'));
  writeFileSync(join(root, '.gitignore'), 'node_modules\n');
}
const CONTRACT: Step = {
  cmd: [
    join(REPO, 'node_modules', '.bin', 'vitest'),
    'run',
    'src/config/__tests__/flag-manifest-contract.test.ts',
  ],
};

/** A repo whose main moved every blocks entry to flag files; the PR branch is checked out. */
async function repo(
  onMain: (root: string) => void,
  onPr: (root: string) => void,
  onBase: (root: string) => void = () => {}
): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'flags-migrate-'));
  mkdirSync(path(root, '__tests__'), { recursive: true });
  mkdirSync(path(root, 'flags'), { recursive: true });
  writeFileSync(path(root, 'flag-manifest-blocks.ts'), BLOCKS);
  writeFileSync(path(root, 'flag-manifest.ts'), MANIFEST);
  writeFlagBarrel(path(root, 'flags'));
  onBase(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'core.hooksPath', '/dev/null');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  git(root, 'switch', '-qc', 'pr');
  onPr(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'pr edits');
  git(root, 'switch', '-q', 'main');
  await moveToFiles({ root, file: 'flag-manifest-blocks.ts', batch: 'blocks' });
  onMain(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'main moves the blocks');
  git(root, 'switch', '-q', 'pr');
  return root;
}

async function migrate(root: string, steps: Step[] = []): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await migrateBranch({ root, onto: 'main', steps, log: (l) => lines.push(l) });
  return { code, out: lines.join('\n') };
}
const untouched = (root: string, head: string): void => {
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect(git(root, 'status', '--porcelain')).toBe('');
  expect(existsSync(join(root, '.git', 'MERGE_HEAD'))).toBe(false);
};

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
      // the double space is main's, and prettier would drop it: a rewrite would show
      (r) => edit(r, 'flags/ZZ_TWO.ts', "default: 'off'", "default:  'on'"),
      (r) =>
        edit(r, 'flag-manifest-blocks.ts', "ZZ_TWO: { default: 'off'", "ZZ_TWO: { default: 'on'")
    );
    const { code, out } = await migrate(root);
    expect(out).toContain('OK       change ZZ_TWO src/config/flags/ZZ_TWO.ts');
    expect(code).toBe(0);
    expect(read(root, 'flags/ZZ_TWO.ts')).toBe(
      git(root, 'show', 'main:src/config/flags/ZZ_TWO.ts')
    );
  });

  it("stops before merging when the PR also edits a registry file's non-flag code", async () => {
    const root = await repo(
      () => {},
      (r) => {
        edit(r, 'flag-manifest.ts', "MID: { default: 'off'", "MID: { default: 'on'");
        edit(r, 'flag-manifest.ts', 'const LEGACY', 'export const PR_HELPER = 1;\n\nconst LEGACY');
      }
    );
    const head = git(root, 'rev-parse', 'HEAD');
    const { code, out } = await migrate(root);
    expect(code).toBe(2);
    expect(out).toContain('NON-FLAG EDIT src/config/flag-manifest.ts');
    expect(out).toContain('+ export const PR_HELPER = 1;');
    expect(out).not.toContain('flag-manifest-blocks.ts');
    untouched(root, head);
  });

  it('re-freezes flags:move fixtures so the real contract test passes', async () => {
    const root = await repo(
      () => {},
      (r) => {
        edit(r, 'flag-manifest-blocks.ts', "AA_ONE: { default: 'off'", "AA_ONE: { default: 'on'");
        edit(
          r,
          'flag-manifest-blocks.ts',
          "  ZZ_KEEP: { default: 'on', owner: 'platform', kind: 'kill-switch' },\n",
          ''
        );
      },
      addContractSuite
    );
    const { code, out } = await migrate(root, [CONTRACT]);
    expect(out).not.toContain('FAILED');
    expect(code).toBe(0);
    const frozen = JSON.parse(read(root, '__tests__/fixtures/flag-move-blocks.json')) as object;
    expect(frozen).toEqual({
      AA_ONE: { default: 'on', owner: 'voice', kind: 'experiment' },
      AB_MODE: { default: 'cartesia-cascade', owner: 'voice', kind: 'config' },
      ZZ_TWO: { default: 'off', owner: 'platform', kind: 'experiment' },
    });
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120_000);

  it('writes a flag-file edit back into a legacy entry main still has', async () => {
    const root = await repo(
      () => {},
      (r) => {
        // the PR moved MID to a flag file and flipped it; main keeps MID in flag-manifest.ts
        edit(
          r,
          'flag-manifest.ts',
          "  MID: { default: 'off', owner: 'voice', kind: 'experiment' },\n",
          ''
        );
        const spec = { default: 'on', owner: 'voice', kind: 'experiment' };
        writeFileSync(path(r, 'flags/MID.ts'), flagFileText('MID', spec, ['// MID note']));
        writeFlagBarrel(path(r, 'flags'));
      }
    );
    const { code, out } = await migrate(root);
    expect(out).toContain('OK       change MID src/config/flag-manifest.ts');
    expect(code).toBe(0);
    expect(read(root, 'flag-manifest.ts')).toContain(
      "  // MID note\n  MID: { default: 'on', owner: 'voice', kind: 'experiment' },\n"
    );
    expect(existsSync(path(root, 'flags/MID.ts'))).toBe(false);
  });

  it('says how to abort when it fails after the merge started', async () => {
    const extra =
      'export const FLAGS_X = {\n' +
      "  XX_ONE: { default: 'off', owner: 'voice', kind: 'experiment' },\n" +
      '  // a note that would go with the emptied block\n' +
      '} as const;\n';
    const root = await repo(
      () => {},
      (r) =>
        edit(
          r,
          'flag-manifest-x.ts',
          "  XX_ONE: { default: 'off', owner: 'voice', kind: 'experiment' },\n",
          ''
        ),
      (r) => {
        writeFileSync(path(r, 'flag-manifest-x.ts'), extra);
        edit(r, 'flag-manifest.ts', '  ...FLAGS_Z,\n', '  ...FLAGS_Z,\n  ...FLAGS_X,\n');
      }
    );
    await expect(migrate(root)).rejects.toThrow(
      /move these comments by hand[\s\S]*git merge --abort/
    );
    expect(existsSync(join(root, '.git', 'MERGE_HEAD'))).toBe(true);
  });

  it('skips the checks while other files still conflict', async () => {
    const root = await repo(
      (r) => writeFileSync(join(r, 'notes.txt'), 'main\n'),
      (r) => {
        writeFileSync(join(r, 'notes.txt'), 'pr\n');
        edit(r, 'flag-manifest.ts', "MID: { default: 'off'", "MID: { default: 'on'");
      }
    );
    const { code, out } = await migrate(root, [{ cmd: ['false'] }]);
    expect(code).toBe(1);
    expect(out).not.toContain('FAILED');
    expect(out).toContain('Resolve these by hand, then commit:\nnotes.txt');
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
