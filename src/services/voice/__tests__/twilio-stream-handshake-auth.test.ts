import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { isTwilioSignedHandshake, TwilioStreamBridge } from '../twilio-stream-bridge.js';

const AUTH_TOKEN = 'test-twilio-auth-token';

/** What Twilio sends: HMAC-SHA1 of the URL it called, keyed by the auth token. */
const sign = (url: string) => createHmac('sha1', AUTH_TOKEN).update(url).digest('base64');

function handshake(url: string, headers: Record<string, string>): IncomingMessage {
  return { url, headers } as unknown as IncomingMessage;
}

beforeAll(() => {
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
});

describe('isTwilioSignedHandshake', () => {
  const host = 'api.example.com';

  it('accepts the signature Twilio computes over the wss:// URL', () => {
    const req = handshake('/stream', { host, 'x-twilio-signature': sign(`wss://${host}/stream`) });
    expect(isTwilioSignedHandshake(req)).toBe(true);
  });

  it('accepts the trailing-slash form Twilio sometimes signs, and the forwarded host', () => {
    const viaSlash = handshake('/stream', {
      host,
      'x-twilio-signature': sign(`wss://${host}/stream/`),
    });
    expect(isTwilioSignedHandshake(viaSlash)).toBe(true);

    const proxied = handshake('/stream?x=1', {
      host: 'internal:8080',
      'x-forwarded-host': host,
      'x-twilio-signature': sign(`wss://${host}/stream?x=1`),
    });
    expect(isTwilioSignedHandshake(proxied)).toBe(true);
  });

  it('accepts the configured stream URL Twilio was told to open, whatever the host header', () => {
    process.env.TWILIO_STREAM_WEBHOOK_URL = 'wss://api.ferni.example/stream';
    try {
      const req = handshake('/stream', {
        host: 'voice-api-abc123.a.run.app',
        'x-twilio-signature': sign('wss://api.ferni.example/stream'),
      });
      expect(isTwilioSignedHandshake(req)).toBe(true);
    } finally {
      delete process.env.TWILIO_STREAM_WEBHOOK_URL;
    }
  });

  it('rejects a missing, wrong, or other-host signature', () => {
    expect(isTwilioSignedHandshake(handshake('/stream', { host }))).toBe(false);
    expect(
      isTwilioSignedHandshake(handshake('/stream', { host, 'x-twilio-signature': 'forged' }))
    ).toBe(false);
    const otherHost = handshake('/stream', {
      host,
      'x-twilio-signature': sign('wss://attacker.example/stream'),
    });
    expect(isTwilioSignedHandshake(otherHost)).toBe(false);
  });

  it('refuses everything when no auth token is configured', () => {
    const saved = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
    try {
      const req = handshake('/stream', {
        host,
        'x-twilio-signature': sign(`wss://${host}/stream`),
      });
      expect(isTwilioSignedHandshake(req)).toBe(false);
    } finally {
      process.env.TWILIO_AUTH_TOKEN = saved;
    }
  });
});

describe('TwilioStreamBridge.attachToServer', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer();
    new TwilioStreamBridge({
      livekitUrl: 'ws://localhost:7880',
      livekitApiKey: 'key',
      livekitApiSecret: 'secret',
    }).attachToServer(server, '/stream');
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  function connect(headers: Record<string, string>): Promise<'open' | number> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`, { headers });
      ws.on('open', () => {
        ws.close();
        resolve('open');
      });
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('error', reject);
    });
  }

  it('refuses an unsigned stream before the WebSocket opens', async () => {
    await expect(connect({})).resolves.toBe(403);
  });

  it('opens a stream Twilio signed', async () => {
    const url = `wss://127.0.0.1:${port}/stream`;
    await expect(connect({ 'x-twilio-signature': sign(url) })).resolves.toBe('open');
  });
});
