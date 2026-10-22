/**
 * The contract every flag-files migration step must keep (one file per flag in
 * src/config/flags/, assembled by flag-assembly.ts). Flag values are checked by
 * flag-manifest.test.ts and effective-settings.test.ts; this file checks the
 * assembly: names, order, file layout and that every loader sees the same object.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { assembleManifest } from '../flag-assembly.js';
import { FLAG_MANIFEST, type FlagName } from '../flag-manifest.js';

const CONFIG = join(__dirname, '..');
const FLAGS_DIR = join(CONFIG, 'flags');
const LEGACY_FILE = /^flag-manifest[\w-]*\.ts$/;
const LEGACY_ENTRY = /^\s*([A-Z][A-Z0-9_]*): \{ default:/gm;
const FLAG_FILE = /^([A-Z][A-Z0-9_]*)\.ts$/;

/** Every entry line in the legacy flag-manifest*.ts files, duplicates kept. */
function legacyNames(): string[] {
  return readdirSync(CONFIG)
    .filter((file) => LEGACY_FILE.test(file))
    .flatMap((file) =>
      [...readFileSync(join(CONFIG, file), 'utf8').matchAll(LEGACY_ENTRY)].map((m) => m[1])
    );
}

const fileNames = (): string[] => fileNamesIn(FLAGS_DIR);
function fileNamesIn(dir: string): string[] {
  return readdirSync(dir)
    .map((file) => FLAG_FILE.exec(file)?.[1])
    .filter((name): name is string => name !== undefined);
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const REPO = join(CONFIG, '..', '..');
const ESM = {
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  keepNames: true,
  logLevel: 'silent',
} as const;
const runModule = (code: string): unknown =>
  JSON.parse(
    execFileSync(process.execPath, ['--input-type=module'], { input: code, encoding: 'utf8' })
  );
const PRINT =
  'console.log(JSON.stringify({ keys: Object.keys(FLAG_MANIFEST), manifest: FLAG_MANIFEST }));';

/** The `{ [name]: spec }` fixtures flags:move froze, by file name. */
function frozenMoves(dir: string): Array<[string, Record<string, unknown>]> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^flag-move-.+\.json$/.test(f))
    .map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>]);
}

