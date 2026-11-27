/**
 * The changed-test-files lint gate: which files it reads, what it compares, and the exit code.
 * The decision rows use a stand-in linter. The later rows ask the real ESLint: the repo's config,
 * a small typed project linted as CI lints it, and the entry run in a repository of its own. The
 * last rows read the CI workflow, because a gate that is not run, or cannot fail its job, proves
 * nothing.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import type { EslintFile } from '../lint-coverage-ratchet.js';
import {
  changedTestFiles,
  eslintLinter,
  lintChangedTests,
  report,
  type Linter,
} from '../lint-changed-tests.js';
import type { BaseDiff } from '../merge-base.js';

/** The repo root: these tests run from apps/cli, the gate itself from the root. */
const ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url)).replace(/\/$/, '');
const BASE = 'b'.repeat(40);

function diffOf(part: Partial<Omit<BaseDiff, 'base'>>): BaseDiff {
  return {
    base: BASE,
    renamedFrom: new Map(),
    added: new Set(),
    changed: [],
    deleted: [],
    ...part,
  };
}

const result = (file: string, errorCount: number, warningCount = 0): EslintFile => ({
  filePath: join(ROOT, file),
  errorCount,
  warningCount,
  messages: [],
});

/** A linter that answers from two tables and records what it was asked. */
function standIn(head: Record<string, number>, base: Record<string, number> = {}) {
  const asked = { files: [] as string[][], text: [] as Array<{ text: string; path: string }> };
  const linter: Linter = {
    files: async (paths) => {
      asked.files.push(paths);
      return paths.map((path) => result(path, head[path] ?? 0));
    },
    text: async (text, path) => {
      asked.text.push({ text, path });
      return [result(path, base[text] ?? 0)];
    },
  };
  return { linter, asked };
}

/** Base texts by base path; the text doubles as the key of the stand-in's base table. */
const textsAt =
  (texts: Record<string, string>) =>
  (base: string, paths: string[]): Map<string, string> => {
    expect(base).toBe(BASE);
    return new Map(Object.entries(texts).filter(([path]) => paths.includes(path)));
  };

const DEEP = 'src/services/calendar/__tests__/guard.test.ts';

describe('which files the gate reads', () => {
  it('reads test-shaped TypeScript files the change adds, edits or moves, and nothing else', () => {
    const diff = diffOf({
      changed: [
        DEEP,
        'src/agents/__tests__/helpers/build-session.ts',
        'scripts/ci/__tests__/thing.test.ts',
        'src/tests/integration/flow.test.tsx',
        'src/services/calendar/guard.ts',
        'src/services/calendar/__tests__/types.d.ts',
        'src/services/calendar/__tests__/notes.md',
        'scripts/ci/__tests__/thing.test.mjs',
      ],
      deleted: ['src/agents/__tests__/gone.test.ts'],
    });
    expect(changedTestFiles(diff)).toEqual([
      DEEP,
      'src/agents/__tests__/helpers/build-session.ts',
      'scripts/ci/__tests__/thing.test.ts',
      'src/tests/integration/flow.test.tsx',
    ]);
  });

  it('asks the linter nothing when the change touches no test file', async () => {
    const { linter, asked } = standIn({});
    const lint = await lintChangedTests(
      diffOf({ changed: ['src/services/calendar/guard.ts'] }),
      linter,
      ROOT,
      textsAt({})
    );
    expect(lint).toEqual({ files: [], problems: [], warnings: 0 });
    expect(asked).toEqual({ files: [], text: [] });
  });
});

