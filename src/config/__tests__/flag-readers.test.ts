/**
 * Every manifest flag must have a production reader (code-health 2026-10-23, G8). A flag that
 * is configured but read by nothing looks like a switch and does nothing: the h-uman
 * `follow_up_watcher` class. A reader is the flag's name in code (comments stripped) in a src/
 * file that is not a test, a generated file, or the manifest's own definition files, or in one
 * of our SDK patches (patches/*.patch, applied to node_modules at install). A flag read only by
 * a dependency or through a built name goes in OUTSIDE_READERS with where it is read.
 *
 * Ratchet: flag-readers.baseline.json lists today's flags with no reader. A new one fails; a
 * listed flag that gains a reader or leaves the manifest must come off the list.
 * After fixing: UPDATE_FLAG_READER_BASELINE=1 pnpm vitest run --config vitest.config.unit.ts src/config/__tests__/flag-readers.test.ts
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLAG_MANIFEST } from '../flag-manifest.js';

const SRC = join(__dirname, '..', '..');
const PATCHES = join(SRC, '..', 'patches');

/** Flags read where the scan can't see: the file (from the repo root) and the text that reads it. */
const OUTSIDE_READERS: Readonly<Record<string, { file: string; needle: string }>> = {
  // @google/genai reads it from the environment.
  GOOGLE_GENAI_USE_VERTEXAI: {
    file: 'node_modules/@google/genai/dist/index.mjs',
    needle: 'GOOGLE_GENAI_USE_VERTEXAI',
  },
};
const BASELINE = join(__dirname, 'flag-readers.baseline.json');

/** Files whose mention of a flag is not a read: tests, generated files, the manifest itself. */
const NOT_A_READER = [
  /(^|\/)(__tests__|__mocks__|tests)\//,
  /\.(test|spec|d)\.ts$/,
  /\.generated\.ts$/,
  /^config\/flags\//,
  /^config\/(flag-manifest|flag-manifest-entries|flag-manifest-blocks|flag-lifecycle-backfill|env-classification)\.ts$/,
];

interface SourceFile {
  readonly path: string; // relative to src/
  readonly text: string;
}

function walk(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules') walk(path, out);
    } else if (entry.endsWith('.ts')) {
      out.push({ path: relative(SRC, path), text: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** Manifest names with no reader in `files`, sorted. */
function flagsWithoutReader(names: readonly string[], files: readonly SourceFile[]): string[] {
  const tokens = new Set<string>();
  for (const file of files) {
    if (NOT_A_READER.some((re) => re.test(file.path))) continue;
    // In a patch only the lines we add are ours; context lines are the SDK's own code.
    const text = file.path.startsWith('patches/')
      ? file.text
          .split('\n')
          .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
          .join('\n')
      : file.text;
    for (const m of stripComments(text).matchAll(/\b[A-Z][A-Z0-9_]+\b/g)) tokens.add(m[0]);
  }
  return names.filter((name) => !tokens.has(name) && !(name in OUTSIDE_READERS)).sort();
}

/** src/ files plus the SDK patches, which carry flag reads into node_modules. */
function readerSources(): SourceFile[] {
  const patches = readdirSync(PATCHES).filter((f) => f.endsWith('.patch'));
  const patchFiles = patches.map((f) => ({
    path: `patches/${f}`,
    text: readFileSync(join(PATCHES, f), 'utf8'),
  }));
  return [...walk(SRC), ...patchFiles];
}

describe('flagsWithoutReader', () => {
  const NAME = 'SEEDED_FLAG';
  it.each([
    ['a test', 'agents/__tests__/x.test.ts', `flagOn('${NAME}')`],
    ['a comment', 'agents/x.ts', `// flagOn('${NAME}')\n/* ${NAME} */`],
    ['a generated file', 'config/env-read-names.generated.ts', NAME],
    ['its flag file', `config/flags/${NAME}.ts`, `export const ${NAME} = {}`],
    ['the manifest', 'config/flag-manifest.ts', `${NAME}: { default: 'off' }`],
    [
      'an SDK patch context line (SDK code we did not add)',
      'patches/sdk.patch',
      `   if (process.env.${NAME}) {`,
    ],
  ])('finds no reader when the flag is named only in %s', (_, path, text) => {
    expect(flagsWithoutReader([NAME], [{ path, text }])).toEqual([NAME]);
  });

  it('finds a reader in an SDK patch', () => {
    const files = [{ path: 'patches/sdk.patch', text: `+  if (process.env.${NAME} === 'on') {` }];
    expect(flagsWithoutReader([NAME], files)).toEqual([]);
  });

  it('finds a reader in production code', () => {
    const files = [
      { path: 'agents/x.ts', text: `const url = 'https://x'; if (flagOn('${NAME}')) {}` },
    ];
    expect(flagsWithoutReader([NAME], files)).toEqual([]);
  });
});

describe('OUTSIDE_READERS', () => {
  it.each(Object.entries(OUTSIDE_READERS))('%s is still read where it says', (_, where) => {
    expect(readFileSync(join(SRC, '..', where.file), 'utf8')).toContain(where.needle);
  });
});

describe('every manifest flag has a production reader (ratchet)', () => {
  const now = flagsWithoutReader(Object.keys(FLAG_MANIFEST), readerSources());

  if (process.env.UPDATE_FLAG_READER_BASELINE === '1') {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as string[];

  it('has no new flag without a reader', () => {
    expect(
      now.filter((name) => !baseline.includes(name)),
      'Read the flag in src/ (flagOn/flagModeOf), or delete it from the manifest'
    ).toEqual([]);
  });

  it('lists only flags that still have no reader', () => {
    expect(
      baseline.filter((name) => !now.includes(name)),
      'These have a reader now or left the manifest: take them off flag-readers.baseline.json'
    ).toEqual([]);
  });
});
