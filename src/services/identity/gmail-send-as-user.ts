/**
 * "Send email as me": mail goes out from the user's own Gmail (gmail.send).
 *
 * Asked for only when the user turns the feature on (POST /auth/oauth/start
 * { provider: 'gmail_send' }), as its own grant, separate from the calendar
 * connect. The consent screen lists gmail.send plus openid/email, which only
 * tell us the address the mail will come from: gmail.send can't call
 * users.getProfile. Never gmail.readonly: that scope is Restricted and needs a
 * yearly security assessment (docs/compliance/google-oauth-gmail/).
 *
 * Tokens are encrypted (utils/token-encryption) at
 * bogle_users/{uid}/gmail_send_tokens/data, so eraseUserRecord removes them.
 * Every read goes to Firestore: the API server writes them, the voice agent
 * (another process) reads them, and a disconnect must take effect at once.
 *
 * Disconnect deletes our copy without calling Google's revoke endpoint, because
 * revoking any token drops every scope the user granted the project, calendar
 * included. Account erasure does revoke (forgetGmailSendGrant).
 *
 * @module services/identity/gmail-send-as-user
 */

import { createPersistenceStore } from '../persistence/index.js';
import { encryptData, decryptData } from '../../utils/token-encryption.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GmailSendAsUser' });

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
/** Everything the consent screen asks for. openid/email are non-sensitive. */
export const GMAIL_SEND_SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE] as const;

interface GmailSendTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch ms when access_token expires. */
  expires_at: number;
  scope: string;
  /** The Gmail address mail is sent from (from the id_token). */
  email: string;
}

const store = createPersistenceStore<{ encrypted: string; updated_at: number }>({
  collection: 'gmail_send_tokens',
  documentId: 'data',
  useRootCollection: false, // bogle_users/{uid}/gmail_send_tokens/data
  syncIntervalMs: 2000,
});

const short = (userId: string) => userId.substring(0, 8);

/** The same redirect the calendar connect uses: the callback is shared (routes/gmail-send.ts). */
export function gmailSendRedirectUri(): string {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'https://app.ferni.ai/auth/google/callback';
}

export function buildGmailSendAuthUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CALENDAR_CLIENT_ID || '');
  url.searchParams.set('redirect_uri', gmailSendRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_SEND_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

async function loadTokens(userId: string): Promise<GmailSendTokens | null> {
  const doc = await store.load(userId, { fresh: true });
  return doc?.encrypted ? decryptData<GmailSendTokens>(doc.encrypted) : null;
}

async function saveTokens(userId: string, tokens: GmailSendTokens): Promise<void> {
  await store.setImmediate(userId, { encrypted: encryptData(tokens), updated_at: Date.now() });
}

/** The email claim of an id_token received straight from Google's token endpoint over TLS. */
function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      email_verified?: boolean;
    };
    return claims.email && claims.email_verified !== false ? claims.email : null;
  } catch {
    return null;
  }
}

export type GmailSendConnectResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'exchange_failed' | 'scope_not_granted' | 'no_email' };

/**
 * Finish the consent: exchange the code and store the grant. Users can untick
 * gmail.send on Google's screen, so the granted scopes are checked, not assumed.
 */
export async function completeGmailSendConnect(
  userId: string,
  code: string
): Promise<GmailSendConnectResult> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
      redirect_uri: gmailSendRedirectUri(),
      grant_type: 'authorization_code',
    }),
  }).catch(() => null);
  if (!response?.ok) {
    log.warn(
      { status: response?.status, userId: short(userId) },
      'Gmail send code exchange failed'
    );
    return { ok: false, reason: 'exchange_failed' };
  }
  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    id_token?: string;
  };
  if (!(data.scope ?? '').split(' ').includes(GMAIL_SEND_SCOPE)) {
    return { ok: false, reason: 'scope_not_granted' };
  }
  const email = emailFromIdToken(data.id_token);
  if (!email) return { ok: false, reason: 'no_email' };
  await saveTokens(userId, {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? '',
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? GMAIL_SEND_SCOPE,
    email,
  });
  log.info({ userId: short(userId) }, 'Gmail send connected');
  return { ok: true, email };
}

/** Which address mail goes out from, or null when not connected. */
export async function getGmailSendAddress(userId: string): Promise<string | null> {
  return (await loadTokens(userId))?.email ?? null;
}

/** Turn the feature off: forget the grant (see the module note on revoking). */
export async function disconnectGmailSend(userId: string): Promise<void> {
  await store.delete(userId);
  log.info({ userId: short(userId) }, 'Gmail send disconnected');
}

/**
 * Account erasure: revoke the grant at Google (best effort), then delete it.
 * Returns whether there was a grant. Runs before the record is erased, while the
 * token can still be read.
 */
export async function forgetGmailSendGrant(userId: string): Promise<boolean> {
  const tokens = await loadTokens(userId);
  if (!tokens) return false;
  try {
    const revoke = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token || tokens.access_token }),
    });
    if (!revoke.ok) log.warn({ status: revoke.status }, 'Gmail send revoke refused');
  } catch (error) {
    log.warn({ error: String(error) }, 'Gmail send revoke failed');
  }
  await store.delete(userId);
  return true;
}
