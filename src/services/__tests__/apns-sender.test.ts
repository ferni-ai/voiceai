/**
 * The APNs sender (apns-sender.ts): what goes to Apple for one push, how the
 * provider token is reused, which answers mean "forget this token", and the
 * HTTP/2 transport against a local HTTP/2 server. No call reaches Apple.
 */
import { generateKeyPairSync } from 'node:crypto';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  APNS_ORIGINS,
  ApnsSender,
  apnsConfig,
  http2Transport,
  type ApnsTransport,
} from '../apns-sender.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const CONFIG = {
  p8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  keyId: 'KEY123',
  teamId: 'XT8W26YE9U',
  topic: 'com.sethdford.ferni',
};
const TOKEN = 'ab'.repeat(32);
const ALERT = { title: 'Ferni', body: 'How did the interview go?', threadId: 'ferni_checkin' };

type Sent = Parameters<ApnsTransport>[0];
let sent: Sent[];
let reply: { status: number; body: string } | Error;
const transport: ApnsTransport = async (req) => {
  sent.push(req);
  if (reply instanceof Error) throw reply;
  return reply;
};
let clock: number;
const sender = () => new ApnsSender(CONFIG, transport, APNS_ORIGINS, () => clock);

beforeEach(() => {
  sent = [];
  reply = { status: 200, body: '' };
  clock = Date.UTC(2026, 9, 18, 12);
});

describe('apnsConfig', () => {
  const env = {
    APNS_KEY_P8: 'k',
    APNS_KEY_ID: 'i',
    APNS_TEAM_ID: 't',
    APNS_TOPIC: 'com.sethdford.ferni',
  };
  it('needs all four secrets', () => {
    expect(apnsConfig(env)).not.toBeNull();
    for (const name of Object.keys(env)) {
      expect(apnsConfig({ ...env, [name]: '' }), name).toBeNull();
    }
  });
});

describe('ApnsSender.send', () => {
  it('posts one alert to the device on the right host, signed with the team key', async () => {
    const result = await sender().send({ token: TOKEN, environment: 'production' }, ALERT);

    expect(result).toEqual({ ok: true, status: 200, dead: false });
    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req.origin).toBe('https://api.push.apple.com');
    expect(req.path).toBe(`/3/device/${TOKEN}`);
    expect(req.headers).toMatchObject({
      'apns-topic': 'com.sethdford.ferni',
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });
    const jwt = req.headers.authorization.replace(/^bearer /, '');
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    const { payload } = await jwtVerify(jwt, publicKey, {
      issuer: 'XT8W26YE9U',
      currentDate: new Date(clock),
    });
    expect(payload.iat).toBe(Math.floor(clock / 1000));
    expect(JSON.parse(req.body)).toEqual({
      aps: {
        alert: { title: 'Ferni', body: 'How did the interview go?' },
        sound: 'default',
        'thread-id': 'ferni_checkin',
      },
    });
  });

  it('sends a development build to the sandbox host', async () => {
    await sender().send({ token: TOKEN, environment: 'sandbox' }, ALERT);
    expect(sent[0].origin).toBe('https://api.sandbox.push.apple.com');
  });

  it('reuses the provider token for 50 minutes, then signs a new one', async () => {
    const s = sender();
    await s.send({ token: TOKEN, environment: 'production' }, ALERT);
    clock += 49 * 60_000;
    await s.send({ token: TOKEN, environment: 'production' }, ALERT);
    clock += 2 * 60_000;
    await s.send({ token: TOKEN, environment: 'production' }, ALERT);

    const [a, b, c] = sent.map((r) => r.headers.authorization);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it('signs a new provider token after Apple calls it expired', async () => {
    const s = sender();
    reply = { status: 403, body: '{"reason":"ExpiredProviderToken"}' };
    await s.send({ token: TOKEN, environment: 'production' }, ALERT);
    clock += 1000;
    reply = { status: 200, body: '' };
    await s.send({ token: TOKEN, environment: 'production' }, ALERT);
    expect(sent[1].headers.authorization).not.toBe(sent[0].headers.authorization);
  });

  it.each([
    [410, 'Unregistered', true],
    [400, 'BadDeviceToken', true],
    [400, 'DeviceTokenNotForTopic', true],
    [400, 'PayloadTooLarge', false],
    [429, 'TooManyRequests', false],
    [500, 'InternalServerError', false],
  ])('a %i %s is %s for forgetting the token', async (status, reason, dead) => {
    reply = { status, body: JSON.stringify({ reason }) };
    const result = await sender().send({ token: TOKEN, environment: 'production' }, ALERT);
    expect(result).toEqual({ ok: false, status, reason, dead });
  });

  it("reports a network failure without throwing and doesn't forget the token", async () => {
    reply = new Error('ECONNRESET');
    const result = await sender().send({ token: TOKEN, environment: 'production' }, ALERT);
    expect(result).toMatchObject({ ok: false, dead: false });
  });
});

describe('http2Transport', () => {
  const seen: Array<{ headers: http2.IncomingHttpHeaders; body: string }> = [];
  let server: http2.Http2Server;
  let origin: string;
  const sessions = new Set<http2.ServerHttp2Session>();

  beforeAll(async () => {
    server = http2.createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (c: string) => (body += c));
      req.on('end', () => {
        seen.push({ headers: req.headers, body });
        const gone = req.headers[':path']?.includes('dead');
        res.writeHead(gone ? 410 : 200);
        res.end(gone ? '{"reason":"Unregistered"}' : '');
      });
    });
    // The transport keeps its connection open for reuse, so close() waits on it.
    server.on('session', (session) => sessions.add(session));
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const session of sessions) session.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('carries the request over HTTP/2 and returns the status and body', async () => {
    const t = http2Transport();
    const ok = await t({
      origin,
      path: '/3/device/abc',
      headers: { 'apns-topic': 'x' },
      body: '{}',
    });
    const gone = await t({ origin, path: '/3/device/dead', headers: {}, body: '{}' });

    expect(ok).toEqual({ status: 200, body: '' });
    expect(gone).toEqual({ status: 410, body: '{"reason":"Unregistered"}' });
    expect(seen[0].headers[':method']).toBe('POST');
    expect(seen[0].headers[':path']).toBe('/3/device/abc');
    expect(seen[0].headers['apns-topic']).toBe('x');
    expect(seen[0].body).toBe('{}');
  });
});
