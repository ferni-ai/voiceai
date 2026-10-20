/**
 * deploy-production.yml checks that the commit is on main before it checks the commit out or
 * loads cloud credentials, so an unmerged commit's own scripts never run with prod credentials.
 * The step's inline script runs here against a fake `gh`.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const job = workflow.slice(workflow.indexOf('\n  deploy-ui:'), workflow.indexOf('\n  unfreeze:'));
const steps = job.split('\n      - name: ').slice(1);
const names = steps.map((s) => s.split('\n')[0]);
const gate = steps[names.indexOf('Commit is on main')] ?? '';
const script = gate
  .slice(gate.indexOf('run: |\n') + 'run: |\n'.length)
  .split('\n')
  .map((l) => l.replace(/^ {10}/, ''))
  .join('\n');

const SHA = 'a'.repeat(40);
const dir = mkdtempSync(join(tmpdir(), 'deploy-gate-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(env: Record<string, string>, status: string | null) {
  const gh = join(dir, 'gh');
  writeFileSync(
    gh,
    status === null
      ? '#!/bin/bash\nexit 1\n'
      : `#!/bin/bash\necho "$*" >> "${dir}/calls"\necho ${status}\n`
  );
  chmodSync(gh, 0o755);
  return spawnSync('bash', ['-c', script], {
    env: { PATH: `${dir}:/usr/bin:/bin`, GITHUB_REPOSITORY: 'o/r', SHA, ...env },
    encoding: 'utf8',
  });
}

describe('deploy-production.yml: commit is on main before its code runs', () => {
  it('runs before checkout and before cloud credentials, without repo scripts', () => {
    const at = (n: string) => names.indexOf(n);
    expect(at('Commit is on main')).toBeGreaterThan(-1);
    expect(at('Commit is on main')).toBeLessThan(at('Checkout'));
    expect(at('Commit is on main')).toBeLessThan(at('Authenticate to Google Cloud'));
    expect(gate).not.toMatch(/scripts\//);
  });

  it('installs and runs dependency code before any cloud credentials load', () => {
    const auth = names.indexOf('Authenticate to Google Cloud');
    for (const n of [
      'Install dependencies',
      'Deployment safety check',
      'Build design-system (required for Docker)',
    ]) {
      expect(names.indexOf(n), n).toBeGreaterThan(-1);
      expect(names.indexOf(n), n).toBeLessThan(auth);
    }
    for (const s of steps.slice(auth)) expect(s).not.toMatch(/pnpm install/);
  });

  it.each(['identical', 'behind'])('allows a commit main contains (%s)', (status) => {
    const r = run({}, status);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it.each(['ahead', 'diverged'])('refuses a commit that is not on main (%s)', (status) => {
    const r = run({ CUSTOM_SHA: SHA }, status);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/not on main/);
  });

  it('refuses skip_tests with a custom sha, before asking the API', () => {
    rmSync(join(dir, 'calls'), { force: true });
    const r = run({ SKIP_TESTS: 'true', CUSTOM_SHA: SHA }, 'behind');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/skip_tests can't be combined/);
  });

  it('fails closed when the comparison fails or the sha is not a full sha', () => {
    expect(run({}, null).status).toBe(1);
    expect(run({ SHA: 'main' }, 'identical').status).toBe(1);
  });
});
