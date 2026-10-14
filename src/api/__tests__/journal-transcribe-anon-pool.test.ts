/**
 * The anonymous pool on POST /api/journal/transcribe: anonymous uids are free
 * to mint, so anonymous callers share one hourly pool. Signed-in people are
 * never blocked by it. Its own file, so no other test's anonymous calls count
 * toward the pool. Only Date is faked, to step past the minute windows.
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
/** Past the per-minute windows, still inside the hour. */
function nextMinute(): void {
  now += 61_000;
  vi.setSystemTime(now);
}

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

/** Fills the pool: 10 addresses x 20 anonymous calls, under every per-key limit. */
async function fillPool(): Promise<number[]> {
  const statuses: number[] = [];
  for (let minute = 0; minute < 2; minute++) {
    for (let ip = 0; ip < 10; ip++) {
      statuses.push(
        ...(await burst(10, (i) => [`anon-p${minute}-${ip}-${i}`, `198.51.100.${ip}`]))
      );
    }
    nextMinute();
  }
  return statuses;
}

describe('anonymous pool', () => {
  it('reads TRANSCRIBE_ANON_MAX_PER_HOUR, defaulting to 200', () => {
    expect(limits.anonMaxPerHour({})).toBe(200);
    expect(limits.anonMaxPerHour({ TRANSCRIBE_ANON_MAX_PER_HOUR: ' 50 ' })).toBe(50);
    for (const bad of ['0', '-5', 'lots', '12.5', '0x10', '1e3']) {
      expect(limits.anonMaxPerHour({ TRANSCRIBE_ANON_MAX_PER_HOUR: bad })).toBe(200);
    }
  });

  it('refuses anonymous callers with 503 once used up, while signed-in people still succeed', async () => {
    expect(await fillPool()).toEqual(Array<number>(200).fill(200));
    expect(transcribe).toHaveBeenCalledTimes(200);

    // A fresh anonymous caller on a fresh address: under its own limits, but the pool is spent.
    expect(await post('anon-late-1', '203.0.113.1')).toBe(503);
    expect(await post('anon-late-2', '203.0.113.2')).toBe(503);
    expect(transcribe).toHaveBeenCalledTimes(200);

    // Signed-in people are never blocked by the pool, even on an address the pool drained from.
    expect(await post('tok-real-1', '203.0.113.3')).toBe(200);
    expect(await post('tok-real-2', '198.51.100.0')).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(202);

    const poolWarnings = warnings.calls.filter(
      (w) => w.module === 'journal-transcribe-limits' && String(w.msg).includes('pool used up')
    );
    expect(poolWarnings).toHaveLength(1);
  });
});
