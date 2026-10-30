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
 * Revoking any token drops every scope the user granted the project. So
 * disconnecting Gmail send deletes our copy without revoking (that would end
 * the calendar connection too), and disconnecting the calendar skips its revoke
 * while a Gmail send grant exists (hasGmailSendGrant). Account erasure revokes
 * both (forgetGmailSendGrant, then disconnectGoogleCalendar).
 *
 * @module services/identity/gmail-send-as-user
 */

import { createPersistenceStore } from '../persistence/index.js';
import { encryptData, decryptData } from '../../utils/token-encryption.js';
import { createLogger } from '../../utils/safe-logger.js';
import { queueGoogleRevocation, revokeGoogleToken } from './google-revocations.js';
import {
  googleCalendarClientId,
  googleCalendarClientSecret,
  googleCalendarRedirectUri,
} from '../../config/google-calendar-oauth-env.js';

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
  holdWrites: () => false, // MINOR_CARE opt-out: credentials, not the caller's words
  documentId: 'data',
  useRootCollection: false, // bogle_users/{uid}/gmail_send_tokens/data
  syncIntervalMs: 2000,
});

const short = (userId: string) => userId.substring(0, 8);

/** The same redirect the calendar connect uses: the callback is shared (routes/gmail-send.ts). */
export function gmailSendRedirectUri(): string {
  return googleCalendarRedirectUri('https://app.ferni.ai/auth/google/callback');
}

