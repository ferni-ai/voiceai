/**
 * Who may compare audio with whose voice print, through the real /api/voice
 * dispatcher (src/api/voice-auth/index.ts, as the UI server mounts it).
 *
 * With the neural model in the UI server image, a voice print really
 * identifies its owner, so these routes are a biometric oracle unless every
 * comparison is the signed-in caller's audio against the caller's own print.
 * The caller is the x-firebase-uid that bindVerifiedIdentity sets from a
 * verified token; x-user-id (an admin key's target, or a developer's claim)
 * never picks whose print is compared.
 *
 * Liveness is held at "live" here: an attacker who shapes audio past it must
 * still learn nothing. Prints use #280's waveform-contract fixture model.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const unavailable = (): never => {
    throw new Error('no Firebase in this test');
  };
  return { default: { apps: [], initializeApp: unavailable, firestore: unavailable } };
});
vi.mock('../../memory/redis-cache.js', () => ({ getRedisCache: () => null }));
vi.mock('../../services/voice/voice-liveness.js', () => ({
  checkLiveness: async () => ({ isLive: true, confidence: 1, warnings: [] }),
}));

import { resetSpeakerEmbeddingWorker } from '../../services/voice/speaker-embedding-worker.js';
import { deleteVoiceProfile } from '../../services/voice/voice-profile-store.js';
import { resetIPRateLimit, resetUserRateLimit } from '../../services/voice/voice-rate-limit.js';
import { useSpeakerModel } from '../../services/voice/__tests__/speaker-model-fixture.js';
import { handleVoiceAuthRoutes } from '../voice-auth/index.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const A = 'user-authz-a';
const B = 'user-authz-b';
const RATE = 16000;
const FIXTURE = join(__dirname, '../../services/voice/__tests__/fixtures/waveform-contract.onnx');

type Who = { uid?: string; claimedUserId?: string; deviceId?: string };

async function call(
  method: string,
  route: string,
  who: Who,
  body?: Record<string, unknown>
): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (who.uid) headers['x-firebase-uid'] = who.uid;
  if (who.claimedUserId) headers['x-user-id'] = who.claimedUserId;
  if (who.deviceId) headers['x-device-id'] = who.deviceId;
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
    method,
    url: `/api/voice${route}`,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 200;
  let text = '{}';
  const res = {
    setHeader: () => undefined,
    getHeader: () => undefined,
    writeHead: (code: number) => void (status = code),
    end: (data?: string) => void (text = data ?? '{}'),
  };
  const handled = await handleVoiceAuthRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    `/api/voice${route}`
  );
  if (!handled) return { status: 404, text: '', json: {} };
  return { status, text, json: JSON.parse(text) as Record<string, unknown> };
}

/** 3 s of speech-like audio with its own pitch, so A and B sound different. */
function voice(seed: number, hz: number): number[] {
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: number[] = [];
  let phase = 0;
  while (out.length < 3 * RATE) {
    const syllable = Math.floor(RATE * (0.12 + rand() * 0.2));
    for (let k = 0; k < syllable && out.length < 3 * RATE; k++) {
      phase += (2 * Math.PI * hz * (0.95 + rand() * 0.1)) / RATE;
      const voiced = 0.3 * Math.sin(phase) + 0.15 * Math.sin(2 * phase);
      out.push(Math.sin((Math.PI * k) / syllable) * voiced + (rand() - 0.5) * 0.01);
    }
    const pause = Math.floor(RATE * (0.04 + rand() * 0.12));
    for (let k = 0; k < pause && out.length < 3 * RATE; k++) out.push((rand() - 0.5) * 0.06);
  }
  return out;
}

async function enroll(uid: string, hz: number): Promise<void> {
  expect((await call('POST', '/enroll/start', { uid }, { requiredSamples: 3 })).status).toBe(200);
  for (const seed of [1, 2, 3]) {
    // eslint-disable-next-line no-await-in-loop -- sequential, like the web modal
    const added = await call('POST', '/enroll/sample', { uid }, { samples: voice(seed, hz) });
    expect(added.status).toBe(200);
  }
  expect((await call('POST', '/enroll/complete', { uid }, {})).status).toBe(200);
}

