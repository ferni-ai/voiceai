/**
 * gitleaks-range.sh, run as a subprocess against a stubbed gitleaks inside a throwaway
 * git repo. The real binary isn't in the unit environment; CI runs it for real in the
 * Security Scan job. These pin the script's contract:
 *   - no scan counts unless gitleaks first reports the planted key;
 *   - a finding in the range fails;
 *   - the change can't excuse itself: rules and ignore list come from the base commit,
 *     inline allows are ignored, merge commits are scanned, and the scan reads the git
 *     dir (gitleaks would otherwise load a .gitleaksignore from the checkout).
 */
import { execFileSync, spawnSync } from 'child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../gitleaks-range.sh');

// The stub logs each call as "<kind> <args>", copies the --config and
// --gitleaks-ignore-path files it was given (and the canary's settings.ini). CANARY_RC
// and RANGE_RC say what each scan "finds": 1 = a leak, which (like real gitleaks) exits
// with the --exit-code value, default 1; anything else is returned as is.
const STUB = `#!/usr/bin/env bash
kind=canary
for a in "$@"; do case "$a" in --log-opts=*) kind=range;; esac; done
echo "$kind $*" >> "$STUB_LOG"
prev=
leak_rc=1
for a in "$@"; do
  case "$prev" in
    --config) cp "$a" "$STUB_DIR/$kind-config.toml";;
    --gitleaks-ignore-path) cp "$a" "$STUB_DIR/$kind-ignore";;
    --exit-code) leak_rc=$a;;
  esac
  prev=$a
done
target="\${!#}"
rc=$RANGE_RC
if [ "$kind" = canary ]; then
  cp "$target/settings.ini" "$STUB_DIR/canary-settings.ini"
  rc=$CANARY_RC
fi
[ "$rc" = 1 ] && rc=$leak_rc
exit "$rc"
`;

let dir: string;
let repo: string;
let base: string;
let head: string;

function git(...args: string[]) {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf8' }
  ).trim();
}

function commit(files: Record<string, string>, message: string) {
  for (const [name, content] of Object.entries(files)) writeFileSync(join(repo, name), content);
  git('add', '-A');
  git('commit', '--quiet', '--no-verify', '-m', message);
  return git('rev-parse', 'HEAD');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gitleaks-range-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'gitleaks'), STUB);
  chmodSync(join(dir, 'bin', 'gitleaks'), 0o755);
  repo = join(dir, 'repo');
  mkdirSync(repo);
  git('init', '--quiet');
  base = commit(
    { '.gitleaks.toml': '# base rules\n', '.gitleaksignore': 'base-fingerprint\n', 'a.txt': 'a\n' },
    'base'
  );
  // The change tries to excuse itself: an allow-everything config and its own ignore entry.
  head = commit(
    {
      '.gitleaks.toml': '# head rules\n[allowlist]\npaths = [".*"]\n',
      '.gitleaksignore': 'head-fingerprint\n',
      'b.txt': 'b\n',
    },
    'head'
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(canaryRc: number, rangeRc = 0, range: [string, string] = [base, head]) {
  const r = spawnSync('bash', [SCRIPT, ...range], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      STUB_LOG: join(dir, 'calls.log'),
      STUB_DIR: dir,
      CANARY_RC: String(canaryRc),
      RANGE_RC: String(rangeRc),
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

const read = (name: string) => readFileSync(join(dir, name), 'utf8');

describe('gitleaks-range.sh', () => {
  it('scans base..head as text diffs, merge commits included, after gitleaks reports the planted key', () => {
    const r = run(1, 0);
    expect(r.status).toBe(0);
    expect(r.calls.map((c) => c.split(' ')[0])).toEqual(['canary', 'range']);
    // --text: a .gitattributes `-diff`/`binary` in the change must not hide its content.
    expect(r.calls[1]).toContain(`--log-opts=--remerge-diff --text ${base}..${head}`);
    expect(r.calls[1]).toContain('--exit-code 1');
  });

  it('scans through the git dir, not the checkout', () => {
    const r = run(1, 0);
    expect(r.calls[1].split(' ').at(-1)).toBe(realpathSync(join(repo, '.git')));
  });

  it('fails when the range has a finding', () => {
    const r = run(1, 1);
    expect(r.status).toBe(1);
    expect(r.calls).toHaveLength(2);
  });

  it('fails without scanning when gitleaks misses the planted key', () => {
    const r = run(0);
    expect(r.status).toBe(1);
    expect(r.out).toContain('did not report a planted fake key (exit 0)');
    expect(r.calls).toEqual([expect.stringMatching(/^canary /)]);
  });

  it('fails without scanning when gitleaks errors on the canary', () => {
    const r = run(2);
    expect(r.status).toBe(1);
    expect(r.out).toContain('(exit 2)');
    expect(r.calls).toHaveLength(1);
  });

  it('plants a fresh, rule-shaped AWS key id each run', () => {
    run(1);
    const first = read('canary-settings.ini');
    run(1);
    const second = read('canary-settings.ini');
    expect(first).toMatch(/^aws_access_key_id = AKIA[A-Z2-7]{16}\n$/);
    expect(second).toMatch(/^aws_access_key_id = AKIA[A-Z2-7]{16}\n$/);
    expect(second).not.toBe(first);
  });

  it("uses the base commit's rules and ignore list for both scans, never the change's", () => {
    run(1, 0);
    for (const kind of ['canary', 'range']) {
      expect(read(`${kind}-config.toml`)).toBe('# base rules\n');
      expect(read(`${kind}-ignore`)).toBe('base-fingerprint\n');
    }
  });

  it("falls back to gitleaks' default rules and an empty ignore list when base has neither", () => {
    git('rm', '--quiet', '.gitleaks.toml', '.gitleaksignore');
    git('commit', '--quiet', '--no-verify', '-m', 'drop config');
    const bare = git('rev-parse', 'HEAD');
    const later = commit({ '.gitleaks.toml': '# later rules\n', 'c.txt': 'c\n' }, 'later');
    const r = run(1, 0, [bare, later]);
    expect(r.status).toBe(0);
    for (const kind of ['canary', 'range']) {
      expect(read(`${kind}-config.toml`)).toBe('[extend]\nuseDefault = true\n');
      expect(read(`${kind}-ignore`)).toBe('');
    }
  });

  it('ignores inline gitleaks:allow and redacts findings on both scans', () => {
    const r = run(1, 0);
    for (const call of r.calls) {
      expect(call).toContain('--ignore-gitleaks-allow');
      expect(call).toContain('--redact');
      expect(call).toContain('--no-banner');
    }
  });
});