export function buildGmailSendAuthUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', googleCalendarClientId());
  url.searchParams.set('redirect_uri', gmailSendRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_SEND_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

/** `strict` throws when Firestore can't be read, instead of answering "not connected". */
async function loadTokens(userId: string, strict = false): Promise<GmailSendTokens | null> {
  const doc = await store.load(userId, { fresh: true, strict });
  return doc?.encrypted ? decryptData<GmailSendTokens>(doc.encrypted) : null;
}

async function saveTokens(userId: string, tokens: GmailSendTokens): Promise<void> {
  const grant = { encrypted: encryptData(tokens), updated_at: Date.now() };
  await store.setImmediate(userId, grant, { safeWithoutRead: true }); // never built on a read
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
      client_id: googleCalendarClientId(),
      client_secret: googleCalendarClientSecret(),
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

/** Which address mail goes out from, or null when not connected. `strict` throws on a failed read. */
export async function getGmailSendAddress(userId: string, strict = false): Promise<string | null> {
  return (await loadTokens(userId, strict))?.email ?? null;
}

/** Whether the user has a Gmail send grant. Throws when Firestore can't be read. */
export async function hasGmailSendGrant(userId: string): Promise<boolean> {
  return !!(await store.load(userId, { fresh: true, strict: true }))?.encrypted;
}

/** Turn the feature off: forget the grant (see the module note on revoking). */
export async function disconnectGmailSend(userId: string): Promise<void> {
  await store.delete(userId);
  log.info({ userId: short(userId) }, 'Gmail send disconnected');
}

/**
 * Account erasure: revoke the grant at Google, then delete it. Returns whether
 * there was a grant. Runs before the record is erased, while the token can
 * still be read. A failed read throws (never erase on an unknown token state);
 * a revoke Google couldn't take is queued (google-revocations.ts), and a
 * failed queue write throws too.
 */
export async function forgetGmailSendGrant(userId: string): Promise<boolean> {
  const tokens = await loadTokens(userId, true);
  if (!tokens) return false;
  const token = tokens.refresh_token || tokens.access_token;
  if ((await revokeGoogleToken(token)) === 'unreachable') await queueGoogleRevocation(token);
  await store.delete(userId);
  return true;
}

// ============================================================================
// SENDING: the only use of the grant (tools/.../outreach/outreach-email.ts)
// ============================================================================

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GOOGLE_TIMEOUT_MS = 10_000;
/** Refresh a minute early, so a token can't expire between the check and the send. */
const EXPIRY_MARGIN_MS = 60_000;

interface GmailSendMessage {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

/** What happened to one send. Only 'sent' means the mail left. */
export type GmailSendOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'not_connected' } // no grant stored for this user
  | { status: 'needs_reauth' } // refresh refused (invalid_grant) or Gmail answered 401
  | { status: 'not_permitted' } // Gmail answered 403
  | { status: 'unreachable' } // 5xx, 429, network error, timeout, or the grant couldn't be read
  | { status: 'rejected' } // any other 4xx: Gmail refused this message
  | { status: 'bad_address' }; // not one plain address (would let a header through)

/** One plain address, no display name, nothing that can end a header line. */
const ADDRESS = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** A header value: ASCII as is, anything else as RFC 2047 UTF-8 encoded-words of ≤ 75 chars. */
function encodeMimeHeader(value: string): string {
  const flat = value.replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(flat)) return flat;
  const words: string[] = [];
  let chunk = '';
  for (const ch of flat) {
    // 45 bytes → 60 base64 chars, + 12 for =?UTF-8?B??= : never split a character.
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

/** The RFC 2822 message Gmail sends, base64url as its `raw` field wants. From is Gmail's own. */
function buildRawMessage(msg: GmailSendMessage): string {
  const body = Buffer.from(msg.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64');
  const lines = [
    `To: ${msg.to}`,
    ...(msg.replyTo ? [`Reply-To: ${msg.replyTo}`] : []),
    `Subject: ${encodeMimeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    ...(body.match(/.{1,76}/g) ?? ['']),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

type Refresh = { token: string } | { status: 'needs_reauth' | 'unreachable' };

/** A fresh access token from the refresh token, saved for the next send. */
async function refreshAccess(userId: string, tokens: GmailSendTokens): Promise<Refresh> {
  if (!tokens.refresh_token) return { status: 'needs_reauth' };
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleCalendarClientId(),
      client_secret: googleCalendarClientSecret(),
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok) {
    const error = response && ((await response.json().catch(() => ({}))) as { error?: string });
    log.warn({ status: response?.status, userId: short(userId) }, 'Gmail send refresh failed');
    return { status: error?.error === 'invalid_grant' ? 'needs_reauth' : 'unreachable' };
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  const fresh = { ...tokens, access_token: data.access_token };
  fresh.expires_at = Date.now() + data.expires_in * 1000;
  // The send can go ahead on a token we couldn't save: the next one refreshes again.
  await saveTokens(userId, fresh).catch(() =>
    log.warn({ userId: short(userId) }, 'Gmail send token save failed')
  );
  return { token: data.access_token };
}

async function postSend(token: string, raw: string): Promise<Response | null> {
  return fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  }).catch(() => null);
}

/**
 * Send one email from `userId`'s own Gmail. `userId` must be the person on the
 * call (the tool's session user), never a value the model supplied: only that
 * user's grant is read. An expired token is refreshed first; a 401 on a token
 * we thought valid gets one refresh and one retry. Logs ids and statuses only.
 */
export async function sendAsUser(userId: string, msg: GmailSendMessage): Promise<GmailSendOutcome> {
  if (!ADDRESS.test(msg.to) || (msg.replyTo && !ADDRESS.test(msg.replyTo))) {
    return { status: 'bad_address' };
  }
  let tokens: GmailSendTokens | null;
  try {
    tokens = await loadTokens(userId, true);
  } catch {
    log.warn({ userId: short(userId) }, 'Gmail send grant could not be read');
    return { status: 'unreachable' };
  }
  if (!tokens) return { status: 'not_connected' };
  const raw = buildRawMessage(msg);
  let refreshed = false;
  let token = tokens.access_token;
  if (tokens.expires_at - EXPIRY_MARGIN_MS <= Date.now()) {
    const r = await refreshAccess(userId, tokens);
    if (!('token' in r)) return r;
    [token, refreshed] = [r.token, true];
  }
  let response = await postSend(token, raw);
  if (response?.status === 401 && !refreshed) {
    const r = await refreshAccess(userId, tokens);
    if (!('token' in r)) return r;
    response = await postSend(r.token, raw);
  }
  const status = response?.status;
  if (response?.ok) {
    const { id } = (await response.json().catch(() => ({}))) as { id?: string };
    log.info({ userId: short(userId) }, 'Gmail send: sent from the user mailbox');
    return { status: 'sent', messageId: id ?? '' };
  }
  log.warn({ status, userId: short(userId) }, 'Gmail send failed');
  if (status === 401) return { status: 'needs_reauth' };
  if (status === 403) return { status: 'not_permitted' };
  if (!status || status === 429 || status >= 500) return { status: 'unreachable' };
  return { status: 'rejected' };
}
