import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { apply, plan } from '../move-module.js';
import { mapPath, rewriteText } from '../move-paths.js';

let root: string;

/** A small git repo (index only): the codemod reads `git ls-files` and moves with `git mv`. */
function repo(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'move-module-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const tracked = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n');

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const TREE: Record<string, string> = {
  'src/app/helper.ts': 'export const h = 1;\n',
  'src/old/foo.ts': "import { h } from '../app/helper.js';\nexport const foo = h;\n",
  'src/old/index.ts': "export * from './foo.js';\n",
  'src/app/use.ts': [
    "import { foo } from '../old/foo.js';",
    "import * as all from '../old/index.js';",
    "import { foo as again } from '../old';",
    "export type Foo = typeof import('../old/foo.js');",
    "export const lazy = () => import('../old/foo.js');",
    "export const CALL_PATH = ['../old/foo.js'];",
    "export const REPO = 'src/old/foo.ts';",
    'export const tmpl = (n: string) => `../old/${n}.js`;',
    'export { foo, all, again };',
    '',
  ].join('\n'),
  'src/app/__tests__/use.test.ts': "vi.mock('../../old/foo.js', () => ({ foo: 2 }));\n",
  'docs/notes.md': 'See src/old/foo.ts and [foo](../src/old/foo.ts).\n',
  'knip.json': '{ "entry": ["src/old/foo.ts"] }\n',
};

describe('move-module codemod on a fixture tree', () => {
  it('moves the folder with git mv and rewrites every path that named it', () => {
    repo(TREE);
    const result = plan(root, [{ from: 'src/old', to: 'src/core/old' }]);
    expect(result.failures).toEqual([]);
    apply(root, result);

    const files = tracked();
    expect(files).toContain('src/core/old/foo.ts');
    expect(files).toContain('src/core/old/index.ts');
    expect(files.some((f) => f.startsWith('src/old/'))).toBe(false);

    const use = read('src/app/use.ts');
    expect(use).toContain("from '../core/old/foo.js'");
    expect(use).toContain("from '../core/old/index.js'");
    expect(use).toContain("from '../core/old';"); // folder import keeps its form
    expect(use).toContain("typeof import('../core/old/foo.js')");
    expect(use).toContain("import('../core/old/foo.js')");
    expect(use).toContain("CALL_PATH = ['../core/old/foo.js']");
    expect(use).toContain("REPO = 'src/core/old/foo.ts'");
    expect(use).not.toMatch(/'\.\.\/old\//);

    // Inside the moved folder, a path out of it gets one level deeper.
    expect(read('src/core/old/foo.ts')).toContain("from '../../app/helper.js'");
    // The vi.mock string a type check never sees.
    expect(read('src/app/__tests__/use.test.ts')).toContain("vi.mock('../../core/old/foo.js'");
    // Config and docs: repo paths and relative markdown links.
    expect(read('knip.json')).toContain('"src/core/old/foo.ts"');
    expect(read('docs/notes.md')).toBe(
      'See src/core/old/foo.ts and [foo](../src/core/old/foo.ts).\n'
    );
  });

  it('leaves a template path for a person, and a second run changes nothing', () => {
    repo(TREE);
    const first = plan(root, [{ from: 'src/old', to: 'src/core/old' }]);
    expect(first.warnings.some((w) => w.startsWith('src/app/use.ts:8 template path'))).toBe(true);
    apply(root, first);
    const second = plan(root, [{ from: 'src/old', to: 'src/core/old' }]);
    expect(second.moves[0]).toMatchObject({ done: true });
    expect(second.writes.size).toBe(0);
  });

  it('a dry run (plan without apply) writes nothing', () => {
    repo(TREE);
    const result = plan(root, [{ from: 'src/old', to: 'src/core/old' }]);
    expect(result.writes.size).toBeGreaterThan(0);
    expect(existsSync(join(root, 'src/core/old'))).toBe(false);
    expect(read('src/app/use.ts')).toBe(TREE['src/app/use.ts']);
  });

  it('refuses a target inside the source, an existing target, and an untracked source', () => {
    repo({ ...TREE, 'src/core/x.ts': 'export {};\n' });
    expect(() => plan(root, [{ from: 'src/old', to: 'src/old/inner' }])).toThrow(
      /inside the source/
    );
    expect(() => plan(root, [{ from: 'src/old', to: 'src/core' }])).toThrow(/already exists/);
    expect(() => plan(root, [{ from: 'src/nope', to: 'src/elsewhere' }])).toThrow(/not tracked/);
  });
});

describe('mapPath / rewriteText', () => {
  const moves = [{ from: 'src/x', to: 'src/core/x' }];

  it('maps paths under a moved folder and leaves look-alikes alone', () => {
    expect(mapPath('src/x/a.ts', moves)).toBe('src/core/x/a.ts');
    expect(mapPath('src/xy/a.ts', moves)).toBe('src/xy/a.ts');
    expect(mapPath('apps/web/src/x/a.ts', moves)).toBe('apps/web/src/x/a.ts');
  });

  it('rewrites bounded repo paths in text, and dist/ mirrors in Dockerfiles', () => {
    expect(rewriteText('see src/x/a.ts, not src/xy or apps/web/src/x', moves)).toBe(
      'see src/core/x/a.ts, not src/xy or apps/web/src/x'
    );
    expect(rewriteText('COPY dist/x/ /app/dist/x/', moves, true)).toBe(
      'COPY dist/core/x/ /app/dist/core/x/'
    );
  });
});
