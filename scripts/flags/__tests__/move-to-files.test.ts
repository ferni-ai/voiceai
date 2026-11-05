import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLAG_MANIFEST } from '../../../src/config/flag-manifest.js';
import { commentsOf, hasInnerComment, parseCohortFlags, parseFlagFile, parseLegacy } from '../legacy-parse.js';
import { moveToFiles } from '../move-to-files.js';

const BLOCKS = `/**
 * Fixture blocks file.
 */

import type { FlagSpec } from './flag-manifest-entries.js';

/** AA_ONE .. AB_MODE */
export const FLAGS_A = {
  // a comment that runs
  // over two lines
  AA_ONE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // describes AB_MODE but sits above AB_MISPLACED
  AB_MISPLACED: { default: 'gmail', owner: 'platform', kind: 'config' },
  AB_MODE: { default: 'cartesia-cascade', owner: 'voice', kind: 'config' },
} as const satisfies Record<string, FlagSpec>;

/** ZZ_KEEP */
export const FLAGS_Z = {
  ZZ_KEEP: { default: '1800000', owner: 'platform', kind: 'config' },
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

function fakeRoot(blocks = BLOCKS): string {
  const root = mkdtempSync(join(tmpdir(), 'flags-move-'));
  const config = join(root, 'src', 'config');
  mkdirSync(join(config, 'flags'), { recursive: true });
  writeFileSync(join(config, 'flag-manifest-blocks.ts'), blocks);
  writeFileSync(join(config, 'flag-manifest.ts'), MANIFEST);
  return root;
}
const read = (root: string, path: string): string =>
  readFileSync(join(root, 'src', 'config', path), 'utf8');

describe('legacy-parse', () => {
  it('reads names, specs, comments and the same-line comment', () => {
    const blocks = parseLegacy('b', BLOCKS);
    expect(blocks.entries.map((e) => [e.name, e.block, e.spec.default])).toEqual([
      ['AA_ONE', 'FLAGS_A', 'off'],
      ['AB_MISPLACED', 'FLAGS_A', 'gmail'],
      ['AB_MODE', 'FLAGS_A', 'cartesia-cascade'],
      ['ZZ_KEEP', 'FLAGS_Z', '1800000'],
    ]);
    expect(blocks.entries[0].comments).toEqual(['// a comment that runs', '// over two lines']);
    // A comment is kept with the entry it sits above, even when it describes another.
    expect(blocks.entries[1].comments).toEqual([
      '// describes AB_MODE but sits above AB_MISPLACED',
    ]);
    expect(blocks.entries[2].comments).toEqual([]);
    expect(blocks.blocks.map((b) => [b.name, b.exported])).toEqual([
      ['FLAGS_A', true],
      ['FLAGS_Z', true],
    ]);

    const manifest = parseLegacy('m', MANIFEST);
    const rotated = manifest.entries.find((e) => e.name === 'ROTATED_SEGMENT_FIX');
    expect(rotated?.trailing).toBe('// 1.9.3 patch, #2566');
    expect(rotated?.comments).toEqual([]);
    // The same-line comment belongs to ROTATED_SEGMENT_FIX, not to the spread after it.
    expect(manifest.spreads.map((s) => [s.name, s.comments])).toEqual([
      ['FLAGS_A', []],
      ['FLAGS_Z', []],
    ]);
    expect(MANIFEST.slice(rotated?.start, rotated?.end)).toBe(
      "  ROTATED_SEGMENT_FIX: { default: 'off', owner: 'voice', kind: 'experiment' }, // 1.9.3 patch, #2566\n"
    );
  });

  it('refuses an entry that is not plain strings or shares a line', () => {
    expect(() =>
      parseLegacy('x', "const L = {\n  A: { default: off, owner: 'v', kind: 'k' },\n};\n")
    ).toThrow(/x:2: not a \{ default, owner, kind \}/);
    expect(() =>
      parseLegacy('x', "const L = { A: { default: 'off', owner: 'v', kind: 'k' },\n};\n")
    ).toThrow(/lines of its own/);
  });

  it('tells a comment from // or /* inside a string literal (hasInnerComment)', () => {
    // string text, not comments
    expect(hasInnerComment("{ issue: 'https://github.com/ferni-ai/voiceai/issues/101' }")).toBe(false);
    expect(hasInnerComment("{ context: 'a // b' }")).toBe(false);
    expect(hasInnerComment("{ context: 'it\\'s // fine' }")).toBe(false); // escaped quote, then //
    expect(hasInnerComment('{ context: "say \\" // x" }')).toBe(false);
    expect(hasInnerComment("{ context: 'a /* b */ c' }")).toBe(false);
    expect(hasInnerComment('{ context: `x // y ${1 + 2} /* z */ w` }')).toBe(false);
    // real comments, including one right after a string
    expect(hasInnerComment("{ issue: 'https://x.y/issues/1', // real\n kind: 'k' }")).toBe(true);
    expect(hasInnerComment("{ context: 'it\\'s' /* real */ }")).toBe(true);
    expect(hasInnerComment('{ a: `t ${1}` // real\n }')).toBe(true);
  });

  it('reads an issue URL back from a flag file, and still refuses a trailing comment inside it', () => {
    const file = (issue: string): string =>
      `import type { FlagSpec } from '../flag-spec.js';\n\nexport const U = {\n  default: 'off',\n  owner: 'tools',\n  kind: 'experiment',\n  expires: '2027-03-01',\n  issue: ${issue}\n} as const satisfies FlagSpec;\n`;
    expect(parseFlagFile('U.ts', file("'https://github.com/ferni-ai/voiceai/issues/101',")).spec.issue).toBe(
      'https://github.com/ferni-ai/voiceai/issues/101'
    );
    expect(() => parseFlagFile('U.ts', file("'https://github.com/ferni-ai/voiceai/issues/101', // why"))).toThrow(
      /U has a comment inside its entry/
    );
  });

  it('refuses a comment inside an entry, naming the flag', () => {
    const multi =
      "const L = {\n  A: {\n    default: 'off', // dropped today\n    owner: 'voice',\n    kind: 'experiment',\n  },\n};\n";
    expect(() => parseLegacy('x', multi)).toThrow(/x:2: A has a comment inside its entry/);
    const file =
      "import type { FlagSpec } from '../flag-spec.js';\n\nexport const B = {\n  default: 'off' /* lost */,\n  owner: 'voice',\n  kind: 'experiment',\n} as const satisfies FlagSpec;\n";
    expect(() => parseFlagFile('B.ts', file)).toThrow(/B has a comment inside its entry/);
  });

  it('reads every real legacy entry with the spec FLAG_MANIFEST holds', () => {
    const config = join(__dirname, '..', '..', '..', 'src', 'config');
    const legacy = readdirSync(config)
      .filter((f) => /^flag-manifest[\w-]*\.ts$/.test(f))
      .flatMap((f) => parseLegacy(f, readFileSync(join(config, f), 'utf8')).entries);
    const files = readdirSync(join(config, 'flags'))
      .filter((f) => /^[A-Z][A-Z0-9_]*\.ts$/.test(f))
      .map((f) => parseFlagFile(f, readFileSync(join(config, 'flags', f), 'utf8')));
    const all = [...legacy, ...files];
    expect(all.map((e) => e.name).sort()).toEqual(Object.keys(FLAG_MANIFEST));
    for (const e of all)
      expect(e.spec, e.name).toEqual(FLAG_MANIFEST[e.name as keyof typeof FLAG_MANIFEST]);
    expect(all.filter((e) => e.trailing).map((e) => e.name)).toContain('ROTATED_SEGMENT_FIX');
  });

  it('reads the cohort list with its group comments', () => {
    const text =
      "export const COHORT_FLAGS = [\n  'A',\n  // group\n  'B',\n  'C', // why C\n] as const;\n";
    expect(parseCohortFlags('c', text).map((f) => [f.name, f.comments, f.trailing])).toEqual([
      ['A', [], undefined],
      ['B', ['// group'], undefined],
      ['C', [], '// why C'],
    ]);
  });
});

