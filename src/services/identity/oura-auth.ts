/**
 * Oura Ring OAuth Service
 *
 * OAuth 2.0 flow for Oura Ring wearable integration.
 * Provides access to sleep, readiness, and activity data.
 *
 * The connect flow is the shared wearables flow (POST /auth/oauth/start, then
 * /wearables/oura/login and /callback in servers/api/routes/wearables.ts), which hands
 * the code exchange and the save to this file. Tokens are sealed in oura_tokens/{uid}.
 *
 * Oura refresh tokens are single-use. A refresh Oura refuses with invalid_grant means the
 * person must connect again: that is kept on the record (needsReauthAt) and answered as
 * `needs_reauth`, never as "not connected" and never by deleting the record. Any other
 * failure (5xx, network, our own client being refused) is `unavailable` and marks nothing.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
import { openTokens, sealTokens } from '../../utils/token-at-rest.js';
import type { OuraTokens, OuraTokenResponse } from './oura-types.js';

const log = createLogger({ module: 'oura-auth' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID || '';
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || '';

const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_REVOKE_URL = 'https://api.ouraring.com/oauth/revoke';

const FIRESTORE_COLLECTION = 'oura_tokens';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 10_000;
/** The agent and the UI server each cache; a disconnect or reconnect in the other shows up within this. */
const CACHE_TTL_MS = 60 * 1000;

/** What a caller learns about the person's Oura link. */
type OuraAccess =
  { status: 'ok'; token: string } | { status: 'not_connected' | 'needs_reauth' | 'unavailable' };

export type OuraLink = 'connected' | 'needs_reauth' | 'not_connected';

interface Stored {
  tokens: OuraTokens | null;
  needsReauth: boolean;
  /** A record exists but its envelope could not be opened (key mismatch). */
  unreadable: boolean;
}

const cache = new Map<string, { value: Stored; at: number }>();
const inflightRefresh = new Map<string, Promise<OuraAccess>>();

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

export function isApiConfigured(): boolean {
  return Boolean(OURA_CLIENT_ID && OURA_CLIENT_SECRET);
}

/** Link state without touching Oura: connected, needs a new connect, or never connected. */
export async function getOuraLink(userId: string): Promise<OuraLink> {
  const stored = await load(userId);
  if (stored.needsReauth) return 'needs_reauth';
  return stored.tokens || stored.unreadable ? 'connected' : 'not_connected';
}

// ============================================================================
// OAUTH FLOW
// ============================================================================

/**
 * Trade the authorization code for tokens. `redirectUri` is the one the authorize URL
 * carried (the wearables flow passes its own). Keeping the grant is saveOuraTokens.
 */
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<OuraTokens | null> {
  if (!isApiConfigured()) return null;

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
    });

    const response = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      log.error({ status: response.status }, 'Failed to exchange Oura code');
      return null;
    }

    const data = (await response.json()) as OuraTokenResponse;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Error exchanging Oura code');
    return null;
  }
}

/** Keep a person's grant (sealed), replacing any earlier one. */
export async function saveOuraTokens(userId: string, tokens: OuraTokens): Promise<void> {
  await storeTokens(userId, tokens);
  log.info({ userId }, 'Oura tokens stored');
}

// ============================================================================
// READ: a usable access token, or the honest reason there is none
// ============================================================================

/** An access token, refreshed when it is about to lapse. */
export async function getOuraAccessToken(userId: string): Promise<OuraAccess> {
  const stored = await load(userId);
  if (stored.needsReauth) return { status: 'needs_reauth' };
  if (stored.unreadable) return { status: 'unavailable' };
  if (!stored.tokens) return { status: 'not_connected' };
  if (Date.now() < stored.tokens.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
    return { status: 'ok', token: stored.tokens.access_token };
  }

  // One refresh per person at a time in this process: the refresh token is single-use.
  const running = inflightRefresh.get(userId);
  if (running) return running;
  const refresh = refreshTokens(userId, stored.tokens).finally(() =>
    inflightRefresh.delete(userId)
  );
  inflightRefresh.set(userId, refresh);
  return refresh;
}

