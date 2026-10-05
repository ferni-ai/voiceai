/**
 * Twilio → UI-server conference-call callbacks.
 *
 * The voice agent's ConferenceCallManager tells Twilio to fetch TwiML from
 * /api/group/call/answer and to report call status to /api/group/call/status.
 * Both answered 401: the engagement router demands a signed-in user for every
 * /api/group path, and Twilio has none. These two paths must now be admitted
 * on a valid X-Twilio-Signature (and only on that), while every other
 * /api/group path still requires a user.
 *
 * The server below dispatches the way src/servers/api/index.ts does
 * (bindVerifiedIdentity → handleEngagementRoutes → handleGroupConversationRoutes),
 * and a source check pins that order. The callback URLs and the HTTP method
 * come from the REAL ConferenceCallManager (only the Twilio REST client is
 * faked), and signatures are computed by the real Twilio SDK.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Room } from '@livekit/rtc-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_TOKEN = 'test-twilio-auth-token';
const PUBLIC_BASE = 'https://api.ferni.ai';

const h = vi.hoisted(() => {
  process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
  const created: Array<Record<string, unknown>> = [];
  const logger = {
    debug: () => undefined,
    info: (..._args: unknown[]) => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: (): unknown => logger,
  };
  return { created, logger };
});

vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    calls: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        h.created.push(params);
        return { sid: 'CA0123456789abcdef0123456789abcdef' };
      }),
    },
  })),
}));

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/safe-logger.js')>();
  return { ...actual, getLogger: () => h.logger };
});

const USERS: Record<string, string> = { 'token-alice': 'alice' };
vi.mock('../../../../api/auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/auth-middleware.js')>();
  const verify = async (req: http.IncomingMessage) => {
    const userId = USERS[(req.headers.authorization ?? '').replace(/^Bearer /, '')];
    return userId ? { userId, isAdmin: false, isDevMode: false, authMethod: 'firebase' } : null;
  };
  return { ...actual, optionalAuthAsync: vi.fn(verify), rateLimit: vi.fn(() => false) };
});

const twilioSdk = await vi.importActual<typeof import('twilio')>('twilio');
const { bindVerifiedIdentity } = await import('../../request-identity.js');
const { handleEngagementRoutes } = await import('../../../../api/engagement-routes.js');
const { handleGroupConversationRoutes } =
  await import('../../../../api/group-conversation-handler.js');
const { createConferenceCallManager } =
  await import('../../../../agents/group-conversation/conference-call-manager.js');
type GroupConversationManager =
  import('../../../../agents/group-conversation/group-conversation-manager.js').GroupConversationManager;

let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    try {
      await bindVerifiedIdentity(req);
      const url = new URL(req.url || '/', 'http://local');
      if (await handleEngagementRoutes(req, res, url.pathname, url)) return;
      if (url.pathname.startsWith('/api/group/') && (await handleGroupConversationRoutes(req, res)))
        return;
      res.writeHead(404).end();
    } catch {
      if (!res.writableEnded) res.writeHead(500).end('{"error":"Internal server error"}');
    }
  });
  await new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', done);
  });
  ({ port } = server.address() as AddressInfo);
});

afterAll(async () => {
  await new Promise<void>((done) => {
    server.close(() => done());
  });
});

beforeEach(() => {
  h.created.length = 0;
});

interface Sent {
  status: number;
  type: string;
  body: string;
}

/**
 * Deliver a request for `publicUrl` the way it reaches Cloud Run: the original
 * Host, the scheme in x-forwarded-proto, the path and query untouched.
 */
