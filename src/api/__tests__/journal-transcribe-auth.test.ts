/**
 * POST /api/journal/transcribe needs a signed-in person, is rate limited per
 * person, and refuses oversize audio before decoding it.
 *
 * It had no auth: with a working transcriber behind it, anyone could use it as
 * a free paid-transcription proxy. Drives the real route and the real
 * requireAuth; only Firebase token checks and the transcriber are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const transcribe = vi.hoisted(() => vi.fn());

vi.mock('../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: transcribe,
}));

vi.mock('../../services/identity/firebase-auth.js', () => ({
  claimsFirebaseIssuer: () => false,
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));

const { handleJournalRoutes } = await import('../journal-routes.js');
const { MAX_AUDIO_BASE64_CHARS } = await import('../journal-transcribe-route.js');

const PATH = '/api/journal/transcribe';
const AUDIO = Buffer.from('a short journal clip').toString('base64');

async function post(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number | undefined; body: Record<string, unknown> }> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = PATH;
  req.headers = headers;
  stream.end(JSON.stringify(body));
  const writeHead = vi.fn();
  const end = vi.fn();
  const res = { setHeader: vi.fn(), writeHead, end } as unknown as ServerResponse;
  await handleJournalRoutes(req, res, PATH);
  const status =
    (writeHead.mock.calls[0]?.[0] as number | undefined) ??
    (res as { statusCode?: number }).statusCode;
  return {
    status,
    body: JSON.parse(String(end.mock.calls[0]?.[0] ?? '{}')) as Record<string, unknown>,
  };
}

let user = 0;
/** A fresh person per test, so the per-person rate limit never leaks between tests. */
function signedIn(name = `p${++user}`): Record<string, string> {
  return { authorization: `Bearer tok-${name}` };
}

beforeEach(() => {
  transcribe.mockReset();
  transcribe.mockResolvedValue('I walked by the water today');
});

describe('POST /api/journal/transcribe', () => {
  it('answers 401 without a token and never transcribes', async () => {
    const { status } = await post({ audioBase64: AUDIO, mimeType: 'audio/webm' });

    expect(status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('answers 401 for a token that does not verify', async () => {
    const { status } = await post({ audioBase64: AUDIO }, { authorization: 'Bearer forged' });

    expect(status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('transcribes for a signed-in person', async () => {
    const { status, body } = await post({ audioBase64: AUDIO, mimeType: 'audio/mp4' }, signedIn());

    expect(status).toBe(200);
    expect(body).toEqual({ transcript: 'I walked by the water today', success: true });
    expect(transcribe).toHaveBeenCalledTimes(1);
    const [buffer, mimeType] = transcribe.mock.calls[0] as [ArrayBuffer, string];
    expect(Buffer.from(buffer).toString('base64')).toBe(AUDIO);
    expect(mimeType).toBe('audio/mp4');
  });

  it('answers 413 for audio over the cap and never transcribes', async () => {
    const { status } = await post(
      { audioBase64: 'A'.repeat(MAX_AUDIO_BASE64_CHARS + 4) },
      signedIn()
    );

    expect(status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('answers 413 from the declared body size before reading it', async () => {
    const { status } = await post(
      { audioBase64: AUDIO },
      { ...signedIn(), 'content-length': String(MAX_AUDIO_BASE64_CHARS * 2) }
    );

    expect(status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('accepts audio right at the cap', async () => {
    const { status } = await post({ audioBase64: 'A'.repeat(MAX_AUDIO_BASE64_CHARS) }, signedIn());

    expect(status).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it('rate limits each person on the expensive tier, without limiting anyone else', async () => {
    const heavy = signedIn();
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop -- the limiter counts calls in order
      expect((await post({ audioBase64: AUDIO }, heavy)).status).toBe(200);
    }

    expect((await post({ audioBase64: AUDIO }, heavy)).status).toBe(429);
    expect(transcribe).toHaveBeenCalledTimes(10);
    expect((await post({ audioBase64: AUDIO }, signedIn())).status).toBe(200);
  });
});
