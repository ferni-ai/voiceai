/**
 * The emergency breaker on POST /api/journal/transcribe: one hourly cap for
 * every caller together, so many accounts on many addresses can't run up an
 * unbounded bill. Its own file, so no other test's calls count toward it.
 * Only Date is faked, to step past the hour.
 */

/* eslint-disable no-await-in-loop -- the limiter counts calls in order */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const transcribe = vi.hoisted(() => vi.fn());
const warnings = vi.hoisted(() => ({ calls: [] as Array<{ module: unknown; msg: unknown }> }));

vi.mock('../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: transcribe,
}));

// tok-<name> is a full account, anon-<name> an anonymous one.
vi.mock('../../services/identity/firebase-auth.js', () => ({
  claimsFirebaseIssuer: () => false,
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const kind = token.split('-')[0];
    if (kind !== 'tok' && kind !== 'anon') return null;
    return { uid: `uid-${token}`, claims: {}, isAnonymous: kind === 'anon' };
  }),
}));

vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) => ({
      ...actual.createLogger(bindings),
      debug: () => undefined,
      info: () => undefined,
      error: () => undefined,
      warn: (_ctx: unknown, msg?: unknown) => {
        warnings.calls.push({ module: bindings.module, msg });
      },
    }),
  };
});

const { handleJournalRoutes } = await import('../journal-routes.js');
const limits = await import('../journal-transcribe-limits.js');

const PATH = '/api/journal/transcribe';
const AUDIO = Buffer.from('a short journal clip').toString('base64');

async function post(token: string, ip: string): Promise<number | undefined> {
  const stream = new PassThrough();
  stream.end(JSON.stringify({ audioBase64: AUDIO }));
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = PATH;
  req.headers = { authorization: `Bearer ${token}`, 'x-forwarded-for': ip };
  const writeHead = vi.fn();
  const res = {
    setHeader: vi.fn(),
    writeHead,
    end: vi.fn((_chunk?: unknown) => undefined),
    once: vi.fn(),
  } as unknown as ServerResponse;
  await handleJournalRoutes(req, res, PATH);
  return writeHead.mock.calls[0]?.[0] as number | undefined;
}

/** `count` calls in order, each from `call(i)`; the statuses. */
async function burst(count: number, call: (i: number) => [string, string]): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    statuses.push((await post(...call(i))) ?? 0);
  }
  return statuses;
}

let now = Date.parse('2026-10-13T09:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  transcribe.mockReset();
  transcribe.mockResolvedValue('words');
  warnings.calls = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const breakerWarnings = (): unknown[] =>
  warnings.calls.filter(
    (w) => w.module === 'journal-transcribe-limits' && String(w.msg).includes('breaker tripped')
  );

describe('global breaker', () => {
  it('reads TRANSCRIBE_MAX_PER_HOUR, defaulting to 2000', () => {
    expect(limits.globalMaxPerHour({})).toBe(2000);
    expect(limits.globalMaxPerHour({ TRANSCRIBE_MAX_PER_HOUR: ' 500 ' })).toBe(500);
    for (const bad of ['0', '-5', 'lots', '12.5', '0x10', '1e3']) {
      expect(limits.globalMaxPerHour({ TRANSCRIBE_MAX_PER_HOUR: bad })).toBe(2000);
    }
  });

  it('refuses everyone with 503 once the hour is spent, and lets them back in the next hour', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_PER_HOUR', '5');

    // Five signed-in people on five addresses: each far under its own limits.
    const statuses = await burst(5, (i) => [`tok-b${i}`, `192.0.2.${i}`]);
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    expect(transcribe).toHaveBeenCalledTimes(5);
    expect(breakerWarnings()).toHaveLength(0);

    // A sixth signed-in person and an anonymous caller, both fresh: the breaker refuses them.
    expect(await post('tok-b-late', '192.0.2.50')).toBe(503);
    expect(await post('anon-b-late', '192.0.2.51')).toBe(503);
    expect(await post('tok-b-later', '192.0.2.52')).toBe(503);
    expect(transcribe).toHaveBeenCalledTimes(5);
    expect(breakerWarnings()).toHaveLength(1);

    now += 61 * 60_000;
    vi.setSystemTime(now);
    expect(await post('tok-b-next-hour', '192.0.2.60')).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(6);
  });

  it('does not count calls a per-key limit already refused', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_PER_HOUR', '15');
    // A fresh hour, clear of the last test's calls.
    now += 2 * 60 * 60_000;
    vi.setSystemTime(now);

    // One person sends 25 calls in a minute: 10 pass, 15 hit their own 429.
    const statuses = await burst(25, () => ['tok-noisy', '192.0.2.100']);
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(15);

    // The breaker counted only the 10 that passed, so 5 others still get through.
    const others = await burst(5, (i) => [`tok-quiet${i}`, `192.0.2.${110 + i}`]);
    expect(others).toEqual([200, 200, 200, 200, 200]);
    expect(await post('tok-quiet-last', '192.0.2.120')).toBe(503);
  });
});