describe('what the gate fails on', () => {
  it('fails a new test file with any lint error', async () => {
    const { linter, asked } = standIn({ [DEEP]: 1 });
    const lint = await lintChangedTests(
      diffOf({ changed: [DEEP], added: new Set([DEEP]) }),
      linter,
      ROOT,
      textsAt({})
    );
    expect(lint.problems).toHaveLength(1);
    expect(lint.problems[0]).toContain(`${DEEP}: 1 lint errors (new file or newly failing)`);
    expect(asked.text).toEqual([]);
  });

  it('fails an edited test file whose errors grew, comparing with its text at the base', async () => {
    const { linter, asked } = standIn({ [DEEP]: 2 }, { 'old text': 1 });
    const lint = await lintChangedTests(
      diffOf({ changed: [DEEP] }),
      linter,
      ROOT,
      textsAt({ [DEEP]: 'old text' })
    );
    expect(lint.problems).toEqual([expect.stringContaining(`${DEEP}: errors grew 1 → 2`)]);
    expect(asked.text).toEqual([{ text: 'old text', path: DEEP }]);
  });

  it('passes an edited test file that keeps its old errors, and one that fixes some', async () => {
    const other = 'src/memory/__tests__/recall.test.ts';
    const { linter } = standIn({ [DEEP]: 3, [other]: 1 }, { 'three old': 3, 'two old': 2 });
    const lint = await lintChangedTests(
      diffOf({ changed: [DEEP, other] }),
      linter,
      ROOT,
      textsAt({ [DEEP]: 'three old', [other]: 'two old' })
    );
    expect(lint.problems).toEqual([]);
    expect(lint.files).toEqual([DEEP, other]);
  });

  it('measures a moved test file against its text under the old name', async () => {
    const old = 'src/services/calendar/__tests__/old-name.test.ts';
    const { linter, asked } = standIn({ [DEEP]: 2 }, { 'moved text': 2 });
    const lint = await lintChangedTests(
      diffOf({ changed: [DEEP], renamedFrom: new Map([[DEEP, old]]) }),
      linter,
      ROOT,
      textsAt({ [old]: 'moved text' })
    );
    expect(lint.problems).toEqual([]);
    // The old text is linted as the new path, so the rules of the new place apply to both sides.
    expect(asked.text).toEqual([{ text: 'moved text', path: DEEP }]);
  });

  it.each([
    ['an ignore pattern', 'File ignored because of a matching ignore pattern. Use "--no-ignore".'],
    ['no configuration', 'File ignored because no matching configuration was supplied.'],
  ])(
    'fails a test file ESLint skipped for %s: a skipped file reads as clean',
    async (_why, said) => {
      const linter: Linter = {
        files: async () => [{ ...result(DEEP, 0, 1), messages: [{ message: said }] }],
        text: async () => [],
      };
      const lint = await lintChangedTests(
        diffOf({ changed: [DEEP], added: new Set([DEEP]) }),
        linter,
        ROOT,
        textsAt({})
      );
      expect(lint.problems).toEqual([`${DEEP}: eslint skipped this file (${said}), so it is not checked.`]); // prettier-ignore
    }
  );

  it('counts warnings and does not fail on them', async () => {
    const linter: Linter = {
      files: async () => [result(DEEP, 0, 4)],
      text: async () => [result(DEEP, 0, 0)],
    };
    const lint = await lintChangedTests(
      diffOf({ changed: [DEEP] }),
      linter,
      ROOT,
      textsAt({ [DEEP]: 'old text' })
    );
    expect(lint).toEqual({ files: [DEEP], problems: [], warnings: 4 });
  });
});

describe('the exit code', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is 1 when there is a problem and 0 when there is none', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(report({ files: [DEEP], problems: [], warnings: 2 }, BASE)).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(
      report({ files: [DEEP], problems: [`${DEEP}: errors grew 0 → 1`], warnings: 0 }, BASE)
    ).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining(`${DEEP}: errors grew 0 → 1`));
  });

  it('reaches process.exit from the entry, and a crash exits non-zero', () => {
    const source = readFileSync(
      join(ROOT, 'apps/cli/src/commands/quality/lint-changed-tests.ts'),
      'utf8'
    );
    // main() hands back report()'s number as it is: nothing after the call can turn a 1 into a 0.
    expect(source).toContain(
      'return report(await lintChangedTests(diff, eslintLinter(root), root), diff.base);'
    );
    const entry = source.slice(source.lastIndexOf('if (process.argv[1]'));
    expect(entry).toContain('main().then(');
    expect(entry).toContain('(code) => process.exit(code)');
    expect(entry).toContain('process.exit(2)');
    expect(source.match(/process\.exit\(/g)).toHaveLength(2);
  });
});

