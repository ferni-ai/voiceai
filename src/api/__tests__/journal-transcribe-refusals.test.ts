/**
 * How the two routes that transcribe answer the audio budget's refusals, and
 * that the custom-agent journal route now has the transcribe per-key limits.
 * The transcriber is mocked to throw the budget's errors. Only Date is faked.
 */
/* eslint-disable no-await-in-loop -- the limiter counts calls in order */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const m = vi.hoisted(() => ({ transcribe: vi.fn(), getAgent: vi.fn() }));

vi.mock('../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: m.transcribe,
  extractMetadata: vi.fn(async () => ({})),
}));
vi.mock('../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: m.getAgent,
  addMemoryToAgent: vi.fn(async () => true),
}));
vi.mock('../../services/custom-agent/gcs-storage-service.js', () => ({
  uploadVoiceJournalEntry: vi.fn(async () => null),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  claimsFirebaseIssuer: () => false,
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-') ? { uid: `uid-${token}`, claims: {}, isAnonymous: false } : null
  ),
}));

const { handleJournalRoutes } = await import('../journal-routes.js');
const { handleCreateJournalEntry } = await import('../custom-agent/journal-routes.js');
const { ClipTooLongError, TranscribeBudgetSpentError } =
  await import('../../services/custom-agent/transcribe-budget.js');

const AUDIO = Buffer.from('a short journal clip').toString('base64');

function request(path: string, body: unknown, headers: Record<string, string>) {
  const stream = new PassThrough();
  stream.end(JSON.stringify(body));
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = headers;
  const headersSet: Record<string, unknown> = {};
  const writeHead = vi.fn();
  const end = vi.fn((_chunk?: unknown) => undefined);
  const res = {
    setHeader: vi.fn((k: string, v: unknown) => {
      headersSet[k.toLowerCase()] = v;
    }),
    writeHead,
    end,
    once: vi.fn(),
  } as unknown as ServerResponse;
  const result = () => ({
    status: writeHead.mock.calls[0]?.[0] as number | undefined,
    body: JSON.parse(String(end.mock.calls[0]?.[0] ?? '{}')) as Record<string, unknown>,
    headers: headersSet,
  });
  return { req, res, result };
}

async function transcribe(token: string, ip: string) {
  const path = '/api/journal/transcribe';
  const r = request(
    path,
    { audioBase64: AUDIO },
    { authorization: `Bearer ${token}`, 'x-forwarded-for': ip }
  );
  await handleJournalRoutes(r.req, r.res, path);
  return r.result();
}

async function agentEntry(userId: string, ip: string, isAnonymous = false) {
  const r = request(
    '/api/custom-agents/twin-1/journal/entry',
    { audio: AUDIO },
    { 'x-forwarded-for': ip }
  );
  await handleCreateJournalEntry(r.req, r.res, userId, 'twin-1', isAnonymous);
  return r.result();
}

let now = Date.parse('2026-10-16T09:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  now += 2 * 60 * 60_000;
  vi.setSystemTime(now);
  m.transcribe.mockReset().mockResolvedValue('we counted eleven herons');
  m.getAgent.mockReset().mockResolvedValue({ id: 'twin-1', type: 'twin' });
});
afterEach(() => vi.useRealTimers());

describe('POST /api/journal/transcribe', () => {
  it('answers a clip over the cap with a warm 413', async () => {
    m.transcribe.mockRejectedValue(new ClipTooLongError(20_000, 10));
    const { status, body } = await transcribe('tok-long', '192.0.2.1');
    expect(status).toBe(413);
    expect(body).toMatchObject({ reason: 'too_long', maxMinutes: 10, transcript: '' });
    expect(String(body.error)).toContain('under 10 minutes');
  });

  it('answers a spent budget with 503 and Retry-After', async () => {
    m.transcribe.mockRejectedValue(new TranscribeBudgetSpentError(1200));
    const { status, headers } = await transcribe('tok-busy', '192.0.2.2');
    expect(status).toBe(503);
    expect(headers['retry-after']).toBe(1200);
  });
});

describe('POST /api/custom-agents/:id/journal/entry', () => {
  it('answers the same refusals instead of a 500', async () => {
    m.transcribe.mockRejectedValueOnce(new ClipTooLongError(20_000, 10));
    expect((await agentEntry('uid-a', '192.0.2.10')).status).toBe(413);
    m.transcribe.mockRejectedValueOnce(new TranscribeBudgetSpentError(60));
    expect((await agentEntry('uid-a', '192.0.2.10')).status).toBe(503);
  });

  it('has the per-person minute limit before it reads or transcribes anything', async () => {
    const statuses: Array<number | undefined> = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await agentEntry('uid-limited', `192.0.2.${20 + i}`)).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(m.transcribe).toHaveBeenCalledTimes(10);
  });

  it('limits anonymous callers by address, since their uids are free to mint', async () => {
    const statuses: Array<number | undefined> = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await agentEntry(`uid-anon-${i}`, '192.0.2.99', true)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
