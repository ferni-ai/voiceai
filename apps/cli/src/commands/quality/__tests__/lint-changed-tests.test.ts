/**
 * The changed-test-files lint gate: which files it reads, what it compares, and the exit code.
 * The decision rows use a stand-in linter; the last rows ask the real ESLint config and read the
 * CI workflow, because a gate that is not run, or cannot fail its job, proves nothing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('fails a test file ESLint skipped: a skipped file reads as clean', async () => {
    const linter: Linter = {
      files: async () => [
        {
          ...result(DEEP, 0, 1),
          messages: [
            { message: 'File ignored because of a matching ignore pattern. Use "--no-ignore".' },
          ],
        },
      ],
      text: async () => [],
    };
    const lint = await lintChangedTests(
      diffOf({ changed: [DEEP], added: new Set([DEEP]) }),
      linter,
      ROOT,
      textsAt({})
    );
    expect(lint.problems).toEqual([expect.stringContaining(`${DEEP}: eslint skipped this file`)]);
  });

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
    const found = Object.entries(workflow.jobs).flatMap(([job, { steps = [] }]) =>
      steps
        .filter((step) => step.run?.includes('quality:lint-tests'))
        .map((step) => ({ job, step }))
    );
    expect(found).toHaveLength(1);
    const { job, step } = found[0]!;
    expect(step.run?.trim()).toBe('pnpm quality:lint-tests');
    expect(step.if).toBeUndefined();
    expect(step.shell).toBeUndefined();
    expect(step['continue-on-error']).toBeUndefined();
    expect(workflow.jobs[job]?.['continue-on-error']).toBeUndefined();
    expect(workflow.jobs[job]?.if).toBe(JOB_IF);
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
