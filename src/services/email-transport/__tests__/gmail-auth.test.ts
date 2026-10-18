import { describe, expect, it } from 'vitest';
import {
  createGmailTokenSource,
  delegationClaims,
  GMAIL_SEND_SCOPE,
  GOOGLE_TOKEN_URL,
  signJwtUrl,
} from '../gmail-auth.js';

const MAILER = 'ferni-mailer@johnb-2025.iam.gserviceaccount.com';
const MAILBOX = 'hello@ferni.ai';
const T0 = Date.parse('2026-10-18T12:00:00Z');

type Reply = { status: number; body: unknown };

function fakeGoogle(sign: Reply = { status: 200, body: { keyId: 'k', signedJwt: 'signed.jwt' } }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let minted = 0;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === signJwtUrl(MAILER))
      return new Response(JSON.stringify(sign.body), { status: sign.status });
    if (url === GOOGLE_TOKEN_URL) {
      minted += 1;
      return new Response(
        JSON.stringify({ access_token: `gmail-token-${minted}`, expires_in: 3600 })
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl, count: (url: string) => calls.filter((c) => c.url === url).length };
}

function source(google = fakeGoogle()) {
  let clock = T0;
  const tokens = createGmailTokenSource(MAILER, MAILBOX, {
    fetch: google.fetchImpl,
    runtimeToken: async () => 'runtime-sa-token',
    now: () => clock,
  });
  return { tokens, google, advance: (ms: number) => (clock += ms) };
}

describe('delegationClaims', () => {
  it('names the mailer as issuer, the mailbox as subject, gmail.send only, for Google token endpoint, one hour', () => {
    const iat = Math.floor(T0 / 1000);
    expect(delegationClaims(MAILER, MAILBOX, T0)).toEqual({
      iss: MAILER,
      sub: MAILBOX,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    });
  });
});

describe('createGmailTokenSource', () => {
  it('asks IAM signJwt, as the runtime identity, to sign the delegation claims as the mailer', async () => {
    const { tokens, google } = source();
    await tokens.get();
    const sign = google.calls[0]!;
    expect(sign.url).toBe(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(MAILER)}:signJwt`
    );
    expect(sign.init.method).toBe('POST');
    expect((sign.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer runtime-sa-token'
    );
    const { payload } = JSON.parse(String(sign.init.body)) as { payload: string };
    expect(JSON.parse(payload)).toEqual(delegationClaims(MAILER, MAILBOX, T0));
    expect(JSON.parse(payload).scope).toBe(GMAIL_SEND_SCOPE);
  });

  it('trades the signed JWT for an access token with the jwt-bearer grant', async () => {
    const { tokens, google } = source();
    expect(await tokens.get()).toBe('gmail-token-1');
    const exchange = google.calls[1]!;
    expect(exchange.url).toBe(GOOGLE_TOKEN_URL);
    expect((exchange.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    const form = new URLSearchParams(String(exchange.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')).toBe('signed.jwt');
  });

  it('caches the token until a minute before expiry', async () => {
    const { tokens, google, advance } = source();
    await tokens.get();
    advance(58 * 60_000);
    expect(await tokens.get()).toBe('gmail-token-1');
    expect(google.count(GOOGLE_TOKEN_URL)).toBe(1);
    advance(60_000);
    expect(await tokens.get()).toBe('gmail-token-2');
    expect(google.count(signJwtUrl(MAILER))).toBe(2);
  });

  it('shares one mint between concurrent callers', async () => {
    const { tokens, google } = source();
    const got = await Promise.all([tokens.get(), tokens.get(), tokens.get()]);
    expect(got).toEqual(['gmail-token-1', 'gmail-token-1', 'gmail-token-1']);
    expect(google.count(signJwtUrl(MAILER))).toBe(1);
  });

  it('re-mints after invalidate (Gmail answered 401)', async () => {
    const { tokens } = source();
    await tokens.get();
    tokens.invalidate();
    expect(await tokens.get()).toBe('gmail-token-2');
  });

  it('surfaces a signJwt refusal (no Token Creator grant) and retries the mint next time', async () => {
    const google = fakeGoogle({
      status: 403,
      body: { error: { message: "Permission 'iam.serviceAccounts.signJwt' denied" } },
    });
    const { tokens } = source(google);
    await expect(tokens.get()).rejects.toThrow(/signJwt failed: 403 .*signJwt' denied/);
    await expect(tokens.get()).rejects.toThrow(/signJwt failed/);
    expect(google.count(signJwtUrl(MAILER))).toBe(2);
    expect(google.count(GOOGLE_TOKEN_URL)).toBe(0);
  });

  it('surfaces an unauthorized_client token answer (delegation not granted in the Admin console)', async () => {
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) =>
      String(input) === GOOGLE_TOKEN_URL
        ? new Response(
            '{"error":"unauthorized_client","error_description":"Client is unauthorized to retrieve access tokens"}',
            { status: 401 }
          )
        : new Response(JSON.stringify({ signedJwt: 'j' }))) as typeof fetch;
    const tokens = createGmailTokenSource(MAILER, MAILBOX, {
      fetch: fetchImpl,
      runtimeToken: async () => 'rt',
      now: () => T0,
    });
    await expect(tokens.get()).rejects.toThrow(/token exchange failed: 401 .*unauthorized_client/);
  });

  it('keeps addresses out of the error Google echoes back', async () => {
    const fetchImpl = (async () =>
      new Response(
        '{"error":"invalid_grant","error_description":"Invalid email or User ID: hello@ferni.ai for ferni-mailer@johnb-2025.iam.gserviceaccount.com"}',
        { status: 400 }
      )) as typeof fetch;
    const tokens = createGmailTokenSource(MAILER, MAILBOX, {
      fetch: fetchImpl,
      runtimeToken: async () => 'rt',
      now: () => T0,
    });
    const err = await tokens.get().catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^signJwt failed: 400 .*\[address\]/);
    expect((err as Error).message).not.toContain('@');
  });
});
