/**
 * GET /api/custom-agents/voices reaches the voice library, not "get the agent named voices",
 * and still needs a signed-in caller.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { userId: 'u1' } as { userId: string } | null }));
vi.mock('../../auth-middleware.js', () => ({
  requireAuth: async (_req: IncomingMessage, res: ServerResponse) => {
    if (auth.user) return auth.user;
    res.writeHead(401);
    res.end();
    return null;
  },
}));
const getAgent = vi.hoisted(() => vi.fn());
vi.mock('../agent-routes.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  handleGetAgent: getAgent,
}));

const { handleCustomAgentRoutes } = await import('../index.js');
const { CUSTOM_AGENT_VOICE_CATALOG } =
  await import('../../../services/custom-agent/custom-agent-voice-catalog.js');

async function get(pathname: string) {
  let status = 0;
  let raw = '';
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  const req = { method: 'GET', headers: {} } as IncomingMessage;
  const handled = await handleCustomAgentRoutes(req, res, pathname, new URL(`http://x${pathname}`));
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

describe('GET /api/custom-agents/voices', () => {
  it('returns the voice library', async () => {
    auth.user = { userId: 'u1' };
    const r = await get('/api/custom-agents/voices');
    expect(r.status).toBe(200);
    expect(r.body.voices).toEqual(CUSTOM_AGENT_VOICE_CATALOG);
    expect(getAgent).not.toHaveBeenCalled();
  });

  it('still routes an agent id to get-agent', async () => {
    auth.user = { userId: 'u1' };
    getAgent.mockResolvedValueOnce(true);
    await get('/api/custom-agents/ca_123');
    expect(getAgent).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'u1', 'ca_123');
  });

  it('needs a signed-in caller', async () => {
    auth.user = null;
    expect((await get('/api/custom-agents/voices')).status).toBe(401);
  });
});