beforeAll(async () => {
  for (const user of [A, B, 'anonymous']) resetUserRateLimit(user);
  resetIPRateLimit('127.0.0.1');
  await resetSpeakerEmbeddingWorker();
  useSpeakerModel(FIXTURE);
  await enroll(A, 110);
  await enroll(B, 210);
});

afterAll(async () => {
  await deleteVoiceProfile(A);
  await deleteVoiceProfile(B);
  await resetSpeakerEmbeddingWorker();
  useSpeakerModel(undefined);
});

describe('anonymous callers get nothing', () => {
  it.each([
    ['POST', '/verify', { samples: voice(9, 110) }],
    ['POST', '/enroll/start', {}],
    ['POST', '/enroll/sample', { samples: voice(9, 110) }],
    ['POST', '/enroll/complete', {}],
    ['POST', '/auth/start', {}],
    ['POST', '/auth/check', { sessionId: 'x', samples: voice(9, 110) }],
    ['POST', '/auth/stop', { sessionId: 'x' }],
    ['GET', '/profile', undefined],
    ['DELETE', '/profile', undefined],
    ['GET', '/household', undefined],
    ['POST', '/household', { name: 'x' }],
    ['POST', '/household/members', { userId: B, displayName: 'B' }],
    ['DELETE', `/household/members/${B}`, undefined],
  ])('%s %s -> 401', async (method, route, body) => {
    const res = await call(method, route, { deviceId: 'device-x' }, body);
    expect(res.status).toBe(401);
  });

  it.each([['/identify'], ['/household/identify']])(
    'POST %s (1:N across users) is not served at all',
    async (route) => {
      const res = await call('POST', route, { deviceId: 'device-x' }, { samples: voice(9, 210) });
      expect(res.status).toBe(404);
    }
  );
});

describe('user A learns nothing about user B', () => {
  it("A's /verify with B's voice compares with A's print only: no B id, no B score", async () => {
    const res = await call('POST', '/verify', { uid: A }, { samples: voice(7, 210) });
    expect(res.text).not.toContain(B);
    expect(res.json.userId === undefined || res.json.userId === A).toBe(true);
  });

  it("an x-user-id naming B (admin key target, dev claim) never selects B's print", async () => {
    const res = await call('POST', '/verify', { claimedUserId: B }, { samples: voice(7, 210) });
    expect(res.status).toBe(401);
    expect(res.text).not.toContain(B);
  });

  it('identify by voice is gone, so B cannot be found among all prints', async () => {
    const res = await call('POST', '/identify', { uid: A }, { samples: voice(7, 210) });
    expect(res.text).not.toContain(B);
    expect(res.status).toBe(404);
  });

  it("A cannot read, join or edit B's household by naming B's device", async () => {
    expect((await call('POST', '/household', { uid: B, deviceId: 'device-b' }, {})).status).toBe(
      201
    );
    const read = await call('GET', '/household', { uid: A, deviceId: 'device-b' });
    expect(read.status).toBe(404);
    expect(read.text).not.toContain(B);
    const add = await call(
      'POST',
      '/household/members',
      { uid: A, deviceId: 'device-b' },
      { userId: A, displayName: 'A' }
    );
    expect(add.status).toBe(404);
    const takeover = await call('POST', '/household', { uid: A, deviceId: 'device-b' }, {});
    expect(takeover.status).toBe(409);
    expect((await call('GET', '/household', { uid: B, deviceId: 'device-b' })).status).toBe(200);
  });
});

describe('A against A still works', () => {
  it("A's /verify with A's own voice verifies as A", async () => {
    const res = await call('POST', '/verify', { uid: A }, { samples: voice(1, 110) });
    expect(res.status).toBe(200);
    expect(res.json.verified).toBe(true);
  });

  it('A manages their own household', async () => {
    expect((await call('POST', '/household', { uid: A, deviceId: 'device-a' }, {})).status).toBe(
      201
    );
    const add = await call(
      'POST',
      '/household/members',
      { uid: A, deviceId: 'device-a' },
      { userId: 'family-member', displayName: 'Sam' }
    );
    expect(add.status).toBe(201);
    expect((await call('GET', '/household', { uid: A, deviceId: 'device-a' })).status).toBe(200);
  });
});
