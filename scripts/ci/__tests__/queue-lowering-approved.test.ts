/**
 * queue-lowering-approved.sh decides whether a merge-queue group may skip the crisis
 * sweep under crisis:lowering-approved. It must answer "true" only for a queued PR that
 * carries the exact label and is the whole group, and "false" for everything else,
 * including every lookup it couldn't make (the sweep then runs). A stand-in `gh` serves
 * the PR's labels and the group's compare, or fails either call.
 */
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../queue-lowering-approved.sh');
const LABEL = 'crisis:lowering-approved';
const SHA = 'a'.repeat(40);
const REF = `refs/heads/gh-readonly-queue/main/pr-42-${SHA}`;
const HEAD = 'b'.repeat(40);

// Logs each call's API path; LABELS / AHEAD are what --jq would have printed. A failing
// call still prints them first, so a lookup that half-worked can't pass as an answer.
const FAKE_GH = `#!/usr/bin/env bash
for a in "$@"; do case "$a" in repos/*) path=$a;; esac; done
echo "$path" >> "$GH_LOG"
case "$path" in
  */pulls/*) printf '%s' "$LABELS"; [ -z "\${LABELS_FAIL-}" ];;
  */compare/*) printf '%s\\n' "$AHEAD"; [ -z "\${COMPARE_FAIL-}" ];;
  *) exit 1;;
esac
`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'queue-label-'));
  writeFileSync(join(dir, 'gh'), FAKE_GH);
  chmodSync(join(dir, 'gh'), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(env: Record<string, string>, ref = REF) {
  const log = join(dir, 'gh.log');
  writeFileSync(log, '');
  const r = spawnSync('bash', [SCRIPT, ref, 'refs/heads/main', HEAD, 'o/r'], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      GH_LOG: log,
      LABELS: `bug\n${LABEL}\n`,
      AHEAD: '1',
      ...env,
    },
  });
  return { status: r.status, out: r.stdout, err: r.stderr, calls: readFileSync(log, 'utf8') };
}

describe('queue-lowering-approved.sh', () => {
  it('says true for the labelled PR that is the whole group', () => {
    const r = run({});
    expect(r).toMatchObject({ status: 0, out: 'true\n' });
    expect(r.calls).toBe(`repos/o/r/pulls/42\nrepos/o/r/compare/main...${HEAD}\n`);
  });

  it('says false when the PR lacks the label, or has only a longer one', () => {
    expect(run({ LABELS: 'bug\n' }).out).toBe('false\n');
    expect(run({ LABELS: `${LABEL}-later\nnot-${LABEL}\n` }).out).toBe('false\n');
    expect(run({ LABELS: '' }).out).toBe('false\n');
  });

  it('says false when other PRs are in the group ahead of it', () => {
    const r = run({ AHEAD: '3' });
    expect(r.out).toBe('false\n');
    expect(r.err).toContain('3 commits ahead of main');
  });

  it('fails closed when a lookup fails', () => {
    expect(run({ LABELS_FAIL: '1' })).toMatchObject({ status: 0, out: 'false\n' });
    expect(run({ COMPARE_FAIL: '1' })).toMatchObject({ status: 0, out: 'false\n' });
    expect(run({ AHEAD: '' }).out).toBe('false\n');
  });

  it('fails closed on a ref it cannot read, without asking the API', () => {
    for (const ref of [
      '',
      'refs/heads/main',
      `refs/heads/gh-readonly-queue/main/pr-x-${SHA}`,
      `refs/heads/feature/pr-42-${SHA}`,
      `refs/heads/gh-readonly-queue/main/pr-42-${SHA}; echo true`,
    ]) {
      const r = run({}, ref);
      expect(r.out, ref).toBe('false\n');
      expect(r.calls, ref).toBe('');
    }
  });
});
