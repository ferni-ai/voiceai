import { describe, expect, it } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';
import { GMAIL_SEND_SCOPE, GOOGLE_TOKEN_URL, signJwtUrl } from '../gmail-auth.js';
import { createGmailSender, GMAIL_SEND_URL, type GmailSenderConfig } from '../gmail-sender.js';

const MAILER = 'ferni-mailer@johnb-2025.iam.gserviceaccount.com';
const CONFIG: GmailSenderConfig = {
  from: 'hello@ferni.ai',
  fromName: 'Ferni',
  mailbox: 'admin@ferni.ai',
  mailerServiceAccount: MAILER,
  dailyLimit: 1800,
};
const EMAIL: OutgoingEmail = {
  to: 'sam@example.com',
  subject: 'Welcome, José',
  text: 'Plain body',
  html: '<p>HTML body</p>',
  kind: 'bulk',
  unsubscribe: { url: 'https://ferni.ai/unsubscribe?t=1' },
};

interface Call {
  url: string;
  init: RequestInit;
}
interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A fake Google: signJwt, token endpoint and Gmail send, each answering from a queue (last reply repeats). */
function fakeGoogle(gmailReplies: Reply[] = [{ status: 200, body: { id: 'msg-1' } }]) {
  const calls: Call[] = [];
  let minted = 0;
  const json = (r: Reply): Response =>
    new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === signJwtUrl(MAILER))
      return json({ status: 200, body: { keyId: 'k1', signedJwt: `signed.jwt.${++minted}` } });
    if (url === GOOGLE_TOKEN_URL)
      return json({
        status: 200,
        body: { access_token: `gmail-token-${minted}`, expires_in: 3600 },
      });
    if (url === GMAIL_SEND_URL)
      return json(gmailReplies.length > 1 ? gmailReplies.shift()! : gmailReplies[0]!);
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl, of: (url: string) => calls.filter((c) => c.url === url) };
}

function setup(gmailReplies?: Reply[], config: Partial<GmailSenderConfig> = {}) {
  const google = fakeGoogle(gmailReplies);
  let clock = Date.parse('2026-10-18T12:00:00Z');
  const sleeps: number[] = [];
  const sender = createGmailSender(
    { ...CONFIG, ...config },
    {
      fetch: google.fetchImpl,
      runtimeToken: async () => 'runtime-sa-token',
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    }
  );
  return { sender, google, sleeps, advance: (ms: number) => (clock += ms), now: () => clock };
}

const header = (init: RequestInit, name: string): string =>
  (init.headers as Record<string, string>)[name]!;