describe('flag manifest contract', () => {
  it('has its keys sorted by code unit', () => {
    const keys = Object.keys(FLAG_MANIFEST);
    expect(keys).toEqual([...keys].sort(byCodeUnit));
  });

  it('is exactly the legacy entries plus the flag files, none defined twice', () => {
    const legacy = legacyNames();
    const files = fileNames();
    expect(legacy.length).toBeGreaterThan(0);
    // A duplicate across spreads silently wins at runtime and tsc misses it after a spread.
    expect(
      legacy.filter((n, i) => legacy.indexOf(n) !== i),
      'defined twice in legacy'
    ).toEqual([]);
    expect(
      files.filter((n) => legacy.includes(n)),
      'in legacy and in flags/'
    ).toEqual([]);
    expect(
      Object.keys(FLAG_MANIFEST),
      'every legacy entry must be one `NAME: { default: ... }` line'
    ).toEqual([...legacy, ...files].sort(byCodeUnit));
  });

  it('holds only flag files and the barrel in src/config/flags/', () => {
    const stray = readdirSync(FLAGS_DIR).filter(
      (file) => file !== 'index.generated.ts' && !FLAG_FILE.test(file)
    );
    expect(stray, 'flags/ holds only <NAME>.ts files and index.generated.ts').toEqual([]);
  });

  it('has each flags/<NAME>.ts export exactly NAME', async () => {
    const names = fileNames();
    const modules = await Promise.all(
      names.map((name) => import(join(FLAGS_DIR, `${name}.ts`)) as Promise<Record<string, unknown>>)
    );
    names.forEach((name, i) => expect(Object.keys(modules[i]), `${name}.ts`).toEqual([name]));
  });

  it('throws when a flag is defined in both places', () => {
    const spec = { default: 'off', owner: 'voice', kind: 'experiment' } as const;
    // @ts-expect-error the type guard rejects the overlap too
    expect(() => assembleManifest({ A: spec }, { A: spec })).toThrow(/A is defined both/);
    expect(Object.keys(assembleManifest({ B: spec, A: spec }, { C: spec }))).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  // The voice agent also runs as one esbuild bundle (apps/cli bundle-agent.ts:
  // esm, node, es2022); namespace objects there are getter-based. Run that shape
  // under plain node and require the same object.
  it('is the same object in an esbuild bundle run by node', async () => {
    const result = await build({
      stdin: {
        contents:
          "import { FLAG_MANIFEST } from './flag-manifest.js';\n" +
          'console.log(JSON.stringify({ keys: Object.keys(FLAG_MANIFEST), manifest: FLAG_MANIFEST }));',
        resolveDir: CONFIG,
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      keepNames: true,
      logLevel: 'silent',
    });
    const out = execFileSync(process.execPath, ['--input-type=module'], {
      input: result.outputFiles[0].text,
      encoding: 'utf8',
    });
    const bundled = JSON.parse(out) as { keys: string[]; manifest: unknown };
    expect(bundled.keys).toEqual(Object.keys(FLAG_MANIFEST));
    expect(JSON.stringify(bundled.manifest)).toBe(JSON.stringify(FLAG_MANIFEST));
  });

  // flags:move freezes each batch's specs from the legacy source before moving them.
  it('holds every moved flag to the spec frozen when it moved', () => {
    for (const [fixture, frozen] of frozenMoves(join(__dirname, 'fixtures'))) {
      for (const [name, spec] of Object.entries(frozen)) {
        expect(existsSync(join(FLAGS_DIR, `${name}.ts`)), `${fixture}: ${name} moved`).toBe(true);
        expect(FLAG_MANIFEST[name as FlagName], `${fixture}: ${name}`).toEqual(spec);
      }
    }
  });

  // The image runs build:fast (esbuild per file, src -> dist), then bundles the compiled
  // dist (bundle-agent.ts; docker/Dockerfile.agent). Copy the manifest's modules, move
  // real flags into flag files with flags:move (one with a same-line comment), compile
  // and bundle that way, and require both node runs to see the same object as vitest.
  it('is the same object from compiled dist, per file and bundled, with real flag files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'flag-parity-'));
    const src = join(root, 'src', 'config');
    mkdirSync(src, { recursive: true });
    for (const f of readdirSync(CONFIG).filter((f) =>
      /^flag-(manifest[\w-]*|spec|assembly)\.ts$/.test(f)
    )) {
      copyFileSync(join(CONFIG, f), join(src, f));
    }
    cpSync(FLAGS_DIR, join(src, 'flags'), { recursive: true });
    const inline = [
      ...readFileSync(join(CONFIG, 'flag-manifest.ts'), 'utf8').matchAll(LEGACY_ENTRY),
    ].map((m) => m[1]);
    const names = [...inline.slice(0, 2), ...inline.filter((n) => n === 'ROTATED_SEGMENT_FIX')];
    if (names.length > 0) {
      execFileSync(
        join(REPO, 'node_modules', '.bin', 'tsx'),
        [
          join(REPO, 'scripts', 'flags', 'move-to-files.ts'),
          '--file',
          'flag-manifest.ts',
          '--names',
          names.join(','),
          '--batch',
          'parity',
        ],
        { cwd: root, encoding: 'utf8' }
      );
    }
    expect(fileNamesIn(join(src, 'flags')).length).toBeGreaterThanOrEqual(2);

    const entryPoints = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.includes('__tests__'))
      .map((f) => join(src, f));
    const dist = join(root, 'dist', 'config');
    await build({
      ...ESM,
      entryPoints,
      outdir: dist,
      outbase: src,
      bundle: false,
      supported: { 'import-attributes': true },
    });
    const perFile = runModule(
      `import { FLAG_MANIFEST } from ${JSON.stringify(join(dist, 'flag-manifest.js'))};\n${PRINT}`
    );
    const bundle = await build({
      ...ESM,
      stdin: {
        contents: `import { FLAG_MANIFEST } from './flag-manifest.js';\n${PRINT}`,
        resolveDir: dist,
        loader: 'js',
      },
      bundle: true,
      treeShaking: true,
      write: false,
    });
    const bundled = runModule(bundle.outputFiles[0].text);
    const expected = JSON.parse(
      JSON.stringify({ keys: Object.keys(FLAG_MANIFEST), manifest: FLAG_MANIFEST })
    );
    expect(perFile).toEqual(expected);
    expect(bundled).toEqual(expected);
    for (const [, frozen] of frozenMoves(join(src, '__tests__', 'fixtures'))) {
      expect(Object.keys(frozen)).toEqual([...names].sort(byCodeUnit));
      for (const [name, spec] of Object.entries(frozen))
        expect(FLAG_MANIFEST[name as FlagName]).toEqual(spec);
    }
  }, 60_000);
});
