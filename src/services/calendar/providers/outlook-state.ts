/** OUTLOOK_CONNECT seams: the old behaviour when off; outlook-link.ts (store, Graph) loads only when on. */
import { createHash } from 'node:crypto';
import { flagOn } from '../../../config/env-flag.js';
import type { CalendarEvent } from '../types.js';

export type OutlookState = 'not_connected' | 'needs_reauth' | 'unreachable';

/** Delegated, no admin consent: personal and work accounts. No openid/profile, no mail. */
export const OUTLOOK_SCOPES = 'offline_access User.Read Calendars.ReadWrite';

export const outlookConnectOn = (): boolean => flagOn('OUTLOOK_CONNECT');

const outlookLink = () => import('./outlook-link.js');

/** A Graph read or write that could not run; `state` is what the caller should say. */
export class OutlookUnavailableError extends Error {
  constructor(readonly state: OutlookState) {
    super(`outlook ${state}`);
    this.name = 'OutlookUnavailableError';
  }
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export const pkceChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');

/** Flag on: is Outlook linked (connected or needing reconnecting)? Off: `legacy()`. */
export async function outlookLinkedOr(
  userId: string,
  legacy: () => Promise<boolean>
): Promise<boolean> {
  if (!outlookConnectOn()) return legacy();
  return (await (await outlookLink()).outlookLinkState(userId)) !== 'not_connected' || legacy();
}

/** Delete the sealed grant on any disconnect, flag on or off; throws when it wasn't deleted. */
export async function outlookDisconnect(userId: string): Promise<void> {
  await (await outlookLink()).disconnectOutlook(userId);
}

export async function outlookConnect(
  ...args: Parameters<Awaited<ReturnType<typeof outlookLink>>['connectOutlook']>
): Promise<'saved' | 'no_key' | 'failed'> {
  return (await outlookLink()).connectOutlook(...args);
}

/** Create on Outlook under the flag (throws OutlookUnavailableError); null when off. */
export async function outlookCreate(userId: string, event: CalendarEvent): Promise<string | null> {
  if (!outlookConnectOn()) return null;
  const { startTime: start, endTime: end } = event;
  return (await outlookLink()).createOutlookEvent(userId, { ...event, start, end });
}

/** `local`, sorted; flag on with Outlook linked, plus live Outlook events (throws OutlookUnavailableError). */
export async function withOutlookEvents(
  userId: string,
  start: Date,
  end: Date,
  local: CalendarEvent[]
): Promise<CalendarEvent[]> {
  let events = local;
  if (await outlookLinkedOr(userId, async () => false)) {
    const live = await (await outlookLink()).listOutlookEvents(userId, start, end);
    events = [
      ...local.filter((e) => e.source !== 'outlook'),
      ...live.filter((e) => e.status !== 'cancelled'),
    ];
  }
  return events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
