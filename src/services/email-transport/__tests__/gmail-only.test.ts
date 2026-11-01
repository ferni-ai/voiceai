import { afterEach, describe, expect, it } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';
import { GOOGLE_TOKEN_URL, signJwtUrl } from '../gmail-auth.js';
import { GMAIL_SEND_URL } from '../gmail-sender.js';
import {
  createEmailSenderFromEnv,
  DEFAULT_MAILER_SA,
  getEmailSender,
  resetEmailSenderForTests,
} from '../index.js';

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
    return new Response('unexpected host', { status: 599 });
  }) as typeof fetch;
  return {
    calls,
    deps: { fetch: fetchImpl, runtimeToken: async () => 'rt', sleep: async () => {} },
  };
}

describe('the email transport is Gmail Workspace only', () => {
  afterEach(() => resetEmailSenderForTests());

  it('is gmail with no env at all, and whatever EMAIL_PROVIDER says', () => {
    expect(createEmailSenderFromEnv({}).provider).toBe('gmail');
    expect(createEmailSenderFromEnv({ EMAIL_PROVIDER: 'sendgrid' }).provider).toBe('gmail');
    expect(createEmailSenderFromEnv({}).isConfigured()).toBe(true);
  });

  it('only ever calls Google: sign the JWT, mint the token, send', async () => {
    const r = recorder();
    expect((await createEmailSenderFromEnv({ SENDGRID_API_KEY: 'k' }, r.deps).send(EMAIL)).ok).toBe(
      true
    );
    const hosts = new Set(r.calls.map((c) => new URL(c.url).host));
    expect([...hosts].every((h) => h.endsWith('googleapis.com'))).toBe(true);
    expect(r.calls.at(-1)!.url).toBe(GMAIL_SEND_URL);
  });

  it('sends through Gmail as EMAIL_FROM by default, and as EMAIL_MAILBOX when set', async () => {
    const a = recorder();
    await createEmailSenderFromEnv({}, a.deps).send(EMAIL);
    const claims = (c: { init: RequestInit }) =>
      JSON.parse(JSON.parse(String(c.init.body)).payload);
    expect(a.calls[0]!.url).toBe(signJwtUrl(DEFAULT_MAILER_SA));
    expect(claims(a.calls[0]!)).toMatchObject({ iss: DEFAULT_MAILER_SA, sub: 'hello@ferni.ai' });

    const b = recorder();
    const env = {
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
    const sender = createEmailSenderFromEnv({ EMAIL_DAILY_LIMIT: '1' }, a.deps);
    expect((await sender.send(EMAIL)).ok).toBe(true);
    expect(await sender.send(EMAIL)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/daily send limit/),
    });
  });

  it('shares one sender per process until reset', () => {
    const first = getEmailSender();
    expect(first.provider).toBe('gmail');
    expect(getEmailSender()).toBe(first);
    resetEmailSenderForTests();
    expect(getEmailSender()).not.toBe(first);
  });
});
