/**
 * /api/voice/inbound and /api/voice/inbound/status are Twilio webhooks: no
 * user, only X-Twilio-Signature.
 *
 * Before: the webhook checked a signature only when NODE_ENV was
 * 'production', and even then only if the header was present, so an unsigned
 * request was routed like a real call. The status route never checked at all,
 * so anyone could post "completed" and bill minutes to a sponsored identity.
 * Both also read Twilio's form post with a JSON-only parser and got {}.
 *
 * Requests go through the real /api/voice dispatcher (handleVoiceAuthRoutes,
 * as src/servers/api/index.ts mounts it). Only the identity store is faked;
 * signatures come from the real Twilio SDK.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import twilio from 'twilio';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPhoneAttestation } from '../../services/identity/phone-attestation.js';

const TOKEN = 'inbound-test-twilio-token';
const PUBLIC_BASE = 'https://api.ferni.ai';
const ROSE = '+15557654321';

const identity = vi.hoisted(() => {
  process.env.TWILIO_AUTH_TOKEN = 'inbound-test-twilio-token';
  return { recordCall: vi.fn(async () => undefined) };
});

vi.mock('../../services/identity/sponsored-identity.js', () => ({
  lookupByPhone: vi.fn(async (phone: string) =>
    phone === '+15557654321'
      ? {
          found: true,
          identity: {
            id: 'sponsored-rose',
            displayName: 'Rose Smith',
            preferredName: 'Rose',
            sponsorUserId: 'alice',
            voiceEnrolled: true,
          },
        }
      : { found: false }
  ),
  recordCall: identity.recordCall,
}));
vi.mock('../../services/identity/user-identification.js', () => ({
  identifyByPhone: vi.fn(async () => ({ isNew: true })),
}));

const { handleVoiceAuthRoutes } = await import('../voice-auth.routes.js');

let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url || '/', 'http://local');
    if (pathname.startsWith('/api/voice/') && (await handleVoiceAuthRoutes(req, res, pathname)))
      return;
    res.writeHead(404).end();
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
  identity.recordCall.mockClear();
});

/** POST Twilio's form to `publicUrl` the way it reaches Cloud Run. */
function postForm(
  publicUrl: string,
  form: Record<string, string>,
  signature?: string
): Promise<{ status: number; body: string }> {
  const target = new URL(publicUrl);
  const body = new URLSearchParams(form).toString();
  return new Promise((done, fail) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: target.pathname,
        headers: {
          host: target.host,
          'x-forwarded-proto': 'https',
          'content-type': 'application/x-www-form-urlencoded',
          ...(signature ? { 'x-twilio-signature': signature } : {}),
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => done({ status: res.statusCode ?? 0, body: text }));
      }
    );
    req.on('error', fail);
    req.end(body);
  });
}

const INBOUND = `${PUBLIC_BASE}/api/voice/inbound`;
const STATUS = `${PUBLIC_BASE}/api/voice/inbound/status`;
const sign = (url: string, form: Record<string, string>, token = TOKEN): string =>
  twilio.getExpectedTwilioSignature(token, url, form);

const incoming = (callSid: string): Record<string, string> => ({
  AccountSid: 'AC00000000000000000000000000000000',
  CallSid: callSid,
  Called: '+15550000000',
  Caller: ROSE,
  Direction: 'inbound',
  From: ROSE,
  To: '+15550000000',
});
const completed = (callSid: string): Record<string, string> => ({
  AccountSid: 'AC00000000000000000000000000000000',
  CallDuration: '120',
  CallSid: callSid,
  CallStatus: 'completed',
});

describe('POST /api/voice/inbound', () => {
  it('routes a correctly signed call, reading the caller from the form', async () => {
    const form = incoming('CA-signed');

    const res = await postForm(INBOUND, form, sign(INBOUND, form));

    expect(res.status).toBe(200);
    expect(res.body).toContain('<Say voice="Polly.Joanna">Hi Rose! Great to hear from you.</Say>');
  });

  it('refuses an unsigned request with 403', async () => {
    const res = await postForm(INBOUND, incoming('CA-unsigned'));

    expect(res.status).toBe(403);
    expect(res.body).toContain('Invalid request signature');
    expect(res.body).not.toContain('Rose');
  });

  it('refuses a bad signature with 403', async () => {
    const form = incoming('CA-bad');

    const forged = await postForm(INBOUND, form, sign(INBOUND, form, 'not-the-token'));
    const tampered = await postForm(
      INBOUND,
      { ...form, From: '+15559999999' },
      sign(INBOUND, form)
    );

    expect([forged.status, tampered.status]).toEqual([403, 403]);
  });
});

