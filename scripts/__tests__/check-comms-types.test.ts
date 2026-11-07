/**
 * quality:comms-types lists comms type names (the glossary's allowlist) exported from more
 * than one file in src/. Every case builds a throwaway repo root with a src/ tree. None reads
 * the real src/: the check is report-only, and this file runs in the required unit suite,
 * so a real-src case here would make it a blocking ratchet. The real count and the
 * glossary match are printed by `pnpm quality:comms-types`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMS_TYPE_NAMES,
  commsDeclarations,
  commsDuplicates,
  GLOSSARY,
  run,
  sourceFiles,
} from '../check-comms-types.js';

let root: string;
const repo = (files: Record<string, string>): string => {
  root = mkdtempSync(join(tmpdir(), 'comms-types-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};
const dupes = (dir: string) => commsDuplicates(commsDeclarations(dir, sourceFiles(dir)));
const quiet = (dir: string, args: string[]): { code: number; out: string[] } => {
  const out: string[] = [];
  return { code: run(dir, args, (t) => out.push(t)), out };
};

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('quality:comms-types on fixtures', () => {
  it('counts an allowlisted interface declared in two files once, with both sites', () => {
    const dir = repo({
      'src/a/commitments.ts': 'export interface Commitment {\n  id: string;\n}\n',
      'src/b/promises.ts': '// another one\nexport interface Commitment {\n  text: string;\n}\n',
    });
    expect(COMMS_TYPE_NAMES).toContain('Commitment');
    expect(dupes(dir)).toEqual([
      {
        name: 'Commitment',
        sites: [
          { name: 'Commitment', file: 'src/a/commitments.ts', line: 1 },
          { name: 'Commitment', file: 'src/b/promises.ts', line: 2 },
        ],
      },
    ]);
  });

  it('counts type aliases and enums too, each by its own name', () => {
    const dir = repo({
      'src/one.ts': "export type OutreachChannel = 'sms';\nexport enum TaskStatus { Open }\n",
      'src/two.ts': "export type OutreachChannel = 'push';\nexport enum TaskStatus { Done }\n",
    });
    expect(dupes(dir).map((d) => d.name)).toEqual(['OutreachChannel', 'TaskStatus']);
  });

  it('ignores a duplicate whose name is not on the comms list', () => {
    const dir = repo({
      'src/one.ts': 'export interface WidgetConfig {\n  a: number;\n}\n',
      'src/two.ts': 'export interface WidgetConfig {\n  b: number;\n}\n',
    });
    expect(COMMS_TYPE_NAMES).not.toContain('WidgetConfig');
    expect(dupes(dir)).toEqual([]);
  });

  it('does not count imports, re-exports, local types or nested names as declarations', () => {
    const dir = repo({
      'src/home.ts': 'export interface Commitment {\n  id: string;\n}\n',
      'src/uses.ts': "import type { Commitment } from './home';\nexport type { Commitment };\n",
      'src/reexport.ts': "export type { Commitment } from './home';\n",
      'src/local.ts': 'interface Commitment {\n  x: number;\n}\nexport const n = 1;\n',
      'src/klass.ts': 'export class Commitment {\n  z = 1;\n}\n',
      'src/nested.ts':
        'export namespace N {\n  export interface Commitment {\n    y: number;\n  }\n}\n',
    });
    expect(dupes(dir)).toEqual([]);
  });

  it('counts two declarations of one name inside a single file as no duplicate', () => {
    const dir = repo({
      'src/merge.ts':
        'export interface Person {\n  a: 1;\n}\nexport interface Person {\n  b: 2;\n}\n',
    });
    expect(dupes(dir)).toEqual([]);
  });

  it('exits 0 without --max, and with --max 0 exits 1 on a duplicate and 0 on a clean tree', () => {
    const dup = repo({
      'src/a.ts': 'export interface Commitment {\n  id: string;\n}\n',
      'src/b.ts': 'export interface Commitment {\n  id: string;\n}\n',
    });
    const plain = quiet(dup, []);
    expect(plain.code).toBe(0);
    expect(plain.out[0]).toBe('Comms type names exported from more than one file in src/: 1');
    expect(plain.out).toContain('    src/b.ts:1');
    expect(quiet(dup, ['--max', '0']).code).toBe(1);
    expect(quiet(dup, ['--max=1']).code).toBe(0);
    rmSync(dup, { recursive: true, force: true });

    const clean = repo({ 'src/a.ts': 'export interface Commitment {\n  id: string;\n}\n' });
    const ok = quiet(clean, ['--max', '0']);
    expect(ok.code).toBe(0);
    expect(ok.out[0]).toBe('Comms type names exported from more than one file in src/: 0');
  });

  it('rejects a --max that is not a whole number', () => {
    const dir = repo({ 'src/a.ts': 'export const a = 1;\n' });
    expect(() => quiet(dir, ['--max', 'abc'])).toThrow(/--max needs a whole number/);
    expect(() => quiet(dir, ['--max'])).toThrow(/--max needs a whole number/);
  });
});

describe('quality:comms-types against the glossary table (report-only)', () => {
  const table = (names: string[]): string =>
    ['# Glossary', '', '## Duplicates today', '', '| Type | Declared in |', '| --- | --- |']
      .concat(names.map((n) => `| \`${n}\` | somewhere |`))
      .concat(['', '## Checking for duplicates', '', '| `NotARow` | ignored |', ''])
      .join('\n');
  const twoCommitments = {
    'src/a.ts': 'export interface Commitment {\n  id: string;\n}\n',
    'src/b.ts': 'export interface Commitment {\n  id: string;\n}\n',
  };

  it('says the table matches when it names exactly the duplicates found', () => {
    const dir = repo({ ...twoCommitments, [GLOSSARY]: table(['Commitment']) });
    const { code, out } = quiet(dir, []);
    expect(code).toBe(0);
    expect(out).toContain('Glossary "Duplicates today" table: matches (1 names).');
  });

  it('lists names missing from the table and stale rows, and still exits 0', () => {
    const dir = repo({ ...twoCommitments, [GLOSSARY]: table(['Person']) });
    const { code, out } = quiet(dir, []);
    expect(code).toBe(0);
    expect(out).toContain('Glossary "Duplicates today" table is out of date (report-only):');
    expect(out).toContain('  not in the table: Commitment');
    expect(out).toContain('  in the table, no longer duplicated: Person');
  });
});
