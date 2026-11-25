/**
 * Two scripts used to default to a voice agent VM that no longer exists. Each now refuses to run,
 * before any network call, when its URL is not set, and says which variable to set.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
/** Nothing listens here, so if a script got past its check, any connection would fail fast. */
const CLOSED = 'ws://127.0.0.1:9';

const run = (args: string[], env: Record<string, string>) => {
  // Drop cloud credentials too, so a regressed script cannot reach a real service from this test.
  const {
    OBS_URL: _obs,
    VOICE_AGENT_HEALTH_URL: _health,
    GOOGLE_APPLICATION_CREDENTIALS: _creds,
    ...rest
  } = process.env;
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...rest, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
};

describe('a script whose host default was removed refuses to run without its URL', () => {
  it('verify-prod-voice-session.mjs exits 1 with "Missing OBS_URL"', () => {
    const result = run(['scripts/ops/verify-prod-voice-session.mjs'], {
      LIVEKIT_URL: CLOSED,
      LIVEKIT_API_KEY: 'test-key',
      LIVEKIT_API_SECRET: 'test-secret',
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      proven: false,
      before: null,
      after: { _meta: { error: 'Missing OBS_URL' } },
    });
  });

  it('test-better-than-human-e2e.ts exits 1 asking for VOICE_AGENT_HEALTH_URL, before its banner', () => {
    const result = run(['--import', 'tsx', 'scripts/test-better-than-human-e2e.ts'], {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Set VOICE_AGENT_HEALTH_URL');
    expect(result.stdout).not.toContain('BETTER THAN HUMAN');
  });
});