function deliver(
  publicUrl: string,
  options: { method: string; form?: Record<string, string>; headers?: Record<string, string> }
): Promise<Sent> {
  const target = new URL(publicUrl);
  // The raw path and query: URL re-serializing would percent-encode characters
  // (e.g. the apostrophe encodeURIComponent leaves alone) and change what was signed.
  const path = publicUrl.slice(target.origin.length);
  const body = options.form ? new URLSearchParams(options.form).toString() : undefined;
  return new Promise((done, fail) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: options.method,
        path,
        headers: {
          host: target.host,
          'x-forwarded-proto': target.protocol.replace(':', ''),
          ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () =>
          done({ status: res.statusCode ?? 0, type: res.headers['content-type'] ?? '', body: text })
        );
      }
    );
    req.on('error', fail);
    req.end(body);
  });
}

const sign = (url: string, params: Record<string, string> = {}): string =>
  twilioSdk.getExpectedTwilioSignature(TEST_TOKEN, url, params);

/** What Twilio posts with each request about a call. */
const callFields = (status: string): Record<string, string> => ({
  AccountSid: 'AC00000000000000000000000000000000',
  CallSid: 'CA0123456789abcdef0123456789abcdef',
  CallStatus: status,
  Direction: 'outbound-api',
  From: '+15550000000',
  To: '+15551234567',
});

/** Dial out with the real ConferenceCallManager; return the request it made of Twilio. */
async function placeCall(): Promise<{ url: string; method: string; statusCallback: string }> {
  const manager = createConferenceCallManager({
    room: { name: 'room-abc' } as unknown as Room,
    sessionId: 'group_1',
    userId: 'alice',
    webhookBaseUrl: PUBLIC_BASE,
    twilio: {
      accountSid: 'AC00000000000000000000000000000000',
      authToken: TEST_TOKEN,
      phoneNumber: '+15550000000',
    },
    manager: {} as unknown as GroupConversationManager,
  });
  const result = await manager.addParticipant({
    phoneNumber: '+15551234567',
    name: "Sam O'Neil",
    introduction: 'Hi Sam! Alice added you to the call.',
    announceToRoom: false,
  });
  expect(result.success).toBe(true);
  expect(h.created).toHaveLength(1);
  const params = h.created[0];
  return {
    url: String(params.url),
    // Twilio's documented default for the TwiML url is POST.
    method: typeof params.method === 'string' ? params.method : 'POST',
    statusCallback: String(params.statusCallback),
  };
}