describe('the real ESLint config, on a test file two folders deep', () => {
  it('reports an error for a text that does not parse and none for one that does', async () => {
    const linter = eslintLinter(ROOT);
    const [broken] = await linter.text('const = ;\n', DEEP);
    const [clean] = await linter.text('export const one = 1;\n', DEEP);
    expect(broken?.errorCount).toBeGreaterThan(0);
    expect(clean?.errorCount).toBe(0);
  });
});

/** Writes `files` under `dir`, making folders as needed. */
function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/**
 * CI lints as a "single run": the parser builds the project's program once, and the second parse
 * of a path gets a program of that one file, with no imports and no lib. The gate's base text is
 * that second parse. These rows lint a small typed project the way the real config is typed (the
 * `project` option), with CI=true, and fail when the base side loses its types. The project sits
 * inside the repo so its config can load the parser; `.cache/` is not tracked.
 */
describe('a typed test file, linted as CI lints it', () => {
  const HELPER = 'src/__tests__/helper.ts';
  const PROJECT = {
    'eslint.config.mjs': `import parser from '@typescript-eslint/parser';
import plugin from '@typescript-eslint/eslint-plugin';
export default [{
  files: ['**/*.ts'],
  languageOptions: { parser, parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
  plugins: { '@typescript-eslint': plugin },
  rules: { '@typescript-eslint/no-floating-promises': 'error', '@typescript-eslint/await-thenable': 'error' },
}];
`,
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022'], types: [], noEmit: true }, // prettier-ignore
      include: ['src'],
    }),
    'src/job.ts': 'export async function job(): Promise<number> {\n  return 1;\n}\n',
  };
  let dir = '';

  /** The gate over one edited helper, with what ESLint answered for each side. */
  async function lintHelper(baseText: string, headText: string) {
    write(dir, { ...PROJECT, [HELPER]: headText });
    const real = eslintLinter(dir);
    const counts = { head: -1, base: -1 };
    const linter: Linter = {
      files: async (paths) => {
        const results = await real.files(paths);
        counts.head = results[0]?.errorCount ?? -1;
        return results;
      },
      text: async (text, path) => {
        const results = await real.text(text, path);
        counts.base = results[0]?.errorCount ?? -1;
        return results;
      },
    };
    const lint = await lintChangedTests(
      diffOf({ changed: [HELPER] }),
      linter,
      dir,
      textsAt({ [HELPER]: baseText })
    );
    return { ...counts, problems: lint.problems };
  }

  beforeEach(() => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('TSESTREE_SINGLE_RUN', '');
    mkdirSync(join(ROOT, '.cache'), { recursive: true });
    dir = mkdtempSync(join(ROOT, '.cache', 'lint-changed-tests-'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lints on one thread: with workers, which text a thread parses first is not the gate's to say", () => {
    const source = readFileSync(
      join(ROOT, 'apps/cli/src/commands/quality/lint-changed-tests.ts'),
      'utf8'
    );
    expect(source).toContain("new ESLint({ cwd: root, concurrency: 'off' })");
    expect(source.match(/new ESLint\(/g)).toHaveLength(1);
  });

  it('counts an old floating promise on an imported function at the base too: a comment-only edit passes', async () => {
    const base = "import { job } from '../job.js';\nexport function start(): void {\n  job();\n}\n";
    const lint = await lintHelper(base, `${base}// a comment, and nothing else\n`);
    expect(lint).toEqual({ head: 1, base: 1, problems: [] });
  }, 60_000);

  it('does not count an await the base got right against it: one new error on top fails', async () => {
    // Later is thenable only through lib's PromiseLike: with no lib, the await reads as an error.
    const base =
      'interface Later extends PromiseLike<number> {}\ndeclare const later: Later;\n' +
      'export async function read(): Promise<number> {\n  return await later;\n}\n';
    const lint = await lintHelper(base, `${base}export function go(): void {\n  read();\n}\n`);
    expect(lint).toMatchObject({ head: 1, base: 0 });
    expect(lint.problems).toEqual([expect.stringContaining(`${HELPER}: 1 lint errors`)]);
  }, 60_000);
});

