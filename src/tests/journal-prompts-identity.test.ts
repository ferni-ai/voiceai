/**
 * Journal prompt generation keys its per-user state on the verified caller.
 *
 * POST /api/journal/prompt(s) are open to anonymous visitors, but the userId
 * they pass to the prompt engine keys that user's "already shown" prompt
 * history. It used to come from body.userId, so anyone could write into
 * another user's prompt history by naming them. Now it is the verified caller
 * bound by bindVerifiedIdentity, or 'anonymous'; a body userId is ignored.
 *
 * Drives the real route; only the prompt engine (the data side) is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const prompts = vi.hoisted(() => ({
  generatePrompts: vi.fn(),
  getBestPrompt: vi.fn(),
}));
vi.mock('../services/trust-systems/journaling-prompts.js', () => prompts);
vi.mock('../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: vi.fn(),
}));

const { handleJournalRoutes } = await import('../api/journal-routes.js');

/** `verified` is the uid bindVerifiedIdentity bound from a verified token. */
async function post(path: string, body: Record<string, unknown>, verified: string | null) {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = verified ? { 'x-firebase-uid': verified } : {};
  stream.end(JSON.stringify(body));
  const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
  await handleJournalRoutes(req, res, path);
}

function contextUser(fn: ReturnType<typeof vi.fn>): unknown {
  return (fn.mock.calls[0]?.[0] as { userId?: string } | undefined)?.userId;
}

describe('journal prompts use the verified caller as the prompt-history key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prompts.getBestPrompt.mockReturnValue({ id: 'p1', category: 'reflection' });
    prompts.generatePrompts.mockReturnValue([]);
  });

  it('POST /api/journal/prompt: signed-in alice naming bob is keyed to alice', async () => {
    await post('/api/journal/prompt', { userId: 'bob', mood: 'calm' }, 'alice');

    expect(contextUser(prompts.getBestPrompt)).toBe('alice');
  });

  it('POST /api/journal/prompts: signed-in alice naming bob is keyed to alice', async () => {
    await post('/api/journal/prompts', { userId: 'bob', count: 2 }, 'alice');

    expect(contextUser(prompts.generatePrompts)).toBe('alice');
  });

  it('an anonymous visitor naming bob is keyed to anonymous, not bob', async () => {
    await post('/api/journal/prompt', { userId: 'bob' }, null);

    expect(contextUser(prompts.getBestPrompt)).toBe('anonymous');
  });
});
