/**
 * The contract every flag-files migration step must keep (one file per flag in
 * src/config/flags/, assembled by flag-assembly.ts). Flag values are checked by
 * flag-manifest.test.ts and effective-settings.test.ts; this file checks the
 * assembly: names, order, file layout and that every loader sees the same object.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { assembleManifest } from '../flag-assembly.js';
import { FLAG_MANIFEST } from '../flag-manifest.js';

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

function fileNames(): string[] {
  return readdirSync(FLAGS_DIR)
    .map((file) => FLAG_FILE.exec(file)?.[1])
    .filter((name): name is string => name !== undefined);
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
});
