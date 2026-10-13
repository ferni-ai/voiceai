/**
 * POST /api/journal/transcribe needs a signed-in person, is rate limited, and
 * refuses oversize audio while the body streams in, before decoding it.
 *
 * It had no auth: with a working transcriber behind it, anyone could use it as
 * a free paid-transcription proxy. Anonymous Firebase sign-in mints a new uid
 * per request, so anonymous callers are limited by IP, and every caller shares
 * a per-IP limit. Drives the real route and the real requireAuth; only Firebase
 * token checks and the transcriber are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough, Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const transcribe = vi.hoisted(() => vi.fn());
const asyncLimiter = vi.hoisted(() => ({ calls: [] as string[] }));

// The real limiter, recording each key, so a test can see the cross-instance path is the one used.
vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  return {
    ...actual,
    checkRateLimitAsync: async (key: string, max: number, windowMs: number) => {
      asyncLimiter.calls.push(key);
      return actual.checkRateLimitAsync(key, max, windowMs);
    },
  };
});

vi.mock('../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: transcribe,
}));

// tok-<name> is a full account, anon-<name> an anonymous one; anything else fails to verify.
vi.mock('../../services/identity/firebase-auth.js', () => ({
  claimsFirebaseIssuer: () => false,
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const [kind, name] = token.split('-');
    if (kind !== 'tok' && kind !== 'anon') return null;
    return { uid: `uid-${kind}-${name}`, claims: {}, isAnonymous: kind === 'anon' };
  }),
}));

const { handleJournalRoutes } = await import('../journal-routes.js');
const { MAX_AUDIO_BASE64_CHARS, MAX_BODY_BYTES } = await import('../journal-transcribe-route.js');

const PATH = '/api/journal/transcribe';
const AUDIO = Buffer.from('a short journal clip').toString('base64');

interface Sent {
  status: number | undefined;
  body: Record<string, unknown>;
}

async function send(req: IncomingMessage, headers: Record<string, string>): Promise<Sent> {
  req.method = 'POST';
  req.url = PATH;
  req.headers = headers;
  const writeHead = vi.fn();
  const finish: Array<() => void> = [];
  const end = vi.fn((_chunk?: unknown) => finish.forEach((cb) => cb()));
  const once = vi.fn((event: string, cb: () => void) => {
    if (event === 'finish') finish.push(cb);
  });
  const res = { setHeader: vi.fn(), writeHead, end, once } as unknown as ServerResponse;
  await handleJournalRoutes(req, res, PATH);
  const status =
    (writeHead.mock.calls[0]?.[0] as number | undefined) ??
    (res as { statusCode?: number }).statusCode;
  return {
    status,
    body: JSON.parse(String(end.mock.calls[0]?.[0] ?? '{}')) as Record<string, unknown>,
  };
}

async function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const stream = new PassThrough();
  stream.end(JSON.stringify(body));
  return send(stream as unknown as IncomingMessage, headers);
}

let n = 0;
/** A fresh address per test, so no limiter bucket leaks between tests. */
function freshIp(): string {
  n++;
  return `198.51.${Math.floor(n / 250)}.${n % 250}`;
}
function as(token: string, ip: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'x-forwarded-for': ip };
}
function signedIn(): Record<string, string> {
  return as(`tok-p${++n}`, freshIp());
}

beforeEach(() => {
  asyncLimiter.calls = [];
  transcribe.mockReset();
  transcribe.mockResolvedValue('I walked by the water today');
});

