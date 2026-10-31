/**
 * post-lead-verify.sh posts a verdict as the ferni-verifier app, then re-runs the PR's
 * Lead Verified check, which fails on a PR until a verdict passes its head (2026-10-29:
 * one sweep armed 13 unverified PRs, each bound to enter the queue, fail and eject the
 * groups behind it). Comment-triggered runs don't update the PR's check, so without the
 * re-run a passed PR would stay red. These tests run the real script with a fake `gh`.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../ci/post-lead-verify.sh');
const HEAD = 'a'.repeat(40);

// Logs "<token> <identity> <args>" per call. The runs query answers with the next line of
// runs.txt ("<id> <status> <conclusion>"), repeating the last line once they run out.
const FAKE_GH = `#!/bin/bash
echo "$GH_TOKEN \${FERNI_GH_IDENTITY:-none} $*" >> "$FAKE_DIR/calls.log"
case "$*" in
  *"/pulls/"*) echo "$FAKE_HEAD" ;;
  *"/statuses/"*) echo "ferni-verifier[bot]" ;;
  *"/runs?"*)
    n=$(cat "$FAKE_DIR/polls" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "$FAKE_DIR/polls"
    line=$(sed -n "\${n}p" "$FAKE_DIR/runs.txt"); [ -n "$line" ] || line=$(tail -1 "$FAKE_DIR/runs.txt")
    echo "$line" ;;
esac
exit 0
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'post-lead-verify-'));
  writeFileSync(join(dir, 'gh'), FAKE_GH);
  writeFileSync(join(dir, 'verifier-token'), '#!/bin/sh\necho vtok\n');
  writeFileSync(join(dir, 'agent-token'), '#!/bin/sh\necho atok\n');
  writeFileSync(join(dir, 'no-token'), '#!/bin/sh\nexit 1\n');
  for (const f of ['gh', 'verifier-token', 'agent-token', 'no-token']) chmodSync(join(dir, f), 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function post(verdict: 'pass' | 'fail', runs: string[], env: Record<string, string> = {}) {
  writeFileSync(join(dir, 'runs.txt'), `${runs.join('\n')}\n`);
  const res = spawnSync('bash', [SCRIPT, '7', HEAD, verdict, 'ran the suite'], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      HOME: dir,
      FAKE_DIR: dir,
      FAKE_HEAD: HEAD,
      GH_REPO: 'o/r',
      LEAD_VERIFY_TOKEN_CMD: join(dir, 'verifier-token'),
      LEAD_VERIFY_RERUN_TOKEN_CMD: join(dir, 'agent-token'),
      LEAD_VERIFY_RERUN_WAIT: '0',
      LEAD_VERIFY_RERUN_POLLS: '4',
      ...env,
    },
  });
  const calls = readFileSync(join(dir, 'calls.log'), 'utf8').split('\n').filter(Boolean);
  return { status: res.status, out: `${res.stdout}${res.stderr}`, calls };
}

const reruns = (calls: string[]) => calls.filter((c) => c.includes('/rerun'));

describe('post-lead-verify.sh re-runs the PR check', () => {
  it('re-runs a failed check after a PASS, as ferni-agent; the verdict goes out as the verifier', () => {
    const { status, out, calls } = post('pass', ['11 completed failure']);
    expect(status).toBe(0);
    expect(out).toContain('re-ran run 11');
    expect(reruns(calls)).toEqual(['atok agent api -X POST repos/o/r/actions/runs/11/rerun']);
    const verdict = calls.filter((c) => c.includes('/statuses/') || c.includes('pr comment'));
    expect(verdict).toHaveLength(2);
    for (const c of verdict) expect(c.startsWith('vtok ')).toBe(true);
  });

  it('waits for a run still in progress, then leaves a passing check alone', () => {
    const { status, out, calls } = post('pass', ['11 in_progress null', '11 completed success']);
    expect(status).toBe(0);
    expect(out).toContain('already passing (run 11)');
    expect(reruns(calls)).toEqual([]);
  });

  it('re-runs a passing check after a FAIL, so the check turns red', () => {
    const { calls } = post('fail', ['11 completed success']);
    expect(reruns(calls)).toHaveLength(1);
  });

  it('exits 5 with a warning when it cannot re-run; the verdict is still posted', () => {
    const { status, out, calls } = post('pass', ['11 completed failure'], {
      LEAD_VERIFY_RERUN_TOKEN_CMD: join(dir, 'no-token'),
    });
    expect(status).toBe(5);
    expect(out).toContain('did not re-run');
    expect(calls.some((c) => c.includes('pr comment'))).toBe(true);
    expect(reruns(calls)).toEqual([]);
  });

  it('exits 5 when no run finishes in time', () => {
    const { status, calls } = post('pass', ['null null null']);
    expect(status).toBe(5);
    expect(reruns(calls)).toEqual([]);
  });
});
