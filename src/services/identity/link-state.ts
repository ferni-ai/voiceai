/**
 * One connection-status reader over the stores that really hold each caller's
 * linked-account grant (LINK_STATUS_V2).
 *
 * The model's service-availability note used to ask IntegrationHub, which reads
 * users/{uid}/oauth_tokens/{provider}. Google Calendar has never been saved
 * there (its grant lives in bogle_users/{uid}/google_calendar_tokens/data), so a
 * linked caller was told "Google Calendar: NOT CONNECTED, do NOT offer to check".
 * This reads the stored doc itself, never a per-process memory: the shared
 * store's needs_reauth mark (user-oauth-store.ts) can be stale here after a
 * reconnect through another process. A failed read throws; callers say nothing
 * rather than "not connected".
 *
 *   connected      a grant is stored and nothing says it is dead
 *   needs_reauth   the provider revoked it, it expired with no refresh token,
 *                  or it no longer opens: only the person can fix it
 *   not_connected  no grant stored
 *   unconfigured   this server has no client credentials for the provider
 *
 * `scopesOk` (Google Calendar only): false when the grant cannot read and write
 * the calendar (the user unticked it on Google's consent screen).
 *
 * @module services/identity/link-state
 */

import type { DocumentReference } from '@google-cloud/firestore';
import { isGoogleCalendarOAuthConfigured } from '../../config/google-calendar-oauth-env.js';
import { flagOn } from '../../config/env-flag.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { openTokens } from '../../utils/token-at-rest.js';
import { isCalendarConfigured } from './google-calendar-oauth.js';
import { isApiConfigured as isOuraApiConfigured } from './oura-auth.js';
import { googleTokenStore } from './google-calendar-token-store.js';
import { hasCalendarScope, INSUFFICIENT_SCOPE } from './google-link-scope.js';
import type { LinkStatus } from './oauth-link-state.js';

export type LinkProvider = 'google_calendar' | 'oura' | 'whoop' | 'garmin';
export type LinkStateName = LinkStatus['state'] | 'unconfigured';

export interface LinkState {
  state: LinkStateName;
  scopesOk?: boolean;
  needsReauth?: { at: number; errorClass: string };
}

export function isLinkStatusV2(): boolean {
  return flagOn('LINK_STATUS_V2');
}

/** A stored grant's state (pure): one that no longer opens (null), or expired with no refresh token, needs a reconnect. */
export function storedGrantState(
  grant: { refresh_token?: string; expires_at?: number } | null,
  now = Date.now()
): LinkState {
  if (!grant) return { state: 'needs_reauth' };
  const expired = typeof grant.expires_at === 'number' && grant.expires_at <= now;
  return { state: expired && !grant.refresh_token ? 'needs_reauth' : 'connected' };
}

/** Client credentials per provider. WHOOP/Garmin mirror isProviderConfigured (servers/token/oauth/wearables.ts). */
const CONFIGURED: Record<LinkProvider, () => boolean> = {
  google_calendar: isGoogleCalendarOAuthConfigured,
  oura: isOuraApiConfigured,
  whoop: () => !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET),
  garmin: () => !!(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET),
};

/** Where each wearable grant is written (oura-auth.ts; servers/token/oauth/wearables.ts). */
function grantDoc(uid: string, provider: 'oura' | 'whoop' | 'garmin'): DocumentReference {
  const db = getFirestoreDb();
  if (!db) throw new Error('No Firestore');
  if (provider === 'oura') return db.collection('oura_tokens').doc(uid);
  return db
    .collection('bogle_users')
    .doc(uid)
    .collection(`wearable_${provider}_tokens`)
    .doc('data');
}

async function googleCalendarState(uid: string): Promise<LinkState> {
  const status = await googleTokenStore.linkStatus(uid, { fromDoc: true });
  if (status.state !== 'connected') return status;
  const tokens = await googleTokenStore.readFresh(uid);
  if (!tokens) return storedGrantState(null);
  const scopesOk =
    tokens.status !== INSUFFICIENT_SCOPE && (!tokens.scope || hasCalendarScope(tokens.scope));
  return { state: 'connected', scopesOk };
}

/** The caller's link to `provider`, from the stored doc. `uid` must be the verified caller. */
export async function getLinkState(uid: string, provider: LinkProvider): Promise<LinkState> {
  if (!CONFIGURED[provider]()) return { state: 'unconfigured' };
  if (!uid) return { state: 'not_connected' };
  if (provider === 'google_calendar') return googleCalendarState(uid);
  const snap = await grantDoc(uid, provider).get();
  if (!snap.exists) return { state: 'not_connected' };
  const grant = openTokens<{ refresh_token?: string; expires_at?: number }>(
    snap.data(),
    provider === 'oura' ? 'oura_tokens' : `wearable_${provider}_tokens`
  );
  return storedGrantState(grant);
}

/** What a status route adds: the state, and whether the link works (connected, scopes fine). */
export function linkFields(link: LinkState): {
  linked: boolean;
  link_state: LinkStateName;
  scopes_ok?: boolean;
} {
  return {
    linked: link.state === 'connected' && link.scopesOk !== false,
    link_state: link.state,
    ...(link.scopesOk === undefined ? {} : { scopes_ok: link.scopesOk }),
  };
}

/** Is the caller's Google Calendar usable: the real store with LINK_STATUS_V2, else as before. */
export async function isCalendarLinked(uid: string): Promise<boolean> {
  if (!isLinkStatusV2()) return isCalendarConfigured(uid);
  return linkFields(await getLinkState(uid, 'google_calendar')).linked;
}

/** A wearables /status row with the real link state (LINK_STATUS_V2). Apple Health is native. */
export async function withLinkState<T extends { provider: string; linked: boolean }>(
  uid: string,
  row: T
): Promise<T & { link_state?: LinkStateName }> {
  if (!(row.provider in CONFIGURED) || row.provider === 'google_calendar') return row;
  const link = await getLinkState(uid, row.provider as LinkProvider);
  return { ...row, linked: link.state === 'connected', link_state: link.state };
}