describe('POST /api/voice/inbound with phone attestation configured', () => {
  const SECRET = 'attest-test-secret';
  const SIP_HOST = 'proj.sip.livekit.cloud';
  const saved = { secret: process.env.PHONE_ATTEST_SECRET, host: process.env.LIVEKIT_SIP_HOST };
  const restore = (key: 'PHONE_ATTEST_SECRET' | 'LIVEKIT_SIP_HOST', value?: string): void => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  const configure = (secret?: string, host?: string): void => {
    restore('PHONE_ATTEST_SECRET', secret);
    restore('LIVEKIT_SIP_HOST', host);
  };
  afterEach(() => configure(saved.secret, saved.host));

  const withVerstat = (callSid: string): Record<string, string> => ({
    ...incoming(callSid),
    StirVerstat: 'TN-Validation-Passed-A',
  });
  const signedPost = (form: Record<string, string>) => postForm(INBOUND, form, sign(INBOUND, form));
  const sipTarget = (twiml: string): string => /<Sip>([^<]*)<\/Sip>/.exec(twiml)?.[1] ?? '';

  it('dials the called number on the LiveKit SIP host with a token the agent can verify', async () => {
    configure(SECRET, SIP_HOST);

    const res = await signedPost(withVerstat('CA-attested'));

    expect(res.status).toBe(200);
    const target = sipTarget(res.body);
    expect(target.startsWith(`sip:+15550000000@${SIP_HOST};transport=tls?X-Ferni-Attest=`)).toBe(
      true
    );
    expect(res.body).toContain(`<Dial callerId="${ROSE}"`);
    expect(res.body).not.toContain('Hi Rose!');

    const token = target.split('X-Ferni-Attest=')[1];
    const result = verifyPhoneAttestation(token, { secret: SECRET, phoneNumber: ROSE });
    expect(result).toMatchObject({
      status: 'signed',
      claims: {
        callSid: 'CA-attested',
        from: ROSE,
        to: '+15550000000',
        verstat: 'TN-Validation-Passed-A',
      },
    });
    expect(verifyPhoneAttestation(token, { secret: 'wrong', phoneNumber: ROSE }).status).toBe(
      'invalid'
    );
  });

  it.each([
    ['neither set', undefined, undefined],
    ['only the secret', SECRET, undefined],
    ['only the host', undefined, SIP_HOST],
    ['a host carrying URI parameters', SECRET, `${SIP_HOST};maddr=evil.example`],
  ])("keeps today's TwiML with %s", async (_label, secret, host) => {
    configure(secret, host);

    const res = await signedPost(withVerstat('CA-plain'));

    expect(res.status).toBe(200);
    expect(res.body).toContain('Hi Rose! Great to hear from you.');
    expect(res.body).not.toContain('X-Ferni-Attest');
  });

  it('still refuses an unsigned request, minting nothing', async () => {
    configure(SECRET, SIP_HOST);

    const res = await postForm(INBOUND, withVerstat('CA-unsigned-attest'));

    expect(res.status).toBe(403);
    expect(res.body).not.toContain('X-Ferni-Attest');
  });
});

describe('POST /api/voice/inbound/status', () => {
  it('records a signed "completed" for the call it routed', async () => {
    const callForm = incoming('CA-billed');
    expect((await postForm(INBOUND, callForm, sign(INBOUND, callForm))).status).toBe(200);
    const form = completed('CA-billed');

    const res = await postForm(STATUS, form, sign(STATUS, form));

    expect(res.status).toBe(200);
    expect(identity.recordCall).toHaveBeenCalledWith('sponsored-rose', expect.any(Number));
  });

  it('refuses unsigned and badly signed status posts without recording anything', async () => {
    const callForm = incoming('CA-forged-status');
    expect((await postForm(INBOUND, callForm, sign(INBOUND, callForm))).status).toBe(200);
    const form = completed('CA-forged-status');

    const unsigned = await postForm(STATUS, form);
    const forged = await postForm(STATUS, form, sign(STATUS, form, 'not-the-token'));

    expect([unsigned.status, forged.status]).toEqual([403, 403]);
    expect(identity.recordCall).not.toHaveBeenCalled();
  });
});

describe('the UI server mounts this dispatcher for /api/voice/', () => {
  it('src/servers/api/index.ts dispatches /api/voice/ to handleVoiceAuthRoutes', () => {
    const source = readFileSync(resolve(__dirname, '../../servers/api/index.ts'), 'utf8');

    expect(source).toContain(
      "import { handleVoiceAuthRoutes } from '../../api/voice-auth.routes.js'"
    );
    expect(source).toContain('await handleVoiceAuthRoutes(req, res, pathname)');
  });
});
