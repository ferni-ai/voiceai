/**
 * initializeSdkLogger in a process of its own, started the way gce-voice-worker.ts and
 * job-child.ts start (phone redaction first, then initializeSdkLogger), reading the
 * process's real stdout. It runs the same setup function both entry points call, not
 * the entry points themselves (they warm up Firestore and LiveKit).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const child = fileURLToPath(new URL('./sdk-logger-child.ts', import.meta.url));
const WORDS = [
  'the blue kettle sang softly',
  'whispers from the orchard gate',
  'a paper boat drifted past',
];
const MSGS = ['sdk pii line', 'sdk child line', 'sdk line after re-init'];

function run(database: string): { stdout: string; stderr: string; status: number | null } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.FIRESTORE_DATABASE;
  if (database) env.FIRESTORE_DATABASE = database;
  // NODE_ENV production: JSON lines, as deployed. LOG_LEVEL empty: the default, info.
  Object.assign(env, { NODE_ENV: 'production', LOG_LEVEL: '', VITEST: '', SENTRY_DSN: '' });
  return spawnSync(process.execPath, ['--import', 'tsx', child], {
    encoding: 'utf8',
    timeout: 60_000,
    env,
  });
}

function sdkRecords(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((r) => MSGS.includes(String(r.msg)));
}

describe('initializeSdkLogger in its own process', () => {
  it('prod: lengths only, in the root logger, a child, and after an SDK re-init', () => {
    const r = run('');
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('sdk logger before init: none');
    const out = `${r.stdout}\n${r.stderr}`;
    for (const words of WORDS) {
      for (let i = 0; i + 8 <= words.length; i++) expect(out).not.toContain(words.slice(i, i + 8));
    }
    const [root, child, reinit] = sdkRecords(r.stdout);
    expect(root).toMatchObject({
      msg: 'sdk pii line',
      'lk.pii.user_input': `[${WORDS[0].length} chars]`,
    });
    expect(child).toMatchObject({
      msg: 'sdk child line',
      'lk.pii.response': `[${WORDS[1].length} chars]`,
    });
    expect(reinit).toMatchObject({ 'lk.pii.message': `[${WORDS[2].length} chars]` });
    // the phone redaction still applies alongside, as before
    expect(root.callerPhone).toBe('***0123');
  });

  it('dev: the words (positive control), and the phone number still masked', () => {
    const r = run('ferni-dev');
    expect(r.status).toBe(0);
    for (const words of WORDS) expect(r.stdout).toContain(words);
    const [root] = sdkRecords(r.stdout);
    expect(root.callerPhone).toBe('***0123');
    expect(r.stdout).not.toContain('5550123');
  });
});
