import { afterEach, describe, expect, it } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';
import { GOOGLE_TOKEN_URL, signJwtUrl } from '../gmail-auth.js';
import { GMAIL_SEND_URL } from '../gmail-sender.js';
import {
  createEmailSenderFromEnv,
  DEFAULT_MAILER_SA,
  emailProvider,
  getEmailSender,
  resetEmailSenderForTests,
} from '../index.js';
import { SENDGRID_SEND_URL } from '../sendgrid-sender.js';

const EMAIL: OutgoingEmail = {
  to: 'sam@example.com',
  subject: 'Hi',
  text: 'text',
  html: '<b>html</b>',
  kind: 'transactional',
};

function recorder() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith('https://iamcredentials.googleapis.com/') && url.endsWith(':signJwt'))
      return new Response(JSON.stringify({ signedJwt: 'jwt' }));
    if (url === GOOGLE_TOKEN_URL)
      return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
    if (url === GMAIL_SEND_URL) return new Response(JSON.stringify({ id: 'g1' }));
    return new Response('', { status: 202, headers: { 'x-message-id': 'sg-1' } });
  }) as typeof fetch;
  return {
    calls,
    deps: { fetch: fetchImpl, runtimeToken: async () => 'rt', sleep: async () => {} },
  };
}

describe('EMAIL_PROVIDER switch', () => {
  afterEach(() => resetEmailSenderForTests());

  it('defaults to sendgrid, so nothing changes until it is set', () => {
    expect(emailProvider({})).toBe('sendgrid');
    expect(emailProvider({ EMAIL_PROVIDER: 'mailgun' })).toBe('sendgrid');
    expect(createEmailSenderFromEnv({}).provider).toBe('sendgrid');
  });

  it("switches to gmail on 'gmail' (any case)", () => {
    expect(emailProvider({ EMAIL_PROVIDER: ' Gmail ' })).toBe('gmail');
    expect(createEmailSenderFromEnv({ EMAIL_PROVIDER: 'gmail' }).provider).toBe('gmail');
  });

  it('sends through Gmail as EMAIL_FROM by default, and as EMAIL_MAILBOX when set', async () => {
    const a = recorder();
    await createEmailSenderFromEnv({ EMAIL_PROVIDER: 'gmail' }, a.deps).send(EMAIL);
    const claims = (c: { init: RequestInit }) =>
      JSON.parse(JSON.parse(String(c.init.body)).payload);
    expect(a.calls[0]!.url).toBe(signJwtUrl(DEFAULT_MAILER_SA));
    expect(claims(a.calls[0]!)).toMatchObject({ iss: DEFAULT_MAILER_SA, sub: 'hello@ferni.ai' });
    expect(a.calls.map((c) => c.url)).not.toContain(SENDGRID_SEND_URL);

    const b = recorder();
    const env = {
      EMAIL_PROVIDER: 'gmail',
      EMAIL_FROM: 'hello@ferni.ai',
      EMAIL_MAILBOX: 'admin@ferni.ai',
      EMAIL_MAILER_SA: 'm@p.iam.gserviceaccount.com',
    };
    await createEmailSenderFromEnv(env, b.deps).send(EMAIL);
    expect(claims(b.calls[0]!)).toMatchObject({
      iss: 'm@p.iam.gserviceaccount.com',
      sub: 'admin@ferni.ai',
    });
    const raw = Buffer.from(
      JSON.parse(String(b.calls.at(-1)!.init.body)).raw,
      'base64url'
    ).toString('utf8');
    expect(raw).toContain('From: "Ferni" <hello@ferni.ai>');
  });

  it('applies EMAIL_DAILY_LIMIT to the gmail sender', async () => {
    const a = recorder();
    const sender = createEmailSenderFromEnv(
      { EMAIL_PROVIDER: 'gmail', EMAIL_DAILY_LIMIT: '1' },
      a.deps
    );
    expect((await sender.send(EMAIL)).ok).toBe(true);
    expect(await sender.send(EMAIL)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/daily send limit/),
    });
  });

  it('shares one sender per process until reset', () => {
    const prev = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = 'gmail';
    try {
      const first = getEmailSender();
      expect(first.provider).toBe('gmail');
      expect(getEmailSender()).toBe(first);
      process.env.EMAIL_PROVIDER = 'sendgrid';
      resetEmailSenderForTests();
      expect(getEmailSender().provider).toBe('sendgrid');
    } finally {
      if (prev === undefined) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = prev;
    }
  });
});

describe('sendgrid from env', () => {
  it("uses SENDGRID_API_KEY, and SENDGRID_FROM_EMAIL over EMAIL_FROM (today's prod sender)", async () => {
    const r = recorder();
    const env = {
      SENDGRID_API_KEY: 'SG.key',
      SENDGRID_FROM_EMAIL: 'noreply@ferni.ai',
      EMAIL_FROM: 'hello@ferni.ai',
    };
    await createEmailSenderFromEnv(env, r.deps).send(EMAIL);
    expect(r.calls[0]?.url).toBe(SENDGRID_SEND_URL);
    expect((r.calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer SG.key'
    );
    expect(JSON.parse(String(r.calls[0]?.init.body)).from).toEqual({
      email: 'noreply@ferni.ai',
      name: 'Ferni',
    });
  });

  it('falls back to EMAIL_FROM, then hello@ferni.ai', async () => {
    for (const [env, from] of [
      [{ SENDGRID_API_KEY: 'k', EMAIL_FROM: 'admin@ferni.ai' }, 'admin@ferni.ai'],
      [{ SENDGRID_API_KEY: 'k' }, 'hello@ferni.ai'],
    ] as const) {
      const r = recorder();
      await createEmailSenderFromEnv(env, r.deps).send(EMAIL);
      expect(JSON.parse(String(r.calls[0]?.init.body)).from.email).toBe(from);
    }
  });

  it('is unconfigured without SENDGRID_API_KEY', () => {
    expect(createEmailSenderFromEnv({}).isConfigured()).toBe(false);
  });
});
