/**
 * POST /api/memory/feedback acts on the verified caller's memories only.
 *
 * Before: the route used the sync optionalAuth, which never verifies Firebase
 * tokens, and fell back to body.userId — so anyone, signed in or not, could
 * record feedback on and reinforce another user's memories by naming them.
 *
 * Drives the real route; only the auth verifier and the memory service are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const memory = vi.hoisted(() => ({
  recordFeedback: vi.fn(),
  reinforceMemory: vi.fn(),
}));
vi.mock('../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => memory,
}));

// The verifier: "Bearer <uid>" is a verified token for <uid>.
vi.mock('../auth-middleware.js', () => ({
  optionalAuth: vi.fn(() => null),
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: header.slice(7), isAdmin: false };
  }),
}));

const { handleMemoryRoutes } = await import('../memory-routes.js');

async function feedback(body: Record<string, unknown>, caller: string | null): Promise<number> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/memory/feedback';
  req.headers = caller ? { authorization: `Bearer ${caller}` } : {};
  stream.end(JSON.stringify(body));

  let status = 200;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await handleMemoryRoutes(req, res, '/api/memory/feedback');
  return status;
}

const HELPFUL = { memoryId: 'mem-1', action: 'helpful' };

describe('POST /api/memory/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.reinforceMemory.mockResolvedValue(undefined);
  });

  it('signed-in alice naming bob gets 403 and bob’s memory is not reinforced', async () => {
    const status = await feedback({ ...HELPFUL, userId: 'bob' }, 'alice');

    expect(status).toBe(403);
    expect(memory.recordFeedback).not.toHaveBeenCalled();
    expect(memory.reinforceMemory).not.toHaveBeenCalled();
  });

  it('with no credentials, naming bob gets 401 and touches nothing', async () => {
    const status = await feedback({ ...HELPFUL, userId: 'bob' }, null);

    expect(status).toBe(401);
    expect(memory.recordFeedback).not.toHaveBeenCalled();
    expect(memory.reinforceMemory).not.toHaveBeenCalled();
  });

  it('alice giving feedback on her own memory (as the web sends it) still works', async () => {
    const status = await feedback({ ...HELPFUL, userId: 'alice' }, 'alice');

    expect(status).toBe(200);
    expect(memory.recordFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'alice', memoryId: 'mem-1' })
    );
    expect(memory.reinforceMemory).toHaveBeenCalledWith('alice', 'mem-1', 1.2);
  });
});
