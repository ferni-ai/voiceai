/**
 * End to end: the real `flags:new` writes an issue URL, then the real Flag expiry gate reads it.
 * The // in 'https://' once read as a comment inside the entry, so the documented URL form failed
 * the gate on every date with a parse error (verify of #2577, round 4). Runs both scripts in a
 * scratch git repo holding a copy of the flag registry, with a fake `gh` on PATH.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = join(__dirname, '..', '..', '..');
const TSX = join(REPO, 'node_modules', '.bin', 'tsx');
const NEW_FLAG = join(REPO, 'scripts', 'flags', 'new-flag.ts');
const EXPIRY = join(REPO, 'scripts', 'flags', 'expiry.ts');
const HERE = 'https://github.com/ferni-ai/voiceai/issues';

let root = '';
let bin = '';

/** A fake gh with issues: read: #101 is open, #102 closed; 'Flag expiry: tools' is #3001. */
const FAKE_GH = `#!/bin/sh
case "$*" in
  "api repos/{owner}/{repo}/issues?state=all&per_page=1") echo '[{"repository_url":"https://api.github.com/repos/ferni-ai/voiceai"}]';;
  "issue list"*) echo '[{"number":3001,"title":"Flag expiry: tools"}]';;
  "api repos/{owner}/{repo}/issues/101") echo '{"state":"open"}';;
  "api repos/{owner}/{repo}/issues/102") echo '{"state":"closed"}';;
  *) echo "gh: Not Found (HTTP 404)" >&2; exit 1;;
esac
`;

function run(script: string, args: string[], today?: string): { rc: number; out: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, QUALITY_BASE: 'HEAD' };
  delete env.GITHUB_ACTIONS; // in CI the gate ignores QUALITY_BASE and FLAG_EXPIRY_TODAY
  delete env.GITHUB_EVENT_PATH;
  if (today) env.FLAG_EXPIRY_TODAY = today;
  else delete env.FLAG_EXPIRY_TODAY;
  const r = spawnSync(TSX, [script, ...args], { cwd: root, env, encoding: 'utf8' });
  return { rc: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

const git = (...args: string[]): void => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
};

/** flags:new for a fresh experiment ZZ_<n> with `issue`, expiring 2027-03-01, then the gate on `today`. */
function newFlagThenGate(n: string, issue: string, today: string): { made: number; rc: number; out: string } {
  const made = run(NEW_FLAG, [
    `ZZ_URL_${n}`, '--default', 'off', '--owner', 'tools', '--kind', 'experiment',
    '--expires', '2027-03-01', '--issue', issue,
  ]);
  expect(made.out).toMatch(/Wrote /);
  const gate = run(EXPIRY, [], today);
  rmSync(join(root, 'src', 'config', 'flags', `ZZ_URL_${n}.ts`));
  return { made: made.rc, ...gate };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'flag-url-e2e-'));
  bin = join(root, '.bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);
  const config = join(root, 'src', 'config');
  mkdirSync(config, { recursive: true });
  for (const f of readdirSync(join(REPO, 'src', 'config')))
    if (/^flag-manifest[\w-]*\.ts$/.test(f) || f === 'flag-lifecycle-backfill.ts')
      cpSync(join(REPO, 'src', 'config', f), join(config, f));
  cpSync(join(REPO, 'src', 'config', 'flags'), join(config, 'flags'), {
    recursive: true,
    filter: (src) => !src.endsWith('index.generated.ts'),
  });
  // flags:new ends with `pnpm gen:lists` (the gitignored barrel); nothing to generate here
  writeFileSync(join(root, 'package.json'), '{"name":"flag-url-e2e","private":true,"scripts":{"gen:lists":"true"}}\n');
  writeFileSync(join(root, '.gitignore'), '.bin/\n');
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'base');
}, 60_000);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('flags:new with an issue URL, then the Flag expiry gate', () => {
  it("passes an open issue in this repo on 2027-01-15", () => {
    const r = newFlagThenGate('OPEN', `${HERE}/101`, '2027-01-15');
    expect(r.made).toBe(0);
    expect(r.out).not.toMatch(/comment inside its entry/);
    expect(r.out).toMatch(/✅/);
    expect(r.rc).toBe(0);
  }, 60_000);

  it("fails another repo's issue URL with the open-issue message, not a parse error", () => {
    const r = newFlagThenGate('ELSEWHERE', 'https://github.com/someone/else/issues/101', '2027-01-15');
    expect(r.out).not.toMatch(/comment inside its entry/);
    expect(r.out).toMatch(/'https:\/\/github\.com\/someone\/else\/issues\/101' is not an open issue in this repo/);
    expect(r.rc).toBe(1);
  }, 60_000);

  it("fails a closed issue's URL on 2027-01-15", () => {
    const r = newFlagThenGate('CLOSED', `${HERE}/102`, '2027-01-15');
    expect(r.out).not.toMatch(/comment inside its entry/);
    expect(r.out).toMatch(/issues\/102' is not an open issue in this repo/);
    expect(r.rc).toBe(1);
  }, 60_000);

  it('passes any issue URL on its shape before 2027-01-15', () => {
    const r = newFlagThenGate('EARLY', `${HERE}/102`, '2027-01-14');
    expect(r.out).not.toMatch(/comment inside its entry/);
    expect(r.rc).toBe(0);
  }, 60_000);
});
