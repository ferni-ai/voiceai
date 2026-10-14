/**
 * Hourly caps on POST /api/journal/transcribe, beside the per-minute ones, so
 * a steady caller can't spend an hour's budget one minute at a time. Only
 * Date is faked, to step past the minute windows inside one hour.
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

const allOk = (k: number): number[] => Array<number>(k).fill(200);

describe('hourly caps', () => {
  it('stops a signed-in person on call 61 in an hour', async () => {
    const statuses: number[] = [];
    for (let minute = 0; minute < 6; minute++) {
      statuses.push(...(await burst(10, () => ['tok-hour-user', '192.0.2.10'])));
      nextMinute();
    }
    expect(statuses).toEqual(allOk(60));

    expect(await post('tok-hour-user', '192.0.2.10')).toBe(429);
    expect(transcribe).toHaveBeenCalledTimes(60);
  });

  it('stops anonymous callers in one /64 on call 21 in an hour', async () => {
    const statuses: number[] = [];
    for (let minute = 0; minute < 2; minute++) {
      // A new anonymous uid and a new address inside the /64 every call.
      statuses.push(
        ...(await burst(10, (i) => [`anon-h${minute}-${i}`, `2001:db8:77:1::${minute}:${i + 1}`]))
      );
      nextMinute();
    }
    expect(statuses).toEqual(allOk(20));

    expect(await post('anon-h-late', '2001:db8:77:1:abcd::1')).toBe(429);
    expect(transcribe).toHaveBeenCalledTimes(20);
  });

  it('stops one IP across many signed-in people on call 91 in an hour', async () => {
    const statuses: number[] = [];
    for (let minute = 0; minute < 3; minute++) {
      // 30 a minute, each person well under their own limits.
      statuses.push(...(await burst(30, (i) => [`tok-ip-${minute}-${i % 5}`, '192.0.2.20'])));
      nextMinute();
    }
    expect(statuses).toEqual(allOk(90));

    expect(await post('tok-ip-late', '192.0.2.20')).toBe(429);
    expect(transcribe).toHaveBeenCalledTimes(90);
  });

  it('uses the hour caps the design names', () => {
    expect(limits.TRANSCRIBE_LIMITS).toEqual({
      ip: { perMinute: 30, perHour: 90 },
      user: { perMinute: 10, perHour: 60 },
      anon: { perMinute: 10, perHour: 20 },
    });
  });
});
