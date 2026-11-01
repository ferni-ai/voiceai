/**
 * OUTLOOK_CONNECT: the Microsoft grant on the shared sealed store (bogle_users/{uid}/outlook_tokens)
 * and the Graph calls the calendar tools make. A read gives events or throws why it can't
 * (not_connected, needs_reauth, unreachable): never "no events". No token key, no grant stored.
 */
import {
  permanentGrantErrorClass,
  refreshWithRevocation,
  TokenPermanentlyInvalidError,
} from '../../identity/oauth-revocation.js';
import {
  createUserOAuthStore,
  removeStrict,
  type UserOAuthStore,
} from '../../identity/user-oauth-store.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { resolveTokenKey } from '../../../utils/token-encryption.js';
import type { CalendarEvent } from '../types.js';
import { outlookCalendarProvider, type GraphEvent } from './outlook-provider.js';
import { OUTLOOK_SCOPES, OutlookUnavailableError, type OutlookState } from './outlook-state.js';

const log = createLogger({ module: 'OutlookLink' });

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const TIMEOUT_MS = 10_000;
const EXPIRY_BUFFER_MS = 60_000;

type Access = { status: 'ok'; token: string } | { status: OutlookState };

/** expires_at: epoch ms */
type StoredOutlookTokens = { access_token: string; refresh_token: string; expires_at: number };

let store: UserOAuthStore<StoredOutlookTokens> | null = null;
const tokenStore = (): UserOAuthStore<StoredOutlookTokens> =>
  (store ??= createUserOAuthStore({ provider: 'outlook', collection: 'outlook_tokens' }));

async function tokenRequest(params: Record<string, string>): Promise<StoredOutlookTokens> {
  const response = await fetch(`${AUTH_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID || '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      scope: OUTLOOK_SCOPES,
      ...params,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const errorClass = permanentGrantErrorClass(body);
    if ((response.status === 400 || response.status === 401) && errorClass) {
      throw new TokenPermanentlyInvalidError('Microsoft refused the grant', errorClass);
    }
    throw new Error(`Microsoft token endpoint ${response.status}`);
  }
  const data = (await response.json()) as Partial<StoredOutlookTokens> & { expires_in: number };
  return {
    access_token: data.access_token ?? '',
    refresh_token: data.refresh_token || params.refresh_token || '',
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/** Callback: trade the code (with its PKCE verifier), keep the grant; 'no_key' writes nothing. */
export async function connectOutlook(
  userId: string,
  code: string,
  redirectUri: string,
  verifier: string
): Promise<'saved' | 'no_key' | 'failed'> {
  if (resolveTokenKey().source === 'none') {
    log.error({ provider: 'outlook' }, 'No token key: Outlook grant not stored');
    return 'no_key';
  }
  try {
    const grant = { grant_type: 'authorization_code', code, redirect_uri: redirectUri };
    const tokens = await tokenRequest({ ...grant, code_verifier: verifier });
    await tokenStore().save(userId, tokens);
    return (await tokenStore().readFresh(userId)) ? 'saved' : 'failed';
  } catch (error) {
    log.error({ provider: 'outlook', error: (error as Error).message }, 'Outlook connect failed');
    return 'failed';
  }
}

/**
 * Link state from the doc (fresh, strict). A failed read, no database included, is
 * 'link_unknown': not linked, not unlinked, and never "Outlook couldn't be reached".
 */
export async function outlookLinkState(
  userId: string
): Promise<'connected' | 'needs_reauth' | 'not_connected' | 'link_unknown'> {
  return tokenStore()
    .linkStatus(userId, { fromDoc: true })
    .then(
      (s) => s.state,
      () => 'link_unknown' as const
    );
}

/** Delete the sealed grant; throws when the delete failed, so a disconnect is never a false success. */
export async function disconnectOutlook(userId: string): Promise<void> {
  if (!(await removeStrict(tokenStore(), userId)).ok) throw new Error('Outlook grant not deleted');
}

async function getAccess(userId: string): Promise<Access> {
  const s = tokenStore();
  let state: string;
  try {
    state = (await s.linkStatus(userId, { fromDoc: true })).state;
  } catch {
    return { status: 'unreachable' };
  }
  if (state !== 'connected') return { status: state as OutlookState };
  if (s.isRefreshBlocked(userId)) return { status: 'needs_reauth' };
  const tokens = await s.get(userId);
  if (!tokens) return { status: 'unreachable' }; // a link doc whose envelope did not open
  if (Date.now() < tokens.expires_at - EXPIRY_BUFFER_MS)
    return { status: 'ok', token: tokens.access_token };
  const used = tokens.refresh_token;
  const fresh = await refreshWithRevocation(s, userId, used, async () => {
    const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: used });
    await s.save(userId, next);
    return next;
  });
  if (fresh) return { status: 'ok', token: fresh.access_token };
  return { status: s.isRefreshBlocked(userId) ? 'needs_reauth' : 'unreachable' };
}

async function graph<T>(userId: string, method: string, path: string, body?: unknown): Promise<T> {
  const access = await getAccess(userId);
  if (access.status !== 'ok') throw new OutlookUnavailableError(access.status);
  let response: Response;
  try {
    response = await fetch(`${GRAPH_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${access.token}`,
        'Content-Type': 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new OutlookUnavailableError('unreachable');
  }
  if (!response.ok) {
    log.warn({ provider: 'outlook', status: response.status }, 'Graph call failed');
    const denied = response.status === 401 || response.status === 403;
    throw new OutlookUnavailableError(denied ? 'needs_reauth' : 'unreachable');
  }
  return (await response.json()) as T;
}

/** The person's Outlook events in [start, end). Throws OutlookUnavailableError, never returns a fake empty day. */
export async function listOutlookEvents(
  userId: string,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const range = `startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=100`;
  const result = await graph<{ value?: GraphEvent[] }>(userId, 'GET', `/me/calendarView?${range}`);
  const events = (result.value ?? []).map((ge) =>
    outlookCalendarProvider.graphToCalendarEvent(ge, userId)
  );
  log.info({ provider: 'outlook', count: events.length }, 'Outlook events read');
  return events;
}

/** Create on the default Outlook calendar, in UTC; no attendees (Graph would email them invites). */
export async function createOutlookEvent(
  userId: string,
  event: { title: string; description?: string; location?: string; start: Date; end: Date }
): Promise<string> {
  const utc = (d: Date) => ({ dateTime: d.toISOString().replace('Z', ''), timeZone: 'UTC' });
  const created = await graph<GraphEvent>(userId, 'POST', '/me/events', {
    subject: event.title,
    body: event.description ? { contentType: 'text', content: event.description } : undefined,
    location: event.location ? { displayName: event.location } : undefined,
    start: utc(event.start),
    end: utc(event.end),
  });
  if (!created.id) throw new OutlookUnavailableError('unreachable');
  log.info({ provider: 'outlook' }, 'Outlook event created');
  return created.id;
}