describe('gmail sender: keyless auth', () => {
  it('asks IAM signJwt for a JWT with the delegation claims, using the runtime token', async () => {
    const { sender, google, now } = setup();
    await sender.send(EMAIL);
    const [sign] = google.of(signJwtUrl(MAILER));
    expect(sign!.url).toBe(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(MAILER)}:signJwt`
    );
    expect(header(sign!.init, 'Authorization')).toBe('Bearer runtime-sa-token');
    const claims = JSON.parse(JSON.parse(String(sign!.init.body)).payload);
    const iat = Math.floor(now() / 1000);
    expect(claims).toEqual({
      iss: MAILER,
      sub: 'admin@ferni.ai',
      scope: GMAIL_SEND_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat,
      exp: iat + 3600,
    });
    expect(claims.scope).toBe('https://www.googleapis.com/auth/gmail.send');
  });

  it('trades the signed JWT for an access token with the jwt-bearer grant', async () => {
    const { sender, google } = setup();
    await sender.send(EMAIL);
    const [exchange] = google.of(GOOGLE_TOKEN_URL);
    const form = new URLSearchParams(String(exchange!.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')).toBe('signed.jwt.1');
    const [send] = google.of(GMAIL_SEND_URL);
    expect(header(send!.init, 'Authorization')).toBe('Bearer gmail-token-1');
  });

  it('reuses the token until it nears expiry, then mints a new one', async () => {
    const { sender, google, advance } = setup();
    await sender.send(EMAIL);
    await sender.send(EMAIL);
    expect(google.of(signJwtUrl(MAILER))).toHaveLength(1);
    advance(3600_000);
    await sender.send(EMAIL);
    expect(google.of(signJwtUrl(MAILER))).toHaveLength(2);
  });

  it('re-mints once when Gmail answers 401', async () => {
    const { sender, google } = setup([
      { status: 401, body: { error: { message: 'Invalid Credentials' } } },
      { status: 200, body: { id: 'm2' } },
    ]);
    const res = await sender.send(EMAIL);
    expect(res).toMatchObject({ ok: true, messageId: 'm2' });
    expect(google.of(signJwtUrl(MAILER))).toHaveLength(2);
  });

  it('reports a signJwt refusal (missing Token Creator grant) without throwing', async () => {
    const fetchImpl = (async () =>
      new Response('{"error":{"message":"Permission iam.serviceAccounts.signJwt denied"}}', {
        status: 403,
      })) as typeof fetch;
    const sender = createGmailSender(CONFIG, {
      fetch: fetchImpl,
      runtimeToken: async () => 't',
      sleep: async () => {},
    });
    const res = await sender.send(EMAIL);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/signJwt failed: 403/);
  });
});

describe('gmail sender: the message', () => {
  it('posts the MIME message as base64url raw with From, both parts and unsubscribe headers', async () => {
    const { sender, google } = setup();
    const res = await sender.send(EMAIL);
    expect(res).toEqual({ ok: true, provider: 'gmail', messageId: 'msg-1', status: 200 });
    const [send] = google.of(GMAIL_SEND_URL);
    const { raw } = JSON.parse(String(send!.init.body)) as { raw: string };
    expect(raw).not.toMatch(/[+/=]/);
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: "Ferni" <hello@ferni.ai>\r\n');
    expect(mime).toContain('To: sam@example.com\r\n');
    expect(mime).toContain(
      `Subject: =?UTF-8?B?${Buffer.from('Welcome, José').toString('base64')}?=\r\n`
    );
    expect(mime).toContain('List-Unsubscribe: <https://ferni.ai/unsubscribe?t=1>\r\n');
    expect(mime).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n');
    expect(mime).toContain(Buffer.from('Plain body').toString('base64'));
    expect(mime).toContain(Buffer.from('<p>HTML body</p>').toString('base64'));
  });

  it('refuses an invalid message without calling Google', async () => {
    const { sender, google } = setup();
    const res = await sender.send({ ...EMAIL, unsubscribe: undefined });
    expect(res).toMatchObject({
      ok: false,
      error: expect.stringMatching(/invalid email: bulk email needs an unsubscribe/),
    });
    expect(google.calls).toHaveLength(0);
  });

  it('does not retry a 400', async () => {
    const { sender, google } = setup([
      { status: 400, body: { error: { message: 'Invalid To header' } } },
    ]);
    const res = await sender.send(EMAIL);
    expect(res).toMatchObject({ ok: false, status: 400, error: 'gmail 400: Invalid To header' });
    expect(google.of(GMAIL_SEND_URL)).toHaveLength(1);
  });
});

describe('gmail sender: limits and back-off', () => {
  it('backs off and retries a short 429, then succeeds', async () => {
    const { sender, google, sleeps } = setup([
      { status: 429, body: { error: { message: 'Too many concurrent requests for user' } } },
      {
        status: 403,
        body: {
          error: {
            message: 'User Rate Limit Exceeded',
            errors: [{ reason: 'userRateLimitExceeded' }],
          },
        },
      },
      { status: 200, body: { id: 'after-backoff' } },
    ]);
    const res = await sender.send(EMAIL);
    expect(res).toMatchObject({ ok: true, messageId: 'after-backoff' });
    expect(google.of(GMAIL_SEND_URL)).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('honours a short Retry-After header', async () => {
    const { sender, sleeps } = setup([
      { status: 429, body: {}, headers: { 'retry-after': '5' } },
      { status: 200, body: { id: 'x' } },
    ]);
    await sender.send(EMAIL);
    expect(sleeps).toEqual([5000]);
  });

  it('holds all sends when Gmail says the mail sending limit resets hours from now', async () => {
    const message =
      'User-rate limit exceeded.  Retry after 2026-10-18T15:00:00.000Z (Mail sending)';
    const { sender, google, advance } = setup([
      { status: 429, body: { error: { message, errors: [{ reason: 'rateLimitExceeded' }] } } },
      { status: 200, body: { id: 'later' } },
    ]);
    const first = await sender.send(EMAIL);
    expect(first).toMatchObject({ ok: false, retryable: true, status: 429 });
    const held = await sender.send(EMAIL);
    expect(held).toMatchObject({
      ok: false,
      retryable: true,
      error: expect.stringMatching(/wait until 2026-10-18T15:00:00/),
    });
    expect(google.of(GMAIL_SEND_URL)).toHaveLength(1);
    advance(3 * 3600_000);
    expect(await sender.send(EMAIL)).toMatchObject({ ok: true, messageId: 'later' });
  });

  it('gives up after 4 attempts on a persistent 503', async () => {
    const { sender, google, sleeps } = setup([
      { status: 503, body: { error: { message: 'Backend Error' } } },
    ]);
    const res = await sender.send(EMAIL);
    expect(res).toMatchObject({ ok: false, retryable: true, status: 503 });
    expect(google.of(GMAIL_SEND_URL)).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('stops at the daily limit without calling Gmail, and resets the next UTC day', async () => {
    const { sender, google, advance } = setup(undefined, { dailyLimit: 2 });
    expect((await sender.send(EMAIL)).ok).toBe(true);
    expect((await sender.send(EMAIL)).ok).toBe(true);
    const third = await sender.send(EMAIL);
    expect(third).toMatchObject({
      ok: false,
      retryable: true,
      error: 'daily send limit reached (2/2 today)',
    });
    expect(google.of(GMAIL_SEND_URL)).toHaveLength(2);
    advance(12 * 3600_000);
    expect((await sender.send(EMAIL)).ok).toBe(true);
  });

  it('does not count failed sends against the daily limit', async () => {
    const { sender } = setup(
      [
        { status: 400, body: {} },
        { status: 200, body: { id: 'ok' } },
      ],
      { dailyLimit: 1 }
    );
    expect((await sender.send(EMAIL)).ok).toBe(false);
    expect((await sender.send(EMAIL)).ok).toBe(true);
  });
});

describe('gmail sender: no recipient addresses in results', () => {
  it('redacts addresses Gmail echoes in a 4xx, a rate-limit hold and a thrown error', async () => {
    const bad = await setup([
      { status: 400, body: { error: { message: 'Invalid To header: sam@example.com' } } },
    ]).sender.send(EMAIL);
    expect(bad.error).toBe('gmail 400: Invalid To header: [address]');
    const held = await setup([
      {
        status: 429,
        body: {
          error: {
            message:
              'Limit for hello@ferni.ai. Retry after 2026-10-18T15:00:00.000Z (Mail sending)',
          },
        },
      },
    ]).sender.send(EMAIL);
    const thrown = await createGmailSender(CONFIG, {
      fetch: (async () => {
        throw new Error('connect ECONNRESET for sam@example.com');
      }) as typeof fetch,
      runtimeToken: async () => 'rt',
      sleep: async () => {},
    }).send(EMAIL);
    for (const r of [bad, held, thrown]) {
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain('@');
    }
  });
});
