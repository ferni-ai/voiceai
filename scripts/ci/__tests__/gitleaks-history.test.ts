/**
 * gitleaks-history.sh, run as a subprocess against a stubbed gitleaks inside a throwaway
 * git repo (the real binary runs in the nightly Secret Scan (main) job). These pin that
 * the nightly scan can go red:
 *   - no count is believed unless gitleaks first reports the planted key;
 *   - more findings than the baseline fail, and so do fewer (the scan read less);
 *   - gitleaks failing outright, a report that disagrees with the exit code, a shallow
 *     checkout or a missing baseline all fail rather than pass as "no leaks";
 *   - only <rev>'s history is read, never --all.
 */
import { execFileSync, spawnSync } from 'child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CI = resolve(__dirname, '..');

// Logs each call as "<kind> <args>". The canary call (no --log-opts) "finds" the key when
// CANARY_RC=1, exiting with the --exit-code value like real gitleaks. The history call
// writes HIST_COUNT findings to --report-path and exits HIST_RC (default: 9 when it found
// something, else 0).
const STUB = `#!/usr/bin/env bash
kind=canary
for a in "$@"; do case "$a" in --log-opts=*) kind=history;; esac; done
echo "$kind $*" >> "$STUB_LOG"
prev=
leak_rc=1
report=
for a in "$@"; do
  case "$prev" in
    --exit-code) leak_rc=$a;;
    --report-path) report=$a;;
  esac
  prev=$a
done
if [ "$kind" = canary ]; then
  [ "$CANARY_RC" = 1 ] && exit "$leak_rc"
  exit "$CANARY_RC"
fi
{
  printf '['
  for ((i = 0; i < HIST_COUNT; i++)); do
    [ "$i" -gt 0 ] && printf ','
    printf '{"RuleID":"generic-api-key","Secret":"REDACTED"}'
  done
  printf ']'
} > "$report"
[ -n "\${HIST_STDERR:-}" ] && echo "$HIST_STDERR" >&2
if [ -n "\${HIST_RC:-}" ]; then exit "$HIST_RC"; fi
[ "$HIST_COUNT" -gt 0 ] && exit "$leak_rc"
exit 0
`;

let dir: string;
let repo: string;

function git(...args: string[]) {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf8' }
  ).trim();
}

function setBaseline(text: string) {
  writeFileSync(join(repo, 'ci', 'gitleaks-history-baseline.txt'), text);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gitleaks-history-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'gitleaks'), STUB);
  chmodSync(join(dir, 'bin', 'gitleaks'), 0o755);
  repo = join(dir, 'repo');
  mkdirSync(join(repo, 'ci'), { recursive: true });
  // The scripts run from a copy, so the baseline they read is this test's.
  for (const f of ['gitleaks-history.sh', 'gitleaks-canary.sh']) {
    copyFileSync(join(CI, f), join(repo, 'ci', f));
  }
  setBaseline('# comment lines are skipped\n3\n');
  git('init', '--quiet');
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  git('add', '-A');
  git('commit', '--quiet', '--no-verify', '-m', 'one');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(
  opts: { canaryRc?: number; count?: number; histRc?: number; rev?: string; stderr?: string } = {}
) {
  const { canaryRc = 1, count = 3, histRc, rev, stderr = '' } = opts;
  const r = spawnSync('bash', [join(repo, 'ci', 'gitleaks-history.sh'), ...(rev ? [rev] : [])], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      STUB_LOG: join(dir, 'calls.log'),
      CANARY_RC: String(canaryRc),
      HIST_COUNT: String(count),
      HIST_STDERR: stderr,
      ...(histRc === undefined ? {} : { HIST_RC: String(histRc) }),
    },
  });
  let calls: string[] = [];
  try {
    calls = readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');
  } catch {
    // no calls logged
  }
  return { status: r.status, out: r.stdout + r.stderr, calls };
}

describe('gitleaks-history.sh', () => {
  it('passes when the count matches the baseline, after the canary', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.out).toContain('3 findings (baseline 3)');
    expect(r.calls.map((c) => c.split(' ')[0])).toEqual(['canary', 'history']);
  });

  it("reads only the rev's history, merges included, through the git dir", () => {
    const r = run();
    expect(r.calls[1]).toContain('--log-opts=--remerge-diff --no-textconv HEAD');
    expect(r.calls[1]).not.toContain('--all');
    expect(r.calls[1].split(' ').at(-1)).toMatch(/\/\.git$/);
    for (const call of r.calls) {
      expect(call).toContain('--ignore-gitleaks-allow');
      expect(call).toContain('--redact');
    }
  });

  it('fails on a finding the baseline does not hold', () => {
    const r = run({ count: 4 });
    expect(r.status).toBe(1);
    expect(r.out).toContain('1 new secret finding(s) in history');
  });

  it('fails on fewer findings than the baseline, because the scan read less', () => {
    const r = run({ count: 2 });
    expect(r.status).toBe(1);
    expect(r.out).toContain('1 fewer findings than the baseline');
  });

  it('fails without scanning when gitleaks misses the planted key', () => {
    const r = run({ canaryRc: 0 });
    expect(r.status).toBe(1);
    expect(r.out).toContain('did not report a planted fake key (exit 0)');
    expect(r.calls).toHaveLength(1);
  });

  it('fails when gitleaks fails outright on the history scan', () => {
    const r = run({ histRc: 1 });
    expect(r.status).toBe(1);
    expect(r.out).toContain('gitleaks failed (exit 1)');
  });

  it('fails when gitleaks logs a git error and carries on, but not on a warning', () => {
    const r = run({ stderr: '8:16PM ERR [git] fatal: remote error: upload-pack: not our ref' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('gitleaks logged an error while reading history');
    expect(run({ stderr: '8:16PM WRN exhaustive rename detection was skipped' }).status).toBe(0);
  });

  it('fails when the exit code and the report disagree', () => {
    setBaseline('0\n');
    expect(run({ count: 0, histRc: 9 }).out).toContain('report is empty');
    setBaseline('3\n');
    const r = run({ count: 3, histRc: 0 });
    expect(r.status).toBe(1);
    expect(r.out).toContain('exited 0 but reported 3 findings');
  });

  it('refuses a shallow checkout, a rev that does not resolve, and a missing baseline', () => {
    const shallow = join(dir, 'shallow');
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${repo}`, shallow]);
    const r1 = spawnSync('bash', [join(repo, 'ci', 'gitleaks-history.sh')], {
      cwd: shallow,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
    });
    expect(r1.status).toBe(1);
    expect(r1.stdout).toContain('the checkout is shallow');

    const r2 = run({ rev: 'no-such-ref' });
    expect(r2.status).toBe(1);
    expect(r2.out).toContain("can't resolve 'no-such-ref'");

    setBaseline('# no number here\n');
    const r3 = run();
    expect(r3.status).toBe(1);
    expect(r3.out).toContain('no baseline count');
    expect(r3.calls).toEqual([]);
  });
});
