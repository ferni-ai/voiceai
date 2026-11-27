/**
 * The tests in src/tests/deploy and src/tests/ci read files outside src/ as text
 * (workflow YAML, composite actions, scripts/ci, the web deploy's env files, the
 * Dockerfiles, the Figma plugin's build files), so no import graph leads to them.
 * On a pull request, Integration Tests skips its steps and Related Integration Tests
 * runs only what changed src/ files import, so a PR that changed only those files ran
 * none of these: the merge queue was their first run, and a red there costs a dequeue
 * and a fresh review. These pin the PR-side job: it runs both directories when a PR
 * touches a file they read, and nothing otherwise.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { running } from './workflow-jobs.js';

const ROOT = join(__dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const CI = read('.github/workflows/ci.yml');
const JOB = 'test-deploy';
const OUTPUT = 'needs.setup.outputs.deploy-tests';

/** The include regex of setup's deploy-tests step (a pr-changes step). */
function include(): string {
  const step =
    /^ {8}id: deploy-tests\n {8}uses: \.\/\.github\/actions\/pr-changes\n {8}with:\n {10}include: '([^']+)'$/m.exec(
      CI
    );
  if (!step) throw new Error('ci.yml: setup step deploy-tests not found');
  return step[1];
}

/** The paths that `grep -E -- include` keeps: the matcher pr-changes runs. */
function selected(paths: string[]): string[] {
  try {
    return execFileSync('grep', ['-E', '--', include()], {
      input: `${paths.join('\n')}\n`,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    if ((error as { status?: number }).status === 1) return []; // no line matched
    throw error;
  }
}

/** The job's block of ci.yml, from its `  id:` line to the next job. */
function jobText(id: string): string {
  const block = new RegExp(`^ {2}${id}:\\n([\\s\\S]*?)(?=^ {2}[\\w-]+:\\n|(?![\\s\\S]))`, 'm').exec(
    CI
  );
  if (!block) throw new Error(`ci.yml: job ${id} not found`);
  return block[1];
}

describe('src/tests/deploy and src/tests/ci run on pull requests that change what they read', () => {
  it('a pull request that changes a file these tests read runs them', () => {
    const paths = [
      '.github/workflows/design-system.yml',
      '.github/actions/pr-changes/action.yml',
      '.husky/pre-push', // quality-gates-list.test.ts reads it
      'scripts/ci/deploy-freeze.sh',
      'scripts/blog/record-verdict.sh',
      'scripts/blog/exit-codes.ts',
      'deploy/ui-server/env.yaml',
      'docker/Dockerfile.ui',
      'Dockerfile.worker',
      'apps/figma-plugin/package.json',
      'apps/figma-plugin/src/ui.html',
      'vitest.config.integration.ts',
    ];
    expect(selected(paths)).toEqual(paths);
    expect(running('ci.yml', 'pull_request', { [OUTPUT]: 'true' }).has(JOB)).toBe(true);
  });

  // Each of these sits next to a file the tests read, or was once a guess at one.
  it('a pull request that changes nothing they read does nothing', () => {
    const other = [
      'src/agents/voice-agent/session.ts',
      'docs/ci/handoff.md',
      '.github/CODEOWNERS',
      'design-system/build.js',
      'apps/figma-plugin/src/code.ts',
      'docker/README.md',
      'configs/app.json',
      'scripts/blog/judge-post.ts',
      'monitoring/ops-alert-policy.json',
    ];
    expect(selected(other)).toEqual([]);
    expect(running('ci.yml', 'pull_request', { [OUTPUT]: 'false' }).has(JOB)).toBe(false);
  });

  it('only pull requests: the queue and pushes run these in Integration Tests', () => {
    for (const event of ['merge_group', 'push'] as const) {
      const ran = running('ci.yml', event);
      expect(ran.has(JOB)).toBe(false);
      expect(ran.has('test-integration')).toBe(true);
    }
  });

  it('runs every test file in both directories, and a failure fails the job', () => {
    const job = jobText(JOB);
    expect(job).toContain(
      'run: pnpm exec vitest run --config vitest.config.integration.ts src/tests/deploy/ src/tests/ci/ --reporter=verbose'
    );
    expect(job).not.toMatch(/continue-on-error|\|\|\s*true|set \+e|passWithNoTests/);
    expect(read('vitest.config.integration.ts')).toContain("'src/tests/**/*.test.ts'");
  });
});