describe('Twilio callbacks under /api/group', () => {
  it('answer: a signed request for the URL the agent gave Twilio returns TwiML', async () => {
    const call = await placeCall();
    expect(call.url).toContain('/api/group/call/answer?');
    const form = callFields('in-progress');

    const res = await deliver(call.url, {
      method: call.method,
      form,
      headers: { 'x-twilio-signature': sign(call.url, form) },
    });

    expect(res.status).toBe(200);
    expect(res.type).toContain('text/xml');
    expect(res.body).toContain(
      '<Say voice="Polly.Joanna">Hi Sam! Alice added you to the call.</Say>'
    );
    expect(res.body).toContain('<Sip>sip:room-abc@');
  });

  it('answer: a signed GET (query only, no body params) returns TwiML', async () => {
    const url = `${PUBLIC_BASE}/api/group/call/answer?roomName=room-abc&name=Sam&intro=Hello%20Sam`;

    const res = await deliver(url, { method: 'GET', headers: { 'x-twilio-signature': sign(url) } });

    expect(res.status).toBe(200);
    expect(res.type).toContain('text/xml');
    expect(res.body).toContain('<Say voice="Polly.Joanna">Hello Sam</Say>');
  });

  it('status: a signed form POST is accepted and the status is handled', async () => {
    const call = await placeCall();
    expect(call.statusCallback).toBe(`${PUBLIC_BASE}/api/group/call/status`);
    const form = callFields('ringing');
    const info = vi.spyOn(h.logger, 'info');

    const res = await deliver(call.statusCallback, {
      method: 'POST',
      form,
      headers: { 'x-twilio-signature': sign(call.statusCallback, form) },
    });

    expect(res.status).toBe(200);
    expect(info).toHaveBeenCalledWith(
      { callSid: form.CallSid, status: 'ringing' },
      '📞 Call status update'
    );
  });

  it('a bad signature is refused with 403', async () => {
    const url = `${PUBLIC_BASE}/api/group/call/status`;
    const form = callFields('completed');
    const forged = twilioSdk.getExpectedTwilioSignature('not-the-token', url, form);

    const status = await deliver(url, {
      method: 'POST',
      form,
      headers: { 'x-twilio-signature': forged },
    });
    // Signed for different fields than the ones posted.
    const tampered = await deliver(url, {
      method: 'POST',
      form: { ...form, CallStatus: 'failed' },
      headers: { 'x-twilio-signature': sign(url, form) },
    });
    const answerUrl = `${PUBLIC_BASE}/api/group/call/answer?roomName=room-abc&name=Sam`;
    const answer = await deliver(`${answerUrl}&intro=Injected`, {
      method: 'GET',
      headers: { 'x-twilio-signature': sign(answerUrl) },
    });

    expect([status.status, tampered.status, answer.status]).toEqual([403, 403, 403]);
    expect(answer.body).not.toContain('Injected');
  });

  it('a missing signature is refused, even from a signed-in user', async () => {
    const url = `${PUBLIC_BASE}/api/group/call/status`;
    const anonymous = await deliver(url, { method: 'POST', form: callFields('completed') });
    const alice = await deliver(url, {
      method: 'POST',
      form: callFields('completed'),
      headers: { authorization: 'Bearer token-alice' },
    });
    const answer = await deliver(`${PUBLIC_BASE}/api/group/call/answer?roomName=r`, {
      method: 'GET',
      headers: { authorization: 'Bearer token-alice' },
    });

    expect(anonymous.status).toBe(403);
    expect(alice.status).toBe(403);
    expect(answer.status).toBe(403);
  });

  it('every other /api/group path still requires a user, signature or not', async () => {
    const sessions = `${PUBLIC_BASE}/api/group/sessions`;
    const add = `${PUBLIC_BASE}/api/group/call/add`;
    const form = { phoneNumber: '+15551234567', name: 'Sam' };

    const unsignedSessions = await deliver(sessions, { method: 'GET' });
    const signedSessions = await deliver(sessions, {
      method: 'GET',
      headers: { 'x-twilio-signature': sign(sessions) },
    });
    const signedAdd = await deliver(add, {
      method: 'POST',
      form,
      headers: { 'x-twilio-signature': sign(add, form) },
    });
    // A look-alike path is not a callback either.
    const lookalike = await deliver(`${PUBLIC_BASE}/api/group/call/status/x`, { method: 'POST' });

    expect(unsignedSessions.status).toBe(401);
    expect(signedSessions.status).toBe(401);
    expect(signedAdd.status).toBe(401);
    expect(lookalike.status).toBe(401);
  });

  it('with no Twilio auth token configured, even a well-formed signature is refused', async () => {
    const url = `${PUBLIC_BASE}/api/group/call/status`;
    const form = callFields('completed');
    vi.stubEnv('TWILIO_AUTH_TOKEN', ''); // configured as nothing
    try {
      const res = await deliver(url, {
        method: 'POST',
        form,
        headers: { 'x-twilio-signature': sign(url, form) },
      });
      expect(res.status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('the UI server dispatches these paths through this chain', () => {
  const source = readFileSync(resolve(__dirname, '../../index.ts'), 'utf8');

  it('binds identity, then the engagement router, then the group-conversation router', () => {
    const identity = source.indexOf('await bindVerifiedIdentity(req)');
    const engagement = source.indexOf(
      'await handleEngagementRoutes(req, res, pathname, parsedUrl)'
    );
    const group = source.indexOf('await handleGroupConversationRoutes(req, res)');

    expect(identity).toBeGreaterThan(-1);
    expect(engagement).toBeGreaterThan(identity);
    expect(group).toBeGreaterThan(engagement);
  });
});