describe('flags:move', () => {
  it('moves a range: flag files in the flags:new shape, emptied block, spread and import gone', async () => {
    const root = fakeRoot();
    const { moved, fixture } = await moveToFiles({
      root,
      file: 'flag-manifest-blocks.ts',
      range: ['A', 'A'],
    });
    expect(moved).toEqual(['AA_ONE', 'AB_MISPLACED', 'AB_MODE']);
    expect(read(root, 'flags/AA_ONE.ts')).toBe(
      "import type { FlagSpec } from '../flag-spec.js';\n\n" +
        '// a comment that runs\n// over two lines\n' +
        "export const AA_ONE = {\n  default: 'off',\n  owner: 'voice',\n  kind: 'experiment',\n} as const satisfies FlagSpec;\n"
    );
    expect(read(root, 'flags/AB_MISPLACED.ts')).toContain(
      "// describes AB_MODE but sits above AB_MISPLACED\nexport const AB_MISPLACED = {\n  default: 'gmail',"
    );
    expect(read(root, 'flags/AB_MODE.ts')).toContain(
      "from '../flag-spec.js';\n\nexport const AB_MODE = {\n  default: 'cartesia-cascade',"
    );
    const blocks = read(root, 'flag-manifest-blocks.ts');
    expect(blocks).not.toContain('FLAGS_A');
    expect(blocks).toContain("export const FLAGS_Z = {\n  ZZ_KEEP: { default: '1800000'");
    const manifest = read(root, 'flag-manifest.ts');
    expect(manifest).toContain("import { FLAGS_Z } from './flag-manifest-blocks.js';");
    expect(manifest).not.toContain('...FLAGS_A');
    expect(read(root, 'flags/index.generated.ts')).toContain(
      "export { AA_ONE } from './AA_ONE.js';\nexport { AB_MISPLACED } from './AB_MISPLACED.js';\nexport { AB_MODE } from './AB_MODE.js';\n"
    );
    expect(fixture).toBe(
      join(root, 'src/config/__tests__/fixtures/flag-move-flag-manifest-blocks-A-A.json')
    );
    expect(JSON.parse(readFileSync(fixture, 'utf8'))).toEqual({
      AA_ONE: { default: 'off', owner: 'voice', kind: 'experiment' },
      AB_MISPLACED: { default: 'gmail', owner: 'platform', kind: 'config' },
      AB_MODE: { default: 'cartesia-cascade', owner: 'voice', kind: 'config' },
    });
  });

  it('deletes a file once its last block moves, and its import', async () => {
    const root = fakeRoot();
    await moveToFiles({ root, file: 'flag-manifest-blocks.ts', batch: 'all' });
    expect(existsSync(join(root, 'src/config/flag-manifest-blocks.ts'))).toBe(false);
    const manifest = read(root, 'flag-manifest.ts');
    expect(manifest).not.toMatch(/flag-manifest-blocks|\.\.\.FLAGS_/);
    expect(parseLegacy('m', manifest).entries.map((e) => e.name)).toEqual([
      'MID',
      'ROTATED_SEGMENT_FIX',
    ]);
    expect(existsSync(join(root, 'src/config/__tests__/fixtures/flag-move-all.json'))).toBe(true);
  });

  it('moves a same-line comment above the export', async () => {
    const root = fakeRoot();
    await moveToFiles({ root, file: 'flag-manifest.ts', names: ['ROTATED_SEGMENT_FIX'] });
    const file = read(root, 'flags/ROTATED_SEGMENT_FIX.ts');
    expect(file).toContain('// 1.9.3 patch, #2566\nexport const ROTATED_SEGMENT_FIX = {');
    expect(commentsOf(parseFlagFile('f', file))).toEqual(['// 1.9.3 patch, #2566']);
    expect(read(root, 'flag-manifest.ts')).not.toContain('ROTATED_SEGMENT_FIX');
    expect(read(root, 'flag-manifest.ts')).toContain('  MID: {');
  });

  it('refuses unknown names, names already in flags/, and a comment it would lose', async () => {
    const root = fakeRoot();
    await expect(moveToFiles({ root, file: 'flag-manifest.ts', names: ['NOPE'] })).rejects.toThrow(
      /NOPE/
    );
    writeFileSync(join(root, 'src/config/flags/MID.ts'), '');
    await expect(moveToFiles({ root, file: 'flag-manifest.ts', names: ['MID'] })).rejects.toThrow(
      /already in flags\/: MID/
    );
    const dangling = fakeRoot(BLOCKS.replace(/(ZZ_KEEP: .*\n)/, '$1  // dangling\n'));
    const before = read(dangling, 'flag-manifest-blocks.ts');
    await expect(
      moveToFiles({ root: dangling, file: 'flag-manifest-blocks.ts', names: ['ZZ_KEEP'] })
    ).rejects.toThrow(/by hand first:[\s\S]*\/\/ dangling/);
    expect(read(dangling, 'flag-manifest-blocks.ts')).toBe(before);
    expect(existsSync(join(dangling, 'src/config/flags/ZZ_KEEP.ts'))).toBe(false);
    expect(
      readdirSync(join(dangling, 'src/config')).includes('__tests__')
        ? readdirSync(join(dangling, 'src/config/__tests__/fixtures'))
        : []
    ).toEqual([]);
  });

  it('refuses to overwrite an earlier batch fixture', async () => {
    const root = fakeRoot();
    const first = await moveToFiles({ root, file: 'flag-manifest.ts', names: ['MID'] });
    const frozen = readFileSync(first.fixture, 'utf8');
    await expect(
      moveToFiles({ root, file: 'flag-manifest.ts', names: ['ROTATED_SEGMENT_FIX'] })
    ).rejects.toThrow(/already exists: give this move its own --batch NAME/);
    expect(readFileSync(first.fixture, 'utf8')).toBe(frozen);
    expect(read(root, 'flag-manifest.ts')).toContain('ROTATED_SEGMENT_FIX');
  });

  it('leaves the batch fixture in place when a run fails after editing the legacy file', async () => {
    const root = fakeRoot();
    rmSync(join(root, 'src/config/flags'), { recursive: true }); // writing the flag file fails
    await expect(moveToFiles({ root, file: 'flag-manifest.ts', names: ['MID'] })).rejects.toThrow();
    expect(read(root, 'flag-manifest.ts')).not.toContain('  MID:');
    const fixture = 'src/config/__tests__/fixtures/flag-move-flag-manifest-names.json';
    expect(JSON.parse(readFileSync(join(root, fixture), 'utf8'))).toEqual({
      MID: { default: 'off', owner: 'voice', kind: 'experiment' },
    });
  });

  it('runs as a script through a symlinked path', () => {
    const root = fakeRoot();
    const link = join(mkdtempSync(join(tmpdir(), 'flags-link-')), 'move.ts');
    symlinkSync(join(__dirname, '..', 'move-to-files.ts'), link);
    const tsx = join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx');
    const run = spawnSync(tsx, [link, '--file', 'flag-manifest.ts', '--names', 'MID'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    expect(existsSync(join(root, 'src/config/flags/MID.ts'))).toBe(true);
  });
});
