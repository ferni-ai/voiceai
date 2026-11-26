import { describe, expect, it } from 'vitest';
import { checkBaselines, loosened, SHRINK_ONLY_BASELINES } from '../baseline-shrink.js';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname } from 'path';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../../..');

describe('loosened: a baseline may only shrink', () => {
  it('passes a list that lost entries and fails one that gained any', () => {
    expect(loosened(['a.ts', 'b.ts'], ['a.ts'])).toEqual([]);
    expect(loosened(['a.ts'], ['a.ts', 'c.ts'])).toEqual(['$: adds "c.ts"']);
  });

  it('treats a moved file as its old path, so a move is not new debt', () => {
    const moved = new Map([['src/new/a.ts', 'src/old/a.ts']]);
    expect(loosened(['src/old/a.ts'], ['src/new/a.ts'], moved)).toEqual([]);
    expect(
      loosened({ 'src/old/a.ts': { colour: 2 } }, { 'src/new/a.ts': { colour: 2 } }, moved)
    ).toEqual([]);
  });

  it('fails a mock-paths entry that gains a path or a new file key', () => {
    const base = { 't.test.ts': ['./x.js'] };
    expect(loosened(base, { 't.test.ts': [] })).toEqual([]);
    expect(loosened(base, { 't.test.ts': ['./x.js', './y.js'] })).toEqual([
      '$["t.test.ts"]: adds "./y.js"',
    ]);
    expect(loosened(base, { ...base, 'u.test.ts': ['./z.js'] })).toEqual(['$: adds "u.test.ts"']);
  });

  it('fails a design-value count that rises, and passes one that falls', () => {
    const base = { 'a.ts': { colour: 3, fontSize: 1 } };
    expect(loosened(base, { 'a.ts': { colour: 2 } })).toEqual([]);
    expect(loosened(base, { 'a.ts': { colour: 4, fontSize: 1 } })).toEqual([
      '$["a.ts"]["colour"]: rises from 3 to 4',
    ]);
    expect(loosened(base, { 'a.ts': { colour: 3, shadow: 1 } })).toEqual([
      '$["a.ts"]: adds "shadow"',
    ]);
  });

  it('fails a change of shape', () => {
    expect(loosened(['a'], { a: 1 })).toEqual(['$: became an object']);
    expect(loosened({ a: 1 }, ['a'])).toEqual(['$: became a list']);
  });

  it('names baselines that exist in the repo', () => {
    for (const path of SHRINK_ONLY_BASELINES) expect(existsSync(join(REPO, path)), path).toBe(true);
  });

  it('names exactly the three shrink-only baselines', () => {
    expect([...SHRINK_ONLY_BASELINES]).toEqual([
      'apps/cli/src/commands/quality/format-baseline.generated.json',
      'apps/cli/src/commands/quality/mock-paths-baseline.generated.json',
      'scripts/ci/web-design-values-baseline.generated.json',
    ]);
  });
});

describe('checkBaselines: the CLI against a real merge base', () => {
  const [FORMAT, MOCKS, DESIGN] = SHRINK_ONLY_BASELINES;
  const git = (root: string, ...args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (root: string, path: string, value: unknown): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
  };
  /** A repo whose one commit holds all three baselines; returns it and that commit. */
  function repoAtBase(): { root: string; env: NodeJS.ProcessEnv } {
    const root = mkdtempSync(join(tmpdir(), 'baseline-shrink-'));
    git(root, 'init', '-q');
    write(root, FORMAT, ['src/a.ts', 'src/b.ts']);
    write(root, MOCKS, { 't.test.ts': ['./x.js'] });
    write(root, DESIGN, { 'apps/web/src/a.ts': { colour: 3 } });
    git(root, 'add', '-A');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'base');
    return { root, env: { QUALITY_BASE: git(root, 'rev-parse', 'HEAD') } };
  }
  const run = (root: string, env: NodeJS.ProcessEnv): { code: number; lines: string[] } => {
    const lines: string[] = [];
    const code = checkBaselines(root, (l) => lines.push(l), env);
    return { code, lines };
  };

  it('exits 0 when no baseline changed, and when one shrank', () => {
    const { root, env } = repoAtBase();
    expect(run(root, env).code).toBe(0);
    write(root, FORMAT, ['src/a.ts']);
    write(root, DESIGN, { 'apps/web/src/a.ts': { colour: 2 } });
    expect(run(root, env).code).toBe(0);
  });

  it('exits 1 and names the entry when a baseline grew', () => {
    const { root, env } = repoAtBase();
    write(root, MOCKS, { 't.test.ts': ['./x.js', './y.js'] });
    const { code, lines } = run(root, env);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('adds "./y.js"');
  });

  it('exits 1 for each of the three baselines, not just the first', () => {
    for (const [path, grown] of [
      [FORMAT, ['src/a.ts', 'src/b.ts', 'src/c.ts']],
      [MOCKS, { 't.test.ts': ['./x.js'], 'u.test.ts': ['./z.js'] }],
      [DESIGN, { 'apps/web/src/a.ts': { colour: 4 } }],
    ] as const) {
      const { root, env } = repoAtBase();
      write(root, path, grown);
      expect(run(root, env).code, path).toBe(1);
    }
  });

  it('fails closed when the base cannot be resolved', () => {
    const { root } = repoAtBase();
    expect(() => run(root, { QUALITY_BASE: 'f'.repeat(40) })).toThrow();
  });
});
