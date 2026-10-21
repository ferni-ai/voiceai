/**
 * Outreach by web push: a note from Ferni reaches the person's browser.
 *
 * The outreach 'push' channel (unified-delivery.ts deliverPush) only knew FCM
 * device tokens (bogle_users.fcmTokens), which nothing writes for a web user,
 * so a web user's "push" always fell back to an in-app note they never saw.
 * Their browser subscriptions live in push_subscriptions, which the backend
 * push service already sends to (push-notifications.ts). With WEB_PUSH_DELIVERY
 * on for the person, deliverPush tries that first; off, nothing changes.
 *
 * @module services/outreach/web-push-delivery
 */
import { getDisplayName } from '../../personas/persona-ids.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { PushNotificationPayload } from '../push-notifications.js';
import { webPushDeliveryOn } from './web-push-flag.js';

const log = createLogger({ module: 'web-push-delivery' });

/** A lock-screen line, not the whole note. */
export const PUSH_BODY_MAX = 140;

export interface OutreachPush {
  text: string;
  personaId: string;
  /** The outreach type, passed to the app as data. */
  kind: string;
  triggerId?: string;
}

export interface WebPushDeps {
  /** WEB_PUSH_DELIVERY for this person. */
  isOn: (userId: string) => Promise<boolean>;
  /** True when at least one of their devices took it. */
  send: (userId: string, payload: PushNotificationPayload) => Promise<boolean>;
}

const defaultDeps: WebPushDeps = {
  isOn: async (userId) => webPushDeliveryOn(userId),
  send: async (userId, payload) =>
    (await import('../push-notifications.js'))
      .getPushNotificationsService()
      .sendNotification(userId, payload),
};

export function pushBody(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PUSH_BODY_MAX ? `${flat.slice(0, PUSH_BODY_MAX - 1).trimEnd()}…` : flat;
}

export function outreachPushPayload(note: OutreachPush): PushNotificationPayload {
  return {
    title: getDisplayName(note.personaId) || 'Ferni',
    body: pushBody(note.text),
    type: 'ferni_checkin',
    personaId: note.personaId,
    data: { kind: note.kind, ...(note.triggerId && { triggerId: note.triggerId }) },
  };
}

/**
 * Send the note to the person's browsers when WEB_PUSH_DELIVERY is on for
 * them. True only when a device took it; false when the flag is off, they
 * have no subscription, or the send failed. Never throws, so the caller can
 * fall back to its other channels.
 */
export async function sendOutreachWebPush(
  userId: string,
  note: OutreachPush,
  deps: WebPushDeps = defaultDeps
): Promise<boolean> {
  try {
    if (!(await deps.isOn(userId))) return false;
    const sent = await deps.send(userId, outreachPushPayload(note));
    log.info({ kind: note.kind, sent }, 'Outreach web push');
    return sent;
  } catch (error) {
    log.warn({ error: String(error), kind: note.kind }, 'Outreach web push failed');
    return false;
  }
}
