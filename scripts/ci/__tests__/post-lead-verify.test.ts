/**
 * post-lead-verify.sh must post its evidence as the verifier app. A gh wrapper in Claude
 * sessions picks the identity from FERNI_GH_IDENTITY, so every call that posts or reads
 * the head runs with `verifier`, and only the re-run calls use `agent`.
 */
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '..', 'post-lead-verify.sh');
const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

// Records "<identity>|<token>|<args>" per call and answers the four calls the script makes.
const FAKE_GH = `#!/usr/bin/env bash
echo "\${FERNI_GH_IDENTITY:-unset}|\${GH_TOKEN:-none}|$*" >> "$GH_CALL_LOG"
case "$*" in
  *"/pulls/"*) echo ${HEAD} ;;
  *"/statuses/"*) echo "ferni-verifier[bot]" ;;
  *"pr comment"*) ;;
  *"/runs?"*) echo "123 completed success" ;;
esac
`;

let dir: string;
let log: string;

function run(extraEnv: Record<string, string> = {}) {
  const env: Record<string, string> = {
    PATH: `${dir}:${process.env.PATH ?? ''}`,
    HOME: dir,
    GH_CALL_LOG: log,
    GH_REPO: 'example/repo',
    LEAD_VERIFY_TOKEN_CMD: join(dir, 'verifier-token'),
    LEAD_VERIFY_RERUN_TOKEN_CMD: join(dir, 'agent-token'),
    LEAD_VERIFY_RERUN_POLLS: '1',
    LEAD_VERIFY_RERUN_WAIT: '0',
    ...extraEnv,
  };
  const r = spawnSync('bash', [SCRIPT, '42', HEAD, 'pass', 'all contracts held'], {
    env,
    encoding: 'utf8',
  });
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  return { status: r.status, stderr: r.stderr, calls };
}

const identityOf = (calls: string[], match: string) =>
  calls.filter((c) => c.includes(match)).map((c) => c.split('|').slice(0, 2).join('|'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'post-lead-verify-'));
  log = join(dir, 'calls.log');
  writeFileSync(log, '');
  for (const [name, body] of [
    ['gh', FAKE_GH],
    ['verifier-token', '#!/usr/bin/env bash\necho verifier-tok\n'],
    ['agent-token', '#!/usr/bin/env bash\necho agent-tok\n'],
  ]) {
    writeFileSync(join(dir, name), body);
    chmodSync(join(dir, name), 0o755);
  }
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('post-lead-verify.sh identity', () => {
  it('reads the head, posts the status and comments as the verifier', () => {
    const { status, stderr, calls } = run();
    expect(status, stderr).toBe(0);
    expect(identityOf(calls, '/pulls/')).toEqual(['verifier|verifier-tok']);
    expect(identityOf(calls, '/statuses/')).toEqual(['verifier|verifier-tok']);
    expect(identityOf(calls, 'pr comment')).toEqual(['verifier|verifier-tok']);
  });

  it('overrides an agent identity already set in the caller environment', () => {
    const { status, stderr, calls } = run({ FERNI_GH_IDENTITY: 'agent' });
    expect(status, stderr).toBe(0);
    expect(identityOf(calls, '/statuses/')).toEqual(['verifier|verifier-tok']);
    expect(identityOf(calls, 'pr comment')).toEqual(['verifier|verifier-tok']);
  });

  it('re-runs the Lead Verified check as the agent, not the verifier', () => {
    const { calls } = run();
    expect(identityOf(calls, '/runs?')).toEqual(['agent|agent-tok']);
  });
});
