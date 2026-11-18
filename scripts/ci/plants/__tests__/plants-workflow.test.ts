/**
 * The Planted Bugs workflow fails closed on a PR that changes what judges it. These rows run the
 * workflow's own "Trusted inputs" step, read out of plants.yml, against throwaway git repos of
 * invented files: an origin with a main branch, and a checkout of one PR head at depth 1, as
 * actions/checkout leaves it.
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Step = { name?: string; uses?: string; run?: string };
const WORKFLOW = resolve(__dirname, '../../../../.github/workflows/plants.yml');
const steps: Step[] = parse(readFileSync(WORKFLOW, 'utf8')).jobs.plants.steps;
const UNTRUSTED = 'not trusted: harness or dependency change, needs a human';

const root = mkdtempSync(join(tmpdir(), 'plants-workflow-'));
const origin = join(root, 'origin');
const env = {
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  HOME: root,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
const write = (rel: string, text = 'x\n') => {
  mkdirSync(dirname(join(origin, rel)), { recursive: true });
  writeFileSync(join(origin, rel), text);
};

const BASE: Record<string, string> = {
  'package.json': '{}\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'vitest.config.unit.ts': 'export default {};\n',
  'src/a.ts': 'export const a = 1;\n',
  'scripts/ci/plants/run-plants.ts': '// runner\n',
  '.github/workflows/plants.yml': 'name: x\n',
  '.plants/plants-runner-self.json': '{}\n',
  '.plants/topic-a.json': '{}\n',
};

/** A PR branch off main's first commit: `change` edits the origin tree; returns the head SHA. */
function pr(name: string, change: () => void, extraCommits = 0): string {
  git(origin, 'checkout', '-q', '-b', name, 'base');
  change();
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', name);
  for (let i = 0; i < extraCommits; i++) git(origin, 'commit', '-q', '--allow-empty', '-m', `${i}`);
  const sha = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'checkout', '-q', 'main');
  return sha;
}

/** Checks out `sha` at depth 1 in a new repo and runs the workflow's step there. */
function trustStep(sha: string): { status: number | null; out: string } {
  const work = mkdtempSync(join(root, 'work-'));
  git(work, 'init', '-q');
  git(work, 'remote', 'add', 'origin', `file://${origin}`);
  git(work, 'fetch', '-q', '--depth=1', 'origin', sha);
  git(work, 'checkout', '-q', '--detach', 'FETCH_HEAD');
  const step = steps.find((s) => s.name === 'Trusted inputs');
  const r = spawnSync('bash', ['-c', step?.run ?? 'exit 99'], {
    cwd: work,
    env: { ...env, HEAD_SHA: sha, RUNNER_TEMP: mkdtempSync(join(root, 'temp-')) },
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const heads: Record<string, string> = {};

beforeAll(() => {
  mkdirSync(origin);
  git(origin, 'init', '-q', '-b', 'main');
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  for (const [rel, text] of Object.entries(BASE)) write(rel, text);
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'base');
  git(origin, 'tag', 'base');
  const edits: Record<string, () => void> = {
    'package.json': () => write('package.json', '{"x":1}\n'),
    'apps/web/package.json': () => write('apps/web/package.json'),
    'pnpm-lock.yaml': () => write('pnpm-lock.yaml'),
    'pnpm-workspace.yaml': () => write('pnpm-workspace.yaml'),
    'patches/a.patch': () => write('patches/a.patch'),
    '.npmrc': () => write('.npmrc'),
    'apps/web/.pnpmrc': () => write('apps/web/.pnpmrc'),
    'vitest.config.unit.ts': () => write('vitest.config.unit.ts', '// changed\n'),
    'apps/web/vitest.config.mts': () => write('apps/web/vitest.config.mts'),
    'tsconfig.scripts.json': () => write('tsconfig.scripts.json', '{"compilerOptions":{}}\n'),
    'the runner': () => write('scripts/ci/plants/run-plants.ts', '// weaker\n'),
    'this workflow': () => write('.github/workflows/plants.yml', 'name: y\n'),
    "the runner's self-test spec": () => write('.plants/plants-runner-self.json', '[]\n'),
    'a deleted vitest config': () => rmSync(join(origin, 'vitest.config.unit.ts')),
    'a vitest config moved away': () => git(origin, 'mv', 'vitest.config.unit.ts', 'src/moved.ts'),
    'package.json, beside an ordinary spec': () => {
      write('package.json', '{"y":1}\n');
      write('.plants/topic-b.json', '{}\n');
    },
  };
  for (const [name, change] of Object.entries(edits))
    heads[name] = pr(`u${Object.keys(heads).length}`, change);
  heads.long = pr('long', () => write('package.json', '{"z":1}\n'), 60);
  heads.ordinary = pr('ordinary', () => {
    write('src/a.ts', 'export const a = 2;\n');
    write('.plants/topic-b.json', '{}\n');
    write('src/vitest-helpers.ts');
    write('src/patches/fix.ts');
    write('docs/package-json.md');
  });
  // main moves on after every branch point: its own changes are not the PR's
  write('package.json', '{"main":1}\n');
  write('vitest.config.unit.ts', '// main\n');
  git(origin, 'commit', '-q', '-am', 'main moves on');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('the Planted Bugs workflow fails closed on a change to what judges it', () => {
  it('runs right after the checkout, before any step that runs code', () => {
    expect(steps[0].uses).toMatch(/^actions\/checkout@/);
    expect(steps[1].name).toBe('Trusted inputs');
    // The path list names pnpm and vitest files: blank only that one quoted literal.
    const run = steps[1].run ?? '';
    expect(run.match(/trust='[^']*'/g)).toHaveLength(1);
    const commands = run.replace(/trust='[^']*'/, "trust=''");
    expect(commands).toMatch(/git diff/);
    expect(commands).not.toMatch(/\b(node|npx|pnpm|vitest)\b/);
  });

  it('a change to the runner, this workflow, its spec, a dependency file, a vitest or ts config is not trusted', () => {
    for (const [name, sha] of Object.entries(heads)) {
      if (name === 'long' || name === 'ordinary') continue;
      const { status, out } = trustStep(sha);
      expect(status, name).toBe(1);
      expect(out, name).toContain(UNTRUSTED);
      expect(out, name).not.toMatch(/package\.json|vitest\.config|tsconfig|run-plants|\.npmrc/);
    }
  }, 120_000);

  it('a PR more than 50 commits long is still compared with its merge base', () => {
    const { status, out } = trustStep(heads.long);
    expect(status).toBe(1);
    expect(out).toContain(UNTRUSTED);
  }, 60_000);

  it("ordinary code and a new spec are trusted, and main's own later changes are not the PR's", () => {
    const { status, out } = trustStep(heads.ordinary);
    expect(out).not.toContain('not trusted');
    expect(status).toBe(0);
  }, 60_000);
});