/**
 * The entry itself, run as the package script runs it, in a small repository of its own: the
 * rows above call the gate's parts, and none of them can see an entry that never starts, a
 * main() that returns early, other roots, or the base reader CI uses (the default one).
 */
describe('the entry, run in a repository of its own', () => {
  const ENTRY = join(ROOT, 'apps/cli/src/commands/quality/lint-changed-tests.ts');
  const OLD = 'src/__tests__/old.test.ts';
  let repo = '';
  let base = '';

  const git = (...args: string[]): string => {
    const run = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Row', '-c', 'user.email=row@example.test', ...args], { cwd: repo, encoding: 'utf8' }); // prettier-ignore
    if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
    return run.stdout.trim();
  };
  /** The entry's exit code and what it printed, measured from the commit made in beforeEach. */
  const gate = (extra: Record<string, string> = {}) => {
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', QUALITY_BASE: base, ...extra }; // prettier-ignore
    const run = spawnSync(join(ROOT, 'node_modules/.bin/tsx'), [ENTRY], { cwd: repo, env, encoding: 'utf8' }); // prettier-ignore
    return { code: run.status, said: `${run.stdout}${run.stderr}` };
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'lint-changed-tests-repo-'));
    write(repo, {
      'eslint.config.mjs':
        "export default [{ files: ['**/*.ts'], rules: { 'no-var': 'error' } }];\n",
      [OLD]: 'var kept = 1;\n',
      'elsewhere/__tests__/out.test.ts': 'let fine = 1;\n',
    });
    git('init', '--quiet');
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    base = git('rev-parse', 'HEAD');
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('exits 0 and lints nothing when no test file changed', () => {
    expect(gate()).toEqual({
      code: 0,
      said: expect.stringContaining('Changed test files: 0 linted'),
    });
  }, 60_000);

  it('exits 0 when an edit keeps the old error: the base text comes from the base commit', () => {
    write(repo, { [OLD]: 'var kept = 1;\n// a comment\n' });
    expect(gate()).toEqual({
      code: 0,
      said: expect.stringContaining('Changed test files: 1 linted'),
    });
  }, 60_000);

  it('exits 1 and names the file when a commit after the base adds an error', () => {
    // Committed, so HEAD is not the base: a reader that took the text from HEAD would see no growth.
    write(repo, { [OLD]: 'var kept = 1;\nvar more = 2;\n' });
    git('commit', '--quiet', '-am', 'head');
    expect(gate()).toEqual({ code: 1, said: expect.stringContaining(`${OLD}: errors grew 1 → 2`) });
  }, 60_000);

  it('exits 0 for an error in a test file outside the roots: it is not read', () => {
    write(repo, { 'elsewhere/__tests__/out.test.ts': 'var outside = 1;\n' });
    expect(gate()).toEqual({
      code: 0,
      said: expect.stringContaining('Changed test files: 0 linted'),
    });
  }, 60_000);

  // The rows above start the entry with no CI variable. The workflow sets one, and the typed rows
  // that set it call the gate's parts: a main() that left early only in CI would pass them all.
  it('exits 1 with CI set, as the workflow runs it, when a commit after the base adds an error', () => {
    write(repo, { [OLD]: 'var kept = 1;\nvar more = 2;\n' });
    git('commit', '--quiet', '-am', 'head');
    expect(gate({ CI: 'true' })).toEqual({
      code: 1,
      said: expect.stringContaining(`${OLD}: errors grew 1 → 2`),
    });
  }, 60_000);

  it('exits 0 with CI set when an edit keeps the old error', () => {
    write(repo, { [OLD]: 'var kept = 1;\n// a comment\n' });
    expect(gate({ CI: 'true' })).toEqual({
      code: 0,
      said: expect.stringContaining('Changed test files: 1 linted'),
    });
  }, 60_000);
});

