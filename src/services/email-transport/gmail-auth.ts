/**
 * Keyless Gmail credentials for the app's ferni.ai mailbox.
 *
 * No JSON key exists anywhere. The runtime service account (john-bogle-ui on
 * Cloud Run, ADC locally) asks the IAM Credentials API to sign a JWT as the
 * mailer service account (`iamcredentials.serviceAccounts.signJwt`, which needs
 * roles/iam.serviceAccountTokenCreator on the mailer). The JWT's `sub` is the
 * Workspace mailbox; Workspace domain-wide delegation lets the mailer act as it
 * for the gmail.send scope only. Google's token endpoint trades the JWT for a
 * one-hour access token. Setup: docs/runbooks/email-via-workspace.md.
 *
 * @module services/email-transport/gmail-auth
 */

import { GoogleAuth } from 'google-auth-library';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const signJwtUrl = (serviceAccount: string): string =>
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signJwt`;

export interface GmailAuthDeps {
  fetch: typeof fetch;
  /** An access token for the runtime identity (cloud-platform scope). */
  runtimeToken: () => Promise<string>;
  now: () => number;
}

export interface DelegationClaims {
  iss: string;
  sub: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
}

export function delegationClaims(
  mailerServiceAccount: string,
  mailbox: string,
  nowMs: number
): DelegationClaims {
  const iat = Math.floor(nowMs / 1000);
  return {
    iss: mailerServiceAccount,
    sub: mailbox,
    scope: GMAIL_SEND_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
}

let adc: GoogleAuth | null = null;

/** The runtime identity's token: Cloud Run's metadata server in prod, gcloud ADC on a laptop. */
export async function runtimeAccessToken(): Promise<string> {
  adc ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const token = await adc.getAccessToken();
  if (!token) throw new Error('no access token from application default credentials');
  return token;
}

/** Google's error text can name the mailbox or account; errors get logged, so addresses are redacted. */
async function failure(step: string, res: Response): Promise<Error> {
  const body = (await res.text()).replace(/[^\s<>"'(),;:@]+@[^\s<>"'(),;:@]+/g, '[address]');
  return new Error(`${step} failed: ${res.status} ${body.slice(0, 300)}`);
}

export interface GmailTokenSource {
  get: () => Promise<string>;
  /** Drop the cached token (after Gmail answers 401). */
  invalidate: () => void;
}

/** Mints and caches the mailbox's gmail.send token; concurrent callers share one mint. */
export function createGmailTokenSource(
  mailerServiceAccount: string,
  mailbox: string,
  deps: GmailAuthDeps
): GmailTokenSource {
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  const mint = async (): Promise<string> => {
    const claims = delegationClaims(mailerServiceAccount, mailbox, deps.now());
    const signed = await deps.fetch(signJwtUrl(mailerServiceAccount), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await deps.runtimeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload: JSON.stringify(claims) }),
    });
    if (!signed.ok) throw await failure('signJwt', signed);
    const { signedJwt } = (await signed.json()) as { signedJwt?: string };
    if (!signedJwt) throw new Error('signJwt returned no signedJwt');

    const exchanged = await deps.fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt,
      }).toString(),
    });
    if (!exchanged.ok) throw await failure('token exchange', exchanged);
    const { access_token: token, expires_in: ttl } = (await exchanged.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!token) throw new Error('token exchange returned no access_token');
    cached = { token, expiresAt: deps.now() + ((ttl ?? 3600) - 60) * 1000 };
    return token;
  };

  return {
    async get() {
      if (cached && deps.now() < cached.expiresAt) return cached.token;
      inflight ??= mint().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    invalidate() {
      cached = null;
    },
  };
}
