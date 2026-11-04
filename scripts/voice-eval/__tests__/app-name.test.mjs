// The name run.sh sends for the caller (job metadata user_name): one per caller, from the scenario.
// first-call-seed has the caller say "I'm Jess"; the app used to send "Sam" on both calls, so Ferni
// was told a name the caller never gave, and the return call's name fact measured the metadata.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RUN = fileURLToPath(new URL('../run.sh', import.meta.url));
const ENV = {
  EVAL_TZ: '',
  EVAL_CALLER_TIME: '',
  EVAL_SEED: '',
  EVAL_SCENARIO_DIR: '',
  EVAL_DRY_RUN: '1',
};
const plan = (scenario, env = {}) =>
  JSON.parse(
    execFileSync('/bin/zsh', [RUN, 'dev', scenario, 'x'], {
      env: { ...process.env, ...ENV, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  );
const scenarios = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'app-name-'));
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(dir, `${name}.txt`), `${text}\nHey Ferni.\n`);
  return dir;
};

// CI's ubuntu runner has no zsh (caller-clock.test.mjs skips the same way).
describe.skipIf(!existsSync('/bin/zsh'))('run.sh: the caller name in the job metadata', () => {
  it('first-call-seed then first-call-return: no name sent, so a "Jess" on call 2 is memory', () => {
    const p = plan('first-call-return', { EVAL_SEED: 'first-call-seed' });
    expect(p.metadata).not.toHaveProperty('user_name');
  });

  it('a scenario with no #@app-name keeps Sam', () => {
    expect(plan('facts-recall', { EVAL_SEED: 'facts-seed' }).metadata.user_name).toBe('Sam');
  });

  it('#@app-name <Name> is sent as user_name', () => {
    const dir = scenarios({ named: '#@app-name Jess' });
    expect(plan('named', { EVAL_SCENARIO_DIR: dir }).metadata.user_name).toBe('Jess');
  });

  it('a seed and its return call naming different callers is an error', () => {
    const dir = scenarios({ a: '#@app-name Jess', b: '#@app-name Sam' });
    const r = spawnSync('/bin/zsh', [RUN, 'dev', 'b', 'x'], {
      env: { ...process.env, ...ENV, EVAL_SCENARIO_DIR: dir, EVAL_SEED: 'a' },
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/#@app-name Jess but b says Sam/);
  });
});
