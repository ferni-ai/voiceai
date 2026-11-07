/**
 * quality:comms-types lists comms type names (the glossary's allowlist) exported from more
 * than one file in src/. Fixture cases build a throwaway repo root with a src/ tree; the
 * last case runs on the real src/ and holds the glossary's "Duplicates today" table to it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMS_TYPE_NAMES,
  commsDeclarations,
  commsDuplicates,
  run,
  sourceFiles,
} from '../check-comms-types.js';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const GLOSSARY = join(REPO, 'docs/architecture/comms-glossary.md');

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

describe('quality:comms-types on the real src/', () => {
  /** Backticked type names in the first column of the glossary's "Duplicates today" table. */
  const tableNames = (): string[] => {
    const doc = readFileSync(GLOSSARY, 'utf8');
    const section = doc.split(/^## Duplicates today$/m)[1]?.split(/^## /m)[0] ?? '';
    return [...section.matchAll(/^\| `(\w+)`/gm)].map((m) => m[1]);
  };

  it('finds exactly the names the glossary lists as duplicated today', () => {
    const names = tableNames();
    expect(names.length).toBeGreaterThan(0);
    const found = dupes(REPO).map((d) => d.name);
    expect(found.length).toBe(names.length);
    expect([...found].sort()).toEqual([...names].sort());
  });
});
