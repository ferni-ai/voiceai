/**
 * Voice writes go to the connected calendar when the flag is on (#1749). With
 * no calendar connected, or for an item that only lives on Ferni's list, this
 * returns null and the caller keeps the Ferni path.
 *
 * @module tools/domains/calendar/provider-routing
 */
import { randomUUID } from 'node:crypto';
import { flagOn } from '../../../config/env-flag.js';
import { deleteEvent, getEventById, updateEvent } from '../../../services/calendar/index.js';
import {
  connectedWriteProvider,
  createOnProvider,
  deleteOnProvider,
  PROVIDER_LABEL,
  updateOnProvider,
  type WriteProvider,
} from '../../../services/calendar/provider-writes.js';
import type { CalendarEvent } from '../../../services/calendar/types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { userTimeZone } from '../../../utils/caller-time-zone.js';
import { formatStoredLocalTime, zonedWallTimeToUtc } from '../../../utils/time-zone.js';
import type { ToolContext } from '../../registry/types.js';

const log = createLogger({ module: 'ProviderRouting' });

export const WRITE_TO_PROVIDER_FLAG = 'CALENDAR_WRITE_TO_PROVIDER';

const WRITE_PROVIDERS: readonly string[] = ['google', 'outlook', 'apple'];
const isWriteProvider = (value: string): value is WriteProvider => WRITE_PROVIDERS.includes(value);

interface CreateParams {
  title: string;
  date: string;
  startTime: string;
  durationMinutes?: number;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface ChangeParams {
  eventId: string;
  title?: string;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  description?: string;
  location?: string;
}

/** The start instant of a caller's wall-clock date and time. */
function wallStart(date: string, time: string, zone: string | undefined): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return zonedWallTimeToUtc({ year, month, day, hour, minute }, zone);
}

/** The reply for a write that went to the connected calendar, or null to keep the Ferni path. */
export async function routeWriteToProvider(
  toolId: string,
  userId: string,
  params: unknown,
  ctx: ToolContext
): Promise<string | null> {
  if (!flagOn(WRITE_TO_PROVIDER_FLAG)) return null;
  const provider = await connectedWriteProvider(userId);
  if (!provider) return null;

  if (toolId === 'createCalendarEvent') {
    return createOnConnected(userId, provider, params as CreateParams, ctx);
  }
  if (toolId === 'updateCalendarEvent' || toolId === 'deleteCalendarEvent') {
    return changeOnConnected(toolId, userId, provider, params as ChangeParams, ctx);
  }
  return null;
}

async function createOnConnected(
  userId: string,
  provider: WriteProvider,
  params: CreateParams,
  ctx: ToolContext
): Promise<string> {
  const zone = userTimeZone(ctx);
  const startTime = wallStart(params.date, params.startTime, zone);
  const minutes = params.durationMinutes || 60;
  const now = new Date();
  const event: CalendarEvent = {
    id: randomUUID(),
    userId,
    title: params.title,
    description: params.description,
    location: params.location,
    startTime,
    endTime: new Date(startTime.getTime() + minutes * 60_000),
    isAllDay: false,
    attendees: params.attendees ?? [],
    status: 'confirmed',
    source: provider,
    syncStatus: 'synced',
    reminders: [],
    createdAt: now,
    updatedAt: now,
  };
  const result = await createOnProvider(userId, provider, event);
  const label = PROVIDER_LABEL[provider];
  if (!result.ok) {
    return `I couldn't add "${params.title}" to your ${label}, so it isn't on it. Want me to try again?`;
  }
  return `Added "${params.title}", ${formatStoredLocalTime(startTime, zone)}, to your ${label}.`;
}

async function changeOnConnected(
  toolId: string,
  userId: string,
  provider: WriteProvider,
  params: ChangeParams,
  ctx: ToolContext
): Promise<string | null> {
  const event = await getEventById(userId, params.eventId);
  // An item that only lives on Ferni's list keeps the Ferni path.
  if (!event?.externalId) return null;
  const target = isWriteProvider(event.source) ? event.source : provider;
  const label = PROVIDER_LABEL[target];

  if (toolId === 'deleteCalendarEvent') {
    const removed = await deleteOnProvider(
      userId,
      target,
      event.externalId,
      event.externalCalendarId
    );
    if (!removed) return `I couldn't remove "${event.title}" from your ${label}. It's still there.`;
    await mirrorLocal(userId, 'delete', () => deleteEvent(userId, event.id));
    return `Removed "${event.title}" from your ${label}.`;
  }

  // A move needs both the day and the time; with one alone, ask rather than guess.
  if (Boolean(params.date) !== Boolean(params.startTime)) {
    return 'I need both the day and the time to move that event.';
  }

  const zone = userTimeZone(ctx);
  const durationMinutes =
    params.durationMinutes ?? (event.endTime.getTime() - event.startTime.getTime()) / 60_000;
  const startTime =
    params.date && params.startTime
      ? wallStart(params.date, params.startTime, zone)
      : event.startTime;
  const updated: CalendarEvent = {
    ...event,
    title: params.title ?? event.title,
    description: params.description ?? event.description,
    location: params.location ?? event.location,
    startTime,
    endTime: new Date(startTime.getTime() + durationMinutes * 60_000),
    updatedAt: new Date(),
  };
  const changed = await updateOnProvider(userId, target, updated);
  if (!changed) return `I couldn't update "${event.title}" on your ${label}. It's unchanged there.`;
  await mirrorLocal(userId, 'update', () =>
    updateEvent(userId, event.id, {
      title: updated.title,
      description: updated.description,
      location: updated.location,
      startTime,
      endTime: updated.endTime,
    })
  );
  return `Updated "${updated.title}" on your ${label}.`;
}

/** Keep Ferni's copy in step once the provider took the change. A failure here is logged. */
async function mirrorLocal(
  userId: string,
  action: 'update' | 'delete',
  write: () => Promise<unknown>
): Promise<void> {
  try {
    await write();
  } catch (error) {
    log.error(
      { userId, action, error: String(error) },
      'Ferni copy not updated after provider write'
    );
  }
}