async function refreshTokens(userId: string, stale: OuraTokens): Promise<OuraAccess> {
  if (!isApiConfigured() || !stale.refresh_token) return { status: 'unavailable' };

  try {
    const response = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stale.refresh_token,
        client_id: OURA_CLIENT_ID,
        client_secret: OURA_CLIENT_SECRET,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const revoked =
        (response.status === 400 || response.status === 401) && /invalid_grant/.test(body);
      log.warn({ status: response.status, revoked, userId }, 'Failed to refresh Oura token');
      if (!revoked) return { status: 'unavailable' };

      // The agent and the UI server both refresh. If the other already rotated the
      // token, ours is spent through no fault of the person: use theirs.
      cache.delete(userId);
      const current = await load(userId);
      if (current.tokens && current.tokens.refresh_token !== stale.refresh_token) {
        return { status: 'ok', token: current.tokens.access_token };
      }
      await markNeedsReauth(userId);
      return { status: 'needs_reauth' };
    }

    const data = (await response.json()) as OuraTokenResponse;
    const fresh: OuraTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || stale.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type,
    };
    await storeTokens(userId, fresh);
    log.info({ userId }, 'Oura token refreshed');
    return { status: 'ok', token: fresh.access_token };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error refreshing Oura token');
    return { status: 'unavailable' };
  }
}

// ============================================================================
// DISCONNECT
// ============================================================================

/**
 * Disconnect: ask Oura to revoke the grant, then delete ours whether or not it did.
 * `revoked` says whether Oura confirmed, so the caller can be honest about it.
 */
export async function disconnectOura(userId: string): Promise<{ revoked: boolean }> {
  const { tokens } = await load(userId);
  let revoked = false;
  if (tokens?.access_token) {
    try {
      const response = await fetch(
        `${OURA_REVOKE_URL}?access_token=${encodeURIComponent(tokens.access_token)}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
      );
      revoked = response.ok;
      if (!revoked)
        log.warn({ status: response.status, userId }, 'Oura did not confirm the revoke');
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Oura revoke request failed');
    }
  }
  await deleteUserTokens(userId);
  return { revoked };
}

// ============================================================================
// TOKEN STORAGE
// ============================================================================

async function storeTokens(userId: string, tokens: OuraTokens): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection(FIRESTORE_COLLECTION)
      .doc(userId)
      .set(
        cleanForFirestore({
          ...sealTokens(tokens),
          updatedAt: new Date().toISOString(),
        })
      );

    // A fresh grant replaces the record whole, which also clears any needs_reauth mark.
    cache.set(userId, { value: { tokens, needsReauth: false, unreadable: false }, at: Date.now() });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to store Oura tokens');
  }
}

async function markNeedsReauth(userId: string): Promise<void> {
  cache.set(userId, {
    value: { tokens: null, needsReauth: true, unreadable: false },
    at: Date.now(),
  });
  const db = getFirestoreDb();
  if (!db) return;
  try {
    await db
      .collection(FIRESTORE_COLLECTION)
      .doc(userId)
      .set({ needsReauthAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to mark Oura as needing reauth');
  }
}

async function load(userId: string): Promise<Stored> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const none: Stored = { tokens: null, needsReauth: false, unreadable: false };
  const db = getFirestoreDb();
  if (!db) return none;

  try {
    const doc = await db.collection(FIRESTORE_COLLECTION).doc(userId).get();
    if (!doc.exists) {
      cache.delete(userId);
      return none;
    }
    const data = doc.data();
    const tokens = openTokens<OuraTokens>(data, FIRESTORE_COLLECTION);
    const needsReauth = Boolean(data?.needsReauthAt);
    const value: Stored = { tokens, needsReauth, unreadable: !tokens && !needsReauth };
    cache.set(userId, { value, at: Date.now() });
    return value;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get Oura tokens');
    return { ...none, unreadable: true };
  }
}

async function deleteUserTokens(userId: string): Promise<void> {
  cache.delete(userId);
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection(FIRESTORE_COLLECTION).doc(userId).delete();
    log.info({ userId }, 'Oura tokens deleted');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to delete Oura tokens');
  }
}
