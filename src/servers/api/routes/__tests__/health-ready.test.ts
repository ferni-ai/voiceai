/**
 * /health/ready on the API server. The blue-green deploy waits on it, and it
 * returned 503 for a healthy production server: the tool registry only loads
 * in the voice agent, Gemini runs through Vertex with no API key, and the
 * Cartesia key was not mounted. Real outages must still fail it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listCollections = vi.fn(async () => [{ id: 'c' }]);
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    listCollections = listCollections;
  },
}));
vi.mock('../../../../tools/registry/index.js', () => ({
  toolRegistry: { getStats: () => ({ totalTools: 0 }), isInitialized: () => false },
}));
vi.mock('../../../../services/persistence/index.js', () => ({
  getAllStats: () => ({ users: {} }),
}));
vi.mock('../../services/spotify.js', () => ({}));
vi.mock('../../services/plaid.js', () => ({}));

const ENV = { ...process.env };

async function ready(env: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = {
    ...ENV,
    LIVEKIT_URL: 'wss://x.livekit.cloud',
    LIVEKIT_API_KEY: 'k',
    LIVEKIT_API_SECRET: 's',
    ...env,
  };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const { handleHealthRoutes } = await import('../health.js');
  const out = { status: 0, body: '' };
  const res = {
    writeHead: (s: number) => (out.status = s),
    setHeader: vi.fn(),
    end: (b?: string) => (out.body = b ?? ''),
  } as unknown as ServerResponse;
  await handleHealthRoutes({ method: 'GET', headers: {} } as IncomingMessage, res, '/health/ready');
  return {
    status: out.status,
    json: JSON.parse(out.body) as { ready: boolean; checks: Record<string, { status: string }> },
  };
}

describe('/health/ready on the API server', () => {
  beforeEach(() => {
    listCollections.mockResolvedValue([{ id: 'c' }]);
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('is ready in production shape: Vertex Gemini, no tools loaded here, Cartesia key mounted', async () => {
    const r = await ready({
      OPENAI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      USE_VERTEX_AI: undefined,
      CARTESIA_API_KEY: 'ck',
    });
    expect(r.status).toBe(200);
    expect(r.json.ready).toBe(true);
    expect(r.json.checks.tools.status).toBe('ok');
    expect(r.json.checks.llm.status).toBe('ok');
  });

  it('still fails when Firestore is down', async () => {
    listCollections.mockRejectedValue(new Error('unavailable'));
    const r = await ready({ CARTESIA_API_KEY: 'ck' });
    expect(r.status).toBe(503);
    expect(r.json.checks.firestore.status).toBe('error');
  });

  it('still fails without TTS or with Vertex explicitly off and no key', async () => {
    expect((await ready({ CARTESIA_API_KEY: undefined })).status).toBe(503);
    const r = await ready({
      CARTESIA_API_KEY: 'ck',
      USE_VERTEX_AI: 'false',
      OPENAI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
    });
    expect(r.status).toBe(503);
    expect(r.json.checks.llm.status).toBe('error');
  });

  it('still fails when LiveKit is not configured', async () => {
    const r = await ready({ CARTESIA_API_KEY: 'ck', LIVEKIT_URL: undefined });
    expect(r.status).toBe(503);
  });
});
