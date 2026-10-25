import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { stagedArchitecture, stagedPaths, stagedSize } from '../staged-gates.js';

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
const lines = (n: number): string =>
  Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';
const BASELINE = 'apps/cli/src/commands/quality/architecture-baseline.generated.json';

/** A repo on real layer-map paths: src/tools is L3 agency, src/services/safety is L3 judgment. */
function repo(): string {
  root = mkdtempSync(join(tmpdir(), 'staged-gates-'));
  git('init', '-q', '-b', 'main');
  write({
    'src/tools/big.ts': lines(510),
    'src/services/safety/crisis-guard.ts': 'export const guard = 1;\n',
    [BASELINE]: '{}\n',
  });
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return git('rev-parse', 'HEAD');
}
const probe =
  "import { guard } from '../services/safety/crisis-guard.js';\nexport const p = guard;\n";

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('staged gates: size', () => {
  it('fails a staged file over 500 lines that grows', () => {
    const base = repo();
    expect(stagedSize(root, base).problems).toEqual([]);
    write({ 'src/tools/big.ts': lines(520) });
    git('add', 'src/tools/big.ts');
    expect(stagedSize(root, base).problems).toEqual([
      'src/tools/big.ts: grew 510 → 520 lines. Files over 500 lines may not grow; split or shrink it.',
    ]);
  });

  it('judges the index, not unstaged edits in the working tree', () => {
    const base = repo();
    write({ 'src/tools/big.ts': lines(520) }); // unstaged growth: not being committed
    expect(stagedSize(root, base).problems).toEqual([]);
    git('add', 'src/tools/big.ts');
    write({ 'src/tools/big.ts': lines(400) }); // staged growth, shrunk only in the working tree
    expect(stagedSize(root, base).problems).toHaveLength(1);
  });
});

describe('staged gates: architecture', () => {
  it("fails a staged import past another context's index.ts", () => {
    repo();
    write({ 'src/tools/probe.ts': probe });
    git('add', 'src/tools/probe.ts');
    expect(stagedArchitecture(root, stagedPaths(root)).problems).toEqual([
      'context-internal  src/tools/probe.ts:1 -> src/services/safety/crisis-guard.ts',
    ]);
  });

  it('ignores an untracked file and a violation only in the working tree', () => {
    repo();
    write({ 'src/tools/probe.ts': probe }); // untracked
    expect(stagedArchitecture(root, stagedPaths(root))).toEqual({ checked: 0, problems: [] });
    write({ 'src/tools/probe.ts': 'export const p = 1;\n' });
    git('add', 'src/tools/probe.ts');
    write({ 'src/tools/probe.ts': probe }); // the bad import is unstaged
    expect(stagedArchitecture(root, stagedPaths(root))).toEqual({ checked: 1, problems: [] });
  });
});

describe('husky hooks', () => {
  const top = join(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
  it('pre-commit runs the staged gates before the slow checks; pre-push keeps the full gates', () => {
    const preCommit = readFileSync(join(top, '.husky/pre-commit'), 'utf8');
    const step = preCommit.indexOf('npx tsx apps/cli/src/commands/quality/staged-gates.ts');
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(preCommit.indexOf('npx tsc --noEmit'));
    const prePush = readFileSync(join(top, '.husky/pre-push'), 'utf8');
    expect(prePush).toContain('npx tsx apps/cli/src/commands/quality/architecture-gate.ts');
    expect(prePush).toContain('npx tsx apps/cli/src/commands/quality/ratchet.ts');
  });
});
