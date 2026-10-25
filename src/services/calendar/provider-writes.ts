/**
 * Writes to the calendar a caller has connected (#1749). Google sign-in keeps
 * OAuth tokens; Outlook and Apple keep a provider record. Each write reports
 * whether the provider took it, and never throws, so a reply can be honest.
 *
 * @module services/calendar/provider-writes
 */
import { isCalendarConfigured } from '../identity/google-calendar-oauth.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getProvider } from './providers/provider-registry.js';
import { getProviderConnection } from './unified-calendar-store.js';
import type { CalendarEvent } from './types.js';

const log = createLogger({ module: 'ProviderWrites' });

export type WriteProvider = 'google' | 'outlook' | 'apple';

/** Display names for the replies. */
export const PROVIDER_LABEL: Record<WriteProvider, string> = {
  google: 'Google Calendar',
  outlook: 'Outlook calendar',
  apple: 'Apple calendar',
};

/** The connected calendar writes go to, or null when none is connected. */
export async function connectedWriteProvider(userId: string): Promise<WriteProvider | null> {
  if (await isCalendarConfigured(userId)) return 'google';
  for (const name of ['outlook', 'apple'] as const) {
    if ((await getProviderConnection(userId, name))?.connected) return name;
  }
  return null;
}

/** Create an event on the provider. The external id is set when the provider returns one. */
export async function createOnProvider(
  userId: string,
  provider: WriteProvider,
  event: CalendarEvent
): Promise<{ ok: true; externalId?: string } | { ok: false }> {
  try {
    const adapter = getProvider(provider);
    if (!adapter) return { ok: false };
    const externalId = await adapter.createEvent(userId, event);
    return externalId ? { ok: true, externalId } : { ok: false };
  } catch (error) {
    log.error({ userId, provider, error: String(error) }, 'Provider create failed');
    return { ok: false };
  }
}

/** Update an event the provider already holds. */
export async function updateOnProvider(
  userId: string,
  provider: WriteProvider,
  event: CalendarEvent
): Promise<boolean> {
  try {
    const adapter = getProvider(provider);
    return adapter ? await adapter.updateEvent(userId, event) : false;
  } catch (error) {
    log.error({ userId, provider, error: String(error) }, 'Provider update failed');
    return false;
  }
}

/** Delete an event from the provider by its external id. */
export async function deleteOnProvider(
  userId: string,
  provider: WriteProvider,
  externalId: string,
  calendarId?: string
): Promise<boolean> {
  try {
    const adapter = getProvider(provider);
    return adapter ? await adapter.deleteEvent(userId, externalId, calendarId) : false;
  } catch (error) {
    log.error({ userId, provider, error: String(error) }, 'Provider delete failed');
    return false;
  }
}
