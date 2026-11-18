/**
 * POST /api/session/accent takes a persona id from the client. For a persona
 * that speaks in a consented clone it answers "not localized" and never hands
 * the clone's voice id back, nor stores it as a pending voice change. Only the
 * token check and fetch are doubles. The voice id here is invented.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1', isAdmin: false, authMethod: 'firebase' })),
}));
vi.mock('../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => {
    throw new Error('no Firestore in this test');
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const { handleSessionAccentRoutes } = await import('../session-accent-routes.js');
const { getSessionAccent, clearSessionAccent } = await import('../../services/session/index.js');

const PATH = '/api/session/accent';

function request(method: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = PATH;
  req.headers = { authorization: 'Bearer token' };
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

async function call(method: string, body?: unknown) {
  const sent = { status: 200, raw: '' };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    end: vi.fn((data?: string) => {
      sent.raw = data ?? '';
    }),
  } as unknown as ServerResponse;
  await handleSessionAccentRoutes(request(method, body), res, PATH);
  return sent;
}

describe('POST /api/session/accent and a consented clone', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('CARTESIA_API_KEY', 'test-api-key');
    vi.stubEnv('SETH_TEAMMATE', 'on');
    vi.stubEnv('ROSTER_VOICE_SETH', 'fake-seth-id');
    clearSessionAccent('user-1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers not localized, without the voice id, for every accent', async () => {
    for (const accent of ['american', 'british']) {
      const sent = await call('POST', { accent, personaId: 'seth' });
      expect(sent.status).toBe(200);
      expect(sent.raw).not.toContain('fake-seth-id');
      const body = JSON.parse(sent.raw) as Record<string, unknown>;
      expect(body.isLocalized).toBe(false);
      expect(body).not.toHaveProperty('voiceId');
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stores no pending voice change, so GET never returns the clone', async () => {
    await call('POST', { accent: 'british', personaId: 'seth' });
    expect(getSessionAccent('user-1')).toBeUndefined();
    const sent = await call('GET');
    expect(sent.raw).not.toContain('fake-seth-id');
  });

  it('with SETH_TEAMMATE off, Seth has no voice: nothing stored, no voice id', async () => {
    vi.stubEnv('SETH_TEAMMATE', 'off');
    const sent = await call('POST', { accent: 'american', personaId: 'seth' });
    const body = JSON.parse(sent.raw) as Record<string, unknown>;
    expect(body.isLocalized).toBe(false);
    expect(body).not.toHaveProperty('voiceId');
    expect(getSessionAccent('user-1')).toBeUndefined();
  });
});
