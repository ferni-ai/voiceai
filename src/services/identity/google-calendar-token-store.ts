/**
 * The one store for Google Calendar OAuth tokens.
 *
 * Tokens are encrypted (utils/token-encryption) and kept per user at
 * bogle_users/{uid}/google_calendar_tokens/data, with an in-memory cache. The
 * store itself is the shared one (user-oauth-store.ts); this file binds it to
 * Google's collection and keeps the function names the readers use.
 *
 * There used to be two stores. The connect flow (/auth/google/* in
 * servers/api/routes/google-calendar.ts) wrote here, while every reader
 * (calendar service and providers, webhooks, reminders, busy detection,
 * Gmail, the v1 integrations status) read a second, plaintext root
 * collection `google_calendar_tokens/{uid}` that only the old v1 integrations
 * callback wrote. So a user who connected Google Calendar was invisible to
 * every calendar feature. The root collection is no longer read or written;
 * services/identity/google-calendar-oauth.ts and servers/token/oauth/
 * google-calendar.ts both go through this module.
 *
 * @module services/identity/google-calendar-token-store
 */

import { createUserOAuthStore } from './user-oauth-store.js';

/** Google Calendar OAuth tokens as stored. */
export interface StoredGoogleCalendarTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch ms when access_token expires. */
  expires_at: number;
  scope?: string;
  updated_at?: number;
}

/** bogle_users/{uid}/google_calendar_tokens/data */
export const googleTokenStore = createUserOAuthStore<StoredGoogleCalendarTokens>({
  provider: 'google_calendar',
  collection: 'google_calendar_tokens',
});

export const peekTokens = googleTokenStore.peek;
export const getTokens = googleTokenStore.get;
export const readTokensFresh = googleTokenStore.readFresh;
export const saveTokens = googleTokenStore.save;
export const removeTokens = googleTokenStore.remove;
export const listTokenUsers = googleTokenStore.listUsers;
export const shutdownTokenStore = googleTokenStore.shutdown;
