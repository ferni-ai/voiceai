/**
 * Refreshing the overlay gallery's Linux baselines from a CI run
 * (scripts/ci/refresh-overlay-baselines.sh). Overlay Gallery is a required
 * check, so a copy change blocks its PR until the baselines are refreshed:
 * this must copy exactly the shots that failed comparison over their
 * baselines, add the ones CI wrote because none was committed, and never touch
 * anything else.
 *
 * Runs the real script in a throwaway git repo. A stand-in `gh` answers
 * `run download` from a fake artifact laid out the way the overlay-gallery job
 * uploads it (paths relative to apps/web).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts/ci/refresh-overlay-baselines.sh');
const BASE = 'apps/web/tests/overlays/__screenshots__/linux';

const FAKE_GH = `#!/usr/bin/env bash
# gh run download <run> -R <repo> -n overlay-gallery -D <dir>: copy the fake artifact.
[ "$1 $2" = "run download" ] || { echo "unexpected gh $*" >&2; exit 2; }
[ "$3" = "$FAKE_RUN" ] || { echo "no artifact on run $3" >&2; exit 1; }
while [ $# -gt 0 ]; do [ "$1" = -D ] && { cp -R "$FAKE_ARTIFACT/." "$2/"; exit 0; }; shift; done
exit 2
`;

let dir: string;
let repo: string;
let artifact: string;
let bin: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

/** A file under `root`, creating its directories. */
function put(root: string, path: string, body: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

function run(...args: string[]): { status: number | null; out: string } {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_RUN: '42', FAKE_ARTIFACT: artifact },
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'refresh-baselines-'));
  repo = join(dir, 'repo');
  artifact = join(dir, 'artifact');
  bin = join(dir, 'bin');
  mkdirSync(repo);
  mkdirSync(artifact);
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  put(repo, `${BASE}/phone/modal-zen.png`, 'old modal');
  put(repo, `${BASE}/phone/sheet-zen.png`, 'old sheet');
  put(repo, `${BASE}/desktop/modal-zen.png`, 'old desktop modal');
  git('add', '.');
  git('commit', '-q', '-m', 'baselines');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const tr = (scene: string, project: string): string =>
  `test-results/overlay-gallery-${scene}-contrast-and-snapshot-${project}`;
const read = (path: string): string => readFileSync(join(repo, path), 'utf8');

describe('refresh-overlay-baselines.sh', () => {
  it('copies only the shots that failed comparison over their baselines', () => {
    put(artifact, `${tr('modal', 'phone')}/modal-zen-actual.png`, 'new modal');
    put(artifact, `${tr('modal', 'phone')}/modal-zen-expected.png`, 'old modal');
    put(artifact, `${tr('modal', 'phone')}/modal-zen-diff.png`, 'diff');
    // an actual with no diff (e.g. a contrast failure) is not a snapshot mismatch
    put(artifact, `${tr('sheet', 'phone')}/sheet-zen-actual.png`, 'sheet that matched');

    const r = run('--run', '42');
    expect(r.status, r.out).toBe(0);
    expect(read(`${BASE}/phone/modal-zen.png`)).toBe('new modal');
    expect(read(`${BASE}/phone/sheet-zen.png`)).toBe('old sheet');
    expect(read(`${BASE}/desktop/modal-zen.png`)).toBe('old desktop modal');
    expect(r.out).toContain(`Changed baselines`);
    expect(r.out).toContain(`${BASE}/phone/modal-zen.png`);
    expect(git('log', '--oneline').split('\n')).toHaveLength(1); // never commits
  });

  it('maps the project from the results folder, and the retry decides', () => {
    put(artifact, `${tr('modal', 'desktop')}/modal-zen-actual.png`, 'first attempt');
    put(artifact, `${tr('modal', 'desktop')}/modal-zen-diff.png`, 'diff');
    put(artifact, `${tr('modal', 'desktop')}-retry1/modal-zen-actual.png`, 'retry');
    put(artifact, `${tr('modal', 'desktop')}-retry1/modal-zen-diff.png`, 'diff');

    expect(run('--run', '42').status).toBe(0);
    expect(read(`${BASE}/desktop/modal-zen.png`)).toBe('retry');
    expect(read(`${BASE}/phone/modal-zen.png`)).toBe('old modal');
  });

  it('adds shots CI wrote because no baseline was committed, and lists them as new', () => {
    put(artifact, `tests/overlays/__screenshots__/linux/phone/toast-pair-zen.png`, 'written by CI');
    // a baseline that already exists is never overwritten from this folder
    put(artifact, `tests/overlays/__screenshots__/linux/phone/sheet-zen.png`, 'not a diff');

    const r = run('--run', '42');
    expect(r.status, r.out).toBe(0);
    expect(read(`${BASE}/phone/toast-pair-zen.png`)).toBe('written by CI');
    expect(read(`${BASE}/phone/sheet-zen.png`)).toBe('old sheet');
    expect(r.out).toMatch(/New baselines \(1 shots/);
  });

  it('exits 2 and changes nothing when every shot matches', () => {
    put(artifact, `${tr('modal', 'phone')}/modal-zen-actual.png`, 'old modal');
    put(artifact, `${tr('modal', 'phone')}/modal-zen-diff.png`, 'diff');

    const r = run('--run', '42');
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain('Nothing to refresh');
    expect(git('status', '--porcelain')).toBe('');
  });

  it('fails without changing anything when the run has no artifact, or outside the repo root', () => {
    expect(run('--run', '7').status).toBe(1);
    expect(git('status', '--porcelain')).toBe('');

    const r = spawnSync('bash', [SCRIPT, '--run', '42'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('run from the repo root');
    expect(existsSync(join(dir, 'apps'))).toBe(false);
  });
});
