/**
 * /ws/cognitive and GET /api/cognitive* on the agent's health server stream
 * every user's voice_emotion and user_style events (each names its userId).
 * They used to answer anyone, with no credentials. Now only a verified admin
 * (Firebase custom claim `admin`) gets them: no token or a bad token is 401, a
 * verified non-admin is 403, and neither receives a single event.
 *
 * These tests start the REAL health server (startHealthCheckServer on port 0),
 * which wires the REAL cognitive WebSocket, and drive it over real sockets.
 * Only the Firebase token verifier is mocked. Events go through the real
 * in-memory cognitive broadcast.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const TOK_ADMIN = 'jwtAdmin.payload.sig';
const TOK_USER = 'jwtUser.payload.sig';
const verifyFirebaseToken = vi.fn(async (token: string) => {
  if (token === 'tok-expired') return { expired: true as const };
  if (token === TOK_ADMIN) return { uid: 'admin-1', claims: { admin: true }, isAnonymous: false };
  if (token === TOK_USER) return { uid: 'user-A', claims: {}, isAnonymous: false };
  return null;
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({ verifyFirebaseToken }));

const { startHealthCheckServer } = await import('../health-server.js');
const { broadcastVoiceEmotion } = await import('../../../services/cognitive-broadcast.js');
const { shutdownCognitiveWebSocket } = await import('../../../services/cognitive-websocket.js');

type Msg = Record<string, unknown>;
interface Outcome {
  status: number;
  ws?: WebSocket;
  messages: Msg[];
}

let server: Server;
let port = 0;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  process.env['PORT'] = '0';
  server = startHealthCheckServer('cognitive-ws-test');
  // The cognitive socket is attached (lazily) once the server is listening.
  await vi.waitFor(
    () => {
      if (!server.listening || server.listenerCount('upgrade') === 0) throw new Error('not yet');
    },
    { timeout: 10000, interval: 20 }
  );
  port = (server.address() as AddressInfo).port;
  // A user's emotional state is already in the history before anyone connects.
  broadcastVoiceEmotion('user-A', 'anxious', 0.91, 'worsening');
});

afterAll(async () => {
  sockets.splice(0).forEach((ws) => ws.terminate());
  shutdownCognitiveWebSocket();
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  delete process.env['PORT'];
});

function connect(token?: string): Promise<Outcome> {
  const protocols = token ? ['ferni.v1', `bearer.${token}`] : undefined;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/cognitive`, protocols);
    const messages: Msg[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString()) as Msg));
    ws.on('open', () => {
      sockets.push(ws);
      resolve({ status: 101, ws, messages });
    });
    ws.on('unexpected-response', (req, res) => {
      req.destroy();
      resolve({ status: res.statusCode ?? 0, messages });
    });
    ws.on('error', reject);
  });
}

function get(path: string, token?: string): Promise<globalThis.Response> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`http://127.0.0.1:${port}${path}`, { headers });
}

describe('/ws/cognitive (admin only)', () => {
  it.each([
    ['no token', undefined],
    ['an expired token', 'tok-expired'],
    ['a forged token', 'forged.token.sig'],
  ])('refuses %s with 401 and sends no events', async (_label, token) => {
    const out = await connect(token);
    expect(out.status).toBe(401);
    expect(out.ws).toBeUndefined();
    expect(out.messages).toEqual([]);
  });

  it('refuses a verified non-admin with 403 and sends no events', async () => {
    const out = await connect(TOK_USER);
    expect(verifyFirebaseToken).toHaveBeenCalledWith(TOK_USER);
    expect(out.status).toBe(403);
    expect(out.ws).toBeUndefined();
    expect(out.messages).toEqual([]);
  });

  it('streams every user’s events to a verified admin, on ferni.v1', async () => {
    const { status, ws, messages } = await connect(TOK_ADMIN);
    expect(status).toBe(101);
    // The server selects the non-secret protocol, never echoing the bearer entry.
    expect(ws?.protocol).toBe('ferni.v1');

    // History on connect carries the event broadcast before the admin joined.
    const history = await vi.waitFor(() => {
      const hit = messages.find((m) => m.type === 'history');
      if (!hit) throw new Error('no history yet');
      return hit.data as Array<Record<string, unknown>>;
    });
    expect(history).toContainEqual(
      expect.objectContaining({ type: 'voice_emotion', userId: 'user-A', emotion: 'anxious' })
    );

    // And live events arrive as they are broadcast.
    broadcastVoiceEmotion('user-B', 'calm', 0.7);
    const live = await vi.waitFor(() => {
      const hit = messages.find(
        (m) => m.type === 'event' && (m.event as Msg | undefined)?.userId === 'user-B'
      );
      if (!hit) throw new Error('no live event yet');
      return hit.event as Msg;
    });
    expect(live).toMatchObject({ type: 'voice_emotion', userId: 'user-B', emotion: 'calm' });
  });
});

describe('GET /api/cognitive/history (admin only, same data over HTTP)', () => {
  it('answers 401 without credentials', async () => {
    const res = await get('/api/cognitive/history');
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('user-A');
  });

  it('answers 403 to a verified non-admin', async () => {
    const res = await get('/api/cognitive/history', TOK_USER);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('user-A');
  });

  it('returns the history to a verified admin', async () => {
    const res = await get('/api/cognitive/history', TOK_ADMIN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data).toContainEqual(
      expect.objectContaining({ type: 'voice_emotion', userId: 'user-A' })
    );
  });
});
