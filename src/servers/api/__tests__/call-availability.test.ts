/**
 * Call availability at start (#3870): a developer's server runs without the LiveKit
 * settings and its call routes answer 503; a deployed server without them still stops.
 */
import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'http';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideCallsAtStartup, refuseCallWithoutLiveKit } from '../call-availability.js';

const LIVEKIT = {
  LIVEKIT_URL: 'wss://livekit.example.invalid',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret',
};
const LIVEKIT_VARS = Object.keys(LIVEKIT) as Array<keyof typeof LIVEKIT>;
const DEPLOYED = ['production', 'staging', 'test', undefined];

function fakeRes(): { res: ServerResponse; sent: { status: number; body: string } } {
  const sent = { status: 0, body: '' };
  const res = {
    writeHead: (status: number) => {
      sent.status = status;
    },
    end: (body: string) => {
      sent.body = body;
    },
  } as unknown as ServerResponse;
  return { res, sent };
}

describe('decideCallsAtStartup', () => {
  it.each([...DEPLOYED, 'development'])('runs with LiveKit configured (NODE_ENV %s)', (nodeEnv) => {
    expect(decideCallsAtStartup({ ...LIVEKIT, NODE_ENV: nodeEnv })).toBe(true);
  });

  it.each(DEPLOYED.flatMap((nodeEnv) => LIVEKIT_VARS.map((missing) => [nodeEnv, missing])))(
    'stops a deployed server (NODE_ENV %s) missing %s',
    (nodeEnv, missing) => {
      const env = { ...LIVEKIT, NODE_ENV: nodeEnv, [missing as string]: '' };
      expect(decideCallsAtStartup(env)).toBe(false);
    }
  );

  it('runs a development server without any LiveKit settings', () => {
    expect(decideCallsAtStartup({ NODE_ENV: 'development' })).toBe(true);
  });

  it('is what the UI server checks before it starts', () => {
    const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    expect(source).toMatch(/\nif \(!decideCallsAtStartup\(\)\) process\.exit\(1\);\n/);
    expect(source).not.toMatch(/Missing required environment variables: LIVEKIT/);
  });
});

describe('refuseCallWithoutLiveKit', () => {
  it.each(['/token', '/demo-token', '/token-url'])(
    'answers 503 on %s on a development server without LiveKit',
    (pathname) => {
      const { res, sent } = fakeRes();
      expect(refuseCallWithoutLiveKit(res, pathname, { NODE_ENV: 'development' })).toBe(true);
      expect(sent.status).toBe(503);
      expect(JSON.parse(sent.body)).toEqual({ error: "Calls aren't set up on this server." });
    }
  );

  it('leaves non-call routes alone', () => {
    const { res, sent } = fakeRes();
    expect(refuseCallWithoutLiveKit(res, '/demo-status', { NODE_ENV: 'development' })).toBe(false);
    expect(refuseCallWithoutLiveKit(res, '/api/twin/profile', { NODE_ENV: 'development' })).toBe(
      false
    );
    expect(sent.status).toBe(0);
  });

  it('leaves call routes alone once LiveKit is configured', () => {
    const { res } = fakeRes();
    const env = { ...LIVEKIT, NODE_ENV: 'development' };
    expect(refuseCallWithoutLiveKit(res, '/token', env)).toBe(false);
  });

  it('never answers 503 outside development, where the server would have stopped', () => {
    const { res } = fakeRes();
    for (const nodeEnv of DEPLOYED) {
      expect(refuseCallWithoutLiveKit(res, '/token', { NODE_ENV: nodeEnv })).toBe(false);
    }
  });
});
