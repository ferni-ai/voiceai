import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTEXTS } from '../architecture-layers.js';
import { BEGIN, END, renderTable, rowsFrom, run, splice } from '../docs-map.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs-map.ts');
const MAP: Record<string, string> = {
  'src/agent.ts': 'L5',
  'src/agents': 'L4',
  'src/memory': 'L3:memory',
  'src/memory/storage': 'L1',
  'src/speech': 'L3:expression',
  'src/types': 'L2',
  'src/services': 'unassigned',
};

let root = '';
function repo(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'docs-map-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const doc = (table: string): string =>
  `# Map\n\nhand-written\n\n${BEGIN}\n${table}\n${END}\n\nafter\n`;
/** Runs the real CLI, as CI does, and returns its exit code and stderr. */
const cli = (...args: string[]) => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--root', root, ...args], {
    encoding: 'utf8',
  });
  return { code: r.status, stderr: r.stderr };
};

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('docs:map rows', () => {
  it('has one row per layer and per context, entrypoints first, unassigned last', () => {
    const names = rowsFrom(MAP).map((r) => r.name);
    expect(names).toEqual([
      'L5',
      'L4',
      ...CONTEXTS.map((c) => `L3 ${c}`),
      'L2',
      'L1',
      'unassigned',
    ]);
  });

  it('puts each prefix under its own value only (a nested L1 dir leaves the L3 row)', () => {
    const rows = Object.fromEntries(rowsFrom(MAP).map((r) => [r.name, r.folders]));
    expect(rows['L3 memory']).toEqual(['src/memory']);
    expect(rows['L1']).toEqual(['src/memory/storage']);
    expect(rows['L3 growth']).toEqual([]);
  });

  it('sorts each row by path, whatever order the map lists them in', () => {
    const shuffled = { 'src/workers': 'L5', 'src/api': 'L5', 'src/jobs': 'L5' };
    expect(rowsFrom(shuffled)[0]!.folders).toEqual(['src/api', 'src/jobs', 'src/workers']);
  });
});

describe('docs:map table', () => {
  it('links index.ts and CLAUDE.md only where the folder has them', () => {
    repo({
      'src/memory/index.ts': '',
      'src/memory/CLAUDE.md': '',
      'src/speech/CLAUDE.md': '',
      'src/agent.ts': '',
    });
    const lines = renderTable(root, rowsFrom(MAP)).split('\n');
    const memory = lines.find((l) => l.startsWith('| L3 memory |'))!;
    expect(memory).toContain('[`memory/`](src/memory/index.ts)');
    expect(memory).toContain('[`memory/`](src/memory/CLAUDE.md)');
    const speech = lines.find((l) => l.startsWith('| L3 expression |'))!;
    expect(speech).not.toContain('src/speech/index.ts');
    expect(speech).toContain('[`speech/`](src/speech/CLAUDE.md)');
    // A mapped file is its own entry point, never linked as a folder.
    expect(lines.find((l) => l.startsWith('| L5 |'))).toContain('| `agent.ts` | none | none |');
  });

  it('replaces only the text between the markers', () => {
    expect(splice(doc('old table'), 'new table')).toBe(doc('new table'));
  });

  it('refuses a document without the markers', () => {
    expect(() => splice('# no markers\n', 'table')).toThrow(/needs the markers/);
  });
});

describe('docs:map --check (the CI gate)', () => {
  it('fails on a stale table, passes once regenerated', () => {
    repo({ 'ARCHITECTURE.md': doc('| stale |') });
    const stale = cli('--check');
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain('run `pnpm docs:map`');
    expect(readFileSync(join(root, 'ARCHITECTURE.md'), 'utf8')).toBe(doc('| stale |')); // --check never writes

    expect(cli().code).toBe(0);
    expect(cli('--check').code).toBe(0);
  });

  it('goes stale when a mapped folder gains a CLAUDE.md', () => {
    repo({ 'ARCHITECTURE.md': doc('') });
    expect(run(['--root', root])).toBe(0);
    expect(run(['--root', root, '--check'])).toBe(0);
    mkdirSync(join(root, 'src/memory'), { recursive: true });
    writeFileSync(join(root, 'src/memory/CLAUDE.md'), '# memory\n');
    expect(run(['--root', root, '--check'])).toBe(1);
  });
});