describe('the workflow lets the gate fail its job', () => {
  interface Step {
    name?: string;
    run?: string;
    if?: string;
    'continue-on-error'?: unknown;
    shell?: string;
  }
  interface Job {
    if?: string;
    needs?: string | string[];
    steps?: Step[];
    defaults?: unknown;
    'continue-on-error'?: unknown;
  }
  const workflow = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
    on: Record<string, unknown>;
    defaults?: unknown;
    jobs: Record<string, Job>;
  };
  /**
   * The job's own condition, as read: true when the change touches code (anything but docs,
   * Markdown and scripts/voice-eval). A changed condition is red until someone reads it and
   * writes it here.
   */
  const JOB_IF = "needs.setup.outputs.code != 'false' || needs.setup.outputs.arch-map == 'true'";
  const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('runs it as a bare command in one job, with no way to pass on failure', () => {
    // The job runs it as one entry of scripts/ci/gates.json, through one `pnpm gates` step
    // (scripts/ci/gates.ts runs each entry without a shell and fails on any non-zero exit).
    const gates = JSON.parse(readFileSync(join(ROOT, 'scripts/ci/gates.json'), 'utf8')) as {
      run: string[];
    }[];
    expect(gates.filter((g) => g.run.includes('quality:lint-tests')).map((g) => g.run)).toEqual([
      ['pnpm', 'quality:lint-tests'],
    ]);
    expect(
      Object.values(workflow.jobs).flatMap(({ steps = [] }) =>
        steps.filter((step) => step.run?.includes('quality:lint-tests'))
      )
    ).toEqual([]);
    const found = Object.entries(workflow.jobs).flatMap(([job, { steps = [] }]) =>
      steps.filter((step) => step.run?.trim() === 'pnpm gates').map((step) => ({ job, step }))
    );
    expect(found).toHaveLength(1);
    const { job, step } = found[0]!;
    expect(step.if).toBeUndefined();
    expect(step.shell).toBeUndefined();
    expect(step['continue-on-error']).toBeUndefined();
    expect(workflow.jobs[job]?.['continue-on-error']).toBeUndefined();
    expect(workflow.jobs[job]?.if).toBe(JOB_IF);
    // The one job it waits for has no condition of its own: a skipped `needs` skips this job too.
    expect(workflow.jobs[job]?.needs).toBe('setup');
    expect(workflow.jobs.setup).toMatchObject({ steps: expect.any(Array) });
    expect(workflow.jobs.setup?.if).toBeUndefined();
    expect(workflow.jobs.setup?.needs).toBeUndefined();
    // A default shell without `-e` would let a failed command pass, with the step untouched.
    expect(workflow.jobs[job]?.defaults).toBeUndefined();
    expect(workflow.defaults).toBeUndefined();
  });

  it('runs on pull requests to main and in the merge queue', () => {
    expect(Object.keys(workflow.on)).toEqual(
      expect.arrayContaining(['pull_request', 'merge_group'])
    );
    // Narrowed only by target branch: no `types:` and no `paths:` that could skip a test-file change.
    expect(workflow.on.pull_request).toEqual({ branches: ['main', 'develop'] });
  });

  it('names a package script that runs this file and nothing after it', () => {
    expect(scripts['quality:lint-tests']).toMatch(
      /^NODE_OPTIONS='--max-old-space-size=\d+' npx tsx apps\/cli\/src\/commands\/quality\/lint-changed-tests\.ts$/
    );
  });
});
