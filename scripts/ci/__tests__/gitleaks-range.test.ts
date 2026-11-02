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
    expect(r.calls[1]).toContain(`--log-opts=--remerge-diff --text --no-textconv ${base}..${head}`);
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

// Built from parts so this file never holds a real pointer line, which the gate
// would (rightly) refuse when this file's own change is scanned.
const LFS_POINTER = ['version https://git-lfs', 'github.com/spec/v1'].join('.');

describe("gitleaks-range.sh refuses what the scan can't see through", () => {
  function expectRefused(r: ReturnType<typeof run>, message: string) {
    expect(r.status).toBe(1);
    expect(r.out).toContain(message);
    expect(r.calls).toEqual([]); // refused before gitleaks runs at all
  }

  function sideCommit(name: string) {
    return git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-p', base, '-m', name);
  }

  function withBaseConfig(config: string) {
    const newBase = commit({ '.gitleaks.toml': config }, 'base config');
    // Content varies with the config, so repeated calls in one test still commit.
    const later = commit({ 'c.txt': config }, 'later');
    return run(1, 0, [newBase, later]);
  }

  it('an octopus merge, which --remerge-diff does not diff', () => {
    const tree = git('rev-parse', 'HEAD^{tree}');
    const octopus = git(
      'commit-tree',
      tree,
      '-p',
      head,
      '-p',
      sideCommit('one'),
      '-p',
      sideCommit('two'),
      '-m',
      'octopus'
    );
    expectRefused(run(1, 0, [base, octopus]), 'octopus merge');
  });

  it('but scans an ordinary two-parent merge', () => {
    const tree = git('rev-parse', 'HEAD^{tree}');
    const merge = git('commit-tree', tree, '-p', head, '-p', sideCommit('one'), '-m', 'merge');
    const r = run(1, 0, [base, merge]);
    expect(r.status).toBe(0);
    expect(r.calls.map((c) => c.split(' ')[0])).toEqual(['canary', 'range']);
  });

  it('a filter=lfs attribute, at the root or in a subdirectory', () => {
    const atRoot = commit(
      { '.gitattributes': '*.bin filter=lfs diff=lfs merge=lfs -text\n' },
      'lfs'
    );
    expectRefused(run(1, 0, [head, atRoot]), 'filter=lfs attribute');

    mkdirSync(join(repo, 'assets'));
    const inSub = commit({ 'assets/.gitattributes': '*.dat filter=lfs\n' }, 'lfs sub');
    expectRefused(run(1, 0, [atRoot, inSub]), 'filter=lfs attribute');
  });

  it('a Git LFS pointer file', () => {
    const pointer = `${LFS_POINTER}\noid sha256:${'0'.repeat(64)}\nsize 42\n`;
    expectRefused(run(1, 0, [head, commit({ 'blob.bin': pointer }, 'pointer')]), 'LFS pointer');
  });

  it('but not text that merely mentions LFS', () => {
    // The second line starts like a pointer but goes on: only a whole-line match refuses.
    const notes =
      `Big files use filter=lfs; a pointer starts with "${LFS_POINTER}".\n` +
      `${LFS_POINTER} is the first line of every pointer.\n`;
    const r = run(1, 0, [head, commit({ 'notes.md': notes }, 'notes')]);
    expect(r.status).toBe(0);
  });

  it('base rules that [extend] a file, in table, dotted or inline form', () => {
    expectRefused(withBaseConfig('[extend]\npath = "extra.toml"\n'), '[extend] path');
    expectRefused(withBaseConfig('title = "x"\nextend.path = "extra.toml"\n'), '[extend] path');
    expectRefused(
      withBaseConfig('extend = { useDefault = true, path = "extra.toml" }\n'),
      '[extend] path'
    );
  });

  it('but accepts base rules whose own rules carry a path key', () => {
    const r = withBaseConfig(
      '[extend]\nuseDefault = true\n\n[[rules]]\nid = "x"\nregex = "zzz"\npath = "src/"\n'
    );
    expect(r.status).toBe(0);
  });
});
