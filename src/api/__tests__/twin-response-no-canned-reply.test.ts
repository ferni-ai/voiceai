/**
 * POST /api/journal/twin-response never invents a past-self reply.
 *
 * Before: with no OPENAI_API_KEY (or when OpenAI failed), the route answered 200
 * with a canned line in the person's own voice, e.g. "I've felt that too.
 * Remember when I wrote: ..." built from their journal. Now it answers 503 and
 * the client shows an error notice instead.
 *
 * Drives the real route; only the audio-transcription import is mocked.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: vi.fn(),
}));

const { handleJournalRoutes } = await import('../journal-routes.js');

async function post(body: Record<string, unknown>) {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/journal/twin-response';
  req.headers = {};
  stream.end(JSON.stringify(body));
  const writeHead = vi.fn();
  const end = vi.fn();
  const res = { setHeader: vi.fn(), writeHead, end } as unknown as ServerResponse;
  await handleJournalRoutes(req, res, '/api/journal/twin-response');
  const status = (writeHead.mock.calls[0]?.[0] as number | undefined) ?? (res as { statusCode?: number }).statusCode;
  return { status, body: JSON.parse(String(end.mock.calls[0]?.[0] ?? '{}')) as Record<string, unknown> };
}

const request = {
  userMessage: 'I feel stuck, do you remember last spring?',
  profile: {
    name: 'Sam',
    mannerisms: ['honestly,'],
    values: ['honesty'],
    communicationStyle: 'direct',
    philosophy: 'keep going',
    passions: [],
  },
  relevantJournals: [{ content: 'Spring was rough but we kept walking every morning', date: '2026-04-01' }],
  keyThemes: [],
};

describe('POST /api/journal/twin-response', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('answers 503 with no reply when no model is configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const { status, body } = await post(request);

    expect(status).toBe(503);
    expect(body).not.toHaveProperty('response');
    expect(JSON.stringify(body)).not.toMatch(/felt that too|kept walking|keep going|honestly/);
  });
});
