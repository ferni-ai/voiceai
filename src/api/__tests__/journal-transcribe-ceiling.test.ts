/**
 * The hourly ceiling on journal transcriptions across everyone: a spend circuit
 * breaker that holds whatever mix of people and addresses is calling. Its own
 * file, so no other test's calls count toward the hour.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const transcribe = vi.hoisted(() => vi.fn());
const warnings = vi.hoisted(() => ({ calls: [] as Array<{ module: unknown; msg: unknown }> }));

vi.mock('../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: transcribe,
}));

vi.mock('../../services/identity/firebase-auth.js', () => ({
  claimsFirebaseIssuer: () => false,
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-') ? { uid: `uid-${token}`, claims: {}, isAnonymous: false } : null
  ),
}));

vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) => {
      const real = actual.createLogger(bindings);
      return {
        ...real,
        debug: () => undefined,
        info: () => undefined,
        error: () => undefined,
        warn: (_ctx: unknown, msg?: unknown) => {
          warnings.calls.push({ module: bindings.module, msg });
        },
      };
    },
  };
});

const { handleJournalRoutes } = await import('../journal-routes.js');
const { DEFAULT_TRANSCRIBE_MAX_PER_HOUR, transcribeMaxPerHour } =
  await import('../journal-transcribe-limits.js');

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

beforeEach(() => {
  transcribe.mockReset();
  transcribe.mockResolvedValue('words');
});

describe('hourly transcription ceiling', () => {
  it('defaults to 300 and ignores values that are not positive whole numbers', () => {
    expect(DEFAULT_TRANSCRIBE_MAX_PER_HOUR).toBe(300);
    expect(transcribeMaxPerHour({})).toBe(300);
    expect(transcribeMaxPerHour({ TRANSCRIBE_MAX_PER_HOUR: '0' })).toBe(300);
    expect(transcribeMaxPerHour({ TRANSCRIBE_MAX_PER_HOUR: 'lots' })).toBe(300);
    expect(transcribeMaxPerHour({ TRANSCRIBE_MAX_PER_HOUR: '12.5' })).toBe(300);
    expect(transcribeMaxPerHour({ TRANSCRIBE_MAX_PER_HOUR: ' 40 ' })).toBe(40);
  });

  it('answers 503 on the 301st transcription in an hour and never calls the transcriber', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_PER_HOUR', '');
    // 30 addresses x 10 people x 1 call: under every per-IP and per-person limit.
    for (let ip = 0; ip < 30; ip++) {
      for (let person = 0; person < 10; person++) {
        // eslint-disable-next-line no-await-in-loop -- the limiter counts calls in order
        expect(await post(`tok-${ip}-${person}`, `192.0.2.${ip}`)).toBe(200);
      }
    }
    expect(transcribe).toHaveBeenCalledTimes(300);

    expect(await post('tok-late-1', '198.51.100.1')).toBe(503);
    expect(await post('tok-late-2', '198.51.100.2')).toBe(503);
    expect(transcribe).toHaveBeenCalledTimes(300);

    const ceilingWarnings = warnings.calls.filter(
      (w) => w.module === 'journal-transcribe-limits' && String(w.msg).includes('hourly ceiling')
    );
    expect(ceilingWarnings).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});
