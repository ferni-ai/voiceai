/**
 * Prod web deploys start from CI's verdict on a push to main
 * (deploy-production.yml `on: workflow_run`), and CI's push trigger has a
 * `paths:` filter. A commit that edits only a file the deploy reads but CI's
 * filter leaves out gets no push run, so nothing deploys it and nothing fails:
 * deploy/ui-server/env.yaml was such a file until `deploy/**` was added.
 * Every repo file the deploy-ui job names must match one of CI's push globs.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENV_FILE, SECRETS_FILE } from './ui-deploy-env.js';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

/** The globs under ci.yml's `on.push.paths`. */
function ciPushPaths(): string[] {
  const lines = read('.github/workflows/ci.yml').split('\n');
  const push = lines.findIndex((l) => l === '  push:');
  const paths = lines.findIndex((l, i) => i > push && l === '    paths:');
  const end = lines.findIndex((l, i) => i > paths && /^ {0,4}\S/.test(l));
  return lines
    .slice(paths + 1, end)
    .map((l) => /^ {6}- '([^']+)'$/.exec(l)?.[1])
    .filter((g): g is string => g !== undefined);
}

/** The deploy-ui job's text, up to the next top-level job. */
function deployUiJob(): string {
  const wf = read('.github/workflows/deploy-production.yml');
  const start = wf.indexOf('\n  deploy-ui:\n');
  const next = wf.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return next < 0 ? wf.slice(start) : wf.slice(start, start + 1 + next);
}

/** Every relative path in the job's text that is a file in the repo. */
function filesTheDeployReads(): string[] {
  const candidates = deployUiJob().matchAll(/(?<![\w$/.@-])((?:\.?[\w-]+\/)+[\w.-]+)/g);
  const files = [...candidates]
    .map((m) => m[1])
    .filter((p) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile());
  return [...new Set(files)];
}

describe("CI's push trigger covers everything the web deploy reads", () => {
  it('reads the push globs and the deploy files (guards against an empty check)', () => {
    expect(ciPushPaths().length).toBeGreaterThan(10);
    expect(filesTheDeployReads()).toEqual(expect.arrayContaining([ENV_FILE, SECRETS_FILE]));
  });

  it.each(filesTheDeployReads())('a push touching only %s runs CI', (file) => {
    expect(ciPushPaths().some((g) => matchesGlob(file, g))).toBe(true);
  });
});
