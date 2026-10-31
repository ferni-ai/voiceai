// deploy-retry.sh sourced alone: the log classifier and the retry, with a stub deploy command
// in place of lk. No network.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'deploy-retry.sh');
const bash = (script, args = []) =>
  spawnSync(
    '/bin/bash',
    ['-c', `log() { echo "LOG $*"; }; . "${LIB}"; ${script}`, 'bash', ...args],
    {
      encoding: 'utf8',
    }
  );

// ~/Documents/voiceai-evidence/nightly/2026-10-29/deploy.log, in full
const NIGHT_1029 = `Using project [ferni-dev]
No agent ID provided, selecting from available agents...
unable to list agents: failed to do request: Post "https://agents.livekit.cloud/twirp/livekit.CloudAgent/ListAgents": read tcp 192.168.68.60:64057->129.158.251.54:443: read: operation timed out
`;
const STARTED = `Using project [ferni-dev]
Using agent [CA_siTDMHEba4Fg]
This deploy continues even if you disconnect; run \`lk agent status\` to check.
#1 Starting build
#1 DONE 0.0s
`;

describe('deploy_log_is_transient', () => {
  const transient = (body) => {
    const f = join(mkdtempSync(join(tmpdir(), 'deploy-log-')), 'deploy.log');
    writeFileSync(f, body);
    return bash('deploy_log_is_transient "$1"', [f]).status === 0;
  };

  it('the 2026-10-29 ListAgents timeout is transient', () => {
    expect(transient(NIGHT_1029)).toBe(true);
  });
  it('a type error is not', () => {
    expect(transient(`${STARTED}src/x.ts(3,1): error TS2345: bad\n`)).toBe(false);
  });
  it('unable to deploy agent is not, even with a network error in it', () => {
    expect(transient('unable to deploy agent: failed to do request: i/o timeout\n')).toBe(false);
  });
  it('a timeout after the build started is not', () => {
    expect(transient(`${STARTED}read: operation timed out\n`)).toBe(false);
  });
  it('an empty or missing log is not', () => {
    expect(transient('')).toBe(false);
    expect(bash('deploy_log_is_transient /nonexistent/deploy.log').status).toBe(1);
  });
});

describe('deploy_with_retry', () => {
  // deploy stub: prints the Nth entry of its replies on its Nth call
  const run = (...replies) => {
    const t = mkdtempSync(join(tmpdir(), 'deploy-retry-'));
    replies.forEach((r, i) => writeFileSync(join(t, `reply${i + 1}`), r));
    const stub = `deploy() { n=$(( $(cat "${t}/calls" 2>/dev/null || echo 0) + 1 )); echo $n > "${t}/calls"; cat "${t}/reply$n"; }`;
    const r = bash(`${stub}; deploy_with_retry "${t}/deploy.log" 0 deploy`);
    return {
      calls: Number(readFileSync(join(t, 'calls'), 'utf8')),
      log: readFileSync(join(t, 'deploy.log'), 'utf8'),
      out: r.stdout,
    };
  };

  it('retries once after a network error before the build, keeping both attempts', () => {
    const r = run(NIGHT_1029, `${STARTED}Completed deployment\n`);
    expect(r.calls).toBe(2);
    expect(r.log).toMatch(/operation timed out[\s\S]*----- retry[\s\S]*Completed deployment/);
    expect(r.out).toMatch(/^LOG deploy: network error before the build started; retrying once/m);
  });
  it('retries only once when the network fails twice', () => {
    expect(run(NIGHT_1029, NIGHT_1029, STARTED).calls).toBe(2);
  });
  it('does not retry a build that started, or a clean deploy', () => {
    expect(run(`${STARTED}error TS2345: bad\n`, STARTED).calls).toBe(1);
    expect(run(`${STARTED}Completed deployment\n`, STARTED).calls).toBe(1);
  });
});