describe('POST /api/journal/transcribe: auth', () => {
  it('answers 401 without a token and never transcribes', async () => {
    const { status } = await post({ audioBase64: AUDIO }, { 'x-forwarded-for': freshIp() });

    expect(status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('answers 401 for a token that does not verify', async () => {
    const { status } = await post({ audioBase64: AUDIO }, as('forged', freshIp()));

    expect(status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('transcribes for a signed-in person', async () => {
    const { status, body } = await post({ audioBase64: AUDIO, mimeType: 'audio/mp4' }, signedIn());

    expect(status).toBe(200);
    expect(body).toEqual({ transcript: 'I walked by the water today', success: true });
    const [buffer, mimeType] = transcribe.mock.calls[0] as [ArrayBuffer, string];
    expect(Buffer.from(buffer).toString('base64')).toBe(AUDIO);
    expect(mimeType).toBe('audio/mp4');
  });

  it('lets an anonymous person journal', async () => {
    const { status } = await post({ audioBase64: AUDIO }, as(`anon-a${++n}`, freshIp()));

    expect(status).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/journal/transcribe: size cap', () => {
  it('answers 413 for audio over the cap and never transcribes', async () => {
    const { status } = await post(
      { audioBase64: 'A'.repeat(MAX_AUDIO_BASE64_CHARS + 4) },
      signedIn()
    );

    expect(status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('answers 413 from an oversize Content-Length without reading the body', async () => {
    const stream = new PassThrough();
    stream.end(JSON.stringify({ audioBase64: AUDIO }));
    const { status } = await send(stream as unknown as IncomingMessage, {
      ...signedIn(),
      'content-length': String(MAX_BODY_BYTES + 1),
    });

    expect(status).toBe(413);
    expect(stream.readableLength).toBeGreaterThan(0); // never consumed
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('stops reading a chunked body once it passes the cap, and answers 413', async () => {
    const chunk = Buffer.alloc(64 * 1024, 'A');
    const total = MAX_BODY_BYTES * 3;
    let pulled = 0;
    const stream = new Readable({
      read() {
        if (pulled === 0) {
          pulled += 16;
          this.push('{"audioBase64":"');
          return;
        }
        if (pulled >= total) {
          this.push(null);
          return;
        }
        pulled += chunk.byteLength;
        this.push(chunk);
      },
    });

    const { status } = await send(stream as unknown as IncomingMessage, signedIn()); // no Content-Length

    expect(status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
    expect(pulled).toBeLessThan(MAX_BODY_BYTES + 1024 * 1024);
    expect(stream.destroyed).toBe(true);
  });

  it('accepts audio right at the cap', async () => {
    const { status } = await post({ audioBase64: 'A'.repeat(MAX_AUDIO_BASE64_CHARS) }, signedIn());

    expect(status).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/journal/transcribe: rate limits', () => {
  async function burst(headers: () => Record<string, string>, count: number): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop -- the limiter counts calls in order
      statuses.push((await post({ audioBase64: AUDIO }, headers())).status ?? 0);
    }
    return statuses;
  }

  it('gives anonymous uids from one IP one shared bucket', async () => {
    const ip = freshIp();
    // A new anonymous uid every call, as a token-minting caller would send.
    const statuses = await burst(() => as(`anon-m${++n}`, ip), 11);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    expect(transcribe).toHaveBeenCalledTimes(10);
  });

  it('keeps signed-in people on different IPs in separate buckets', async () => {
    const first = as(`tok-s${++n}`, freshIp());
    const second = as(`tok-s${++n}`, freshIp());

    expect(await burst(() => first, 11)).toContain(429);
    expect(await burst(() => second, 10)).toEqual(Array(10).fill(200));
  });

  it('keys a signed-in person by uid, not by IP', async () => {
    const ip = freshIp();
    const first = as(`tok-u${++n}`, ip);

    expect((await burst(() => first, 11))[10]).toBe(429);
    expect((await post({ audioBase64: AUDIO }, as(`tok-u${++n}`, ip))).status).toBe(200);
  });

  it('caps one IP across many accounts', async () => {
    const ip = freshIp();
    const accounts = [1, 2, 3].map(() => as(`tok-f${++n}`, ip));
    for (const account of accounts) {
      // eslint-disable-next-line no-await-in-loop -- the limiter counts calls in order
      expect(await burst(() => account, 10)).toEqual(Array(10).fill(200));
    }

    expect((await post({ audioBase64: AUDIO }, as(`tok-f${++n}`, ip))).status).toBe(429);
    expect(transcribe).toHaveBeenCalledTimes(30);
  });

  it('counts both buckets through the cross-instance async limiter', async () => {
    const headers = signedIn();
    await post({ audioBase64: AUDIO }, headers);

    expect(asyncLimiter.calls).toEqual(
      expect.arrayContaining([
        `expensive:journal-transcribe-ip:ip:${headers['x-forwarded-for']}`,
        expect.stringMatching(/^expensive:journal-transcribe:user:uid-tok-/),
      ])
    );
  });
});

describe('POST /api/journal/transcribe: IPv6 and mapped addresses', () => {
  async function burstFrom(ips: string[]): Promise<number[]> {
    const statuses: number[] = [];
    for (const ip of ips) {
      // eslint-disable-next-line no-await-in-loop -- the limiter counts calls in order
      statuses.push((await post({ audioBase64: AUDIO }, as(`anon-v${++n}`, ip))).status ?? 0);
    }
    return statuses;
  }

  it('gives anonymous callers rotating addresses inside one /64 one bucket', async () => {
    const prefix = `2001:db8:${(++n).toString(16)}:1`;
    const ips = Array.from({ length: 11 }, (_, i) => `${prefix}:${(i + 1).toString(16)}::${i + 7}`);

    const statuses = await burstFrom(ips);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    expect(transcribe).toHaveBeenCalledTimes(10);
  });

  it('keeps different /64s in different buckets', async () => {
    const site = `2001:db8:${(++n).toString(16)}`;
    await burstFrom(Array.from({ length: 11 }, (_, i) => `${site}:1::${i + 1}`));

    expect(await burstFrom([`${site}:2::1`])).toEqual([200]);
  });

  it('gives ::ffff:a.b.c.d and a.b.c.d one bucket', async () => {
    const v4 = `203.0.${Math.floor(++n / 250)}.${n % 250}`;
    await burstFrom(Array(10).fill(v4));

    expect(await burstFrom([`::ffff:${v4}`])).toEqual([429]);
  });
});
